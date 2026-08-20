import { createPortal } from "react-dom";

/* Monta i figli fuori dall'albero React del componente chiamante, dentro il
   <div class="app-root"> di AppShell (non direttamente su document.body).
   Serve per i popup/modali a position:fixed: se un qualunque antenato
   nell'albero normale ha transform, will-change:transform o filter (es.
   .spring-in, usato per l'animazione d'ingresso di quasi ogni schermata),
   diventa lui il "contenitore" per i figli fixed invece del viewport — il
   popup non appare più centrato ma ancorato a quell'antenato, e sembra
   "spuntare" dove l'utente ha scrollato. Il Portal evita il problema alla
   radice invece di dover tracciare per sempre quali antenati hanno un
   transform. .app-root non ha un transform proprio, quindi restare suo
   figlio diretto evita comunque il problema di containment originale.
   App.jsx marca ANCHE <html> con la stessa classe/data-theme (vedi il suo
   useEffect) proprio per far ereditare var(--ink) ecc. a qualsiasi portale
   anche solo su document.body — ma document.querySelector('.app-root') da
   solo trova <html> per primo (essendo precedente nel DOM a <body>), e
   appendere lì un figlio è HTML non valido (fuori da <body>). Si cerca
   quindi prima dentro document.body, così il portale resta dentro <body>
   comunque dentro un antenato con la classe giusta. */
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  const target = document.body?.querySelector(".app-root") || document.body || document.documentElement;
  return createPortal(children, target);
}
