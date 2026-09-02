// PERFORM — Edge Function: rest-timer-push
// ============================================================================
// Push reale per lo Smart Rest Timer (05_HomeDashboard.jsx/ExerciseCard).
// Mentre l'app resta aperta il countdown avvisa già da solo — beep negli
// ultimi 10 secondi, vibrazione, e una Notification() locale a fine
// recupero se la tab è nascosta ma ancora viva (vedi REST_TIMER_KEY nello
// stesso file). Ma se l'atleta chiude del tutto l'app, blocca il telefono,
// o passa a un'altra app abbastanza a lungo da far sospendere la pagina
// dal browser mobile, nessuno di quei meccanismi parte più: serve un push
// reale, mandato dal server.
//
// rest_timer_notifications (SCHEMA_v90) ha AL MASSIMO una riga per utente
// (stesso principio del "un solo timer di recupero attivo per volta" lato
// client): fire_at è il momento assoluto in cui il recupero finisce.
// Questa funzione manda il push a chi ha fire_at nel passato e cancella la
// riga subito dopo — inviata o no, mai un doppio invio per lo stesso timer.
//
// PRECISIONE: un timer di recupero dura tipicamente 60-180 secondi, molto
// più corto delle finestre di 10-15 minuti già accettate per i promemoria
// giornalieri (daily-reminders, supplement-reminders). Per restare utile il
// cron deve girare OGNI MINUTO, il minimo pratico per uno scheduler
// esterno: il push arriva quindi entro circa 60 secondi dalla fine reale
// del recupero quando l'app è chiusa, non nell'istante esatto — limite
// dichiarato, non un bug: nessun timer lato server può fare meglio senza un
// servizio dedicato sempre acceso in ascolto.
//
// Secrets richiesti (supabase secrets set ...), MAI nel client — stessi già
// usati da daily-reminders/streak-reminder/supplement-reminders, nessun
// secret nuovo:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//
// Deploy: supabase functions deploy rest-timer-push --no-verify-jwt
// (chiamata solo dal cron interno, non da un utente loggato — l'autenticazione
// è il controllo manuale su CRON_SECRET qui sotto). Cron: OGNI MINUTO.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: due, error: dueError } = await supabase
    .from("rest_timer_notifications")
    .select("user_id, exercise_name")
    .lte("fire_at", new Date().toISOString());
  if (dueError) {
    console.error("PERFORM: errore lettura rest_timer_notifications", dueError);
    return new Response(JSON.stringify({ error: "read-failed" }), { status: 500 });
  }
  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  const userIds = due.map((r) => r.user_id);
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", userIds);
  if (subsError) console.error("PERFORM: errore lettura push_subscriptions per rest-timer-push", subsError);

  let sent = 0;
  for (const row of due) {
    const payload = JSON.stringify({
      title: "Recupero finito",
      body: row.exercise_name ? `${row.exercise_name}: è ora della prossima serie.` : "È ora della prossima serie.",
      url: "/",
    });
    for (const sub of (subs || []).filter((s) => s.user_id === row.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("PERFORM: errore invio push rest-timer", row.user_id, err);
        }
      }
    }
  }

  // Cancellate SEMPRE, inviate o no: evita un doppio invio se il push
  // fallisce per un motivo transitorio — stesso compromesso già accettato
  // altrove per un promemoria "morbido" come questo (mai un retry storm).
  await supabase.from("rest_timer_notifications").delete().in("user_id", userIds);

  return new Response(JSON.stringify({ sent, processed: due.length }), { headers: { "Content-Type": "application/json" } });
});
