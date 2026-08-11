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
    .select("id, date, split_label, exercise_name, muscle_target, sets_count, reps_target, rest_seconds, reps_completed, load_kg, rir, intensity_technique, status, is_read_only")
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
  clientId, date, splitLabel, exerciseName, muscleTarget, setsCount, repsTarget, restSeconds, intensityTechnique,
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
    .select("id, date, split_label, exercise_name, muscle_target, sets_count, reps_target, rest_seconds, intensity_technique")
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
        technique: r.intensity_technique || "Nessuna",
        muscleTarget: r.muscle_target,
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
        sets_count: ex.sets,
        reps_target: ex.reps || null,
        rest_seconds: ex.rest ?? null,
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
    .select("date, split_label, exercise_name, muscle_target, sets_count, reps_target, rest_seconds, intensity_technique")
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
        sets: r.sets_count,
        reps: r.reps_target || "",
        rest: r.rest_seconds ?? 0,
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
