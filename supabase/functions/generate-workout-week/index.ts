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

const SYSTEM_PROMPT = `Sei un luminare in chinesiologia, biomeccanica e metodologia dell'allenamento per Bodybuilding, Powerlifting, Fitness e recupero infortuni. Il tuo compito è generare la BOZZA di una settimana di allenamento (7 giorni, lunedì-domenica) per un cliente di coaching, seguendo queste regole non negoziabili:

1. Analizza obiettivo, livello, sessioni settimanali, dolori/infortuni segnalati e PR forniti nel contesto prima di scegliere un solo esercizio — mai un esercizio a rischio per una zona dolente segnalata, qualunque sia il livello dichiarato.
2. Distribuisci il numero di sessioni allenanti richiesto sui 7 giorni (gli altri restano giorni di riposo, "day": null), con una progressione di volume/intensità sensata per il livello dichiarato.
3. Usa ESCLUSIVAMENTE questi valori per "muscleTarget" (il distretto primario dell'esercizio), verbatim, mai un sinonimo o una variante: ${MUSCLE_TARGETS.join(", ")}.
4. "synergists" è un array (anche vuoto) di distretti sinergici tra gli stessi valori sopra — mai il distretto primario ripetuto lì dentro.
5. Usa ESCLUSIVAMENTE questi valori per "technique": ${TECHNIQUES.join(", ")} — tecniche avanzate (Rest-Pause, Drop-set, Stripping, Super-set) solo per livelli intermedio/avanzato, mai su un principiante.
6. "reps" è una stringa (es. "8-10" o "6"), "rest" sono i secondi di recupero (numero), "sets" è il numero di serie dirette (numero), "rirTarget" è una stringa (es. "2") o stringa vuota se non applicabile.

Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con questa struttura esatta:
{"days": [null|{"label": "nome del giorno, es. Push A — Petto/Spalle/Tricipiti", "exercises": [{"name": "...", "muscleTarget": "...", "synergists": [...], "sets": 4, "reps": "8-10", "rest": 120, "rirTarget": "2", "technique": "Nessuna"}]}, ...]}

L'array "days" ha ESATTAMENTE 7 elementi, indice 0 = lunedì, indice 6 = domenica.`;

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

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidDay(day) {
  if (day === null) return true;
  if (typeof day !== "object" || !day.label || !Array.isArray(day.exercises)) return false;
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

  const { clientContext, notes } = await req.json().catch(() => ({}));
  const trimmedNotes = typeof notes === "string" ? notes.slice(0, MAX_NOTES_CHARS) : "";

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= SAFETY_CAP_USD) {
    return new Response(JSON.stringify({ error: `Raggiunto il tetto di sicurezza mensile dell'editor AI (${SAFETY_CAP_USD}$) — si azzera il 1° del prossimo mese.` }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Dati reali del cliente:\n${JSON.stringify(clientContext ?? {}, null, 2)}\n\nNote aggiuntive del coach: ${trimmedNotes || "(nessuna)"}`,
      }],
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
