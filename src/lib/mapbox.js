/* ============================================================================
   mapbox.js — GPS su strade reali (Map Matching) + percorsi ad anello
   suggeriti (Directions), entrambi via Mapbox: chiamate dirette dal browser
   con il token PUBBLICO (pk.*, pensato apposta per essere esposto lato
   client — non è un segreto come una chiave Anthropic, non serve un proxy
   server-side). Piano gratuito Mapbox: 100.000 richieste/mese, ampio
   margine per un'app di questa scala.
   ========================================================================== */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export function isMapboxConfigured() {
  return Boolean(MAPBOX_TOKEN);
}

// Corsa/camminata/altro → a piedi; bici → in bici; nuoto non ha "strade" da
// seguire, la mappatura resta null apposta (si salta lo snap, il percorso
// grezzo dei punti GPS resta l'unico dato onesto per un'attività in acqua).
export function mapboxProfileFor(activityId) {
  if (activityId === "bici") return "cycling";
  if (activityId === "nuoto") return null;
  return "walking";
}

// Map Matching accetta al massimo 100 coordinate per richiesta — su una
// corsa lunga con un punto ogni pochi secondi si superano facilmente,
// quindi si campiona in modo uniforme includendo sempre primo e ultimo punto.
function downsample(points, maxCount) {
  if (points.length <= maxCount) return points;
  const step = (points.length - 1) / (maxCount - 1);
  const out = [];
  for (let i = 0; i < maxCount; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/* Prende il percorso grezzo registrato dal GPS (rumoroso: il telefono
   "salta" leggermente anche da fermo) e lo allinea alla rete stradale reale
   via Mapbox Map Matching — lo stesso servizio che usano app come Strava.
   Ritorna null (mai un errore bloccante) se il servizio non è configurato,
   la richiesta fallisce, o Mapbox non trova strade compatibili (es. un
   sentiero sterrato fuori mappa, o troppo pochi punti): in quel caso chi
   chiama tiene il percorso grezzo originale, mai un dato inventato al posto
   di quello reale. */
export async function snapRouteToRoads(points, activityId) {
  const profile = mapboxProfileFor(activityId);
  if (!profile || !isMapboxConfigured() || !points || points.length < 2) return null;

  const sampled = downsample(points, 100);
  const coords = sampled.map((p) => `${p.lng},${p.lat}`).join(";");
  const timestamps = sampled.map((p) => Math.round(p.t / 1000)).join(";");
  const radiuses = sampled.map(() => 25).join(";");
  const url = `https://api.mapbox.com/matching/v5/mapbox/${profile}/${coords}` +
    `?geometries=geojson&overview=full&timestamps=${timestamps}&radiuses=${radiuses}&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.matchings?.[0]?.geometry?.coordinates?.length) return null;
    const coordsOut = data.matchings[0].geometry.coordinates;
    // Rimappa i timestamp originali sui nuovi punti (proporzionalmente):
    // basta per il grafico velocità, non serve precisione al millisecondo.
    return coordsOut.map(([lng, lat], i) => {
      const srcIdx = Math.min(sampled.length - 1, Math.round((i / Math.max(1, coordsOut.length - 1)) * (sampled.length - 1)));
      return { lat, lng, t: sampled[srcIdx]?.t ?? sampled[sampled.length - 1].t };
    });
  } catch (err) {
    console.error("PERFORM: errore Map Matching (allineamento GPS a strada)", err);
    return null;
  }
}

// Punto a distanceKm dal punto dato, nella direzione bearingDeg (0=nord,
// 90=est...) — formula standard del "destination point" su una sfera
// (approssimazione più che sufficiente su distanze di pochi km).
function offsetLatLng({ lat, lng }, distanceKm, bearingDeg) {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const d = distanceKm / R;
  const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing));
  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
    Math.cos(d) - Math.sin(latRad) * Math.sin(newLatRad)
  );
  return { lat: (newLatRad * 180) / Math.PI, lng: (newLngRad * 180) / Math.PI };
}

/* Percorso ad anello suggerito (Premium/Coaching): parte e torna sullo
   stesso punto, lunghezza indicativa distanceKm. Genera 4 punti di passaggio
   disposti circa in cerchio attorno al punto di partenza (raggio scelto
   perché la circonferenza teorica coincida con la distanza richiesta), poi
   chiede a Mapbox Directions il percorso reale su strada che li tocca tutti
   e torna al punto di partenza. Le strade vere non sono mai un cerchio
   perfetto: la distanza ESATTA restituita da Mapbox (mai quella teorica) è
   quella da mostrare sempre all'atleta — bearingSeed cambia i punti di
   passaggio, per proporre un anello diverso a ogni tentativo. */
export async function generateLoopRoute(start, distanceKm, activityId, bearingSeed = Math.random() * 360) {
  const profile = mapboxProfileFor(activityId) || "walking";
  if (!isMapboxConfigured() || !start) return null;

  const radiusKm = distanceKm / (2 * Math.PI);
  const waypoints = [0, 90, 180, 270].map((angle) => offsetLatLng(start, radiusKm, bearingSeed + angle));
  const coordsList = [start, ...waypoints, start];
  const coordsStr = coordsList.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsStr}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates?.length) return null;
    const route = data.routes[0];
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMin: Math.round(route.duration / 60),
    };
  } catch (err) {
    console.error("PERFORM: errore generazione percorso ad anello (Mapbox Directions)", err);
    return null;
  }
}
