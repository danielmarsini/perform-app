// PERFORM — Edge Function: admin-reset-password
// ============================================================================
// Hub Rete & Accessi → "Controllo Accessi": prima il pulsante "Rigenera"
// generava una password FINTA, solo in stato locale React — non cambiava
// nulla su auth.users, il coach pensava di aver risolto un accesso bloccato
// e in realtà no. Qui invece si usa davvero l'Auth Admin API (service role,
// unico modo di impostare la password di un ALTRO utente — un utente non può
// mai farlo per un altro con la chiave anon/pubblica). Ritorna la password
// in chiaro UNA volta sola nella risposta: dopo non è più recuperabile da
// nessuna parte (è hashata su auth.users), il coach deve copiarla subito e
// comunicarla al cliente.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const digits = Array.from(bytes, (b) => b % 10).join("");
  return `Perform-${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  // NOTA: profiles.role non distingue mai il coach — vedi stesso commento
  // già lasciato in generate-plan/notify-client. L'unico riconoscimento
  // reale nell'app è l'email, la costante COACH_EMAIL di 04_AppShell.jsx.
  if ((user.email || "").trim().toLowerCase() !== "danielmarsini@coach.com") {
    return new Response(JSON.stringify({ error: "forbidden — solo il coach può reimpostare le password" }), { status: 403, headers: CORS_HEADERS });
  }

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return new Response(JSON.stringify({ error: "userId mancante" }), { status: 400, headers: CORS_HEADERS });

  const newPassword = randomPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    console.error("PERFORM: errore reset password admin", error);
    return new Response(JSON.stringify({ error: "Non sono riuscito a reimpostare la password." }), { status: 500, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ password: newPassword }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
