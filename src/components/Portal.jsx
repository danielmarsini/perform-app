import { createPortal } from "react-dom";

/* Monta i figli fuori dall'albero React del componente chiamante, dentro
   .app-root (non document.body). Serve per i popup/modali a position:fixed:
   se un qualunque antenato nell'albero normale ha transform, will-change:
   transform o filter (es. .spring-in, usato per l'animazione d'ingresso di
   quasi ogni schermata), diventa lui il "contenitore" per i figli fixed
   invece del viewport — il popup non appare più centrato ma ancorato a
   quell'antenato, e sembra "spuntare" dove l'utente ha scrollato. Il Portal
   evita il problema alla radice invece di dover tracciare per sempre quali
   antenati hanno un transform.
   BUG PRESO: portava su document.body — fuori da .app-root, che è dove
   DesignSystem (File 4) definisce var(--ink), var(--page), var(--surface)
   ecc. Ogni modale in portale (GPS tracker, scanner barcode, check
   settimanale...) che usava quelle variabili le vedeva risolversi a niente
   (proprietà non ereditata fuori da .app-root), sfondi/testi invisibili in
   silenzio. .app-root non ha un transform proprio, quindi restare suo figlio
   diretto evita comunque il problema di containment originale. */
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  const target = document.querySelector(".app-root") || document.body;
  return createPortal(children, target);
}
