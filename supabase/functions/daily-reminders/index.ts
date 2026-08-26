// PERFORM — Edge Function: daily-reminders
// ============================================================================
// Due promemoria distinti, entrambi gestiti qui perché entrambi finestre
// orarie brevi controllate su un cron ad alta frequenza (vedi istruzioni di
// deploy): non serve una Edge Function separata per ciascuno.
//
//   · PASSI, 23:45 (ora di Roma): a chi non ha ancora registrato i passi di
//     oggi in daily_metrics, ricorda di segnarli prima di andare a dormire.
//   · SONNO, 12:00 (ora di Roma): a chi non ha ancora registrato il sonno
//     della notte appena passata, ricorda di segnarlo prima di pranzo.
//
// Il cron va schedulato ogni 10-15 minuti (vedi istruzioni), non alle due
// ore esatte: la funzione stessa controlla l'ora di Roma e agisce solo
// dentro la finestra di 15 minuti che precede l'orario target, così un
// giro di cron leggermente sfasato o un cambio ora legale/solare non fanno
// mai perdere il promemoria. Un solo invio al giorno per utente/tipo
// (last_steps_reminder_date / last_sleep_reminder_date), anche se il cron
// gira più volte dentro la stessa finestra.
//
// Secrets richiesti (supabase secrets set ...), MAI nel client — stessi già
// usati da streak-reminder, nessun secret nuovo da creare:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//
// Deployata con --no-verify-jwt (chiamata solo dal cron interno di
// Postgres, non da un utente loggato): l'autenticazione è il controllo
// manuale su CRON_SECRET qui sotto.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function romeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { isoDate: `${parts.year}-${parts.month}-${parts.day}`, minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}

// true se l'ora attuale di Roma è dentro i 15 minuti che precedono
// (inclusi) targetMinutes — es. target 23:45 → finestra valida 23:30-23:45.
function inWindow(minutesOfDay, targetMinutes) {
  return minutesOfDay <= targetMinutes && minutesOfDay > targetMinutes - 15;
}

async function sendToUser(supabase, subsForUser, payload, dedupColumn, today) {
  let sent = 0;
  for (const sub of subsForUser) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("PERFORM: errore invio push promemoria", dedupColumn, sub.user_id, err);
      }
    }
  }
  if (sent > 0) {
    await supabase.from("push_subscriptions").update({ [dedupColumn]: today }).eq("user_id", subsForUser[0].user_id);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { isoDate: today, minutesOfDay } = romeParts();
  const doSteps = inWindow(minutesOfDay, 23 * 60 + 45);   // 23:45
  const doSleep = inWindow(minutesOfDay, 12 * 60);        // 12:00
  if (!doSteps && !doSleep) return new Response(JSON.stringify({ sent: 0, reason: "outside-windows" }));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key, last_steps_reminder_date, last_sleep_reminder_date");
  if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }));

  const userIds = [...new Set(subs.map((s) => s.user_id))];

  const [{ data: metricsRows }, { data: pauseRows }] = await Promise.all([
    supabase.from("daily_metrics").select("user_id, sleep_hours, steps").eq("date", today).in("user_id", userIds),
    supabase.from("pause_periods").select("user_id").lte("start_date", today).gte("end_date", today).in("user_id", userIds),
  ]);
  const pausedUserIds = new Set((pauseRows ?? []).map((r) => r.user_id));
  const stepsByUser = new Map((metricsRows ?? []).map((r) => [r.user_id, r.steps]));
  const sleepByUser = new Map((metricsRows ?? []).map((r) => [r.user_id, r.sleep_hours]));

  let sentSteps = 0, sentSleep = 0;

  if (doSteps) {
    const payload = JSON.stringify({ title: "Registra i tuoi passi", body: "Non hai ancora segnato i passi di oggi — un attimo prima di andare a dormire.", url: "/" });
    for (const userId of userIds) {
      if (pausedUserIds.has(userId)) continue;
      if (stepsByUser.get(userId) != null) continue; // già registrati
      const subsForUser = subs.filter((s) => s.user_id === userId && s.last_steps_reminder_date !== today);
      if (subsForUser.length === 0) continue;
      await sendToUser(supabase, subsForUser, payload, "last_steps_reminder_date", today);
      sentSteps += subsForUser.length;
    }
  }

  if (doSleep) {
    const payload = JSON.stringify({ title: "Registra il sonno di stanotte", body: "Prima di pranzo, ricordati di segnare quante ore hai dormito.", url: "/" });
    for (const userId of userIds) {
      if (pausedUserIds.has(userId)) continue;
      if (sleepByUser.get(userId) != null) continue; // già registrato
      const subsForUser = subs.filter((s) => s.user_id === userId && s.last_sleep_reminder_date !== today);
      if (subsForUser.length === 0) continue;
      await sendToUser(supabase, subsForUser, payload, "last_sleep_reminder_date", today);
      sentSleep += subsForUser.length;
    }
  }

  return new Response(JSON.stringify({ sentSteps, sentSleep }), { headers: { "Content-Type": "application/json" } });
});
