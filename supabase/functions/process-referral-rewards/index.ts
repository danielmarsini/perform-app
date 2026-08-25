// PERFORM — Edge Function: process-referral-rewards
// ============================================================================
// Chiamata una volta al giorno da un job pg_cron — stesso pattern
// x-cron-secret di streak-reminder/expire-whitelists. Tre passaggi:
//
// 1. Verifica email: per ogni referral_signups non ancora marcata verificata,
//    controlla auth.users.email_confirmed_at (via Admin API, l'unico modo
//    per leggere lo stato di un altro utente) e la segna verificata se
//    confermata nel frattempo.
// 2. Verifica attività reale (SCHEMA_v69): un'email verificata da sola non
//    basta più — Gmail permette varianti "+1"/"+2" della stessa casella,
//    verificabili in autonomia dalla stessa persona. Un account MAI aperto
//    dopo la registrazione (nessun set di allenamento, nessun pasto,
//    nessuna misura giornaliera) non conta verso il premio: chi lo crea
//    solo per il bonus, senza mai usarlo davvero, non ottiene nulla.
// 3. Premio: per ogni referrer, conta gli IP DISTINTI fra i referral
//    verificati CON attività reale — non il numero di righe, altrimenti la
//    stessa persona con 3 email e lo stesso IP otterrebbe comunque il
//    premio, esattamente ciò che la richiesta esplicita di controllo IP
//    voleva impedire. Ogni gruppo di 3 IP distinti vale un mese Premium,
//    fino a un tetto massimo di MAX_REWARDS mesi per referrer (richiesta
//    esplicita del coach: anche portando più di 9 amici, il premio non
//    cresce oltre quel tetto). referral_rewards_granted su profiles
//    impedisce di riapplicare un premio già dato.
//
// Mai tocca un cliente già su un piano di coaching reale (scheda
// personalizzata/coaching allenamento/full coaching): il premio è
// specificamente "un mese Premium", non deve mai declassare né sovrascrivere
// un abbonamento di valore superiore già attivo — stessa cautela di
// expire-whitelists, che allo stesso modo non tocca mai un pagante reale.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const REFERRALS_PER_REWARD = 3;
const MAX_REWARDS = 3; // tetto: 9 amici (3x3) danno il massimo, oltre non cresce più
const COACHING_PLANS = new Set(["scheda_personalizzata", "training", "full"]);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- 1. Verifica email per i referral non ancora confermati -------------
  const { data: pending, error: pendingError } = await admin
    .from("referral_signups")
    .select("id, referred_user_id")
    .eq("email_verified", false);
  if (pendingError) return new Response(JSON.stringify({ error: pendingError.message }), { status: 500 });

  let newlyVerified = 0;
  for (const row of pending || []) {
    const { data, error } = await admin.auth.admin.getUserById(row.referred_user_id);
    if (error || !data?.user?.email_confirmed_at) continue;
    const { error: updErr } = await admin.from("referral_signups")
      .update({ email_verified: true, verified_at: data.user.email_confirmed_at })
      .eq("id", row.id);
    if (!updErr) newlyVerified++;
  }

  // --- 2. Verifica attività reale per i referral verificati ma non ancora
  //        marcati attivi — un solo controllo per tipo di attività basta,
  //        anche una riga sola dimostra che l'account è stato davvero usato.
  const { data: unverifiedActivity, error: activityFetchError } = await admin
    .from("referral_signups")
    .select("id, referred_user_id")
    .eq("email_verified", true)
    .eq("has_activity", false);
  if (activityFetchError) return new Response(JSON.stringify({ error: activityFetchError.message }), { status: 500 });

  let newlyActive = 0;
  for (const row of unverifiedActivity || []) {
    const [sets, meals, metrics] = await Promise.all([
      admin.from("workout_sets").select("id", { count: "exact", head: true }).eq("user_id", row.referred_user_id),
      admin.from("nutrition_logs").select("id", { count: "exact", head: true }).eq("user_id", row.referred_user_id),
      admin.from("daily_metrics").select("id", { count: "exact", head: true }).eq("user_id", row.referred_user_id),
    ]);
    const hasActivity = (sets.count ?? 0) > 0 || (meals.count ?? 0) > 0 || (metrics.count ?? 0) > 0;
    if (!hasActivity) continue;
    const { error: updErr } = await admin.from("referral_signups").update({ has_activity: true }).eq("id", row.id);
    if (!updErr) newlyActive++;
  }

  // --- 3. Calcola e applica i premi maturati -------------------------------
  const { data: verifiedRows, error: verifiedError } = await admin
    .from("referral_signups")
    .select("referrer_id, ip_address")
    .eq("email_verified", true)
    .eq("has_activity", true)
    .not("ip_address", "is", null);
  if (verifiedError) return new Response(JSON.stringify({ error: verifiedError.message }), { status: 500 });

  const ipsByReferrer = new Map(); // referrer_id -> Set<ip>
  for (const row of verifiedRows || []) {
    if (!ipsByReferrer.has(row.referrer_id)) ipsByReferrer.set(row.referrer_id, new Set());
    ipsByReferrer.get(row.referrer_id).add(row.ip_address);
  }

  let rewarded = 0;
  for (const [referrerId, ipSet] of ipsByReferrer.entries()) {
    const eligibleRewards = Math.min(Math.floor(ipSet.size / REFERRALS_PER_REWARD), MAX_REWARDS);
    if (eligibleRewards <= 0) continue;

    const { data: referrer, error: refErr } = await admin.from("profiles")
      .select("plan, whitelisted_until, referral_rewards_granted")
      .eq("id", referrerId).maybeSingle();
    if (refErr || !referrer) continue;

    const owedMonths = eligibleRewards - (referrer.referral_rewards_granted || 0);
    if (owedMonths <= 0) continue;

    // Un cliente già su un piano di coaching reale ha già più valore di
    // Premium: il premio resta "guadagnato" (contatore aggiornato, non si
    // ripresenta ad ogni corsa) ma non tocchiamo il suo piano attivo.
    if (!COACHING_PLANS.has(referrer.plan)) {
      const base = referrer.whitelisted_until && new Date(referrer.whitelisted_until) > new Date()
        ? new Date(referrer.whitelisted_until)
        : new Date();
      base.setMonth(base.getMonth() + owedMonths);
      const update = { whitelisted_until: base.toISOString(), referral_rewards_granted: eligibleRewards };
      if (referrer.plan !== "performance_pack") update.plan = "performance_pack";
      const { error: grantErr } = await admin.from("profiles").update(update).eq("id", referrerId);
      if (!grantErr) rewarded++;
    } else {
      await admin.from("profiles").update({ referral_rewards_granted: eligibleRewards }).eq("id", referrerId);
    }
  }

  return new Response(JSON.stringify({ newlyVerified, newlyActive, rewarded }), { headers: { "Content-Type": "application/json" } });
});
