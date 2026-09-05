// PERFORM — Edge Function: whoop-oauth-callback
// ============================================================================
// Chiamata dal client subito dopo che Whoop ha rimandato l'utente sulla nostra
// app con ?code=... (vedi src/lib/whoop.js + il redirect impostato nel
// Whoop Developer Dashboard). Lo scambio code -> token DEVE avvenire qui
// (server-side): richiede WHOOP_CLIENT_SECRET, che non deve mai raggiungere
// il browser — stesso principio di STRIPE_SECRET_KEY in create-checkout-
// session. I token stessi finiscono in whoop_tokens, tabella con RLS senza
// policy per authenticated (SCHEMA_v93): solo questa funzione e whoop-sync,
// tramite service role, possono leggerli o scriverli.
//
// FONTI (verificate via ricerca web, nessun endpoint indovinato):
// - Authorize URL: https://api.prod.whoop.com/oauth/oauth2/auth
// - Token URL:     https://api.prod.whoop.com/oauth/oauth2/token
// (developer.whoop.com/docs/developing/oauth/)

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHOOP_CLIENT_ID = Deno.env.get("WHOOP_CLIENT_ID")!;
const WHOOP_CLIENT_SECRET = Deno.env.get("WHOOP_CLIENT_SECRET")!;
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_PROFILE_URL = "https://api.prod.whoop.com/developer/v2/user/profile/basic";

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

  const { code, redirectUri } = await req.json().catch(() => ({}));
  if (!code || !redirectUri) {
    return new Response(JSON.stringify({ error: "code e redirectUri sono richiesti" }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const tokenRes = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      console.error("PERFORM: scambio token Whoop fallito", tokenRes.status, errBody);
      return new Response(JSON.stringify({ error: "Whoop ha rifiutato il collegamento. Riprova." }), { status: 502, headers: CORS_HEADERS });
    }
    const tokenData = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

    // whoop_user_id: solo arricchimento facoltativo (diagnostica/supporto),
    // mai bloccante — se questa chiamata fallisce il collegamento resta
    // comunque valido, semplicemente senza quel campo.
    let whoopUserId = null;
    try {
      const profileRes = await fetch(WHOOP_PROFILE_URL, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        whoopUserId = profile?.user_id != null ? String(profile.user_id) : null;
      }
    } catch (err) {
      console.error("PERFORM: lettura profilo Whoop fallita (non bloccante)", err);
    }

    const { error: upsertError } = await admin.from("whoop_tokens").upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      whoop_user_id: whoopUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    const { error: profileError } = await admin.from("profiles").update({ whoop_connected: true }).eq("id", user.id);
    if (profileError) throw profileError;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore collegamento Whoop", err);
    return new Response(JSON.stringify({ error: err?.message || "Non sono riuscito a completare il collegamento con Whoop." }), { status: 500, headers: CORS_HEADERS });
  }
});
