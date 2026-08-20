/* ============================================================================
   haptics.js — micro-feedback tattile (vibrazione breve) sulle azioni che
   contano: salvare, eliminare, completare una serie, attivare un interruttore.
   Solo Android supporta Vibration API nel browser (navigator.vibrate) — su
   iOS Safari/PWA non esiste alcuna API web per l'haptic feedback reale (è
   un limite di Apple, non nostro: richiederebbe un'app nativa). La funzione
   fallisce silenziosamente ovunque manchi il supporto, quindi è sempre
   sicuro chiamarla senza controllare la piattaforma a monte.
   ========================================================================== */

const PATTERNS = {
  tap: 8,           // selezione leggera (cambio tab, apri/chiudi)
  confirm: 14,       // conferma azione positiva (salva, aggiungi, completa serie)
  success: [12, 40, 12], // traguardo (record personale, obiettivo raggiunto)
  warning: 24,        // elimina, annulla, errore di validazione
};

export function haptic(kind = "tap") {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
  } catch { /* best-effort, mai bloccare l'azione per questo */ }
}
