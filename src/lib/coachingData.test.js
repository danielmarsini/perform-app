// Test unitari per le funzioni pure di coachingData.js — la logica di
// business più critica dell'app (XP/livelli, volume muscolare, punteggio
// nutrizione, parsing serie) non aveva NESSUNA copertura di test finora.
// Copre soprattutto le funzioni pure (nessuna chiamata a Supabase). Le
// funzioni di aderenza (compute*Compliance) sono invece verificate con un
// finto client supabase in fondo al file: qui il test che conta davvero è
// che la versione "batch" (N clienti, poche query) e quella a singolo
// cliente producano ESATTAMENTE lo stesso risultato — sono la stessa
// formula, non due copie che rischiano di disallinearsi.
import { describe, it, expect } from "vitest";
import {
  xpToLevelInfo, levelMinXp, dayNutritionScore, parseRepsTarget,
  computeVolume, computeVolumeContributions, resolveMuscleTarget, MUSCLES, MUSCLE_TARGETS,
  DEFAULT_EXERCISE_LIB, isRealCoachingPlan, REAL_COACHING_PLANS_DB,
  computeRecoveryCompliance, computeBatchRecoveryCompliance,
  computeNutritionCompliance, computeBatchNutritionCompliance,
  computeTrainingCompliance, computeBatchTrainingCompliance,
  fetchWeekExerciseHistories, weekExerciseHistoryKey,
  computeCrewWeeklyActivity, computeCrewStreak,
  fetchFoodUsageStats, fetchCoachChatInbox, fetchClientRoster,
  countUnreadChatMessages, streakXpMultiplier,
  freezeBonusForLevel, fetchStreakFreezeStatus, LEVEL_REWARDS,
  computeProgramExpiryAlerts, fetchLastAssignedWorkoutDates,
} from "./coachingData.js";

describe("levelMinXp", () => {
  it("livello 0 richiede 0 XP", () => {
    expect(levelMinXp(0)).toBe(0);
  });
  it("cresce esponenzialmente (raddoppia+ ogni livello)", () => {
    const l1 = levelMinXp(1);
    const l2 = levelMinXp(2);
    const l3 = levelMinXp(3);
    expect(l1).toBeGreaterThan(0);
    expect(l2).toBeGreaterThan(l1);
    expect(l3 - l2).toBeGreaterThan(l2 - l1); // divario crescente, non lineare
  });
});

describe("xpToLevelInfo", () => {
  it("0 XP = livello 0", () => {
    const info = xpToLevelInfo(0);
    expect(info.level).toBe(0);
    expect(info.xp).toBe(0);
    expect(info.xpInLevel).toBe(0);
  });
  it("XP negativo o non numerico non manda mai sotto zero", () => {
    expect(xpToLevelInfo(-500).xp).toBe(0);
    expect(xpToLevelInfo(null).xp).toBe(0);
    expect(xpToLevelInfo(undefined).xp).toBe(0);
    expect(xpToLevelInfo("non un numero").xp).toBe(0);
  });
  it("esattamente la soglia minima di un livello assegna quel livello, non il precedente", () => {
    const threshold = levelMinXp(3);
    expect(xpToLevelInfo(threshold).level).toBe(3);
    expect(xpToLevelInfo(threshold - 1).level).toBe(2);
  });
  it("xpInLevel + xpNeeded == xpForNextLevel (nessuna perdita di XP nell'arrotondamento)", () => {
    [0, 1, 999, 50000, 1_000_000].forEach((xp) => {
      const info = xpToLevelInfo(xp);
      expect(info.xpInLevel + info.xpNeeded).toBe(info.xpForNextLevel);
    });
  });
  it("il titolo cambia in modo monotono crescente col livello (mai lo stesso titolo esatto due tier dopo)", () => {
    const titleAt = (xp) => xpToLevelInfo(xp).title;
    const early = titleAt(0);
    const later = titleAt(levelMinXp(20));
    expect(early).not.toBe(later);
  });
});

describe("streakXpMultiplier", () => {
  it("streak corta (0-6 giorni) => nessun moltiplicatore", () => {
    expect(streakXpMultiplier(0)).toBe(1);
    expect(streakXpMultiplier(6)).toBe(1);
  });
  it("cresce in modo monotono non decrescente con più giorni di streak", () => {
    const days = [0, 7, 14, 30, 60, 90, 200];
    const mults = days.map((d) => streakXpMultiplier(d));
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1]);
    }
  });
  it("non supera mai il tetto del +25%", () => {
    expect(streakXpMultiplier(90)).toBe(1.25);
    expect(streakXpMultiplier(9999)).toBe(1.25);
  });
  it("input negativo o non numerico => trattato come 0 (nessun moltiplicatore)", () => {
    expect(streakXpMultiplier(-5)).toBe(1);
    expect(streakXpMultiplier(null)).toBe(1);
    expect(streakXpMultiplier(undefined)).toBe(1);
  });
});

describe("dayNutritionScore", () => {
  it("nessun target attivo => null (non giudicabile), non zero", () => {
    expect(dayNutritionScore({ kcal: 2000, p: 150, c: 200, f: 60 }, null)).toBeNull();
  });
  it("centrato esattamente sul target => punteggio 100", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    expect(dayNutritionScore({ ...target }, target)).toBe(100);
  });
  it("dentro la tolleranza del 5% sulle kcal => punteggio pieno (nessuno lo rispetta al millimetro)", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const under = dayNutritionScore({ kcal: 1900, p: 150, c: 200, f: 60 }, target); // -5%
    const over = dayNutritionScore({ kcal: 2100, p: 150, c: 200, f: 60 }, target); // +5%
    expect(under).toBe(100);
    expect(over).toBe(100);
  });
  it("dentro la tolleranza del 10% sui singoli macro => punteggio pieno", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const under = dayNutritionScore({ kcal: 2000, p: 135, c: 180, f: 54 }, target); // macro -10%
    const over = dayNutritionScore({ kcal: 2000, p: 165, c: 220, f: 66 }, target); // macro +10%
    expect(under).toBe(100);
    expect(over).toBe(100);
  });
  it("oltre la tolleranza del 5% sulle kcal penalizza anche se i macro sono centrati", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const score = dayNutritionScore({ kcal: 2200, p: 150, c: 200, f: 60 }, target); // +10% kcal
    expect(score).toBeLessThan(100);
  });
  it("scostamento sotto e sopra target OLTRE la tolleranza penalizzano allo stesso modo (simmetrico)", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const under = dayNutritionScore({ kcal: 1400, p: 150, c: 200, f: 60 }, target); // -30%
    const over = dayNutritionScore({ kcal: 2600, p: 150, c: 200, f: 60 }, target); // +30%
    expect(under).toBe(over);
    expect(under).toBeLessThan(100);
  });
  it("giornata non registrata (tutti zero) contro un target reale => punteggio basso, non 100", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const score = dayNutritionScore({ kcal: 0, p: 0, c: 0, f: 0 }, target);
    expect(score).toBe(0);
  });
  it("il punteggio resta sempre tra 0 e 100 anche con scostamenti enormi", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const score = dayNutritionScore({ kcal: 20000, p: 1500, c: 2000, f: 600 }, target);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("parseRepsTarget", () => {
  it("un valore fisso si ripete identico per ogni serie", () => {
    expect(parseRepsTarget("8-10", 3)).toEqual(["8-10", "8-10", "8-10"]);
  });
  it("valori separati da '/' si assegnano una serie ciascuno", () => {
    expect(parseRepsTarget("8/12", 2)).toEqual(["8", "12"]);
  });
  it("più parti delle serie disponibili: le parti in eccesso vengono ignorate", () => {
    expect(parseRepsTarget("8/10/12", 2)).toEqual(["8", "10"]);
  });
  it("meno parti delle serie disponibili: l'ultima parte si ripete per riempire", () => {
    expect(parseRepsTarget("8/12", 4)).toEqual(["8", "12", "12", "12"]);
  });
  it("numSets 0 o input vuoto => array vuoto, mai un errore", () => {
    expect(parseRepsTarget("8-10", 0)).toEqual([]);
    expect(parseRepsTarget("", 3)).toEqual([]);
    expect(parseRepsTarget(null, 3)).toEqual([]);
  });
});

describe("resolveMuscleTarget", () => {
  it("esercizio noto nella libreria di default risolve al nome DB esteso", () => {
    // "Panca piana bilanciere" -> direct "Petto" (nome breve) -> "Pettorali" (nome DB)
    expect(resolveMuscleTarget("Panca piana bilanciere", DEFAULT_EXERCISE_LIB)).toBe("Pettorali");
  });
  it("esercizio sconosciuto => null, mai un crash", () => {
    expect(resolveMuscleTarget("Esercizio mai visto prima", DEFAULT_EXERCISE_LIB)).toBeNull();
  });
  it("senza libreria esplicita usa comunque DEFAULT_EXERCISE_LIB", () => {
    expect(resolveMuscleTarget("Squat bilanciere")).toBe("Quadricipiti");
  });
});

describe("computeVolume", () => {
  it("giorno di riposo (null) non contribuisce al volume", () => {
    const vol = computeVolume([null], DEFAULT_EXERCISE_LIB);
    MUSCLES.forEach((m) => {
      expect(vol[m].direct).toBe(0);
      expect(vol[m].indirect).toBe(0);
    });
  });
  it("un esercizio di libreria conta le serie al 100% sul muscolo diretto e al 50% sui sinergici", () => {
    const day = [{ label: "Push", exercises: [{ name: "Panca piana bilanciere", sets: 4 }] }];
    const vol = computeVolume(day, DEFAULT_EXERCISE_LIB);
    // "Panca piana bilanciere": direct Petto, indirect Tricipiti + Deltoide Ant
    expect(vol["Petto"].direct).toBe(4);
    expect(vol["Tricipiti"].indirect).toBe(2); // 4 * 0.5
    expect(vol["Deltoide Ant"].indirect).toBe(2);
  });
  it("un esercizio con DUE muscoli diretti conta entrambi al 100% per la stessa serie", () => {
    const lib = { "Dip alle parallele (petto)": { direct: ["Petto", "Tricipiti"], indirect: ["Deltoide Ant"] } };
    const day = [{ label: "Push", exercises: [{ name: "Dip alle parallele (petto)", sets: 3 }] }];
    const vol = computeVolume(day, lib);
    expect(vol["Petto"].direct).toBe(3);
    expect(vol["Tricipiti"].direct).toBe(3);
    expect(vol["Deltoide Ant"].indirect).toBe(1.5);
  });
  it("esercizio custom non ancora in libreria usa muscleTarget/synergists manuali (nome DB esteso)", () => {
    const day = [{ label: "Push", exercises: [{ name: "Esercizio mai visto", sets: 3, muscleTarget: "Pettorali", synergists: ["Tricipiti"] }] }];
    const vol = computeVolume(day, DEFAULT_EXERCISE_LIB);
    expect(vol["Petto"].direct).toBe(3); // "Pettorali" (DB) mappato a "Petto" (chart)
    expect(vol["Tricipiti"].indirect).toBe(1.5);
  });
  it("esercizio custom senza alcun target assegnato viene ignorato, non fa crashare il grafico", () => {
    const day = [{ label: "Push", exercises: [{ name: "Esercizio senza muscoli", sets: 3 }] }];
    expect(() => computeVolume(day, DEFAULT_EXERCISE_LIB)).not.toThrow();
    const vol = computeVolume(day, DEFAULT_EXERCISE_LIB);
    MUSCLES.forEach((m) => expect(vol[m].direct).toBe(0));
  });
  it("nome muscolo non riconosciuto viene ignorato invece di far crashare il grafico", () => {
    const lib = { "Esercizio strano": { direct: ["Muscolo Inesistente"], indirect: [] } };
    const day = [{ label: "X", exercises: [{ name: "Esercizio strano", sets: 3 }] }];
    expect(() => computeVolume(day, lib)).not.toThrow();
  });
  it("dayList vuoto o assente ritorna volume zero per tutti i muscoli, non un errore", () => {
    expect(() => computeVolume([], DEFAULT_EXERCISE_LIB)).not.toThrow();
    expect(() => computeVolume(undefined, DEFAULT_EXERCISE_LIB)).not.toThrow();
  });
});

describe("computeVolumeContributions", () => {
  it("elenca solo gli esercizi che contribuiscono al distretto richiesto", () => {
    const day = [{ label: "Push", exercises: [
      { name: "Panca piana bilanciere", sets: 4 },
      { name: "Squat bilanciere", sets: 3 },
    ] }];
    const contributions = computeVolumeContributions(day, DEFAULT_EXERCISE_LIB, "Petto");
    expect(contributions).toHaveLength(1);
    expect(contributions[0].exerciseName).toBe("Panca piana bilanciere");
    expect(contributions[0].directSets).toBe(4);
    expect(contributions[0].indirectSets).toBe(0);
  });
  it("include il contributo indiretto (50%) per un esercizio sinergico sullo stesso distretto", () => {
    const day = [{ label: "Push", exercises: [{ name: "Panca piana bilanciere", sets: 4 }] }];
    const contributions = computeVolumeContributions(day, DEFAULT_EXERCISE_LIB, "Tricipiti");
    expect(contributions).toHaveLength(1);
    expect(contributions[0].directSets).toBe(0);
    expect(contributions[0].indirectSets).toBe(2); // 4 * 0.5
  });
  it("somma le serie dello stesso esercizio su più giorni della settimana", () => {
    const day = [
      { label: "Push A", exercises: [{ name: "Panca piana bilanciere", sets: 4 }] },
      { label: "Push B", exercises: [{ name: "Panca piana bilanciere", sets: 3 }] },
    ];
    const contributions = computeVolumeContributions(day, DEFAULT_EXERCISE_LIB, "Petto");
    expect(contributions).toHaveLength(1);
    expect(contributions[0].directSets).toBe(7);
  });
  it("distretto senza alcun contributo ritorna un elenco vuoto, non un errore", () => {
    const day = [{ label: "Push", exercises: [{ name: "Panca piana bilanciere", sets: 4 }] }];
    expect(() => computeVolumeContributions(day, DEFAULT_EXERCISE_LIB, "Polpacci")).not.toThrow();
    expect(computeVolumeContributions(day, DEFAULT_EXERCISE_LIB, "Polpacci")).toEqual([]);
  });
  it("ordina per contributo totale decrescente (diretto + metà indiretto)", () => {
    const lib = {
      "Esercizio A": { direct: ["Petto"], indirect: [] },
      "Esercizio B": { direct: [], indirect: ["Petto"] },
    };
    const day = [{ label: "Push", exercises: [
      { name: "Esercizio B", sets: 10 }, // 5 equivalenti (10 * 0.5)
      { name: "Esercizio A", sets: 2 },  // 2 diretti
    ] }];
    const contributions = computeVolumeContributions(day, lib, "Petto");
    expect(contributions.map((c) => c.exerciseName)).toEqual(["Esercizio B", "Esercizio A"]);
  });
});

describe("MUSCLES / MUSCLE_TARGETS", () => {
  it("le due liste hanno lo stesso numero di gruppi muscolari (nessuno perso nella doppia nomenclatura)", () => {
    expect(MUSCLES.length).toBe(MUSCLE_TARGETS.length);
  });
});

describe("isRealCoachingPlan", () => {
  it("riconosce i 3 piani a coaching reale sul valore grezzo del DB", () => {
    expect(isRealCoachingPlan("scheda_personalizzata")).toBe(true);
    expect(isRealCoachingPlan("training")).toBe(true);
    expect(isRealCoachingPlan("full")).toBe(true);
  });
  it("riconosce anche il valore rimappato lato UI ('full_coaching' invece di 'full')", () => {
    expect(isRealCoachingPlan("full_coaching")).toBe(true);
  });
  it("Free/Premium non sono coaching reale", () => {
    expect(isRealCoachingPlan("free")).toBe(false);
    expect(isRealCoachingPlan("performance_pack")).toBe(false);
  });
  it("null/undefined non lanciano e ritornano false", () => {
    expect(isRealCoachingPlan(null)).toBe(false);
    expect(isRealCoachingPlan(undefined)).toBe(false);
  });
  it("REAL_COACHING_PLANS_DB contiene solo i 3 valori grezzi (mai 'full_coaching')", () => {
    expect(REAL_COACHING_PLANS_DB.has("full_coaching")).toBe(false);
    expect(REAL_COACHING_PLANS_DB.has("full")).toBe(true);
    expect(REAL_COACHING_PLANS_DB.size).toBe(3);
  });
});

/* ---------------------------------------------------------------------------
   FINTO CLIENT SUPABASE — solo per compute*Compliance / computeBatch*Compliance.
   Supporta esattamente le chiamate usate da queste funzioni: select/eq/in/
   gte/lte/lt/order/limit/maybeSingle, più il "thenable" per l'await diretto
   sul builder. I filtri leggono anche percorsi puntati (es.
   "workout_logs.user_id") per il join finto usato da workout_sets.
   ------------------------------------------------------------------------- */
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function makeMockSupabase(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const builder = {
        select() { return builder; },
        eq(col, val) { rows = rows.filter((r) => getPath(r, col) === val); return builder; },
        in(col, vals) { rows = rows.filter((r) => vals.includes(getPath(r, col))); return builder; },
        gte(col, val) { rows = rows.filter((r) => getPath(r, col) >= val); return builder; },
        gt(col, val) { rows = rows.filter((r) => getPath(r, col) > val); return builder; },
        lte(col, val) { rows = rows.filter((r) => getPath(r, col) <= val); return builder; },
        lt(col, val) { rows = rows.filter((r) => getPath(r, col) < val); return builder; },
        neq(col, val) { rows = rows.filter((r) => getPath(r, col) !== val); return builder; },
        is(col, val) { rows = rows.filter((r) => getPath(r, col) === val); return builder; },
        not(col, op, val) {
          if (op === "is" && val === null) rows = rows.filter((r) => getPath(r, col) != null);
          return builder;
        },
        order(col, opts) {
          const asc = !opts || opts.ascending !== false;
          rows = [...rows].sort((a, b) => {
            const av = getPath(a, col), bv = getPath(b, col);
            if (av === bv) return 0;
            return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
          });
          return builder;
        },
        limit(n) { rows = rows.slice(0, n); return builder; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

// Date relative a "oggi" (esecuzione del test), non hardcoded: le funzioni
// di aderenza ragionano sempre su "ieri" e sui 6 giorni precedenti.
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("computeBatchRecoveryCompliance vs computeRecoveryCompliance", () => {
  it("produce esattamente lo stesso risultato della versione singolo-cliente per ogni utente", async () => {
    const tables = {
      profiles: [
        { id: "u1", created_at: "2020-01-01T00:00:00Z" },
        { id: "u2", created_at: "2020-01-01T00:00:00Z" },
      ],
      daily_metrics: [
        { user_id: "u1", date: daysAgoISO(1), sleep_hours: 7.5, steps: 9000 },
        { user_id: "u1", date: daysAgoISO(3), sleep_hours: 5, steps: 3000 },
        { user_id: "u2", date: daysAgoISO(2), sleep_hours: 8, steps: 10000 },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const [single1, single2] = await Promise.all([
      computeRecoveryCompliance(supabase, "u1"),
      computeRecoveryCompliance(supabase, "u2"),
    ]);
    const batch = await computeBatchRecoveryCompliance(supabase, ["u1", "u2"]);
    expect(batch.get("u1")).toEqual(single1);
    expect(batch.get("u2")).toEqual(single2);
  });
  it("un cliente senza nessun dato tracciato resta neutro sia singolo sia batch", async () => {
    const tables = { profiles: [{ id: "u3", created_at: "2020-01-01T00:00:00Z" }], daily_metrics: [] };
    const supabase = makeMockSupabase(tables);
    const single = await computeRecoveryCompliance(supabase, "u3");
    const batch = await computeBatchRecoveryCompliance(supabase, ["u3"]);
    expect(single.status).toBe("neutral");
    expect(batch.get("u3")).toEqual(single);
  });
});

describe("computeBatchNutritionCompliance vs computeNutritionCompliance", () => {
  it("produce esattamente lo stesso risultato della versione singolo-cliente per ogni utente", async () => {
    const tables = {
      profiles: [
        { id: "u1", created_at: "2020-01-01T00:00:00Z" },
        { id: "u2", created_at: "2020-01-01T00:00:00Z" },
      ],
      nutrition_logs: [
        { user_id: "u1", date: daysAgoISO(1), kcal: 2000, protein: 150, carbs: 200, fat: 60 },
        { user_id: "u2", date: daysAgoISO(1), kcal: 1500, protein: 100, carbs: 150, fat: 40 },
      ],
      nutrition_targets: [
        { user_id: "u1", day_type: "off", kcal: 2000, protein: 150, carbs: 200, fat: 60, effective_from: "2020-01-01" },
        { user_id: "u2", day_type: "off", kcal: 2000, protein: 150, carbs: 200, fat: 60, effective_from: "2020-01-01" },
      ],
      workout_logs: [],
    };
    const supabase = makeMockSupabase(tables);
    const [single1, single2] = await Promise.all([
      computeNutritionCompliance(supabase, "u1"),
      computeNutritionCompliance(supabase, "u2"),
    ]);
    const batch = await computeBatchNutritionCompliance(supabase, ["u1", "u2"]);
    expect(batch.get("u1")).toEqual(single1);
    expect(batch.get("u2")).toEqual(single2);
    // u1 ha centrato il target nell'unico giorno registrato, u2 no: nella
    // finestra di 7 giorni contano anche i giorni senza alcuna registrazione
    // (0 contro un target attivo, punteggio basso) — qui basta verificare
    // che il giorno migliore di u1 si rifletta in un punteggio più alto.
    expect(single1.pct).toBeGreaterThan(single2.pct);
  });
});

describe("computeBatchTrainingCompliance vs computeTrainingCompliance", () => {
  it("produce esattamente lo stesso risultato della versione singolo-cliente per ogni utente", async () => {
    const tables = {
      workout_logs: [
        { user_id: "u1", date: daysAgoISO(1), sets_count: 3 },
        { user_id: "u1", date: daysAgoISO(3), sets_count: 3 },
        { user_id: "u2", date: daysAgoISO(2), sets_count: 4 },
      ],
      workout_sets: [
        { load_kg: 80, workout_logs: { date: daysAgoISO(1), exercise_name: "Panca piana bilanciere", user_id: "u1" } },
        { load_kg: 80, workout_logs: { date: daysAgoISO(1), exercise_name: "Panca piana bilanciere", user_id: "u1" } },
        { load_kg: 60, workout_logs: { date: daysAgoISO(2), exercise_name: "Squat bilanciere", user_id: "u2" } },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const [single1, single2] = await Promise.all([
      computeTrainingCompliance(supabase, "u1"),
      computeTrainingCompliance(supabase, "u2"),
    ]);
    const batch = await computeBatchTrainingCompliance(supabase, ["u1", "u2"]);
    expect(batch.get("u1")).toEqual(single1);
    expect(batch.get("u2")).toEqual(single2);
  });
  it("un cliente senza nessuna sessione assegnata resta neutro sia singolo sia batch", async () => {
    const tables = { workout_logs: [], workout_sets: [] };
    const supabase = makeMockSupabase(tables);
    const single = await computeTrainingCompliance(supabase, "u9");
    const batch = await computeBatchTrainingCompliance(supabase, ["u9"]);
    expect(single.status).toBe("neutral");
    expect(batch.get("u9")).toEqual(single);
  });
});

// Redesign richiesto dall'uso reale: chi va in palestra a tutte le sedute
// programmate e registra tutto (carichi, ripetizioni, sensazioni) si è
// allenato, punto — anche se il carico non è salito quella settimana. Prima
// una progressione negativa applicava una penalità (×0.8) anche a un
// completamento perfetto, facendo scendere il cerchio ingiustamente.
// Blocco "current" di 7 sedute (posizioni 1-7) tutte completate al 100%
// sullo stesso esercizio, più UNA seduta "prior" (posizione 8) con un carico
// diverso per far scattare la progressione — così completionPct resta
// sempre 100 ed è isolata solo la progressione.
function fullyLoggedTrainingWeek(userId, priorLoadKg) {
  const workout_logs = [];
  const workout_sets = [];
  for (let i = 1; i <= 7; i++) {
    workout_logs.push({ user_id: userId, date: daysAgoISO(i), sets_count: 3 });
    for (let s = 0; s < 3; s++) {
      workout_sets.push({ load_kg: 50, workout_logs: { date: daysAgoISO(i), exercise_name: "Squat bilanciere", user_id: userId } });
    }
  }
  workout_logs.push({ user_id: userId, date: daysAgoISO(8), sets_count: 3 });
  workout_sets.push({ load_kg: priorLoadKg, workout_logs: { date: daysAgoISO(8), exercise_name: "Squat bilanciere", user_id: userId } });
  return { workout_logs, workout_sets };
}
describe("Allenamento: costanza premiata, nessuna penalità per mancata progressione", () => {
  it("completamento pieno con carico in calo non subisce più alcuna penalità", async () => {
    const tables = fullyLoggedTrainingWeek("uP", 80); // prior più pesante del blocco corrente (50kg) => progressione negativa
    const supabase = makeMockSupabase(tables);
    const result = await computeTrainingCompliance(supabase, "uP");
    expect(result.completionPct).toBe(100);
    expect(result.progression).toBe("negative");
    expect(result.pct).toBe(100); // prima sarebbe stato 80 (×0.8) — ora nessuna penalità
  });
  it("progressione positiva resta un bonus (fino a +10, mai oltre 100)", async () => {
    const tables = fullyLoggedTrainingWeek("uQ", 30); // prior più leggero del blocco corrente (50kg) => progressione positiva
    const supabase = makeMockSupabase(tables);
    const result = await computeTrainingCompliance(supabase, "uQ");
    expect(result.completionPct).toBe(100);
    expect(result.progression).toBe("positive");
    expect(result.pct).toBe(100); // completionPct 100 + bonus, cappato a 100
  });
});

// Reattività richiesta: i 3 cerchi si devono muovere SUBITO quando si
// registra qualcosa, non aspettare la mezzanotte — ma una giornata ancora
// in corso e completamente vuota non deve ancora "fallire".
describe("Reattività oggi: il cerchio si muove appena si registra qualcosa", () => {
  it("Allenamento: oggi entra nella finestra solo dopo la prima serie registrata", async () => {
    const tables = {
      workout_logs: [{ user_id: "uT", date: daysAgoISO(0), sets_count: 3 }],
      workout_sets: [],
    };
    const supabase = makeMockSupabase(tables);
    const beforeLog = await computeTrainingCompliance(supabase, "uT");
    expect(beforeLog.status).toBe("neutral");

    tables.workout_sets.push(
      { load_kg: 50, workout_logs: { date: daysAgoISO(0), exercise_name: "Squat bilanciere", user_id: "uT" } },
      { load_kg: 50, workout_logs: { date: daysAgoISO(0), exercise_name: "Squat bilanciere", user_id: "uT" } },
      { load_kg: 50, workout_logs: { date: daysAgoISO(0), exercise_name: "Squat bilanciere", user_id: "uT" } },
    );
    const afterLog = await computeTrainingCompliance(supabase, "uT");
    expect(afterLog.status).toBe("ok");
    expect(afterLog.pct).toBe(100);
  });
  it("Alimentazione: oggi entra nella finestra solo dopo il primo pasto registrato", async () => {
    const tables = {
      profiles: [{ id: "uN", created_at: new Date().toISOString() }],
      nutrition_logs: [],
      nutrition_targets: [
        { user_id: "uN", day_type: "off", kcal: 2000, protein: 150, carbs: 200, fat: 60, effective_from: "2020-01-01" },
      ],
      workout_logs: [],
    };
    const supabase = makeMockSupabase(tables);
    const beforeLog = await computeNutritionCompliance(supabase, "uN");
    expect(beforeLog.status).toBe("neutral");

    tables.nutrition_logs.push({ user_id: "uN", date: daysAgoISO(0), kcal: 2000, protein: 150, carbs: 200, fat: 60 });
    const afterLog = await computeNutritionCompliance(supabase, "uN");
    expect(afterLog.status).toBe("ok");
    expect(afterLog.pct).toBe(100);
    expect(afterLog.daysScored).toBe(1);
  });
  it("Recupero: oggi entra nella finestra solo dopo il primo dato di sonno/passi", async () => {
    const tables = {
      profiles: [{ id: "uR", created_at: new Date().toISOString() }],
      daily_metrics: [],
    };
    const supabase = makeMockSupabase(tables);
    const beforeLog = await computeRecoveryCompliance(supabase, "uR");
    expect(beforeLog.status).toBe("neutral");

    tables.daily_metrics.push({ user_id: "uR", date: daysAgoISO(0), sleep_hours: 7, steps: 8000 });
    const afterLog = await computeRecoveryCompliance(supabase, "uR");
    expect(afterLog.status).toBe("ok");
    expect(afterLog.windowDays).toBe(1);
  });
});

describe("fetchWeekExerciseHistories", () => {
  it("costruisce storico (top set) e set-history da un'unica coppia di query, per più esercizi insieme", async () => {
    // daysAgoISO(2) e daysAgoISO(9) differiscono di 7 giorni: stesso giorno
    // della settimana. La riga "di questa settimana" usa daysAgoISO(-5),
    // anch'esso a 7 giorni esatti da entrambe — stesso giorno della
    // settimana di entrambe le sessioni passate di panca.
    const panchaWeekday = daysAgoISO(-5);
    const squatWeekday = daysAgoISO(-3); // 7 giorni esatti da daysAgoISO(4)
    const thisWeekRows = [
      { id: "log_today_panca", exercise_name: "Panca piana bilanciere", date: panchaWeekday },
      { id: "log_today_squat", exercise_name: "Squat bilanciere", date: squatWeekday },
    ];
    const tables = {
      workout_logs: [
        { id: "log_past_panca_1", date: daysAgoISO(2), exercise_name: "Panca piana bilanciere", user_id: "u1", status: "done" },
        { id: "log_past_panca_2", date: daysAgoISO(9), exercise_name: "Panca piana bilanciere", user_id: "u1", status: "done" },
        { id: "log_past_squat_1", date: daysAgoISO(4), exercise_name: "Squat bilanciere", user_id: "u1", status: "done" },
      ],
      workout_sets: [
        { workout_log_id: "log_past_panca_1", set_number: 1, load_kg: 80, reps_completed: 8, rir: 2 },
        { workout_log_id: "log_past_panca_1", set_number: 2, load_kg: 82.5, reps_completed: 6, rir: 1 },
        { workout_log_id: "log_past_panca_2", set_number: 1, load_kg: 77.5, reps_completed: 8, rir: 2 },
        { workout_log_id: "log_past_squat_1", set_number: 1, load_kg: 100, reps_completed: 5, rir: 2 },
        // serie già registrate OGGI per la riga di questa settimana (usate per precompilare i campi kg/reps)
        { workout_log_id: "log_today_panca", set_number: 1, load_kg: 85, reps_completed: 5, rir: 1 },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const { historyByExerciseName, setHistoryByExerciseName, loggedSetsByLogId } =
      await fetchWeekExerciseHistories(supabase, "u1", thisWeekRows);

    // history: top set per sessione, più vecchia prima (2 sessioni passate di panca, stesso giorno della settimana)
    const panchaHistory = historyByExerciseName.get(weekExerciseHistoryKey("Panca piana bilanciere", panchaWeekday));
    expect(panchaHistory).toEqual([
      { kg: 77.5, reps: 8 },  // sessione più vecchia (9 giorni fa)
      { kg: 82.5, reps: 6 },  // sessione più recente (2 giorni fa), top set tra le 2 serie
    ]);
    expect(historyByExerciseName.get(weekExerciseHistoryKey("Squat bilanciere", squatWeekday))).toEqual([{ kg: 100, reps: 5 }]);

    // setHistory: tutte le serie, sessione più recente prima
    const panchaSetHistory = setHistoryByExerciseName.get(weekExerciseHistoryKey("Panca piana bilanciere", panchaWeekday));
    expect(panchaSetHistory[0].workoutLogId).toBe("log_past_panca_1");
    expect(panchaSetHistory[0].sets).toEqual([
      { setNumber: 1, kg: 80, reps: 8, rir: 2 },
      { setNumber: 2, kg: 82.5, reps: 6, rir: 1 },
    ]);

    // loggedSetsByLogId: solo per le righe DI QUESTA settimana (precompilazione kg/reps)
    expect(loggedSetsByLogId.get("log_today_panca")).toEqual([
      { workout_log_id: "log_today_panca", set_number: 1, load_kg: 85, reps_completed: 5, rir: 1 },
    ]);
    expect(loggedSetsByLogId.get("log_today_squat")).toEqual([]); // nessuna serie registrata oggi per lo squat
  });

  it("BUG PRESO: un'occorrenza passata dello stesso esercizio in un giorno della settimana DIVERSO non entra nello storico (mai una falsa regressione)", async () => {
    // Lunedì (questa settimana): Pectoral Machine 1° esercizio. daysAgoISO(7)
    // è esattamente lo stesso giorno della settimana di "oggi" (7 giorni fa).
    // daysAgoISO(2) invece è un giorno della settimana DIVERSO (a meno di
    // un multiplo di 7, escluso qui: 2 non lo è).
    const thisWeekRows = [{ id: "log_lun", exercise_name: "Pectoral Machine", date: daysAgoISO(0) }];
    const tables = {
      workout_logs: [
        // stesso giorno della settimana di "oggi": lunedì scorso, carico basso, primo esercizio
        { id: "log_lun_scorso", date: daysAgoISO(7), exercise_name: "Pectoral Machine", user_id: "u1", status: "done" },
        // giorno della settimana diverso: mercoledì, carico alto ma 4° esercizio già affaticato — NON deve entrare nel confronto
        { id: "log_mer", date: daysAgoISO(2), exercise_name: "Pectoral Machine", user_id: "u1", status: "done" },
      ],
      workout_sets: [
        { workout_log_id: "log_lun_scorso", set_number: 1, load_kg: 40, reps_completed: 10, rir: 2 },
        { workout_log_id: "log_mer", set_number: 1, load_kg: 60, reps_completed: 6, rir: 1 },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const { historyByExerciseName } = await fetchWeekExerciseHistories(supabase, "u1", thisWeekRows);
    const history = historyByExerciseName.get(weekExerciseHistoryKey("Pectoral Machine", daysAgoISO(0)));
    expect(history).toEqual([{ kg: 40, reps: 10 }]); // solo lunedì scorso, mai il mercoledì di un altro contesto
  });

  it("nessun esercizio assegnato questa settimana => mappe vuote, mai un errore", async () => {
    const supabase = makeMockSupabase({ workout_logs: [], workout_sets: [] });
    const result = await fetchWeekExerciseHistories(supabase, "u1", []);
    expect(result.historyByExerciseName.size).toBe(0);
    expect(result.setHistoryByExerciseName.size).toBe(0);
    expect(result.loggedSetsByLogId.size).toBe(0);
    expect(result.missedByExerciseName.size).toBe(0);
  });

  it("un giorno passato assegnato ma mai registrato (status 'missed') compare in missedByExerciseName, mai in history/setHistory", async () => {
    // daysAgoISO(2) e daysAgoISO(9) differiscono di 7 giorni (stesso giorno
    // della settimana); la riga di questa settimana usa daysAgoISO(-5),
    // anch'esso a 7 giorni esatti da entrambe.
    const weekday = daysAgoISO(-5);
    const thisWeekRows = [{ id: "log_today_panca", exercise_name: "Panca piana bilanciere", date: weekday }];
    const tables = {
      workout_logs: [
        { id: "log_past_done", date: daysAgoISO(2), exercise_name: "Panca piana bilanciere", user_id: "u1", status: "done", sets_count: 3 },
        { id: "log_past_missed", date: daysAgoISO(9), exercise_name: "Panca piana bilanciere", user_id: "u1", status: "missed", sets_count: 4 },
      ],
      workout_sets: [
        { workout_log_id: "log_past_done", set_number: 1, load_kg: 80, reps_completed: 8, rir: 2 },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const { historyByExerciseName, setHistoryByExerciseName, missedByExerciseName } =
      await fetchWeekExerciseHistories(supabase, "u1", thisWeekRows);

    const key = weekExerciseHistoryKey("Panca piana bilanciere", weekday);
    expect(historyByExerciseName.get(key)).toEqual([{ kg: 80, reps: 8 }]);
    expect(setHistoryByExerciseName.get(key).map((s) => s.workoutLogId)).toEqual(["log_past_done"]);

    const missed = missedByExerciseName.get(key);
    expect(missed).toEqual([{ workoutLogId: "log_past_missed", date: daysAgoISO(9), setsCount: 4 }]);
  });

  it("un giorno di OGGI o futuro assegnato non compare mai come 'dimenticato' (non è ancora scaduto)", async () => {
    const thisWeekRows = [{ id: "log_today", exercise_name: "Squat bilanciere", date: daysAgoISO(0) }];
    const tables = {
      workout_logs: [
        { id: "log_today", date: daysAgoISO(0), exercise_name: "Squat bilanciere", user_id: "u1", status: "missed", sets_count: 3 },
        { id: "log_future", date: daysAgoISO(-3), exercise_name: "Squat bilanciere", user_id: "u1", status: "missed", sets_count: 3 },
      ],
      workout_sets: [],
    };
    const supabase = makeMockSupabase(tables);
    const { missedByExerciseName } = await fetchWeekExerciseHistories(supabase, "u1", thisWeekRows);
    expect(missedByExerciseName.get(weekExerciseHistoryKey("Squat bilanciere", daysAgoISO(0)))).toEqual([]);
  });
});

describe("computeCrewWeeklyActivity", () => {
  it("un membro attivo tutti i giorni risulta completo 7 giorni su 7", async () => {
    const days = Array.from({ length: 7 }, (_, i) => daysAgoISO(6 - i));
    const tables = {
      nutrition_logs: days.map((d) => ({ user_id: "u1", date: d })),
      daily_metrics: days.map((d) => ({ user_id: "u1", date: d, sleep_hours: 7, steps: 8000 })),
      workout_logs: [], // nessun allenamento previsto quel giorno = riposo, non penalizza
      pause_periods: [],
      streak_freezes: [],
    };
    const supabase = makeMockSupabase(tables);
    const result = await computeCrewWeeklyActivity(supabase, ["u1"]);
    const u1 = result.get("u1");
    expect(u1.completeCount).toBe(7);
    expect(u1.dayFlags.every(Boolean)).toBe(true);
  });

  it("un membro senza alcun dato tracciato risulta a 0 giorni completi, mai un errore", async () => {
    const supabase = makeMockSupabase({ nutrition_logs: [], daily_metrics: [], workout_logs: [], pause_periods: [], streak_freezes: [] });
    const result = await computeCrewWeeklyActivity(supabase, ["u2"]);
    expect(result.get("u2").completeCount).toBe(0);
  });
});

describe("computeCrewStreak", () => {
  const days = Array.from({ length: 7 }, (_, i) => daysAgoISO(6 - i));
  const today = daysAgoISO(0);
  const makeEntry = (completeFromIndex) => ({
    days,
    dayFlags: days.map((_, i) => i >= completeFromIndex),
    completeCount: days.length - completeFromIndex,
  });

  it("conta i giorni consecutivi in cui tutta la crew è stata costante", () => {
    // 3 membri, tutti completi negli ultimi 3 giorni (oggi compreso), nessuno prima.
    const weekly = new Map([
      ["u1", makeEntry(4)],
      ["u2", makeEntry(4)],
      ["u3", makeEntry(4)],
    ]);
    const { streak } = computeCrewStreak(weekly, today);
    expect(streak).toBe(3);
  });

  it("un solo membro assente in un giorno non rompe lo streak di gruppo (tolleranza)", () => {
    // 4 membri, tutti i 7 giorni completi TRANNE u4 che manca ieri soltanto —
    // resta comunque 3/4 presenti quel giorno, sopra la soglia (max 1 assente).
    const weekly = new Map([
      ["u1", makeEntry(0)],
      ["u2", makeEntry(0)],
      ["u3", makeEntry(0)],
      ["u4", { days, dayFlags: days.map((_, i) => i !== 5), completeCount: 6 }],
    ]);
    const { streak } = computeCrewStreak(weekly, today);
    expect(streak).toBe(7);
  });

  it("una crew rimasta con un solo membro non regala uno streak gratuito nei giorni senza attività", () => {
    // BUG PRESO: Math.max(0, 1 - CREW_DAY_MAX_MISSING) dava minComplete = 0,
    // che rendeva OGNI giorno "completo per la crew" indipendentemente
    // dall'attività reale dell'unico membro rimasto.
    const weekly = new Map([["u1", makeEntry(4)]]); // completo solo negli ultimi 3 giorni
    const { streak } = computeCrewStreak(weekly, today);
    expect(streak).toBe(3);
  });

  it("due giorni di fila sotto soglia rompono lo streak di gruppo oltre la finestra di grazia", () => {
    // 4 membri: u2 e u3 mancano ENTRAMBI 2 giorni fa e ieri (indici 4 e 5) —
    // 2 presenti su 4 quel giorno, sotto la soglia (max 1 assente su 4). La
    // finestra di grazia perdona solo il giorno più recente (ieri, indice 5,
    // a 1 giorno da oggi): il giorno prima (indice 4, a 2 giorni da oggi) è
    // fuori grazia e interrompe davvero la risalita.
    const absentAt4And5 = { days, dayFlags: days.map((_, i) => i !== 4 && i !== 5), completeCount: 5 };
    const weekly = new Map([
      ["u1", makeEntry(0)],
      ["u2", absentAt4And5],
      ["u3", absentAt4And5],
      ["u4", makeEntry(0)],
    ]);
    const { streak } = computeCrewStreak(weekly, today);
    expect(streak).toBe(1); // solo oggi: ieri perdonato dalla grazia, l'altro ieri no
  });
});

describe("fetchFoodUsageStats", () => {
  it("l'ultima quantità registrata per un alimento è quella della riga più recente, non la prima inserita", async () => {
    const tables = {
      nutrition_logs: [
        { user_id: "u1", name: "Pane comune", grams: 50, date: daysAgoISO(5), created_at: daysAgoISO(5) + "T08:00:00Z" },
        { user_id: "u1", name: "Pane comune", grams: 100, date: daysAgoISO(1), created_at: daysAgoISO(1) + "T08:00:00Z" }, // più recente
      ],
    };
    const supabase = makeMockSupabase(tables);
    const stats = await fetchFoodUsageStats(supabase, "u1");
    expect(stats.get("Pane comune")).toEqual({ lastGrams: 100, count: 2 });
  });

  it("conta le occorrenze per proporre per primi gli alimenti mangiati più spesso", async () => {
    const tables = {
      nutrition_logs: [
        { user_id: "u1", name: "Riso basmati", grams: 80, date: daysAgoISO(3), created_at: daysAgoISO(3) + "T08:00:00Z" },
        { user_id: "u1", name: "Riso basmati", grams: 80, date: daysAgoISO(2), created_at: daysAgoISO(2) + "T08:00:00Z" },
        { user_id: "u1", name: "Riso basmati", grams: 80, date: daysAgoISO(1), created_at: daysAgoISO(1) + "T08:00:00Z" },
        { user_id: "u1", name: "Quinoa", grams: 60, date: daysAgoISO(1), created_at: daysAgoISO(1) + "T08:00:00Z" },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const stats = await fetchFoodUsageStats(supabase, "u1");
    expect(stats.get("Riso basmati").count).toBe(3);
    expect(stats.get("Quinoa").count).toBe(1);
  });

  it("righe senza grammi registrati (integratori, acqua) non contano come utilizzo di un alimento", async () => {
    const supabase = makeMockSupabase({
      nutrition_logs: [{ user_id: "u1", name: "Whey isolate", grams: null, date: daysAgoISO(1), created_at: daysAgoISO(1) + "T08:00:00Z" }],
    });
    const stats = await fetchFoodUsageStats(supabase, "u1");
    expect(stats.has("Whey isolate")).toBe(false);
  });

  it("nessuno storico alimentare => mappa vuota, mai un errore", async () => {
    const supabase = makeMockSupabase({ nutrition_logs: [] });
    const stats = await fetchFoodUsageStats(supabase, "u1");
    expect(stats.size).toBe(0);
  });
});

describe("fetchCoachChatInbox", () => {
  it("ultimo messaggio e conteggio non letti per cliente, ordinati per messaggio più recente", async () => {
    const tables = {
      profiles: [
        { id: "u1", role: "user", plan: "scheda_personalizzata", nickname: "Mario", full_name: "Mario Rossi" },
        { id: "u2", role: "user", plan: "training", nickname: "Luca", full_name: null },
      ],
      chat_messages: [
        { client_id: "u1", sender_id: "coach", body: "Come va?", attachment_type: null, created_at: "2026-08-20T10:00:00Z", read_at: "2026-08-20T10:05:00Z" },
        { client_id: "u1", sender_id: "u1", body: "Tutto bene!", attachment_type: null, created_at: "2026-08-21T09:00:00Z", read_at: null },
        { client_id: "u2", sender_id: "u2", body: null, attachment_type: "image", created_at: "2026-08-19T08:00:00Z", read_at: null },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const rows = await fetchCoachChatInbox(supabase, "coach");

    const u1 = rows.find((r) => r.id === "u1");
    expect(u1.lastMessage).toBe("Tutto bene!");
    expect(u1.lastMessageMine).toBe(false);
    expect(u1.unreadCount).toBe(1);

    const u2 = rows.find((r) => r.id === "u2");
    expect(u2.lastMessage).toBe("📎 Allegato");
    expect(u2.unreadCount).toBe(1);

    expect(rows.map((r) => r.id)).toEqual(["u1", "u2"]); // 21/08 prima di 19/08
  });

  it("un cliente senza nessun messaggio non genera errori e finisce in fondo alla lista", async () => {
    const tables = {
      profiles: [
        { id: "u1", role: "user", plan: "full", nickname: "Anna", full_name: "Anna Bianchi" },
        { id: "u2", role: "user", plan: "full", nickname: "Bea", full_name: "Bea Verdi" },
      ],
      chat_messages: [
        { client_id: "u1", sender_id: "coach", body: "Ciao", attachment_type: null, created_at: "2026-08-20T10:00:00Z", read_at: "2026-08-20T10:05:00Z" },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const rows = await fetchCoachChatInbox(supabase, "coach");
    const u2 = rows.find((r) => r.id === "u2");
    expect(u2.lastMessage).toBeNull();
    expect(u2.unreadCount).toBe(0);
    expect(rows[rows.length - 1].id).toBe("u2");
  });
});

describe("fetchClientRoster", () => {
  it("assegna a ciascun cliente solo i propri checkin e la propria anamnesi, ultimo checkin per primo tra i più recenti", async () => {
    const tables = {
      profiles: [
        { id: "u1", role: "user", full_name: "Mario Rossi", nickname: "Mario", email: "m@x.it", gender: "male", xp_total: 100, current_streak: 3, plan: "training", client_status: "active", last_activity: "2026-08-25", created_at: "2026-01-01", whitelisted_until: null },
        { id: "u2", role: "user", full_name: "Anna Bianchi", nickname: "Anna", email: "a@x.it", gender: "female", xp_total: 50, current_streak: 1, plan: "free", client_status: "registered", last_activity: "2026-08-20", created_at: "2026-02-01", whitelisted_until: null },
      ],
      checkins: [
        { user_id: "u1", date: "2026-08-01", weight: 80, chest: null, arm: null, thigh: null },
        { user_id: "u1", date: "2026-08-15", weight: 79, chest: null, arm: null, thigh: null }, // più recente di u1
        { user_id: "u2", date: "2026-08-10", weight: 60, chest: null, arm: null, thigh: null },
      ],
      anamnesis_responses: [
        { user_id: "u1", answers: { obiettivoPrinc: "ipertrofia" } },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const roster = await fetchClientRoster(supabase);

    const u1 = roster.find((r) => r.id === "u1");
    expect(u1.goal).toBe("ipertrofia");
    expect(u1.lastCheck.weight).toBe(79); // il più recente dei suoi 2 checkin, non quello di u2
    expect(u1.weightHistory).toEqual([80, 79]); // dal più vecchio al più recente

    const u2 = roster.find((r) => r.id === "u2");
    expect(u2.goal).toBeNull(); // nessuna anamnesi per u2
    expect(u2.lastCheck.weight).toBe(60);
    expect(u2.weightHistory).toEqual([60]);
  });

  it("un cliente senza checkin né anamnesi non genera errori", async () => {
    const supabase = makeMockSupabase({
      profiles: [{ id: "u1", role: "user", full_name: "Solo", nickname: "Solo", email: "s@x.it", gender: "male", xp_total: 0, current_streak: 0, plan: "free", client_status: "registered", last_activity: null, created_at: "2026-01-01", whitelisted_until: null }],
      checkins: [],
      anamnesis_responses: [],
    });
    const roster = await fetchClientRoster(supabase);
    expect(roster[0].lastCheck).toEqual({ weight: null });
    expect(roster[0].weightHistory).toEqual([]);
    expect(roster[0].goal).toBeNull();
  });

  it("segnala se scheda/dieta/integratori sono già stati assegnati (per distinguere In attesa da Attivi)", async () => {
    const supabase = makeMockSupabase({
      profiles: [
        // ha appena pagato Full Coaching (client_status:'active' scritto dal webhook Stripe), ma non ha ancora nulla
        { id: "u1", role: "user", full_name: "Nuovo Pagante", nickname: "Nuovo", email: "n@x.it", gender: "male", xp_total: 0, current_streak: 0, plan: "full", client_status: "active", last_activity: null, created_at: "2026-01-01", whitelisted_until: null },
        // ha tutto assegnato
        { id: "u2", role: "user", full_name: "Seguito Bene", nickname: "Seguito", email: "s@x.it", gender: "male", xp_total: 0, current_streak: 0, plan: "full", client_status: "active", last_activity: null, created_at: "2026-01-01", whitelisted_until: null },
      ],
      checkins: [], anamnesis_responses: [],
      workout_logs: [{ user_id: "u2", date: "2026-08-01" }],
      nutrition_targets: [{ user_id: "u2" }],
      prescribed_supplements: [{ user_id: "u2" }],
    });
    const roster = await fetchClientRoster(supabase);
    const u1 = roster.find((r) => r.id === "u1");
    expect(u1.hasWorkoutAssigned).toBe(false);
    expect(u1.hasNutritionAssigned).toBe(false);
    expect(u1.hasSupplementsAssigned).toBe(false);
    const u2 = roster.find((r) => r.id === "u2");
    expect(u2.hasWorkoutAssigned).toBe(true);
    expect(u2.hasNutritionAssigned).toBe(true);
    expect(u2.hasSupplementsAssigned).toBe(true);
  });
});

describe("countUnreadChatMessages", () => {
  it("un messaggio dell'altra parte non ancora letto => 1", async () => {
    const supabase = makeMockSupabase({
      chat_messages: [{ id: "m1", client_id: "u1", sender_id: "coach1", read_at: null }],
    });
    expect(await countUnreadChatMessages(supabase, "u1", "u1")).toBe(1);
  });
  it("più messaggi non letti => il conteggio esatto, non solo un booleano", async () => {
    const supabase = makeMockSupabase({
      chat_messages: [
        { id: "m1", client_id: "u1", sender_id: "coach1", read_at: null },
        { id: "m2", client_id: "u1", sender_id: "coach1", read_at: null },
        { id: "m3", client_id: "u1", sender_id: "coach1", read_at: null },
      ],
    });
    expect(await countUnreadChatMessages(supabase, "u1", "u1")).toBe(3);
  });
  it("nessun messaggio => 0", async () => {
    const supabase = makeMockSupabase({ chat_messages: [] });
    expect(await countUnreadChatMessages(supabase, "u1", "u1")).toBe(0);
  });
  it("messaggio già letto (read_at valorizzato) => 0", async () => {
    const supabase = makeMockSupabase({
      chat_messages: [{ id: "m1", client_id: "u1", sender_id: "coach1", read_at: "2026-01-01T00:00:00Z" }],
    });
    expect(await countUnreadChatMessages(supabase, "u1", "u1")).toBe(0);
  });
  it("messaggio scritto da me stesso (mai da segnare non letto) => 0", async () => {
    const supabase = makeMockSupabase({
      chat_messages: [{ id: "m1", client_id: "u1", sender_id: "u1", read_at: null }],
    });
    expect(await countUnreadChatMessages(supabase, "u1", "u1")).toBe(0);
  });
});

// Ricompense di livello (richiesta esplicita: "sistema di ricompense di
// valore crescente sbloccabili automaticamente ai vari livelli") — il tetto
// di congelamenti streak DEVE crescere esattamente in coordinata con
// LEVEL_REWARDS: se le due liste si disallineano il testo mostrato al
// cliente ("+1 congelamento a livello X") mentirebbe sul vantaggio reale.
describe("freezeBonusForLevel", () => {
  it("nessun bonus nel primo tier (livelli 1-5)", () => {
    expect(freezeBonusForLevel(1)).toBe(0);
    expect(freezeBonusForLevel(5)).toBe(0);
  });
  it("+1 al secondo tier (livelli 6-10)", () => {
    expect(freezeBonusForLevel(6)).toBe(1);
    expect(freezeBonusForLevel(10)).toBe(1);
  });
  it("+2/+3/+4 ai tier successivi (11, 16, 21)", () => {
    expect(freezeBonusForLevel(11)).toBe(2);
    expect(freezeBonusForLevel(16)).toBe(3);
    expect(freezeBonusForLevel(21)).toBe(4);
  });
  it("tetto a +4 anche a livelli molto alti (mai un tetto streak svuotato di significato)", () => {
    expect(freezeBonusForLevel(26)).toBe(4);
    expect(freezeBonusForLevel(1000)).toBe(4);
  });
  it("un livello mancante/non valido non deve mai far crashare o restituire un bonus negativo", () => {
    expect(freezeBonusForLevel(0)).toBe(0);
    expect(freezeBonusForLevel(undefined)).toBe(0);
  });
});

describe("LEVEL_REWARDS coerente con freezeBonusForLevel", () => {
  it("ogni ricompensa 'perk' promette esattamente il bonus che freezeBonusForLevel calcola davvero", () => {
    LEVEL_REWARDS.filter((r) => r.kind === "perk").forEach((r) => {
      const bonus = freezeBonusForLevel(r.level);
      const bonusOneLevelBefore = freezeBonusForLevel(r.level - 1);
      // Una ricompensa "perk" a questo livello deve corrispondere a un
      // aumento REALE del bonus rispetto al livello immediatamente
      // precedente — altrimenti il testo "+1 congelamento streak" sarebbe
      // una promessa vuota, mai davvero consegnata.
      expect(bonus).toBeGreaterThan(bonusOneLevelBefore);
    });
  });
});

describe("fetchStreakFreezeStatus", () => {
  it("livello 1 (nessun bonus): tetto di 2 congelamenti ogni 30 giorni", async () => {
    const supabase = makeMockSupabase({ streak_freezes: [] });
    const status = await fetchStreakFreezeStatus(supabase, "u1", 1);
    expect(status).toEqual({ remaining: 2, usedToday: false, cap: 2 });
  });
  it("livello 11 (ricompensa di livello, +2 congelamenti): tetto di 4", async () => {
    const supabase = makeMockSupabase({ streak_freezes: [] });
    const status = await fetchStreakFreezeStatus(supabase, "u1", 11);
    expect(status.cap).toBe(4);
    expect(status.remaining).toBe(4);
  });
  it("congelamenti già usati nella finestra riducono 'remaining' rispetto al tetto reale del livello", async () => {
    const supabase = makeMockSupabase({
      streak_freezes: [
        { user_id: "u1", date: daysAgoISO(1) },
        { user_id: "u1", date: daysAgoISO(5) },
      ],
    });
    const status = await fetchStreakFreezeStatus(supabase, "u1", 6); // tetto 3 (2 base + 1 bonus)
    expect(status.cap).toBe(3);
    expect(status.remaining).toBe(1);
  });
  it("displayLevel omesso => nessun bonus, comportamento identico a prima dell'introduzione delle ricompense", async () => {
    const supabase = makeMockSupabase({ streak_freezes: [] });
    const status = await fetchStreakFreezeStatus(supabase, "u1");
    expect(status.cap).toBe(2);
  });
});

// Alert scadenze programmazione (richiesta esplicita: "notifica/alert
// visivo... anticipo di 4-5 giorni quando la programmazione attiva di un
// cliente sta per scadere").
describe("computeProgramExpiryAlerts", () => {
  const todayISO = daysAgoISO(0);
  it("nessun alert per un cliente senza allenamento assegnato (hasWorkoutAssigned false)", () => {
    const clients = [{ id: "u1", name: "Mario", hasWorkoutAssigned: false }];
    const alerts = computeProgramExpiryAlerts(clients, new Map(), todayISO);
    expect(alerts).toEqual([]);
  });
  it("copertura ampiamente sopra la finestra => nessun alert", () => {
    const clients = [{ id: "u1", name: "Mario", hasWorkoutAssigned: true }];
    const lastAssigned = new Map([["u1", daysAgoISO(-30)]]); // 30 giorni nel futuro
    const alerts = computeProgramExpiryAlerts(clients, lastAssigned, todayISO);
    expect(alerts).toEqual([]);
  });
  it("copertura entro la finestra di 5 giorni => alert 'expiring' con i giorni esatti", () => {
    const clients = [{ id: "u1", name: "Mario", hasWorkoutAssigned: true }];
    const lastAssigned = new Map([["u1", daysAgoISO(-3)]]); // 3 giorni nel futuro
    const alerts = computeProgramExpiryAlerts(clients, lastAssigned, todayISO);
    expect(alerts).toEqual([{ clientId: "u1", clientName: "Mario", lastDate: daysAgoISO(-3), daysRemaining: 3, status: "expiring" }]);
  });
  it("l'ultimo giorno assegnato è oggi stesso => daysRemaining 0, non un alert 'scaduto'", () => {
    const clients = [{ id: "u1", name: "Mario", hasWorkoutAssigned: true }];
    const lastAssigned = new Map([["u1", todayISO]]);
    const alerts = computeProgramExpiryAlerts(clients, lastAssigned, todayISO);
    expect(alerts[0]).toMatchObject({ daysRemaining: 0, status: "expiring" });
  });
  it("nessuna riga da oggi in poi (Map senza voce) => già scaduta, il caso più urgente", () => {
    const clients = [{ id: "u1", name: "Mario", hasWorkoutAssigned: true }];
    const alerts = computeProgramExpiryAlerts(clients, new Map(), todayISO);
    expect(alerts).toEqual([{ clientId: "u1", clientName: "Mario", lastDate: null, daysRemaining: -1, status: "expired" }]);
  });
  it("più clienti: ordinati dal più urgente (scaduto prima, poi meno giorni rimasti)", () => {
    const clients = [
      { id: "u1", name: "Ampio margine", hasWorkoutAssigned: true },
      { id: "u2", name: "Scaduto", hasWorkoutAssigned: true },
      { id: "u3", name: "Domani", hasWorkoutAssigned: true },
    ];
    const lastAssigned = new Map([["u1", daysAgoISO(-30)], ["u3", daysAgoISO(-1)]]); // u2 assente => scaduto
    const alerts = computeProgramExpiryAlerts(clients, lastAssigned, todayISO);
    expect(alerts.map((a) => a.clientId)).toEqual(["u2", "u3"]);
  });
});

describe("fetchLastAssignedWorkoutDates", () => {
  it("prende la data più lontana nel futuro per ciascun utente, ignora le righe passate", async () => {
    const tables = {
      workout_logs: [
        { user_id: "u1", date: daysAgoISO(1) },  // passato: ignorato
        { user_id: "u1", date: daysAgoISO(-2) }, // futuro, più vicino
        { user_id: "u1", date: daysAgoISO(-7) }, // futuro, più lontano => questo vince
        { user_id: "u2", date: daysAgoISO(-1) },
      ],
    };
    const supabase = makeMockSupabase(tables);
    const map = await fetchLastAssignedWorkoutDates(supabase, ["u1", "u2"]);
    expect(map.get("u1")).toBe(daysAgoISO(-7));
    expect(map.get("u2")).toBe(daysAgoISO(-1));
  });
  it("nessun userId => Map vuota, mai una query inutile", async () => {
    const supabase = makeMockSupabase({ workout_logs: [] });
    const map = await fetchLastAssignedWorkoutDates(supabase, []);
    expect(map.size).toBe(0);
  });
  it("cliente senza righe future => assente dalla Map (il chiamante lo tratta come scaduto)", async () => {
    const supabase = makeMockSupabase({ workout_logs: [{ user_id: "u1", date: daysAgoISO(3) }] }); // solo passato
    const map = await fetchLastAssignedWorkoutDates(supabase, ["u1"]);
    expect(map.has("u1")).toBe(false);
  });
});
