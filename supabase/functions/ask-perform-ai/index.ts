// PERFORM — Edge Function: ask-perform-ai
// ============================================================================
// Proxy server-side verso Claude per la chat "💬 Fai una domanda a PERFORM AI"
// in News & Tips (06_NewsTipsView.jsx). Il client NON deve mai vedere
// ANTHROPIC_API_KEY né poter scegliere il system prompt — entrambi vivono
// solo qui. Il blocco "Performance Pack o superiore" lato client è UX; il
// controllo che conta davvero è quello sotto su profiles.plan, altrimenti un
// utente Free smaliziato potrebbe chiamare questa funzione bypassando
// l'interfaccia (nota già presente in 06_NewsTipsView.jsx).
//
// TETTO DI SPESA: 1$/mese per utente (circa 1€, i prezzi Anthropic sono in
// USD), calcolato sui token REALI restituiti da Claude (response.usage), mai
// una stima — letto/scritto su ai_usage_monthly (SCHEMA_v33) prima e dopo
// ogni chiamata. Domanda troppo lunga o cronologia troppo estesa fanno
// salire il costo per messaggio: entrambe limitate sotto per restare su
// "domande di ricerca approfondita" mirate, non conversazioni infinite o
// incollate di testo enormi (niente allegati/file: la UI non lo permette
// già, qui si limita solo la lunghezza del testo).

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = "Sei PERFORM AI, l'assistente scientifico dell'app PERFORM. Rispondi sempre in italiano, in modo preciso, sobrio e mai sensazionalistico, in massimo 120 parole, basandoti sul contesto dell'articolo fornito. Resta sempre sul contesto dello studio/articolo: se la domanda è completamente estranea (non scientifica, non legata a fitness/nutrizione/recupero), spiega gentilmente che sei qui solo per approfondire gli articoli PERFORM. Se la domanda riguarda una situazione medica o di salute personale, ricorda che non sostituisci un medico o il coach e invita a rivolgersi a loro per decisioni individuali.";

// Prezzi reali Claude Sonnet 5 (platform.claude.com/docs, agosto 2026):
// $2/MTok input, $10/MTok output. Nessuno sconto cache qui (conversazioni
// brevi, non varrebbe il costo di gestirla).
const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const MONTHLY_CAP_USD = 1.0; // ~1€ al mese incluso nel Performance Pack
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_MESSAGES = 6;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

  const { data: profile } = await admin.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  if (!profile || profile.plan === "free") {
    return new Response(JSON.stringify({ error: "Serve il Performance Pack (o un piano superiore) per usare PERFORM AI." }), { status: 403, headers: CORS_HEADERS });
  }

  const { context, question, history } = await req.json().catch(() => ({}));
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return new Response(JSON.stringify({ error: `Domanda troppo lunga (massimo ${MAX_QUESTION_CHARS} caratteri) — riformulala in modo più diretto.` }), { status: 400, headers: CORS_HEADERS });
  }

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= MONTHLY_CAP_USD) {
    return new Response(JSON.stringify({ error: "Hai raggiunto il numero di domande incluse in PERFORM AI questo mese — si azzera il 1° del prossimo mese." }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-MAX_HISTORY_MESSAGES).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.text || "").slice(0, MAX_QUESTION_CHARS),
      })),
      { role: "user", content: `Contesto dell'articolo:\n${String(context || "").slice(0, 2000)}\n\nDomanda dell'atleta: ${question}` },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const cost = response.usage.input_tokens * COST_PER_INPUT_TOKEN + response.usage.output_tokens * COST_PER_OUTPUT_TOKEN;
    await admin.from("ai_usage_monthly").upsert(
      { user_id: user.id, month, cost_usd: spentSoFar + cost, requests: Number(usageRow?.requests ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" }
    );

    return new Response(JSON.stringify({ text }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore chiamata Claude (ask-perform-ai)", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a contattare PERFORM AI." }), { status: 500, headers: CORS_HEADERS });
  }
});
