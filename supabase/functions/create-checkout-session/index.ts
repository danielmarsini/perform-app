// PERFORM — Edge Function: create-checkout-session
// ============================================================================
// Chiamata da un utente loggato (OnboardingFlow al momento della scelta del
// piano, SettingsDrawer per un cambio piano successivo) per aprire una vera
// sessione di pagamento Stripe Checkout. Verifica il JWT del chiamante come
// notify-client (deploy SENZA --no-verify-jwt + admin.auth.getUser esplicito)
// e non si fida MAI dell'importo: il prezzo lo decide solo priceId, un valore
// fra i 4 configurati in Stripe, mai un numero passato dal client.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://perform-app-cyan.vercel.app";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

// I 4 Price ID reali creati nel catalogo Stripe (v. SCHEMA_v31 + STRIPE_PLANS
// in 08_ClientProfileView.jsx, stessi valori). scheda_personalizzata è
// l'unico pagamento singolo, gli altri 3 sono abbonamenti mensili.
const ONE_TIME_PRICES = new Set(["price_1U54KFFifatHRNX6Zmofauly"]); // scheda_personalizzata
const ALLOWED_PRICES = new Set([
  "price_1U54JOFifatHRNX67Z2r6bzw", // full
  "price_1U54JnFifatHRNX6ZnlVa2JX", // training
  "price_1U54KFFifatHRNX6Zmofauly", // scheda_personalizzata
  "price_1U54KfFifatHRNX6dYk49FCG", // performance_pack
]);

// Il redirect dopo il pagamento deve tornare SOLO a un'origine nostra (prod
// o le preview Vercel, o localhost in sviluppo) — mai a un URL arbitrario
// passato dal client, altrimenti Stripe diventerebbe un open-redirect.
function resolveBase(origin) {
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.hostname === "localhost" || u.hostname.endsWith(".vercel.app")) return origin;
    } catch { /* origin non valido, ignora e usa il default */ }
  }
  return APP_URL;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { priceId, origin } = await req.json().catch(() => ({}));
  if (!priceId || !ALLOWED_PRICES.has(priceId)) {
    return new Response(JSON.stringify({ error: "priceId non valido" }), { status: 400 });
  }
  const mode = ONE_TIME_PRICES.has(priceId) ? "payment" : "subscription";

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, full_name, nickname")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile?.full_name || profile?.nickname || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const base = resolveBase(origin);
  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, price_id: priceId },
      ...(mode === "subscription" ? { subscription_data: { metadata: { supabase_user_id: user.id } } } : {}),
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore creazione Checkout Session Stripe", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito ad avviare il pagamento." }), { status: 500 });
  }
});
