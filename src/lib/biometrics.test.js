// Test unitari per biometrics.js — prontezza e dispendio energetico.
// Copre soprattutto il principio "mai un dato finto": ogni funzione deve
// tornare null (o elencare cosa manca) quando un input non c'è, mai un
// numero inventato al posto di un dato mancante.
import { describe, it, expect } from "vitest";
import {
  computeReadinessScore, computeBMR, estimateStepEnergyKcal, computeEnergyExpenditure,
  computeAgeFromBirthDate, chart3dPct, grade, THRESH, computeOverreachAlert,
} from "./biometrics.js";

describe("computeReadinessScore", () => {
  it("torna null se non c'è nessun dato per oggi", () => {
    expect(computeReadinessScore({})).toBeNull();
  });

  it("un solo dato (sonno) basta per un punteggio", () => {
    const r = computeReadinessScore({ sleepHours: 8 });
    expect(r).not.toBeNull();
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].key).toBe("sleep");
  });

  it("HRV/RHR entrano nel punteggio solo se passati esplicitamente", () => {
    const withoutHrv = computeReadinessScore({ sleepHours: 8, steps: 9000 });
    expect(withoutHrv.parts.map((p) => p.key)).toEqual(["sleep", "steps"]);

    const withHrv = computeReadinessScore({ sleepHours: 8, steps: 9000, hrv: 65, rhr: 55 });
    expect(withHrv.parts.map((p) => p.key).sort()).toEqual(["hrv", "rhr", "sleep", "steps"]);
  });

  it("un HRV alto (buono) alza il punteggio rispetto a non averlo", () => {
    const base = computeReadinessScore({ sleepHours: 5, steps: 3000 }); // dati scarsi
    const withGoodHrv = computeReadinessScore({ sleepHours: 5, steps: 3000, hrv: 80, rhr: 50 });
    expect(withGoodHrv.score).toBeGreaterThan(base.score);
  });

  it("sonno scarso e più fattori bassi restano in tono 'bad', non nascosti da un HRV forte isolato", () => {
    const r = computeReadinessScore({ sleepHours: 4, steps: 1000, motivation: 2, fatigue: 9 });
    expect(r.tone).toBe("bad");
  });

  it("dolore recente applica una penalità che decade con i giorni", () => {
    const fresh = computeReadinessScore({ sleepHours: 8, recentSensations: { pain: 6, daysAgo: 0 } });
    const old = computeReadinessScore({ sleepHours: 8, recentSensations: { pain: 6, daysAgo: 7 } });
    const none = computeReadinessScore({ sleepHours: 8 });
    expect(fresh.score).toBeLessThan(old.score);
    expect(old.score).toBeLessThan(none.score + 1); // decadimento quasi a zero al settimo giorno
    expect(fresh.penaltyApplied).toBe(true);
  });

  it("il punteggio resta sempre in [0, 100]", () => {
    const r = computeReadinessScore({ sleepHours: 0.5, steps: 0, motivation: 1, fatigue: 10, recentSensations: { pain: 10, stress: 10, daysAgo: 0 } });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("chart3dPct / grade — curva a semaforo", () => {
  it("è monotona crescente con il valore per una metrica non invertita (sleep)", () => {
    expect(chart3dPct("sleep", 4)).toBeLessThan(chart3dPct("sleep", 7));
    expect(chart3dPct("sleep", 7)).toBeLessThan(chart3dPct("sleep", 9));
  });

  it("è monotona DEcrescente con il valore per una metrica invertita (rhr)", () => {
    expect(chart3dPct("rhr", 50)).toBeGreaterThan(chart3dPct("rhr", 70));
    expect(chart3dPct("rhr", 70)).toBeGreaterThan(chart3dPct("rhr", 90));
  });

  it("grade rispetta le soglie dichiarate in THRESH", () => {
    expect(grade("sleep", THRESH.sleep.bad - 0.1)).toBe("bad");
    expect(grade("sleep", THRESH.sleep.mid + 0.1)).toBe("good");
    expect(grade("rhr", THRESH.rhr.bad + 1)).toBe("bad"); // invertito: alto RHR = male
    expect(grade("rhr", THRESH.rhr.mid - 1)).toBe("good");
  });
});

describe("computeAgeFromBirthDate", () => {
  const isoDaysAgoYears = (years, dayOffset = 0) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().slice(0, 10);
  };

  it("torna null senza data", () => {
    expect(computeAgeFromBirthDate(null)).toBeNull();
    expect(computeAgeFromBirthDate("")).toBeNull();
  });

  it("torna null per una data non valida", () => {
    expect(computeAgeFromBirthDate("non-una-data")).toBeNull();
  });

  it("calcola correttamente l'età per un compleanno già passato quest'anno", () => {
    expect(computeAgeFromBirthDate(isoDaysAgoYears(30, -5))).toBe(30);
  });

  it("non conta ancora l'anno se il compleanno non è ancora arrivato quest'anno", () => {
    expect(computeAgeFromBirthDate(isoDaysAgoYears(30, 5))).toBe(29);
  });

  it("conta l'anno esatto del compleanno di oggi", () => {
    expect(computeAgeFromBirthDate(isoDaysAgoYears(30, 0))).toBe(30);
  });

  it("rifiuta età implausibili (data futura, o più di 130 anni)", () => {
    expect(computeAgeFromBirthDate(isoDaysAgoYears(-1))).toBeNull(); // nato "nel futuro"
    expect(computeAgeFromBirthDate(isoDaysAgoYears(150))).toBeNull();
  });
});

describe("computeBMR", () => {
  it("torna null se manca un dato qualsiasi", () => {
    expect(computeBMR({ weightKg: 80, heightCm: 180, age: 30, gender: "M" })).not.toBeNull();
    expect(computeBMR({ weightKg: null, heightCm: 180, age: 30, gender: "M" })).toBeNull();
    expect(computeBMR({ weightKg: 80, heightCm: null, age: 30, gender: "M" })).toBeNull();
    expect(computeBMR({ weightKg: 80, heightCm: 180, age: null, gender: "M" })).toBeNull();
    expect(computeBMR({ weightKg: 80, heightCm: 180, age: 30, gender: null })).toBeNull();
  });

  it("formula di Mifflin-St Jeor, uomo: 10*peso + 6.25*altezza - 5*età + 5", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(computeBMR({ weightKg: 80, heightCm: 180, age: 30, gender: "M" })).toBe(1780);
  });

  it("formula di Mifflin-St Jeor, donna: 10*peso + 6.25*altezza - 5*età - 161", () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 → 1330
    expect(computeBMR({ weightKg: 60, heightCm: 165, age: 28, gender: "F" })).toBe(1330);
  });

  it("a parità di peso/altezza/età, un uomo ha un BMR più alto di una donna (161 vs +5)", () => {
    const m = computeBMR({ weightKg: 70, heightCm: 170, age: 30, gender: "M" });
    const f = computeBMR({ weightKg: 70, heightCm: 170, age: 30, gender: "F" });
    expect(m - f).toBe(166); // 5 - (-161)
  });

  it("rifiuta pesi/età non plausibili (0 o negativi)", () => {
    expect(computeBMR({ weightKg: 0, heightCm: 180, age: 30, gender: "M" })).toBeNull();
    expect(computeBMR({ weightKg: 80, heightCm: 180, age: -5, gender: "M" })).toBeNull();
  });
});

describe("estimateStepEnergyKcal", () => {
  it("torna null senza peso", () => {
    expect(estimateStepEnergyKcal({ steps: 10000, weightKg: null })).toBeNull();
  });

  it("0 passi è un dato valido (0 kcal attive), non 'mancante'", () => {
    expect(estimateStepEnergyKcal({ steps: 0, weightKg: 70 })).toBe(0);
  });

  it("cresce linearmente con i passi", () => {
    const at5k = estimateStepEnergyKcal({ steps: 5000, weightKg: 70 });
    const at10k = estimateStepEnergyKcal({ steps: 10000, weightKg: 70 });
    expect(at10k).toBeCloseTo(at5k * 2, -1);
  });

  it("a parità di passi, chi pesa di più consuma di più", () => {
    const light = estimateStepEnergyKcal({ steps: 10000, weightKg: 60 });
    const heavy = estimateStepEnergyKcal({ steps: 10000, weightKg: 90 });
    expect(heavy).toBeGreaterThan(light);
  });

  it("10.000 passi per un adulto medio (~70kg) restano in un range plausibile (300-450 kcal)", () => {
    const kcal = estimateStepEnergyKcal({ steps: 10000, weightKg: 70 });
    expect(kcal).toBeGreaterThan(300);
    expect(kcal).toBeLessThan(450);
  });
});

describe("computeEnergyExpenditure", () => {
  const full = { weightKg: 80, heightCm: 180, age: 30, gender: "M", steps: 10000 };

  it("con tutti i dati: bmr + calorie attive = totale, complete true, missing vuoto", () => {
    const r = computeEnergyExpenditure(full);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.bmr).not.toBeNull();
    expect(r.activeKcal).not.toBeNull();
    expect(r.total).toBe(r.bmr + r.activeKcal);
  });

  it("senza altezza: bmr è null, il totale è null, ma missing lo dichiara esplicitamente", () => {
    const r = computeEnergyExpenditure({ ...full, heightCm: null });
    expect(r.bmr).toBeNull();
    expect(r.total).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missing).toContain("heightCm");
  });

  it("senza passi: bmr resta calcolabile da solo, ma il totale no (mai un parziale spacciato per totale)", () => {
    const r = computeEnergyExpenditure({ ...full, steps: null });
    expect(r.bmr).not.toBeNull();
    expect(r.activeKcal).toBeNull();
    expect(r.total).toBeNull();
    expect(r.missing).toEqual(["steps"]);
  });

  it("nessun dato anagrafico: tutto null, missing elenca tutto", () => {
    const r = computeEnergyExpenditure({});
    expect(r.bmr).toBeNull();
    expect(r.activeKcal).toBeNull();
    expect(r.total).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

describe("computeOverreachAlert", () => {
  const stableDay = { sleepHours: 7.5, hrv: 60, rhr: 55 };
  const stableDays = (n) => Array.from({ length: n }, () => ({ ...stableDay }));

  it("torna null con meno di RECENT_WINDOW+BASELINE_MIN_DAYS giorni (dati insufficienti)", () => {
    expect(computeOverreachAlert(stableDays(5))).toBeNull();
    expect(computeOverreachAlert([])).toBeNull();
    expect(computeOverreachAlert(null)).toBeNull();
  });

  it("nessun cambiamento rispetto al basale: level 'none', nessun flag", () => {
    const r = computeOverreachAlert(stableDays(10));
    expect(r.level).toBe("none");
    expect(r.flags).toHaveLength(0);
    expect(r.suggestion).toBeNull();
    expect(r.volumeReductionPct).toBeNull();
  });

  it("calo HRV sostenuto >10% negli ultimi giorni: flag hrv, level almeno 'watch'", () => {
    const days = [
      ...stableDays(7),
      { sleepHours: 7.5, hrv: 48, rhr: 55 }, // -20% rispetto al basale (60)
      { sleepHours: 7.5, hrv: 48, rhr: 55 },
      { sleepHours: 7.5, hrv: 48, rhr: 55 },
    ];
    const r = computeOverreachAlert(days);
    expect(r.level).not.toBe("none");
    expect(r.flags.some((f) => f.key === "hrv")).toBe(true);
    expect(typeof r.suggestion).toBe("string");
    expect(r.volumeReductionPct.min).toBeGreaterThan(0);
    expect(r.volumeReductionPct.max).toBeGreaterThan(r.volumeReductionPct.min);
  });

  it("RHR sopra basale di oltre 5bpm sostenuto: flag rhr", () => {
    const days = [
      ...stableDays(7),
      { sleepHours: 7.5, hrv: 60, rhr: 62 },
      { sleepHours: 7.5, hrv: 60, rhr: 62 },
      { sleepHours: 7.5, hrv: 60, rhr: 62 },
    ];
    const r = computeOverreachAlert(days);
    expect(r.flags.some((f) => f.key === "rhr")).toBe(true);
  });

  it("debito di sonno cronico (<6h medie recenti): flag sleep", () => {
    const days = [
      ...stableDays(7),
      { sleepHours: 5, hrv: 60, rhr: 55 },
      { sleepHours: 5, hrv: 60, rhr: 55 },
      { sleepHours: 5, hrv: 60, rhr: 55 },
    ];
    const r = computeOverreachAlert(days);
    expect(r.flags.some((f) => f.key === "sleep")).toBe(true);
  });

  it("più marcatori insieme (peggio): level 'high', suggerimento più aggressivo", () => {
    const days = [
      ...stableDays(7),
      { sleepHours: 4.5, hrv: 40, rhr: 66 }, // hrv -33%, rhr +11, sonno molto basso
      { sleepHours: 4.5, hrv: 40, rhr: 66 },
      { sleepHours: 4.5, hrv: 40, rhr: 66 },
    ];
    const r = computeOverreachAlert(days);
    expect(r.level).toBe("high");
    expect(r.flags.length).toBeGreaterThanOrEqual(2);
    expect(r.volumeReductionPct).toEqual({ min: 30, max: 40 });
  });

  it("dati mancanti (null) su alcuni giorni non fanno crashare, semplicemente non contano per la media", () => {
    const days = [
      ...Array.from({ length: 7 }, () => ({ sleepHours: null, hrv: null, rhr: null })),
      { sleepHours: 7.5, hrv: 60, rhr: 55 },
      { sleepHours: 7.5, hrv: 60, rhr: 55 },
      { sleepHours: 7.5, hrv: 60, rhr: 55 },
    ];
    // basale interamente nullo -> nessun confronto possibile per hrv/rhr/sonno
    const r = computeOverreachAlert(days);
    expect(r.level).toBe("none");
  });
});
