// PERFORM — Edge Function: expire-whitelists
// ============================================================================
// Chiamata una volta al giorno da un job pg_cron — stesso pattern
// x-cron-secret di streak-reminder/monthly-xp-snapshot. Riporta a "free"
// ogni cliente la cui whitelist (SCHEMA_v37, coachingData.js
// whitelistClient) è scaduta: whitelisted_until nel passato. Non tocca mai
// un cliente che nel frattempo ha un abbonamento Stripe reale — il webhook
// (stripe-webhook) azzera whitelisted_until non appena arriva un pagamento
// vero, quindi chi è arrivato qui ha davvero solo l'accesso in prestito del
// coach, mai un pagante reale declassato per errore.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: expired, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .lt("whitelisted_until", new Date().toISOString());
  if (selectError) return new Response(JSON.stringify({ error: selectError.message }), { status: 500 });
  if (!expired || expired.length === 0) return new Response(JSON.stringify({ reverted: 0 }));

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ plan: "free", client_status: null, whitelisted_until: null })
    .in("id", expired.map((p) => p.id));
  if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });

  return new Response(JSON.stringify({ reverted: expired.length }), { headers: { "Content-Type": "application/json" } });
});
