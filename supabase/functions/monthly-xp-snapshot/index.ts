// PERFORM — Edge Function: monthly-xp-snapshot
// ============================================================================
// Chiamata una volta al mese (il giorno 1, poco dopo mezzanotte UTC) da un
// job pg_cron — stesso pattern di streak-reminder: header x-cron-secret
// invece della verifica JWT automatica, perché non c'è mai un utente
// loggato dietro a questa chiamata. Per ogni atleta scrive in
// monthly_xp_snapshots una riga con il suo profiles.xp_total attuale,
// etichettata col mese CHE INIZIA OGGI — è il punto di partenza da cui la
// classifica del nuovo mese calcolerà i guadagni, e insieme il punto di
// ARRIVO per calcolare i guadagni del mese appena chiuso (vedi
// fetchMonthlyLeaderboard in coachingData.js). Upsert su (user_id, month):
// se il cron gira due volte per errore non duplica né sovrascrive con un
// valore diverso in modo dannoso, converge sempre allo stesso risultato.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit" })
    .format(new Date()).replace("/", "-"); // 'YYYY-MM'
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const month = currentMonthKey();

  const { data: profiles, error } = await supabase.from("profiles").select("id, xp_total").eq("role", "user");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const rows = (profiles ?? []).map((p) => ({ user_id: p.id, month, xp_total_at_snapshot: p.xp_total ?? 0 }));
  if (rows.length === 0) return new Response(JSON.stringify({ snapshotted: 0 }));

  const { error: upsertError } = await supabase
    .from("monthly_xp_snapshots")
    .upsert(rows, { onConflict: "user_id,month" });
  if (upsertError) return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });

  return new Response(JSON.stringify({ snapshotted: rows.length, month }), { headers: { "Content-Type": "application/json" } });
});
