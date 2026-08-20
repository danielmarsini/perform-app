import React from "react";

/* La barretta grigia in cima ai fogli/modali (come su iOS): comunica DA SOLA
   "questo si trascina per chiudere", senza bisogno di spiegarlo. Va dentro
   l'elemento a cui è agganciato useSwipeDownClose (di solito l'header del
   modale), mai sul solo sfondo — altrimenti la gesture rischia di rubare lo
   scroll a un contenuto lungo dentro il modale. */
export default function SwipeHandle({ dark }) {
  return (
    <div className="flex justify-center pb-2 -mt-1" aria-hidden="true">
      <div style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: dark ? "rgba(255,255,255,0.18)" : "rgba(17,17,17,0.14)" }} />
    </div>
  );
}
