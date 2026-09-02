/* ============================================================================
   pushNotifications.js — Web Push reale (streak/promemoria)
   ----------------------------------------------------------------------------
   Standard Web Push (Service Worker + PushManager), niente SDK di terze parti
   lato client. La chiave pubblica VAPID è pubblica per definizione (serve al
   browser per cifrare verso il server): VITE_VAPID_PUBLIC_KEY va bene in
   chiaro nel bundle. La chiave PRIVATA non esiste da nessuna parte in questo
   repo — vive solo come secret della Edge Function che invia i push
   (supabase/functions/streak-reminder), mai nel client.
   ========================================================================== */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// iOS Safari (anche Chrome/Firefox su iOS, che sono comunque WebKit sotto)
// espone PushManager SOLO se la pagina gira come PWA installata sulla
// schermata Home — in una normale scheda Safari, window.PushManager non
// esiste affatto, quindi qualunque tentativo di abbonarsi fallisce in
// silenzio, senza mai arrivare al prompt di permesso del sistema. È una
// restrizione della piattaforma (da iOS 16.4), non un bug risolvibile lato
// codice: l'unica soluzione reale è guidare l'utente ad "Aggiungi alla
// schermata Home" e riaprire l'app da lì.
function isIosWebkit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchend" in document);
  return isIosDevice && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isRunningAsInstalledApp() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) || window.navigator?.standalone === true;
}

// Diagnosi più precisa di "perché non funziona" rispetto a un booleano
// unico — serve a mostrare all'utente il motivo reale (e come risolverlo)
// invece di un generico "non supportato" che su iPhone lascia pensare a un
// bug dell'app quando in realtà manca solo l'installazione come PWA.
export function pushUnsupportedReason() {
  if (typeof window === "undefined") return "browser";
  if (isIosWebkit() && !isRunningAsInstalledApp()) return "ios-not-installed";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "browser";
  if (!VAPID_PUBLIC_KEY) return "no-vapid";
  return null;
}

export function isPushSupported() {
  return pushUnsupportedReason() === null;
}

// Il browser vuole la chiave VAPID come Uint8Array (base64url → binario),
// non come stringa: conversione standard, sempre la stessa per ogni sito
// che implementa Web Push.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// true se questo browser ha già un abbonamento push attivo (indipendente da
// cosa è salvato su Supabase — utile per lo stato iniziale del toggle).
export async function getBrowserPushSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// Attiva le notifiche: registra il service worker (se non già attivo),
// chiede il permesso browser, crea l'abbonamento push e lo salva su
// push_subscriptions. Ritorna { ok: true } o { ok: false, reason }.
export async function subscribeToPush(supabase, userId) {
  if (!isPushSupported()) return { ok: false, reason: "not-supported" };
  if (!supabase || !userId) return { ok: false, reason: "not-logged-in" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  // BUG PRESO: quando il browser genera un endpoint nuovo (dopo reinstallo
  // PWA, permesso resettato, ecc.) l'upsert sotto salva la riga nuova ma
  // quella vecchia con l'endpoint precedente restava orfana per sempre —
  // risultato: più righe per lo stesso utente/dispositivo, e la funzione
  // di invio manda un push a ognuna → notifiche duplicate identiche.
  // Prima di salvare la nuova, ripulisco le altre di questo utente.
  await supabase.from("push_subscriptions").delete().eq("user_id", userId).neq("endpoint", json.endpoint);
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, reason: "save-failed" };
  return { ok: true };
}

// Disattiva: annulla l'abbonamento nel browser E cancella la riga su
// Supabase, altrimenti il job schedulato continuerebbe a provare a mandare
// push verso un endpoint che il browser ha già scartato.
export async function unsubscribeFromPush(supabase, userId) {
  const subscription = await getBrowserPushSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    if (supabase) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return;
  }
  // Nessun abbonamento nel browser corrente ma potrebbero restare righe
  // orfane da un dispositivo diverso già disconnesso: pulizia per user_id.
  if (supabase && userId) await supabase.from("push_subscriptions").delete().eq("user_id", userId);
}
