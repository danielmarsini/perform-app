/* ============================================================================
   PERFORM · biometrics.js — calcolo lato client di prontezza/recupero e
   dispendio energetico, a partire dai dati grezzi disponibili (sonno, passi,
   HRV/RHR quando presenti, peso/altezza/età/sesso).

   Stesso principio di tutto il resto dell'app ("mai un dato finto"): ogni
   funzione qui dentro entra in gioco SOLO con i dati che esistono davvero.
   Un input mancante non produce mai uno zero o una media silenziosa — il
   chiamante riceve `null` (o l'elenco di cosa manca) e decide come mostrare
   "dati insufficienti", mai un numero inventato spacciato per reale.

   Contenuto:
     1. Soglie/curva a semaforo (THRESH, chart3dPct, CANDLE, grade) — spostate
        qui da 05_HomeDashboard.jsx, invariate: erano già il cuore del
        Punteggio di Prontezza e dei grafici Chart3D/HRV Matrix, ora vivono
        in un modulo di calcolo dedicato invece che dentro un componente UI
        di 12.000+ righe.
     2. computeReadinessScore — Punteggio di Prontezza (0-100): sonno, passi,
        motivazione, fatica — ora esteso con HRV/RHR OPZIONALI quando un
        dispositivo reale li fornisce (oggi non ancora in modalità reale,
        vedi 05_HomeDashboard.jsx — "RHR e HRV in arrivo"), così la stessa
        funzione è già pronta a incorporarli il giorno in cui arriveranno,
        senza inventare nulla nel frattempo.
     3. computeBMR / estimateStepEnergyKcal / computeEnergyExpenditure —
        dispendio energetico stimato: metabolismo basale (Mifflin-St Jeor,
        la formula con il miglior accordo empirico rispetto alla calorimetria
        indiretta nella popolazione generale, oggi lo standard evidence-based
        al posto della più vecchia Harris-Benedict) + calorie attive stimate
        dai passi.
   ========================================================================== */

/* ----------------------------------------------------------------------
   1. SOGLIE E CURVA A SEMAFORO
   ---------------------------------------------------------------------- */

/* Soglie dei colori delle candele: modificabili dalla console del coach.
   invert:true = valori più bassi sono migliori (es. RHR: meno battiti a riposo
   è meglio), quindi "bad" è il limite superiore da non superare. */
export const THRESH = {
  sleep: { bad: 6,    mid: 7.5,   fmt: (v) => `${v.toFixed(1)}h`, gridStep: 2 },
  steps: { bad: 8000, mid: 10000, fmt: (v) => `${(v / 1000).toFixed(1)}k`, gridStep: 5000 },
  hrv:   { bad: 40,   mid: 60,    fmt: (v) => `${Math.round(v)}ms`, gridStep: 20 },
  rhr:   { bad: 75,   mid: 65,    fmt: (v) => `${Math.round(v)}bpm`, invert: true, gridStep: 20 },
};

// Colore continuo (stessa curva a semaforo dei cerchi di compliance,
// complianceHsl in coachingData.js) invece dei 3 blocchi netti rosso/
// arancio/verde: una progressione fluida rosso acceso → rosso spento →
// arancio → arancio chiaro → giallo → verde → verde acceso man mano che il
// valore sale. Per rhr (invert: più basso è meglio) la scala è specchiata.
export function chart3dPct(kind, v) {
  const t = THRESH[kind];
  if (t.invert) {
    if (v >= t.bad) return 0;
    if (v >= t.mid) return 55 * (t.bad - v) / (t.bad - t.mid || 1);
    const span = t.mid * 0.4 || 1;
    return Math.min(100, 55 + 45 * Math.min(1, (t.mid - v) / span));
  }
  if (v <= 0) return 0;
  if (v < t.bad) return 55 * (v / t.bad);
  if (v < t.mid) return 55 + 30 * (v - t.bad) / (t.mid - t.bad || 1);
  const span = t.mid * 0.3 || 1;
  return Math.min(100, 85 + 15 * Math.min(1, (v - t.mid) / span));
}

export const CANDLE = {
  bad:  { top: "#F87171", mid: "#EF4444", dark: "#B91C1C", label: "#DC2626" },
  warn: { top: "#FBBF24", mid: "#F0A020", dark: "#B45309", label: "#B45309" },
  good: { top: "#34D399", mid: "#10B981", dark: "#047857", label: "#10B981" },
};

export const grade = (kind, v) => {
  const t = THRESH[kind];
  return t.invert
    ? (v >= t.bad ? "bad" : v >= t.mid ? "warn" : "good")
    : (v < t.bad ? "bad" : v < t.mid ? "warn" : "good");
};

/* ----------------------------------------------------------------------
   2. PUNTEGGIO DI PRONTEZZA — sonno, passi, motivazione, fatica, e ora
   opzionalmente HRV/RHR quando un dispositivo reale li misura, sintetizzati
   in UN numero azionabile (0-100), invece di valori separati da leggere e
   interpretare da soli. Stessa curva a semaforo di chart3dPct qui sopra
   (mai una media grezza lineare): un valore appena sopra soglia pesa già
   molto di più di uno appena sotto.

   Ogni componente entra nel punteggio SOLO se il dato esiste davvero per
   oggi — mai un fallback che finge un valore non registrato. Se non c'è
   nessun dato, ritorna null: il chiamante decide come mostrare "dati
   insufficienti".

   HRV/RHR: passali SOLO quando provengono davvero da un sensore (mai un
   valore demo/placeholder) — il chiamante è responsabile di questo confine,
   la funzione si limita a includerli se presenti. Oggi (settembre 2026)
   nessun piano ha ancora un device HRV/RHR collegato in modalità reale
   (vedi 05_HomeDashboard.jsx, sezione Recupero): i parametri esistono già
   perché il calcolo sia corretto dal primo giorno in cui un'integrazione
   reale (smartwatch/anello) arriverà, senza dover ritoccare la formula.

   Dolore e stress non sono giornalieri (arrivano solo dal check
   settimanale/mensile in checkins), quindi entrano come una PENALITÀ
   separata dal punteggio principale, che decade nei 7 giorni successivi
   alla registrazione invece di continuare a pesare per sempre — un dolore
   segnalato ieri conta più di uno segnalato 6 giorni fa. */
export function computeReadinessScore({ sleepHours, steps, hrv, rhr, motivation, fatigue, recentSensations }) {
  const parts = [];
  if (sleepHours != null && sleepHours > 0) parts.push({ key: "sleep", pct: chart3dPct("sleep", sleepHours), label: "Sonno" });
  if (steps != null && steps > 0) parts.push({ key: "steps", pct: chart3dPct("steps", steps), label: "Passi" });
  if (hrv != null && hrv > 0) parts.push({ key: "hrv", pct: chart3dPct("hrv", hrv), label: "HRV" });
  if (rhr != null && rhr > 0) parts.push({ key: "rhr", pct: chart3dPct("rhr", rhr), label: "RHR" });
  if (motivation) parts.push({ key: "motivation", pct: (motivation / 10) * 100, label: "Motivazione" });
  // fatigue: 1 = nessuna fatica (meglio), 10 = massima fatica (peggio) — scala invertita.
  if (fatigue) parts.push({ key: "fatigue", pct: ((11 - fatigue) / 10) * 100, label: "Fatica" });

  if (parts.length === 0) return null;

  let score = parts.reduce((s, p) => s + p.pct, 0) / parts.length;

  let penalty = 0;
  const { pain, stress, daysAgo } = recentSensations || {};
  if (daysAgo != null && daysAgo <= 7) {
    const decay = 1 - daysAgo / 7;
    if (pain != null && pain >= 3) penalty += (pain >= 6 ? 22 : pain >= 4 ? 14 : 7) * decay;
    if (stress != null && stress >= 7) penalty += 10 * decay;
  }
  score = Math.max(0, Math.min(100, Math.round(score - penalty)));

  const lowest = [...parts].sort((a, b) => a.pct - b.pct)[0];
  // Soglie allineate a quelle dell'etichetta qui sotto (mai un colore che
  // dice una cosa e un testo che ne dice un'altra): verde da "buona" in su,
  // ambra per "media"/"bassa", rosso solo sotto "bassa".
  const tone = score >= 65 ? "good" : score >= 30 ? "warn" : "bad";
  const label = score >= 80 ? "Prontezza ottima" : score >= 65 ? "Prontezza buona"
    : score >= 50 ? "Prontezza nella media" : score >= 30 ? "Prontezza bassa" : "Prontezza molto bassa";

  return { score, tone, label, parts, lowest, penaltyApplied: penalty > 0.5 };
}

/* ----------------------------------------------------------------------
   3. DISPENDIO ENERGETICO — metabolismo basale + calorie attive dai passi
   ---------------------------------------------------------------------- */

/* Metabolismo basale (BMR), formula di Mifflin-St Jeor (1990) — oggi lo
   standard evidence-based più accurato per la popolazione generale rispetto
   alla più datata Harris-Benedict (revisione sistematica: Frankenfield et
   al. 2005, J Am Diet Assoc). Richiede peso/altezza/età/sesso REALI: nessun
   valore di default se manca un dato, mai un BMR calcolato "a occhio". */
export function computeBMR({ weightKg, heightCm, age, gender }) {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0) || (gender !== "M" && gender !== "F")) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "M" ? base + 5 : base - 161);
}

// Calorie attive stimate dai passi: approssimazione basata su equivalente
// metabolico del cammino (~3.5 MET) a passo medio (~110 passi/min) — stessa
// famiglia di stima già usata per il sonno REM altrove nell'app (una stima
// dichiarata, non una misura di precisione): kcal/min = MET × 3.5 ×
// pesoKg / 200; diviso per la cadenza media si ottiene un coefficiente per
// singolo passo, proporzionale al peso corporeo (chi pesa di più consuma di
// più a parità di passi). Per un adulto di 70 kg equivale a circa 350-400
// kcal ogni 10.000 passi, in linea con le stime di sanità pubblica più
// citate (~0.04-0.05 kcal/passo per un peso medio).
const STEP_KCAL_PER_STEP_PER_KG = 0.00057;

export function estimateStepEnergyKcal({ steps, weightKg }) {
  if (!(weightKg > 0) || steps == null || steps < 0) return null;
  return Math.round(steps * weightKg * STEP_KCAL_PER_STEP_PER_KG);
}

/* Dispendio energetico totale stimato di oggi: metabolismo basale + calorie
   attive dai passi (esplicitamente quello richiesto — NON un TDEE completo:
   non include NEAT non legato al cammino, allenamento coi pesi, o l'effetto
   termico del cibo, che restano fuori da questa stima). `missing` elenca
   sempre cosa manca per un calcolo completo, mai un numero parziale
   spacciato per totale — se manca anche solo un dato tra peso/altezza/età/
   sesso il BMR è null e lo dice esplicitamente, non lo stima "a occhio". */
export function computeEnergyExpenditure({ weightKg, heightCm, age, gender, steps }) {
  const missing = [];
  if (!(weightKg > 0)) missing.push("weightKg");
  if (!(heightCm > 0)) missing.push("heightCm");
  if (!(age > 0)) missing.push("age");
  if (gender !== "M" && gender !== "F") missing.push("gender");
  if (steps == null || steps < 0) missing.push("steps");

  const bmr = missing.some((k) => k !== "steps") ? null : computeBMR({ weightKg, heightCm, age, gender });
  const activeKcal = missing.includes("weightKg") || missing.includes("steps")
    ? null
    : estimateStepEnergyKcal({ steps, weightKg });
  const total = bmr != null && activeKcal != null ? bmr + activeKcal : null;

  return { bmr, activeKcal, total, complete: missing.length === 0, missing };
}
