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
     4. computeAgeFromBirthDate — l'anamnesi (AnamnesisShared.jsx) chiede la
        DATA di nascita ("nascita", input type=date), non un numero di anni
        già pronto: età va sempre calcolata da qui, mai letta da un campo
        "eta" che l'anamnesi non scrive.
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
// L'anamnesi (AnamnesisShared.jsx) chiede la DATA di nascita, non gli anni
// già contati — età va sempre derivata da qui. Calcolo esatto (non solo
// differenza fra anni): tiene conto del compleanno non ancora arrivato
// quest'anno, altrimenti chi è nato a dicembre risulterebbe più vecchio di
// un anno per gran parte dell'anno. Data non valida/assente → null, mai
// un'età a caso.
export function computeAgeFromBirthDate(birthDateIso) {
  if (!birthDateIso) return null;
  const birth = new Date(`${birthDateIso}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear = now.getMonth() > birth.getMonth()
    || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age > 0 && age < 130 ? age : null;
}

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

/* ----------------------------------------------------------------------
   4. DIGITAL TWIN — motore di predizione del sovraccarico (overreaching)
   ---------------------------------------------------------------------- */

/* Confronta gli ultimi giorni (RECENT_WINDOW) con un basale personale
   calcolato sui giorni precedenti (BASELINE_MIN_DAYS), sugli stessi 3
   marcatori usati dalla letteratura di monitoraggio del carico per
   individuare il sovraccarico non funzionale prima che diventi infortunio/
   malattia/calo di rendimento:

   - HRV: un calo sostenuto (≥3 giorni) di oltre il 10% sotto il proprio
     basale a rolling window è il segnale più citato di soppressione
     parasimpatica da accumulo di fatica (Plews et al. 2013, "Heart rate
     variability and training intensity distribution in elite rowers";
     Buchheit M. 2014, "Monitoring training status with HR measures:
     do all roads lead to Rome?", Front Physiol).
   - RHR: un rialzo sostenuto di almeno 5 bpm sopra il basale è un
     marcatore precoce classico di overreaching (Bourdon PC et al. 2017,
     consensus statement IJSPP "Monitoring Athlete Training Loads").
   - Sonno: una media recente sotto le 6h (debito di sonno cronico) altera
     il recupero neuromuscolare e ormonale (letteratura consolidata su
     restrizione di sonno e prestazione/recupero sportivo).

   Ogni marcatore entra SOLO se i dati esistono davvero per abbastanza
   giorni (mai un basale calcolato su 1-2 punti) — con dati insufficienti
   la funzione ritorna null, mai un alert inventato. */
const RECENT_WINDOW = 3;
const BASELINE_MIN_DAYS = 7;
const HRV_DROP_PCT = 0.10;
const RHR_RISE_BPM = 5;
const SLEEP_DEBT_HOURS = 6;

function meanOf(values) {
  const valid = values.filter((v) => v != null && v > 0);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// days: array ordinato dal più vecchio al più recente, ciascuno
// { sleepHours, hrv, rhr } — null/assente dove il dato non è mai stato
// registrato. Servono almeno RECENT_WINDOW + BASELINE_MIN_DAYS giorni
// totali perché il confronto basale-vs-recente sia statisticamente
// sensato, non un rumore di 2-3 punti.
export function computeOverreachAlert(days) {
  if (!Array.isArray(days) || days.length < RECENT_WINDOW + BASELINE_MIN_DAYS) return null;

  const recent = days.slice(-RECENT_WINDOW);
  const baseline = days.slice(-(RECENT_WINDOW + BASELINE_MIN_DAYS), -RECENT_WINDOW);

  const flags = [];

  const hrvBaseline = meanOf(baseline.map((d) => d.hrv));
  const hrvRecent = meanOf(recent.map((d) => d.hrv));
  if (hrvBaseline != null && hrvRecent != null) {
    const dropPct = (hrvBaseline - hrvRecent) / hrvBaseline;
    if (dropPct >= HRV_DROP_PCT) {
      flags.push({
        key: "hrv", severity: dropPct >= HRV_DROP_PCT * 2 ? "high" : "watch",
        message: `HRV in calo del ${Math.round(dropPct * 100)}% rispetto al tuo basale — segnale di sistema nervoso sotto stress da accumulo di fatica.`,
      });
    }
  }

  const rhrBaseline = meanOf(baseline.map((d) => d.rhr));
  const rhrRecent = meanOf(recent.map((d) => d.rhr));
  if (rhrBaseline != null && rhrRecent != null) {
    const riseBpm = rhrRecent - rhrBaseline;
    if (riseBpm >= RHR_RISE_BPM) {
      flags.push({
        key: "rhr", severity: riseBpm >= RHR_RISE_BPM * 2 ? "high" : "watch",
        message: `Frequenza cardiaca a riposo di +${Math.round(riseBpm)} bpm sopra il tuo basale — il corpo non si sta riprendendo del tutto tra una sessione e l'altra.`,
      });
    }
  }

  const sleepRecent = meanOf(recent.map((d) => d.sleepHours));
  if (sleepRecent != null && sleepRecent < SLEEP_DEBT_HOURS) {
    flags.push({
      key: "sleep", severity: sleepRecent < SLEEP_DEBT_HOURS - 1.5 ? "high" : "watch",
      message: `Solo ${sleepRecent.toFixed(1)}h di sonno medio negli ultimi ${RECENT_WINDOW} giorni — il recupero neuromuscolare ne risente prima ancora che tu lo senta in palestra.`,
    });
  }

  if (flags.length === 0) return { level: "none", flags: [], suggestion: null };

  const level = flags.some((f) => f.severity === "high") ? "high" : "watch";
  // Suggerimento azionabile, non solo un allarme: stessa logica di
  // autoregolazione del volume già standard nella periodizzazione
  // evidence-based (Helms ER et al., "The Muscle and Strength Pyramid").
  const suggestion = level === "high"
    ? "Riduci il volume di allenamento del 30-40% questa settimana (meno serie per gruppo muscolare, stesso peso) o inserisci un giorno di riposo extra — più di un marcatore indica un sovraccarico reale, non solo stanchezza normale."
    : "Considera di ridurre leggermente il volume (10-20% in meno di serie) o l'intensità nelle prossime sessioni finché i valori non tornano al tuo basale.";

  return { level, flags, suggestion };
}
