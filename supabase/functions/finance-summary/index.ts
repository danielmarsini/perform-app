// PERFORM — Edge Function: finance-summary
// ============================================================================
// Hub Finanziario: prima calcolava l'MRR guardando solo profiles.plan/
// client_status — un piano che il coach assegna manualmente da "Prendi in
// gestione" o dalla whitelist (SCHEMA_v37) risultava contato come fatturato
// vero, anche senza un solo euro incassato davvero. Qui invece la fonte è
// SEMPRE Stripe stesso, in tempo reale: nessuna copia locale che possa
// disallinearsi da cosa è successo per davvero sul conto Stripe del coach.
// Coach-only (stessa verifica JWT + email di admin-reset-password/
// admin-delete-account) — mai raggiungibile da un cliente, dato finanziario
// sensibile. STRIPE_SECRET_KEY resta lato server, mai esposta al browser.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

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
  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può vedere l'Hub Finanziario" }), { status: 403, headers: CORS_HEADERS });
  }

  try {
    // MRR reale: somma dei prezzi ricorrenti di ogni abbonamento DAVVERO
    // attivo su Stripe in questo momento — non una stima da un flag locale.
    let mrrCents = 0;
    let activeCount = 0;
    for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] })) {
      activeCount++;
      for (const item of sub.items.data) {
        const price = item.price;
        if (price?.recurring && price.unit_amount) {
          // Normalizza tutto a "al mese": un prezzo annuale conterebbe
          // 12 volte troppo nell'MRR se sommato senza dividere.
          const monthly = price.recurring.interval === "year" ? price.unit_amount / 12 : price.unit_amount;
          mrrCents += monthly * (item.quantity || 1);
        }
      }
    }

    // Transazioni reali: gli ultimi charge veri (sia abbonamenti ricorrenti
    // sia l'acquisto singolo Scheda Personalizzata passano entrambi da un
    // Charge Stripe) — mai un ch_sim_ inventato.
    const charges = await stripe.charges.list({ limit: 30, expand: ["data.customer"] });
    const customerIds = [...new Set(charges.data.map((c) => (typeof c.customer === "string" ? c.customer : c.customer?.id)).filter(Boolean))];
    const { data: profiles } = customerIds.length
      ? await admin.from("profiles").select("stripe_customer_id, full_name, nickname, email").in("stripe_customer_id", customerIds)
      : { data: [] };
    const byCustomerId = new Map((profiles ?? []).map((p) => [p.stripe_customer_id, p]));

    const transactions = charges.data.map((c) => {
      const custId = typeof c.customer === "string" ? c.customer : c.customer?.id;
      const profile = custId ? byCustomerId.get(custId) : null;
      return {
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.refunded ? "refunded" : c.status, // 'succeeded' | 'pending' | 'failed' | 'refunded'
        email: profile?.email || c.billing_details?.email || c.receipt_email || null,
        name: profile?.full_name || profile?.nickname || null,
        createdAt: new Date(c.created * 1000).toISOString(),
      };
    });

    return new Response(JSON.stringify({
      mrr: Math.round(mrrCents) / 100,
      activeSubscriptions: activeCount,
      transactions,
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore finance-summary", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito a leggere i dati finanziari da Stripe." }), { status: 500, headers: CORS_HEADERS });
  }
});
