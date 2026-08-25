// PERFORM — Edge Function: admin-delete-account
// ============================================================================
// Due chiamanti, stessa funzione:
//  1. Hub Rete & Accessi (coach): elimina un account altrui — uso previsto,
//     ripulire i doppioni di registrazione. Chiama con { userId: <altro> }.
//  2. Impostazioni > "Sì, elimina tutto" (qualunque utente, incluso un
//     cliente in gestione): elimina il PROPRIO account. Chiama a corpo
//     vuoto — targetId ricade sull'id del chiamante, mai passato dal client
//     per un self-delete (nessun utente deve poter costruire una richiesta
//     che elimina qualcun altro spacciandola per "elimina te stesso").
// Azione IRREVERSIBILE: cancella l'utente da auth.users (Admin API, service
// role — mai possibile con la chiave anon) e la sua riga profiles. La UI
// chiamante deve sempre chiedere conferma esplicita PRIMA di invocare questa
// funzione: qui non c'è nessuna doppia conferma, esegue subito.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  const isCoach = (user.email || "").trim().toLowerCase() === "danielmarsini@coach.com";
  const { userId: requestedUserId } = await req.json().catch(() => ({}));
  // Self-delete: nessun userId nel corpo, il bersaglio è sempre e solo il
  // chiamante — mai un id passato dal client per un self-delete, altrimenti
  // un utente normale potrebbe costruire una richiesta che elimina un altro
  // account spacciandola per "elimina il mio".
  const targetId = requestedUserId || user.id;

  if (isCoach) {
    if (targetId === user.id) {
      return new Response(JSON.stringify({ error: "Non puoi eliminare il tuo stesso account coach da qui." }), { status: 400, headers: CORS_HEADERS });
    }
  } else if (targetId !== user.id) {
    return new Response(JSON.stringify({ error: "Puoi eliminare solo il tuo account." }), { status: 403, headers: CORS_HEADERS });
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetId);
  if (authDeleteError) {
    console.error("PERFORM: errore eliminazione utente admin", authDeleteError);
    return new Response(JSON.stringify({ error: "Non sono riuscito a eliminare l'account." }), { status: 500, headers: CORS_HEADERS });
  }
  // Pulizia esplicita della riga profiles: non ci si affida a un'eventuale
  // FK ON DELETE CASCADE che potrebbe non essere configurata su questo
  // progetto — meglio un delete esplicito ridondante che una riga orfana.
  const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", targetId);
  if (profileDeleteError) console.error("PERFORM: errore eliminazione riga profiles residua", profileDeleteError);

  return new Response(JSON.stringify({ deleted: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
