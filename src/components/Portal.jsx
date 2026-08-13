import { createPortal } from "react-dom";

/* Monta i figli direttamente su document.body, fuori dall'albero React del
   componente chiamante. Serve per i popup/modali a position:fixed: se un
   qualunque antenato nell'albero normale ha transform, will-change:transform
   o filter (es. .spring-in, usato per l'animazione d'ingresso di quasi ogni
   schermata), diventa lui il "contenitore" per i figli fixed invece del
   viewport — il popup non appare più centrato ma ancorato a quell'antenato,
   e sembra "spuntare" dove l'utente ha scrollato. Il Portal evita il
   problema alla radice invece di dover tracciare per sempre quali antenati
   hanno un transform. */
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
