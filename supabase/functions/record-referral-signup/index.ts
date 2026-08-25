// PERFORM — Edge Function: record-referral-signup
// ============================================================================
// Chiamata dal client (OnboardingFlow, applyReferralCode) appena un nuovo
// utente digita il codice invito di qualcun altro. Sostituisce il vecchio
// setReferredBy diretto lato client: qui, e SOLO qui, catturiamo anche
// l'indirizzo IP di chi si iscrive (un client non può leggere il proprio IP
// pubblico in modo affidabile, e comunque non ci fideremmo di un valore che
// il client stesso dichiara) e scriviamo una riga in referral_signups
// (SCHEMA_v67) — la base su cui process-referral-rewards conterà gli IP
// distinti per decidere se il premio è scattato.
//
// Il codice viene ri-risolto qui server-side (mai fidarsi di un referrerId
// che arrivasse dal client): stessa funzione resolve_referral_code già usata
// lato client, ma con la connessione service role.

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

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const code = String(body?.referralCode || "").trim();
  if (!code) return new Response(JSON.stringify({ error: "codice mancante" }), { status: 400, headers: CORS_HEADERS });

  const { data: referrerId, error: resolveError } = await admin.rpc("resolve_referral_code", { code });
  if (resolveError) return new Response(JSON.stringify({ error: resolveError.message }), { status: 500, headers: CORS_HEADERS });
  if (!referrerId || referrerId === user.id) {
    return new Response(JSON.stringify({ ok: false, reason: "invalid" }), { headers: CORS_HEADERS });
  }

  // Come Vercel/Supabase Edge Runtime passano l'IP del client: x-forwarded-for
  // può contenere una catena "client, proxy1, proxy2" — il primo valore è
  // sempre quello del client originale. cf-connecting-ip come fallback se un
  // giorno il progetto finisse dietro Cloudflare.
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || req.headers.get("cf-connecting-ip") || null;

  const { error: profileError } = await admin.from("profiles").update({ referred_by: referrerId }).eq("id", user.id);
  if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: CORS_HEADERS });

  const { error: insertError } = await admin.from("referral_signups").upsert(
    { referrer_id: referrerId, referred_user_id: user.id, ip_address: ip },
    { onConflict: "referred_user_id" }
  );
  if (insertError) return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: CORS_HEADERS });

  return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
});
