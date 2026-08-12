// PERFORM — Edge Function: streak-reminder
// ============================================================================
// Chiamata una volta al giorno in serata da un job pg_cron (vedi
// SCHEMA_v26_push_subscriptions.sql per la tabella, e le istruzioni fornite
// separatamente per lo scheduling). Per ogni atleta con uno streak > 0 e
// almeno un dispositivo abbonato, controlla se la giornata di OGGI è già
// "completa" secondo le STESSE 3 condizioni di isDayComplete/
// computeRealXpAndStreak in src/lib/coachingData.js (allenamento fatto SE
// previsto, un pasto registrato, sonno+passi registrati) — se manca ancora
// qualcosa, manda un promemoria push. Un solo invio al giorno per utente
// (last_reminder_date), anche se il cron gira più volte per errore.
//
// Secrets richiesti (supabase secrets set ...), MAI nel client:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:coach@...)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già forniti automaticamente
// da Supabase ad ogni Edge Function, non vanno impostati a mano.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function toLocalISODate(date = new Date()) {
  // Il cron gira a un'ora fissa UTC (vedi istruzioni): usiamo Europe/Rome
  // esplicitamente, non l'ora del server, altrimenti "oggi" potrebbe essere
  // già "domani" per un atleta italiano vicino a mezzanotte.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(date); // en-CA → YYYY-MM-DD
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = toLocalISODate();

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key, last_reminder_date");
  if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }));

  const userIds = [...new Set(subs.map((s) => s.user_id))];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, current_streak")
    .in("id", userIds);
  const streakByUser = new Map((profiles ?? []).map((p) => [p.id, p.current_streak ?? 0]));

  // Solo chi ha davvero qualcosa da perdere e non è già stato avvisato oggi.
  const candidateUserIds = userIds.filter((id) => {
    const streak = streakByUser.get(id) ?? 0;
    if (streak <= 0) return false;
    const subsForUser = subs.filter((s) => s.user_id === id);
    return subsForUser.some((s) => s.last_reminder_date !== today);
  });
  if (candidateUserIds.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "nothing-to-check" }));

  const [{ data: workoutRows }, { data: nutritionRows }, { data: metricsRows }] = await Promise.all([
    supabase.from("workout_logs").select("user_id, status").eq("date", today).in("user_id", candidateUserIds),
    supabase.from("nutrition_logs").select("user_id").eq("date", today).in("user_id", candidateUserIds),
    supabase.from("daily_metrics").select("user_id, sleep_hours, steps").eq("date", today).in("user_id", candidateUserIds),
  ]);

  const workoutStatusByUser = new Map();
  (workoutRows ?? []).forEach((r) => {
    // Se anche solo UNA riga del giorno non è 'done', consideriamo
    // l'allenamento di oggi non ancora completato.
    if (!workoutStatusByUser.has(r.user_id)) workoutStatusByUser.set(r.user_id, true);
    if (r.status !== "done") workoutStatusByUser.set(r.user_id, false);
  });
  const nutritionSet = new Set((nutritionRows ?? []).map((r) => r.user_id));
  const metricsSet = new Set((metricsRows ?? []).filter((r) => r.sleep_hours != null && r.steps != null).map((r) => r.user_id));

  const isDayComplete = (userId) => {
    const workoutStatus = workoutStatusByUser.get(userId);
    const workoutOk = workoutStatus === undefined || workoutStatus === true; // nessuna scheda oggi = riposo, ok
    return workoutOk && nutritionSet.has(userId) && metricsSet.has(userId);
  };

  let sent = 0;
  const remindedUserIds = [];

  for (const userId of candidateUserIds) {
    if (isDayComplete(userId)) continue; // già a posto, nessun promemoria da mandare

    const subsForUser = subs.filter((s) => s.user_id === userId && s.last_reminder_date !== today);
    const payload = JSON.stringify({
      title: "Non perdere lo streak! 🔥",
      body: "Ti manca ancora qualcosa oggi (allenamento, pasti o sonno/passi) per tenere vivo lo streak.",
      url: "/",
    });

    for (const sub of subsForUser) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent++;
      } catch (err) {
        // 404/410 = abbonamento scaduto/revocato lato browser: va ripulito,
        // non ritentato ad ogni giro. Altri errori: solo log, non bloccano gli altri utenti.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("PERFORM: errore invio push", userId, err);
        }
      }
    }
    remindedUserIds.push(userId);
  }

  if (remindedUserIds.length > 0) {
    await supabase.from("push_subscriptions").update({ last_reminder_date: today }).in("user_id", remindedUserIds);
  }

  return new Response(JSON.stringify({ sent, reminded: remindedUserIds.length, checked: candidateUserIds.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
