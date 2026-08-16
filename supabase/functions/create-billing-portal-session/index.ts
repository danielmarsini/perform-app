// PERFORM — Edge Function: create-billing-portal-session
// ============================================================================
// Apre il Customer Portal di Stripe per l'utente loggato: da lì può vedere le
// fatture, aggiornare il metodo di pagamento o cancellare l'abbonamento da
// solo, senza bisogno del coach. Una cancellazione qui genera l'evento
// customer.subscription.deleted che stripe-webhook riceve e sincronizza
// automaticamente su profiles (torna a 'free').

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://perform-app-cyan.vercel.app";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

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

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (!profile?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "Nessun pagamento associato a questo account ancora." }), { status: 400 });
  }

  const { origin } = await req.json().catch(() => ({}));
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${resolveBase(origin)}/`,
    });
    return new Response(JSON.stringify({ url: portalSession.url }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore creazione Billing Portal Session Stripe", err);
    return new Response(JSON.stringify({ error: "Non sono riuscito ad aprire la gestione abbonamento." }), { status: 500 });
  }
});
