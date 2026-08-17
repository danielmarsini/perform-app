// PERFORM — Edge Function: notify-client
// ============================================================================
// Invocata dal pannello coach subito dopo un salvataggio reale (scheda
// allenamento, dieta, integratori): manda un push immediato al cliente
// interessato, del tipo "il tuo coach ti ha modificato il piano, controlla".
// A differenza di streak-reminder (chiamata solo dal cron interno di
// Postgres), questa la chiama un utente loggato — usa quindi la normale
// verifica JWT di Supabase (deploy SENZA --no-verify-jwt) invece del secret
// condiviso, e verifica che il chiamante sia davvero un coach prima di
// inviare qualunque cosa.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Un solo client, con la service role: verifica IL TOKEN del chiamante
  // esplicitamente (auth.getUser(token)) invece di affidarsi al formato
  // della chiave anon (evita sorprese col nuovo formato di chiavi
  // pubblicabili/segrete di Supabase), poi la stessa service role legge/
  // scrive bypassando RLS per gli abbonamenti push del cliente.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  // NOTA: profiles.role non distingue mai il coach — handle_new_user()
  // (SCHEMA_v14) scrive sempre 'user' per ogni account, coach incluso: il
  // controllo sotto tornava SEMPRE 403, anche per il vero coach — bug preso
  // durante il primo test reale dell'editor AI (stesso schema di
  // autorizzazione copiato qui). L'unico riconoscimento reale nell'app è
  // l'email, la stessa costante COACH_EMAIL di 04_AppShell.jsx/App.jsx.
  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può inviare notifiche" }), { status: 403 });
  }

  const { userId, title, body, url } = await req.json().catch(() => ({}));
  if (!userId || !title || !body) {
    return new Response(JSON.stringify({ error: "userId, title e body sono obbligatori" }), { status: 400 });
  }

  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);
  if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }));

  const payload = JSON.stringify({ title, body, url: url || "/" });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("PERFORM: errore invio push coach→cliente", userId, err);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
