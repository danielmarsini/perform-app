// PERFORM — Edge Function: notify-coach
// ============================================================================
// Direzione inversa di notify-client: invocata dal client subito dopo aver
// inviato un messaggio in chat, manda un push al COACH così può rispondere
// tempestivamente anche da webapp (senza app nativa). Chiunque sia loggato
// può chiamarla (è normale che un cliente scriva al proprio coach) — a
// differenza di notify-client qui non c'è un check di ruolo da fare sul
// chiamante, ma proprio per questo titolo e testo del push non arrivano MAI
// dal client: il titolo lo costruisce il server dal nickname reale del
// mittente (via il JWT verificato), il body è solo l'anteprima del
// messaggio già visibile in chat — nessuna superficie in più per spoofare
// il push del coach.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:coach@perform.app";
const COACH_EMAIL = "danielmarsini@coach.com";

// BUG PRESO: un 500 senza nessuna riga di errore nei Logs — il crash
// avveniva PRIMA di Deno.serve, a livello di modulo, quando setVapidDetails
// riceve una chiave VAPID mal formattata: l'intera istanza va giù al boot,
// nessun log applicativo arriva mai a scriversi. Un try/catch qui rende
// visibile la causa reale invece di un 500 muto.
let vapidError: string | null = null;
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  vapidError = err?.message || String(err);
  console.error("PERFORM: chiave VAPID non valida in notify-coach", vapidError);
}

// BUG PRESO: chiamata dal browser (supabase.functions.invoke) da un'origine
// diversa da *.supabase.co — senza questi header il browser blocca la
// richiesta già alla preflight OPTIONS (che riceveva 405 qui), la vera POST
// non partiva mai e il push non veniva mai inviato — root cause reale della
// segnalazione "attivo le notifiche ma non arriva nulla". Stesso pattern già
// stabilito in create-checkout-session, ripetuto (per errore) anche in
// notify-client: da riusare sempre in ogni function chiamata da browser.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });
  if (vapidError) return new Response(JSON.stringify({ error: `chiave VAPID non valida: ${vapidError}` }), { status: 500, headers: CORS_HEADERS });

  // BUG PRESO: senza questo try/catch, qualunque eccezione imprevista qui
  // sotto (es. createClient con una env var mancante) usciva dalla mano di
  // Deno.serve come 500 generico senza header CORS — il browser lo vedeva
  // come errore di rete opaco, e nessun console.error finiva mai nei Logs.
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

    // Il coach che scrive nella propria self-chat non deve mandarsi un push.
    if ((user.email || "").trim().toLowerCase() === COACH_EMAIL) {
      return new Response(JSON.stringify({ sent: 0, reason: "sender-is-coach" }), { headers: CORS_HEADERS });
    }

    const { body } = await req.json().catch(() => ({}));
    if (!body) return new Response(JSON.stringify({ error: "body è obbligatorio" }), { status: 400, headers: CORS_HEADERS });

    // Titolo breve stile WhatsApp: solo il nickname sopra, il messaggio sotto
    // come body — non più "Nuovo messaggio da X", che sommato alla scritta
    // "from Perform" che iOS/Android aggiungono da soli al push rendeva la
    // prima riga troppo lunga da leggere al volo sulla lock screen.
    const { data: sender } = await admin.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
    const title = sender?.nickname || "Un cliente";

    const { data: coach, error: coachError } = await admin.from("profiles").select("id").ilike("email", COACH_EMAIL).maybeSingle();
    if (coachError || !coach) return new Response(JSON.stringify({ error: "coach non trovato" }), { status: 500, headers: CORS_HEADERS });

    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", coach.id);
    if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500, headers: CORS_HEADERS });
    if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no-subscriptions" }), { headers: CORS_HEADERS });

    const payload = JSON.stringify({ title, body, url: "/" });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("PERFORM: errore invio push cliente→coach", user.id, err);
        }
      }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore imprevisto in notify-coach", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
