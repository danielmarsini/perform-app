/* ============================================================================
   localCache.js — cache "ultimo valore noto" per poter APRIRE scheda di
   allenamento/alimentazione/integrazione anche offline, non solo scriverci
   sopra (quello lo fa già offlineQueue.js).

   Prima di questo file, un fetch fallito per rete assente (es. app aperta
   da zero fuori copertura, o riaperta dopo un riavvio con rete ancora giù)
   lasciava lo stato a null/vuoto — la scheda spariva del tutto, anche se
   l'ultima volta online il cliente l'aveva già vista per intero. localStorage
   (sincrono, a differenza di IndexedDB): basta per un solo blob JSON per
   chiave, letto una volta al mount, mai un vero database.
   ========================================================================== */

const PREFIX = "perform_cache_";

export function readCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    // Storage pieno o non disponibile (privata su alcuni browser): la cache
    // è solo un'ottimizzazione di comodo, mai una scrittura che deve riuscire.
  }
}
