// PERFORM — Edge Function: whoop-disconnect
// ============================================================================
// Rimuove il token Whoop salvato e riporta il profilo a "non collegato".
// Nessuna chiamata di revoca verso Whoop (endpoint non documentato con
// certezza): il token locale sparisce comunque, e un token OAuth Whoop
// inutilizzato scade da solo secondo il proprio expires_in — sufficiente,
// mai un rischio di sicurezza lasciato aperto lato nostro (whoop_tokens ha
// RLS senza policy per authenticated, irraggiungibile dal client).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  try {
    await admin.from("whoop_tokens").delete().eq("user_id", user.id);
    const { error: profileError } = await admin.from("profiles").update({ whoop_connected: false }).eq("id", user.id);
    if (profileError) throw profileError;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore scollegamento Whoop", err);
    return new Response(JSON.stringify({ error: err?.message || "Non sono riuscito a scollegare Whoop." }), { status: 500, headers: CORS_HEADERS });
  }
});
