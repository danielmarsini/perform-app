// PERFORM — Edge Function: notify-coach
// ============================================================================
// Direzione inversa di notify-client: invocata dal client subito dopo aver
// inviato un messaggio in chat, manda un push al COACH così può rispondere
// tempestivamente anche da webapp (senza app nativa). Chiunque sia loggato
// può chiamarla (è normale che un cliente scriva al proprio coach) — a
// differenza di notify-client qui non c'è un check di ruolo da fare sul
// chiamante, ma proprio per questo titolo e testo del push non arrivano MAI
// dal client: il titolo lo costruisce il server dal nickname reale del
// mittente (via il JWT verificato), il body è solo l'anteprima del
// messaggio già visibile in chat — nessuna superficie in più per spoofare
// il push del coach.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";
const COACH_EMAIL = "danielmarsini@coach.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  // Il coach che scrive nella propria self-chat non deve mandarsi un push.
  if ((user.email || "").trim().toLowerCase() === COACH_EMAIL) {
    return new Response(JSON.stringify({ sent: 0, reason: "sender-is-coach" }));
  }

  const { body } = await req.json().catch(() => ({}));
  if (!body) return new Response(JSON.stringify({ error: "body è obbligatorio" }), { status: 400 });

  const { data: sender } = await admin.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
  const title = `Nuovo messaggio da ${sender?.nickname || "un cliente"}`;

  const { data: coach, error: coachError } = await admin.from("profiles").select("id").ilike("email", COACH_EMAIL).maybeSingle();
  if (coachError || !coach) return new Response(JSON.stringify({ error: "coach non trovato" }), { status: 500 });

  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", coach.id);
  if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }));

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
        console.error("PERFORM: errore invio push cliente→coach", user.id, err);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
