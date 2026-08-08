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

/* ---------------------------------------------------------------------------
   LETTURA — lato cliente (Home)
   ------------------------------------------------------------------------- */

// Target macro/kcal attivi oggi per un giorno ON o OFF: la riga più recente
// con effective_from <= oggi. Ritorna null se il coach non ha ancora assegnato nulla.
export async function fetchActiveNutritionTarget(supabase, userId, dayType) {
  const today = new Date().toISOString().slice(0, 10);
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

// Scheda assegnata dal coach per un intervallo di date: righe is_read_only=true.
// Le raggruppa per data così da poter costruire il weekPlan di HomeDashboard.
export async function fetchAssignedWorkouts(supabase, userId, fromDateISO, toDateISO) {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, date, split_label, exercise_name, muscle_target, sets_count, reps_completed, load_kg, rir, intensity_technique, status, is_read_only")
    .eq("user_id", userId)
    .gte("date", fromDateISO)
    .lte("date", toDateISO)
    .order("date", { ascending: true });
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

/* ---------------------------------------------------------------------------
   SCRITTURA — lato coach (pannello di assegnazione)
   ------------------------------------------------------------------------- */

// Ogni RLS su queste tabelle richiede is_coach() per l'insert su nutrition_targets
// e per scrivere workout_logs a nome di un altro utente: se chi chiama non è il
// coach, Supabase stessa rifiuta la scrittura (non serve ricontrollarlo qui).

export async function assignNutritionTarget(supabase, {
  coachId, clientId, dayType, kcal, protein, carbs, fat, effectiveFrom,
}) {
  const { error } = await supabase.from("nutrition_targets").insert({
    user_id: clientId,
    day_type: dayType,
    kcal, protein, carbs, fat,
    effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
    set_by: coachId,
  });
  if (error) throw error;
}

export async function assignWorkoutExercise(supabase, {
  clientId, date, splitLabel, exerciseName, muscleTarget, setsCount, intensityTechnique,
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
    intensity_technique: intensityTechnique || null,
    status: "missed",       // diventa 'done' quando il cliente compila la sessione
    is_read_only: true,     // è una prescrizione del coach, non un log libero del cliente
  });
  if (error) throw error;
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

export { MUSCLE_TARGETS };
