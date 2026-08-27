// PERFORM — Edge Function: notify-team
// ============================================================================
// Invocata dal coach subito dopo aver pubblicato un post nel canale Avvisi
// Team (coach_news_tips, channel='team'): manda un push a TUTTI gli utenti
// con almeno un dispositivo abbonato (broadcast, non a un singolo cliente
// come notify-client) — comunicazioni ufficiali o traguardi non arrivavano
// prima a nessuno finché non si riapriva l'app e si guardava News & Tips.
// Stessa verifica JWT + solo-coach di notify-client (deploy SENZA
// --no-verify-jwt), stessi secrets VAPID già configurati.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";
const COACH_EMAIL = "danielmarsini@coach.com";

let vapidError: string | null = null;
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  vapidError = err?.message || String(err);
  console.error("PERFORM: chiave VAPID non valida in notify-team", vapidError);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });
  if (vapidError) return new Response(JSON.stringify({ error: `chiave VAPID non valida: ${vapidError}` }), { status: 500, headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });
    if ((user.email || "").trim().toLowerCase() !== COACH_EMAIL) {
      return new Response(JSON.stringify({ error: "forbidden — solo il coach può inviare notifiche" }), { status: 403, headers: CORS_HEADERS });
    }

    const { title, body } = await req.json().catch(() => ({}));
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title e body sono obbligatori" }), { status: 400, headers: CORS_HEADERS });
    }

    // Tutti gli abbonati tranne il coach stesso: non ha senso notificare a se
    // stesso il proprio avviso appena pubblicato.
    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .neq("user_id", user.id);
    if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500, headers: CORS_HEADERS });
    if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }), { headers: CORS_HEADERS });

    const payload = JSON.stringify({ title, body, url: "/" });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("PERFORM: errore invio push avviso team", sub.user_id, err);
        }
      }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore imprevisto in notify-team", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
