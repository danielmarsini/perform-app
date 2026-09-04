/* ============================================================================
   offlineQueue.js — §07 memo "Verso l'élite" (Mai perdere una serie).

   Wifi di sala pesi scarso, palestra nel seminterrato: una scrittura che
   fallisce per rete assente veniva finora solo loggata in console
   (console.error) e persa per sempre — l'atleta vedeva la spunta "fatta" in
   UI (stato ottimistico) ma il dato non arrivava mai al database.

   NON usa il Background Sync API del Service Worker: Safari/iOS (il target
   primario di questa app, a giudicare da tutti i riferimenti ad Apple
   Salute nel resto del codice) non lo supporta affatto — un service worker
   con background sync sarebbe silenziosamente inefficace per la maggior
   parte degli utenti reali. La coda vive invece in IndexedDB (persiste tra
   sessioni, sopravvive a un refresh) e viene scaricata da codice
   applicativo normale, innescato da eventi affidabili ovunque: al mount,
   quando la rete torna (`online`), quando la scheda torna visibile.

   Nessuna libreria esterna (stesso principio già seguito altrove nel
   progetto per input vocale, drag&drop...): IndexedDB nativo, wrapper
   minimo. Ogni funzione qui sotto è "best-effort e mai fatale": se
   IndexedDB non è disponibile (rara modalità privata di alcuni browser) la
   coda semplicemente non protegge nulla, ma non deve MAI far fallire la
   scrittura che la chiama.
   ========================================================================== */

import { useState, useEffect } from "react";

const DB_NAME = "perform_offline_queue";
const DB_VERSION = 1;
const STORE = "pending_writes";

// Chi mostra "N in attesa di rete" (banner in Home) deve saperlo per OGNI
// tipo di scrittura in coda (serie, pasto, integratore...), scritti da
// componenti diversi e lontani nell'albero — passare una prop in giù da un
// capo all'altro per ognuno sarebbe fragile. Pub/sub minimo invece: chi
// mette o toglie una voce dalla coda notifica, useOfflineQueueCount() sotto
// si ricalcola da solo. Nessuna libreria, stesso IndexedDB di sempre come
// unica fonte di verità (mai uno stato duplicato che può disallinearsi).
const listeners = new Set();
function notifyQueueChanged() { listeners.forEach((fn) => fn()); }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB non disponibile")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Mette in coda una scrittura fallita per rete assente. `type` identifica
// quale funzione la deve rieseguire (vedi flushOfflineQueue), `payload` è
// tutto il necessario per rieseguirla — deve restare serializzabile
// (structured clone di IndexedDB): solo dati semplici, mai un riferimento a
// una funzione o a un client Supabase.
export async function enqueueWrite(type, payload) {
  try {
    const db = await openDb();
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, type, payload, createdAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    notifyQueueChanged();
    return id;
  } catch (err) {
    console.error("PERFORM: impossibile mettere in coda la scrittura offline", err);
    return null;
  }
}

export async function getPendingWrites() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

async function removePendingWrite(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    notifyQueueChanged();
  } catch (err) {
    console.error("PERFORM: impossibile rimuovere una scrittura dalla coda offline", err);
  }
}

// Rimuove dalla coda una scrittura non ancora sincronizzata che soddisfa
// `matches(payload)` — serve per quando l'utente annulla in locale
// un'azione (es. rimuove un alimento appena aggiunto) PRIMA che la coda sia
// riuscita a scaricarla: non ha senso lasciarla lì, verrebbe sincronizzata
// e poi bisognerebbe cancellarla di nuovo. Ritorna true se ha trovato ed
// eliminato qualcosa.
export async function cancelQueuedWrite(type, matches) {
  const pending = await getPendingWrites();
  const hit = pending.find((item) => item.type === type && matches(item.payload));
  if (!hit) return false;
  await removePendingWrite(hit.id);
  return true;
}

// Prova a scaricare la coda: per ogni voce chiama l'handler giusto (in base
// a `type`), la rimuove SOLO se l'handler ha davvero successo — se fallisce
// ancora (rete ancora giù, o un altro errore reale del server) resta in
// coda per il prossimo tentativo, mai persa silenziosamente.
// `handlers` = { [type]: (payload) => Promise<void> }.
export async function flushOfflineQueue(handlers) {
  const pending = await getPendingWrites();
  let synced = 0;
  for (const item of pending) {
    const handler = handlers[item.type];
    if (!handler) continue;
    try {
      await handler(item.payload);
      await removePendingWrite(item.id);
      synced++;
    } catch (err) {
      // Ancora offline o un altro errore reale: resta in coda, si riprova
      // al prossimo giro (online/focus/mount) — nessun log qui, altrimenti
      // ogni tentativo fallito a rete assente spammerebbe la console.
    }
  }
  return { synced, remaining: pending.length - synced };
}

// Contatore reattivo di quante scritture sono in coda in questo momento,
// utilizzabile da QUALSIASI componente (Allenamento, Alimentazione,
// Integrazione — anche lontanissimi tra loro nell'albero) senza dover far
// passare stato/callback da un genitore comune. Si aggiorna da solo a ogni
// enqueue/rimozione grazie al pub/sub sopra.
export function useOfflineQueueCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const recompute = () => getPendingWrites().then((rows) => { if (!cancelled) setCount(rows.length); });
    recompute();
    listeners.add(recompute);
    return () => { cancelled = true; listeners.delete(recompute); };
  }, []);
  return count;
}
