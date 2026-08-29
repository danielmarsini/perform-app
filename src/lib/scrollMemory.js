// PERFORM — memoria della posizione di scroll per schermata.
// ============================================================================
// Ricorda dove l'utente era arrivato scrollando (chiave libera, es.
// "tab:home") così tornare su quella schermata — cambio tab, chiusura di
// una vista secondaria, o persino un reload perché il sistema operativo ha
// scaricato la pagina mentre l'app era in background — riparte da lì
// invece che dall'alto.
//
// sessionStorage e non localStorage: deve sopravvivere a un reload dello
// STESSO tab del browser (il caso reale su mobile: iOS/Android scaricano
// la pagina dopo qualche minuto in background e la ricaricano da zero al
// rientro), ma non ha senso che una posizione di scroll di ieri riappaia
// oggi in una sessione nuova.
const KEY_PREFIX = "perform_scroll:";

// Scrivere su sessionStorage a ogni evento scroll (che può sparare decine
// di volte al secondo durante un fling) causerebbe jank — le posizioni
// vengono tenute in memoria e scritte su disco con un piccolo ritardo
// (flush "a raffica"), più subito quando la pagina sta per essere nascosta
// (vedi sotto): è l'unico momento in cui perdere l'ultimo mezzo secondo di
// scroll avrebbe importanza.
let flushTimer = null;
const pending = new Map();

function flush() {
  pending.forEach((y, key) => {
    try { sessionStorage.setItem(KEY_PREFIX + key, String(y)); } catch { /* storage pieno/negato: resta solo in memoria per questa sessione */ }
  });
  pending.clear();
  flushTimer = null;
}

export function saveScrollPosition(key, y) {
  pending.set(key, y);
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 200);
}

export function getScrollPosition(key) {
  if (pending.has(key)) return pending.get(key);
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    return raw != null ? Number(raw) : 0;
  } catch { return 0; }
}

// pagehide/visibilitychange sono gli unici eventi affidabili prima che il
// sistema operativo scarichi la pagina in background — beforeunload non
// arriva sempre su mobile. Flush immediato per non perdere l'ultimo
// scroll non ancora scritto su disco.
if (typeof window !== "undefined") {
  const flushNow = () => { if (flushTimer) { clearTimeout(flushTimer); flush(); } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNow(); });
  window.addEventListener("pagehide", flushNow);
}
