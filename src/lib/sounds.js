/* ============================================================================
   sounds.js — feedback sonoro leggero e opzionale.
   Generato al volo via Web Audio API (oscillatori), nessun file audio da
   scaricare o pesare il bundle. Disattivato di default finché l'utente non
   lo attiva dalle Impostazioni — mai un suono a sorpresa alla prima apertura.
   Stesso principio di haptics.js: fallisce sempre in silenzio, non blocca
   mai l'azione per cui viene chiamato.
   ========================================================================== */

const STORAGE_KEY = "perform_sound_enabled";

export function isSoundEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}

export function setSoundEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, String(on)); } catch { /* best-effort */ }
}

// Un solo AudioContext riusato: crearne uno per suono è inutile e su alcuni
// browser mobile richiede comunque un gesto utente per partire la prima volta.
let ctx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// Una o più note brevi in sequenza, volume basso (mai invadente), inviluppo
// rapido in attacco e in decadimento esponenziale per non "scattare" secco.
function tone(freqs, { noteDur = 0.16, gain = 0.05, type = "sine" } = {}) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  const now = audioCtx.currentTime;
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = now + i * noteDur * 0.55;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + noteDur + 0.02);
  });
}

const KINDS = {
  xp: () => tone([880], { noteDur: 0.14, gain: 0.045 }),                 // XP guadagnato — un solo "ding" discreto
  trophy: () => tone([659.25, 987.77], { noteDur: 0.22, gain: 0.06 }),   // trofeo sbloccato — due note, più presente
  done: () => tone([523.25, 783.99], { noteDur: 0.16, gain: 0.05 }),     // allenamento/serie completata
};

export function playSound(kind = "xp") {
  if (!isSoundEnabled()) return;
  try { (KINDS[kind] || KINDS.xp)(); } catch { /* best-effort, mai bloccare l'azione per questo */ }
}
