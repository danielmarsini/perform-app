/* ============================================================================
   coachingData.js — livello dati reale, coerente 1:1 con lo schema SQL v11 + v12
   ----------------------------------------------------------------------------
   Nessuna query qui indovina nomi di colonne: ogni campo corrisponde esattamente
   a quanto definito in nutrition_targets, workout_logs, profiles.
   ----------------------------------------------------------------------------
   CONVENZIONE — OGNI NUOVO PULSANTE "AZIONE" (§03 memo "Verso l'élite",
   Fiducia attraverso la correttezza): questa sessione ha già trovato e
   corretto più volte lo stesso difetto — un pulsante che sembrava aver
   salvato ma non aveva scritto nulla su Supabase (spunte integratori che
   sparivano, "copia i pasti di ieri" che non copiava, onUpgrade/onOpenChat
   collegati a un no-op). Per un servizio a pagamento su dati di salute,
   "il mio dato è stato salvato davvero?" non può mai restare un dubbio.
   Ogni funzione qui sotto che scrive (insert/update/upsert/delete) e ogni
   pulsante che la chiama deve seguire le stesse 3 regole:
     1. UI ottimistica: lo stato locale si aggiorna SUBITO al tocco, mai
        un giro di attesa prima di vedere l'effetto.
     2. Conferma reale: la funzione fa await sulla vera scrittura Supabase
        e propaga l'errore (throw), mai un successo silenzioso finto.
     3. Stato di errore visibile: il chiamante ha SEMPRE un catch che
        mostra un messaggio all'utente E riporta lo stato locale a quello
        precedente se la scrittura è fallita — mai un pulsante che resta
        "spuntato" mentre il database dice il contrario.
   Esempi già conformi da cui copiare il pattern: ChatThread.jsx (invio
   messaggio), SupplementsPlanLocked (05_HomeDashboard.jsx, spunta
   integratore). Mai aggiungere un pulsante "azione" senza tutte e 3.
   ========================================================================== */

const MUSCLE_TARGETS = [
  "Pettorali", "Gran Dorsale", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];

/* ---------------------------------------------------------------------------
   LIBRERIA ESERCIZI CONDIVISA — spostata qui da 09_CoachDashboard.jsx così
   sia il pannello coach SIA la Home del cliente (05_HomeDashboard.jsx)
   calcolano il volume settimanale con la STESSA identica logica. Prima
   erano due sistemi scollegati: il coach leggeva questa mappa, il cliente
   indovinava il gruppo muscolare con un regex sul nome — spesso sbagliato,
   e un cliente vedeva un volume diverso da quello che il coach aveva
   davvero impostato. MAI PIÙ due fonti di verità per lo stesso calcolo.
   ------------------------------------------------------------------------- */

// Nomi brevi per il grafico volumi (Petto, Dorsali, Deltoide Ant/Lat/Post,
// Addominali...) — MUSCLE_TARGETS sopra è il check constraint reale di
// workout_logs.muscle_target, con nomi estesi diversi in 6 casi su 14.
const MUSCLES = ["Petto", "Trapezio", "Dorsali", "Deltoide Ant", "Deltoide Lat", "Deltoide Post", "Bicipiti", "Tricipiti", "Quadricipiti", "Femorali", "Adduttori", "Glutei", "Polpacci", "Addominali"];

const DEFAULT_EXERCISE_LIB = {
  "Panca piana bilanciere": { direct: ["Petto"], indirect: ["Tricipiti", "Deltoide Ant"] },
  "Lento avanti manubri": { direct: ["Deltoide Ant"], indirect: ["Deltoide Lat", "Tricipiti"] },
  "Croci ai cavi": { direct: ["Petto"], indirect: ["Deltoide Ant"] },
  "French press EZ": { direct: ["Tricipiti"], indirect: [] },
  "Alzate laterali": { direct: ["Deltoide Lat"], indirect: [] },
  "Lat machine": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post"] },
  "Rematore bilanciere": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post", "Trapezio"] },
  "Face pull ai cavi": { direct: ["Deltoide Post"], indirect: ["Dorsali", "Trapezio"] },
  "Scrollate con bilanciere": { direct: ["Trapezio"], indirect: [] },
  "Curl bilanciere": { direct: ["Bicipiti"], indirect: [] },
  "Squat bilanciere": { direct: ["Quadricipiti"], indirect: ["Glutei"] },
  "Leg extension": { direct: ["Quadricipiti"], indirect: [] },
  "Stacco rumeno bilanciere": { direct: ["Femorali"], indirect: ["Glutei"] },
  "Hip thrust bilanciere": { direct: ["Glutei"], indirect: ["Femorali"] },
  "Leg curl sdraiato": { direct: ["Femorali"], indirect: [] },
  "Adductor machine": { direct: ["Adduttori"], indirect: [] },
  "Calf in piedi": { direct: ["Polpacci"], indirect: [] },
  "Crunch ai cavi": { direct: ["Addominali"], indirect: [] },
  "Plank": { direct: ["Addominali"], indirect: [] },
};

const EXERCISE_LIB_MUSCLE_TO_DB = {
  "Petto": "Pettorali",
  "Dorsali": "Gran Dorsale",
  "Deltoide Ant": "Deltoide Anteriore",
  "Deltoide Lat": "Deltoide Laterale",
  "Deltoide Post": "Deltoide Posteriore",
  "Addominali": "Addome",
  // Gli altri 8 nomi coincidono già: Trapezio, Bicipiti, Tricipiti,
  // Quadricipiti, Femorali, Adduttori, Glutei, Polpacci.
};
// Inverso della mappa sopra: riporta il muscle_target (nome DB, esteso)
// scelto per un esercizio CUSTOM al nome breve usato da MUSCLES/computeVolume.
const DB_MUSCLE_TO_CHART = Object.fromEntries(
  Object.entries(EXERCISE_LIB_MUSCLE_TO_DB).map(([chart, db]) => [db, chart])
);

function resolveMuscleTarget(exerciseName, lib) {
  const libMuscle = (lib || DEFAULT_EXERCISE_LIB)[exerciseName]?.direct?.[0];
  if (!libMuscle) return null;
  return EXERCISE_LIB_MUSCLE_TO_DB[libMuscle] || libMuscle;
}

// Libreria collettiva reale (SCHEMA_v39): parte da DEFAULT_EXERCISE_LIB e la
// estende con ogni esercizio custom che coach o clienti Premium hanno già
// registrato in passato — mai più ridigitare muscoli target già scelti per
// lo stesso esercizio. Ordinata alfabeticamente per il menu a tendina.
async function fetchExerciseLibrary(supabase) {
  const lib = { ...DEFAULT_EXERCISE_LIB };
  const { data, error } = await supabase.from("exercise_library").select("name, direct, indirect, how_to, avoid, video_url");
  if (error) { console.error("PERFORM: errore lettura libreria esercizi", error); return lib; }
  (data ?? []).forEach((row) => {
    lib[row.name] = { direct: row.direct ?? [], indirect: row.indirect ?? [],
      howTo: row.how_to || null, avoid: row.avoid || null, videoUrl: row.video_url || null };
  });
  return lib;
}

// on conflict do nothing: una voce già presente non va mai sovrascritta da
// un secondo inserimento — il primo che l'ha definita resta quello valido.
async function learnExercise(supabase, name, direct, indirect, userId) {
  if (!name?.trim() || !direct?.length) return;
  const { error } = await supabase.from("exercise_library")
    .insert({ name: name.trim(), direct, indirect: indirect || [], created_by: userId || null })
    .select().maybeSingle();
  if (error && error.code !== "23505") console.error("PERFORM: errore salvataggio esercizio in libreria", error); // 23505 = già esiste, atteso e ok
}

// SCHEMA_v61: a differenza di learnExercise (insert-only, mai sovrascrive),
// questa è la scrittura editoriale del coach — how_to/avoid/video_url
// SOSTITUISCONO il valore precedente per lo stesso esercizio (upsert su
// name), riutilizzabili subito da qualunque cliente dell'app. La RLS lato
// server ("exercise_library_update", SCHEMA_v61) accetta la scrittura solo
// se chi chiama è davvero il coach: un cliente che invocasse questa
// funzione otterrebbe comunque un errore di permessi, questo controllo qui
// è solo per non tentare la chiamata da una UI che non dovrebbe esporla.
async function saveExerciseGuide(supabase, name, direct, indirect, { howTo, avoid, videoUrl }, coachId) {
  if (!name?.trim() || !direct?.length) return;
  const { error } = await supabase.from("exercise_library")
    .upsert({ name: name.trim(), direct, indirect: indirect || [],
      how_to: howTo || null, avoid: avoid || null, video_url: videoUrl || null,
      created_by: coachId || null }, { onConflict: "name" })
    .select().maybeSingle();
  if (error) console.error("PERFORM: errore salvataggio guida esercizio", error);
}

// Serie dirette 100% + serie sui sinergici 50%, per gruppo muscolare —
// STESSA funzione per il pannello coach e per la Home del cliente.
function computeVolume(dayList, lib) {
  const activeLib = lib || DEFAULT_EXERCISE_LIB;
  const vol = {}; MUSCLES.forEach((m) => (vol[m] = { direct: 0, indirect: 0 }));
  const addSets = (muscle, amount, isDirect) => {
    if (!vol[muscle]) return; // nome non riconosciuto: ignorato invece di far crashare il grafico
    vol[muscle][isDirect ? "direct" : "indirect"] += amount;
  };
  (dayList || []).filter(Boolean).forEach((day) => {
    (day.exercises || []).forEach((ex) => {
      const sets = Number(ex.sets) || 0;
      const entry = activeLib[ex.name];
      if (entry) {
        entry.direct.forEach((m) => addSets(m, sets, true));
        entry.indirect.forEach((m) => addSets(m, sets * 0.5, false));
        return;
      }
      // Esercizio custom non ancora in libreria: usa il distretto + sinergici
      // scelti a mano. muscleTarget (editor coach) e targetMuscle (editor
      // libero Free/Premium in 05_HomeDashboard.jsx) sono lo stesso concetto
      // con due nomi di campo diversi — entrambi accettati qui, mai un
      // grafico vuoto solo per una differenza di naming tra i due editor.
      const manualTarget = ex.muscleTarget || ex.targetMuscle;
      if (!manualTarget) return;
      addSets(DB_MUSCLE_TO_CHART[manualTarget] || manualTarget, sets, true);
      (ex.synergists || []).forEach((m) => addSets(DB_MUSCLE_TO_CHART[m] || m, sets * 0.5, false));
    });
  });
  return vol;
}

// Data (o "oggi") in formato YYYY-MM-DD LOCALE, mai da toISOString() — che
// converte sempre in UTC e sposta la data di un giorno indietro per chiunque
// sia in un fuso orario positivo (Italia inclusa) nelle ore vicine alla
// mezzanotte locale. Stessa funzione (stesso nome) di 05_HomeDashboard.jsx:
// duplicata qui invece di condivisa via import per non introdurre un
// accoppiamento nuovo tra i due moduli solo per un helper di 5 righe.
function toLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------------------
   LETTURA — lato cliente (Home)
   ------------------------------------------------------------------------- */

// Target macro/kcal attivi oggi per un giorno ON o OFF: la riga più recente
// con effective_from <= oggi. Ritorna null se il coach non ha ancora assegnato nulla.
export async function fetchActiveNutritionTarget(supabase, userId, dayType) {
  const today = toLocalISODate();
  const { data, error } = await supabase
    .from("nutrition_targets")
    .select("kcal, protein, carbs, fat, effective_from")
    .eq("user_id", userId)
    .eq("day_type", dayType)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { kcal: Number(data.kcal), p: Number(data.protein), c: Number(data.carbs), f: Number(data.fat) };
}

export async function fetchBothNutritionTargets(supabase, userId) {
  const [on, off] = await Promise.all([
    fetchActiveNutritionTarget(supabase, userId, "on"),
    fetchActiveNutritionTarget(supabase, userId, "off"),
  ]);
  return { targetOn: on, targetOff: off };
}

// Sonno/passi reali di un intervallo di date (daily_metrics), un giorno = una
// riga. Righe mancanti restano assenti nell'array: il chiamante decide come
// trattare un giorno mai registrato (di norma 0, "non tracciato" — MAI un
// valore inventato).
export async function fetchDailyMetricsRange(supabase, userId, fromDateISO, toDateISO) {
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date, sleep_start, sleep_end, sleep_hours, steps, hrv_ms, rhr_bpm, digestion, motivation, fatigue")
    .eq("user_id", userId)
    .gte("date", fromDateISO)
    .lte("date", toDateISO)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Scrive (o aggiorna) sonno/passi di UN giorno specifico. Upsert su
// (user_id, date): riaprire la Home lo stesso giorno e correggere un valore
// aggiorna la stessa riga, non ne crea una seconda. `patch` è parziale: passa
// solo i campi che stai scrivendo in questo momento (es. solo `steps`),
// quelli assenti restano quello che erano già nella riga — perché l'upsert è
// su tutta la riga, il chiamante deve unire lo stato precedente col nuovo
// prima di chiamare questa funzione se vuole preservare un campo che non sta
// toccando ora (stesso principio già usato per saveAnamnesis).
export async function upsertDailyMetrics(supabase, userId, dateISO, patch) {
  const { error } = await supabase
    .from("daily_metrics")
    .upsert({ user_id: userId, date: dateISO, updated_at: new Date().toISOString(), ...patch }, { onConflict: "user_id,date" });
  if (error) throw error;
}

// Le 3 valutazioni soggettive 1-10 di "oggi" (digestione, motivazione, fatica
// percepita — SCHEMA_v57, stessa riga daily_metrics di sonno/passi): lettura
// leggera di UN solo giorno, per idratare i tre riquadri (Alimentazione a
// fine Diario Libero, Allenamento a fine sessione) senza dover caricare
// l'intero storico. null = non ancora valutato oggi, mai un valore inventato.
export async function fetchTodayWellness(supabase, userId, dateISO) {
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("digestion, motivation, fatigue")
    .eq("user_id", userId)
    .eq("date", dateISO)
    .maybeSingle();
  if (error) throw error;
  return data ?? { digestion: null, motivation: null, fatigue: null };
}

// Cerchio Recupero reale — STESSA funzione chiamata sia da Home cliente sia
// da ClientDetail (coach), come computeTrainingCompliance qui sopra: legge
// SOLO daily_metrics già salvato (mai stato locale non ancora scritto), così
// il numero è identico ovunque venga calcolato, non un mix di dato live +
// storico persistito.
//
// Media dei 7 giorni più recenti (oggi incluso) di SOLO passi e sonno — non
// il dolore (nessun check-in reale collegato ancora) e non HRV/RHR (nessuna
// fonte reale finché non c'è un device collegato: colonne già pronte in
// daily_metrics, semplicemente vuote). Soglie: 7h di sonno e 8.000 passi =
// punteggio pieno per quel giorno, lineare sotto soglia. Un giorno non
// tracciato vale 0, quindi già pesa come "non hai recuperato bene" senza
// bisogno di una penalità di frequenza a parte. Se TUTTI e 7 i giorni sono
// completamente vuoti, torna null — stato neutro esplicito, mai uno 0% che
// sembra un allarme.
function recoverySleepScore(hours) {
  if (!hours || hours <= 0) return 0;
  return Math.min(100, Math.round((hours / 7) * 100));
}
function recoveryStepsScore(steps) {
  if (!steps || steps <= 0) return 0;
  return Math.min(100, Math.round((steps / 8000) * 100));
}
export async function computeRecoveryCompliance(supabase, userId) {
  const today = toLocalISODate();
  const sevenAgo = new Date(`${today}T00:00:00`);
  sevenAgo.setDate(sevenAgo.getDate() - 6);
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date, sleep_hours, steps")
    .eq("user_id", userId)
    .gte("date", toLocalISODate(sevenAgo))
    .lte("date", today);
  if (error) throw error;

  const byDate = new Map((data ?? []).map((r) => [r.date, r]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenAgo);
    d.setDate(d.getDate() + i);
    return toLocalISODate(d);
  });
  const sleepVals = days.map((d) => Number(byDate.get(d)?.sleep_hours) || 0);
  const stepsVals = days.map((d) => Number(byDate.get(d)?.steps) || 0);

  const allUntracked = sleepVals.every((h) => !h) && stepsVals.every((s) => !s);
  if (allUntracked) return { status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0 };

  const total = sleepVals.reduce((sum, h, i) => sum + (recoverySleepScore(h) + recoveryStepsScore(stepsVals[i])) / 2, 0);
  const pct = Math.max(0, Math.min(100, Math.round(total / 7)));
  const trackedDays = sleepVals.filter((h) => h > 0).length;
  const sleepAvg = Math.round((sleepVals.reduce((a, b) => a + b, 0) / 7) * 10) / 10;
  const stepsAvg = Math.round(stepsVals.reduce((a, b) => a + b, 0) / 7);
  return { status: "ok", pct, sleepAvg, stepsAvg, trackedDays };
}

// Diario pasti reale di UN giorno, per il "Diario Libero" della Home.
export async function fetchNutritionLogsForDate(supabase, userId, dateISO) {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("id, meal_slot, name, grams, kcal, protein, carbs, fat, created_at")
    .eq("user_id", userId)
    .eq("date", dateISO)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Storico completo del diario alimentare in un intervallo di date — a
// differenza di fetchNutritionLogsForDate (un solo giorno), serve
// all'esportazione dati del cliente (§03 "Fiducia attraverso la
// correttezza": può portarsi via tutto quello che ha registrato, non solo
// profilo e consensi).
export async function fetchAllNutritionLogsForExport(supabase, userId, fromISO, toISO) {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("date, meal_slot, name, grams, kcal, protein, carbs, fat")
    .eq("user_id", userId)
    .gte("date", fromISO)
    .lte("date", toISO)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Aggiunge UN alimento a un pasto in una data. `item` = {name, grams, kcal,
// p, c, f} — stessa forma già usata lato client per il preview del food.
export async function addNutritionLogItem(supabase, userId, dateISO, mealSlot, item) {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .insert({
      user_id: userId, date: dateISO, meal_slot: mealSlot,
      name: item.name, grams: item.grams ?? null,
      kcal: item.kcal || 0, protein: item.p || 0, carbs: item.c || 0, fat: item.f || 0,
    })
    .select("id, meal_slot, name, grams, kcal, protein, carbs, fat, created_at")
    .single();
  if (error) throw error;
  return data;
}

// Rimuove UN alimento aggiunto per errore — l'unico modo per "correggere" un
// pasto sbagliato oggi era ricominciare tutto il diario: questo lo risolve.
export async function removeNutritionLogItem(supabase, logId) {
  const { error } = await supabase.from("nutrition_logs").delete().eq("id", logId);
  if (error) throw error;
}

// Corregge la quantità (grammi + macro già riscalate dal chiamante, vedi
// scaleFoodItem in 05_HomeDashboard.jsx) di UN alimento già nel diario —
// prima l'unico modo per cambiare una quantità sbagliata o rivista era
// cancellare la riga e ricercare/reinserire tutto da capo.
export async function updateNutritionLogItem(supabase, logId, patch) {
  const { error } = await supabase.from("nutrition_logs").update({
    grams: patch.grams, kcal: patch.kcal, protein: patch.p, carbs: patch.c, fat: patch.f,
  }).eq("id", logId);
  if (error) throw error;
}

// Cerchio Alimentazione reale — STESSO principio di computeTrainingCompliance
// e computeRecoveryCompliance: un'unica funzione, chiamata identica da Home
// cliente e ClientDetail coach, legge solo dati già salvati (nutrition_logs
// + nutrition_targets), mai stato locale del form.
//
// Per ciascuno degli ultimi 7 giorni: somma kcal/P/C/G registrati quel
// giorno (nutrition_logs) e li confronta col target attivo per quel giorno
// (nutrition_targets, effective_from <= quel giorno). Il tipo di giorno
// (ON/OFF) non è salvato da nessuna parte per una data passata: lo si deduce
// dalla presenza di workout_logs in quella data (giorno con allenamento
// assegnato = ON, altrimenti OFF) — stesso segnale che l'app usa già altrove
// per distinguere le due schede.
// Scostamento simmetrico: sia sotto sia sopra target penalizzano allo stesso
// modo (mai punteggio pieno solo perché si è mangiato meno). Un giorno senza
// alcuna registrazione vale 0 (non "va bene", un buco nel diario è un buco).
// Se in NESSUno dei 7 giorni c'è un target attivo (il coach non ha ancora
// assegnato nulla), torna neutro esplicito.
export function dayNutritionScore(logsTotals, target) {
  if (!target) return null; // nessun target attivo quel giorno: non giudicabile
  const dims = ["kcal", "p", "c", "f"];
  const devs = dims.map((d) => (target[d] > 0 ? Math.min(1, Math.abs(logsTotals[d] - target[d]) / target[d]) : 0));
  return Math.max(0, Math.min(100, Math.round((1 - devs.reduce((a, b) => a + b, 0) / dims.length) * 100)));
}
export async function computeNutritionCompliance(supabase, userId) {
  const today = toLocalISODate();
  const sevenAgo = new Date(`${today}T00:00:00`);
  sevenAgo.setDate(sevenAgo.getDate() - 6);
  const fromISO = toLocalISODate(sevenAgo);

  const [{ data: logs, error: logsError }, { data: targets, error: targetsError }, { data: workouts, error: workoutsError }] = await Promise.all([
    supabase.from("nutrition_logs").select("date, kcal, protein, carbs, fat").eq("user_id", userId).gte("date", fromISO).lte("date", today),
    supabase.from("nutrition_targets").select("day_type, kcal, protein, carbs, fat, effective_from").eq("user_id", userId).lte("effective_from", today).order("effective_from", { ascending: true }),
    supabase.from("workout_logs").select("date").eq("user_id", userId).gte("date", fromISO).lte("date", today),
  ]);
  if (logsError) throw logsError;
  if (targetsError) throw targetsError;
  if (workoutsError) throw workoutsError;

  const trainingDates = new Set((workouts ?? []).map((w) => w.date));
  // Per ogni day_type, il target con effective_from più recente <= quella data.
  const targetFor = (dateISO, dayType) => {
    const rows = (targets ?? []).filter((t) => t.day_type === dayType && t.effective_from <= dateISO);
    if (rows.length === 0) return null;
    const latest = rows[rows.length - 1]; // già ordinati ascending per effective_from
    return { kcal: Number(latest.kcal), p: Number(latest.protein), c: Number(latest.carbs), f: Number(latest.fat) };
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenAgo);
    d.setDate(d.getDate() + i);
    return toLocalISODate(d);
  });

  const scores = [];
  let anyTarget = false;
  days.forEach((dateISO) => {
    const dayType = trainingDates.has(dateISO) ? "on" : "off";
    const target = targetFor(dateISO, dayType);
    if (!target) return; // giorno non giudicabile, non entra nella media
    anyTarget = true;
    const dayLogs = (logs ?? []).filter((l) => l.date === dateISO);
    const totals = dayLogs.reduce((a, l) => ({
      kcal: a.kcal + Number(l.kcal), p: a.p + Number(l.protein), c: a.c + Number(l.carbs), f: a.f + Number(l.fat),
    }), { kcal: 0, p: 0, c: 0, f: 0 });
    scores.push(dayNutritionScore(totals, target));
  });

  if (!anyTarget || scores.length === 0) {
    return { status: "neutral", pct: null, daysScored: 0 };
  }
  const pct = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { status: "ok", pct, daysScored: scores.length };
}

// Scheda assegnata dal coach per un intervallo di date: righe is_read_only=true.
// Le raggruppa per data così da poter costruire il weekPlan di HomeDashboard.
export async function fetchAssignedWorkouts(supabase, userId, fromDateISO, toDateISO) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, reps_completed, load_kg, rir, intensity_technique, status, is_read_only")
    .eq("user_id", userId)
    .gte("date", fromDateISO)
    .lte("date", toDateISO)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true }); // ordine di inserimento del coach dentro lo stesso giorno
  if (error) throw error;
  return data ?? [];
}

// Protocollo integratori prescritto dal coach (prescribed_supplements),
// raggruppato per momento della giornata così com'è già ordinato dal coach
// (sort_order dentro lo stesso moment). Sola lettura lato cliente — la
// scrittura vive solo in saveWeekSupplements, lato coach.
export async function fetchPrescribedSupplements(supabase, userId) {
  const { data, error } = await supabase
    .from("prescribed_supplements")
    .select("id, moment, name, dose, sort_order, day_type")
    .eq("user_id", userId)
    .order("moment", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Integratori del protocollo prescritto già "presi" OGGI (SCHEMA_v54): una
// riga per integratore spuntato, niente colonna booleana — spuntare = insert,
// togliere la spunta = delete (vedi setSupplementTaken). Torna solo gli id
// di prescribed_supplements presi, così SupplementsPlanLocked può ricostruire
// lo stato "checked" da un dato reale invece che da uno stato React che si
// perdeva a ogni riavvio dell'app.
export async function fetchSupplementIntakeToday(supabase, userId) {
  const { data, error } = await supabase
    .from("supplement_intake")
    .select("prescribed_supplement_id")
    .eq("user_id", userId)
    .eq("date", toLocalISODate());
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.prescribed_supplement_id));
}

export async function setSupplementTaken(supabase, userId, prescribedSupplementId, taken) {
  if (taken) {
    const { error } = await supabase.from("supplement_intake")
      .insert({ user_id: userId, prescribed_supplement_id: prescribedSupplementId, date: toLocalISODate() });
    if (error && error.code !== "23505") throw error; // 23505 = già preso oggi, atteso e ok
  } else {
    const { error } = await supabase.from("supplement_intake").delete()
      .eq("user_id", userId).eq("prescribed_supplement_id", prescribedSupplementId).eq("date", toLocalISODate());
    if (error) throw error;
  }
}

// Cassaforte News & Tips (SCHEMA_v55): coach_news_tips non cancella mai le
// righe scadute (la scadenza a 48h è solo un filtro sul feed live), quindi
// basta salvare il riferimento (tip_id) — il contenuto resta comunque
// leggibile in futuro, nessuna copia da tenere sincronizzata.
export async function fetchSavedTips(supabase, userId) {
  const { data: saved, error } = await supabase
    .from("saved_tips")
    .select("tip_id, saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) throw error;
  if (!saved || saved.length === 0) return [];
  const { data: tips, error: tipsError } = await supabase
    .from("coach_news_tips")
    .select("id, channel, eyebrow, title, body, body_extended, source_query, like_count, published_at, photo_before_url, photo_after_url, weight_achieved")
    .in("id", saved.map((s) => s.tip_id));
  if (tipsError) throw tipsError;
  const savedAtByTip = new Map(saved.map((s) => [s.tip_id, s.saved_at]));
  const byTip = new Map((tips ?? []).map((t) => [t.id, t]));
  // Ordine di salvataggio (più recente prima), non l'ordine di pubblicazione —
  // un articolo salvato tempo fa resta dov'era anche se il suo contenuto è vecchio.
  return saved.map((s) => byTip.get(s.tip_id)).filter(Boolean).map((t) => ({ ...t, savedAt: savedAtByTip.get(t.id) }));
}

export async function saveTip(supabase, userId, tipId) {
  const { error } = await supabase.from("saved_tips").insert({ user_id: userId, tip_id: tipId });
  if (error && error.code !== "23505") throw error; // 23505 = già salvato, atteso e ok
}

export async function unsaveTip(supabase, userId, tipId) {
  const { error } = await supabase.from("saved_tips").delete().eq("user_id", userId).eq("tip_id", tipId);
  if (error) throw error;
}

// Diario integratori AUTOGESTITO (SCHEMA_v56) — per chi non ha un piano
// Pro/Full Coaching e quindi non riceve un protocollo dal coach
// (prescribed_supplements): qui è l'utente stesso a scrivere nome/dose/
// momento. Stesso pattern insert/delete "preso oggi" del protocollo Pro
// (self_supplement_intake, mai una colonna booleana).
export async function fetchSelfSupplements(supabase, userId) {
  const { data, error } = await supabase
    .from("self_supplements")
    .select("id, moment_id, moment_label, name, qty, day_type, reminder_time, reminder_on, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addSelfSupplement(supabase, userId, { momentId, momentLabel, name, qty, dayType, sortOrder }) {
  const { data, error } = await supabase
    .from("self_supplements")
    .insert({ user_id: userId, moment_id: momentId, moment_label: momentLabel || null, name, qty: qty || null, day_type: dayType || "all", sort_order: sortOrder || 0 })
    .select("id, moment_id, moment_label, name, qty, day_type, reminder_time, reminder_on, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function removeSelfSupplement(supabase, id) {
  const { error } = await supabase.from("self_supplements").delete().eq("id", id);
  if (error) throw error;
}

// Elimina un intero momento personalizzato e tutti i suoi integratori (le
// righe di self_supplement_intake seguono a cascata, vedi schema).
export async function removeSelfSupplementMoment(supabase, userId, momentId) {
  const { error } = await supabase.from("self_supplements").delete().eq("user_id", userId).eq("moment_id", momentId);
  if (error) throw error;
}

export async function updateSelfSupplementReminder(supabase, id, { reminderTime, reminderOn }) {
  const { error } = await supabase.from("self_supplements").update({ reminder_time: reminderTime ?? null, reminder_on: !!reminderOn }).eq("id", id);
  if (error) throw error;
}

export async function fetchSelfSupplementIntakeToday(supabase, userId) {
  const { data, error } = await supabase
    .from("self_supplement_intake")
    .select("self_supplement_id")
    .eq("user_id", userId)
    .eq("date", toLocalISODate());
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.self_supplement_id));
}

export async function setSelfSupplementTaken(supabase, userId, selfSupplementId, taken) {
  if (taken) {
    const { error } = await supabase.from("self_supplement_intake")
      .insert({ user_id: userId, self_supplement_id: selfSupplementId, date: toLocalISODate() });
    if (error && error.code !== "23505") throw error; // 23505 = già preso oggi, atteso e ok
  } else {
    const { error } = await supabase.from("self_supplement_intake").delete()
      .eq("user_id", userId).eq("self_supplement_id", selfSupplementId).eq("date", toLocalISODate());
    if (error) throw error;
  }
}

// Storico di un esercizio specifico (per il grafico/cronologia in HomeDashboard),
// solo le sessioni realmente svolte (status='done'), più recenti prima.
export async function fetchExerciseHistory(supabase, userId, exerciseName, limit = 8) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("date, load_kg, reps_completed")
    .eq("user_id", userId)
    .eq("exercise_name", exerciseName)
    .eq("status", "done")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse().map((r) => ({ kg: Number(r.load_kg), reps: r.reps_completed }));
}

// "I Miei Traguardi" (profilo): storico REALE di ogni esercizio mai svolto
// dal cliente, raggruppato per nome, con il carico massimo per sessione (non
// l'ultima serie salvata: workout_logs.load_kg viene sovrascritto a ogni
// nuova serie, workout_sets no — da lì il MAX per data). Una sola query,
// raggruppamento lato client, stesso pattern di fetchWeekWorkout.
export async function fetchExerciseRecords(supabase, userId) {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("load_kg, reps_completed, workout_logs!inner(date, exercise_name, muscle_target, user_id)")
    .eq("workout_logs.user_id", userId)
    .not("load_kg", "is", null);
  if (error) throw error;
  // Ordine per data applicato lato client (sotto, per sessione/esercizio):
  // ordinare su una colonna della tabella joinata non è affidabile via
  // PostgREST qui, e non serve — il raggruppamento per data lo rifà comunque.

  const byExercise = new Map();
  (data ?? []).forEach((row) => {
    const name = row.workout_logs.exercise_name;
    const date = row.workout_logs.date;
    if (!byExercise.has(name)) byExercise.set(name, { name, muscleGroup: row.workout_logs.muscle_target, byDate: new Map() });
    const entry = byExercise.get(name);
    const existing = entry.byDate.get(date);
    const kg = Number(row.load_kg);
    if (!existing || kg > existing.kg) entry.byDate.set(date, { kg, reps: row.reps_completed, date });
  });

  return Array.from(byExercise.values())
    .map((entry) => ({
      id: entry.name,
      name: entry.name,
      muscleGroup: entry.muscleGroup,
      compound: null, // non derivabile dallo schema attuale: nessun tag "multiarticolare" sui reali, mai inventato
      sessions: Array.from(entry.byDate.values())
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((s) => ({ week: s.date.slice(5).replace("-", "/"), date: s.date, kg: s.kg, reps: s.reps })),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length); // più storico prima
}

// Preferiti dei Traguardi: array di exercise_name su profiles, letto/scritto
// come xp_total/current_streak — stesso self-update già in uso altrove.
export async function fetchFavoriteExercises(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("favorite_exercises").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.favorite_exercises ?? [];
}
export async function saveFavoriteExercises(supabase, userId, exerciseIds) {
  const { error } = await supabase.from("profiles").update({ favorite_exercises: exerciseIds }).eq("id", userId);
  if (error) throw error;
}

/* ---------------------------------------------------------------------------
   SCRITTURA — lato cliente (compilare la scheda assegnata)
   ------------------------------------------------------------------------- */

// Il cliente compila una serie: registra QUESTA serie specifica in workout_sets
// (storico completo, mai sovrascritto) e aggiorna anche la riga riassuntiva in
// workout_logs (ultima serie + stato 'done'), utile per viste rapide che non
// hanno bisogno del dettaglio serie-per-serie.
export async function logWorkoutSet(supabase, workoutLogId, userId, setNumber, { repsCompleted, loadKg, rir }) {
  const { error: setError } = await supabase.from("workout_sets").upsert(
    {
      workout_log_id: workoutLogId,
      user_id: userId,
      set_number: setNumber,
      reps_completed: repsCompleted,
      load_kg: loadKg,
      rir,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "workout_log_id,set_number" }
  );
  if (setError) throw setError;

  const { error: logError } = await supabase
    .from("workout_logs")
    .update({ reps_completed: repsCompleted, load_kg: loadKg, rir, status: "done" })
    .eq("id", workoutLogId);
  if (logError) throw logError;
}

// Storico completo delle serie di un esercizio assegnato, per il coach (o per
// il cliente stesso): ogni riga è UNA serie realmente svolta, non l'ultima soltanto.
export async function fetchWorkoutSets(supabase, workoutLogId) {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("set_number, reps_completed, load_kg, rir, completed_at")
    .eq("workout_log_id", workoutLogId)
    .order("set_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Tutte le serie svolte da un cliente in un intervallo di date, con il nome
// esercizio incluso (join lato client su workout_logs) — utile per il coach
// che vuole vedere lo storico completo di un atleta senza aprire esercizio per esercizio.
export async function fetchClientSetHistory(supabase, userId, fromDateISO, toDateISO) {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("set_number, reps_completed, load_kg, rir, completed_at, workout_logs!inner(date, exercise_name, muscle_target, user_id)")
    .eq("workout_logs.user_id", userId)
    .gte("workout_logs.date", fromDateISO)
    .lte("workout_logs.date", toDateISO)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Cerchio "Allenamento" reale — STESSA funzione chiamata sia da Home cliente
// (05_HomeDashboard.jsx) sia da ClientDetail (09_CoachDashboard.jsx): mai due
// formule separate che potrebbero disallinearsi.
//
// Basato sulle ULTIME 7 SESSIONI EFFETTIVE (le 7 date più recenti con almeno
// un esercizio assegnato), non sulla settimana di calendario: un cliente che
// si allena 3 volte a settimana copre così ~2 settimane e mezza di storico
// reale, non conta i giorni di riposo come "buchi". Le 7 sessioni precedenti
// a queste (posizioni 8-14) sono il blocco di confronto per la progressione.
//
//   completionPct = (serie registrate su workout_sets nelle 7 sessioni più
//                     recenti) ÷ (somma sets_count assegnato in quelle
//                     stesse 7 sessioni), capped a 100.
//   progressione  = confronto, esercizio per esercizio (stesso exercise_name
//                    presente in entrambi i blocchi), del carico massimo
//                    (MAX load_kg) nel blocco recente vs quello precedente:
//                    "positive" se almeno uno migliorato e non tutti i
//                    confrontabili sono peggiorati; "negative" se TUTTI i
//                    confrontabili sono peggiorati; "neutral" altrimenti
//                    (inclusi il caso "nessun esercizio confrontabile").
//   pct finale    = completionPct, con una penalità (×0.75) solo se la
//                    progressione è negativa — positiva/neutra non alterano
//                    il numero (nessun bonus implementato, il tetto resta 100).
//
// Se non c'è MAI stato nulla assegnato (nessuna sessione trovata), torna
// status "neutral" con pct null — mai 0% (sembrerebbe un allarme) né 100%
// (sembrerebbe completato). Il chiamante decide come rendere il "n/d".
//
// NOTA VOLUTA: il dolore (evening.doloreGrado / check settimanale) NON entra
// in questo calcolo. Non esiste ancora un check-in reale del cliente
// collegato a Supabase — è un'omissione intenzionale, non dimenticata: si
// aggiunge quando costruiamo quel pezzo (checkins reali, non più simulati).
export async function computeTrainingCompliance(supabase, userId) {
  // Le date più recenti con almeno un esercizio assegnato. PostgREST non fa
  // "distinct date con limit" in una query sola: fetch generosa (250 righe,
  // abbondante anche per chi si allena 6 volte a settimana da un anno) e
  // dedup lato client — l'ordine desc si preserva perché un Set mantiene
  // l'ordine di primo inserimento.
  // lte(oggi): il coach può programmare settimane future in anticipo
  // (MAX_FORWARD_WEEKS in 09_CoachDashboard.jsx) — senza questo taglio,
  // "le date più recenti" pescherebbe sessioni future mai ancora svolte al
  // posto delle ultime 7 sedute REALMENTE fatte, falsando il cerchio.
  const { data: recentLogs, error: recentError } = await supabase
    .from("workout_logs")
    .select("date")
    .eq("user_id", userId)
    .lte("date", toLocalISODate())
    .order("date", { ascending: false })
    .limit(250);
  if (recentError) throw recentError;

  const distinctDates = [...new Set((recentLogs ?? []).map((r) => r.date))];
  if (distinctDates.length === 0) {
    return { status: "neutral", pct: null, completionPct: null, progression: "neutral" };
  }

  const currentDates = distinctDates.slice(0, 7);
  const priorDates = distinctDates.slice(7, 14);
  const allDates = [...currentDates, ...priorDates];

  const [{ data: assignedRows, error: assignedError }, { data: setsJoined, error: setsError }] = await Promise.all([
    supabase.from("workout_logs").select("sets_count").eq("user_id", userId).in("date", currentDates),
    supabase.from("workout_sets")
      .select("load_kg, workout_logs!inner(date, exercise_name, user_id)")
      .eq("workout_logs.user_id", userId)
      .in("workout_logs.date", allDates),
  ]);
  if (assignedError) throw assignedError;
  if (setsError) throw setsError;

  const assignedSetsTotal = (assignedRows ?? []).reduce((a, r) => a + (Number(r.sets_count) || 0), 0);
  if (assignedSetsTotal === 0) {
    return { status: "neutral", pct: null, completionPct: null, progression: "neutral" };
  }

  const currentDateSet = new Set(currentDates);
  const priorDateSet = new Set(priorDates);
  const registeredThisCount = (setsJoined ?? []).filter((r) => currentDateSet.has(r.workout_logs.date)).length;
  const completionPct = Math.max(0, Math.min(100, Math.round((registeredThisCount / assignedSetsTotal) * 100)));

  const maxThis = new Map();
  const maxPrior = new Map();
  (setsJoined ?? []).forEach((r) => {
    const kg = Number(r.load_kg) || 0;
    if (kg <= 0) return;
    const date = r.workout_logs.date;
    const bucket = currentDateSet.has(date) ? maxThis : priorDateSet.has(date) ? maxPrior : null;
    if (!bucket) return;
    const name = r.workout_logs.exercise_name;
    bucket.set(name, Math.max(bucket.get(name) ?? 0, kg));
  });

  let improved = 0, worsened = 0, comparable = 0;
  maxThis.forEach((kgThis, name) => {
    if (!maxPrior.has(name)) return;
    comparable++;
    const kgPrior = maxPrior.get(name);
    if (kgThis > kgPrior) improved++;
    else if (kgThis < kgPrior) worsened++;
  });

  let progression = "neutral";
  if (comparable > 0) {
    if (worsened === comparable) progression = "negative";
    else if (improved > 0) progression = "positive";
  }

  // Tre livelli distinti, non solo "penalità se regredisce": chi progredisce
  // sul carico mantenendo la costanza merita il punteggio pieno (bonus sopra
  // il solo completamento), chi mantiene le prestazioni resta al punteggio
  // di completamento così com'è, chi regredisce ma continua ad allenarsi
  // resta comunque premiato per la costanza — solo un po' meno di chi
  // mantiene o migliora, mai una bocciatura netta.
  const pct = progression === "positive" ? Math.min(100, completionPct + 10)
    : progression === "negative" ? Math.round(completionPct * 0.8)
    : completionPct;
  return { status: "ok", pct, completionPct, progression };
}

/* ---------------------------------------------------------------------------
   SCRITTURA — lato coach (pannello di assegnazione)
   ------------------------------------------------------------------------- */

// Ogni RLS su queste tabelle richiede is_coach() per l'insert su nutrition_targets
// e per scrivere workout_logs a nome di un altro utente: se chi chiama non è il
// coach, Supabase stessa rifiuta la scrittura (non serve ricontrollarlo qui).

// Scrive il protocollo integratori di un cliente: cancella tutto quello che
// c'era prima e reinserisce le sezioni correnti. A differenza di
// saveWeekWorkout non serve un confronto per-riga: qui non esiste uno storico
// da preservare (reps_completed/load_kg/rir per gli esercizi), "preso oggi"
// resta uno stato locale del cliente lato UI, non collegato a questa tabella —
// quindi un delete+insert pulito è corretto, non distruttivo.
export async function saveWeekSupplements(supabase, coachId, clientId, sections) {
  const { error: deleteError } = await supabase.from("prescribed_supplements").delete().eq("user_id", clientId);
  if (deleteError) throw deleteError;

  const rows = [];
  (sections ?? []).forEach((sec) => {
    // id_ref (id fisso di SUPP_MOMENTS, es. "preWo") ha sempre la priorità
    // sul titolo libero: è quello che il cliente usa per riordinare
    // correttamente mattina→pre workout→post workout→sera.
    const moment = sec.id_ref || sec.title;
    (sec.items ?? []).forEach((it, i) => {
      if (!it.name || !it.name.trim()) return;
      rows.push({ user_id: clientId, coach_id: coachId, moment, name: it.name.trim(), dose: it.dose || null, sort_order: i, day_type: it.dayType || "all" });
    });
  });
  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from("prescribed_supplements").insert(rows);
  if (insertError) throw insertError;
}

export async function assignNutritionTarget(supabase, {
  coachId, clientId, dayType, kcal, protein, carbs, fat, effectiveFrom,
}) {
  const { error } = await supabase.from("nutrition_targets").insert({
    user_id: clientId,
    day_type: dayType,
    kcal, protein, carbs, fat,
    effective_from: effectiveFrom || toLocalISODate(),
    set_by: coachId,
  });
  if (error) throw error;
}

export async function assignWorkoutExercise(supabase, {
  clientId, date, splitLabel, exerciseName, muscleTarget, setsCount, repsTarget, restSeconds, rirTarget, intensityTechnique,
}) {
  if (!MUSCLE_TARGETS.includes(muscleTarget)) {
    throw new Error(`muscle_target non valido: "${muscleTarget}". Valori ammessi: ${MUSCLE_TARGETS.join(", ")}`);
  }
  const { error } = await supabase.from("workout_logs").insert({
    user_id: clientId,
    date,
    split_label: splitLabel,
    exercise_name: exerciseName,
    muscle_target: muscleTarget,
    sets_count: setsCount,
    reps_target: repsTarget || null,
    rest_seconds: restSeconds ?? null,
    rir_target: rirTarget || null,
    intensity_technique: intensityTechnique || null,
    status: "missed",       // diventa 'done' quando il cliente compila la sessione
    is_read_only: true,     // è una prescrizione del coach, non un log libero del cliente
  });
  if (error) throw error;
}

// Lunedì di partenza (weekStartDateISO, 'YYYY-MM-DD') → i 7 giorni di quella
// settimana come stringhe ISO. Corretto su entrambi i lati: in INGRESSO,
// parsing con orario esplicito per restare in timezone locale ("YYYY-MM-DD"
// nudo verrebbe letto come mezzanotte UTC, sfasando la data di un giorno a
// seconda del fuso); in USCITA, toLocalISODate() invece di toISOString() —
// quest'ultima riconverte sempre in UTC, che è esattamente il bug opposto e
// vanificava la correzione in ingresso qui sopra.
function weekDatesFrom(weekStartDateISO) {
  const start = new Date(`${weekStartDateISO}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toLocalISODate(d);
  });
}

// Allenamento reale di una settimana, nella stessa forma che ClientTimeline
// (09_CoachDashboard.jsx) usa già per la parte finta (week.workout): un
// array di 7 elementi Lunedì→Domenica, null = riposo. Se il coach non ha
// ancora assegnato nulla per questa settimana, torna 7 null — MAI un pattern
// finto (niente push/pull/legs inventati: quello resta solo nel fallback
// locale di makeDefaultWeek, per quando isRealMode è false).
// `isCustomExercise(name)` è passato dal chiamante invece di importare
// EXERCISE_LIB qui dentro: EXERCISE_LIB vive in 09_CoachDashboard.jsx, che
// già importa questo file — importarlo anche in senso opposto creerebbe un
// ciclo tra i due moduli.
export async function fetchWeekWorkout(supabase, userId, weekStartDateISO, isCustomExercise) {
  const dates = weekDatesFrom(weekStartDateISO);
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, intensity_technique")
    .eq("user_id", userId)
    .in("date", dates)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true }); // ordine di inserimento del coach dentro lo stesso giorno
  if (error) throw error;

  const byDate = new Map();
  (data ?? []).forEach((row) => {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  });

  return dates.map((date) => {
    const rows = byDate.get(date);
    if (!rows || rows.length === 0) return null;
    return {
      label: rows[0].split_label || "Sessione",
      exercises: rows.map((r) => ({
        id: r.id,
        name: r.exercise_name,
        custom: typeof isCustomExercise === "function" ? isCustomExercise(r.exercise_name) : false,
        sets: r.sets_count,
        reps: r.reps_target || "",
        rest: r.rest_seconds ?? 0,
        rirTarget: r.rir_target || "",
        technique: r.intensity_technique || "Nessuna",
        muscleTarget: r.muscle_target,
        synergists: r.synergist_targets || [],
      })),
    };
  });
}

// Scrive l'allenamento di una settimana intera, giorno per giorno: per ogni
// data confronta gli esercizi nuovi con quelli già assegnati (per NOME, non
// per id — gli esercizi appena aggiunti in UI non hanno ancora un id reale),
// aggiorna solo i campi prescrittivi di quelli già presenti (mai
// reps_completed/load_kg/rir/status: quello è lo storico svolto dal
// cliente, non va mai sovrascritto da qui), inserisce quelli nuovi, cancella
// SOLO le righe del singolo giorno il cui esercizio non è più nella lista —
// mai una delete dell'intera settimana in un colpo solo.
export async function saveWeekWorkout(supabase, userId, weekStartDateISO, workoutArray) {
  if (!Array.isArray(workoutArray) || workoutArray.length !== 7) {
    throw new Error("saveWeekWorkout: workoutArray deve avere 7 elementi (Lunedì→Domenica).");
  }
  const dates = weekDatesFrom(weekStartDateISO);

  // Validazione preventiva su TUTTA la settimana prima di scrivere anche una
  // sola riga: un salvataggio parziale (metà settimana scritta, metà no per
  // un distretto mancante scoperto a metà) sarebbe peggio di un rifiuto secco.
  const missing = [];
  workoutArray.forEach((day, i) => {
    (day?.exercises ?? []).forEach((ex) => {
      if (!MUSCLE_TARGETS.includes(ex.muscleTarget)) missing.push(`"${ex.name || "esercizio senza nome"}" (${dates[i]})`);
    });
  });
  if (missing.length > 0) {
    throw new Error(`Distretto muscolare mancante o non valido per: ${missing.join(", ")}.`);
  }

  for (let i = 0; i < 7; i++) {
    const date = dates[i];
    const day = workoutArray[i];
    const newExercises = day?.exercises ?? [];
    const newNames = new Set(newExercises.map((e) => e.name));

    const { data: existing, error: fetchError } = await supabase
      .from("workout_logs")
      .select("id, exercise_name")
      .eq("user_id", userId)
      .eq("date", date);
    if (fetchError) throw fetchError;

    const existingIdByName = new Map((existing ?? []).map((r) => [r.exercise_name, r.id]));
    const toDelete = (existing ?? []).filter((r) => !newNames.has(r.exercise_name)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase.from("workout_logs").delete().in("id", toDelete);
      if (deleteError) throw deleteError;
    }

    for (const ex of newExercises) {
      const prescriptiveFields = {
        split_label: day.label || null,
        muscle_target: ex.muscleTarget,
        synergist_targets: ex.synergists && ex.synergists.length > 0 ? ex.synergists : null,
        sets_count: ex.sets,
        reps_target: ex.reps || null,
        rest_seconds: ex.rest ?? null,
        rir_target: ex.rirTarget || null,
        intensity_technique: ex.technique || null,
      };
      const existingId = existingIdByName.get(ex.name);
      if (existingId) {
        const { error: updateError } = await supabase.from("workout_logs").update(prescriptiveFields).eq("id", existingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("workout_logs").insert({
          user_id: userId,
          date,
          exercise_name: ex.name,
          status: "missed",
          is_read_only: true,
          ...prescriptiveFields,
        });
        if (insertError) throw insertError;
      }
    }
  }
}

// Clona una settimana di allenamento su un'altra: legge le righe della
// sorgente, le trasforma nella STESSA forma { label, exercises } che
// saveWeekWorkout già sa scrivere, e delega a quella — non una seconda
// versione scritta a mano della logica di confronto/scrittura. Vantaggio
// pratico: clonare due volte sulla stessa settimana destinazione AGGIORNA
// (non duplica), perché passa dallo stesso percorso — confronto per nome,
// update dei campi prescrittivi sulle righe già presenti, insert delle
// nuove, delete solo di quelle non più presenti — usato dal salvataggio
// manuale. Sempre come storico nuovo: reps_completed/load_kg/rir della
// sorgente non vengono letti né copiati, saveWeekWorkout li lascia intatti
// per le righe già esistenti nella destinazione e non li imposta per quelle
// nuove (nascono senza, come sempre).
// Se la settimana sorgente non ha nulla, non tocca la destinazione: un clic
// su "Clona" da una settimana vuota non deve svuotare quella di arrivo.
export async function cloneWeekWorkout(supabase, userId, sourceWeekStartISO, targetWeekStartISO) {
  const sourceDates = weekDatesFrom(sourceWeekStartISO);

  const { data: sourceRows, error: fetchError } = await supabase
    .from("workout_logs")
    .select("date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, intensity_technique")
    .eq("user_id", userId)
    .in("date", sourceDates);
  if (fetchError) throw fetchError;
  if (!sourceRows || sourceRows.length === 0) return;

  const byDate = new Map();
  sourceRows.forEach((row) => {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  });

  const workoutArray = sourceDates.map((date) => {
    const rows = byDate.get(date);
    if (!rows || rows.length === 0) return null;
    return {
      label: rows[0].split_label || "Sessione",
      exercises: rows.map((r) => ({
        name: r.exercise_name,
        muscleTarget: r.muscle_target,
        synergists: r.synergist_targets || [],
        sets: r.sets_count,
        reps: r.reps_target || "",
        rest: r.rest_seconds ?? 0,
        rirTarget: r.rir_target || "",
        technique: r.intensity_technique || "Nessuna",
      })),
    };
  });

  await saveWeekWorkout(supabase, userId, targetWeekStartISO, workoutArray);
}

// Template di allenamento riutilizzabili (SCHEMA_v59): a differenza di
// cloneWeekWorkout qui sopra (clona solo tra settimane dello STESSO
// cliente), un template si salva una volta e si applica a QUALUNQUE cliente
// e QUALUNQUE settimana, anche a più clienti insieme (azioni bulk).
export async function fetchWorkoutTemplates(supabase) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select("id, name, days, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveWorkoutTemplate(supabase, coachId, name, days) {
  const { error } = await supabase.from("workout_templates").insert({ coach_id: coachId, name, days });
  if (error) throw error;
}

export async function deleteWorkoutTemplate(supabase, templateId) {
  const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
  if (error) throw error;
}

// Applica un template a più clienti insieme (azioni bulk): stesso identico
// percorso di scrittura di saveWeekWorkout per ciascun cliente, uno alla
// volta — nessuna logica di scrittura duplicata. Ritorna { ok, failed } così
// il chiamante può mostrare quanti sono andati a buon fine anche se qualcuno
// fallisce (es. un permesso mancante su un singolo cliente non deve bloccare
// gli altri).
export async function applyWorkoutTemplateToClients(supabase, days, clientIds, targetWeekStartISO) {
  const ok = [];
  const failed = [];
  for (const clientId of clientIds) {
    try {
      await saveWeekWorkout(supabase, clientId, targetWeekStartISO, days);
      ok.push(clientId);
    } catch (err) {
      console.error(`PERFORM: errore applicazione template al cliente ${clientId}`, err);
      failed.push(clientId);
    }
  }
  return { ok, failed };
}

// Elenco clienti per il selettore nel pannello coach.
export async function fetchClientList(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, gender, xp_total, current_streak")
    .eq("role", "user")
    .order("nickname", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ---------------------------------------------------------------------------
   XP / LIVELLI / STREAK — formula unica reale
   ---------------------------------------------------------------------------
   Prima di questa formula esistevano 3 scale titolo/livello scollegate tra
   loro (05_HomeDashboard.jsx, 08_ClientProfileView.jsx, 07_ClassificaView.jsx)
   e zero calcolo reale: XP/streak erano numeri fissi passati come prop.
   Da qui in avanti UNA sola fonte: XP e streak si ricavano SEMPRE dai dati
   reali già salvati (mai un contatore incrementato lato client, che sarebbe
   falsificabile e disallineabile da un doppio salvataggio) — stesso principio
   delle formule di aderenza (computeTrainingCompliance e affini). Il
   risultato viene comunque scritto in cache su profiles.xp_total/
   current_streak (letti altrove: fetchClientList, fetchClientRoster, roster
   coach) così la classifica globale può leggerli con una sola query invece
   di ricalcolare la formula per ogni atleta. */
// Livelli INFINITI (non più un tetto fisso a 5): la soglia XP di ogni
// livello RADDOPPIA rispetto all'incremento precedente — stessa identica
// progressione già in uso prima (1000/3000/7000/15000, incrementi
// 1000/2000/4000/8000, ognuno il doppio del precedente), qui estesa
// all'infinito con la formula chiusa 1000·(2^n − 1) invece di fermarsi al
// 5° livello. Un cliente già a livello 4 vede lo stesso identico numero di
// prima; da lì in poi il livello continua a salire, sempre più lentamente
// in termini di XP-per-livello percepito, mai un tetto raggiunto.
export function levelMinXp(level) {
  return level <= 0 ? 0 : Math.round(1000 * (2 ** level - 1));
}

// Nomi raggruppati in "tier" da 5 sotto-livelli ciascuno (Principiante 1..5,
// Amatore 1..5, ...); una volta esaurito l'ultimo tier (Leggenda del Ferro)
// il numero continua a crescere all'infinito invece di richiedere un nome
// nuovo per ogni livello possibile — è così che restano davvero infiniti.
// Esportati (non più solo interni a xpToLevelInfo): la Bacheca Trofei del
// Profilo li riusa per i trofei "livello raggiunto", stessi nomi/icone del
// livello reale mostrato altrove — mai una seconda nomenclatura duplicata.
// Nomi ancorati al mondo reale di palestra/bodybuilding (non più un
// generico tier militare/RPG): la stessa scala di classificazione che
// userebbe un coach — principiante → amatore → intermedio → avanzato →
// atleta → bodybuilder → mostro natural → leggenda del ferro.
export const LEVEL_TIERS = [
  { title: "Principiante", icon: "🌱" },
  { title: "Amatore", icon: "🏋️" },
  { title: "Intermedio", icon: "💪" },
  { title: "Avanzato", icon: "🔥" },
  { title: "Atleta", icon: "🥇" },
  { title: "Bodybuilder", icon: "🦍" },
  { title: "Natural Monster", icon: "👹" },
  { title: "Leggenda del Ferro", icon: "⚡" },
];
export const LEVELS_PER_TIER = 5;
function levelTitleAndIcon(level) {
  const tierIdx = Math.min(Math.floor(level / LEVELS_PER_TIER), LEVEL_TIERS.length - 1);
  const tier = LEVEL_TIERS[tierIdx];
  const subLevel = level - tierIdx * LEVELS_PER_TIER + 1;
  return { title: `${tier.title} ${subLevel}`, icon: tier.icon };
}

// XP totale → { level, title, icon, xpInLevel, xpNeeded, isMaxLevel }. Usata
// sia in Home che in Profilo che nel pannello coach — mai un secondo calcolo.
// isMaxLevel resta sempre false: non c'è più un livello massimo.
export function xpToLevelInfo(xpTotal) {
  const xp = Math.max(0, Number(xpTotal) || 0);
  let level = 0;
  while (levelMinXp(level + 1) <= xp) level++;
  const { title, icon } = levelTitleAndIcon(level);
  const curMin = levelMinXp(level);
  const nextMin = levelMinXp(level + 1);
  return {
    level,
    title,
    icon,
    xp,
    xpInLevel: xp - curMin,
    xpNeeded: nextMin - xp,
    xpForNextLevel: nextMin - curMin,
    isMaxLevel: false,
  };
}

// Una giornata "completa" ai fini dello streak: allenamento fatto SE era
// previsto (nessuna scheda quel giorno = riposo, non penalizza), più almeno
// un pasto registrato, più sonno e passi registrati. Le stesse 3 condizioni
// alimentano sia lo streak (giorni consecutivi) sia un bonus XP per-giorno.
// Un giorno coperto da un pause_periods attivo (vacanza o riposo forzato
// concordato col coach) conta SEMPRE come completo ai fini dello streak: è
// un riposo sanzionato, non un'assenza — non deve rompere lo streak, ma non
// genera nemmeno il bonus XP "giornata piena" (quel conteggio, più sotto in
// computeRealXpAndStreak, guarda solo i giorni con un pasto REALMENTE
// registrato, quindi i giorni di pausa restano naturalmente esclusi da lì).
function isDayComplete(dateISO, { nutritionDays, metricsDays, workoutStatusByDate, pauseDates }) {
  if (pauseDates?.has(dateISO)) return true;
  const status = workoutStatusByDate.get(dateISO);
  const workoutOk = status === undefined || status === "done";
  return workoutOk && nutritionDays.has(dateISO) && metricsDays.has(dateISO);
}

// Espande le righe pause_periods (start_date/end_date) in un Set di singole
// date ISO — più comodo per isDayComplete che deve solo chiedere "oggi è
// coperto?" senza rifare il confronto di range ogni volta.
function expandPauseDates(periods) {
  const dates = new Set();
  (periods ?? []).forEach((p) => {
    const cursor = new Date(`${p.start_date}T00:00:00`);
    const end = new Date(`${p.end_date}T00:00:00`);
    while (cursor <= end) {
      dates.add(toLocalISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return dates;
}

// Finestra di recupero dello streak: un giorno mancante resta "in grazia"
// (non ancora un'interruzione definitiva) fino a tutto il giorno successivo
// alla sua data — un solo giorno extra per registrarlo prima che conti come
// davvero perso. Puramente basata sulle due date (mai uno stato salvato da
// far scadere): un giorno vecchio, mai recuperato, torna automaticamente
// "fuori grazia" ad ogni ricalcolo successivo, quindi non passa gratis per
// sempre — si applica sempre e solo al giorno più recente della catena.
const STREAK_GRACE_DAYS = 1;
function isWithinGraceWindow(missedDayIso, todayIso) {
  const diffDays = Math.round((new Date(`${todayIso}T00:00:00`) - new Date(`${missedDayIso}T00:00:00`)) / 86400000);
  return diffDays <= STREAK_GRACE_DAYS;
}

// Ricalcola XP totale e streak corrente di un cliente dai dati reali già
// salvati (workout_sets, nutrition_logs, daily_metrics, workout_logs,
// xp_bonuses) e li scrive in cache su profiles. Ritorna sempre il valore
// appena calcolato, anche se la scrittura di cache fallisce (best-effort: un
// problema di permessi sulla cache non deve rompere la UI che lo mostra).
export async function computeRealXpAndStreak(supabase, userId) {
  const { data: profileRow } = await supabase.from("profiles").select("created_at, longest_streak").eq("id", userId).maybeSingle();
  const sinceDate = profileRow?.created_at ? toLocalISODate(new Date(profileRow.created_at)) : "2020-01-01";
  const today = toLocalISODate();

  const [{ data: setsRows, error: setsError }, { data: nutriRows, error: nutriError },
    { data: metricsRows, error: metricsError }, { data: workoutRows, error: workoutError },
    { data: bonusRows, error: bonusError }, { data: pauseRows, error: pauseError },
    { data: freezeRows, error: freezeError }] = await Promise.all([
    supabase.from("workout_sets").select("id").eq("user_id", userId).not("reps_completed", "is", null).gte("completed_at", sinceDate),
    supabase.from("nutrition_logs").select("date").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("daily_metrics").select("date, sleep_hours, steps").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("workout_logs").select("date, status").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("xp_bonuses").select("amount").eq("user_id", userId),
    supabase.from("pause_periods").select("start_date, end_date").eq("user_id", userId),
    supabase.from("streak_freezes").select("date").eq("user_id", userId).gte("date", sinceDate),
  ]);
  if (setsError) throw setsError;
  if (nutriError) throw nutriError;
  if (metricsError) throw metricsError;
  if (workoutError) throw workoutError;
  if (bonusError) throw bonusError;
  if (pauseError) throw pauseError;
  if (freezeError) throw freezeError;

  const nutritionDays = new Set((nutriRows ?? []).map((r) => r.date));
  const metricsDays = new Set((metricsRows ?? []).filter((r) => r.sleep_hours != null && r.steps != null).map((r) => r.date));
  const workoutStatusByDate = new Map((workoutRows ?? []).map((r) => [r.date, r.status]));
  // Streak freeze (SCHEMA_v58): un giorno che l'atleta congela da solo, senza
  // bisogno di un coach — stesso identico effetto di un giorno di pausa
  // concordata (isDayComplete lo tratta come "completo"), ma disponibile a
  // TUTTI i piani, non solo a chi ha un coaching reale.
  const pauseDates = expandPauseDates(pauseRows);
  (freezeRows ?? []).forEach((r) => pauseDates.add(r.date));
  const ctx = { nutritionDays, metricsDays, workoutStatusByDate, pauseDates };

  // Streak: giorni consecutivi completi risalendo da oggi. Se oggi non è
  // ancora completo la giornata è semplicemente "ancora aperta" e non rompe
  // lo streak — si riparte da ieri, come nel comportamento già in uso prima.
  //
  // BUG PRESO (concettuale, non tecnico): un giorno perso per una sola
  // dimenticanza (es. dimenticare di segnare sonno/passi la sera) rompeva
  // lo streak all'istante, alla prima apertura dell'app il giorno dopo —
  // lo schema che punisce di più chi ha avuto una brutta giornata isolata,
  // non chi si allena davvero poco. Ora "ieri", se risulta incompleto, ha
  // una finestra di recupero di 24h (tutto il giorno di oggi) prima di
  // essere considerato davvero perso: isWithinGraceWindow confronta la data
  // del giorno mancante con quella di oggi, quindi si applica SOLO al
  // giorno più recente e scade da sola il giorno successivo — mai un giorno
  // vecchio dimenticato per sempre che continua a "passare gratis" ogni
  // volta che lo streak si ricalcola.
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00`);
  if (!isDayComplete(today, ctx)) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    const d = toLocalISODate(cursor);
    if (d < sinceDate) break;
    if (isDayComplete(d, ctx)) { streak++; cursor.setDate(cursor.getDate() - 1); continue; }
    if (isWithinGraceWindow(d, today)) { cursor.setDate(cursor.getDate() - 1); continue; }
    break;
  }

  let completeDays = 0;
  nutritionDays.forEach((d) => { if (isDayComplete(d, ctx)) completeDays++; });
  const bonusXp = (bonusRows ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const xpTotal = Math.round(
    (setsRows?.length ?? 0) * 10       // +10 per serie realmente svolta e registrata
    + nutritionDays.size * 5            // +5 per ogni giorno con almeno un pasto registrato
    + metricsDays.size * 5              // +5 per ogni giorno con sonno + passi registrati
    + completeDays * 15                 // bonus giornata piena (allenamento+dieta+recupero)
    + Math.floor(streak / 7) * 50       // bonus ogni settimana intera di streak
    + bonusXp                           // bonus manuali assegnati dal coach (xp_bonuses)
  );

  // Record storico: mai un numero che scende. "Giorni massimi di streak" è
  // il picco di sempre, non lo streak corrente — serve un max esplicito qui
  // perché current_streak si azzera quando la serie si interrompe.
  const longestStreak = Math.max(profileRow?.longest_streak ?? 0, streak);
  try {
    await supabase.from("profiles").update({ xp_total: xpTotal, current_streak: streak, longest_streak: longestStreak }).eq("id", userId);
  } catch (err) {
    console.error("PERFORM: impossibile aggiornare la cache XP/streak su profiles", err);
  }

  return { xpTotal, streak };
}

const STREAK_FREEZE_CAP = 2;       // massimo congelamenti...
const STREAK_FREEZE_WINDOW_DAYS = 30; // ...ogni N giorni

// Quanti "streak freeze" restano disponibili in questo momento (finestra
// mobile di 30 giorni) e se oggi è già congelato — disponibile a TUTTI i
// piani (SCHEMA_v58), non solo a chi ha un coach: a differenza di
// pause_periods (vacanza concordata col coach), qui non serve alcuna
// approvazione, solo un tetto per non svuotare di significato lo streak.
export async function fetchStreakFreezeStatus(supabase, userId) {
  const today = toLocalISODate();
  const fromDate = new Date(`${today}T00:00:00`);
  fromDate.setDate(fromDate.getDate() - (STREAK_FREEZE_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from("streak_freezes")
    .select("date")
    .eq("user_id", userId)
    .gte("date", toLocalISODate(fromDate));
  if (error) throw error;
  const dates = (data ?? []).map((r) => r.date);
  return {
    remaining: Math.max(0, STREAK_FREEZE_CAP - dates.length),
    usedToday: dates.includes(today),
  };
}

// Congela oggi: un insert, idempotente grazie al vincolo unique(user_id,date)
// — ricliccare non crea una seconda riga. Il chiamante deve aver già
// verificato `remaining > 0` (fetchStreakFreezeStatus) prima di offrire il
// pulsante: la RLS non applica da sola il tetto dei 2/30 giorni.
export async function useStreakFreezeToday(supabase, userId) {
  const { error } = await supabase.from("streak_freezes")
    .upsert({ user_id: userId, date: toLocalISODate() }, { onConflict: "user_id,date" });
  if (error) throw error;
}

// "Wrapped" mensile stile Spotify: riepilogo di un periodo (di norma gli
// ultimi 30 giorni) su tabelle già esistenti, nessuna nuova tabella — stessa
// logica delle serie/pasti/sonno già usata da computeRealXpAndStreak, solo
// filtrata sul periodo invece che su tutta la storia dell'account.
export async function fetchMonthlyWrapped(supabase, userId, fromISO, toISO) {
  const [{ data: setsRows, error: setsError }, { data: nutriRows, error: nutriError },
    { data: metricsRows, error: metricsError }] = await Promise.all([
    supabase.from("workout_sets").select("load_kg, reps_completed, completed_at")
      .eq("user_id", userId).not("reps_completed", "is", null)
      .gte("completed_at", `${fromISO}T00:00:00`).lte("completed_at", `${toISO}T23:59:59`),
    supabase.from("nutrition_logs").select("date").eq("user_id", userId).gte("date", fromISO).lte("date", toISO),
    supabase.from("daily_metrics").select("date, sleep_hours, digestion, motivation, fatigue").eq("user_id", userId).gte("date", fromISO).lte("date", toISO),
  ]);
  if (setsError) throw setsError;
  if (nutriError) throw nutriError;
  if (metricsError) throw metricsError;

  const workoutDays = new Set((setsRows ?? []).map((r) => toLocalISODate(new Date(r.completed_at))));
  const totalVolumeKg = (setsRows ?? []).reduce(
    (sum, r) => sum + (Number(r.load_kg) || 0) * (Number(r.reps_completed) || 0), 0);
  const avg = (key) => {
    const vals = (metricsRows ?? []).map((r) => Number(r[key])).filter((v) => v > 0);
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  };

  return {
    workoutDays: workoutDays.size,
    totalSets: setsRows?.length ?? 0,
    totalVolumeKg: Math.round(totalVolumeKg),
    nutritionDays: new Set((nutriRows ?? []).map((r) => r.date)).size,
    avgSleep: avg("sleep_hours"),
    avgDigestion: avg("digestion"),
    avgMotivation: avg("motivation"),
    avgFatigue: avg("fatigue"),
  };
}

// BUG PRESO: "Modifica profilo" (Impostazioni) non scriveva MAI su Supabase
// — onSaveProfile aggiornava solo lo state React locale, perso al refresh.
// Nickname/bio reali, un solo punto di scrittura.
export async function saveProfileDetails(supabase, userId, { nickname, bio }) {
  const { error } = await supabase.from("profiles").update({ nickname, bio }).eq("id", userId);
  if (error) throw error;
}

// Legge nickname/bio/avatar reali per seedare il form "Modifica profilo" al
// mount — prima partiva sempre dai valori demo fissi, mai da quelli veri.
export async function fetchProfileDetails(supabase, userId) {
  const { data, error } = await supabase.from("profiles")
    .select("nickname, bio, avatar_url, full_name, xp_total, current_streak, longest_streak, created_at")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Avatar reale: prima era un blob: URL locale al browser (URL.createObjectURL),
// mai caricato da nessuna parte — invalido già al refresh della pagina.
// Bucket pubblico "avatars" (SCHEMA_v38), path avatars/<user_id>/<timestamp>.<ext>
// cosi ogni upload nuovo ha un nome diverso (niente problemi di cache CDN su
// un file riscritto con lo stesso path).
export async function uploadAvatar(supabase, userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
  if (updateError) throw updateError;
  return data.publicUrl;
}

// Vacanza (2-14 giorni) o riposo forzato singolo (motivo obbligatorio): una
// riga in pause_periods, letta da isDayComplete/computeRealXpAndStreak qui
// sopra per non penalizzare streak/XP nei giorni coperti.
export async function requestPause(supabase, userId, { type, startDate, endDate, reason, note }) {
  if (type === "vacation") {
    const days = (new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000 + 1;
    if (days < 2 || days > 14) throw new Error("La vacanza deve durare tra 2 e 14 giorni.");
  }
  if (type === "forced_rest" && !reason) throw new Error("Indica il motivo del riposo forzato.");
  const { error } = await supabase.from("pause_periods").insert({
    user_id: userId, type, start_date: startDate, end_date: endDate, reason: reason || null, note: note || null,
  });
  if (error) throw error;
}

// Il periodo di pausa che copre OGGI, se esiste — usato per mostrare in Home
// "sei in vacanza fino al..." invece delle normali card di allenamento/dieta.
export async function fetchActivePause(supabase, userId) {
  const today = toLocalISODate();
  const { data, error } = await supabase
    .from("pause_periods")
    .select("id, type, start_date, end_date, reason, note")
    .eq("user_id", userId)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Storico pause di un cliente, per il coach (motivo compreso) — più recenti prima.
export async function fetchClientPauses(supabase, userId, limit = 10) {
  const { data, error } = await supabase
    .from("pause_periods")
    .select("id, type, start_date, end_date, reason, note, created_at")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Etichette mesociclo (nome + fase bulk/cut/mantenimento/scarico) per un
// intervallo di settimane di un cliente — usato per colorare/etichettare la
// striscia di pallini settimana nella timeline del coach. Ritorna una mappa
// { "YYYY-MM-DD": { name, phase } } indicizzata sul lunedì di ciascuna
// settimana, così il chiamante fa solo un lookup per offset.
export async function fetchMesocycleWeeksRange(supabase, userId, fromDateISO, toDateISO) {
  const { data, error } = await supabase
    .from("mesocycle_weeks")
    .select("week_start, mesocycle_name, phase")
    .eq("user_id", userId)
    .gte("week_start", fromDateISO)
    .lte("week_start", toDateISO);
  if (error) throw error;
  const map = {};
  for (const row of data ?? []) map[row.week_start] = { name: row.mesocycle_name, phase: row.phase };
  return map;
}

// Il coach imposta/aggiorna nome e fase di UNA settimana specifica. name/phase
// null cancella quel campo (non la riga: una settimana senza fase ma con nome
// resta comunque utile in vista).
export async function saveMesocycleWeek(supabase, userId, weekStartISO, { name, phase }) {
  const { error } = await supabase
    .from("mesocycle_weeks")
    .upsert(
      { user_id: userId, week_start: weekStartISO, mesocycle_name: name || null, phase: phase || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,week_start" }
    );
  if (error) throw error;
}

// Push immediato al cliente quando il coach salva una modifica reale al suo
// piano (allenamento/dieta/integratori) — invoca la Edge Function
// notify-client (supabase/functions/notify-client), che verifica lato
// server che il chiamante sia davvero un coach prima di spedire qualunque
// cosa. Best-effort: se il cliente non ha mai attivato le notifiche push
// (nessuna riga in push_subscriptions) la funzione risponde comunque 200
// con sent:0, quindi qui non serve gestire quel caso come errore — un
// fallimento di rete/funzione viene solo loggato, non blocca il salvataggio
// che l'ha generato.
export async function notifyClientPlanChange(supabase, userId, { title, body, url }) {
  try {
    await supabase.functions.invoke("notify-client", { body: { userId, title, body, url } });
  } catch (err) {
    console.error("PERFORM: errore invio notifica push al cliente", err);
  }
}

// Classifica di UN mese specifico (formato 'YYYY-MM', es. '2026-08'): il
// guadagno XP di ciascun atleta in quel mese, non il totale lifetime.
// Calcolato come differenza fra due snapshot consecutivi scritti dalla Edge
// Function monthly-xp-snapshot (cron il 1° di ogni mese) — per il mese IN
// CORSO usa profiles.xp_total attuale al posto dello snapshot di fine mese,
// che ovviamente non esiste ancora. Se manca anche lo snapshot di INIZIO
// mese (il cron non è ancora girato quella volta, o l'atleta non era
// iscritto) ritorna null: quel mese non è ancora consultabile, mai un
// numero inventato.
export async function fetchMonthlyLeaderboard(supabase, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const nextMonthKey = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const isCurrentMonth = monthKey === toLocalISODate().slice(0, 7);

  // leaderboard_profiles (non profiles direttamente, vedi SCHEMA_v45): la
  // RLS su profiles è "id = auth.uid() OR is_coach()" — corretta per
  // proteggere email/piano/stripe/whitelist, ma per un cliente normale
  // (non il coach) significa vedere SOLO la propria riga, quindi una
  // classifica sempre vuota per chiunque non fosse il coach. La view espone
  // solo le colonne davvero pubbliche ed è leggibile da qualsiasi utente
  // autenticato.
  const [{ data: profiles, error: profilesError }, { data: startSnaps, error: startError }, endResult] = await Promise.all([
    supabase.from("leaderboard_profiles").select("id, nickname, full_name, xp_total, current_streak, avatar_url, bio, longest_streak").eq("role", "user"),
    supabase.from("monthly_xp_snapshots").select("user_id, xp_total_at_snapshot").eq("month", monthKey),
    isCurrentMonth ? Promise.resolve({ data: [] }) : supabase.from("monthly_xp_snapshots").select("user_id, xp_total_at_snapshot").eq("month", nextMonthKey),
  ]);
  if (profilesError) throw profilesError;
  if (startError) throw startError;
  if (endResult.error) throw endResult.error;

  // BUG PRESO: prima escludeva dalla classifica chiunque non avesse uno
  // snapshot di INIZIO mese — ma un cliente iscritto DOPO il cron del 1°
  // (il caso normale per chi si registra a metà mese) non ha mai quello
  // snapshot, quindi spariva del tutto dalla classifica del mese in corso
  // pur guadagnando XP vero in questo momento. Per il mese in corso non
  // serve nessuno snapshot per essere consultabile: si usa sempre
  // xp_total live, e chi non ha uno snapshot di partenza parte da 0 (tutto
  // il suo XP di questo mese è guadagno vero da quando si è iscritto).
  const startMap = new Map((startSnaps ?? []).map((s) => [s.user_id, s.xp_total_at_snapshot]));
  const endMap = new Map((endResult.data ?? []).map((s) => [s.user_id, s.xp_total_at_snapshot]));
  // Solo un mese CHIUSO senza nemmeno uno snapshot di fine mese resta
  // davvero non consultabile: senza quello non si può ricostruire nessun
  // delta storico (il cron di fine mese non è mai girato per quel mese).
  if (!isCurrentMonth && endMap.size === 0) return null;

  const rows = (profiles ?? [])
    .filter((p) => isCurrentMonth || endMap.has(p.id))
    .map((p) => {
      const start = startMap.get(p.id) ?? 0;
      const end = isCurrentMonth ? (p.xp_total ?? 0) : (endMap.get(p.id) ?? start);
      return {
        id: p.id,
        nickname: p.full_name || p.nickname || "Atleta",
        xpThisMonth: Math.max(0, end - start),
        streakDays: p.current_streak ?? 0,
        level: xpToLevelInfo(p.xp_total ?? 0).title, // livello LIFETIME, non del singolo mese
        avatarUrl: p.avatar_url || null,
        bio: p.bio || "",
        xpTotal: p.xp_total ?? 0,          // lifetime, non il guadagno del mese — per il dettaglio atleta
        longestStreak: p.longest_streak ?? 0,
      };
    })
    .sort((a, b) => b.xpThisMonth - a.xpThisMonth)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return rows;
}

// Bonus XP manuale assegnato dal coach (es. "Obiettivo di mesociclo
// raggiunto"): riga in xp_bonuses, sommata da computeRealXpAndStreak alla
// prossima ricomputazione — mai una scrittura diretta su profiles.xp_total,
// che verrebbe sovrascritta dal prossimo ricalcolo.
export async function awardXpBonus(supabase, { userId, coachId, amount, reason }) {
  const { error } = await supabase.from("xp_bonuses").insert({
    user_id: userId,
    amount,
    reason: reason || null,
    awarded_by: coachId || null,
  });
  if (error) throw error;
}

/* ---------------------------------------------------------------------------
   CHECK (peso/circonferenze/soggettivo) — Archivio Check reale
   ---------------------------------------------------------------------------
   Prima di questa funzione, WeeklyCheckModal (05_HomeDashboard.jsx)
   simulava il salvataggio con un setTimeout: niente arrivava mai su
   Supabase. Un solo punto di scrittura per sia il check settimanale
   obbligatorio (domenica/lunedì) sia il pulsante "Registra ora" libero nel
   Profilo — stesso form, stessa funzione, mai due percorsi diversi per lo
   stesso dato. Nessun vincolo di unicità per data: un cliente può avere sia
   il check di lunedì sia una registrazione manuale nello stesso giorno. */
// Carica una singola foto check nel bucket privato "checkin-photos"
// (SCHEMA_v36): path "{userId}/{timestamp}-{angolo}.jpg", RLS a livello di
// storage.objects garantisce che solo il proprietario e il coach possano
// leggerla — mai un bucket pubblico per foto corporee. Ritorna il path
// salvato (non l'URL: pubblico non è mai valido qui, va sempre firmato al
// momento della lettura con getCheckinPhotoUrl).
export async function uploadCheckinPhoto(supabase, userId, file, angle) {
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}-${angle}.${ext}`;
  const { error } = await supabase.storage.from("checkin-photos").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

// URL firmato temporaneo (1h) per una foto privata — mai un URL pubblico
// permanente su foto corporee.
export async function getCheckinPhotoUrl(supabase, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("checkin-photos").createSignedUrl(path, 3600);
  if (error) { console.error("PERFORM: errore signed url foto check", error); return null; }
  return data?.signedUrl ?? null;
}

export async function saveCheckin(supabase, userId, checkin) {
  const { error } = await supabase.from("checkins").insert({
    user_id: userId,
    date: toLocalISODate(),
    weight: checkin.weight ?? null,
    waist: checkin.waist ?? null,
    chest: checkin.chest ?? null,
    arm: checkin.arm ?? null,
    thigh: checkin.thigh ?? null,
    pain: checkin.pain ?? null,
    stress: checkin.stress ?? null,
    digestion: checkin.digestion ?? null,
    sleep_quality: checkin.sleepQuality ?? null,
    cycle_phase: checkin.cyclePhase ?? null,
    has_photos: Boolean(checkin.photoPaths?.front || checkin.photoPaths?.side || checkin.photoPaths?.back),
    photo_front_url: checkin.photoPaths?.front ?? null,
    photo_side_url: checkin.photoPaths?.side ?? null,
    photo_back_url: checkin.photoPaths?.back ?? null,
  });
  if (error) throw error;
}

// Cronologia check reali di un cliente, dal più vecchio al più recente (come
// si aspetta WeightChart). L'Archivio Check deve mostrare il trend dei dati
// FIN DALL'INIZIO del percorso, non solo una finestra recente — con check
// settimanali anche solo 60 righe (il vecchio limite) tagliavano fuori la
// storia oltre ~14 mesi per un cliente di lunga data. 1000 copre qualunque
// storico reale (anche 15+ anni di check settimanali) restando comunque un
// limite esplicito, mai una query davvero illimitata.
export async function fetchCheckins(supabase, userId, limit = 1000) {
  const { data, error } = await supabase
    .from("checkins")
    .select("date, weight, waist, chest, arm, thigh, pain, stress, digestion, sleep_quality, cycle_phase, has_photos, photo_front_url, photo_side_url, photo_back_url")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).slice().reverse();
}

/* ---------------------------------------------------------------------------
   HUB ATLETI — roster reale + anamnesi
   ------------------------------------------------------------------------- */

// Anamnesi (56 risposte, salvate come JSON) di un cliente. Ritorna {} se non
// ha ancora compilato nulla — nessun crash, il pannello mostra 0% compilata.
export async function fetchAnamnesis(supabase, userId) {
  const { data, error } = await supabase
    .from("anamnesis_responses")
    .select("answers, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.answers ?? {};
}

// Scrive (o aggiorna) le risposte anamnesi di un cliente. Upsert: sovrascrive
// tutte le risposte con l'oggetto passato — il chiamante deve unire lo stato
// precedente con le nuove risposte prima di chiamare questa funzione.
export async function saveAnamnesis(supabase, userId, answers) {
  const { error } = await supabase
    .from("anamnesis_responses")
    .upsert({ user_id: userId, answers, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

// Hub Utenti (ex Hub Rete & Accessi): scrive l'istante corrente sulla propria
// riga, una volta per sessione app (App.jsx, subito dopo che la sessione è
// pronta) — è l'unico modo per avere un "ultimo accesso" reale, dato che il
// client non può leggere auth.users.last_sign_in_at direttamente. Fallisce
// in silenzio lato chiamante (non è mai bloccante per l'uso dell'app).
export async function touchLastActivity(supabase, userId) {
  const { error } = await supabase.from("profiles").update({ last_activity: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}

// Roster reale per l'Hub Atleti del pannello coach: combina profiles + ultimo
// checkin + anamnesi in una forma compatibile con l'interfaccia già costruita.
// Campi non ancora tracciabili da nessuna tabella reale (adherence, rings,
// prs, evening) restano a un valore neutro di default — NON sono inventati,
// sono segnalati come 0/vuoto finché non viene costruita la fonte dati vera
// (checkins serali, calcolo aderenza da workout_sets, PR da workout_sets).
export async function fetchClientRoster(supabase) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, full_name, email, gender, role, xp_total, current_streak, plan, client_status, last_activity, created_at, whitelisted_until")
    .eq("role", "user")
    .order("created_at", { ascending: false });
  if (profilesError) throw profilesError;
  if (!profiles || profiles.length === 0) return [];

  const roster = await Promise.all(
    profiles.map(async (p) => {
      const [{ data: checkins }, answers] = await Promise.all([
        supabase.from("checkins").select("date, weight, chest, arm, thigh").eq("user_id", p.id).order("date", { ascending: false }).limit(8),
        fetchAnamnesis(supabase, p.id).catch(() => ({})),
      ]);
      const ordered = (checkins ?? []).slice().reverse(); // dal più vecchio al più recente, come si aspetta il grafico
      const last = ordered[ordered.length - 1];

      return {
        id: p.id,
        name: p.full_name || p.nickname || "Atleta",
        gender: p.gender === "female" ? "F" : "M",
        goal: answers.obiettivoPrinc || null,
        calories: null, // letto separatamente da nutrition_targets quando serve, non duplicato qui
        adherence: null, // nessun dato tracciato ancora, non "0% aderenza"
        streak: p.current_streak ?? 0,
        xp: p.xp_total ?? 0,
        plan: p.plan || "free",
        status: p.client_status === "active" ? "active" : "pending",
        clientStatus: p.client_status || "registered",
        lastActivity: p.last_activity,
        createdAt: p.created_at,
        fullName: p.full_name || null,
        nickname: p.nickname || null,
        whitelistedUntil: p.whitelisted_until || null,
        age: answers.eta ?? null,
        birthDate: null,
        heightCm: answers.heightCm ?? null,
        bodyFatPct: answers.bodyFatPct ?? null,
        activity: answers.activity ?? null,
        foodLikes: answers.foodLikes ?? [],
        foodDislikes: answers.foodDislikes ?? [],
        email: p.email,
        lastCheck: last ? { weight: Number(last.weight) } : { weight: null },
        lastCheckDate: last?.date || null, // per "chi è in ritardo" nel pannello coach
        weightHistory: ordered.map((c) => Number(c.weight)).filter((n) => !Number.isNaN(n)),
        waistCm: null,
        billingStatus: p.plan && p.plan !== "free" ? "active" : "pending",
        prs: {},
        evening: { energia: null, digestione: null, sonno: null, doloreGrado: 0, doloreNota: "" },
        rings: { allenamento: 0, alimentazione: 0, recupero: 0 },
        _anamnesisAnswers: answers, // portato dietro per AnamnesisPanel, non per la roster card
      };
    })
  );
  return roster;
}

// Piani assegnabili dal coach tramite "Prendi in gestione" / "Cambia
// abbonamento": solo i tre a coaching reale (Free e Performance Pack restano
// scelte autogestite del cliente, mai imposte dal coach da qui).
const COACHING_PLANS = ["scheda_personalizzata", "training", "full"];

// `plan` è obbligatorio: client_status e plan si scrivono sempre insieme,
// nello stesso update — mai un cliente "attivo" senza un piano coerente, o
// con ancora il piano precedente perché il chiamante l'ha dimenticato.
export async function activateClient(supabase, clientId, plan) {
  if (!COACHING_PLANS.includes(plan)) {
    throw new Error(`plan non valido per l'attivazione: "${plan}". Valori ammessi: ${COACHING_PLANS.join(", ")}`);
  }
  const { error } = await supabase.from("profiles").update({ client_status: "active", plan }).eq("id", clientId);
  if (error) throw error;
}

// Whitelist: il coach conosce la persona di persona e le dà accesso pieno
// senza pagamento Stripe reale né anamnesi da compilare — bypassa entrambi
// impostando onboarding_completed direttamente (stesso flag che App.jsx usa
// per decidere se mostrare OnboardingFlow, dove vive l'anamnesi
// obbligatoria dei piani a coaching). whitelisted_until è la data esatta di
// scadenza: exact months da oggi, non un'approssimazione a 30 giorni — così
// "3 mesi gratis" scade davvero 3 mesi dopo, indipendentemente dal numero
// di giorni nei mesi di mezzo.
const WHITELISTABLE_PLANS = ["free", "performance_pack", "scheda_personalizzata", "training", "full"];
// skipAnamnesis: per i piani a coaching reale (scheda_personalizzata/
// training/full) il coach può scegliere di far comunque compilare
// l'anamnesi — alcune persone che conosce di persona gliela serve comunque
// per davvero. Se true, onboarding_completed passa direttamente a true
// (bypass totale, com'era prima). Se false, onboarding_completed resta
// false: al prossimo accesso OnboardingFlow riparte, vede che profiles.plan
// è già un piano coaching (resumedPlanId) e salta dritto allo step
// anamnesi — stesso comportamento di un cliente vero tornato da Stripe,
// nessuna doppia scelta del piano.
export async function whitelistClient(supabase, clientId, plan, months, skipAnamnesis = true) {
  if (!WHITELISTABLE_PLANS.includes(plan)) {
    throw new Error(`piano non valido per la whitelist: "${plan}"`);
  }
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) throw new Error("numero di mesi non valido");
  const until = new Date();
  until.setMonth(until.getMonth() + n);
  const { error } = await supabase.from("profiles").update({
    plan, client_status: "active", onboarding_completed: skipAnamnesis, whitelisted_until: until.toISOString(),
  }).eq("id", clientId);
  if (error) throw error;
}

// Rimuove la whitelist prima della scadenza naturale (il coach cambia idea,
// o la persona inizia a pagare per davvero tramite "Cambia abbonamento").
// Non tocca il piano attuale — solo lo scollega dal timer di scadenza.
export async function clearWhitelist(supabase, clientId) {
  const { error } = await supabase.from("profiles").update({ whitelisted_until: null }).eq("id", clientId);
  if (error) throw error;
}

// Rinomina un cliente (Hub Rete & Accessi) — semplice update diretto, stessa
// tabella/permessi già usati da activateClient qui sopra. Non tocca email
// (quella vive in auth.users, cambiarla richiederebbe una verifica separata,
// fuori scope per un "correggi il nome scritto male").
export async function renameClient(supabase, clientId, { fullName, nickname }) {
  const patch = {};
  if (fullName !== undefined) patch.full_name = fullName;
  if (nickname !== undefined) patch.nickname = nickname;
  const { error } = await supabase.from("profiles").update(patch).eq("id", clientId);
  if (error) throw error;
}

// Reset password reale (Edge Function admin-reset-password, service role +
// Supabase Auth Admin API) — mai una password finta generata solo lato
// client come prima: quella non cambiava nulla di vero su auth.users.
// Ritorna la password nuova UNA volta sola, da comunicare al cliente.
export async function adminResetPassword(supabase, clientId) {
  const { data, error } = await supabase.functions.invoke("admin-reset-password", { body: { userId: clientId } });
  if (error) throw error;
  return data?.password;
}

// Elimina definitivamente un account (Edge Function admin-delete-account) —
// per ripulire i doppioni di registrazione. Azione irreversibile: la UI
// chiamante deve sempre chiedere conferma esplicita prima.
export async function adminDeleteAccount(supabase, clientId) {
  const { error } = await supabase.functions.invoke("admin-delete-account", { body: { userId: clientId } });
  if (error) throw error;
}

// Sezione Cardio (stile diario Strava semplificato) — registro manuale di
// attività cardio, parte del Diario Libero disponibile a tutti i piani.
export async function fetchCardioLogs(supabase, userId, limit = 20) {
  const { data, error } = await supabase
    .from("cardio_logs")
    .select("id, date, activity_type, duration_min, distance_km, notes, created_at, route, avg_speed_kmh, max_speed_kmh, intensity_style, hiit_rounds, hiit_work_sec, hiit_rest_sec, machine_metrics")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function addCardioLog(supabase, userId, {
  date, activityType, durationMin, distanceKm, notes, route, avgSpeedKmh, maxSpeedKmh,
  intensityStyle, hiitRounds, hiitWorkSec, hiitRestSec, machineMetrics,
}) {
  const { error } = await supabase.from("cardio_logs").insert({
    user_id: userId, date, activity_type: activityType, duration_min: durationMin,
    distance_km: distanceKm || null, notes: notes || null,
    route: route || null, avg_speed_kmh: avgSpeedKmh || null, max_speed_kmh: maxSpeedKmh || null,
    intensity_style: intensityStyle || null,
    hiit_rounds: intensityStyle === "hiit" ? (hiitRounds || null) : null,
    hiit_work_sec: intensityStyle === "hiit" ? (hiitWorkSec || null) : null,
    hiit_rest_sec: intensityStyle === "hiit" ? (hiitRestSec || null) : null,
    machine_metrics: machineMetrics && Object.keys(machineMetrics).length ? machineMetrics : null,
  });
  if (error) throw error;
}

export async function deleteCardioLog(supabase, logId) {
  const { error } = await supabase.from("cardio_logs").delete().eq("id", logId);
  if (error) throw error;
}

// "8-10" (o un numero fisso "8") = stesso range/valore per tutte le serie.
// "8/12" (con la barra) = una serie per parte: prima serie 8, seconda 12.
// "8/10/12" = 3 serie con 3 target diversi. Se le parti non combaciano col
// numero di serie, l'ultima parte si ripete per quelle in eccesso — non
// un errore, un caso limite gestito con buon senso.
function parseRepsTarget(repsRaw, numSets) {
  const raw = String(repsRaw || "").trim();
  const n = Math.max(0, Number(numSets) || 0);
  if (!raw || n === 0) return [];
  if (raw.includes("/")) {
    const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return Array.from({ length: n }, () => "");
    return Array.from({ length: n }, (_, i) => parts[i] ?? parts[parts.length - 1]);
  }
  return Array.from({ length: n }, () => raw);
}

// I 3 consensi legali accettati alla registrazione (legal_consents,
// scritti da saveConsents in 03_AuthView.jsx) — mai letti finora da
// nessuna schermata. Servono per "Scarica i miei dati": l'utente deve
// poter vedere/esportare esattamente cosa ha accettato e quando.
export async function fetchLegalConsents(supabase, userId) {
  const { data, error } = await supabase.from("legal_consents")
    .select("gdpr_data, medical_waiver, community_direct, birth_date, accepted_at, policy_version")
    .eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Database alimenti collettivo reale (SCHEMA_v43) — stesso principio della
// libreria esercizi (SCHEMA_v39): un alimento inserito a mano da un
// cliente arricchisce il catalogo per tutti, mai più solo nella sessione
// locale di chi l'ha scritto.
export async function fetchCustomFoods(supabase) {
  const { data, error } = await supabase.from("custom_foods")
    .select("name, kcal, protein, carbs, fat, sodium_mg, potassium_mg, iron_mg, calcium_mg, magnesium_mg");
  if (error) throw error;
  return (data ?? []).map((f) => ({
    name: f.name, kcal: Number(f.kcal) || 0, p: Number(f.protein) || 0, c: Number(f.carbs) || 0, f: Number(f.fat) || 0,
    na: f.sodium_mg != null ? Number(f.sodium_mg) : undefined,
    k: f.potassium_mg != null ? Number(f.potassium_mg) : undefined,
    fe: f.iron_mg != null ? Number(f.iron_mg) : undefined,
    ca: f.calcium_mg != null ? Number(f.calcium_mg) : undefined,
    mg: f.magnesium_mg != null ? Number(f.magnesium_mg) : undefined,
  }));
}

// on conflict do nothing: chi ha scritto per primo un alimento resta la
// voce valida — un secondo inserimento con lo stesso nome (magari con
// valori leggermente diversi digitati da un altro cliente) non lo tocca.
export async function learnCustomFood(supabase, food, userId) {
  if (!food?.name?.trim()) return;
  const { error } = await supabase.from("custom_foods").insert({
    name: food.name.trim(), kcal: food.kcal || 0, protein: food.p || 0, carbs: food.c || 0, fat: food.f || 0,
    sodium_mg: food.na ?? null, potassium_mg: food.k ?? null, iron_mg: food.fe ?? null,
    calcium_mg: food.ca ?? null, magnesium_mg: food.mg ?? null, created_by: userId || null,
  });
  if (error && error.code !== "23505") console.error("PERFORM: errore salvataggio alimento nel catalogo condiviso", error); // 23505 = già esiste, atteso e ok
}

// Dovere di cura (§09 memo "Verso l'élite"): se il dolore riportato nel
// check resta alto per più registrazioni consecutive, il coach ha diritto a
// saperlo subito invece di doverlo notare da solo scorrendo lo storico —
// protegge il cliente (un dolore ignorato può diventare un infortunio) e la
// pratica professionale del coach. "Alto" = 7+ su 10 (stessa scala 1-10 di
// checkins.pain), "consecutivo" = gli ULTIMI check REGISTRATI (non un
// intervallo di calendario fisso): un cliente che salta settimane non deve
// né sfuggire alla segnalazione né essere segnalato per errore su dati
// vecchi che non sono più "consecutivi" a niente.
export function detectPersistentPain(historyNewestFirst, { threshold = 7, minConsecutive = 3 } = {}) {
  const painOf = (h) => (h.dolori ?? h.pain);
  const withPain = (historyNewestFirst || []).filter((h) => painOf(h) != null);
  const recent = withPain.slice(0, minConsecutive);
  if (recent.length < minConsecutive) return null;
  if (!recent.every((h) => painOf(h) >= threshold)) return null;
  return { consecutiveChecks: minConsecutive, lastPain: painOf(recent[0]), threshold };
}

// Punteggio di ricomposizione: legge peso e vita (non "un numero" arbitrario
// — un'etichetta onesta derivata da due delta reali già misurati) per capire
// se sta succedendo dimagrimento, bulk o vera ricomposizione (peso stabile/su,
// vita giù = grasso perso e muscolo guadagnato). Serve almeno 2 check con
// entrambe le misure per dare una lettura — altrimenti torna null, mai un
// giudizio su dati insufficienti.
export function recompositionReading(weightPoints, circPoints) {
  const w = (weightPoints || []).filter((p) => p.kg != null);
  const waistSeries = (circPoints || []).filter((p) => p.waist != null);
  if (w.length < 2 || waistSeries.length < 2) return null;

  const weightDeltaPct = ((w[w.length - 1].kg - w[0].kg) / w[0].kg) * 100;
  const waistDeltaPct = ((waistSeries[waistSeries.length - 1].waist - waistSeries[0].waist) / waistSeries[0].waist) * 100;

  const weightFlat = Math.abs(weightDeltaPct) < 1;
  const weightUp = weightDeltaPct >= 1;
  const weightDown = weightDeltaPct <= -1;
  const waistDown = waistDeltaPct <= -1;
  const waistUp = waistDeltaPct >= 1;

  let label, detail, tone;
  if (weightUp && waistDown) {
    label = "Ricomposizione avanzata"; tone = "good";
    detail = "Peso su e vita giù insieme: segno chiaro di massa magra guadagnata e grasso perso nello stesso periodo.";
  } else if (weightFlat && waistDown) {
    label = "Ricomposizione"; tone = "good";
    detail = "Peso stabile ma vita in calo: probabile scambio grasso-muscolo, il peso da solo non lo racconterebbe.";
  } else if (weightDown && waistDown) {
    label = "Dimagrimento"; tone = "good";
    detail = "Peso e vita in calo insieme: perdita di massa grassa in corso.";
  } else if (weightUp && waistUp) {
    label = "Bulk"; tone = "neutral";
    detail = "Peso e vita in aumento insieme: fase di surplus, normale in una fase di crescita programmata.";
  } else if (weightDown && waistUp) {
    label = "Da verificare"; tone = "warn";
    detail = "Peso giù ma vita su: dato incoerente, possibile misurazione imprecisa o perdita di massa magra — vale la pena approfondire.";
  } else {
    label = "Stallo"; tone = "neutral";
    detail = "Peso e vita sostanzialmente invariati nel periodo osservato.";
  }
  return { label, detail, tone, weightDeltaPct, waistDeltaPct };
}

export { MUSCLE_TARGETS, MUSCLES, DEFAULT_EXERCISE_LIB, EXERCISE_LIB_MUSCLE_TO_DB, DB_MUSCLE_TO_CHART, resolveMuscleTarget, fetchExerciseLibrary, learnExercise, saveExerciseGuide, computeVolume, parseRepsTarget };

// Giorni con un allenamento REALMENTE completato (status 'done' in
// workout_logs) in un range — per il pallino "saltato" nel calendario
// Allenamento della Home: prima era un pattern finto (~1 giorno su 5), ora
// legge lo storico vero, mai un dato inventato.
export async function fetchWorkoutDoneDates(supabase, userId, fromISO, toISO) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("date, status")
    .eq("user_id", userId)
    .gte("date", fromISO)
    .lte("date", toISO);
  if (error) throw error;
  const doneDates = new Set();
  (data ?? []).forEach((r) => { if (r.status === "done") doneDates.add(r.date); });
  return doneDates;
}

// Giorni con ALMENO un pasto registrato in un range — per il pallino
// "non registrato" nel calendario Alimentazione della Home.
export async function fetchNutritionLoggedDates(supabase, userId, fromISO, toISO) {
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("date")
    .eq("user_id", userId)
    .gte("date", fromISO)
    .lte("date", toISO);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.date));
}

// BUG PRESO: aprire una chat/feed realtime, chiuderla e riaprirla subito
// (o due componenti che montano lo stesso topic quasi in contemporanea)
// poteva far crashare l'INTERA app con una schermata nera. Causa: se un
// canale con lo stesso nome esisteva già lato client (la rimozione del
// montaggio precedente non aveva ancora completato), supabase-js riusa
// quell'oggetto invece di crearne uno nuovo — chiamare di nuovo .on() su un
// canale già sottoscritto lancia un errore NON catturabile (non una
// Promise rifiutata, un throw sincrono dentro la libreria) che risale fino
// a far cadere tutto l'albero React. Usata da ChatThread.jsx e
// 06_NewsTipsView.jsx: rimuove esplicitamente qualunque canale residuo con
// lo stesso nome prima di crearne uno nuovo, eliminando la collisione.
export function freshRealtimeChannel(supabase, topicName) {
  const fullTopic = `realtime:${topicName}`;
  const existing = supabase.getChannels().find((c) => c.topic === fullTopic);
  if (existing) supabase.removeChannel(existing);
  return supabase.channel(topicName);
}

/* ---------------------------------------------------------------------------
   CHAT COACH <-> CLIENTE (SCHEMA_v48) — una sola conversazione per cliente,
   client_id la identifica sempre, sender_id distingue chi ha scritto.
   ------------------------------------------------------------------------- */

export async function fetchChatMessages(supabase, clientId, limit = 300) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, client_id, sender_id, body, attachment_path, attachment_type, attachment_name, created_at, read_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// `attachment` opzionale: { path, type, name } da uploadChatAttachment. Un
// messaggio può avere solo testo, solo allegato, o entrambi (es. foto con
// didascalia) — mai i due null insieme (vincolo anche lato DB, SCHEMA_v50).
export async function sendChatMessage(supabase, clientId, senderId, body, attachment = null) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      client_id: clientId, sender_id: senderId, body: body || null,
      attachment_path: attachment?.path || null, attachment_type: attachment?.type || null, attachment_name: attachment?.name || null,
    })
    .select("id, client_id, sender_id, body, attachment_path, attachment_type, attachment_name, created_at, read_at")
    .single();
  if (error) throw error;
  return data;
}

// Inbox chat del coach: una riga per cliente con coaching reale (Scheda
// Personalizzata/Coaching Allenamento/Full Coaching — Free/Premium non hanno
// una conversazione), con l'ultimo messaggio e il conteggio dei non letti,
// stile WhatsApp. Il coach non ha "una" conversazione come il cliente: ne
// ha una per ciascuno, qui elencate tutte insieme.
export async function fetchCoachChatInbox(supabase, coachId) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, nickname, full_name")
    .eq("role", "user")
    .in("plan", ["scheda_personalizzata", "training", "full"]);
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const rows = await Promise.all(profiles.map(async (p) => {
    const [{ data: lastRows }, { count: unreadCount }] = await Promise.all([
      supabase.from("chat_messages").select("body, attachment_type, sender_id, created_at")
        .eq("client_id", p.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("chat_messages").select("id", { count: "exact", head: true })
        .eq("client_id", p.id).neq("sender_id", coachId).is("read_at", null),
    ]);
    const last = lastRows?.[0] || null;
    return {
      id: p.id,
      name: p.full_name || p.nickname || "Atleta",
      lastMessage: last ? (last.body || (last.attachment_type ? "📎 Allegato" : null)) : null,
      lastMessageAt: last?.created_at || null,
      lastMessageMine: last ? last.sender_id === coachId : false,
      unreadCount: unreadCount || 0,
    };
  }));

  // Più recente prima (stile WhatsApp); chi non ha ancora scritto niente in fondo, per nome.
  return rows.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name, "it");
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

// Segna come letti solo i messaggi dell'ALTRA parte (mai i propri) — chiamata
// quando il thread viene aperto, sia lato cliente sia lato coach.
export async function markChatMessagesRead(supabase, clientId, readerId) {
  const { error } = await supabase
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .neq("sender_id", readerId)
    .is("read_at", null);
  if (error) throw error;
}

// Allegati chat (SCHEMA_v50): bucket privato "chat-attachments", stesso
// pattern path "{clientId}/..." di technique-videos — qui però scrivono
// entrambi i lati della conversazione (client E coach), non solo il
// cliente, quindi il path resta sempre quello del CLIENTE della
// conversazione (clientId), non di chi sta scrivendo (senderId).
export async function uploadChatAttachment(supabase, clientId, file, kind) {
  const ext = (file.name?.split(".").pop() || (kind === "audio" ? "webm" : "bin")).toLowerCase();
  const path = `${clientId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function getChatAttachmentUrl(supabase, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 3600);
  if (error) { console.error("PERFORM: errore signed url allegato chat", error); return null; }
  return data?.signedUrl ?? null;
}

/* ---------------------------------------------------------------------------
   VIDEO-CHECK TECNICA ESECUZIONE (SCHEMA_v49) — il cliente carica un video
   breve di un esercizio, il coach lo guarda e lascia un commento. Bucket
   privato "technique-videos", stesso pattern di checkin-photos (SCHEMA_v36):
   path "{userId}/...", mai un URL pubblico permanente, sempre firmato al
   momento della lettura.
   ------------------------------------------------------------------------- */

export async function uploadTechniqueVideo(supabase, userId, file) {
  const ext = (file.name?.split(".").pop() || "mp4").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("technique-videos").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function getTechniqueVideoUrl(supabase, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("technique-videos").createSignedUrl(path, 3600);
  if (error) { console.error("PERFORM: errore signed url video tecnica", error); return null; }
  return data?.signedUrl ?? null;
}

export async function saveTechniqueVideo(supabase, clientId, exerciseName, videoPath, note) {
  const { data, error } = await supabase
    .from("technique_videos")
    .insert({ client_id: clientId, exercise_name: exerciseName, video_path: videoPath, note: note || null })
    .select("id, client_id, exercise_name, video_path, note, coach_comment, coach_comment_at, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTechniqueVideos(supabase, clientId) {
  const { data, error } = await supabase
    .from("technique_videos")
    .select("id, client_id, exercise_name, video_path, note, coach_comment, coach_comment_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveTechniqueVideoComment(supabase, videoId, comment) {
  const { error } = await supabase
    .from("technique_videos")
    .update({ coach_comment: comment, coach_comment_at: new Date().toISOString() })
    .eq("id", videoId);
  if (error) throw error;
}

// Cancella sia la riga sia il file nello storage — in quest'ordine il file
// resta orfano solo se la delete della riga fallisce (mai il contrario, che
// lascerebbe un riferimento a un file già sparito).
export async function deleteTechniqueVideo(supabase, videoId, videoPath) {
  const { error } = await supabase.from("technique_videos").delete().eq("id", videoId);
  if (error) throw error;
  await supabase.storage.from("technique-videos").remove([videoPath]).catch((err) => {
    console.error("PERFORM: errore rimozione file video tecnica dallo storage", err);
  });
}

// Quanti video di UN cliente aspettano ancora un commento del coach — per il
// pallino "da rivedere" prima ancora di aprire il tab, stesso principio di
// fetchUnreadChatCount.
export async function fetchPendingTechniqueVideoCount(supabase, clientId) {
  const { count, error } = await supabase
    .from("technique_videos")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .is("coach_comment", null);
  if (error) throw error;
  return count ?? 0;
}

// Conteggio messaggi non letti di UNA conversazione, dal punto di vista di
// chi legge (readerId) — per un pallino "nuovo messaggio" sul tab Chat prima
// ancora di aprirlo, sia lato coach sia lato cliente.
export async function fetchUnreadChatCount(supabase, clientId, readerId) {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .is("read_at", null)
    .neq("sender_id", readerId);
  if (error) throw error;
  return count ?? 0;
}
