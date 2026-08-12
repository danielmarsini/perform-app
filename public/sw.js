// PERFORM — Service Worker per le notifiche push (streak/promemoria).
// Volutamente minimo: nessuna cache offline, solo push + click sulla
// notifica. Non intercetta fetch — l'app resta online-only come oggi.

self.addEventListener("push", (event) => {
  let data = { title: "PERFORM", body: "Hai una notifica.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // payload non-JSON: ignorato, restano i valori di default sopra
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // Nessuna icona dedicata: il progetto non ha ancora un set di icone PWA
      // reale (nessun favicon/app-icon esiste in public/ ad oggi) — il
      // browser mostra la sua icona di default finché non viene aggiunto.
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
