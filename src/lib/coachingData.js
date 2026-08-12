/* ============================================================================
   coachingData.js — livello dati reale, coerente 1:1 con lo schema SQL v11 + v12
   ----------------------------------------------------------------------------
   Nessuna query qui indovina nomi di colonne: ogni campo corrisponde esattamente
   a quanto definito in nutrition_targets, workout_logs, profiles.
   ========================================================================== */

const MUSCLE_TARGETS = [
  "Pettorali", "Gran Dorsale", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];

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
    .select("date, sleep_start, sleep_end, sleep_hours, steps, hrv_ms, rhr_bpm")
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
function dayNutritionScore(logsTotals, target) {
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
    .select("id, date, split_label, exercise_name, muscle_target, sets_count, reps_target, rest_seconds, rir_target, reps_completed, load_kg, rir, intensity_technique, status, is_read_only")
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
    .select("id, moment, name, dose, sort_order")
    .eq("user_id", userId)
    .order("moment", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
  const { data: recentLogs, error: recentError } = await supabase
    .from("workout_logs")
    .select("date")
    .eq("user_id", userId)
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

  const pct = progression === "negative" ? Math.round(completionPct * 0.75) : completionPct;
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
    (sec.items ?? []).forEach((it, i) => {
      if (!it.name || !it.name.trim()) return;
      rows.push({ user_id: clientId, coach_id: coachId, moment: sec.title, name: it.name.trim(), dose: it.dose || null, sort_order: i });
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
export const XP_LEVELS = [
  { level: 0, minXp: 0,     title: "RECRUIT",       icon: "🌱" },
  { level: 1, minXp: 1000,  title: "HARDWORKER",    icon: "💪" },
  { level: 2, minXp: 3000,  title: "IRON MIND",     icon: "🧠" },
  { level: 3, minXp: 7000,  title: "BIO-HACKER",    icon: "🧬" },
  { level: 4, minXp: 15000, title: "LIVELLO ÉLITE", icon: "🏆" },
];

// XP totale → { level, title, icon, xpInLevel, xpNeeded, isMaxLevel }. Usata
// sia in Home che in Profilo che nel pannello coach — mai un secondo calcolo.
export function xpToLevelInfo(xpTotal) {
  const xp = Math.max(0, Number(xpTotal) || 0);
  let idx = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) { if (xp >= XP_LEVELS[i].minXp) idx = i; }
  const cur = XP_LEVELS[idx];
  const next = XP_LEVELS[idx + 1] || null;
  return {
    level: cur.level,
    title: cur.title,
    icon: cur.icon,
    xp,
    xpInLevel: xp - cur.minXp,
    xpNeeded: next ? next.minXp - xp : 0,
    xpForNextLevel: next ? next.minXp - cur.minXp : null,
    isMaxLevel: !next,
  };
}

// Una giornata "completa" ai fini dello streak: allenamento fatto SE era
// previsto (nessuna scheda quel giorno = riposo, non penalizza), più almeno
// un pasto registrato, più sonno e passi registrati. Le stesse 3 condizioni
// alimentano sia lo streak (giorni consecutivi) sia un bonus XP per-giorno.
function isDayComplete(dateISO, { nutritionDays, metricsDays, workoutStatusByDate }) {
  const status = workoutStatusByDate.get(dateISO);
  const workoutOk = status === undefined || status === "done";
  return workoutOk && nutritionDays.has(dateISO) && metricsDays.has(dateISO);
}

// Ricalcola XP totale e streak corrente di un cliente dai dati reali già
// salvati (workout_sets, nutrition_logs, daily_metrics, workout_logs,
// xp_bonuses) e li scrive in cache su profiles. Ritorna sempre il valore
// appena calcolato, anche se la scrittura di cache fallisce (best-effort: un
// problema di permessi sulla cache non deve rompere la UI che lo mostra).
export async function computeRealXpAndStreak(supabase, userId) {
  const { data: profileRow } = await supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle();
  const sinceDate = profileRow?.created_at ? toLocalISODate(new Date(profileRow.created_at)) : "2020-01-01";
  const today = toLocalISODate();

  const [{ data: setsRows, error: setsError }, { data: nutriRows, error: nutriError },
    { data: metricsRows, error: metricsError }, { data: workoutRows, error: workoutError },
    { data: bonusRows, error: bonusError }] = await Promise.all([
    supabase.from("workout_sets").select("id").eq("user_id", userId).not("reps_completed", "is", null).gte("completed_at", sinceDate),
    supabase.from("nutrition_logs").select("date").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("daily_metrics").select("date, sleep_hours, steps").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("workout_logs").select("date, status").eq("user_id", userId).gte("date", sinceDate),
    supabase.from("xp_bonuses").select("amount").eq("user_id", userId),
  ]);
  if (setsError) throw setsError;
  if (nutriError) throw nutriError;
  if (metricsError) throw metricsError;
  if (workoutError) throw workoutError;
  if (bonusError) throw bonusError;

  const nutritionDays = new Set((nutriRows ?? []).map((r) => r.date));
  const metricsDays = new Set((metricsRows ?? []).filter((r) => r.sleep_hours != null && r.steps != null).map((r) => r.date));
  const workoutStatusByDate = new Map((workoutRows ?? []).map((r) => [r.date, r.status]));
  const ctx = { nutritionDays, metricsDays, workoutStatusByDate };

  // Streak: giorni consecutivi completi risalendo da oggi. Se oggi non è
  // ancora completo la giornata è semplicemente "ancora aperta" e non rompe
  // lo streak — si riparte da ieri, come nel comportamento già in uso prima.
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00`);
  if (!isDayComplete(today, ctx)) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    const d = toLocalISODate(cursor);
    if (d < sinceDate || !isDayComplete(d, ctx)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
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

  try {
    await supabase.from("profiles").update({ xp_total: xpTotal, current_streak: streak }).eq("id", userId);
  } catch (err) {
    console.error("PERFORM: impossibile aggiornare la cache XP/streak su profiles", err);
  }

  return { xpTotal, streak };
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

// Roster reale per l'Hub Atleti del pannello coach: combina profiles + ultimo
// checkin + anamnesi in una forma compatibile con l'interfaccia già costruita.
// Campi non ancora tracciabili da nessuna tabella reale (adherence, rings,
// prs, evening) restano a un valore neutro di default — NON sono inventati,
// sono segnalati come 0/vuoto finché non viene costruita la fonte dati vera
// (checkins serali, calcolo aderenza da workout_sets, PR da workout_sets).
export async function fetchClientRoster(supabase) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, full_name, email, gender, role, xp_total, current_streak, plan, client_status, last_activity, created_at")
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
        age: answers.eta ?? null,
        birthDate: null,
        heightCm: answers.heightCm ?? null,
        bodyFatPct: answers.bodyFatPct ?? null,
        activity: answers.activity ?? null,
        foodLikes: answers.foodLikes ?? [],
        foodDislikes: answers.foodDislikes ?? [],
        email: p.email,
        lastCheck: last ? { weight: Number(last.weight) } : { weight: null },
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

export { MUSCLE_TARGETS };
