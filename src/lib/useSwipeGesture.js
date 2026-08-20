import { useEffect, useRef } from "react";
import { haptic } from "./haptics.js";

/* Gesture di navigazione stile iOS: swipe orizzontale da bordo sinistro →
   "indietro" (come il back-swipe nativo di Safari/iOS), swipe verticale
   verso il basso → "chiudi" (per modali a tutto schermo, come su
   Instagram/Apple Music). Entrambe ignorano il gesto se parte da un
   elemento marcato data-no-swipe — usato sulla mappa GPS (Leaflet gestisce
   già pan/drag da sé) e su qualunque lista con scroll orizzontale proprio,
   per non rubargli il tocco. */

const EDGE_PX = 28;
const THRESHOLD_PX = 70;

// Da attaccare al livello più alto di una schermata (l'intero componente,
// via window): swipe che PARTE entro i primi 28px dal bordo sinistro dello
// schermo e si muove abbastanza in orizzontale → onBack(). enabled=false
// quando non c'è un "indietro" sensato (es. già sulla Home).
export function useEdgeSwipeBack(onBack, enabled = true) {
  const state = useRef(null);
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    function onTouchStart(e) {
      const t = e.touches[0];
      if (!t || t.clientX > EDGE_PX || e.target.closest?.("[data-no-swipe]")) { state.current = null; return; }
      state.current = { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
    }
    function onTouchMove(e) {
      if (!state.current) return;
      const t = e.touches[0];
      state.current.dx = t.clientX - state.current.x0;
      state.current.dy = t.clientY - state.current.y0;
    }
    function onTouchEnd() {
      const s = state.current;
      state.current = null;
      if (s && s.dx > THRESHOLD_PX && Math.abs(s.dy) < s.dx * 0.6) { haptic("tap"); onBackRef.current(); }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled]);
}

// Da attaccare a un elemento "maniglia" (di solito l'header del modale, con
// SwipeHandle.jsx sopra a segnalarlo visivamente) — MAI al modale intero:
// se il modale ha contenuto scrollabile, un trascinamento verso il basso
// dentro al contenuto verrebbe interpretato come "chiudi" invece che come
// scroll. enabled=false per i pochi modali che non si possono chiudere
// (es. il check settimanale obbligatorio di domenica/lunedì).
export function useSwipeDownClose(ref, onClose, enabled = true) {
  const state = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    function onTouchStart(e) {
      if (e.target.closest?.("[data-no-swipe]")) { state.current = null; return; }
      const t = e.touches[0];
      if (!t) return;
      state.current = { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
    }
    function onTouchMove(e) {
      if (!state.current) return;
      const t = e.touches[0];
      state.current.dx = t.clientX - state.current.x0;
      state.current.dy = t.clientY - state.current.y0;
    }
    function onTouchEnd() {
      const s = state.current;
      state.current = null;
      if (s && s.dy > THRESHOLD_PX + 20 && Math.abs(s.dx) < s.dy * 0.6) { haptic("tap"); onCloseRef.current(); }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [ref, enabled]);
}
