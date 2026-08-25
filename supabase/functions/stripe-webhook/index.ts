// PERFORM — Edge Function: stripe-webhook
// ============================================================================
// Riceve gli eventi da Stripe (checkout.session.completed, subscription
// cancellata) e aggiorna profiles di conseguenza — è l'UNICA fonte di verità
// su "questo cliente ha davvero pagato": il client non scrive mai da solo
// profiles.plan/client_status per un piano a pagamento, aspetta questo
// webhook dopo il redirect di Stripe (vedi App.jsx, poll su ?checkout=success).
// Deploy con --no-verify-jwt: Stripe non ha un JWT Supabase, l'autenticità
// della chiamata la garantisce SOLO la firma HMAC (Stripe-Signature) contro
// STRIPE_WEBHOOK_SECRET, verificata sotto con constructEventAsync — mai
// fidarsi del body prima di quella verifica.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
// Verifica firma via SubtleCrypto invece del modulo node:crypto — è il modo
// documentato da Stripe per farla funzionare nei runtime edge (Deno incluso).
const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Stesso listino di create-checkout-session, letto qui in senso inverso
// (price -> piano interno): è la Edge Function, non il client, a decidere
// quale piano sbloccare — session.metadata.price_id è solo un puntatore a
// QUESTA mappa, il client non può mai far scrivere un piano diverso da
// quello che ha davvero pagato.
const PRICE_TO_PLAN: Record<string, string> = {
  "price_1U53tlFifatHRNX6fVb5k9HC": "full",
  "price_1U53vHFifatHRNX6O2Y6fT5n": "training",
  "price_1U53w5FifatHRNX6KFotJfnc": "scheda_personalizzata",
  "price_1U53wlFifatHRNX6tkJAV4ni": "performance_pack",
};
const COACHING_PLANS = new Set(["scheda_personalizzata", "training", "full"]);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  if (!signature) return new Response("missing signature", { status: 400 });

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error("PERFORM: firma webhook Stripe non valida", err);
    return new Response("invalid signature", { status: 400 });
  }

  // Idempotenza: se questo event.id è già stato processato (Stripe ha
  // ritentato la spedizione), l'insert fallisce con una violazione di
  // chiave primaria (23505) e ci fermiamo qui, senza aggiornare due volte
  // lo stesso profilo. QUALSIASI ALTRO errore (tabella mancante, problema di
  // rete verso Postgres...) NON è un duplicato: va loggato forte e la
  // richiesta deve proseguire comunque, altrimenti un problema come quello
  // scambierebbe silenziosamente ogni pagamento reale per un doppione senza
  // mai sbloccare il piano — bug preso durante il primo test end-to-end.
  const { error: dupError } = await admin.from("stripe_webhook_events").insert({ id: event.id });
  if (dupError) {
    if (dupError.code === "23505") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });
    }
    console.error("PERFORM: errore inatteso nel controllo idempotenza (NON trattato come duplicato)", dupError);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const priceId = session.metadata?.price_id;
      const planDb = priceId ? PRICE_TO_PLAN[priceId] : null;
      if (userId && planDb) {
        // Scheda Personalizzata (SCHEMA_v68): add-on SOPRA il piano base, mai
        // una sostituzione — profiles.plan resta quello che era (Free o
        // Premium), niente whitelisted_until azzerato (non è un pagamento
        // che riguarda quel piano). Chat 2 settimane, programma 8 settimane:
        // date esatte da oggi, indipendenti da qualunque altra colonna.
        if (planDb === "scheda_personalizzata") {
          const now = new Date();
          const chatUntil = new Date(now); chatUntil.setDate(chatUntil.getDate() + 14);
          const programUntil = new Date(now); programUntil.setDate(programUntil.getDate() + 56);
          const update: Record<string, unknown> = {
            stripe_customer_id: session.customer,
            client_status: "active",
            scheda_addon_chat_until: chatUntil.toISOString(),
            scheda_addon_program_until: programUntil.toISOString(),
          };
          const { data: existingAnam } = await admin
            .from("anamnesis_responses")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (!existingAnam) update.onboarding_completed = false;
          const { error } = await admin.from("profiles").update(update).eq("id", userId);
          if (error) console.error("PERFORM: errore attivazione add-on Scheda Personalizzata", error);
          return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
        }
        // whitelisted_until azzerato: un pagamento reale rende il cliente
        // indipendente dal timer della whitelist (SCHEMA_v37) — non va mai
        // declassato da expire-whitelists solo perché il coach lo aveva
        // whitelistato prima che iniziasse a pagare per davvero.
        const update: Record<string, unknown> = { plan: planDb, stripe_customer_id: session.customer, whitelisted_until: null };
        if (COACHING_PLANS.has(planDb)) {
          update.client_status = "active";
          // Bug preso in produzione: un utente che aveva GIÀ completato
          // l'onboarding (es. era Free, o passa da un piano coaching a un
          // altro) e poi paga un piano a coaching da Impostazioni > Cambia
          // piano non tornava mai a vedere l'anamnesi — il gate in App.jsx
          // scatta solo su onboarding_completed=false, e quel flag resta
          // true per sempre una volta impostato la prima volta. Qui, solo se
          // non esiste ancora un'anamnesi salvata per questo utente,
          // riportiamo onboarding_completed a false: al redirect da Stripe
          // (?checkout=success) l'utente rientra dritto nel gate, che con
          // initialPlan già aggiornato salta subito alla schermata anamnesi
          // (vedi resumedPlanId in OnboardingFlow) invece che alla Home.
          // Chi ha già un'anamnesi (sta solo cambiando piano tra due coaching)
          // non viene mai ri-interrotto.
          const { data: existingAnam } = await admin
            .from("anamnesis_responses")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();
          if (!existingAnam) update.onboarding_completed = false;
        }
        const { error } = await admin.from("profiles").update(update).eq("id", userId);
        if (error) console.error("PERFORM: errore aggiornamento profilo dopo pagamento", error);
      } else {
        console.error("PERFORM: webhook checkout.session.completed senza userId/planDb riconoscibili", session.id);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        // L'abbonamento è finito (cancellato dal cliente o pagamenti falliti
        // troppe volte): torna a 'free'. Se era un vero cliente in coaching
        // (client_status già 'active') il nuovo stato è 'expired', non null
        // — così finisce nel reparto "Scaduti" del pannello coach invece di
        // sparire silenziosamente come se non fosse mai stato un cliente.
        // Chi aveva solo Performance Pack (mai 'active', non è coaching)
        // torna semplicemente a un utente registrato qualunque.
        const { data: existing } = await admin.from("profiles").select("client_status").eq("id", userId).maybeSingle();
        const wasCoachingClient = existing?.client_status === "active";
        const { error } = await admin.from("profiles")
          .update({ plan: "free", client_status: wasCoachingClient ? "expired" : null })
          .eq("id", userId);
        if (error) console.error("PERFORM: errore downgrade dopo cancellazione abbonamento", error);
      }
    }
  } catch (err) {
    console.error("PERFORM: errore elaborazione evento webhook Stripe", event.type, err);
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
