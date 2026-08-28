// PERFORM — Edge Function: generate-workout-week
// ============================================================================
// Editor allenamento del coach (09_CoachDashboard.jsx, WeekWorkoutEditor):
// genera una BOZZA di settimana di allenamento (7 giorni, esercizi/serie/
// ripetizioni/recupero) partendo dai dati reali del cliente forniti dal
// client (obiettivo, livello/sessioni da anamnesi, dolori segnalati, PR) —
// mai una query separata qui dentro, stesso principio di coach-assistant e
// generate-plan. La bozza viene SOLO caricata nell'editor (stato locale),
// il coach la rivede/corregge e la salva lui stesso con "Salva" — questa
// funzione non scrive mai su workout_logs.
//
// Diverso da generate-plan: qui la risposta DEVE essere dati strutturati
// (7 giorni, muscleTarget da un vocabolario fisso) invece di consiglio
// testuale libero — ottenuta con TOOL CALLING (vedi WORKOUT_TOOL sotto), non
// chiedendo al modello di scrivere JSON come testo libero da fare regex+parse
// a mano: quest'ultimo approccio (usato fino a questa versione) falliva
// realisticamente ogni volta che il testo/PDF del coach conteneva un
// carattere " non scappato (es. una misura in pollici) — l'API costruisce
// l'input dello strumento con l'escaping corretto, il modello non "scrive"
// mai i caratteri speciali a mano.
//
// Due modalità (stesso contratto di output in entrambe):
//   1. GENERAZIONE — clientContext (obiettivo/livello/dolori/PR) + notes,
//      nessuna sorgente: l'AI progetta la settimana da zero sui Master Prompt.
//   2. IMPORT — il coach ha già scritto la scheda a mano o in un PDF
//      (sourceText e/o sourcePdfBase64): l'AI TRASCRIVE fedelmente quello che
//      c'è scritto, mappando solo la terminologia libera del coach sul
//      vocabolario fisso muscleTarget/technique — non inventa né "migliora"
//      un allenamento che il coach ha già deciso lui stesso.
//
// Ogni giorno di allenamento include anche "warmup" (mobilità/attivazione
// pre-sessione) e "stretching" (allungamenti di fine sessione), testo libero
// scritto in base agli esercizi assegnati quel giorno — mai serie/carichi da
// monitorare come gli esercizi di forza, solo da leggere (SCHEMA_v84,
// workout_day_notes). Il cardio invece NON è mai generato qui: il coach lo
// aggiunge sempre a mano in WeekWorkoutEditor come una voce con solo nome +
// minuti (workout_logs.kind = "cardio").

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Stesso vocabolario di MUSCLE_TARGETS (src/lib/coachingData.js) — il check
// costraint reale su workout_logs.muscle_target. Un valore fuori da questa
// lista viene scartato dal salvataggio lato coach (saveWeekWorkout), quindi
// va imposto qui (nell'enum dello schema E nel controllo isValidDay sotto),
// non lasciato all'estro del modello.
const MUSCLE_TARGETS = [
  "Pettorali", "Gran Dorsale", "Lombari", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];
const TECHNIQUES = ["Nessuna", "Rest-Pause", "Drop-set", "Stripping", "Super-set"];

// Contenuto del vecchio JSON_CONTRACT, spogliato delle istruzioni "scrivi
// JSON come testo" (non più necessarie: la struttura è imposta dallo schema
// dello strumento, non dal prompt) — resta solo la guida sul CONTENUTO che
// lo schema da solo non può imporre (conteggio giorni, stile di warmup/
// stretching, esclusione cardio).
const CONTENT_RULES = `Chiama SEMPRE ed ESCLUSIVAMENTE lo strumento "report_workout_week" con l'intera settimana — non rispondere mai a parole, nemmeno per spiegazioni o dubbi.

"days" ha ESATTAMENTE 7 elementi, indice 0 = lunedì, indice 6 = domenica (un giorno di riposo è null). "synergists" sono distretti sinergici tra gli stessi valori di "muscleTarget" — mai il distretto primario ripetuto lì dentro. "reps" è una stringa (es. "8-10" o "6"), "rest" sono i secondi di recupero, "sets" è il numero di serie dirette.

"rirTarget" (RIR = reps in reserve, "0" = a cedimento) va SEMPRE valorizzato con criterio da coach di bodybuilding professionista anche quando la fonte non lo scrive esplicitamente: più basso (0-1) su esercizi di isolamento/fine sessione o settimane di intensificazione, più alto (2-4) su multiarticolari pesanti/inizio sessione o con un principiante, mai lasciato vuoto per pigrizia — è una stringa (es. "2").

"warmup" e "stretching" sono testo libero SU UNA RIGA SOLA (poche frasi separate da virgole), scritti in base agli esercizi/gruppi muscolari di QUEL giorno specifico — mai generici, mai identici tra un giorno gambe e un giorno spalle. "warmup" è la mobilità articolare e l'attivazione da fare PRIMA della sessione (es. "Cyclette leggera 5 minuti, Hip circles 2x10 per lato, Band pull-apart 2x15"); "stretching" sono gli allungamenti statici da fare a fine sessione sui gruppi appena allenati (es. "Stretching quadricipiti 2x30 sec per lato, Stretching flessori dell'anca 2x30 sec"). Includi sempre serie/ripetizioni o una durata quando ha senso. Un giorno di riposo (null) non ha né warmup né stretching. MAI includere sessioni di cardio tra gli esercizi o altrove: il cardio lo assegna il coach a parte, non è compito tuo.

"howTo" e "avoid" (guida esercizio) vanno scritti SOLO alla PRIMA occorrenza di ciascun nome esercizio nella settimana, leggendo i giorni in ordine — se lo stesso esercizio ricompare in un giorno successivo, lascia "howTo"/"avoid" vuoti per quell'occorrenza (non ripetere lo stesso testo, sprechi token). Quando li scrivi, usa un registro scientifico da professore universitario di scienze motorie che spiega a 360 gradi, non un elenco puntato breve: "howTo" è un paragrafo completo su setup, esecuzione, respirazione, range di movimento e controllo del tempo sotto tensione; "avoid" è un paragrafo su errori tecnici comuni, compensi articolari e situazioni/infortuni in cui l'esercizio va evitato o modificato. Per gli esercizi cardio non scrivere mai howTo/avoid (non fanno parte di "exercises", vedi sopra).`;

const GENERATE_SYSTEM_PROMPT = `Sei un luminare in chinesiologia, biomeccanica e metodologia dell'allenamento per Bodybuilding, Powerlifting, Fitness e recupero infortuni. Il tuo compito è generare la BOZZA di una settimana di allenamento (7 giorni, lunedì-domenica) per un cliente di coaching, seguendo queste regole non negoziabili:

1. Analizza obiettivo, livello, sessioni settimanali, dolori/infortuni segnalati e PR forniti nel contesto prima di scegliere un solo esercizio — mai un esercizio a rischio per una zona dolente segnalata, qualunque sia il livello dichiarato.
2. Distribuisci il numero di sessioni allenanti richiesto sui 7 giorni (gli altri restano giorni di riposo, null), con una progressione di volume/intensità sensata per il livello dichiarato.
3. Tecniche avanzate (Rest-Pause, Drop-set, Stripping, Super-set) solo per livelli intermedio/avanzato, mai su un principiante.
4. Per ogni giorno di allenamento scrivi anche "warmup" (mobilità/attivazione pre-sessione) e "stretching" (allungamenti di fine sessione) mirati sui gruppi muscolari che alleni quel giorno — mai lo stesso testo copiato su giorni diversi.

${CONTENT_RULES}`;

const IMPORT_SYSTEM_PROMPT = `Il coach ti ha già scritto (a mano, o in un PDF/foto) una scheda di allenamento completa. Il tuo compito è TRASCRIVERLA fedelmente nello strumento — NON è una generazione da zero:

1. Riporta esattamente gli esercizi, l'ordine dei giorni, le serie, le ripetizioni e i recuperi così come scritti dal coach — mai inventare, aggiungere, togliere o "migliorare" un esercizio che non c'è nel testo/PDF originale.
2. Se un giorno del testo originale non specifica un dato (es. recupero o RIR/intensità non scritti), usa un valore di buon senso per quel tipo di esercizio invece di inventare un numero a caso, ma SOLO per riempire un vuoto — mai per sovrascrivere un numero che il coach ha già scritto.
3. Il testo del coach userà quasi certamente nomi di gruppi muscolari o terminologia diversa dal vocabolario fisso dell'app — mappa ogni esercizio al valore più corretto tra quelli consentiti, non lasciare mai "muscleTarget" fuori vocabolario.
4. Se un giorno del testo/PDF è esplicitamente un giorno di riposo (o non è menzionato), quel giorno è null.
5. Se il testo/PDF originale scrive già un riscaldamento o uno stretching per un giorno, trascrivili fedelmente in "warmup"/"stretching" invece di inventarli. Se non li scrive, componili tu in base agli esercizi di quel giorno (stessa logica della generazione da zero) — non lasciarli mai vuoti su un giorno di allenamento.

${CONTENT_RULES}`;

// Tool calling invece di "scrivi un JSON come testo": l'API stessa costruisce
// l'input dello strumento con l'escaping corretto (virgolette, a capo, ecc.),
// eliminando la classe di bug per cui un carattere " non scappato dentro un
// nome esercizio/misura rendeva l'intero JSON invalido lato parsing manuale.
const DAY_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Nome del giorno, es. \"Push A — Petto/Spalle/Tricipiti\"." },
    warmup: { type: "string", description: "Riscaldamento/mobilità pre-sessione, testo libero su una riga." },
    stretching: { type: "string", description: "Stretching di fine sessione, testo libero su una riga." },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          muscleTarget: { type: "string", enum: MUSCLE_TARGETS },
          synergists: { type: "array", items: { type: "string", enum: MUSCLE_TARGETS } },
          sets: { type: "number" },
          reps: { type: "string" },
          rest: { type: "number", description: "Secondi di recupero." },
          rirTarget: { type: "string", description: "RIR (reps in reserve), sempre valorizzato — vedi istruzioni." },
          technique: { type: "string", enum: TECHNIQUES },
          howTo: { type: "string", description: "Guida esecuzione scientifica — SOLO alla prima occorrenza del nome esercizio nella settimana, altrimenti omesso." },
          avoid: { type: "string", description: "Errori comuni/controindicazioni — SOLO alla prima occorrenza del nome esercizio nella settimana, altrimenti omesso." },
        },
        required: ["name", "muscleTarget", "sets", "reps", "rest", "technique", "rirTarget"],
      },
    },
  },
  required: ["label", "exercises"],
};

const WORKOUT_TOOL = {
  name: "report_workout_week",
  description: "Restituisce la bozza completa della settimana di allenamento (7 giorni, lunedì-domenica).",
  input_schema: {
    type: "object",
    properties: {
      days: {
        type: "array",
        description: "Esattamente 7 elementi, indice 0 = lunedì, indice 6 = domenica. null per un giorno di riposo.",
        items: { anyOf: [{ type: "null" }, DAY_SCHEMA] },
      },
    },
    required: ["days"],
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stesso prezzario/tetto di sicurezza di generate-plan/coach-assistant.
const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const SAFETY_CAP_USD = 10.0;
const MAX_NOTES_CHARS = 1000;
const MAX_SOURCE_TEXT_CHARS = 12000;

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidDay(day) {
  if (day === null) return true;
  if (typeof day !== "object" || !day.label || !Array.isArray(day.exercises)) return false;
  // warmup/stretching: opzionali qui (un giorno che non li scrive non deve
  // far scartare l'intera bozza) — testo libero, quindi solo un controllo di
  // tipo, mai una struttura da validare.
  if (day.warmup !== undefined && typeof day.warmup !== "string") return false;
  if (day.stretching !== undefined && typeof day.stretching !== "string") return false;
  return day.exercises.every((ex) =>
    ex && typeof ex.name === "string" && ex.name.trim() &&
    MUSCLE_TARGETS.includes(ex.muscleTarget) &&
    (ex.synergists === undefined || Array.isArray(ex.synergists)) &&
    Number.isFinite(Number(ex.sets)) && Number.isFinite(Number(ex.rest)) &&
    (ex.howTo === undefined || typeof ex.howTo === "string") &&
    (ex.avoid === undefined || typeof ex.avoid === "string"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può usare l'editor AI" }), { status: 403, headers: CORS_HEADERS });
  }

  const { mode, clientContext, notes, sourceText, sourcePdfBase64 } = await req.json().catch(() => ({}));
  const trimmedNotes = typeof notes === "string" ? notes.slice(0, MAX_NOTES_CHARS) : "";
  const trimmedSourceText = typeof sourceText === "string" ? sourceText.slice(0, MAX_SOURCE_TEXT_CHARS) : "";
  const hasSource = !!trimmedSourceText || !!sourcePdfBase64;
  // "mode" (inviato dal client) è la fonte di verità quando presente: se il
  // coach ha scelto "Incolla o carica scheda" ma sourceText/sourcePdfBase64
  // non sono arrivati integri al server (PDF troppo grande, intoppo di
  // rete...), NON deve silenziosamente ripiegare su una generazione da zero
  // con clientContext vuoto — il coach riceverebbe una bozza "inventata" che
  // sembra valida ma non ha nulla a che fare col PDF che ha caricato. Meglio
  // un errore chiaro. Fallback a "isImport = hasSource" solo se un client
  // più vecchio (non ancora aggiornato) non invia ancora "mode".
  const isImport = mode === "import" ? true : mode === "generate" ? false : hasSource;
  console.log("PERFORM: generate-workout-week richiesta", { mode: mode ?? "(assente)", isImport, hasSourceText: !!trimmedSourceText, hasPdf: !!sourcePdfBase64, pdfSizeKB: sourcePdfBase64 ? Math.round((sourcePdfBase64.length * 0.75) / 1024) : 0 });
  if (isImport && !hasSource) {
    return new Response(JSON.stringify({ error: "Nessuna scheda sorgente ricevuta dal server (testo incollato o PDF) — il file potrebbe essere troppo grande o la connessione è caduta. Riprova, eventualmente con un PDF più leggero." }), { status: 400, headers: CORS_HEADERS });
  }

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= SAFETY_CAP_USD) {
    return new Response(JSON.stringify({ error: `Raggiunto il tetto di sicurezza mensile dell'editor AI (${SAFETY_CAP_USD}$) — si azzera il 1° del prossimo mese.` }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    // Import: il PDF (se c'è) va PRIMA del testo nel content array — stessa
    // convenzione richiesta dall'API per i blocchi "document". Generazione
    // da zero: nessun documento, solo il contesto cliente come oggi.
    const userContent = isImport
      ? [
          ...(sourcePdfBase64 ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: sourcePdfBase64 } }] : []),
          { type: "text", text: `${trimmedSourceText ? `Testo della scheda scritto dal coach:\n${trimmedSourceText}\n\n` : ""}Note aggiuntive del coach: ${trimmedNotes || "(nessuna)"}` },
        ]
      : `Dati reali del cliente:\n${JSON.stringify(clientContext ?? {}, null, 2)}\n\nNote aggiuntive del coach: ${trimmedNotes || "(nessuna)"}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: isImport ? IMPORT_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tools: [WORKOUT_TOOL],
      tool_choice: { type: "tool", name: "report_workout_week" },
    });

    // Con tool_choice forzato, la settimana arriva già come oggetto JS
    // dentro il blocco tool_use — mai più testo libero da isolare con una
    // regex e passare a JSON.parse a mano.
    const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === "report_workout_week");
    if (!toolUse || !toolUse.input || typeof toolUse.input !== "object") {
      throw new Error(
        response.stop_reason === "max_tokens"
          ? "risposta troncata (scheda troppo lunga) — riprova con note più semplici o dividendo l'import in due parti"
          : "risposta senza dati validi dallo strumento AI",
      );
    }
    const parsed = toolUse.input;
    if (!Array.isArray(parsed.days) || parsed.days.length !== 7 || !parsed.days.every(isValidDay)) {
      throw new Error("struttura settimana non valida");
    }

    const cost = response.usage.input_tokens * COST_PER_INPUT_TOKEN + response.usage.output_tokens * COST_PER_OUTPUT_TOKEN;
    await admin.from("ai_usage_monthly").upsert(
      { user_id: user.id, month, cost_usd: spentSoFar + cost, requests: Number(usageRow?.requests ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" },
    );

    return new Response(JSON.stringify({ days: parsed.days }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore generazione bozza allenamento AI", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a generare una bozza valida. Riprova, eventualmente con note più semplici." }), { status: 500, headers: CORS_HEADERS });
  }
});
