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
   HTML5 che su molti browser mobile è inaffidabile o assente). Il calcolo è
   deliberatamente "a soglia di riga" (ogni volta che il dito supera metà
   altezza della riga sopra/sotto, l'indice bersaglio avanza di uno) invece
   di un vero drop su coordinate pixel: più prevedibile su schermi piccoli,
   niente bisogno di misurare/animare la posizione di OGNI riga durante il
   drag, solo quella trascinata si sposta visivamente (via transform).

   Uso:
     const reorder = useDragReorder({ length: items.length, onReorder: (from, to) => {...} });
     <div ref={reorder.setRowRef(i)} style={reorder.rowStyle(i)}>
       <button {...reorder.handleProps(i)}><GripVertical/></button>
       ...
     </div>
*/
export function useDragReorder({ length, onReorder }) {
  const rowRefs = useRef([]);
  const drag = useRef(null); // { originIndex, startY, rowHeight, overIndex }
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);

  const setRowRef = useCallback((i) => (el) => { rowRefs.current[i] = el; }, []);

  const onPointerMove = useCallback((e) => {
    const s = drag.current;
    if (!s) return;
    const delta = e.clientY - s.startY;
    setDragOffset(delta);
    const steps = Math.round(delta / s.rowHeight);
    const next = Math.min(length - 1, Math.max(0, s.originIndex + steps));
    if (next !== s.overIndex) {
      s.overIndex = next;
      setOverIndex(next);
      haptic("tap");
    }
  }, [length]);

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
      const row = rowRefs.current[i];
      const rowHeight = row?.getBoundingClientRect().height || 56;
      drag.current = { originIndex: i, startY: e.clientY, rowHeight, overIndex: i };
      setDragIndex(i);
      setOverIndex(i);
      setDragOffset(0);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    style: { touchAction: "none", cursor: "grab" },
  }), [onPointerMove, endDrag]);

  // Riga trascinata: si sposta col dito. Le altre: un piccolo margine per
  // segnalare dove finirebbe se rilasciata ora (mai un reflow animato di
  // tutta la lista, troppo costoso da calcolare per un semplice editor).
  const rowStyle = useCallback((i) => {
    if (dragIndex === null) return undefined;
    if (i === dragIndex) {
      return { transform: `translateY(${dragOffset}px)`, position: "relative", zIndex: 10, boxShadow: "0 10px 24px rgba(0,0,0,0.18)" };
    }
    if (i === overIndex) {
      return { borderTop: overIndex < dragIndex ? "2px solid var(--ink)" : undefined, borderBottom: overIndex > dragIndex ? "2px solid var(--ink)" : undefined };
    }
    return undefined;
  }, [dragIndex, overIndex, dragOffset]);

  return { dragIndex, setRowRef, handleProps, rowStyle };
}
