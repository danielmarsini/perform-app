/* ============================================================================
   AddToHomeScreenBanner.jsx
   ----------------------------------------------------------------------------
   PERFORM è già una PWA installabile (manifest.json + apple-touch-icon +
   display:standalone, vedi index.html) — mancava solo l'invito a farlo
   davvero. iOS non ha un prompt nativo per le web app (Apple lo riserva
   all'App Store): l'unico modo è mostrare le istruzioni manuali (Condividi →
   Aggiungi a Home). Android/Chrome desktop invece espone l'evento
   beforeinstallprompt, un vero pulsante "Installa" con dialogo nativo.
   Si nasconde da sé se l'app gira già in standalone (già installata) o se
   l'utente l'ha chiusa di recente (localStorage, ripropone dopo 14 giorni:
   non deve diventare un fastidio ripetuto ad ogni apertura). */
import React, { useEffect, useState } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";

const DISMISS_KEY = "perform-a2hs-dismissed-at";
const DISMISS_DAYS = 14;

function isStandalone() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return (Date.now() - Number(raw)) / 86400000 < DISMISS_DAYS;
  } catch { return false; }
}

export default function AddToHomeScreenBanner({ accent, dark }) {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    setIos(isIos());
    // Su iOS non esiste beforeinstallprompt: si mostrano le istruzioni subito.
    if (isIos()) { setVisible(true); return; }
    // Su Android/Chrome si aspetta l'evento del browser prima di mostrarsi —
    // se non arriva (browser non supportato, già installata...) resta nascosta.
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* best-effort */ }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed left-3 right-3 z-40 rounded-2xl px-4 py-3.5 flex items-center gap-3"
      style={{
        bottom: "calc(72px + env(safe-area-inset-bottom))",
        backgroundColor: dark ? "#18181B" : "#FFFFFF",
        border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(17,17,17,0.08)"}`,
        boxShadow: "0 12px 32px -8px rgba(0,0,0,0.35)",
      }}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}20` }}>
        {ios ? <Share size={18} style={{ color: accent }} /> : <Download size={18} style={{ color: accent }} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: dark ? "#FAFAFA" : "#1A1A1A" }}>Installa PERFORM</p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: dark ? "#A1A1AA" : "#71717A" }}>
          {ios
            ? <>Tocca <Share size={11} style={{ display: "inline", verticalAlign: "-2px" }} /> Condividi, poi <PlusSquare size={11} style={{ display: "inline", verticalAlign: "-2px" }} /> "Aggiungi a Home"</>
            : "Un tocco per averla come un'app vera, con le notifiche"}
        </p>
      </div>
      {!ios && (
        <button onClick={install} className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold"
          style={{ backgroundColor: accent, color: "#FFFFFF" }}>
          Installa
        </button>
      )}
      <button onClick={dismiss} aria-label="Chiudi" className="shrink-0 p-1">
        <X size={16} style={{ color: dark ? "#71717A" : "#A1A1AA" }} />
      </button>
    </div>
  );
}
