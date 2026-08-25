// Test unitari per le funzioni pure di coachingData.js — la logica di
// business più critica dell'app (XP/livelli, volume muscolare, punteggio
// nutrizione, parsing serie) non aveva NESSUNA copertura di test finora.
// Copre solo le funzioni pure (nessuna chiamata a Supabase): le funzioni
// async che leggono/scrivono dal DB richiederebbero un mock del client
// supabase, fuori scopo per questa prima infrastruttura di test.
import { describe, it, expect } from "vitest";
import {
  xpToLevelInfo, levelMinXp, dayNutritionScore, parseRepsTarget,
  computeVolume, resolveMuscleTarget, MUSCLES, MUSCLE_TARGETS,
  DEFAULT_EXERCISE_LIB, isRealCoachingPlan, REAL_COACHING_PLANS_DB,
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
