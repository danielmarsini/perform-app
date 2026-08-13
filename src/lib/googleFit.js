/* ============================================================================
   googleFit.js — sync passi reale da Google Fit (solo Android)
   ----------------------------------------------------------------------------
   iPhone/Apple Salute resta manuale: non esiste una via gratuita per leggerla
   da una web app (serve un'app nativa o un aggregatore terzo a pagamento).
   Google Fit invece ha un'API REST pubblica leggibile da browser via OAuth —
   ma lo scope fitness.activity.read è "restricted" da Google: per usarlo con
   utenti reali (non solo account di test) serve completare la verifica app
   di Google (privacy policy pubblica, possibile revisione di sicurezza).
   Finché quella verifica non è completata, questa integrazione funziona solo
   per l'account del proprietario del progetto Google Cloud e fino a 100
   utenti di test aggiunti a mano nella console — vedi le istruzioni fornite
   a parte per l'attivazione.

   Nessun refresh token salvato lato server: il token di accesso richiesto
   qui dura circa un'ora ed è tenuto solo in sessionStorage (mai in
   localStorage/DB) — a ogni nuova sessione il cliente rifà il collegamento
   con un tap, niente backend aggiuntivo da mantenere per questo. */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const FITNESS_SCOPE = "https://www.googleapis.com/auth/fitness.activity.read";
const TOKEN_STORAGE_KEY = "perform-google-fit-token";

export function isAndroid() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function isGoogleFitConfigured() {
  return Boolean(CLIENT_ID);
}

function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("gis-script");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "gis-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossibile caricare Google Identity Services"));
    document.head.appendChild(script);
  });
}

function getStoredToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.accessToken || !parsed.expiresAt || Date.now() >= parsed.expiresAt) return null;
    return parsed.accessToken;
  } catch (err) {
    return null;
  }
}

function storeToken(accessToken, expiresInSeconds) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      accessToken,
      expiresAt: Date.now() + (Number(expiresInSeconds) || 3600) * 1000 - 60000, // -60s di margine
    }));
  } catch (err) { /* sessionStorage non disponibile: si richiederà un nuovo token alla prossima sync */ }
}

// Apre il popup di consenso Google (solo se non c'è già un token valido in
// sessionStorage) e ritorna l'access token pronto per l'uso.
function requestAccessToken() {
  const cached = getStoredToken();
  if (cached) return Promise.resolve(cached);
  if (!CLIENT_ID) return Promise.reject(new Error("Google Fit non configurato (VITE_GOOGLE_CLIENT_ID mancante)"));

  return loadGisScript().then(() => new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: FITNESS_SCOPE,
      callback: (response) => {
        if (response.error) { reject(new Error(response.error)); return; }
        storeToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  }));
}

// Passi di OGGI (mezzanotte locale → ora attuale) sommati dalla sorgente
// aggregata di Google Fit (com.google.step_count.delta), la stessa metrica
// che l'app Google Fit/Salute mostra come "passi di oggi".
function fetchTodayStepsFromFitness(accessToken) {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const body = {
    aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
    bucketByTime: { durationMillis: now.getTime() - startOfDay.getTime() || 1 },
    startTimeMillis: startOfDay.getTime(),
    endTimeMillis: now.getTime(),
  };
  return fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error(`Google Fit ha risposto ${res.status}`);
    return res.json();
  }).then((data) => {
    let total = 0;
    (data.bucket || []).forEach((b) => (b.dataset || []).forEach((ds) => (ds.point || []).forEach((p) => {
      total += (p.value || []).reduce((sum, v) => sum + (v.intVal || 0), 0);
    })));
    return total;
  });
}

// Punto d'ingresso unico usato dalla UI: autorizza (se serve) e ritorna i
// passi di oggi come numero.
export async function syncTodayStepsFromGoogleFit() {
  const token = await requestAccessToken();
  return fetchTodayStepsFromFitness(token);
}

export function disconnectGoogleFit() {
  try { sessionStorage.removeItem(TOKEN_STORAGE_KEY); } catch (err) { /* best-effort */ }
}

export function isGoogleFitConnected() {
  return Boolean(getStoredToken());
}
