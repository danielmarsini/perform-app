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
  computeVolume, resolveMuscleTarget, MUSCLES, MUSCLE_TARGETS,
  DEFAULT_EXERCISE_LIB, isRealCoachingPlan, REAL_COACHING_PLANS_DB,
  computeRecoveryCompliance, computeBatchRecoveryCompliance,
  computeNutritionCompliance, computeBatchNutritionCompliance,
  computeTrainingCompliance, computeBatchTrainingCompliance,
  fetchWeekExerciseHistories,
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

describe("dayNutritionScore", () => {
  it("nessun target attivo => null (non giudicabile), non zero", () => {
    expect(dayNutritionScore({ kcal: 2000, p: 150, c: 200, f: 60 }, null)).toBeNull();
  });
  it("centrato esattamente sul target => punteggio 100", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    expect(dayNutritionScore({ ...target }, target)).toBe(100);
  });
  it("scostamento sotto e sopra target penalizzano allo stesso modo (simmetrico)", () => {
    const target = { kcal: 2000, p: 150, c: 200, f: 60 };
    const under = dayNutritionScore({ kcal: 1800, p: 150, c: 200, f: 60 }, target);
    const over = dayNutritionScore({ kcal: 2200, p: 150, c: 200, f: 60 }, target);
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
        lte(col, val) { rows = rows.filter((r) => getPath(r, col) <= val); return builder; },
        lt(col, val) { rows = rows.filter((r) => getPath(r, col) < val); return builder; },
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

describe("fetchWeekExerciseHistories", () => {
  it("costruisce storico (top set) e set-history da un'unica coppia di query, per più esercizi insieme", async () => {
    const thisWeekRows = [
      { id: "log_today_panca", exercise_name: "Panca piana bilanciere" },
      { id: "log_today_squat", exercise_name: "Squat bilanciere" },
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

    // history: top set per sessione, più vecchia prima (2 sessioni passate di panca)
    const panchaHistory = historyByExerciseName.get("Panca piana bilanciere");
    expect(panchaHistory).toEqual([
      { kg: 77.5, reps: 8 },  // sessione più vecchia (9 giorni fa)
      { kg: 82.5, reps: 6 },  // sessione più recente (2 giorni fa), top set tra le 2 serie
    ]);
    expect(historyByExerciseName.get("Squat bilanciere")).toEqual([{ kg: 100, reps: 5 }]);

    // setHistory: tutte le serie, sessione più recente prima
    const panchaSetHistory = setHistoryByExerciseName.get("Panca piana bilanciere");
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

  it("nessun esercizio assegnato questa settimana => mappe vuote, mai un errore", async () => {
    const supabase = makeMockSupabase({ workout_logs: [], workout_sets: [] });
    const result = await fetchWeekExerciseHistories(supabase, "u1", []);
    expect(result.historyByExerciseName.size).toBe(0);
    expect(result.setHistoryByExerciseName.size).toBe(0);
    expect(result.loggedSetsByLogId.size).toBe(0);
  });
});
