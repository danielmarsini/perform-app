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
  "Pettorali", "Gran Dorsale", "Lombari", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];

// Piani che indicano un coaching REALE dietro (non autogestito): Scheda
// Personalizzata, Coaching Allenamento, Full Coaching. Fonte unica sul
// valore GREZZO di profiles.plan (check constraint SCHEMA_v14) — prima
// esistevano tre condizioni indipendenti con lo stesso intento ma domini
// diversi (09_CoachDashboard.jsx confrontava il valore grezzo del DB,
// App.jsx e 05_HomeDashboard.jsx confrontavano "full_coaching" dopo la
// propria rimappatura locale di "full"), un foot-gun silenzioso per chi
// copiava la condizione da un file all'altro senza accorgersi del
// rimappaggio. Chi lavora sul valore già rimappato lato UI usa
// isRealCoachingPlan() qui sotto invece di un secondo Set hardcoded.
export const REAL_COACHING_PLANS_DB = new Set(["scheda_personalizzata", "training", "full"]);
export function isRealCoachingPlan(plan) {
  return REAL_COACHING_PLANS_DB.has(plan === "full_coaching" ? "full" : plan);
}

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
// workout_logs.muscle_target, con nomi estesi diversi in 6 casi su 15.
// "Lombari" (richiesto esplicitamente, insieme ad "Addominali" — già
// presente da prima come "Addome"/"Addominali", solo i lombari mancavano
// davvero) coincide col nome esteso, come Trapezio/Bicipiti/ecc.: nessuna
// voce nuova serve in EXERCISE_LIB_MUSCLE_TO_DB qui sotto.
const MUSCLES = ["Petto", "Trapezio", "Dorsali", "Lombari", "Deltoide Ant", "Deltoide Lat", "Deltoide Post", "Bicipiti", "Tricipiti", "Quadricipiti", "Femorali", "Adduttori", "Glutei", "Polpacci", "Addominali"];

const DEFAULT_EXERCISE_LIB = {
  "Panca piana bilanciere": { direct: ["Petto"], indirect: ["Tricipiti", "Deltoide Ant"] },
  "Lento avanti manubri": { direct: ["Deltoide Ant"], indirect: ["Deltoide Lat", "Tricipiti"] },
  "Croci ai cavi": { direct: ["Petto"], indirect: ["Deltoide Ant"] },
  "French press EZ": { direct: ["Tricipiti"], indirect: [] },
  "Alzate laterali": { direct: ["Deltoide Lat"], indirect: [] },
  "Lat machine": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post"] },
  "Rematore bilanciere": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post", "Trapezio"] },
  "Iperestensioni": { direct: ["Lombari"], indirect: ["Glutei", "Femorali"] },
  "Stacco da terra": { direct: ["Lombari"], indirect: ["Dorsali", "Glutei", "Femorali", "Trapezio"] },
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
  let { data, error } = await supabase.from("exercise_library").select("name, direct, indirect, how_to, avoid, video_url");
  // BUG PRESO: se SCHEMA_v61 non è ancora stato eseguito (colonne guida
  // assenti), questa select falliva IN BLOCCO — sparivano non solo how_to/
  // avoid/video_url ma anche i muscoli target/sinergici di OGNI esercizio
  // personalizzato già salvato, perché si tornava a DEFAULT_EXERCISE_LIB
  // vuoto. Ora, solo in questo caso specifico, ripiega su una select senza
  // le colonne guida — la parte che serve subito (muscoli) non va più persa.
  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ data, error } = await supabase.from("exercise_library").select("name, direct, indirect"));
  }
  if (error) { console.error("PERFORM: errore lettura libreria esercizi", error); return lib; }
  (data ?? []).forEach((row) => {
    lib[row.name] = { direct: row.direct ?? [], indirect: row.indirect ?? [],
      howTo: row.how_to || null, avoid: row.avoid || null, videoUrl: row.video_url || null };
  });
  return lib;
}

// on conflict do nothing: una voce già presente non va mai sovrascritta da
// un secondo inserimento — il primo che l'ha definita resta quello valido.
// BUG PRESO: l'errore veniva solo loggato in console, mai propagato — il
// chiamante marcava "salvato" comunque anche quando la scrittura falliva
// davvero (es. SCHEMA_v61 non ancora eseguito su questo progetto), dando
// un falso successo. Ora rilancia, come richiesto dalla convenzione in
// cima a questo file (§03 "Fiducia attraverso la correttezza").
async function learnExercise(supabase, name, direct, indirect, userId) {
  if (!name?.trim() || !direct?.length) return;
  const { error } = await supabase.from("exercise_library")
    .insert({ name: name.trim(), direct, indirect: indirect || [], created_by: userId || null })
    .select().maybeSingle();
  if (error && error.code !== "23505") throw error; // 23505 = già esiste, atteso e ok
}

// SCHEMA_v61: a differenza di learnExercise (insert-only, mai sovrascrive),
// questa è la scrittura editoriale del coach — how_to/avoid/video_url
// SOSTITUISCONO il valore precedente per lo stesso esercizio (upsert su
// name), riutilizzabili subito da qualunque cliente dell'app. La RLS lato
// server ("exercise_library_update", SCHEMA_v61) accetta la scrittura solo
// se chi chiama è davvero il coach: un cliente che invocasse questa
// funzione otterrebbe comunque un errore di permessi, questo controllo qui
// è solo per non tentare la chiamata da una UI che non dovrebbe esporla.
// BUG PRESO: l'errore veniva solo loggato in console, mai propagato — il
// coach vedeva sempre "✓ Salvato in libreria" (saveExerciseToLib in
// 09_CoachDashboard.jsx marcava il salvataggio riuscito a prescindere,
// perché la promise non falliva mai) anche quando la scrittura falliva
// davvero — es. SCHEMA_v61 non ancora eseguito su questo progetto (colonne
// how_to/avoid/video_url mancanti, o RLS/grant "exercise_library_update"
// assenti). L'esercizio spariva così dalla libreria condivisa al prossimo
// caricamento, mai un errore vero comunicato — esattamente il sintomo
// segnalato ("non lo salva"). Ora rilancia sempre un errore reale, tranne
// quando le colonne guida non esistono ancora (SCHEMA_v61 non eseguito):
// in quel caso ripiega su un upsert senza le colonne guida, così muscoli
// target/sinergici — la parte che serve SUBITO per il grafico volumi e per
// riassegnare l'esercizio ad altri clienti — si salvano comunque, mentre la
// guida testuale resta rimandata a dopo la migrazione. Il codice reale
// restituito da Supabase in questo caso è "PGRST204" ("Could not find the
// 'x' column... in the schema cache", errore di PostgREST prima ancora di
// arrivare al DB) — 42703 è il codice Postgres nativo per lo stesso
// problema mai raggiunto qui, tenuto come rete di sicurezza aggiuntiva.
async function saveExerciseGuide(supabase, name, direct, indirect, { howTo, avoid, videoUrl }, coachId) {
  if (!name?.trim() || !direct?.length) return;
  const { error } = await supabase.from("exercise_library")
    .upsert({ name: name.trim(), direct, indirect: indirect || [],
      how_to: howTo || null, avoid: avoid || null, video_url: videoUrl || null,
      created_by: coachId || null }, { onConflict: "name" })
    .select().maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await supabase.from("exercise_library")
      .upsert({ name: name.trim(), direct, indirect: indirect || [], created_by: coachId || null }, { onConflict: "name" })
      .select().maybeSingle();
    if (fallback.error) throw fallback.error;
    return;
  }
  if (error) throw error;
}

// Elenco SOLO delle righe reali in libreria (mai i ~20 esercizi di base
// hardcoded in DEFAULT_EXERCISE_LIB, che non esistono come riga da
// correggere/eliminare) — usato dal pannello coach per rivedere un
// esercizio personalizzato già salvato: nome sbagliato o dimenticato,
// muscoli da rivedere, o un doppione da eliminare.
async function fetchCustomExerciseLibraryRows(supabase) {
  let { data, error } = await supabase.from("exercise_library")
    .select("name, direct, indirect, how_to, avoid, video_url")
    .order("name");
  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ data, error } = await supabase.from("exercise_library").select("name, direct, indirect").order("name"));
  }
  if (error) throw error;
  return (data ?? []).map((row) => ({
    name: row.name, direct: row.direct ?? [], indirect: row.indirect ?? [],
    howTo: row.how_to || null, avoid: row.avoid || null, videoUrl: row.video_url || null,
  }));
}

// Corregge una riga già in libreria — rinomina inclusa: "name" è la primary
// key, quindi questo è un UPDATE sulla riga esistente (WHERE name = vecchio
// nome), mai un nuovo insert. Prima l'unico modo di "correggere" un
// esercizio era risalvarlo con "Salva in libreria" (upsert per NOME): se il
// coach si era sbagliato proprio nel nome, la vecchia riga sbagliata restava
// lì per sempre, orfana — un doppione senza modo di ripulirlo. Se il nuovo
// nome coincide con un esercizio già esistente, Postgres rifiuta l'update
// con 23505 (violazione della chiave primaria) — tradotto in un errore
// leggibile invece di un semplice fallimento.
async function updateExerciseLibraryEntry(supabase, oldName, { name, direct, indirect, howTo, avoid, videoUrl }) {
  const trimmed = name?.trim();
  if (!trimmed || !direct?.length) return;
  const patch = { name: trimmed, direct, indirect: indirect || [],
    how_to: howTo || null, avoid: avoid || null, video_url: videoUrl || null };
  let { error } = await supabase.from("exercise_library").update(patch).eq("name", oldName);
  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ error } = await supabase.from("exercise_library")
      .update({ name: trimmed, direct, indirect: indirect || [] }).eq("name", oldName));
  }
  if (error?.code === "23505") {
    throw new Error(`Esiste già un esercizio chiamato "${trimmed}" in libreria: elimina quello doppione o scegli un altro nome.`);
  }
  if (error) throw error;
}

// Elimina una voce sbagliata/doppione dalla libreria condivisa — SCHEMA_v72
// (RLS: solo il coach, come l'update di SCHEMA_v61).
async function deleteExerciseFromLibrary(supabase, name) {
  const { error } = await supabase.from("exercise_library").delete().eq("name", name);
  if (error) throw error;
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
// Media degli ultimi giorni EFFETTIVI (max 7) fino a IERI — mai oggi, A MENO
// che oggi non abbia già sonno/passi registrati: allora entra subito nella
// finestra al posto del giorno più vecchio, così il cerchio si muove nello
// stesso momento in cui si registra qualcosa, non il giorno dopo. Un giorno
// ancora in corso e completamente vuoto non ha invece "fallito" solo perché
// non ancora registrato, contarlo abbasserebbe la media in modo scorretto.
//
// 2 ORE DI GRAZIA dopo mezzanotte (recoveryWindowEndISO): chi si sveglia
// presto e registra il sonno della notte appena finita subito dopo la
// mezzanotte non deve vedersi giudicare "ieri" come già perso — solo dopo le
// 2 di notte un "ieri" ancora vuoto conta davvero come giornata non
// registrata e abbassa la percentuale.
//
// La finestra non parte mai prima della data di iscrizione (profiles.created_at):
// un atleta iscritto da 3 giorni viene valutato sui suoi 3 giorni reali, non
// su una finestra fissa di 7 che include giorni in cui l'account non esisteva
// ancora (zeri che non gli appartengono). Se oggi è il giorno stesso
// dell'iscrizione, nessun giorno valutabile esiste ancora: stato neutro.
//
function recoveryWindowEndISO(includeToday) {
  const todayISO = toLocalISODate();
  if (includeToday) return todayISO;
  const graceShifted = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const effectiveToday = toLocalISODate(graceShifted);
  const d = new Date(`${effectiveToday}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}
//
// SOLO passi e sonno — non il dolore (nessun check-in reale collegato
// ancora) e non HRV/RHR (nessuna fonte reale finché non c'è un device
// collegato: colonne già pronte in daily_metrics, semplicemente vuote).
// Soglie: 7h di sonno e 8.000 passi = punteggio pieno per quel giorno,
// lineare sotto soglia. Un giorno reale non tracciato vale comunque 0 (pesa
// come "non hai recuperato bene", nessuna penalità di frequenza a parte) —
// solo i giorni STRUTTURALMENTE non valutabili (oggi, pre-iscrizione) sono
// esclusi, non i buchi nel tracking di un giorno realmente vissuto. Se TUTTI
// i giorni della finestra sono completamente vuoti, torna null — stato
// neutro esplicito, mai uno 0% che sembra un allarme.
function recoverySleepScore(hours) {
  if (!hours || hours <= 0) return 0;
  return Math.min(100, Math.round((hours / 7) * 100));
}
function recoveryStepsScore(steps) {
  if (!steps || steps <= 0) return 0;
  return Math.min(100, Math.round((steps / 8000) * 100));
}
// Logica pura, estratta così che la versione singolo-cliente e quella
// batch (vedi computeBatchRecoveryCompliance) restino UNA sola fonte di
// verità per il punteggio — mai due formule copiate che rischiano di
// disallinearsi in futuro.
function recoveryComplianceFromRows(rows, windowStartISO, windowEndISO) {
  if (windowStartISO > windowEndISO) {
    return { status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0, windowDays: 0 };
  }
  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));
  const days = [];
  for (let d = new Date(`${windowStartISO}T00:00:00`); toLocalISODate(d) <= windowEndISO; d.setDate(d.getDate() + 1)) {
    days.push(toLocalISODate(d));
  }
  const sleepVals = days.map((d) => Number(byDate.get(d)?.sleep_hours) || 0);
  const stepsVals = days.map((d) => Number(byDate.get(d)?.steps) || 0);

  const allUntracked = sleepVals.every((h) => !h) && stepsVals.every((s) => !s);
  if (allUntracked) return { status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0, windowDays: days.length };

  const n = days.length;
  const total = sleepVals.reduce((sum, h, i) => sum + (recoverySleepScore(h) + recoveryStepsScore(stepsVals[i])) / 2, 0);
  const pct = Math.max(0, Math.min(100, Math.round(total / n)));
  const trackedDays = sleepVals.filter((h) => h > 0).length;
  const sleepAvg = Math.round((sleepVals.reduce((a, b) => a + b, 0) / n) * 10) / 10;
  const stepsAvg = Math.round(stepsVals.reduce((a, b) => a + b, 0) / n);
  return { status: "ok", pct, sleepAvg, stepsAvg, trackedDays, windowDays: n };
}
export async function computeRecoveryCompliance(supabase, userId) {
  const todayISO = toLocalISODate();
  const { data: todayRow, error: todayError } = await supabase
    .from("daily_metrics").select("sleep_hours, steps").eq("user_id", userId).eq("date", todayISO).maybeSingle();
  if (todayError) throw todayError;
  const todayHasData = !!(todayRow && (Number(todayRow.sleep_hours) > 0 || Number(todayRow.steps) > 0));

  const windowEndISO = recoveryWindowEndISO(todayHasData);
  const endDate = new Date(`${windowEndISO}T00:00:00`);
  const sevenAgo = new Date(endDate);
  sevenAgo.setDate(sevenAgo.getDate() - 6);

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles").select("created_at").eq("id", userId).maybeSingle();
  if (profileError) throw profileError;
  const joinedISO = profileRow?.created_at ? toLocalISODate(new Date(profileRow.created_at)) : null;
  const windowStartISO = joinedISO && joinedISO > toLocalISODate(sevenAgo) ? joinedISO : toLocalISODate(sevenAgo);

  if (windowStartISO > windowEndISO) {
    return recoveryComplianceFromRows([], windowStartISO, windowEndISO);
  }

  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date, sleep_hours, steps")
    .eq("user_id", userId)
    .gte("date", windowStartISO)
    .lte("date", windowEndISO);
  if (error) throw error;
  return recoveryComplianceFromRows(data, windowStartISO, windowEndISO);
}

// Stessa identica formula di computeRecoveryCompliance ma per N clienti in
// un colpo solo: 2 query totali (profiles + daily_metrics) invece di 2×N.
// Pensata per Hub Atleti, dove la lista clienti chiamava questa funzione una
// volta per riga (60-90+ query per 20-30 clienti solo per disegnare 3
// pallini). Ogni cliente mantiene la propria finestra, clampata sulla
// propria data di iscrizione esattamente come nella versione singola —
// solo le query sono condivise, mai il calcolo.
export async function computeBatchRecoveryCompliance(supabase, userIds) {
  const results = new Map();
  if (!userIds || userIds.length === 0) return results;

  const todayISO = toLocalISODate();
  // Stessa reattività della versione singolo-cliente: chi ha già registrato
  // sonno o passi oggi vede oggi entrare subito nella propria finestra —
  // un'unica query di controllo per tutto il roster, non una per cliente.
  const { data: todayRows, error: todayError } = await supabase
    .from("daily_metrics").select("user_id, sleep_hours, steps").in("user_id", userIds).eq("date", todayISO);
  if (todayError) throw todayError;
  const usersWithTodayData = new Set(
    (todayRows ?? []).filter((r) => Number(r.sleep_hours) > 0 || Number(r.steps) > 0).map((r) => r.user_id)
  );

  const globalWindowEndISO = recoveryWindowEndISO(false);
  // Il range di fetch condiviso copre il caso più ampio (fino a oggi, se
  // qualcuno lo ha già registrato); ogni cliente userà comunque il proprio
  // windowEndISO (oggi o il normale fine-finestra con grazia) qui sotto.
  const globalFetchEndISO = usersWithTodayData.size > 0 ? todayISO : globalWindowEndISO;
  const fetchEndDate = new Date(`${globalFetchEndISO}T00:00:00`);
  const globalFetchStart = new Date(fetchEndDate);
  globalFetchStart.setDate(globalFetchStart.getDate() - 6);
  const globalFetchStartISO = toLocalISODate(globalFetchStart);

  const { data: profiles, error: profileError } = await supabase
    .from("profiles").select("id, created_at").in("id", userIds);
  if (profileError) throw profileError;
  const joinedByUser = new Map((profiles ?? []).map((p) => [p.id, p.created_at ? toLocalISODate(new Date(p.created_at)) : null]));

  const { data: metrics, error: metricsError } = await supabase
    .from("daily_metrics")
    .select("user_id, date, sleep_hours, steps")
    .in("user_id", userIds)
    .gte("date", globalFetchStartISO)
    .lte("date", globalFetchEndISO);
  if (metricsError) throw metricsError;

  const rowsByUser = new Map(userIds.map((id) => [id, []]));
  for (const row of metrics ?? []) {
    if (rowsByUser.has(row.user_id)) rowsByUser.get(row.user_id).push(row);
  }

  for (const userId of userIds) {
    const windowEndISO = usersWithTodayData.has(userId) ? todayISO : globalWindowEndISO;
    const endDate = new Date(`${windowEndISO}T00:00:00`);
    const userSevenAgo = new Date(endDate);
    userSevenAgo.setDate(userSevenAgo.getDate() - 6);
    const userWindowStartISO = toLocalISODate(userSevenAgo);
    const joinedISO = joinedByUser.get(userId) ?? null;
    const windowStartISO = joinedISO && joinedISO > userWindowStartISO ? joinedISO : userWindowStartISO;
    results.set(userId, recoveryComplianceFromRows(rowsByUser.get(userId), windowStartISO, windowEndISO));
  }
  return results;
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

// Abitudini alimentari personali, derivate dagli ultimi `sinceDays` giorni di
// nutrition_logs già salvati (nessuna tabella nuova): per ogni nome esatto di
// alimento, l'ultima quantità in grammi usata e quante volte è stato
// registrato. Usata dal Diario Libero per due cose — precompilare i grammi
// quando si sceglie un alimento già mangiato prima, e proporre per primi
// negli alimenti suggeriti quelli mangiati più spesso: molte persone
// ripetono più o meno sempre le stesse quantità degli stessi alimenti,
// quindi velocizza l'inserimento invece di dover ridigitare gli stessi
// grammi ogni volta.
export async function fetchFoodUsageStats(supabase, userId, sinceDays = 90) {
  const from = new Date();
  from.setDate(from.getDate() - sinceDays);
  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("name, grams, created_at")
    .eq("user_id", userId)
    .gte("date", toLocalISODate(from))
    .not("grams", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const stats = new Map(); // nome alimento -> { lastGrams, count }
  (data ?? []).forEach((r) => {
    const existing = stats.get(r.name);
    if (existing) { existing.count++; return; }
    stats.set(r.name, { lastGrams: Number(r.grams), count: 1 }); // righe più recenti prima: la prima volta che un nome compare È l'ultima quantità usata
  });
  return stats;
}

// Cerchio Alimentazione reale — STESSO principio di computeTrainingCompliance
// e computeRecoveryCompliance: un'unica funzione, chiamata identica da Home
// cliente e ClientDetail coach, legge solo dati già salvati (nutrition_logs
// + nutrition_targets), mai stato locale del form.
//
// Per ciascuno degli ultimi giorni EFFETTIVI (max 7) fino a IERI — mai oggi,
// un giorno ancora in corso non ha "sgarrato" solo perché il diario di oggi è
// ancora vuoto — e mai prima della data di iscrizione (profiles.created_at):
// somma kcal/P/C/G registrati quel giorno (nutrition_logs) e li confronta col
// target attivo per quel giorno (nutrition_targets, effective_from <= quel
// giorno). Il tipo di giorno (ON/OFF) non è salvato da nessuna parte per una
// data passata: lo si deduce dalla presenza di workout_logs in quella data
// (giorno con allenamento assegnato = ON, altrimenti OFF) — stesso segnale
// che l'app usa già altrove per distinguere le due schede.
// Scostamento simmetrico: sia sotto sia sopra target penalizzano allo stesso
// modo (mai punteggio pieno solo perché si è mangiato meno). Un giorno senza
// alcuna registrazione vale 0 (non "va bene", un buco nel diario è un buco) —
// ma solo se quel giorno aveva un target attivo: senza target (prima che
// cliente o coach impostassero un obiettivo) il giorno non entra proprio
// nella media, vedi dayNutritionScore. Se in NESSUNo dei giorni della
// finestra c'è un target attivo, torna neutro esplicito.
//
// TOLLERANZA (non più scostamento millimetrico): dentro il 5% dal target sulle
// kcal e dentro il 10% su ciascun macro preso singolarmente il giorno vale
// punteggio pieno su quella dimensione — nessun atleta reale becca kcal/macro
// esatti tutti i giorni, e pretenderlo avrebbe reso il cerchio impossibile da
// tenere alto anche per chi si segna tutto e mangia bene. Oltre la soglia la
// penalità cresce in modo lineare, mai negativa. Le kcal hanno una tolleranza
// più stretta dei singoli macro perché sono la somma di tutti e tre: un
// margine identico ai macro le avrebbe rese di fatto ininfluenti nel calcolo.
const NUTRITION_TOLERANCE = { kcal: 0.05, p: 0.10, c: 0.10, f: 0.10 };
export function dayNutritionScore(logsTotals, target) {
  if (!target) return null; // nessun target attivo quel giorno: non giudicabile
  const dims = ["kcal", "p", "c", "f"];
  const devs = dims.map((d) => {
    if (!(target[d] > 0)) return 0;
    const tolerance = NUTRITION_TOLERANCE[d];
    const relDev = Math.abs(logsTotals[d] - target[d]) / target[d];
    return Math.max(0, Math.min(1, (relDev - tolerance) / (1 - tolerance)));
  });
  return Math.max(0, Math.min(100, Math.round((1 - devs.reduce((a, b) => a + b, 0) / dims.length) * 100)));
}
// Logica pura (stesso principio di recoveryComplianceFromRows sopra):
// unica fonte di verità condivisa tra la versione singolo-cliente e
// computeBatchNutritionCompliance qui sotto.
function nutritionComplianceFromRows(logs, targets, workouts, fromISO, toISO) {
  if (fromISO > toISO) return { status: "neutral", pct: null, daysScored: 0 };

  const trainingDates = new Set((workouts ?? []).map((w) => w.date));
  // Per ogni day_type, il target con effective_from più recente <= quella data.
  const targetFor = (dateISO, dayType) => {
    const rows = (targets ?? []).filter((t) => t.day_type === dayType && t.effective_from <= dateISO);
    if (rows.length === 0) return null;
    const latest = rows[rows.length - 1]; // già ordinati ascending per effective_from
    return { kcal: Number(latest.kcal), p: Number(latest.protein), c: Number(latest.carbs), f: Number(latest.fat) };
  };

  const days = [];
  for (let d = new Date(`${fromISO}T00:00:00`); toLocalISODate(d) <= toISO; d.setDate(d.getDate() + 1)) {
    days.push(toLocalISODate(d));
  }

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
export async function computeNutritionCompliance(supabase, userId) {
  const todayISO = toLocalISODate();

  // Reattività richiesta: il cerchio si deve muovere SUBITO appena si
  // registra un pasto, non aspettare la mezzanotte — ma una giornata ancora
  // senza NULLA nel diario non deve ancora "sgarrare" solo perché non è
  // finita. Oggi entra nella finestra solo se ha già almeno un pasto loggato.
  const { data: todayLogs, error: todayLogsError } = await supabase
    .from("nutrition_logs").select("id").eq("user_id", userId).eq("date", todayISO).limit(1);
  if (todayLogsError) throw todayLogsError;
  const includeToday = (todayLogs ?? []).length > 0;

  const toDate = new Date(`${todayISO}T00:00:00`);
  if (!includeToday) toDate.setDate(toDate.getDate() - 1);
  const sevenAgo = new Date(toDate);
  sevenAgo.setDate(sevenAgo.getDate() - 6);

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles").select("created_at").eq("id", userId).maybeSingle();
  if (profileError) throw profileError;
  const joinedISO = profileRow?.created_at ? toLocalISODate(new Date(profileRow.created_at)) : null;
  const fromISO = joinedISO && joinedISO > toLocalISODate(sevenAgo) ? joinedISO : toLocalISODate(sevenAgo);
  const toISO = toLocalISODate(toDate);

  if (fromISO > toISO) {
    return { status: "neutral", pct: null, daysScored: 0 };
  }

  const [{ data: logs, error: logsError }, { data: targets, error: targetsError }, { data: workouts, error: workoutsError }] = await Promise.all([
    supabase.from("nutrition_logs").select("date, kcal, protein, carbs, fat").eq("user_id", userId).gte("date", fromISO).lte("date", toISO),
    supabase.from("nutrition_targets").select("day_type, kcal, protein, carbs, fat, effective_from").eq("user_id", userId).lte("effective_from", toISO).order("effective_from", { ascending: true }),
    supabase.from("workout_logs").select("date").eq("user_id", userId).gte("date", fromISO).lte("date", toISO),
  ]);
  if (logsError) throw logsError;
  if (targetsError) throw targetsError;
  if (workoutsError) throw workoutsError;

  return nutritionComplianceFromRows(logs, targets, workouts, fromISO, toISO);
}

// Stessa formula di computeNutritionCompliance per N clienti in un colpo
// solo: 3 query totali invece di 3×N (vedi nota su computeBatchRecoveryCompliance,
// stesso principio).
export async function computeBatchNutritionCompliance(supabase, userIds) {
  const results = new Map();
  if (!userIds || userIds.length === 0) return results;

  const todayISO = toLocalISODate();
  const yesterday = new Date(`${todayISO}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = toLocalISODate(yesterday);

  // Stessa reattività della versione singolo-cliente: chi ha già registrato
  // un pasto oggi vede oggi entrare subito nella propria finestra — un'unica
  // query di controllo per tutto il roster, non una per cliente.
  const { data: todayLogRows, error: todayLogsError } = await supabase
    .from("nutrition_logs").select("user_id").eq("date", todayISO).in("user_id", userIds);
  if (todayLogsError) throw todayLogsError;
  const usersWithTodayLogged = new Set((todayLogRows ?? []).map((r) => r.user_id));

  // Il range di fetch condiviso copre il caso più ampio (fino a oggi, se
  // qualcuno lo ha già registrato); ogni cliente userà comunque il proprio
  // toISO (oggi o ieri) qui sotto.
  const globalToISO = usersWithTodayLogged.size > 0 ? todayISO : yesterdayISO;
  const globalToDate = new Date(`${globalToISO}T00:00:00`);
  const sevenAgo = new Date(globalToDate);
  sevenAgo.setDate(sevenAgo.getDate() - 6);
  const globalFromISO = toLocalISODate(sevenAgo);

  const { data: profiles, error: profileError } = await supabase
    .from("profiles").select("id, created_at").in("id", userIds);
  if (profileError) throw profileError;
  const joinedByUser = new Map((profiles ?? []).map((p) => [p.id, p.created_at ? toLocalISODate(new Date(p.created_at)) : null]));

  const [{ data: logs, error: logsError }, { data: targets, error: targetsError }, { data: workouts, error: workoutsError }] = await Promise.all([
    supabase.from("nutrition_logs").select("user_id, date, kcal, protein, carbs, fat").in("user_id", userIds).gte("date", globalFromISO).lte("date", globalToISO),
    supabase.from("nutrition_targets").select("user_id, day_type, kcal, protein, carbs, fat, effective_from").in("user_id", userIds).lte("effective_from", globalToISO).order("effective_from", { ascending: true }),
    supabase.from("workout_logs").select("user_id, date").in("user_id", userIds).gte("date", globalFromISO).lte("date", globalToISO),
  ]);
  if (logsError) throw logsError;
  if (targetsError) throw targetsError;
  if (workoutsError) throw workoutsError;

  const groupByUser = (rows) => {
    const map = new Map(userIds.map((id) => [id, []]));
    for (const row of rows ?? []) if (map.has(row.user_id)) map.get(row.user_id).push(row);
    return map;
  };
  const logsByUser = groupByUser(logs);
  const targetsByUser = groupByUser(targets);
  const workoutsByUser = groupByUser(workouts);

  for (const userId of userIds) {
    const toISO = usersWithTodayLogged.has(userId) ? todayISO : yesterdayISO;
    const toDate = new Date(`${toISO}T00:00:00`);
    const userSevenAgo = new Date(toDate);
    userSevenAgo.setDate(userSevenAgo.getDate() - 6);
    const userFromISO = toLocalISODate(userSevenAgo);
    const joinedISO = joinedByUser.get(userId) ?? null;
    const fromISO = joinedISO && joinedISO > userFromISO ? joinedISO : userFromISO;
    if (fromISO > toISO) {
      results.set(userId, { status: "neutral", pct: null, daysScored: 0 });
      continue;
    }
    results.set(userId, nutritionComplianceFromRows(logsByUser.get(userId), targetsByUser.get(userId), workoutsByUser.get(userId), fromISO, toISO));
  }
  return results;
}

// Scheda assegnata dal coach per un intervallo di date: righe is_read_only=true.
// Le raggruppa per data così da poter costruire il weekPlan di HomeDashboard.
export async function fetchAssignedWorkouts(supabase, userId, fromDateISO, toDateISO) {
  const cols = "id, date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, reps_completed, load_kg, rir, intensity_technique, status, is_read_only";
  let { data, error } = await supabase
    .from("workout_logs")
    .select(`${cols}, sort_order`)
    .eq("user_id", userId)
    .gte("date", fromDateISO)
    .lte("date", toDateISO)
    .order("date", { ascending: true })
    // sort_order (SCHEMA_v65): stesso ordine scelto dal coach col
    // drag-to-reorder in WeekWorkoutEditor — il cliente deve vedere gli
    // esercizi nell'ordine in cui il coach li ha organizzati, non in quello
    // in cui sono stati inseriti nel database.
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  // 42703 = "undefined column": SCHEMA_v65 non ancora eseguito — ripiega sul
  // solo ordine created_at invece di rompere l'intera schermata Allenamento
  // del cliente (vedi stessa protezione in fetchWeekWorkout qui sopra).
  if (error?.code === "42703") {
    const fallback = await supabase
      .from("workout_logs")
      .select(cols)
      .eq("user_id", userId)
      .gte("date", fromDateISO)
      .lte("date", toDateISO)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }
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

// Storico di TUTTI gli esercizi assegnati in una settimana, in un colpo
// solo — usata da HomeDashboard al caricamento della settimana corrente.
// BUG PRESO (perf): prima, per OGNI esercizio del piano, 3 chiamate quasi
// indipendenti (fetchExerciseHistory/fetchWorkoutSets/fetchExerciseSetHistory,
// oggi rimosse): le prime due rifacevano per giunta la STESSA query su
// workout_logs, solo con colonne diverse su workout_sets. Con 15-20
// esercizi in una settimana, decine di query solo per aprire la Home.
// Qui: 1 query workout_logs (tutte le sessioni "done" di questi esercizi,
// scope singolo cliente — non un roster, quindi un limite generoso e
// GLOBALE invece che per-esercizio è una semplificazione accettabile) + 1
// query workout_sets (unione delle serie storiche + di quelle della
// settimana corrente), poi tutto il resto è raggruppamento lato client.
// Ritorna 3 mappe:
//   historyByExerciseName  — come il vecchio fetchExerciseHistory: un punto
//                            per sessione (TOP SET reale), max 8 sessioni,
//                            più vecchia prima.
//   setHistoryByExerciseName — come il vecchio fetchExerciseSetHistory:
//                            TUTTE le serie di ogni sessione, max 6 sessioni.
//   loggedSetsByLogId      — come il vecchio fetchWorkoutSets: le serie già
//                            registrate per la riga workout_logs di
//                            QUESTA settimana (per precompilare i campi
//                            kg/reps), indipendentemente da status/esercizio.
export async function fetchWeekExerciseHistories(supabase, userId, thisWeekRows) {
  const historyByExerciseName = new Map();
  const setHistoryByExerciseName = new Map();
  const loggedSetsByLogId = new Map();
  const missedByExerciseName = new Map();

  const exerciseNames = [...new Set((thisWeekRows ?? []).map((r) => r.exercise_name))];
  const thisWeekLogIds = (thisWeekRows ?? []).map((r) => r.id);
  if (exerciseNames.length === 0) {
    return { historyByExerciseName, setHistoryByExerciseName, loggedSetsByLogId, missedByExerciseName };
  }

  // status incluso (non più filtrato a "done"): serve a distinguere le
  // sessioni passate REALMENTE fatte (done, storico classico sotto) dalle
  // sessioni passate assegnate ma MAI registrate (missed, vedi
  // missedByExerciseName) — un giorno programmato che non risulta mai
  // toccato non vuol dire che non sia stato fatto: capita di dimenticarsi
  // di registrare, senza un modo per recuperarlo dopo restava perso per
  // sempre. lt(oggi): mai i giorni futuri già assegnati in anticipo (stato
  // "missed" di default finché non arriva la data), altrimenti ogni sessione
  // non ancora svolta comparirebbe già come "dimenticata".
  const { data: pastLogs, error: pastLogsError } = await supabase
    .from("workout_logs")
    .select("id, date, exercise_name, status, sets_count")
    .eq("user_id", userId)
    .lt("date", toLocalISODate())
    .in("exercise_name", exerciseNames)
    .order("date", { ascending: false })
    .limit(300);
  if (pastLogsError) throw pastLogsError;

  const doneLogs = (pastLogs ?? []).filter((l) => l.status === "done");
  const missedLogs = (pastLogs ?? []).filter((l) => l.status !== "done");

  const logsByExercise = new Map();
  doneLogs.forEach((l) => {
    if (!logsByExercise.has(l.exercise_name)) logsByExercise.set(l.exercise_name, []);
    logsByExercise.get(l.exercise_name).push(l); // già in ordine desc (query globale ordinata per data)
  });

  const missedByExercise = new Map();
  missedLogs.forEach((l) => {
    if (!missedByExercise.has(l.exercise_name)) missedByExercise.set(l.exercise_name, []);
    missedByExercise.get(l.exercise_name).push(l);
  });

  const allLogIds = new Set(thisWeekLogIds);
  doneLogs.forEach((l) => allLogIds.add(l.id)); // i missed non hanno mai serie in workout_sets: inutile cercarle

  let sets = [];
  if (allLogIds.size > 0) {
    const { data, error: setsError } = await supabase
      .from("workout_sets")
      .select("workout_log_id, set_number, load_kg, reps_completed, rir")
      .in("workout_log_id", [...allLogIds])
      .order("set_number", { ascending: true });
    if (setsError) throw setsError;
    sets = data ?? [];
  }

  const setsByLog = new Map();
  sets.forEach((s) => {
    if (!setsByLog.has(s.workout_log_id)) setsByLog.set(s.workout_log_id, []);
    setsByLog.get(s.workout_log_id).push(s);
  });

  thisWeekLogIds.forEach((logId) => {
    loggedSetsByLogId.set(logId, setsByLog.get(logId) ?? []);
  });

  exerciseNames.forEach((name) => {
    const logs = logsByExercise.get(name) ?? [];

    // Equivalente di fetchExerciseHistory: top-8 sessioni, un punto per
    // sessione (il TOP SET reale — mai workout_logs.load_kg, sovrascritto
    // a ogni serie salvata), più vecchia prima.
    const history = logs
      .slice(0, 8)
      .filter((l) => (setsByLog.get(l.id) ?? []).some((s) => s.load_kg != null))
      .reverse()
      .map((l) => {
        const withLoad = setsByLog.get(l.id).filter((s) => s.load_kg != null);
        const top = withLoad.reduce((a, b) => (Number(b.load_kg) > Number(a.load_kg) ? b : a));
        return { kg: Number(top.load_kg), reps: top.reps_completed };
      });
    historyByExerciseName.set(name, history);

    // Equivalente di fetchExerciseSetHistory: top-6 sessioni, TUTTE le serie.
    const setHistory = logs
      .slice(0, 6)
      .filter((l) => setsByLog.has(l.id))
      .map((l) => ({
        workoutLogId: l.id,
        date: l.date,
        // rir incluso solo per PRESERVARLO quando si corregge kg/reps di
        // una serie passata (PastSetRow in 05_HomeDashboard.jsx) — senza,
        // la correzione lo azzererebbe silenziosamente pur non toccandolo
        // mai in UI.
        sets: (setsByLog.get(l.id) ?? []).map((s) => ({ setNumber: s.set_number, kg: s.load_kg != null ? Number(s.load_kg) : null, reps: s.reps_completed, rir: s.rir })),
      }));
    setHistoryByExerciseName.set(name, setHistory);

    // Giorni assegnati ma MAI registrati per questo esercizio (status ancora
    // "missed"): fino a 10 più recenti, più vecchio prima — così l'atleta
    // può recuperare una sessione fatta ma mai spuntata in app invece di
    // perderla per sempre. Nessuna serie precompilata (mai stata salvata):
    // il chiamante costruisce righe vuote da 1 a setsCount.
    const missed = (missedByExercise.get(name) ?? [])
      .slice(0, 10)
      .reverse()
      .map((l) => ({ workoutLogId: l.id, date: l.date, setsCount: Number(l.sets_count) || 0 }));
    missedByExerciseName.set(name, missed);
  });

  return { historyByExerciseName, setHistoryByExerciseName, loggedSetsByLogId, missedByExerciseName };
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
//   pct finale    = completionPct, con un BONUS (fino a +10, mai oltre 100)
//                    solo se la progressione è positiva. NESSUNA penalità se
//                    negativa/stabile: chi va in palestra alle sedute
//                    programmate e registra tutto (carichi, ripetizioni,
//                    sensazioni) si è allenato, punto — che quella settimana
//                    i carichi siano saliti o no è secondario. Prima una
//                    progressione negativa applicava ×0.75/×0.8 anche a un
//                    completamento perfetto: un atleta presente a tutte le
//                    sedute programmate e con diario compilato al 100%
//                    finiva con un cerchio Allenamento ingiustamente basso
//                    solo perché non aveva progredito sul carico — bug
//                    segnalato direttamente dall'uso reale dell'app.
//
// Se non c'è MAI stato nulla assegnato (nessuna sessione trovata), torna
// status "neutral" con pct null — mai 0% (sembrerebbe un allarme) né 100%
// (sembrerebbe completato). Il chiamante decide come rendere il "n/d".
//
// NOTA VOLUTA: il dolore (evening.doloreGrado / check settimanale) NON entra
// in questo calcolo. Non esiste ancora un check-in reale del cliente
// collegato a Supabase — è un'omissione intenzionale, non dimenticata: si
// aggiunge quando costruiamo quel pezzo (checkins reali, non più simulati).
// Logica pura (stesso principio delle due funzioni sopra): unica fonte di
// verità condivisa tra la versione singolo-cliente e computeBatchTrainingCompliance.
function trainingComplianceFromRows(assignedRows, setsJoined, currentDates, priorDates) {
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

  // Solo un bonus per chi progredisce, MAI una penalità per chi non lo fa:
  // presenza e registrazione complete sono il segnale primario di essersi
  // allenati davvero, la progressione del carico è un extra, non un
  // requisito — vedi nota sopra la funzione.
  const pct = progression === "positive" ? Math.min(100, completionPct + 10) : completionPct;
  return { status: "ok", pct, completionPct, progression };
}
export async function computeTrainingCompliance(supabase, userId) {
  // Le date più recenti con almeno un esercizio assegnato. PostgREST non fa
  // "distinct date con limit" in una query sola: fetch generosa (250 righe,
  // abbondante anche per chi si allena 6 volte a settimana da un anno) e
  // dedup lato client — l'ordine desc si preserva perché un Set mantiene
  // l'ordine di primo inserimento.
  // lte(oggi), non lt: oggi può entrare nella finestra (vedi sotto) — ma solo
  // se il cliente ha GIÀ registrato qualcosa oggi stesso, altrimenti verrebbe
  // subito escluso di nuovo qui sotto. Il coach può comunque programmare
  // settimane future in anticipo (MAX_FORWARD_WEEKS in 09_CoachDashboard.jsx):
  // quelle restano fuori perché sempre > oggi.
  const todayISO = toLocalISODate();
  const { data: recentLogs, error: recentError } = await supabase
    .from("workout_logs")
    .select("date")
    .eq("user_id", userId)
    .lte("date", todayISO)
    .order("date", { ascending: false })
    .limit(250);
  if (recentError) throw recentError;

  const distinctDatesDesc = [...new Set((recentLogs ?? []).map((r) => r.date))];
  if (distinctDatesDesc.length === 0) {
    return { status: "neutral", pct: null, completionPct: null, progression: "neutral" };
  }

  // Reattività richiesta: il cerchio si deve muovere SUBITO quando si
  // registra qualcosa, non aspettare la mezzanotte — ma un giorno ancora in
  // corso senza NULLA registrato non deve ancora "fallire" solo perché non è
  // finito. Se oggi è la data più recente assegnata, resta nella finestra
  // solo se ha già almeno una serie loggata; altrimenti si esclude come
  // prima (comportamento identico a quando la query filtrava lt(oggi)).
  let distinctDates = distinctDatesDesc;
  if (distinctDatesDesc[0] === todayISO) {
    const { data: todaySets, error: todayError } = await supabase
      .from("workout_sets")
      .select("id, workout_logs!inner(date, user_id)")
      .eq("workout_logs.user_id", userId)
      .eq("workout_logs.date", todayISO)
      .limit(1);
    if (todayError) throw todayError;
    if (!todaySets || todaySets.length === 0) {
      distinctDates = distinctDatesDesc.filter((d) => d !== todayISO);
    }
  }
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

  return trainingComplianceFromRows(assignedRows, setsJoined, currentDates, priorDates);
}

// Stessa formula di computeTrainingCompliance per N clienti in un colpo
// solo (vedi nota su computeBatchRecoveryCompliance). Qui la finestra "ultime
// 7 sessioni" è per forza calcolata per-cliente (chi si allena spesso ha
// sessioni più recenti di chi si allena poco): la prima query resta quindi
// generosa per NUMERO DI RIGHE totale (fino a 5000, non 250×N — abbondante
// per un roster realistico di qualche decina di clienti) e il resto del
// calcolo avviene lato client esattamente come nella versione singola.
export async function computeBatchTrainingCompliance(supabase, userIds) {
  const results = new Map();
  if (!userIds || userIds.length === 0) return results;

  const todayISO = toLocalISODate();
  const { data: allLogs, error: logsError } = await supabase
    .from("workout_logs")
    .select("user_id, date, sets_count")
    .in("user_id", userIds)
    .lte("date", todayISO)
    .order("date", { ascending: false })
    .limit(5000);
  if (logsError) throw logsError;

  const rowsByUser = new Map(userIds.map((id) => [id, []]));
  for (const row of allLogs ?? []) {
    if (rowsByUser.has(row.user_id)) rowsByUser.get(row.user_id).push(row);
  }

  // Stessa reattività della versione singolo-cliente: chi ha oggi come data
  // più recente assegnata la mantiene nella finestra solo se ha già loggato
  // almeno una serie oggi — un'unica query per tutto il roster, non una per
  // cliente.
  const usersWithTodayAssigned = userIds.filter((id) => (rowsByUser.get(id) ?? []).some((r) => r.date === todayISO));
  const usersWithTodayLogged = new Set();
  if (usersWithTodayAssigned.length > 0) {
    const { data: todaySets, error: todayError } = await supabase
      .from("workout_sets")
      .select("workout_logs!inner(date, user_id)")
      .in("workout_logs.user_id", usersWithTodayAssigned)
      .eq("workout_logs.date", todayISO);
    if (todayError) throw todayError;
    (todaySets ?? []).forEach((r) => { if (r.workout_logs?.user_id) usersWithTodayLogged.add(r.workout_logs.user_id); });
  }

  const perUserDates = new Map();
  const allDatesGlobal = new Set();
  for (const userId of userIds) {
    const rows = rowsByUser.get(userId) ?? [];
    // rowsByUser preserva l'ordine desc di allLogs (filtro, non risort):
    // il primo elemento di ogni Set è la data più recente, come nella
    // versione singolo-cliente.
    let distinctDates = [...new Set(rows.map((r) => r.date))];
    if (distinctDates[0] === todayISO && !usersWithTodayLogged.has(userId)) {
      distinctDates = distinctDates.filter((d) => d !== todayISO);
    }
    const currentDates = distinctDates.slice(0, 7);
    const priorDates = distinctDates.slice(7, 14);
    perUserDates.set(userId, { currentDates, priorDates });
    currentDates.forEach((d) => allDatesGlobal.add(d));
    priorDates.forEach((d) => allDatesGlobal.add(d));
  }

  let setsJoined = [];
  if (allDatesGlobal.size > 0) {
    const { data, error: setsError } = await supabase
      .from("workout_sets")
      .select("load_kg, workout_logs!inner(date, exercise_name, user_id)")
      .in("workout_logs.user_id", userIds)
      .in("workout_logs.date", [...allDatesGlobal]);
    if (setsError) throw setsError;
    setsJoined = data;
  }

  const setsByUser = new Map(userIds.map((id) => [id, []]));
  for (const row of setsJoined ?? []) {
    const uid = row.workout_logs?.user_id;
    if (setsByUser.has(uid)) setsByUser.get(uid).push(row);
  }

  for (const userId of userIds) {
    const { currentDates, priorDates } = perUserDates.get(userId);
    if (currentDates.length === 0) {
      results.set(userId, { status: "neutral", pct: null, completionPct: null, progression: "neutral" });
      continue;
    }
    const assignedRows = (rowsByUser.get(userId) ?? []).filter((r) => currentDates.includes(r.date));
    results.set(userId, trainingComplianceFromRows(assignedRows, setsByUser.get(userId), currentDates, priorDates));
  }
  return results;
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
  await markSectionUpdated(supabase, clientId, "supplements");
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
  await markSectionUpdated(supabase, clientId, "nutrition");
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
  const baseQuery = () => supabase
    .from("workout_logs")
    .select("id, date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, intensity_technique, sort_order")
    .eq("user_id", userId)
    .in("date", dates)
    .order("date", { ascending: true })
    // sort_order (SCHEMA_v65): l'ordine scelto dal coach col drag-to-reorder,
    // NON l'ordine di inserimento — created_at resta come fallback per righe
    // scritte prima della migrazione, nel caso non fossero ancora backfillate.
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  let { data, error } = await baseQuery();
  // 42703 = "undefined column": SCHEMA_v65 non ancora eseguito sul database
  // (colonna sort_order mancante) — invece di far crollare l'intero editor
  // con un errore generico, ripiega sul solo ordine created_at (comportamento
  // pre-v65) finché la migrazione non viene applicata. Mai un altro tipo di
  // errore silenziato qui: solo questo caso specifico e riconoscibile.
  if (error?.code === "42703") {
    const fallback = await supabase
      .from("workout_logs")
      .select("id, date, split_label, exercise_name, muscle_target, synergist_targets, sets_count, reps_target, rest_seconds, rir_target, intensity_technique")
      .eq("user_id", userId)
      .in("date", dates)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }
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
// data confronta gli esercizi nuovi con quelli già assegnati PER ID (un id
// conta come "reale" solo se combacia con una riga che esiste davvero su
// quella data — un esercizio appena aggiunto in UI ha un id locale finto,
// tipo "x3", che qui non troverà mai corrispondenza, e resta sempre un
// insert, esattamente come prima), aggiorna solo i campi prescrittivi di
// quelli già presenti (mai reps_completed/load_kg/rir/status: quello è lo
// storico svolto dal cliente, non va mai sovrascritto da qui), inserisce
// quelli nuovi, cancella SOLO le righe del singolo giorno il cui id non è
// più rivendicato da nessun esercizio nella lista — mai una delete
// dell'intera settimana in un colpo solo.
// BUG PRESO (segnalato): il confronto era PER NOME. Rinominare un esercizio
// già assegnato cambiava correttamente lo stato locale, ma al salvataggio
// il nome nuovo non trovava più corrispondenza nella riga vecchia (stesso
// id, nome diverso) — la riga veniva cancellata e ricreata da capo, con un
// created_at più recente di tutte le altre. fetchWeekWorkout ordina per
// created_at: l'esercizio rinominato saltava sempre in fondo alla lista del
// giorno, invece di restare dov'era.
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

    const { data: existing, error: fetchError } = await supabase
      .from("workout_logs")
      .select("id, exercise_name")
      .eq("user_id", userId)
      .eq("date", date);
    if (fetchError) throw fetchError;

    const existingIds = new Set((existing ?? []).map((r) => r.id));
    const claimedIds = new Set(newExercises.filter((e) => existingIds.has(e.id)).map((e) => e.id));
    const toDelete = (existing ?? []).filter((r) => !claimedIds.has(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase.from("workout_logs").delete().in("id", toDelete);
      if (deleteError) throw deleteError;
    }

    for (const [exIdx, ex] of newExercises.entries()) {
      // sort_order = posizione nell'array locale: il coach può trascinare per
      // riordinare (drag-to-reorder, vedi WeekWorkoutEditor/useDragReorder),
      // e QUELL'ordine è quello che si salva — mai dedotto da created_at,
      // che non cambia quando si sposta una riga già esistente.
      const prescriptiveFields = {
        exercise_name: ex.name,
        split_label: day.label || null,
        muscle_target: ex.muscleTarget,
        synergist_targets: ex.synergists && ex.synergists.length > 0 ? ex.synergists : null,
        sets_count: ex.sets,
        reps_target: ex.reps || null,
        rest_seconds: ex.rest ?? null,
        rir_target: ex.rirTarget || null,
        intensity_technique: ex.technique || null,
        sort_order: exIdx,
      };
      if (existingIds.has(ex.id)) {
        const { error: updateError } = await supabase.from("workout_logs").update(prescriptiveFields).eq("id", ex.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("workout_logs").insert({
          user_id: userId,
          date,
          status: "missed",
          is_read_only: true,
          ...prescriptiveFields,
        });
        if (insertError) throw insertError;
      }
    }
  }

  // Add-on Scheda Personalizzata (SCHEMA_v68): la scheda resta "attiva"
  // esattamente finché il coach l'ha davvero costruita, non una stima fissa
  // indovinata all'acquisto — ogni volta che questa settimana ha almeno un
  // esercizio assegnato, scheda_addon_program_until si allunga (mai si
  // accorcia) fino alla fine di QUESTA settimana, se più avanti di quanto
  // già impostato. Nessun effetto su chi non ha questo add-on attivo
  // (scheda_addon_program_until resta null per loro).
  const weekHasExercises = workoutArray.some((day) => (day?.exercises?.length ?? 0) > 0);
  if (weekHasExercises) {
    const { data: profile } = await supabase.from("profiles").select("scheda_addon_program_until").eq("id", userId).maybeSingle();
    if (profile?.scheda_addon_program_until) {
      const weekEnd = new Date(`${dates[6]}T23:59:59`);
      if (weekEnd > new Date(profile.scheda_addon_program_until)) {
        const { error: extendError } = await supabase.from("profiles")
          .update({ scheda_addon_program_until: weekEnd.toISOString() }).eq("id", userId);
        if (extendError) console.error("PERFORM: errore estensione scheda_addon_program_until", extendError);
      }
    }
  }
  await markSectionUpdated(supabase, userId, "workout");
}

// Clona una settimana di allenamento su un'altra: legge le righe della
// sorgente, le trasforma nella STESSA forma { label, exercises } che
// saveWeekWorkout già sa scrivere, e delega a quella — non una seconda
// versione scritta a mano della logica di confronto/scrittura. Vantaggio
// pratico: clonare due volte sulla stessa settimana destinazione AGGIORNA
// (non duplica) — passa dallo stesso percorso di saveWeekWorkout, che
// confronta per id: qui gli esercizi copiati non portano MAI l'id reale
// della destinazione (solo nome/target/prescrizione), quindi ogni riga già
// presente sulla data di destinazione non viene mai "rivendicata" e viene
// sempre cancellata e riscritta da capo con quella nuova — stesso risultato
// finale di un update, per righe che comunque cambiano tutte insieme.
// Sempre come storico nuovo: reps_completed/load_kg/rir della
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
// Richiesta esplicita: poter dire "questa scheda vale dalla settimana X alla
// Y comprese" invece di clonare settimana per settimana (percepito scomodo/
// poco chiaro) — targetWeekStartISO ora accetta anche un ARRAY di date (una
// per settimana del range): scrive la STESSA scheda su ciascuna. Una singola
// stringa resta valida (comportamento precedente, un solo target).
export async function applyWorkoutTemplateToClients(supabase, days, clientIds, targetWeekStartISO) {
  const weeks = Array.isArray(targetWeekStartISO) ? targetWeekStartISO : [targetWeekStartISO];
  const ok = [];
  const failed = [];
  for (const clientId of clientIds) {
    try {
      for (const weekISO of weeks) {
        await saveWeekWorkout(supabase, clientId, weekISO, days);
      }
      ok.push(clientId);
    } catch (err) {
      console.error(`PERFORM: errore applicazione template al cliente ${clientId}`, err);
      failed.push(clientId);
    }
  }
  return { ok, failed };
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
   current_streak (letti altrove: fetchClientRoster, roster coach) così la
   classifica globale può leggerli con una sola query invece di ricalcolare
   la formula per ogni atleta. */
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
// Neofita 1..5, ...); una volta esaurito l'ultimo tier (Master) il numero
// continua a crescere all'infinito invece di richiedere un nome nuovo per
// ogni livello possibile — è così che restano davvero infiniti.
// Esportati (non più solo interni a xpToLevelInfo): la Bacheca Trofei del
// Profilo li riusa per i trofei "livello raggiunto", stessi nomi del
// livello reale mostrato altrove — mai una seconda nomenclatura duplicata.
// Nomi ancorati al mondo reale di palestra/fitness/bodybuilding, tono serio
// e non gamificato (niente icone/emoji, niente nomi da RPG): la stessa scala
// di classificazione che userebbe un coach — neofita → intermedio →
// avanzato → atleta → professionista → elite → veterano → master.
export const LEVEL_TIERS = [
  { title: "Neofita", icon: "" },
  { title: "Intermedio", icon: "" },
  { title: "Avanzato", icon: "" },
  { title: "Atleta", icon: "" },
  { title: "Professionista", icon: "" },
  { title: "Elite", icon: "" },
  { title: "Veterano", icon: "" },
  { title: "Master", icon: "" },
];
export const LEVELS_PER_TIER = 5;
function levelTitleAndIcon(level) {
  const tierIdx = Math.min(Math.floor(level / LEVELS_PER_TIER), LEVEL_TIERS.length - 1);
  const tier = LEVEL_TIERS[tierIdx];
  // Solo il nome del grado, senza il numero di sotto-livello: la barra XP
  // subito sotto mostra già il progresso, ripeterlo qui era ridondante.
  return { title: tier.title, icon: tier.icon };
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
export function isDayComplete(dateISO, { nutritionDays, metricsDays, workoutStatusByDate, pauseDates }) {
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

// Moltiplicatore XP per streak (progressivo, non eccessivo): più a lungo si
// tiene viva la costanza, leggermente più XP si guadagna per ogni azione del
// giorno (serie svolte, pasto registrato, sonno+passi registrati) — un
// incentivo in più a non dimenticarsi di segnare le cose, separato dal bonus
// fisso già esistente ogni 7 giorni pieni (quello resta invariato). Tetto al
// +25%: oltre non ha senso, diventerebbe sleale verso chi si allena bene ma
// ha avuto una sola interruzione.
const STREAK_XP_MULTIPLIER_TIERS = [
  { minDays: 90, multiplier: 1.25 },
  { minDays: 60, multiplier: 1.20 },
  { minDays: 30, multiplier: 1.15 },
  { minDays: 14, multiplier: 1.10 },
  { minDays: 7, multiplier: 1.05 },
  { minDays: 0, multiplier: 1.00 },
];
export function streakXpMultiplier(streakDays) {
  const days = Math.max(0, Number(streakDays) || 0);
  return STREAK_XP_MULTIPLIER_TIERS.find((t) => days >= t.minDays).multiplier;
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
    supabase.from("workout_sets").select("completed_at").eq("user_id", userId).not("reps_completed", "is", null).gte("completed_at", sinceDate),
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

  // Serie svolte raggruppate per giorno locale (completed_at è un timestamp,
  // non una data pura): serve per pesare ogni giorno col moltiplicatore da
  // streak in vigore in QUEL giorno, non un totale aggregato una tantum.
  const setsCountByDate = new Map();
  (setsRows ?? []).forEach((r) => {
    const d = toLocalISODate(new Date(r.completed_at));
    setsCountByDate.set(d, (setsCountByDate.get(d) ?? 0) + 1);
  });

  const bonusXp = (bonusRows ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // XP giorno per giorno, non più un totale aggregato: serve per applicare a
  // ciascun giorno il moltiplicatore da streak (streakXpMultiplier) in base
  // a QUANTI giorni consecutivi di costanza lo precedevano, non lo streak di
  // OGGI applicato retroattivamente a tutta la storia (che farebbe scendere
  // il totale ad ogni streak interrotto — mai un XP totale che scende).
  // Nota: qui, a differenza dello streak "ufficiale" calcolato sopra, non si
  // applica la finestra di grazia di 24h — un'imprecisione minima e solo
  // temporanea (al più un giorno), accettata per non duplicare quella
  // logica (pensata per "oggi", non per un giorno storico qualsiasi) in un
  // secondo ciclo parallelo.
  let xpTotal = 0;
  let xpStreakRun = 0;
  const xpCursor = new Date(`${sinceDate}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  for (let i = 0; i < 3650 && xpCursor <= todayDate; i++) {
    const d = toLocalISODate(xpCursor);
    const dayComplete = isDayComplete(d, ctx);
    xpStreakRun = dayComplete ? xpStreakRun + 1 : 0;
    const multiplier = streakXpMultiplier(xpStreakRun);
    const dayPoints =
      (setsCountByDate.get(d) ?? 0) * 10   // +10 per serie realmente svolta e registrata
      + (nutritionDays.has(d) ? 5 : 0)      // +5 per il giorno con almeno un pasto registrato
      + (metricsDays.has(d) ? 5 : 0)        // +5 per il giorno con sonno + passi registrati
      + (nutritionDays.has(d) && dayComplete ? 15 : 0); // bonus giornata piena (allenamento+dieta+recupero)
    xpTotal += dayPoints * multiplier;
    xpCursor.setDate(xpCursor.getDate() + 1);
  }
  xpTotal = Math.round(
    xpTotal
    + Math.floor(streak / 7) * 50       // bonus ogni settimana intera di streak (invariato)
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

/* ============================================================================
   CREW — streak solitaria a piccoli gruppi (SCHEMA_v74)
   ----------------------------------------------------------------------------
   Un gruppo di 3-6 persone (massimo imposto anche lato DB, vedi
   enforce_crew_capacity) che condivide una versione "di gruppo" dello stesso
   streak individuale già in uso ovunque nell'app: stessa isDayComplete per
   ogni membro, ma la catena di giorni consecutivi appartiene alla crew, non
   al singolo. Un giorno storto di UN membro non deve rompere lo streak di
   tutti — vedi CREW_DAY_THRESHOLD più sotto — altrimenti il meccanismo
   punisce il gruppo invece di responsabilizzarlo, e la community si scioglie
   alla prima delusione invece di rinforzarsi.
   ========================================================================== */

const CREW_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // stesso alfabeto di generateReferralCode
const CREW_ACTIVITY_DAYS = 7;
// Quanti membri possono mancare in un giorno senza rompere lo streak di
// gruppo. Una quota percentuale (es. 70%) fallisce proprio nelle crew più
// piccole: con soli 3 membri, il 70% arrotondato per eccesso richiede TUTTI
// e 3, azzerando la tolleranza che invece serve di più ai gruppi piccoli.
// Una soglia assoluta funziona identica da 3 a 6 membri.
const CREW_DAY_MAX_MISSING = 1;

function generateCrewCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CREW_CODE_CHARS[Math.floor(Math.random() * CREW_CODE_CHARS.length)];
  return code;
}

// Crea una nuova crew e vi iscrive subito il creatore. Riprova su collisione
// del codice invito (23505), praticamente mai necessario con 6 caratteri da
// un alfabeto di 32 ma mai un crash se succede davvero (stesso pattern di
// ensureReferralCode).
export async function createCrew(supabase, userId, name) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCrewCode();
    const { data, error } = await supabase.from("crews")
      .insert({ name: (name || "").trim() || "La mia crew", invite_code: code, created_by: userId })
      .select("id").maybeSingle();
    if (!error) {
      const { error: joinErr } = await supabase.from("crew_members").insert({ crew_id: data.id, user_id: userId });
      if (joinErr) throw joinErr;
      return data.id;
    }
    if (error.code !== "23505") throw error;
  }
  throw new Error("Non sono riuscito a creare la crew — riprova.");
}

// Entra in una crew tramite codice invito. Il tetto di 6 membri è applicato
// dal trigger enforce_crew_capacity lato DB (mai solo lato client): un
// insert respinto per quel motivo torna qui come errore leggibile invece del
// messaggio tecnico Postgres grezzo.
export async function joinCrewByCode(supabase, userId, code) {
  const { data: crewId, error } = await supabase.rpc("resolve_crew_code", { code: (code || "").trim() });
  if (error) throw error;
  if (!crewId) throw new Error("Codice non valido — controlla di averlo scritto giusto.");
  const { error: insErr } = await supabase.from("crew_members").insert({ crew_id: crewId, user_id: userId });
  if (insErr) {
    if (insErr.code === "23505") throw new Error("Fai già parte di una crew — esci prima da quella per unirti a un'altra.");
    if (/piena/i.test(insErr.message || "")) throw new Error("Questa crew ha già raggiunto il massimo di 6 membri.");
    throw insErr;
  }
  return crewId;
}

export async function leaveCrew(supabase, userId, crewId) {
  const { error } = await supabase.from("crew_members").delete().eq("crew_id", crewId).eq("user_id", userId);
  if (error) throw error;
}

// La crew dell'utente corrente (null se non ne fa parte), coi profili di
// tutti i membri già risolti — sempre al più 6 righe, mai un problema di
// N+1 per una lista così piccola.
export async function fetchMyCrew(supabase, userId) {
  const { data: memberRow, error } = await supabase.from("crew_members").select("crew_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!memberRow) return null;

  const { data: crewRow, error: crewErr } = await supabase.from("crews")
    .select("id, name, invite_code, created_by, created_at").eq("id", memberRow.crew_id).maybeSingle();
  if (crewErr) throw crewErr;
  if (!crewRow) return null;

  const { data: memberRows, error: membersErr } = await supabase.from("crew_members")
    .select("user_id, joined_at").eq("crew_id", crewRow.id).order("joined_at", { ascending: true });
  if (membersErr) throw membersErr;

  const ids = (memberRows ?? []).map((m) => m.user_id);
  const { data: profiles, error: profErr } = await supabase.from("profiles")
    .select("id, nickname, full_name, avatar_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (profErr) throw profErr;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const members = (memberRows ?? []).map((m) => {
    const p = profileById.get(m.user_id);
    return { userId: m.user_id, joinedAt: m.joined_at, nickname: p?.nickname || p?.full_name || "Atleta", avatarUrl: p?.avatar_url || null };
  });

  return { id: crewRow.id, name: crewRow.name, inviteCode: crewRow.invite_code, createdBy: crewRow.created_by, members };
}

// Attività degli ultimi CREW_ACTIVITY_DAYS giorni per ogni membro, con la
// STESSA identica isDayComplete usata da computeRealXpAndStreak — 5 query
// totali per l'intera crew (mai per-membro): stesso principio di batching già
// applicato a computeBatchRecoveryCompliance/NutritionCompliance/TrainingCompliance
// qui sopra.
export async function computeCrewWeeklyActivity(supabase, userIds) {
  const ids = userIds ?? [];
  if (ids.length === 0) return new Map();

  const today = toLocalISODate();
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - (CREW_ACTIVITY_DAYS - 1));
  const fromISO = toLocalISODate(from);

  const [{ data: nutriRows, error: nutriErr }, { data: metricsRows, error: metricsErr },
    { data: workoutRows, error: workoutErr }, { data: pauseRows, error: pauseErr },
    { data: freezeRows, error: freezeErr }] = await Promise.all([
    supabase.from("nutrition_logs").select("user_id, date").in("user_id", ids).gte("date", fromISO),
    supabase.from("daily_metrics").select("user_id, date, sleep_hours, steps").in("user_id", ids).gte("date", fromISO),
    supabase.from("workout_logs").select("user_id, date, status").in("user_id", ids).gte("date", fromISO),
    supabase.from("pause_periods").select("user_id, start_date, end_date").in("user_id", ids),
    supabase.from("streak_freezes").select("user_id, date").in("user_id", ids).gte("date", fromISO),
  ]);
  if (nutriErr) throw nutriErr;
  if (metricsErr) throw metricsErr;
  if (workoutErr) throw workoutErr;
  if (pauseErr) throw pauseErr;
  if (freezeErr) throw freezeErr;

  const days = [];
  for (let d = new Date(from); toLocalISODate(d) <= today; d.setDate(d.getDate() + 1)) days.push(toLocalISODate(d));

  const ctxByUser = new Map(ids.map((id) => [id, { nutritionDays: new Set(), metricsDays: new Set(), workoutStatusByDate: new Map(), pauseDates: new Set() }]));
  (nutriRows ?? []).forEach((r) => ctxByUser.get(r.user_id)?.nutritionDays.add(r.date));
  (metricsRows ?? []).forEach((r) => { if (r.sleep_hours != null && r.steps != null) ctxByUser.get(r.user_id)?.metricsDays.add(r.date); });
  (workoutRows ?? []).forEach((r) => ctxByUser.get(r.user_id)?.workoutStatusByDate.set(r.date, r.status));
  (pauseRows ?? []).forEach((r) => {
    const ctx = ctxByUser.get(r.user_id);
    if (ctx) expandPauseDates([r]).forEach((d) => ctx.pauseDates.add(d));
  });
  (freezeRows ?? []).forEach((r) => ctxByUser.get(r.user_id)?.pauseDates.add(r.date));

  const result = new Map();
  ids.forEach((id) => {
    const ctx = ctxByUser.get(id);
    const dayFlags = days.map((d) => isDayComplete(d, ctx));
    result.set(id, { days, dayFlags, completeCount: dayFlags.filter(Boolean).length });
  });
  return result;
}

// Streak di gruppo, calcolata da computeCrewWeeklyActivity: un giorno conta
// per la crew se al massimo CREW_DAY_MAX_MISSING membri non hanno avuto una
// giornata completa — tollera un "giorno storto" isolato senza far crollare
// lo streak di tutti (stessa filosofia della finestra di grazia individuale,
// isWithinGraceWindow, qui applicata al giorno di gruppo). Pura funzione:
// nessuna query, testabile da sola.
export function computeCrewStreak(weeklyActivityByUser, todayIso) {
  const entries = [...weeklyActivityByUser.values()];
  if (entries.length === 0) return { streak: 0, dayCompleteByDate: new Map() };

  const days = entries[0].days;
  // BUG PRESO: con crew.length === 1 (leaveCrew non impone un minimo di
  // membri: si può restare da soli), Math.max(0, 1 - 1) dava minComplete = 0
  // — QUALSIASI giorno risultava "completo per la crew" a prescindere
  // dall'attività reale, regalando uno streak automatico e privo di sforzo
  // all'ultimo membro rimasto. Il minimo va bloccato a 1: anche una crew di
  // una sola persona deve comunque essersi davvero allenata quel giorno.
  const minComplete = Math.max(1, entries.length - CREW_DAY_MAX_MISSING);
  const dayCompleteByDate = new Map(days.map((d, i) => [d, entries.filter((e) => e.dayFlags[i]).length >= minComplete]));

  let streak = 0;
  const cursor = new Date(`${todayIso}T00:00:00`);
  if (!dayCompleteByDate.get(todayIso)) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < days.length; i++) {
    const d = toLocalISODate(cursor);
    if (!dayCompleteByDate.has(d)) break;
    if (dayCompleteByDate.get(d)) { streak++; cursor.setDate(cursor.getDate() - 1); continue; }
    if (isWithinGraceWindow(d, todayIso)) { cursor.setDate(cursor.getDate() - 1); continue; }
    break;
  }
  return { streak, dayCompleteByDate };
}

// Chat di crew: stesso principio di ChatThread/chat_messages, esteso da 2 a
// fino a 6 partecipanti — niente allegati/vocali qui (restano una cosa da
// chat 1:1 col coach): questa è pensata per un cameratismo leggero ("Oggi ho
// spinto forte 💪", "chi manca oggi?"), non per un secondo canale di supporto.
export async function fetchCrewMessages(supabase, crewId) {
  const { data, error } = await supabase.from("crew_messages")
    .select("id, crew_id, sender_id, body, created_at").eq("crew_id", crewId)
    .order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function sendCrewMessage(supabase, crewId, senderId, body) {
  const { data, error } = await supabase.from("crew_messages")
    .insert({ crew_id: crewId, sender_id: senderId, body }).select().maybeSingle();
  if (error) throw error;
  return data;
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

// Direzione inversa: un cliente ha appena scritto in chat, il coach va
// avvisato per poter rispondere in tempo anche da webapp (notify-coach
// costruisce titolo/coach-id lato server dal JWT del chiamante, qui passiamo
// solo l'anteprima del messaggio già visibile in chat).
export async function notifyCoachNewMessage(supabase, body) {
  try {
    await supabase.functions.invoke("notify-coach", { body: { body } });
  } catch (err) {
    console.error("PERFORM: errore invio notifica push al coach", err);
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
// BUG PRESO (N+1, trovato dall'audit UX/logica): 2 query per profilo (ultimi
// checkin + anamnesi) ad ogni apertura/refresh di Hub Atleti — su TUTTI i
// profili "user", non solo i clienti a coaching attivo. Ora 2 query totali
// per l'intero roster. "Ultimi 8 checkin per utente" non è esprimibile in
// una sola query senza una funzione RPC dedicata (l'API non supporta LIMIT
// per gruppo): si prende un LIMIT globale generosissimo (stesso principio
// già accettato per fetchCoachChatInbox e computeBatchTrainingCompliance
// qui sopra) e si tengono i primi 8 per utente scorrendo l'elenco già
// ordinato dal più recente — realisticamente mai un checkin perso per un
// roster di qualunque dimensione plausibile.
export async function fetchClientRoster(supabase) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, full_name, email, gender, role, xp_total, current_streak, plan, client_status, last_activity, created_at, whitelisted_until")
    .eq("role", "user")
    .order("created_at", { ascending: false });
  if (profilesError) throw profilesError;
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  // hasWorkout/NutritionAssigned/SupplementsAssigned: servono a deptOf
  // (09_CoachDashboard.jsx) per distinguere "In attesa" da "Attivi" — un
  // pagamento Stripe scrive client_status:'active' nell'istante stesso in
  // cui arriva (vedi stripe-webhook), MOLTO prima che il coach abbia
  // davvero costruito scheda/dieta/integratori: usare solo client_status
  // per quella distinzione faceva sparire il cliente dalla coda "In attesa"
  // ancor prima di essere seguito per davvero. Qui basta sapere SE esiste
  // almeno una riga assegnata per utente, non quale — .limit(ids.length*2)
  // generoso, stesso principio già accettato sopra per i checkin.
  const [{ data: allCheckins, error: checkinsError }, { data: anamRows, error: anamError },
    { data: workoutRows, error: workoutError }, { data: nutritionRows, error: nutritionError },
    { data: supplementRows, error: supplementError }] = await Promise.all([
    supabase.from("checkins").select("user_id, date, weight, chest, arm, thigh")
      .in("user_id", ids).order("date", { ascending: false }).limit(5000),
    supabase.from("anamnesis_responses").select("user_id, answers").in("user_id", ids),
    supabase.from("workout_logs").select("user_id").in("user_id", ids).limit(ids.length * 2),
    supabase.from("nutrition_targets").select("user_id").in("user_id", ids).limit(ids.length * 2),
    supabase.from("prescribed_supplements").select("user_id").in("user_id", ids).limit(ids.length * 2),
  ]);
  if (checkinsError) throw checkinsError;
  if (anamError) throw anamError;
  if (workoutError) throw workoutError;
  if (nutritionError) throw nutritionError;
  if (supplementError) throw supplementError;

  const checkinsByUser = new Map(ids.map((id) => [id, []]));
  (allCheckins ?? []).forEach((c) => {
    const list = checkinsByUser.get(c.user_id);
    if (list && list.length < 8) list.push(c); // già ordinati per data desc: i primi 8 raccolti sono i più recenti
  });
  const answersByUser = new Map((anamRows ?? []).map((r) => [r.user_id, r.answers || {}]));
  const hasWorkoutSet = new Set((workoutRows ?? []).map((r) => r.user_id));
  const hasNutritionSet = new Set((nutritionRows ?? []).map((r) => r.user_id));
  const hasSupplementsSet = new Set((supplementRows ?? []).map((r) => r.user_id));

  const roster = profiles.map((p) => {
      const ordered = (checkinsByUser.get(p.id) ?? []).slice().reverse(); // dal più vecchio al più recente, come si aspetta il grafico
      const last = ordered[ordered.length - 1];
      const answers = answersByUser.get(p.id) || {};

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
        hasWorkoutAssigned: hasWorkoutSet.has(p.id),
        hasNutritionAssigned: hasNutritionSet.has(p.id),
        hasSupplementsAssigned: hasSupplementsSet.has(p.id),
        prs: {},
        evening: { energia: null, digestione: null, sonno: null, doloreGrado: 0, doloreNota: "" },
        rings: { allenamento: 0, alimentazione: 0, recupero: 0 },
        _anamnesisAnswers: answers, // portato dietro per AnamnesisPanel, non per la roster card
      };
  });
  return roster;
}

// Piani assegnabili dal coach tramite "Prendi in gestione" / "Cambia
// abbonamento": solo i tre a coaching reale (Free e Premium restano
// scelte autogestite del cliente, mai imposte dal coach da qui). Stesso
// dominio di REAL_COACHING_PLANS_DB più sopra, qui come array perché
// activateClient/whitelistClient usano .includes()/.join() — non una
// terza lista hardcoded degli stessi 3 valori.
const COACHING_PLANS = [...REAL_COACHING_PLANS_DB];

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
// BUG PRESO: scriveva client_status:"active" per QUALUNQUE piano whitelistato,
// Free e Premium inclusi — ma client_status:"active" è il segnale che mette
// un atleta nel roster "Attivi" di Hub Atleti (deptOf in 09_CoachDashboard.jsx)
// e fa apparire un'etichetta di piano coaching sulla sua card (fallback
// "Scheda Personalizzata" quando il piano non è "full"/"training"). Un
// amico whitelistato per Premium finiva così a comparire come se il coach lo
// stesse seguendo personalmente con una Scheda Personalizzata mai comprata.
// Free e Premium sono piani AUTOGESTITI (vivono solo in Hub Utenti, mai in
// Hub Atleti) esattamente come per un pagamento Stripe vero — vedi la stessa
// distinzione già presente nelle Edge Function stripe-webhook e
// process-referral-rewards (ognuna con la propria copia di COACHING_PLANS,
// stessi 3 valori — un Deno Edge Function non può importare da questo file,
// quindi non è consolidabile in un'unica fonte come REAL_COACHING_PLANS_DB
// sopra) e in activateClient qui sopra.
export async function whitelistClient(supabase, clientId, plan, months, skipAnamnesis = true) {
  if (!WHITELISTABLE_PLANS.includes(plan)) {
    throw new Error(`piano non valido per la whitelist: "${plan}"`);
  }
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) throw new Error("numero di mesi non valido");
  const until = new Date();
  until.setMonth(until.getMonth() + n);
  const { error } = await supabase.from("profiles").update({
    plan,
    client_status: COACHING_PLANS.includes(plan) ? "active" : "registered",
    onboarding_completed: skipAnamnesis,
    whitelisted_until: until.toISOString(),
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

// "Smetti di gestire" (richiesto esplicitamente): il coach vuole togliere un
// cliente dalla gestione attiva SENZA eliminare l'account — tipicamente
// account di test creati per provare l'app, ora mescolati con clienti veri
// dopo aver iniziato a inserirne di reali. Riporta il cliente a un piano
// autogestito (free o performance_pack, scelto dal coach — non lo
// indoviniamo da uno storico che non teniamo) e client_status torna a null
// ("registered", fuori dal reparto Attivi/In attesa/Scaduti). Cancella
// anche whitelisted_until: un cliente non più in gestione non deve avere un
// timer di scadenza whitelist che scorre nel vuoto. NON tocca mai un
// abbonamento Stripe reale — se il cliente ha davvero pagato, l'unico modo
// corretto per fermare gli addebiti resta il portale fatturazione lato
// cliente; questa funzione serve solo per chi non ha mai pagato per davvero
// (whitelist/test).
const UNMANAGE_TARGET_PLANS = ["free", "performance_pack"];
export async function unmanageClient(supabase, clientId, targetPlan) {
  if (!UNMANAGE_TARGET_PLANS.includes(targetPlan)) {
    throw new Error(`piano di destinazione non valido per "smetti di gestire": "${targetPlan}"`);
  }
  // "registered" invece di null: stesso significato (fetchClientRoster legge
  // già p.client_status || "registered" per un client_status vuoto), ma
  // scrivere un valore letterale invece di NULL evita qualunque comportamento
  // a sorpresa di policy/constraint sulla colonna non tracciate in questo
  // repo (BUG PRESO: era l'UNICA scrittura di tutto il codebase a mandare
  // NULL su questa colonna — "Smetti di gestire" restava silenziosamente
  // senza effetto, nessun errore visibile, il cliente restava nel roster).
  // .select("id") + controllo righe: un UPDATE bloccato da RLS non genera un
  // errore Postgres, affetta semplicemente zero righe — senza questo
  // controllo il fallimento resterebbe silenzioso come prima.
  const { data, error } = await supabase.from("profiles")
    .update({ plan: targetPlan, client_status: "registered", whitelisted_until: null })
    .eq("id", clientId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Nessuna riga aggiornata: verifica i permessi o riprova.");
  }
}

// §08 memo "Verso l'élite" — Il business dietro l'app: programma referral.
// Codice a 8 caratteri da un alfabeto senza ambiguità (niente 0/O/1/I): si
// legge a voce e si scrive senza errori, quanto basta per non collidere
// (32^8 combinazioni) senza essere lungo da condividere.
const REFERRAL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReferralCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
  return code;
}

// Legge il codice invito del profilo, generandone uno nuovo al primo
// accesso se non esiste ancora (utenti già iscritti prima di questa
// funzionalità). Riprova su collisione (23505 = violazione unique) fino a
// 5 volte — praticamente mai necessario con 8 caratteri da un alfabeto di
// 32, ma mai un crash se succede davvero.
export async function ensureReferralCode(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (data?.referral_code) return data.referral_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error: updErr } = await supabase.from("profiles").update({ referral_code: code }).eq("id", userId);
    if (!updErr) return code;
    if (updErr.code !== "23505") throw updErr;
  }
  throw new Error("Non sono riuscito a generare un codice invito univoco — riprova.");
}

// Risolve un codice invito nell'id del proprietario tramite la funzione
// SQL security definer (SCHEMA_v63) — mai una query diretta su profiles
// filtrata per referral_code, che con le RLS standard ("solo la tua riga")
// non troverebbe comunque nulla per l'id di un altro utente.
export async function resolveReferralCode(supabase, code) {
  if (!code?.trim()) return null;
  const { data, error } = await supabase.rpc("resolve_referral_code", { code: code.trim() });
  if (error) throw error;
  return data || null;
}

// Registra l'iscrizione arrivata da un codice invito: chiama l'Edge
// Function record-referral-signup (SCHEMA_v67) invece di scrivere
// referred_by direttamente — solo lì si può catturare l'IP di chi si
// iscrive (un client non può leggere né dichiarare in modo affidabile il
// proprio IP pubblico), la base con cui process-referral-rewards riconosce
// e blocca chi tenta di auto-invitarsi con più email dallo stesso posto.
export async function recordReferralSignup(supabase, referralCode) {
  const { data, error } = await supabase.functions.invoke("record-referral-signup", { body: { referralCode } });
  if (error) throw error;
  return data; // { ok: true } oppure { ok: false, reason: "invalid" }
}

// Il proprio progresso verso il prossimo premio: quanti amici invitati con
// email verificata e IP distinto (referral_progress, SCHEMA_v67) e quanti
// mesi Premium già ricevuti — per la UI "2 su 3 amici" in ReferralCodeCard.
export async function fetchReferralProgress(supabase) {
  const { data, error } = await supabase.rpc("referral_progress");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { verifiedCount: row?.verified_count ?? 0, rewardsGranted: row?.rewards_granted ?? 0 };
}

// Per il coach: chi ha invitato chi, con il piano attuale del cliente
// invitato — il premio (1 mese Premium) scatta ora da solo quando il
// referrer accumula 3 amici verificati (SCHEMA_v67, process-referral-
// rewards); whitelistClient resta comunque disponibile per un premio
// manuale extra, a discrezione del coach, oltre a quello automatico.
export async function fetchReferrals(supabase) {
  const { data, error } = await supabase.from("profiles")
    .select("id, nickname, full_name, plan, created_at, referred_by")
    .not("referred_by", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const referrerIds = [...new Set(data.map((r) => r.referred_by))];
  const { data: referrers, error: refErr } = referrerIds.length
    ? await supabase.from("profiles").select("id, nickname, full_name").in("id", referrerIds)
    : { data: [], error: null };
  if (refErr) throw refErr;
  const referrerById = new Map((referrers ?? []).map((r) => [r.id, r.nickname || r.full_name || "Atleta"]));
  return data.map((r) => ({
    id: r.id, name: r.nickname || r.full_name || "Atleta", plan: r.plan, joinedAt: r.created_at,
    referrerName: referrerById.get(r.referred_by) || "—",
  }));
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

// Self-service: "Sì, elimina tutto" in Impostazioni. Stessa Edge Function di
// adminDeleteAccount ma SENZA userId nel corpo — la funzione lato server
// legge il chiamante dal proprio token e cancella quello, mai un id passato
// dal client (nessun utente deve poter chiedere l'eliminazione di un
// account che non è il proprio). BUG PRESO: prima onDeleteAccount in App.jsx
// era un no-op vuoto — il pulsante non faceva letteralmente nulla, l'utente
// restava sulla stessa schermata credendo che l'eliminazione fosse fallita
// in silenzio.
export async function deleteMyAccount(supabase) {
  const { error } = await supabase.functions.invoke("admin-delete-account", { body: {} });
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

export { MUSCLE_TARGETS, MUSCLES, DEFAULT_EXERCISE_LIB, EXERCISE_LIB_MUSCLE_TO_DB, DB_MUSCLE_TO_CHART, resolveMuscleTarget, fetchExerciseLibrary, learnExercise, saveExerciseGuide, fetchCustomExerciseLibraryRows, updateExerciseLibraryEntry, deleteExerciseFromLibrary, computeVolume, parseRepsTarget };

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
// BUG PRESO (N+1, trovato dall'audit UX/logica): faceva 2 query per cliente
// (ultimo messaggio + conteggio non letti), richiamata ogni 20s dal polling
// dell'inbox (App.jsx) — con un roster in crescita, decine di round-trip
// Supabase in parallelo ogni 20 secondi. Ora 2 query totali per l'intera
// inbox, stesso principio già in uso per computeBatch*Compliance qui sopra.
// L'API Supabase non supporta "ultima riga per gruppo" in una sola query
// senza una funzione RPC dedicata: il LIMIT qui sotto è quindi globale (non
// per-cliente) ma generosissimo rispetto ai volumi reali di una chat 1:1
// coach<->cliente — nessun "ultimo messaggio" resta realisticamente fuori,
// stessa approssimazione accettata (e commentata) in
// computeBatchTrainingCompliance più sopra.
export async function fetchCoachChatInbox(supabase, coachId) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, nickname, full_name")
    .eq("role", "user")
    .in("plan", [...REAL_COACHING_PLANS_DB]);
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const [{ data: recentMessages, error: msgErr }, { data: unreadRows, error: unreadErr }] = await Promise.all([
    supabase.from("chat_messages").select("client_id, body, attachment_type, sender_id, created_at")
      .in("client_id", ids).order("created_at", { ascending: false }).limit(2000),
    supabase.from("chat_messages").select("client_id")
      .in("client_id", ids).neq("sender_id", coachId).is("read_at", null),
  ]);
  if (msgErr) throw msgErr;
  if (unreadErr) throw unreadErr;

  // Righe già ordinate dalla più recente: la prima volta che un client_id
  // compare È il suo ultimo messaggio.
  const lastByClient = new Map();
  (recentMessages ?? []).forEach((m) => { if (!lastByClient.has(m.client_id)) lastByClient.set(m.client_id, m); });

  const unreadCountByClient = new Map();
  (unreadRows ?? []).forEach((r) => unreadCountByClient.set(r.client_id, (unreadCountByClient.get(r.client_id) ?? 0) + 1));

  const rows = profiles.map((p) => {
    const last = lastByClient.get(p.id) || null;
    return {
      id: p.id,
      name: p.full_name || p.nickname || "Atleta",
      lastMessage: last ? (last.body || (last.attachment_type ? "📎 Allegato" : null)) : null,
      lastMessageAt: last?.created_at || null,
      lastMessageMine: last ? last.sender_id === coachId : false,
      unreadCount: unreadCountByClient.get(p.id) ?? 0,
    };
  });

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

// Pallino rosso sull'icona Chat del cliente: quanti messaggi dell'ALTRA
// parte (il coach) sono ancora non letti — non più solo un booleano, il
// numero stesso compare dentro il pallino (richiesta esplicita: "così non
// si perdono nessuna indicazione"). Stessa logica di markChatMessagesRead
// sopra (neq sender_id + read_at is null), qui in sola lettura —
// ChatThread.jsx già segna tutto come letto non appena il thread viene
// aperto, questa funzione serve solo a decidere cosa mostrare PRIMA di
// entrarci.
export async function countUnreadChatMessages(supabase, clientId, readerId) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("client_id", clientId)
    .neq("sender_id", readerId)
    .is("read_at", null);
  if (error) throw error;
  return (data ?? []).length;
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

// Guida interattiva PERFORM (SCHEMA_v70): mostrata UNA volta sola per nuovo
// iscritto, subito dopo l'onboarding — sostituisce il vecchio banner
// "Giorno 1 di 14". Stesso pattern minimale di onboarding_completed, un
// solo booleano scritto quando l'utente la finisce o la salta (mai
// ripresentata dopo, mai un "ricordamelo più tardi" — chi la salta ha
// scelto di saltarla).
export async function markGuideTourCompleted(supabase, userId) {
  const { error } = await supabase.from("profiles").update({ guide_tour_completed: true }).eq("id", userId);
  if (error) throw error;
}

/* ---------------------------------------------------------------------------
   AVVISI TEAM — canale "team" già esistente in News & Tips (coach_news_tips,
   SCHEMA_v35): non una tabella/UI separata, solo la scrittura che mancava.
   L'RLS ("coach_news_tips_insert_team") già permette insert al coach su
   channel='team', il feed/il tab erano pronti da prima — serviva solo il
   form di pubblicazione, ora dentro NewsTipsView invece che in un modale a
   sé nell'header (vedi SCHEMA_v78 per la policy di eliminazione).
   ------------------------------------------------------------------------- */

export async function publishTeamPost(supabase, { eyebrow, title, body }) {
  const { error } = await supabase.from("coach_news_tips").insert({
    channel: "team", eyebrow: eyebrow?.trim() || null, title: title.trim(), body: body.trim(),
  });
  if (error) throw error;
}

export async function deleteTeamPost(supabase, postId) {
  const { error } = await supabase.from("coach_news_tips").delete().eq("id", postId);
  if (error) throw error;
}

// Push a tutti i clienti quando il coach pubblica un avviso team — invocata
// dal composer subito dopo publishTeamPost, stesso pattern try/catch "non
// bloccante" di notifyClientPlanChange/notifyCoachNewMessage: se il push
// fallisce il post resta comunque pubblicato, non si blocca il coach.
export async function notifyTeamPost(supabase, { title, body }) {
  try {
    await supabase.functions.invoke("notify-team", { body: { title, body } });
  } catch (err) {
    console.error("PERFORM: errore invio notifica push avviso team", err);
  }
}

/* ---------------------------------------------------------------------------
   NOVITÀ AVVISI TEAM (SCHEMA_v81) — pallino rosso sul tab News quando il
   coach ha pubblicato un post team dopo l'ultima visita del cliente a quel
   canale. Stesso principio di markSectionSeen/fetchSectionNovelty qui sotto,
   ma confrontato con created_at dell'ultimo post invece di un updated_at su
   profiles: i post team hanno già il proprio timestamp.
   ------------------------------------------------------------------------- */

// Chiamata dalla NewsTipsView quando il cliente apre il tab "team": azzera il
// pallino finché il coach non pubblica un nuovo post.
export async function markTeamSeen(supabase, userId) {
  const { error } = await supabase.from("profiles")
    .update({ team_seen_at: new Date().toISOString() }).eq("id", userId);
  if (error) console.error("PERFORM: errore aggiornamento visto avvisi team", userId, error);
}

// true se esiste un post team pubblicato dopo l'ultima visita del cliente
// (mai visitato = qualunque post esistente è "nuovo").
export async function hasUnseenTeamPost(supabase, userId) {
  const [{ data: profile, error: profileError }, { data: lastPost, error: postError }] = await Promise.all([
    supabase.from("profiles").select("team_seen_at").eq("id", userId).maybeSingle(),
    supabase.from("coach_news_tips").select("created_at").eq("channel", "team")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  if (postError) throw postError;
  if (!lastPost?.created_at) return false;
  return !profile?.team_seen_at || new Date(lastPost.created_at) > new Date(profile.team_seen_at);
}

/* ---------------------------------------------------------------------------
   NOVITÀ PER SEZIONE (SCHEMA_v80) — pallino rosso pulsante su Allenamento/
   Alimentazione/Integrazione in Home quando il coach ha aggiornato quella
   sezione dopo l'ultima visita del cliente. Stesso principio di
   last_seen_announcements_at (ora ritirato): un timestamp "aggiornato" (scritto
   dalle funzioni di scrittura coach — saveWeekWorkout/assignNutritionTarget/
   saveWeekSupplements) confrontato con un timestamp "visto" (scritto quando
   il cliente apre quella sezione in Home).
   ------------------------------------------------------------------------- */

const SECTION_COLUMNS = {
  workout: { updated: "workout_updated_at", seen: "workout_seen_at" },
  nutrition: { updated: "nutrition_updated_at", seen: "nutrition_seen_at" },
  supplements: { updated: "supplements_updated_at", seen: "supplements_seen_at" },
};

// Chiamata dalle funzioni di scrittura del coach qui sopra — mai dal client
// per la propria scheda: è il coach a "creare novità", mai il cliente.
async function markSectionUpdated(supabase, userId, section) {
  const { error } = await supabase.from("profiles")
    .update({ [SECTION_COLUMNS[section].updated]: new Date().toISOString() }).eq("id", userId);
  if (error) console.error("PERFORM: errore aggiornamento novità sezione", section, userId, error);
}

// Chiamata dalla Home quando il cliente apre la sezione: azzera il pallino
// finché il coach non tocca di nuovo quella sezione.
export async function markSectionSeen(supabase, userId, section) {
  const { error } = await supabase.from("profiles")
    .update({ [SECTION_COLUMNS[section].seen]: new Date().toISOString() }).eq("id", userId);
  if (error) console.error("PERFORM: errore aggiornamento visto sezione", section, userId, error);
}

// { workout: bool, nutrition: bool, supplements: bool } — true se il coach ha
// aggiornato quella sezione DOPO l'ultima visita del cliente (mai vista =
// qualunque aggiornamento esistente è "nuovo").
export async function fetchSectionNovelty(supabase, userId) {
  const { data, error } = await supabase.from("profiles")
    .select("workout_updated_at, workout_seen_at, nutrition_updated_at, nutrition_seen_at, supplements_updated_at, supplements_seen_at")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  const isNew = (updated, seen) => !!updated && (!seen || new Date(updated) > new Date(seen));
  return {
    workout: isNew(data?.workout_updated_at, data?.workout_seen_at),
    nutrition: isNew(data?.nutrition_updated_at, data?.nutrition_seen_at),
    supplements: isNew(data?.supplements_updated_at, data?.supplements_seen_at),
  };
}
