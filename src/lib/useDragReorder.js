import { useCallback, useRef, useState } from "react";
import { haptic } from "./haptics.js";

// Sposta un elemento di un array immutabilmente, senza mutare l'originale —
// usato sia dal reorder in tempo reale (sotto) sia dal chiamante per
// applicare lo spostamento finale allo stato.
export function moveItem(arr, fromIdx, toIdx) {
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

/* Riordino a trascinamento per liste verticali (esercizi di un giorno, sia
   lato coach sia lato cliente) — niente libreria esterna: Pointer Events
   nativi (funzionano sia per touch sia per mouse, a differenza del drag&drop
   HTML5 che su molti browser mobile è inaffidabile o assente). I centri Y di
   TUTTE le righe si misurano una sola volta, all'inizio del trascinamento
   (le altre righe non si muovono durante il drag, solo quella trascinata
   segue il dito via transform): ad ogni movimento si sceglie come bersaglio
   la riga il cui centro ORIGINALE è più vicino alla posizione attuale del
   dito — corretto anche quando le righe hanno altezze diverse fra loro (un
   esercizio di libreria è una riga sola, uno personalizzato con la guida
   biomeccanica aperta è multiplo), a differenza di un calcolo basato su
   "un'altezza di riga fissa" che con righe disomogenee smette di funzionare.

   Uso:
     const reorder = useDragReorder({ length: items.length, onReorder: (from, to) => {...} });
     <div ref={reorder.setRowRef(i)} style={reorder.rowStyle(i)}>
       <button {...reorder.handleProps(i)}><GripVertical/></button>
       ...
     </div>
*/
export function useDragReorder({ length, onReorder }) {
  const rowRefs = useRef([]);
  const drag = useRef(null); // { originIndex, startY, centers, overIndex }
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);

  const setRowRef = useCallback((i) => (el) => { rowRefs.current[i] = el; }, []);

  // BUG PRESO: il calcolo precedente divideva lo spostamento del dito per
  // l'altezza della SOLA riga trascinata ("steps = delta / rowHeight"),
  // assumendo tutte le righe della stessa altezza. Nell'editor allenamento
  // del coach le righe NON sono uniformi: un esercizio di libreria è una
  // riga sola, uno personalizzato con la guida biomeccanica aperta (come si
  // esegue/cosa evitare/video + muscoli sinergici) è alto multiplo — con
  // quell'ipotesi sbagliata il trascinamento richiedeva una corsa del dito
  // completamente scollegata da dove le righe erano REALMENTE disegnate,
  // finendo spesso per calcolare "nessun cambiamento" (overIndex ==
  // originIndex) anche dopo un trascinamento visivamente completo — da qui
  // il riordino "che non cambia niente". Ora si misurano UNA VOLTA, all'inizio
  // del trascinamento, i centri Y reali di tutte le righe (le altre non si
  // muovono durante il drag, solo quella trascinata segue il dito via
  // transform) e si sceglie ad ogni movimento la riga il cui centro
  // ORIGINALE è più vicino alla posizione attuale del dito — corretto per
  // costruzione qualunque sia l'altezza di ciascuna riga.
  const onPointerMove = useCallback((e) => {
    const s = drag.current;
    if (!s) return;
    const delta = e.clientY - s.startY;
    setDragOffset(delta);
    const originCenter = s.centers[s.originIndex];
    const currentY = originCenter != null ? originCenter + delta : e.clientY;
    let next = s.originIndex;
    let bestDist = Infinity;
    s.centers.forEach((c, idx) => {
      if (c == null) return;
      const dist = Math.abs(c - currentY);
      if (dist < bestDist) { bestDist = dist; next = idx; }
    });
    if (next !== s.overIndex) {
      s.overIndex = next;
      setOverIndex(next);
      haptic("tap");
    }
  }, []);

  const endDrag = useCallback(() => {
    const s = drag.current;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    drag.current = null;
    setDragIndex(null);
    setOverIndex(null);
    setDragOffset(0);
    if (s && s.overIndex !== s.originIndex) onReorder(s.originIndex, s.overIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPointerMove, onReorder]);

  const handleProps = useCallback((i) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      const rects = rowRefs.current.slice(0, length).map((el) => (el ? el.getBoundingClientRect() : null));
      const centers = rects.map((r) => (r ? r.top + r.height / 2 : null));
      const heights = rects.map((r) => (r ? r.height : 0));
      drag.current = { originIndex: i, startY: e.clientY, centers, heights, overIndex: i };
      setDragIndex(i);
      setOverIndex(i);
      setDragOffset(0);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    style: { touchAction: "none", cursor: "grab" },
  }), [onPointerMove, endDrag, length]);

  // Riga trascinata: si sposta col dito (transform istantaneo, mai in
  // transizione — deve restare incollata al dito). Le righe comprese fra
  // l'origine e la posizione attuale del rilascio si spostano insieme,
  // con una transizione morbida, per "aprire" fisicamente lo spazio dove
  // la riga trascinata andrebbe a finire — non più solo un bordo statico
  // a indicare il punto di sgancio. Lo spostamento usa l'altezza REALE
  // della riga trascinata (misurata all'inizio, vedi handleProps), corretto
  // anche con righe di altezza diversa fra loro (un esercizio con la guida
  // aperta è multiplo dell'altezza di uno compatto).
  const rowStyle = useCallback((i) => {
    if (dragIndex === null) return undefined;
    if (i === dragIndex) {
      return { transform: `translateY(${dragOffset}px)`, position: "relative", zIndex: 10, boxShadow: "0 10px 24px rgba(0,0,0,0.18)", transition: "none" };
    }
    if (overIndex !== null && overIndex !== dragIndex) {
      const lo = Math.min(dragIndex, overIndex);
      const hi = Math.max(dragIndex, overIndex);
      if (i >= lo && i <= hi) {
        const draggedHeight = drag.current?.heights?.[dragIndex] ?? 0;
        const shift = overIndex > dragIndex ? -draggedHeight : draggedHeight;
        return { transform: `translateY(${shift}px)`, transition: "transform 140ms ease" };
      }
    }
    return { transition: "transform 140ms ease" };
  }, [dragIndex, overIndex, dragOffset]);

  return { dragIndex, setRowRef, handleProps, rowStyle };
}
