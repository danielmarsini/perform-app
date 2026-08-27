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
// Diverso da generate-plan: qui la risposta DEVE essere JSON strutturato
// (7 giorni, muscleTarget da un vocabolario fisso) invece di consiglio
// testuale libero — Master Prompt Allenamento condensato + contratto JSON,
// duplicati qui (non importati dal client) per restare "blindati".
//
// Due modalità (stesso contratto di output in entrambe):
//   1. GENERAZIONE — clientContext (obiettivo/livello/dolori/PR) + notes,
//      nessuna sorgente: l'AI progetta la settimana da zero sui Master Prompt.
//   2. IMPORT — il coach ha già scritto la scheda a mano o in un PDF
//      (sourceText e/o sourcePdfBase64): l'AI TRASCRIVE fedelmente quello che
//      c'è scritto nel contratto JSON dell'editor (stessi esercizi/serie/
//      ripetizioni/recupero), mappando solo la terminologia libera del coach
//      sul vocabolario fisso muscleTarget/technique — non inventa né
//      "migliora" un allenamento che il coach ha già deciso lui stesso.
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
// va imposto qui, non lasciato all'estro del modello.
const MUSCLE_TARGETS = [
  "Pettorali", "Gran Dorsale", "Lombari", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];
const TECHNIQUES = ["Nessuna", "Rest-Pause", "Drop-set", "Stripping", "Super-set"];

const JSON_CONTRACT = `Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con questa struttura esatta:
{"days": [null|{"label": "nome del giorno, es. Push A — Petto/Spalle/Tricipiti", "warmup": "...", "stretching": "...", "exercises": [{"name": "...", "muscleTarget": "...", "synergists": [...], "sets": 4, "reps": "8-10", "rest": 120, "rirTarget": "2", "technique": "Nessuna"}]}, ...]}

L'array "days" ha ESATTAMENTE 7 elementi, indice 0 = lunedì, indice 6 = domenica. Usa ESCLUSIVAMENTE questi valori per "muscleTarget", verbatim, mai un sinonimo o una variante: ${MUSCLE_TARGETS.join(", ")}. "synergists" è un array (anche vuoto) di distretti sinergici tra gli stessi valori sopra — mai il distretto primario ripetuto lì dentro. Usa ESCLUSIVAMENTE questi valori per "technique": ${TECHNIQUES.join(", ")}. "reps" è una stringa (es. "8-10" o "6"), "rest" sono i secondi di recupero (numero), "sets" è il numero di serie dirette (numero), "rirTarget" è una stringa (es. "2") o stringa vuota se non applicabile.

"warmup" e "stretching" sono testo libero (poche righe, non un oggetto strutturato), scritti in base agli esercizi/gruppi muscolari di QUEL giorno specifico — mai generici, mai identici tra un giorno gambe e un giorno spalle. "warmup" è la mobilità articolare e l'attivazione da fare PRIMA della sessione (es. "Cyclette leggera 5', Hip circles 2x10 per lato, Band pull-apart 2x15"); "stretching" sono gli allungamenti statici da fare a fine sessione sui gruppi appena allenati (es. "Stretching quadricipiti 2x30 sec per lato, Stretching flessori dell'anca 2x30 sec"). Includi sempre serie/ripetizioni o una durata quando ha senso, ma resta un testo discorsivo, non un altro array JSON. Un giorno di riposo ("null") non ha né warmup né stretching. MAI includere sessioni di cardio in "exercises" o altrove: il cardio lo assegna il coach a parte, non è compito tuo.`;

const GENERATE_SYSTEM_PROMPT = `Sei un luminare in chinesiologia, biomeccanica e metodologia dell'allenamento per Bodybuilding, Powerlifting, Fitness e recupero infortuni. Il tuo compito è generare la BOZZA di una settimana di allenamento (7 giorni, lunedì-domenica) per un cliente di coaching, seguendo queste regole non negoziabili:

1. Analizza obiettivo, livello, sessioni settimanali, dolori/infortuni segnalati e PR forniti nel contesto prima di scegliere un solo esercizio — mai un esercizio a rischio per una zona dolente segnalata, qualunque sia il livello dichiarato.
2. Distribuisci il numero di sessioni allenanti richiesto sui 7 giorni (gli altri restano giorni di riposo, "day": null), con una progressione di volume/intensità sensata per il livello dichiarato.
3. Tecniche avanzate (Rest-Pause, Drop-set, Stripping, Super-set) solo per livelli intermedio/avanzato, mai su un principiante.
4. Per ogni giorno di allenamento scrivi anche "warmup" (mobilità/attivazione pre-sessione) e "stretching" (allungamenti di fine sessione) mirati sui gruppi muscolari che alleni quel giorno — mai lo stesso testo copiato su giorni diversi.

${JSON_CONTRACT}`;

const IMPORT_SYSTEM_PROMPT = `Il coach ti ha già scritto (a mano, o in un PDF/foto) una scheda di allenamento completa. Il tuo compito è TRASCRIVERLA fedelmente nel contratto JSON dell'editor — NON è una generazione da zero:

1. Riporta esattamente gli esercizi, l'ordine dei giorni, le serie, le ripetizioni e i recuperi così come scritti dal coach — mai inventare, aggiungere, togliere o "migliorare" un esercizio che non c'è nel testo/PDF originale.
2. Se un giorno del testo originale non specifica un dato (es. recupero non scritto), usa un valore di buon senso per quel tipo di esercizio invece di inventare un numero a caso, ma SOLO per riempire un vuoto — mai per sovrascrivere un numero che il coach ha già scritto.
3. Il testo del coach userà quasi certamente nomi di gruppi muscolari o terminologia diversa dal vocabolario fisso dell'app — mappa ogni esercizio al valore più corretto tra quelli consentiti, non lasciare mai "muscleTarget" fuori vocabolario.
4. Se un giorno del testo/PDF è esplicitamente un giorno di riposo (o non è menzionato), quel giorno è "null" nell'array.
5. Se il testo/PDF originale scrive già un riscaldamento o uno stretching per un giorno, trascrivili fedelmente in "warmup"/"stretching" invece di inventarli. Se non li scrive, componili tu in base agli esercizi di quel giorno (stessa logica della generazione da zero) — non lasciarli mai vuoti su un giorno di allenamento.

${JSON_CONTRACT}`;

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
    Number.isFinite(Number(ex.sets)) && Number.isFinite(Number(ex.rest)));
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

  const { clientContext, notes, sourceText, sourcePdfBase64 } = await req.json().catch(() => ({}));
  const trimmedNotes = typeof notes === "string" ? notes.slice(0, MAX_NOTES_CHARS) : "";
  const trimmedSourceText = typeof sourceText === "string" ? sourceText.slice(0, MAX_SOURCE_TEXT_CHARS) : "";
  const isImport = !!trimmedSourceText || !!sourcePdfBase64;

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
      max_tokens: 4000,
      system: isImport ? IMPORT_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("risposta senza JSON valido");
    const parsed = JSON.parse(match[0]);
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
