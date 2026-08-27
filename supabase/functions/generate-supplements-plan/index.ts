// PERFORM — Edge Function: generate-supplements-plan
// ============================================================================
// Editor integrazione del coach (09_CoachDashboard.jsx, WeekSuppsEditor): il
// coach dà un'istruzione libera e breve (es. "base per principianti",
// "massa, intermedio") e l'AI sceglie autonomamente QUALI integratori, con
// quale dose, e in quale momento della giornata distribuirli — sempre nel
// vocabolario di SUPP_MOMENTS (le stesse 5 fasce orarie già usate lato
// cliente/coach). Il coach rivede e preme "Salva modifiche" come sempre
// (saveWeekSupplements, delete+reinsert — nessuna differenza rispetto a un
// protocollo scritto a mano).
//
// SUPP_WIKI (nome/dose/timing di riferimento per gli integratori più noti,
// definito in 05_HomeDashboard.jsx) arriva nel corpo della richiesta invece
// di essere duplicato qui — stessa scelta di generate-nutrition-week per
// FOOD_DB: dati di riferimento, non un segreto, restano sincronizzati.
//
// Solo integratori sportivi da banco, evidence-based e sicuri per un uso
// generale (creatina, whey, caffeina, omega-3, vitamina D, multivitaminico,
// magnesio, ecc.) — mai sostanze prescrivibili o dopanti, il coach verifica
// comunque ogni volta prima di consegnare il protocollo al cliente.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Stesso vocabolario di SUPP_MOMENTS (05_HomeDashboard.jsx) — i 5 momenti
// canonici della giornata usati per riordinare l'integrazione lato cliente.
const SUPP_MOMENTS = [
  { id: "mattina", label: "Mattina" },
  { id: "pomeriggio", label: "Pomeriggio" },
  { id: "preWo", label: "Pre-Wo" },
  { id: "postWo", label: "Post-Wo" },
  { id: "sera", label: "Sera" },
];
const MOMENT_IDS = SUPP_MOMENTS.map((m) => m.id);
const DAY_TYPES = ["all", "on", "off"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const SAFETY_CAP_USD = 10.0;
const MAX_INSTRUCTION_CHARS = 500;
const MAX_WIKI_ENTRIES = 60;

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildSystemPrompt() {
  return `Sei un esperto di integrazione sportiva evidence-based. Il coach ti dà un'istruzione breve sul cliente (es. obiettivo, livello) e tu proponi un protocollo di integrazione, seguendo queste regole non negoziabili:

1. Scegli SOLO integratori sportivi da banco, sicuri ed evidence-based (es. creatina, whey/proteine, caffeina, omega-3, vitamina D, multivitaminico, magnesio, ZMA, beta-alanina, elettroliti) — MAI sostanze dopanti, prescrivibili o non sicure senza controllo medico.
2. Usa il vocabolario di riferimento fornito (nome/dose/timing tipici) quando un integratore scelto vi compare, adattando la dose solo se l'istruzione del coach lo richiede esplicitamente.
3. Distribuisci ogni integratore nel momento della giornata più corretto in base al suo timing tipico — usa ESCLUSIVAMENTE questi id per "id_ref", verbatim: ${MOMENT_IDS.join(", ")} (mattina, pomeriggio, pre-workout, post-workout, sera).
4. "dayType" indica quando vale l'assunzione: "all" tutti i giorni, "on" solo giorni di allenamento, "off" solo giorni di riposo — usa ESCLUSIVAMENTE questi 3 valori, verbatim: ${DAY_TYPES.join(", ")}.
5. Non generare sezioni vuote — solo i momenti che contengono almeno un integratore.

Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con questa struttura esatta:
{"sections": [{"id_ref": "mattina", "items": [{"name": "...", "dose": "...", "dayType": "all"}]}]}`;
}

function isValidSection(sec) {
  if (!sec || !MOMENT_IDS.includes(sec.id_ref) || !Array.isArray(sec.items) || sec.items.length === 0) return false;
  return sec.items.every((it) =>
    it && typeof it.name === "string" && it.name.trim() &&
    typeof it.dose === "string" && DAY_TYPES.includes(it.dayType));
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

  const { instruction, clientContext, suppWiki } = await req.json().catch(() => ({}));
  const trimmedInstruction = typeof instruction === "string" ? instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
  if (!trimmedInstruction) {
    return new Response(JSON.stringify({ error: "instruction mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  const wiki = Array.isArray(suppWiki) ? suppWiki.slice(0, MAX_WIKI_ENTRIES) : [];

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= SAFETY_CAP_USD) {
    return new Response(JSON.stringify({ error: `Raggiunto il tetto di sicurezza mensile dell'editor AI (${SAFETY_CAP_USD}$) — si azzera il 1° del prossimo mese.` }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: buildSystemPrompt(),
      messages: [{
        role: "user",
        content: `Vocabolario integratori di riferimento (nome/dose tipica/timing):\n${JSON.stringify(wiki.map((w) => ({ name: w.name, dose: w.dose, timing: w.timing })))}\n\nDati cliente:\n${JSON.stringify(clientContext ?? {}, null, 2)}\n\nIstruzione del coach: ${trimmedInstruction}`,
      }],
    });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("risposta senza JSON valido");
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0 || !parsed.sections.every(isValidSection)) {
      throw new Error("struttura protocollo non valida");
    }

    const cost = response.usage.input_tokens * COST_PER_INPUT_TOKEN + response.usage.output_tokens * COST_PER_OUTPUT_TOKEN;
    await admin.from("ai_usage_monthly").upsert(
      { user_id: user.id, month, cost_usd: spentSoFar + cost, requests: Number(usageRow?.requests ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" },
    );

    return new Response(JSON.stringify({ sections: parsed.sections }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore generazione protocollo integrazione AI", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a generare un protocollo valido. Riprova, eventualmente con un'istruzione più semplice." }), { status: 500, headers: CORS_HEADERS });
  }
});
