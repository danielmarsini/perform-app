// PERFORM — Edge Function: estimate-food-photo
// ============================================================================
// Proxy server-side verso Claude (vision) per la stima calorica/macro di una
// foto del piatto, dal Diario Libero (05_HomeDashboard.jsx, tasto fotocamera
// accanto al codice a barre). Stesso pattern di sicurezza di ask-perform-ai:
// ANTHROPIC_API_KEY resta solo qui, il gate reale è profiles.plan lato
// server (mai fidarsi del solo blocco client), stesso tetto di spesa
// mensile CONDIVISO con ask-perform-ai (ai_usage_monthly, SCHEMA_v33) — un
// solo budget per utente per tutto ciò che è PERFORM AI, non uno separato
// per ogni funzione.
//
// La stima resta sempre dichiaratamente approssimativa: il nome del piatto
// arriva già con "(stima AI)" aggiunto lato client — mai presentata come un
// dato certo quanto una scansione barcode o un inserimento manuale.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = "Sei PERFORM AI. Ricevi la foto di un piatto e stimi calorie e macro TOTALI del piatto intero (non per 100g), basandoti solo su ciò che vedi — porzioni, ingredienti visibili, metodo di cottura plausibile. Rispondi SOLO con un oggetto JSON valido, nessun altro testo: {\"name\": \"nome breve e descrittivo del piatto in italiano\", \"kcal\": numero, \"p\": grammi proteine, \"c\": grammi carboidrati, \"f\": grammi grassi}. Se l'immagine non mostra chiaramente del cibo, rispondi con {\"error\": \"Non riesco a riconoscere un piatto in questa foto.\"}.";

// Prezzi reali Claude Sonnet 5 (platform.claude.com/docs, agosto 2026):
// $2/MTok input, $10/MTok output — le immagini si tokenizzano come input
// normale, response.usage.input_tokens riflette già il costo reale.
const COST_PER_INPUT_TOKEN = 2 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 10 / 1_000_000;
const MONTHLY_CAP_USD = 1.0; // stesso tetto, stesso budget di ask-perform-ai
const MAX_IMAGE_BASE64_CHARS = 6_000_000; // ~4.5MB decodificati, ampio margine su una foto da fotocamera

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
    return new Response(JSON.stringify({ error: "Serve il Performance Pack (o un piano superiore) per la stima foto piatto." }), { status: 403, headers: CORS_HEADERS });
  }

  const { imageBase64, mediaType } = await req.json().catch(() => ({}));
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return new Response(JSON.stringify({ error: "immagine mancante" }), { status: 400, headers: CORS_HEADERS });
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return new Response(JSON.stringify({ error: "Foto troppo grande — riprova con una foto più piccola." }), { status: 400, headers: CORS_HEADERS });
  }
  const allowedMediaTypes = ["image/jpeg", "image/png", "image/webp"];
  const safeMediaType = allowedMediaTypes.includes(mediaType) ? mediaType : "image/jpeg";

  const month = currentMonthKey();
  const { data: usageRow } = await admin.from("ai_usage_monthly").select("cost_usd, requests").eq("user_id", user.id).eq("month", month).maybeSingle();
  const spentSoFar = Number(usageRow?.cost_usd ?? 0);
  if (spentSoFar >= MONTHLY_CAP_USD) {
    return new Response(JSON.stringify({ error: "Hai raggiunto il tetto di utilizzo di PERFORM AI questo mese — si azzera il 1° del prossimo mese." }), { status: 429, headers: CORS_HEADERS });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: safeMediaType, data: imageBase64 } },
          { type: "text", text: "Stima calorie e macro totali di questo piatto." },
        ],
      }],
    });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const cost = response.usage.input_tokens * COST_PER_INPUT_TOKEN + response.usage.output_tokens * COST_PER_OUTPUT_TOKEN;
    await admin.from("ai_usage_monthly").upsert(
      { user_id: user.id, month, cost_usd: spentSoFar + cost, requests: Number(usageRow?.requests ?? 0) + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,month" }
    );

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("risposta senza JSON");
    const parsed = JSON.parse(match[0]);
    if (parsed.error) return new Response(JSON.stringify({ error: parsed.error }), { status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    if (!parsed.name || typeof parsed.kcal !== "number") throw new Error("risposta incompleta");

    return new Response(JSON.stringify(parsed), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore stima foto piatto (estimate-food-photo)", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a stimare il piatto dalla foto." }), { status: 500, headers: CORS_HEADERS });
  }
});
