// PERFORM — Edge Function: supplement-reminders
// ============================================================================
// Promemoria push per gli integratori AUTOGESTITI (self_supplements,
// SCHEMA_v56 — chi non ha un protocollo assegnato dal coach). L'orario per
// riga (reminder_time) e l'interruttore (reminder_on) esistevano già in UI
// (SupplementsFreeDiary), ma "l'invio" era solo `new Notification()` lato
// client — funziona SOLO quando l'app è già aperta in quel momento esatto:
// non un vero promemoria, solo una simulazione visibile in sessione.
//
// Stesso pattern di daily-reminders (push reale via web-push/VAPID,
// push_subscriptions), ma qui l'orario è SCELTO DALL'UTENTE riga per riga —
// non due soli slot fissi — quindi il cron deve girare ogni 5-10 minuti (non
// 15 come daily-reminders) e ogni riga si dedup per conto proprio
// (self_supplements.last_reminder_date, SCHEMA_v87), non su
// push_subscriptions come i due promemoria a orario fisso.
//
// Rispetta, per ogni riga:
//   · reminder_on = true e reminder_time impostato
//   · non ancora "preso" oggi (self_supplement_intake)
//   · day_type ('on'/'off'/'all'): 'on' solo se oggi il cliente si allena
//     (almeno un workout_logs quel giorno), 'off' solo se non si allena
//   · cliente non in pausa (pause_periods)
//   · non già ricordato oggi per questa riga (dedup)
//
// Secrets richiesti (supabase secrets set ...), MAI nel client — stessi già
// usati da daily-reminders/streak-reminder, nessun secret nuovo:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
//
// Deploy: supabase functions deploy supplement-reminders --no-verify-jwt
// (chiamata solo dal cron interno, non da un utente loggato — l'autenticazione
// è il controllo manuale su CRON_SECRET qui sotto). Cron: ogni 5-10 minuti,
// stesso meccanismo già usato per daily-reminders.

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

function toMinutesOfDay(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// true se l'ora attuale di Roma è dentro i 10 minuti che precedono (inclusi)
// targetMinutes — finestra coerente con la frequenza cron consigliata (5-10
// minuti): un giro leggermente sfasato non fa mai perdere il promemoria.
function inWindow(minutesOfDay, targetMinutes) {
  return minutesOfDay <= targetMinutes && minutesOfDay > targetMinutes - 10;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { isoDate: today, minutesOfDay } = romeParts();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: items, error: itemsError } = await supabase
    .from("self_supplements")
    .select("id, user_id, name, qty, day_type, reminder_time, last_reminder_date")
    .eq("reminder_on", true)
    .not("reminder_time", "is", null);
  if (itemsError) return new Response(JSON.stringify({ error: itemsError.message }), { status: 500 });
  if (!items || items.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-reminders-set" }));

  // Filtro in JS, non in query: `last_reminder_date` è NULL per una riga mai
  // ricordata — un .neq() SQL su una colonna NULL non la includerebbe mai
  // (NULL <> valore è NULL, non true), esattamente il bug da evitare qui.
  const due = items.filter((it) => {
    if (it.last_reminder_date === today) return false;
    const target = toMinutesOfDay(it.reminder_time);
    return target != null && inWindow(minutesOfDay, target);
  });
  if (due.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "outside-windows" }));

  const userIds = [...new Set(due.map((it) => it.user_id))];

  const [{ data: subs }, { data: intakeRows }, { data: workoutRows }, { data: pauseRows }] = await Promise.all([
    supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key").in("user_id", userIds),
    supabase.from("self_supplement_intake").select("self_supplement_id").eq("date", today).in("user_id", userIds),
    supabase.from("workout_logs").select("user_id").eq("date", today).in("user_id", userIds),
    supabase.from("pause_periods").select("user_id").lte("start_date", today).gte("end_date", today).in("user_id", userIds),
  ]);

  const takenIds = new Set((intakeRows ?? []).map((r) => r.self_supplement_id));
  const trainingUserIds = new Set((workoutRows ?? []).map((r) => r.user_id));
  const pausedUserIds = new Set((pauseRows ?? []).map((r) => r.user_id));
  const subsByUser = new Map();
  (subs ?? []).forEach((s) => {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id).push(s);
  });

  let sent = 0;
  const remindedIds = [];
  for (const it of due) {
    if (pausedUserIds.has(it.user_id)) continue;
    if (takenIds.has(it.id)) continue; // già preso oggi
    if (it.day_type === "on" && !trainingUserIds.has(it.user_id)) continue;
    if (it.day_type === "off" && trainingUserIds.has(it.user_id)) continue;
    const userSubs = subsByUser.get(it.user_id) ?? [];
    if (userSubs.length === 0) { remindedIds.push(it.id); continue; } // nessun dispositivo iscritto: segna comunque per non ritentare ogni 5-10 min

    const payload = JSON.stringify({
      title: "Promemoria integratore",
      body: `${it.name}${it.qty ? ` · ${it.qty}` : ""} — è l'ora`,
      url: "/",
    });
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("PERFORM: errore invio push promemoria integratore", it.id, err);
        }
      }
    }
    remindedIds.push(it.id);
  }

  if (remindedIds.length > 0) {
    await supabase.from("self_supplements").update({ last_reminder_date: today }).in("id", remindedIds);
  }

  return new Response(JSON.stringify({ sent, reminded: remindedIds.length }), { headers: { "Content-Type": "application/json" } });
});
