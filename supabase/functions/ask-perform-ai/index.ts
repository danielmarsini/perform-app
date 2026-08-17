// PERFORM — Edge Function: ask-perform-ai
// ============================================================================
// Proxy server-side verso Claude per la chat "💬 Fai una domanda a PERFORM AI"
// in News & Tips (06_NewsTipsView.jsx). Il client NON deve mai vedere
// ANTHROPIC_API_KEY né poter scegliere il system prompt — entrambi vivono
// solo qui. Il blocco "Performance Pack o superiore" lato client è UX; il
// controllo che conta davvero è quello sotto su profiles.plan, altrimenti un
// utente Free smaliziato potrebbe chiamare questa funzione bypassando
// l'interfaccia (nota già presente in 06_NewsTipsView.jsx).

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = "Sei PERFORM AI, l'assistente scientifico dell'app PERFORM. Rispondi sempre in italiano, in modo preciso, sobrio e mai sensazionalistico, in massimo 120 parole, basandoti sul contesto dell'articolo fornito. Se la domanda riguarda una situazione medica o di salute personale, ricorda che non sostituisci un medico o il coach e invita a rivolgersi a loro per decisioni individuali.";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  try {
    const messages = [
      ...(Array.isArray(history) ? history : []).slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.text || ""),
      })),
      { role: "user", content: `Contesto dell'articolo:\n${context || ""}\n\nDomanda dell'atleta: ${question}` },
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

    return new Response(JSON.stringify({ text }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore chiamata Claude (ask-perform-ai)", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a contattare PERFORM AI." }), { status: 500, headers: CORS_HEADERS });
  }
});
