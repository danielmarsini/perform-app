// PERFORM — Edge Function: translate-content
// ============================================================================
// Traduce un post di News & Tips (o Avvisi Team, stessa tabella
// coach_news_tips) nella lingua scelta dal cliente in Impostazioni →
// Aspetto (profiles.lang, SCHEMA_v82) — chiamata automaticamente dal feed
// quando lang !== 'it' e il post non ha ancora una traduzione in cache per
// quella lingua. Il risultato viene salvato in coach_news_tips.translations
// (jsonb per lingua): un post si traduce UNA SOLA VOLTA per lingua, non ad
// ogni apertura/da ogni cliente. Stesso ANTHROPIC_API_KEY e stesso modello
// economico di refresh-news-feed (claude-haiku-4-5) — qui il compito è
// ancora più semplice: solo traduzione, mai riformulazione.
//
// Aperta a qualunque utente autenticato (non solo al coach): un cliente
// che legge in inglese/spagnolo/francese deve poterla invocare per i propri
// contenuti, il costo è comunque limitato (poche centinaia di token per
// post, cache dopo la prima traduzione).

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const LANG_NAMES: Record<string, string> = { en: "inglese", es: "spagnolo", fr: "francese" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function translateFields(fields: Record<string, unknown>, targetLang: string) {
  const langName = LANG_NAMES[targetLang];
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1400,
    messages: [{
      role: "user",
      content: `Traduci in ${langName} naturale e professionale, per un pubblico di sportivi/appassionati di fitness. Traduzione fedele: non aggiungere, riassumere o interpretare, solo tradurre. Mantieni invariati eventuali numeri, nomi propri e unità di misura. Se un campo è null o vuoto nell'originale, restituiscilo com'è (null o array vuoto), non inventare contenuto.

Rispondi SOLO con un oggetto JSON valido, nessun altro testo, con esattamente questi campi (stessa struttura dell'originale):
{"eyebrow": "...", "title": "...", "body": "...", "body_extended": ["...", "..."]}

Testo originale (italiano) da tradurre in ${langName}:
${JSON.stringify(fields)}`,
    }],
  });
  const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("risposta di traduzione senza JSON");
  const parsed = JSON.parse(match[0]);
  if (!parsed.title) throw new Error("traduzione incompleta");
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

    const { itemId, targetLang } = await req.json().catch(() => ({}));
    if (!itemId || !LANG_NAMES[targetLang]) {
      return new Response(JSON.stringify({ error: "itemId e targetLang (en/es/fr) sono obbligatori" }), { status: 400, headers: CORS_HEADERS });
    }

    const { data: item, error: itemError } = await admin
      .from("coach_news_tips")
      .select("eyebrow, title, body, body_extended, translations")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) return new Response(JSON.stringify({ error: itemError.message }), { status: 500, headers: CORS_HEADERS });
    if (!item) return new Response(JSON.stringify({ error: "post non trovato" }), { status: 404, headers: CORS_HEADERS });

    const cached = (item.translations || {})[targetLang];
    if (cached) {
      return new Response(JSON.stringify(cached), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    const translated = await translateFields(
      { eyebrow: item.eyebrow, title: item.title, body: item.body, body_extended: item.body_extended },
      targetLang,
    );

    const nextTranslations = { ...(item.translations || {}), [targetLang]: translated };
    const { error: updateError } = await admin
      .from("coach_news_tips")
      .update({ translations: nextTranslations })
      .eq("id", itemId);
    if (updateError) console.error("PERFORM: errore salvataggio cache traduzione", itemId, targetLang, updateError);

    return new Response(JSON.stringify(translated), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore imprevisto in translate-content", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
