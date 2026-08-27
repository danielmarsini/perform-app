// PERFORM — Edge Function: coach-assistant
// ============================================================================
// Assistente AI nell'Hub Atleti (09_CoachDashboard.jsx): il coach fa una
// domanda in linguaggio naturale sui propri clienti — "chi non si allena da
// una settimana", "riassumimi la situazione di Mario" — e riceve una
// risposta basata SOLO sul roster reale, mai inventata. Il roster arriva già
// pronto dal client (CoachDataContext.clients, la stessa lista che alimenta
// Hub Atleti): niente query duplicate qui dentro, il coach guarda già questi
// dati ogni giorno tramite fetchClientRoster.
//
// Stesso schema di generate-plan: coach-only, tetto di sicurezza mensile
// condiviso su ai_usage_monthly (SCHEMA_v33), mai scrive nulla sul roster —
// solo testo/analisi, il coach agisce sempre lui stesso con gli editor già
// esistenti.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei PERFORM AI, l'assistente del coach Daniel Marsini per la gestione dei suoi clienti di coaching (metodo PERFORM). Il coach ti fa domande in linguaggio naturale su chi ha bisogno di attenzione, sull'andamento di un cliente specifico, o su cosa fare per primo oggi.

Regole non negoziabili:
1. Rispondi SOLO in base ai dati del roster forniti qui sotto — mai inventare un nome, un numero o uno stato che non compare nei dati.
2. Se un'informazione richiesta non è nei dati forniti, dillo esplicitamente invece di indovinare.
3. Sii diretto e operativo: quando ha senso, ordina per urgenza e suggerisci l'azione concreta (es. "scrivi a Mario, non si allena da 9 giorni" invece di una descrizione vaga).
4. Rispondi in italiano, in modo breve e leggibile su mobile — elenco puntato quando parli di più clienti, poche frasi quando parli di uno solo.
5. Non hai modo di scrivere direttamente sul roster o sulle schede: il coach applica sempre lui stesso, a mano, quello che gli consigli.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stesso prezzario di generate-plan/ask-perform-ai (Claude Sonnet 5).
const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const SAFETY_CAP_USD = 10.0;
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_ROSTER_ENTRIES = 400;

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

  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può usare l'assistente" }), { status: 403, headers: CORS_HEADERS });
  }

  const { question, history, roster } = await req.json().catch(() => ({}));
  if (!question || typeof question !== "string") {
    return new Response(JSON.stringify({ error: "question mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return new Response(JSON.stringify({ error: `Domanda troppo lunga (massimo ${MAX_QUESTION_CHARS} caratteri) — riformulala in modo più diretto.` }), { status: 400, headers: CORS_HEADERS });
  }

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= SAFETY_CAP_USD) {
    return new Response(JSON.stringify({ error: `Raggiunto il tetto di sicurezza mensile dell'assistente AI (${SAFETY_CAP_USD}$) — si azzera il 1° del prossimo mese.` }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const rosterSlice = Array.isArray(roster) ? roster.slice(0, MAX_ROSTER_ENTRIES) : [];
    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-MAX_HISTORY_MESSAGES).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.text || "").slice(0, MAX_QUESTION_CHARS),
      })),
      {
        role: "user",
        content: `Roster clienti (JSON):\n${JSON.stringify(rosterSlice)}\n\nDomanda del coach: ${question}`,
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
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
      { onConflict: "user_id,month" },
    );

    return new Response(JSON.stringify({ text }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore chiamata Claude (coach-assistant)", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a contattare l'assistente." }), { status: 500, headers: CORS_HEADERS });
  }
});
