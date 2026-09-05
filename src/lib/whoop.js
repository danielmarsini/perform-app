/* ============================================================================
   whoop.js — client-side per il collegamento OAuth2 Whoop (Digital Twin,
   HRV/RHR reali). Lo scambio code->token e ogni chiamata all'API Whoop
   avvengono SOLO nelle Edge Function (whoop-oauth-callback/whoop-sync/
   whoop-disconnect, supabase/functions/): qui non c'è mai un client_secret,
   solo il client_id (pubblico per definizione in OAuth2, come ogni altro
   VITE_* già in uso in questo progetto) usato per costruire l'URL di
   autorizzazione a cui il browser viene reindirizzato.
   ========================================================================== */

const WHOOP_AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
// Scope minimo necessario al Digital Twin: solo recovery (hrv/rhr). Nessun
// accesso a workout/profilo/altro dato Whoop non usato da questa app.
const WHOOP_SCOPES = "read:recovery offline";

function redirectUri() {
  return `${window.location.origin}/`;
}

// Reindirizza il browser a Whoop per il consenso — stessa pagina corrente
// come redirect_uri (deve combaciare ESATTAMENTE con quello registrato nel
// Whoop Developer Dashboard). `state` è un nonce anti-CSRF salvato in
// sessionStorage e riverificato al ritorno in App.jsx.
export function startWhoopConnect() {
  const clientId = import.meta.env.VITE_WHOOP_CLIENT_ID;
  if (!clientId) {
    console.error("PERFORM: VITE_WHOOP_CLIENT_ID non configurato — impossibile avviare il collegamento Whoop");
    return;
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem("perform_whoop_oauth_state", state);
  const url = new URL(WHOOP_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", WHOOP_SCOPES);
  url.searchParams.set("state", state);
  window.location.href = url.toString();
}

// Chiamata da App.jsx al mount se l'URL contiene ?code=...&state=... (Whoop
// che rimanda l'utente dopo il consenso). Verifica lo state salvato prima di
// fidarsi del code, poi delega lo scambio vero alla Edge Function.
export async function completeWhoopConnect(supabase, code, state) {
  const savedState = sessionStorage.getItem("perform_whoop_oauth_state");
  sessionStorage.removeItem("perform_whoop_oauth_state");
  if (!savedState || savedState !== state) {
    throw new Error("Stato OAuth Whoop non valido — riprova il collegamento.");
  }
  const { data, error } = await supabase.functions.invoke("whoop-oauth-callback", {
    body: { code, redirectUri: redirectUri() },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function syncWhoopData(supabase) {
  const { data, error } = await supabase.functions.invoke("whoop-sync", { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { synced, daysFound }
}

export async function disconnectWhoop(supabase) {
  const { data, error } = await supabase.functions.invoke("whoop-disconnect", { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
