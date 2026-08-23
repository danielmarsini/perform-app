/* ============================================================================
   PERFORM · FILE 5 — HomeDashboard.jsx
   Coach Daniel Marsini

   Estratto dal monolite e riorganizzato. Contiene:
     1. Utilità .............. candele 3D, dischi del bilanciere, auto-split
     2. (sezione libera — News e Tips ora è una pagina dedicata a parte)
     3. MacroTile ............ contatori volumetrici (blu/rosso/giallo/verde)
     4. Window3D ............. le macro-finestre tridimensionali della Home
     5. HomeDashboard ........ dashboard + le sottoschermate (Allenamento FREE
                                con routine libera multi-settimana, Alimentazione
                                con Diario/Target/Dieta Tipo/Sostituzioni,
                                Integrazione e Timing, Recupero)
     6. Anteprima ............ da eliminare in produzione

   Dipende dai token CSS del File 4 (AppShell / DesignSystem).
   ========================================================================== */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Dumbbell, Salad, BedDouble, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ArrowLeft, Plus, X, Search, Barcode, Camera, RefreshCw, Sparkles, ShoppingCart,
  CheckCircle2, Flame, Timer, Droplets, Footprints, Pill, Lock, Route, Trash2,
  Loader2, AlertTriangle,
} from "lucide-react";
import { fetchBothNutritionTargets, fetchAssignedWorkouts, fetchExerciseHistory, fetchWorkoutSets, logWorkoutSet, fetchPrescribedSupplements, computeTrainingCompliance, computeRecoveryCompliance, computeNutritionCompliance, fetchDailyMetricsRange, upsertDailyMetrics, fetchNutritionLogsForDate, addNutritionLogItem, removeNutritionLogItem, updateNutritionLogItem, computeRealXpAndStreak, xpToLevelInfo, saveCheckin, fetchCheckins, uploadCheckinPhoto, requestPause, fetchActivePause, fetchCardioLogs, addCardioLog, deleteCardioLog, computeVolume, MUSCLES as VOLUME_MUSCLES, DEFAULT_EXERCISE_LIB, fetchExerciseLibrary, learnExercise, DB_MUSCLE_TO_CHART, parseRepsTarget, fetchCustomFoods, learnCustomFood } from "../lib/coachingData.js";
import { useEdgeSwipeBack, useSwipeDownClose } from "../lib/useSwipeGesture.js";
import { haptic } from "../lib/haptics.js";
import { isMapboxConfigured, snapRouteToRoads, generateLoopRoute } from "../lib/mapbox.js";
import Portal from "./Portal.jsx";
import SwipeHandle from "./SwipeHandle.jsx";
import { isAndroid, isGoogleFitConfigured, syncTodayStepsFromGoogleFit, isGoogleFitConnected } from "../lib/googleFit.js";
// Leaflet + OpenStreetMap: mappa del percorso reale, gratuita e senza
// chiave API (nessun account Google Maps da pagare/gestire) — stesso
// principio già scelto per Open Food Facts e PubMed in questa app. Il CSS
// è leggero (pochi KB) quindi statico; il JS (~150KB) si carica solo
// quando una mappa serve davvero (import dinamico, vedi RouteMap sotto).
import "leaflet/dist/leaflet.css";
// @zxing/browser (~450 KB) è importato SOLO quando il mirino barcode si apre
// davvero (import() dinamico dentro BarcodeScannerModal), non nel bundle
// principale: la stragrande maggioranza delle sessioni non lo usa mai.

/* ============================================================================
   0 · NOTA — l'header istituzionale (logo, marchio "PERFORM", firma) è
   gestito centralmente da 04_AppShell.jsx: qui non viene più duplicato.
   ========================================================================== */

/* ============================================================================
   1 · UTILITÀ
   ========================================================================== */

export const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/* "Oggi" (o qualunque Date) in formato YYYY-MM-DD LOCALE, mai da
   toISOString() — che converte sempre in UTC e sposta la data di un giorno
   indietro per chiunque sia in un fuso orario positivo (Italia inclusa) nelle
   ore vicine alla mezzanotte locale. getFullYear()/getMonth()/getDate()
   restano sempre nel fuso del browser, quindi rappresentano davvero il
   calendario che l'utente ha sotto gli occhi — coerente col cliente che
   compila "oggi" nella scheda assegnata dal coach. */
function toLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Lunedì della settimana di `date` (default oggi), in locale — stessa identica
// logica di mondayOf/weekDatesFrom lato coach (09_CoachDashboard.jsx /
// coachingData.js), duplicata qui per lo stesso motivo di toLocalISODate: non
// introdurre un nuovo accoppiamento tra i due moduli per un helper di poche righe.
function mondayOfLocal(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}
function weekDatesFromLocal(mondayDate) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    return toLocalISODate(d);
  });
}

// Finestra dello storico sonno/passi in Recupero e Attività — stessa
// lunghezza della demo simulata (simulateSeries(...,49,...)) così il layout
// del grafico non cambia, solo la fonte dei numeri.
const HISTORY_DAYS = 49;
// I `HISTORY_DAYS` giorni fino a ieri (oggi arriva a parte via liveHistory),
// dal più vecchio al più recente — stesso ordine che si aspetta CandleChart.
function pastDatesUntilYesterday(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - i));
    return toLocalISODate(d);
  });
}

export const MACRO_COLORS = {
  kcal: { light: "#7DB8FF", base: "#2563EB", dark: "#1A3FA8" }, // Calorie · blu
  p:    { light: "#FF9A9A", base: "#DC2626", dark: "#8F1414" }, // Proteine · rosso
  c:    { light: "#FFD97A", base: "#F0A020", dark: "#A65E06" }, // Carboidrati · giallo
  f:    { light: "#7BEBA6", base: "#16A34A", dark: "#0D6B33" }, // Grassi · verde
};

/* Soglie dei colori delle candele: modificabili dalla console del coach.
   invert:true = valori più bassi sono migliori (es. RHR: meno battiti a riposo
   è meglio), quindi "bad" è il limite superiore da non superare. */
export const THRESH = {
  sleep: { bad: 6,    mid: 7.5,   fmt: (v) => `${v.toFixed(1)}h`, gridStep: 2 },
  steps: { bad: 8000, mid: 10000, fmt: (v) => `${(v / 1000).toFixed(1)}k`, gridStep: 5000 },
  hrv:   { bad: 40,   mid: 60,    fmt: (v) => `${Math.round(v)}ms`, gridStep: 20 },
  rhr:   { bad: 75,   mid: 65,    fmt: (v) => `${Math.round(v)}bpm`, invert: true, gridStep: 20 },
};

// Colore continuo (stessa curva a semaforo dei cerchi di compliance,
// complianceHsl più sotto) invece dei 3 blocchi netti rosso/arancio/verde:
// una progressione fluida rosso acceso → rosso spento → arancio → arancio
// chiaro → giallo → verde → verde acceso man mano che il valore sale.
// Per rhr (invert: più basso è meglio) la scala è specchiata.
function chart3dPct(kind, v) {
  const t = THRESH[kind];
  if (t.invert) {
    if (v >= t.bad) return 0;
    if (v >= t.mid) return 55 * (t.bad - v) / (t.bad - t.mid || 1);
    const span = t.mid * 0.4 || 1;
    return Math.min(100, 55 + 45 * Math.min(1, (t.mid - v) / span));
  }
  if (v <= 0) return 0;
  if (v < t.bad) return 55 * (v / t.bad);
  if (v < t.mid) return 55 + 30 * (v - t.bad) / (t.mid - t.bad || 1);
  const span = t.mid * 0.3 || 1;
  return Math.min(100, 85 + 15 * Math.min(1, (v - t.mid) / span));
}

const CANDLE = {
  bad:  { top: "#F87171", mid: "#EF4444", dark: "#B91C1C", label: "#DC2626" },
  warn: { top: "#FBBF24", mid: "#F0A020", dark: "#B45309", label: "#B45309" },
  good: { top: "#34D399", mid: "#10B981", dark: "#047857", label: "#10B981" },
};

const grade = (kind, v) => {
  const t = THRESH[kind];
  return t.invert
    ? (v >= t.bad ? "bad" : v >= t.mid ? "warn" : "good")
    : (v < t.bad ? "bad" : v < t.mid ? "warn" : "good");
};

/* Transizione fluida: quando lo stato collegato cambia (es. i passi da 5.000
   a 12.000), la barra si alza/abbassa e ricolora da sola in tempo reale,
   senza librerie esterne — solo CSS transition su attributi SVG animabili. */
const CANDLE_TRANSITION = "y 0.5s cubic-bezier(0.22,1,0.36,1), height 0.5s cubic-bezier(0.22,1,0.36,1), fill 0.3s ease";

/* Istogramma 2D piatto, stile App Salute di Apple: barre sottili arrotondate,
   nessun effetto 3D/lucido, testi grandi e ad alto contrasto, niente scroll:
   entra sempre intero nella larghezza dello schermo. */
export function CandleChart({ kind, data, labels }) {
  const t = THRESH[kind];
  const vals = data.map((d) => Number(d) || 0);
  const max = Math.max(t.bad, t.mid) * 1.25 || Math.max(1, ...vals);
  const W = 320, H = 128, bw = 28;
  const pad = 12, baseY = H - 24;
  const gap = vals.length > 1 ? (W - pad * 2 - bw * vals.length) / (vals.length - 1) : 0;
  const yOf = (v) => baseY - (Math.min(v, max) / max) * (baseY - 22);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Andamento ${kind} per giorno`}>
      <line x1={pad - 4} y1={baseY} x2={W - pad + 4} y2={baseY} style={{ stroke: "var(--line)" }} strokeWidth="1" />
      {vals.map((v, i) => {
        const x = pad + i * (bw + gap);
        const y = yOf(v);
        const h = Math.max(3, baseY - y);
        const g = grade(kind, v);
        return (
          <g key={i} className="candle-rise" style={{ transformOrigin: `${x + bw / 2}px ${baseY}px`, animationDelay: `${i * 60}ms` }}>
            <rect x={x} y={y} width={bw} height={h} rx="2"
                  style={{ fill: CANDLE[g].mid, transition: CANDLE_TRANSITION }} />
            <text x={x + bw / 2} y={Math.max(14, y - 8)} textAnchor="middle" fontSize="13" fontWeight="700"
                  style={{ fill: CANDLE[g].label, transition: "y 0.5s cubic-bezier(0.22,1,0.36,1), fill 0.3s ease" }}>
              {v > 0 ? t.fmt(v) : "—"}
            </text>
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="600"
                  style={{ fill: "var(--ink-3)" }}>{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function periodAverage(arr) {
  const valid = arr.filter((v) => v > 0);
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/* Wrapper con navigazione a settimane/mesi e medie, come nell'app Salute di
   iPhone: si scorre indietro nel tempo, con media settimanale o mensile. */
/* Drag-to-scroll: l'atleta trascina col dito o col mouse per esplorare
   liberamente lo storico, non solo con la scrollbar/trackpad. */
function useDragScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let isDown = false, startX = 0, startScroll = 0;
    const pointerX = (e) => (e.touches ? e.touches[0].pageX : e.pageX);
    const down = (e) => { isDown = true; el.style.cursor = "grabbing"; startX = pointerX(e); startScroll = el.scrollLeft; };
    const stop = () => { isDown = false; el.style.cursor = "grab"; };
    const move = (e) => {
      if (!isDown) return;
      if (!e.touches) e.preventDefault();
      el.scrollLeft = startScroll - (pointerX(e) - startX) * 1.15;
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseleave", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mousemove", move);
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", stop);
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("mousedown", down);
      el.removeEventListener("mouseleave", stop);
      el.removeEventListener("mouseup", stop);
      el.removeEventListener("mousemove", move);
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchend", stop);
      el.removeEventListener("touchmove", move);
    };
  }, [ref]);
}

/* Grafico 3D idro-satinato Minimal Luxury: prismi in vetro (Glassmorphism),
   contorni ultrasottili lucidi, gradiente cangiante oro/rosa in movimento
   continuo, scorrimento libero e continuo (swipe/drag) su tutto lo storico. */
const BAR_H = 176; // altezza dell'area candele — le righe soglia e il calcolo hPct condividono questo numero

function Chart3D({ kind, series, title, onEditDay }) {
  const scrollRef = useRef(null);
  useDragScroll(scrollRef);
  // Modifica di un giorno passato: può capitare di scordarsi di inserire
  // sonno/passi lo stesso giorno — cliccando la candela di un giorno già
  // passato si può correggere il valore direttamente da qui, invece di
  // restare bloccati con uno storico sbagliato per sempre. "Oggi" non è
  // modificabile da qui: ha già i suoi campi di inserimento sopra al grafico.
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  // Le candele sono ora anche pulsanti cliccabili (per il dettaglio del
  // valore): senza questa guardia, un trascinamento per scorrere lo
  // storico (useDragScroll) faceva scattare anche un click spurio sulla
  // candela sotto il dito/cursore al rilascio. Sopra 6px di movimento non
  // è più considerato un tap.
  const dragStart = useRef(null);
  const onPointerDownBar = (e) => { dragStart.current = "touches" in e ? e.touches[0].clientX : e.clientX; };
  const onClickBar = (i, setter) => (e) => {
    const start = dragStart.current;
    const end = "clientX" in e ? e.clientX : start;
    dragStart.current = null;
    if (start != null && Math.abs(end - start) > 6) return; // trascinamento, non un tap
    setter(i);
  };
  const t = THRESH[kind];
  const maxVal = Math.max(...series, t.mid * 1.15, 1);
  // Nessuna selezione = mostra il valore di oggi (ultimo della serie), come
  // prima. Un click su una candela fissa quel giorno finché non se ne
  // clicca un altro — "se clicco su una candela mostra preciso quanti
  // passi/ore ho fatto".
  const [selectedIdx, setSelectedIdx] = useState(null);
  useEffect(() => { setSelectedIdx(null); }, [series.length]); // nuovo giorno arrivato: torna a mostrare "oggi"
  useEffect(() => { setEditing(false); }, [selectedIdx]); // cambio candela: chiudi un editor eventualmente aperto

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [series.length]);

  const dateLabelFor = (idxFromEnd) => {
    if (idxFromEnd === 0) return "Oggi";
    if (idxFromEnd === 1) return "Ieri";
    const d = new Date();
    d.setDate(d.getDate() - idxFromEnd);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const dateIsoFor = (idxFromEnd) => {
    const d = new Date();
    d.setDate(d.getDate() - idxFromEnd);
    return toLocalISODate(d);
  };

  // Piano cartesiano vero, stile app Salute di iPhone: righe orizzontali a
  // intervalli regolari (5k/10k/15k passi, ogni 2h di sonno...) con la
  // scala etichettata, non solo due soglie isolate — così si legge il
  // valore assoluto a colpo d'occhio, non solo "sopra o sotto obiettivo".
  const gridPct = (v) => Math.max(0, Math.min(100, (v / maxVal) * 100));
  const niceMax = Math.ceil(maxVal / t.gridStep) * t.gridStep;
  const gridLines = [];
  for (let v = t.gridStep; v <= niceMax && gridLines.length < 5; v += t.gridStep) gridLines.push(v);

  const activeIdx = selectedIdx ?? series.length - 1;
  const activeIdxFromEnd = series.length - 1 - activeIdx;
  const activeVal = series[activeIdx] || 0;

  return (
    <div className="relative rounded-2xl p-4 overflow-hidden"
         style={{ backgroundColor: "var(--glass)", backdropFilter: "blur(16px) saturate(160%)",
                  WebkitBackdropFilter: "blur(16px) saturate(160%)",
                  border: "0.5px solid var(--glass-line)", boxShadow: "0 12px 34px rgba(0,0,0,0.14)" }}>
      {/* Etichetta esplicita: prima i due grafici (sonno/passi) erano
          identici nella forma e distinguibili solo dal contesto sopra —
          poco chiaro, specie scorrendo velocemente. */}
      {title && (
        <p className="font-data mb-3" style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-2)", letterSpacing: "0.02em" }}>
          {title}
        </p>
      )}
      {/* Finestra fissa a 7 giorni visibili, candele che riempiono tutta la
          larghezza reale della card. Lo storico resta raggiungibile
          scorrendo indietro col dito/mouse (useDragScroll) quando ci sono
          più di 7 giorni di dati. */}
      <div ref={scrollRef} className="relative flex items-end gap-2.5 overflow-x-auto"
           style={{ cursor: "grab", scrollBehavior: "smooth", width: "100%" }}>
        {/* Griglia cartesiana: righe orizzontali regolari ed etichettate,
            sotto alle candele — mai solo 1-2 soglie isolate. */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ height: BAR_H, top: 0 }}>
          {gridLines.map((v) => (
            <div key={v} className="absolute inset-x-0" style={{ bottom: `${gridPct(v)}%`,
                   borderTop: "1px solid rgba(255,255,255,0.14)" }}>
              <span className="font-data absolute right-0" style={{ top: -12, fontSize: "0.46rem", color: "var(--ink-3)", opacity: 0.75, whiteSpace: "nowrap" }}>
                {t.fmt(v)}
              </span>
            </div>
          ))}
        </div>
        {series.map((v, i) => {
          const idxFromEnd = series.length - 1 - i;
          const hPct = v > 0 ? Math.max(6, Math.min(100, (v / maxVal) * 100)) : 3;
          // Colore continuo a semaforo (stessa curva dei cerchi di
          // compliance): sfuma gradualmente rosso→arancio→giallo→verde
          // man mano che il valore sale, mai un salto netto di colore.
          const { h, s, l } = complianceHsl(chart3dPct(kind, v));
          const tone = {
            top: `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${Math.min(100, l + 16).toFixed(0)}%)`,
            mid: `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`,
            dark: `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${Math.max(0, l - 14).toFixed(0)}%)`,
          };
          const isActive = i === activeIdx;
          return (
            <button key={i} onMouseDown={onPointerDownBar} onTouchStart={onPointerDownBar} onClick={onClickBar(i, setSelectedIdx)}
                    className="relative shrink-0 flex flex-col items-center" style={{ width: "calc((100% - 60px) / 7)", minWidth: 34 }}>
              <div style={{ height: BAR_H, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                {/* Barra più sottile (stile Salute di iPhone): non riempie
                    più tutta la colonna, solo il 58% centrato — prima
                    risultava "cicciotta". */}
                <div className="relative overflow-hidden" style={{ width: "58%", height: `${hPct}%`, borderRadius: 5,
                       background: `linear-gradient(180deg, ${tone.top} 0%, ${tone.mid} 45%, ${tone.dark} 100%)`,
                       border: isActive ? "1.5px solid rgba(255,255,255,0.9)" : "0.5px solid rgba(255,255,255,0.55)",
                       boxShadow: `0 4px 12px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)` }}>
                  <div className="absolute inset-x-0 top-0" style={{ height: "35%",
                         background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))" }} />
                  {/* Brillantezza dal basso verso l'alto (era da sinistra a destra) */}
                  <div className="chart3d-sheen absolute inset-x-0" style={{ height: "45%",
                         background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.4), transparent)" }} />
                </div>
              </div>
              <span className="font-data" style={{ fontSize: "0.58rem", fontWeight: isActive ? 800 : 600, color: isActive ? "var(--ink)" : "var(--ink-3)", marginTop: 6, whiteSpace: "nowrap" }}>
                {dateLabelFor(idxFromEnd)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          <span className="font-data" style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--ink)" }}>
            {t.fmt(activeVal)}
          </span>
          <span className="meta ml-1.5" style={{ fontSize: "0.72rem" }}>
            {selectedIdx == null ? "oggi" : dateLabelFor(activeIdxFromEnd) === "Oggi" || dateLabelFor(activeIdxFromEnd) === "Ieri" ? dateLabelFor(activeIdxFromEnd).toLowerCase() : dateLabelFor(activeIdxFromEnd)}
          </span>
        </div>
        {/* Modifica: solo su un giorno PASSATO selezionato (mai "oggi", che
            ha già i suoi campi di inserimento sopra al grafico) — per
            correggere un giorno dimenticato senza restare bloccati con uno
            storico sbagliato per sempre. */}
        {onEditDay && activeIdxFromEnd > 0 && !editing && (
          <button onClick={() => { setEditValue(String(activeVal)); setEditing(true); }}
            className="shrink-0 text-xs rounded-full px-3 py-1.5"
            style={{ backgroundColor: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "var(--ink-2)", fontWeight: 600 }}>
            Modifica
          </button>
        )}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-2.5">
          <input type="number" min="0" step={kind === "sleep" ? "0.5" : "1"} inputMode="decimal" value={editValue}
            onChange={(e) => setEditValue(e.target.value)} autoFocus
            className="input flex-1 min-w-0 px-3 py-2 text-sm font-data" aria-label={`Correggi ${dateLabelFor(activeIdxFromEnd)}`} />
          <button onClick={() => { onEditDay(dateIsoFor(activeIdxFromEnd), Number(editValue) || 0); setEditing(false); }}
            className="shrink-0 rounded-full px-3.5 py-2 text-xs transition-transform active:scale-95"
            style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
            Salva
          </button>
          <button onClick={() => setEditing(false)} className="shrink-0 rounded-full px-3 py-2 text-xs" style={{ color: "var(--ink-2)" }}>
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

/* Sync passi reale da Google Fit, solo Android — vedi googleFit.js per il
   perché non è "automatica" al 100% (token in sessionStorage, non un
   refresh token lato server): un tap per sessione, non un numero da
   digitare a mano ogni giorno. */
function GoogleFitStepsSync({ accent, onSetSteps }) {
  const [connected, setConnected] = useState(() => isGoogleFitConnected());
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const doSync = () => {
    setSyncing(true);
    setError("");
    syncTodayStepsFromGoogleFit()
      .then((steps) => { onSetSteps(String(steps)); setConnected(true); })
      .catch((err) => setError(err.message || "Sincronizzazione non riuscita."))
      .finally(() => setSyncing(false));
  };

  return (
    <div className="inner px-4 py-3.5 mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>Google Fit</p>
        <p className="meta mt-0.5 leading-relaxed">
          {connected ? "Collegato — tocca per aggiornare i passi di oggi" : "Un tap per leggere i passi di oggi, senza inserirli a mano"}
        </p>
        {error && <p className="mt-1" style={{ fontSize: "0.72rem", color: "#B91C1C" }}>{error}</p>}
      </div>
      <button onClick={doSync} disabled={syncing}
              className="shrink-0 rounded-full px-3.5 py-2 text-xs disabled:opacity-60"
              style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
        {syncing ? "…" : connected ? "Aggiorna" : "Collega"}
      </button>
    </div>
  );
}

function HistoryChart({ kind, series, todayWeekday, accent }) {
  const [mode, setMode] = useState("week"); // week | month
  const [offset, setOffset] = useState(0);  // 0 = settimana corrente, N = N settimane fa
  const t = THRESH[kind];

  const total = series.length;
  const weeksTotal = Math.floor(total / 7);

  const end = total - offset * 7;
  const start = Math.max(0, end - 7);
  const weekData = series.slice(start, end);
  const weekLabels = weekData.map((_, i) => {
    const idx = start + i;
    const daysAgo = total - 1 - idx;
    if (daysAgo === 0) return "OGGI";
    const wd = ((todayWeekday - daysAgo) % 7 + 7) % 7;
    return WEEK_DAYS[wd].slice(0, 1);
  });
  const weekAvg = periodAverage(weekData);

  const monthlyBuckets = [];
  for (let w = 0; w < weeksTotal; w++) {
    const s = total - (w + 1) * 7, e = total - w * 7;
    monthlyBuckets.push(periodAverage(series.slice(Math.max(0, s), e)));
  }
  monthlyBuckets.reverse();
  const monthlyLabels = monthlyBuckets.map((_, i) => `S${i + 1}`);
  const monthAvg = periodAverage(monthlyBuckets);

  const canOlder = offset < weeksTotal - 1;
  const canNewer = offset > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="inline-flex rounded-full overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {[["week", "Settimana"], ["month", "Mese"]].map(([id, lab]) => (
            <button key={id} onClick={() => setMode(id)} className="px-3 py-1.5 text-xs"
              style={mode === id ? { backgroundColor: "var(--ink)", color: "var(--page)", fontWeight: 700 }
                                  : { color: "var(--ink-2)", fontWeight: 500 }}>
              {lab}
            </button>
          ))}
        </div>
        {mode === "week" && (
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset((o) => Math.min(weeksTotal - 1, o + 1))} disabled={!canOlder}
                    aria-label="Settimana precedente" className="p-1 disabled:opacity-30">
              <ChevronLeft size={16} style={{ color: "var(--ink-2)" }} />
            </button>
            <span className="text-xs" style={{ color: "var(--ink-2)", minWidth: 92, textAlign: "center" }}>
              {offset === 0 ? "Questa settimana" : `${offset} settiman${offset === 1 ? "a" : "e"} fa`}
            </span>
            <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={!canNewer}
                    aria-label="Settimana successiva" className="p-1 disabled:opacity-30">
              <ChevronRight size={16} style={{ color: "var(--ink-2)" }} />
            </button>
          </div>
        )}
      </div>
      <CandleChart kind={kind} data={mode === "week" ? weekData : monthlyBuckets}
                   labels={mode === "week" ? weekLabels : monthlyLabels} />
      <p className="text-sm mt-2" style={{ color: "var(--ink)", fontWeight: 700 }}>
        {mode === "week" ? `Media settimanale: ${weekAvg ? t.fmt(weekAvg) : "—"}` : `Media mensile: ${monthAvg ? t.fmt(monthAvg) : "—"}`}
      </p>
    </div>
  );
}

/* Blocco Laboratorio Analitico: al posto del grafico storico, per i profili
   FREE. Vetro sfocato (glassmorphism) + lucchetto oro (uomo) o rosa (donna),
   coerente col sistema di gradiente animato del brand. */
function LockedChartOverlay({ gender, onUpgrade, title, text }) {
  const isFemale = gender === "F";
  const lockGradient = isFemale
    ? "linear-gradient(135deg, #E5C1CD, #C896A6)"
    : "linear-gradient(135deg, #D4AF37, #AA7C11)";
  const glow = isFemale ? "rgba(200,150,166,0.5)" : "rgba(170,124,17,0.5)";
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: 172 }}>
      {/* sagoma sfocata del grafico dietro, per dare l'idea di ciò che si sblocca */}
      <div className="absolute inset-0" style={{ backgroundColor: "var(--surface-2)", filter: "blur(7px)", opacity: 0.7 }} />
      <div className="absolute inset-0"
           style={{ backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)",
                    backgroundColor: "rgba(255,255,255,0.05)" }} />
      <div className="relative flex flex-col items-center justify-center text-center px-6 py-8" style={{ minHeight: 172 }}>
        <span className="inline-flex items-center justify-center rounded-full mb-3"
              style={{ width: 52, height: 52, background: lockGradient, boxShadow: `0 8px 22px -4px ${glow}` }}>
          <Lock size={22} style={{ color: "#FFFFFF" }} />
        </span>
        <p style={{ color: "var(--ink)", fontSize: "0.85rem", fontWeight: 800, letterSpacing: "0.01em", marginBottom: 8 }}>
          {title || "🔒 SBLOCCA IL LABORATORIO ANALITICO"}
        </p>
        <p className="body mb-4" style={{ fontSize: "0.8rem", maxWidth: 300 }}>
          {text || "Passa al Performance Pack (€5/mese) per analizzare i tuoi grafici storici stile Apple Salute e monitorare il recupero del Sistema Nervoso."}
        </p>
        <button onClick={onUpgrade} className="rounded-full px-5 py-2.5 text-sm transition-transform active:scale-95 btn-3d"
                style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
          Scopri il Performance Pack →
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   MICRONUTRIENTI — 5 barre satinate con target reale e consigli immediati
   ========================================================================== */

const MICRO_TARGETS = { na: 2300, k: 3500, fe: 18, ca: 1000, mg: 400 };
const MICRO_LABELS = { na: "Sodio", k: "Potassio", fe: "Ferro", ca: "Calcio", mg: "Magnesio" };
const MICRO_TIPS = {
  na: "Aggiungi una bustina di sale o del brodo ai pasti, soprattutto nelle giornate calde o molto sudate.",
  k: "Inserisci patate, banane o spinaci in uno dei prossimi pasti per ottimizzare la pienezza muscolare e il pump.",
  fe: "Carne rossa magra, legumi o spinaci: il ferro è centrale per il trasporto di ossigeno ai muscoli.",
  ca: "Yogurt, latte o mandorle possono colmare rapidamente il deficit di calcio di oggi.",
  mg: "Mandorle, avena o cacao amaro sono fonti dense di magnesio, utile anche per recupero e sonno.",
};

/* Somma i micronutrienti di tutti gli alimenti già inseriti nel diario di oggi
   (na/k/fe/ca/mg sono già scalati sui grammi al momento dell'inserimento). */
/* Residuo fisso minerale tipico di un'acqua oligominerale standard, per litro:
   ogni bicchiere segnato somma Calcio e Magnesio in diretta alle 5 barre. */
const WATER_MINERALS_PER_L = { ca: 40, mg: 10 };

function computeMicroTotals(mealsBySlot, waterMl = 0) {
  const totals = { na: 0, k: 0, fe: 0, ca: 0, mg: 0 };
  Object.values(mealsBySlot || {}).flat().forEach((item) => {
    totals.na += item.na || 0;
    totals.k += item.k || 0;
    totals.fe += item.fe || 0;
    totals.ca += item.ca || 0;
    totals.mg += item.mg || 0;
  });
  const liters = (waterMl || 0) / 1000;
  totals.ca += liters * WATER_MINERALS_PER_L.ca;
  totals.mg += liters * WATER_MINERALS_PER_L.mg;
  return totals;
}

function MicroBar({ id, value, target, accent }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const low = pct < 50;
  return (
    <div className="rounded-2xl p-3.5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ color: "var(--ink-2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.68rem" }}>
          {MICRO_LABELS[id]}
        </span>
        <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--ink)" }}>
          {Math.round(value)}mg <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>/ {target}mg</span>
        </span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: "var(--surface)" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999,
                       background: `linear-gradient(90deg, ${accent}99, ${accent})`,
                       transition: "width 0.6s cubic-bezier(.22,1,.36,1)" }} />
      </div>
      {low && (
        <p className="mt-2" style={{ fontSize: "0.68rem", color: "#B45309", fontWeight: 600, lineHeight: 1.4 }}>
          ⚠ Carenza {MICRO_LABELS[id]}: {MICRO_TIPS[id]}
        </p>
      )}
    </div>
  );
}

/* Griglia dei 5 micronutrienti — sblocco a 3 livelli:
   · FREE → bloccata, upgrade a Performance Pack.
   · Full Coaching → sbloccata sempre, inclusa nel piano.
   · Performance Pack → sbloccata sempre (invariato, è il piano che vende
     proprio i grafici avanzati).
   · Scheda Personalizzata / Solo Allenamento Coaching → NON inclusa: è un
     componente aggiuntivo a pagamento separato (micro_addon su profiles,
     lo attiva il coach quando il cliente lo richiede/paga), diverso dal
     semplice upgrade di piano — copy e CTA dedicate. */
function MicronutrientGrid({ mealsBySlot, userPlan, gender, onUpgrade, accent, waterMl, microAddon }) {
  if (userPlan === "free") {
    return (
      <div className="mt-4">
        <p className="label mb-2">Micronutrienti · target giornaliero</p>
        <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
          title="🔒 SBLOCCA IL LABORATORIO CHIMICO CELLULARE"
          text="Passa al Performance Pack (€5/mese) per sbloccare l'analisi in tempo reale di Sodio, Potassio, Ferro, Calcio e Magnesio. Monitora le tue carenze croniche ed ottieni i consigli AI per prevenire crampi, ritenzione idrica sotto la pelle e svuotamento muscolare in palestra." />
      </div>
    );
  }
  const needsAddon = (userPlan === "scheda_personalizzata" || userPlan === "training") && !microAddon;
  if (needsAddon) {
    return (
      <div className="mt-4">
        <p className="label mb-2">Micronutrienti · target giornaliero</p>
        <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
          title="🔒 COMPONENTE AGGIUNTIVO"
          text="L'analisi di Sodio, Potassio, Ferro, Calcio e Magnesio non è inclusa nel tuo piano: è un componente a parte. Parlane con il tuo coach per attivarlo." />
      </div>
    );
  }
  const totals = computeMicroTotals(mealsBySlot, waterMl);
  return (
    <div className="mt-4">
      <p className="label mb-2">Micronutrienti · target giornaliero</p>
      <div className="grid grid-cols-1 gap-2.5">
        {["na", "k", "fe", "ca", "mg"].map((id) => (
          <MicroBar key={id} id={id} value={totals[id]} target={MICRO_TARGETS[id]} accent={accent} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   MATRICE DEI VOLUMI — disponibile per tutti: FREE che si scrive la scheda,
   atleta in Coaching, e il coach quando la modifica. Un ciclo istantaneo a
   ogni esercizio inserito calcola lo stimolo settimanale reale per distretto:
   serie dirette al 100% + serie sui sinergici al 50%.
   ========================================================================== */

/* BUG PRESO: questo grafico indovinava il gruppo muscolare con un regex sul
   NOME dell'esercizio (spesso sbagliato, o "Generico"), scollegato dal
   calcolo vero usato lato coach (EXERCISE_LIB + muscoli scelti a mano) — un
   cliente vedeva un volume diverso da quello che il coach aveva davvero
   impostato. Ora usa computeVolume (coachingData.js), la STESSA identica
   funzione del pannello coach: stessi nomi di distretto (MUSCLES, brevi),
   stesso calcolo diretto 100%/sinergici 50%, mai due fonti di verità. */

/* Barra lucida a due segmenti, colore brand oro/rosa (accent) invece del
   semaforo rosso/arancio/verde: segmento pieno per le serie dirette,
   segmento più chiaro/trasparente aggiunto in coda per le serie indirette
   sullo stesso distretto — "prendendo la funzionalità di quello del coach
   e la grafica di quello dei clienti", richiesta esplicita. */
export function VolumeBar({ muscle, direct, indirect, accent }) {
  const total = direct + indirect;
  const maxScale = 30;
  const dPct = Math.max(0, Math.min(100, (direct / maxScale) * 100));
  const iPct = Math.max(0, Math.min(100 - dPct, (indirect / maxScale) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs shrink-0 truncate" style={{ width: 92, color: "var(--ink)", fontWeight: 600 }}>{muscle}</span>
      <div className="flex-1 relative rounded-full overflow-hidden flex" style={{ height: 16, backgroundColor: "var(--surface-2)" }}>
        {dPct > 0 && (
          <div className="h-full relative overflow-hidden shrink-0" style={{ width: `${dPct}%`,
                 background: `linear-gradient(180deg, ${accent}, ${accent}CC)`,
                 boxShadow: `0 2px 6px ${accent}66`,
                 transition: "width 0.6s cubic-bezier(.22,1,.36,1)" }}>
            <div className="absolute inset-x-0 top-0" style={{ height: "45%",
                   background: "linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0))" }} />
          </div>
        )}
        {iPct > 0 && (
          <div className="h-full shrink-0" style={{ width: `${iPct}%`, backgroundColor: `${accent}4D`,
                 transition: "width 0.6s cubic-bezier(.22,1,.36,1)" }} />
        )}
      </div>
      <span className="text-xs shrink-0 text-right" style={{ width: 34, color: accent, fontWeight: 800 }}>
        {Number.isInteger(total) ? total : total.toFixed(1)}
      </span>
    </div>
  );
}

/* Card completa della Matrice dei Volumi: mostra solo i distretti realmente
   coinvolti questa settimana, ordinati anatomicamente. */
function VolumeMatrixCard({ weekDays, userPlan, gender, onUpgrade, accent: accentProp, supabase, userId, libOverride }) {
  const accent = accentProp || (gender === "F" ? "#D4A5A5" : "#C5A059");
  const isRealMode = Boolean(supabase && userId);
  // Libreria condivisa reale (SCHEMA_v39): stessa fonte usata dal coach.
  // In demo/anteprima resta il default statico, mai una chiamata di rete.
  // libOverride: se un antenato l'ha già caricata (es. FreeWorkoutBuilder,
  // che la riusa anche per l'assegnazione muscoli in DayEditor), niente
  // seconda chiamata di rete ridondante.
  const [lib, setLib] = useState(DEFAULT_EXERCISE_LIB);
  useEffect(() => {
    if (!isRealMode || libOverride) return;
    fetchExerciseLibrary(supabase).then(setLib)
      .catch((err) => console.error("PERFORM: errore caricamento libreria esercizi", err));
  }, [isRealMode, supabase, libOverride]);

  const volume = useMemo(() => computeVolume(weekDays, libOverride || lib), [weekDays, lib, libOverride]);
  const involved = VOLUME_MUSCLES.filter((m) => volume[m].direct + volume[m].indirect > 0);

  return (
    <div className="card mb-4">
      <p className="label mb-1">Matrice dei Volumi</p>
      <p className="h1 mb-1">Stimolo settimanale reale</p>
      <p className="body mb-4">
        Ricalcolata a ogni esercizio inserito: serie dirette al 100% (barra piena), serie sui distretti sinergici al 50% (barra chiara).
      </p>

      {userPlan === "free" ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {VOLUME_MUSCLES.map((m) => (
              <span key={m} className="rounded-full px-2.5 py-1 text-xs"
                    style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>
                {m}
              </span>
            ))}
          </div>
          <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
            title="🔒 SBLOCCA LA PLANCIA ANALITICA DEI VOLUMI"
            text="Passa al Performance Pack (€5/mese) per vedere l'istogramma dinamico in tempo reale dello stimolo settimanale sui 14 distretti muscolari." />
        </>
      ) : involved.length === 0 ? (
        <p className="meta">Aggiungi esercizi alla settimana per vedere la matrice popolarsi.</p>
      ) : (
        <div className="space-y-2.5">
          {involved.map((m) => <VolumeBar key={m} muscle={m} direct={volume[m].direct} indirect={volume[m].indirect} accent={accent} />)}
        </div>
      )}
    </div>
  );
}

/* Dischi per lato su bilanciere olimpico da 20 kg */
export function platesFor(target) {
  const bar = 20;
  let side = (Number(target) - bar) / 2;
  if (!isFinite(side) || side < 0) return { ok: false, plates: [], left: 0 };
  const avail = [25, 20, 15, 10, 5, 2.5, 1.25];
  const plates = [];
  avail.forEach((p) => {
    while (side >= p - 0.001) { plates.push(p); side = +(side - p).toFixed(3); }
  });
  return { ok: side < 0.001, plates, left: +side.toFixed(2) };
}

export const PLATE_COLOR = {
  25: "#DC2626", 20: "#2563EB", 15: "#F0A020",
  10: "#16A34A", 5: "#FFFFFF", 2.5: "#111111", 1.25: "#8E8E93",
};

/* Auto-split: ricolloca la seduta saltata dove il volume resta invariato e
   resta almeno un giorno di recupero tra sedute sugli stessi distretti. */
export function proposeReschedule(week, missedIdx, todayIdx, musclesOf) {
  const missed = week[missedIdx];
  if (!missed || !missed.exercises?.length) return null;
  const mine = new Set(missed.exercises.flatMap((e) => musclesOf(e.name)));
  const cand = [];
  for (let d = todayIdx; d < 7; d++) {
    if (week[d]) continue;
    const near = new Set([
      ...(week[d - 1]?.exercises || []).flatMap((e) => musclesOf(e.name)),
      ...(week[d + 1]?.exercises || []).flatMap((e) => musclesOf(e.name)),
    ]);
    let conflict = 0;
    mine.forEach((m) => { if (near.has(m)) conflict++; });
    cand.push({ day: d, conflict, distance: d - todayIdx });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.conflict - b.conflict || a.distance - b.distance);
  return { from: missedIdx, to: cand[0].day, conflict: cand[0].conflict, muscles: [...mine], label: missed.label };
}

/* ============================================================================
   3 · CONTATORI MACRO VOLUMETRICI
   ========================================================================== */




export function MacroTile({ label, value, unit, col }) {
  return (
    <div className="rounded-2xl px-2 py-3 text-center"
         style={{
           background: `radial-gradient(120% 90% at 30% 18%, ${col.light} 0%, ${col.base} 52%, ${col.dark} 100%)`,
           boxShadow: `0 10px 24px ${col.base}33, 0 2px 6px ${col.base}22,
                       inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -4px 8px rgba(0,0,0,0.24)`,
         }}>
      <span className="block font-data" style={{ fontSize: "0.55rem", letterSpacing: "0.08em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.88)" }}>{label}</span>
      <span key={value} className="counter-pop block" style={{ color: "#FFFFFF", fontSize: "1.35rem",
              fontWeight: 600, textShadow: "0 2px 3px rgba(0,0,0,0.35)" }}>{value}</span>
      <span className="block font-data" style={{ fontSize: "0.52rem", color: "rgba(255,255,255,0.82)" }}>{unit}</span>
    </div>
  );
}

export function MacroRow({ values }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <MacroTile label="Calorie"     value={values.kcal} unit="kcal" col={MACRO_COLORS.kcal} />
      <MacroTile label="Proteine"    value={values.p}    unit="g"    col={MACRO_COLORS.p} />
      <MacroTile label="Carboidrati" value={values.c}    unit="g"    col={MACRO_COLORS.c} />
      <MacroTile label="Grassi"      value={values.f}    unit="g"    col={MACRO_COLORS.f} />
    </div>
  );
}

/* ============================================================================
   4 · MACRO-FINESTRA TRIDIMENSIONALE
   ========================================================================== */

export function Window3D({ icon: Icon, label, sub, accent, floatClass, onClick, locked, onLocked }) {
  return (
    <button onClick={locked ? onLocked : onClick}
            className="card card-tap relative w-full text-left overflow-hidden"
            aria-disabled={locked}>
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${floatClass}`}
           style={{ background: "radial-gradient(circle at 32% 28%, #3A3A3A 0%, #111111 62%)",
                    boxShadow: `0 8px 18px rgba(0,0,0,0.28), inset 0 2px 3px rgba(255,255,255,0.18),
                                inset 0 -3px 6px rgba(0,0,0,0.55)` }}>
        <Icon size={24} style={{ color: accent, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))" }} />
      </div>
      <p className="h2 flex items-center justify-between">
        {label}
        <ChevronRight size={17} style={{ color: "var(--ink-2)" }} />
      </p>
      {sub && <p className="meta mt-1">{sub}</p>}

      {locked && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
              style={{ backgroundColor: "rgba(255,255,255,0.82)", backdropFilter: "blur(3px)" }}>
          <span className="label">Non incluso nel tuo piano</span>
          <span className="font-data" style={{ color: accent, fontSize: "0.6rem", letterSpacing: "0.1em" }}>
            TOCCA PER CAMBIARE PIANO
          </span>
        </span>
      )}
    </button>
  );
}

/* ============================================================================
   4b · CERCHI DI COMPLIANCE BIOMETRICA — media 7 giorni, colore a semaforo
   ========================================================================== */

/* Soglie di colore a semaforo: valide per tutti e 3 i cerchi (Allenamento,
   Alimentazione, Recupero). Il colore è interpolato con fluidità TRA le
   soglie, ma i punti di ancoraggio (55/70/85%) restano fissi ed esatti:
   sotto 55% è sempre nella zona rosso-arancio, 55-69% arancione, 70-84%
   giallo, 85%+ verde — nessuno "sballamento" del range. */
const COMPLIANCE_COLOR_STOPS = [
  { pct: 0,   h: 0,   s: 88, l: 47 },  // rosso fuoco
  { pct: 55,  h: 18,  s: 92, l: 50 },  // arancio-rosso (soglia Pericolo)
  { pct: 70,  h: 46,  s: 93, l: 50 },  // giallo (soglia Attenzione)
  { pct: 85,  h: 118, s: 68, l: 40 },  // verde (soglia Ottimale)
  { pct: 100, h: 152, s: 72, l: 45 },  // verde cristallino brillante
];
// Estratta da complianceColor così anche Chart3D (sonno/passi) può usare la
// STESSA curva a semaforo continua dei cerchi di compliance, invece di 3
// blocchi di colore netti — "come nei cerchi", richiesta esplicita.
function complianceHsl(pct) {
  const p = complPct(pct);
  let lo = COMPLIANCE_COLOR_STOPS[0], hi = COMPLIANCE_COLOR_STOPS[COMPLIANCE_COLOR_STOPS.length - 1];
  for (let i = 0; i < COMPLIANCE_COLOR_STOPS.length - 1; i++) {
    if (p >= COMPLIANCE_COLOR_STOPS[i].pct && p <= COMPLIANCE_COLOR_STOPS[i + 1].pct) {
      lo = COMPLIANCE_COLOR_STOPS[i]; hi = COMPLIANCE_COLOR_STOPS[i + 1]; break;
    }
  }
  const span = hi.pct - lo.pct || 1;
  const t = (p - lo.pct) / span;
  return { h: lo.h + (hi.h - lo.h) * t, s: lo.s + (hi.s - lo.s) * t, l: lo.l + (hi.l - lo.l) * t };
}
function complianceColor(pct) {
  const { h, s, l } = complianceHsl(pct);
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}
/* Etichetta descrittiva (solo per il popup analitico, il colore resta continuo). */
const COMPLIANCE_TIERS = [
  { min: 85, label: "Ottimale" },
  { min: 70, label: "Attenzione" },
  { min: 55, label: "Pericolo" },
  { min: 0,  label: "Allarme" },
];
function complianceTier(p) {
  const t = COMPLIANCE_TIERS.find((t) => p >= t.min) || COMPLIANCE_TIERS[COMPLIANCE_TIERS.length - 1];
  return { ...t, color: complianceColor(p) };
}
const complPct = (n) => Math.max(0, Math.min(100, Math.round(n)));

/* Storico simulato a 6 giorni (il 7° è "oggi", calcolato dal vivo dove
   possibile): dati realistici pronti per la media a 7 giorni. */
const TRAIN_HISTORY_6D  = [100, 90, 60, 100, 80, 100];
const NUTRI_HISTORY_6D  = [88, 95, 70, 100, 82, 91];
const RECOVERY_SLEEP_6D = [7.6, 6.8, 0, 7.9, 5.6, 7.1];    // 0 = notte non tracciata
const RECOVERY_STEPS_6D = [9200, 7400, 6100, 0, 10400, 12600]; // 0 = giorno non tracciato
const RECOVERY_PAIN_6D  = [1, 1, 0, 1, 1, 1];              // 1 = nessun dolore, 0 = dolore segnalato

/* Punteggio sonno di un giorno: quantità (ideale >7,5h, crollo sotto le 6h)
   — un giorno non tracciato (0) vale 0, punendo la mancanza di dato. */
function sleepScore(hours) {
  if (!hours || hours <= 0) return 0;
  if (hours >= 7.5) return 100;
  if (hours <= 6) return Math.max(0, Math.round((hours / 6) * 55));
  return Math.round(55 + ((hours - 6) / 1.5) * 45);
}
function stepsScore(steps) {
  if (!steps || steps <= 0) return 0;
  return Math.min(100, Math.round((steps / 10000) * 100));
}
function recoveryDayScore(sleepH, stepsN, painOk) {
  return complPct(sleepScore(sleepH) * 0.5 + stepsScore(stepsN) * 0.3 + (painOk ? 100 : 40) * 0.2);
}
/* Media 7 giorni del Recupero: alla media si applica anche una penalità di
   frequenza — se il sonno non viene tracciato spesso, il punteggio finale
   decade ulteriormente verso il rosso, indipendentemente dalle notti buone. */
function recoveryWeekScore(sleep7, steps7, pain7) {
  const n = sleep7.length;
  const tracked = sleep7.filter((h) => h > 0).length;
  const frequency = tracked / n;
  const freqPenalty = 0.7 + 0.3 * frequency; // da 0.7 (mai tracciato) a 1.0 (sempre tracciato)
  const rawAvg = sleep7.reduce((sum, h, i) => sum + recoveryDayScore(h, steps7[i], pain7[i] === 1), 0) / n;
  return complPct(rawAvg * freqPenalty);
}
function nutritionPrecision(target, consumed) {
  const dims = ["kcal", "p", "c", "f"];
  const devs = dims.map((d) => (target[d] > 0 ? Math.min(1, Math.abs(consumed[d] - target[d]) / target[d]) : 0));
  return complPct((1 - devs.reduce((a, b) => a + b, 0) / dims.length) * 100);
}

/* Anello singolo: vivo, fluido, con lucentezza 3D (sheen + glow), colore
   continuo che si intensifica agli estremi. */
function ComplianceCircle({ pct, size = 76, stroke = 8 }) {
  // pct === null → nulla da misurare questa settimana (es. niente assegnato):
  // stato neutro esplicito, non un 0% (allarme) né un 100% (falso completo).
  const isNeutral = pct == null;
  const color = isNeutral ? "var(--ink-2)" : complianceColor(pct);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  // BUG PRESO (4 giri di correzione): ogni versione precedente del
  // "bagliore" usava un filter:drop-shadow, che per costruzione proietta
  // luce FUORI dal contorno dell'arco — sull'<svg> (che clippa di default
  // tutto ciò che esce dal suo viewBox) quel bagliore risultava tagliato
  // di netto sui 4 lati, leggendosi come un "quadrato" intorno al cerchio.
  // Tolto il drop-shadow: il pulsare ora è solo brightness()/saturate() —
  // modula i pixel del tratto stesso (più vivido/più tenue), non aggiunge
  // nulla al di fuori del contorno del cerchio, quindi niente più da
  // clippare o far vedere come un alone estraneo.
  const filledLen = c * (Math.max(0, Math.min(100, pct ?? 0)) / 100);
  return (
    <div className="relative shrink-0 ring-breathe" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {!isNeutral && (
          <circle className="ring-glow-pulse" cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={c - filledLen} transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.22,1,.36,1), stroke 0.4s ease" }} />
        )}
        {isNeutral && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={Math.max(1.5, stroke * 0.3)}
                  strokeDasharray="4 5" strokeOpacity="0.55" />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span style={{ fontSize: size > 60 ? "1.05rem" : "0.85rem", fontWeight: 700, color: isNeutral ? "var(--ink-2)" : "var(--ink)", transition: "color 0.3s ease" }}>
          {isNeutral ? "n/d" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

/* I 3 cerchi di compliance, affiancati in orizzontale, pronti per essere
   inseriti dentro il banner del saluto. */
function ComplianceRings({ rings, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {rings.map((r) => {
        const tier = r.pct == null ? { color: "var(--ink-2)", label: "n/d" } : complianceTier(r.pct);
        return (
          <button key={r.id} onClick={() => onSelect(r.id)}
                  className="flex flex-col items-center gap-2 transition-transform active:scale-95">
            <ComplianceCircle pct={r.pct} />
            <span className="text-xs flex items-center gap-1 text-center" style={{ color: "var(--ink-2)", fontWeight: 700 }}>
              <r.icon size={11} style={{ color: tier.color }} /> {r.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Popup analitico a comparsa, stile Instagram: si apre dal basso, sfondo
   sfumato, dettaglio del singolo reparto in un colpo d'occhio. */
function CompliancePopup({ ring, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  if (!ring) return null;
  const isNeutral = ring.pct == null;
  const tier = isNeutral ? { color: "var(--ink-2)", label: "Nessun dato" } : complianceTier(ring.pct);
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
             backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)", overflowY: "auto" }} onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 overflow-y-auto"
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "88vh" }}
             onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-center justify-between mb-4">
              <p className="h1 flex items-center gap-2">
                <ring.icon size={18} style={{ color: tier.color }} /> {ring.label}
              </p>
              <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
            </div>
          </div>
          <p style={{ fontSize: "2.6rem", fontWeight: 700, color: tier.color, lineHeight: 1 }}>{isNeutral ? "n/d" : `${ring.pct}%`}</p>
          <p className="meta mb-4 mt-1">{isNeutral ? tier.label : `${tier.label} · media ultimi 7 giorni`}</p>
          <div className="space-y-2">
            {ring.details.map((d) => (
              <div key={d.label} className="inner flex items-center justify-between px-4 py-2.5">
                <span className="text-sm" style={{ color: "var(--ink)" }}>{d.label}</span>
                <span className="text-sm" style={{ color: "var(--ink-2)", fontWeight: 700 }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* Animazione breve "hai guadagnato XP": sostituisce l'elenco permanente
   "obiettivi di oggi" che prima restava aperto a spiegare le regole — qui
   appare solo nell'istante in cui un'azione sblocca davvero i punti, si
   dissolve da sola, non richiede alcuna interazione. */
function XpToastBanner({ toast }) {
  if (!toast) return null;
  return (
    <Portal>
      <div key={toast.key} className="xp-toast-wrap" aria-live="polite">
        <div className="xp-toast">
          <Sparkles size={14} style={{ color: "#FFFFFF" }} />
          <span>+{toast.amount} XP</span>
          <span className="xp-toast-label">{toast.label}</span>
        </div>
      </div>
    </Portal>
  );
}

/* ============================================================================
   5 · HOME DASHBOARD
   ========================================================================== */

/* Saluto dinamico in base all'orario locale del dispositivo. */
/* Titolo di gamification coordinato al livello raggiunto. */
function levelTitle(lvl) {
  if (lvl >= 6) return "🏆 LIVELLO LEGGENDARIO";
  if (lvl >= 4) return "🏆 LIVELLO ÉLITE";
  if (lvl >= 2) return "💪 LIVELLO AVANZATO";
  return "🌱 LIVELLO PRINCIPIANTE";
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { icon: "☀️", text: "Buongiorno" };
  if (h >= 12 && h < 18) return { icon: "👋", text: "Buon pomeriggio" };
  return { icon: "🌙", text: "Buonasera" };
}

/* Streak dinamico: cresce di un giorno ogni volta che si apre l'app in un
   giorno nuovo rispetto a una data di riferimento (stesso principio già usato
   per l'edizione giornaliera di News e Tips), MA si azzera se sono passate
   più di 24 ore dall'ultima cosa registrata (nessun allenamento, pasto,
   sonno/passi o bio-sintomo): la costanza va mantenuta giorno per giorno. */
/* Badge metallico del mesociclo/settimana: sfumatura argento/acciaio con
   riflesso in movimento, leggibile su qualunque tema (testo sempre scuro). */
const METALLIC_GRADIENT = "linear-gradient(120deg, #8E8E93 0%, #E4E4E7 25%, #A1A1AA 50%, #D4D4D8 75%, #8E8E93 100%)";
function MesocicloBadge({ mesociclo, week, weeks }) {
  return (
    <span className="metallic-badge inline-flex items-center rounded-full px-3.5 py-1.5"
          style={{ backgroundImage: METALLIC_GRADIENT }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#27272A", letterSpacing: "0.02em" }}>
        Mesociclo {mesociclo} · Settimana {week} di {weeks}
      </span>
    </span>
  );
}

// Stima del sonno profondo (REM) senza dispositivo reale a monte: parte da
// una quota fisiologica media (~22% delle ore totali dormite) e la corregge
// con i 4 segnali che il cliente PUÒ davvero riferire a occhio — stress
// percepito, risvegli notturni, caffeina ancora in circolo a letto (stessa
// stima di emivita già usata per l'avviso caffeina qui sopra) ed energia al
// risveglio. Non è una misura clinica: è dichiarata come stima nel testo
// che la accompagna, mai spacciata per un dato reale da polisonnografia.
function computeRemSleepEstimate({ sleepHours, stressLevel, nightWakeups, caffeineResidualMg, morningEnergy }) {
  const hours = Number(sleepHours) || 0;
  if (hours <= 0) return null;

  let pct = 0.22; // quota REM media in un adulto sano
  if (stressLevel) pct -= ((Number(stressLevel) - 5) / 5) * 0.04;   // stress alto → meno REM
  if (nightWakeups) pct -= Math.min(Number(nightWakeups), 4) * 0.015; // ogni risveglio frammenta il sonno
  if (caffeineResidualMg) pct -= Math.min(caffeineResidualMg / 50, 1) * 0.03; // caffeina residua sopprime REM
  if (morningEnergy) pct += ((Number(morningEnergy) - 5) / 5) * 0.03; // energia al risveglio come proxy di qualità

  pct = Math.max(0.10, Math.min(0.30, pct));
  return +(hours * pct).toFixed(1);
}

function computeStreak(referenceDateStr = "2026-07-19", baseStreak = 12, lastActivityDateStr) {
  const ref = new Date(referenceDateStr); ref.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const grown = Math.max(1, baseStreak + Math.round((now - ref) / 86400000));

  if (!lastActivityDateStr) return grown;
  const last = new Date(lastActivityDateStr); last.setHours(0, 0, 0, 0);
  const gapDays = Math.round((now - last) / 86400000);
  return gapDays > 1 ? 0 : grown; // più di 24h senza registrare nulla → streak azzerato
}

/* Bio-sintomo Digestione/Gonfiore: valutazione rapida da 1 a 5 con emoji,
   sempre facoltativa, nell'ultima parte dell'Alimentazione. Energia/DOMS/
   Dolori vivevano nel check-in di fine giornata, rimosso su richiesta
   (poco utile, verrà reintrodotto altrove se serve). */
const DIGEST_EMOJIS = ["🤢", "😖", "😐", "🙂", "✨"];

function EmojiRating({ label, icon, emojis, value, onChange }) {
  return (
    <div>
      <p className="text-sm mb-2 flex items-center gap-2 flex-wrap" style={{ color: "var(--ink)", fontWeight: 600 }}>
        <span aria-hidden="true">{icon}</span> {label}
        <span className="text-xs" style={{ color: "var(--ink-2)", fontWeight: 400 }}>(facoltativo)</span>
      </p>
      <div className="flex items-center gap-2">
        {emojis.map((e, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button key={n} onClick={() => onChange(active ? 0 : n)}
                    aria-label={`${label}: livello ${n} su 5`} aria-pressed={active}
                    className="flex-1 rounded-2xl py-2.5 text-xl transition-all duration-200 active:scale-90"
                    style={{ backgroundColor: active ? "var(--ink)" : "var(--surface-2)",
                             border: active ? "none" : "1px solid var(--line)",
                             filter: active ? "none" : "grayscale(0.5) opacity(0.65)" }}>
              {e}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Scala 1-10 generica per aderenza e stress/digestione: qui il valore va da
   1 (peggio) a 10 (meglio), coerente con le altre scale a 10 punti dell'app. */
const CHECK_SCALE_10 = Array.from({ length: 10 }, (_, i) => i + 1);

/* Pop-up del Check settimanale (lunedì): bloccante, idro-satinato, con i 5 campi
   di compilazione rapida più 3 foto. Al termine simula il salvataggio dei
   parametri biometrici storici su Supabase (legati all'ID utente) e sblocca
   di nuovo la navigazione della Home. */
export function WeeklyCheckModal({ accent, accentText, accentSoft, gender, onSubmit, supabase, userId, onClose }) {
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [thigh, setThigh] = useState("");
  const [arm, setArm] = useState("");
  const [pain, setPain] = useState("");
  const [stress, setStress] = useState("");
  const [digestion, setDigestion] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [cyclePhase, setCyclePhase] = useState("");
  const [photos, setPhotos] = useState({ front: null, side: null, back: null }); // { file, preview }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const isRealMode = Boolean(supabase && userId);
  // Check obbligatorio del lunedì (onClose assente): tutti i campi
  // servono davvero al coach ogni settimana. "Registra" libero nell'Archivio
  // Check (onClose presente): serve poter loggare anche solo il peso di oggi
  // senza dover per forza valutare dolori/stress/digestione/sonno — prima
  // richiedeva TUTTI gli 8 campi anche qui, ed è il motivo per cui il
  // pulsante sembrava "non funzionare": restava disabilitato in silenzio.
  const isFreeMode = !!onClose;
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose, isFreeMode);

  const handlePhoto = (key) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotos((p) => {
      if (p[key]?.preview) URL.revokeObjectURL(p[key].preview);
      return { ...p, [key]: { file, preview: URL.createObjectURL(file) } };
    });
  };

  const canSubmit = isFreeMode
    ? !!weight
    : weight && waist && thigh && arm && pain && stress && digestion && sleepQuality;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError("");
    const data = {
      weight: Number(weight), waist: waist ? Number(waist) : null, thigh: thigh ? Number(thigh) : null, arm: arm ? Number(arm) : null,
      pain: pain ? Number(pain) : null, stress: stress ? Number(stress) : null, digestion: digestion ? Number(digestion) : null,
      sleepQuality: sleepQuality ? Number(sleepQuality) : null,
      cyclePhase: cyclePhase || null,
    };
    // Check reale: scrive su checkins (coachingData.js) — stessa funzione sia
    // per il check obbligatorio del lunedì sia per il pulsante
    // "Registra ora" libero nel Profilo. In demo (!isRealMode) resta il
    // vecchio comportamento simulato con un breve delay di feedback visivo.
    if (isRealMode) {
      try {
        const photoPaths = {};
        for (const key of ["front", "side", "back"]) {
          if (photos[key]?.file) photoPaths[key] = await uploadCheckinPhoto(supabase, userId, photos[key].file, key);
        }
        await saveCheckin(supabase, userId, { ...data, photoPaths });
        haptic("success");
        onSubmit(data);
      } catch (err) {
        console.error("PERFORM: errore salvataggio check", err);
        setSaveError(err.message || "Non sono riuscito a salvare il check.");
        setSaving(false);
      }
      return;
    }
    setTimeout(() => onSubmit(data), 700);
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(9,9,11,0.65)", backdropFilter: "blur(6px)" }}>
      <div className="spring-in relative w-full overflow-y-auto rounded-2xl p-6"
           style={{ maxWidth: 420, maxHeight: "92vh", backgroundColor: "var(--surface)",
                    border: `1.5px solid ${accent}`, boxShadow: "0 28px 70px -14px rgba(0,0,0,0.45)" }}>
        {/* velo lucido idro-satinato, per l'effetto glassmorphism */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none"
             style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%)" }} />

        <div className="relative">
          <div ref={headerRef}>
            {isFreeMode && <SwipeHandle />}
            <div className="flex items-start justify-between">
              <span className="inline-flex items-center justify-center rounded-full mb-4"
                    style={{ width: 48, height: 48, backgroundColor: accent }}>
                <Camera size={22} style={{ color: "#FFFFFF" }} />
              </span>
              {onClose && (
                <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
              )}
            </div>
          </div>
          <p className="h1 mb-2">{onClose ? "Registra un check" : "Check settimanale"}</p>
          <p className="body mb-4">
            {onClose
              ? "Registra misure e stato del momento quando vuoi, non solo il lunedì: ogni check in più affina il trend che vedi qui e che vede il coach."
              : "Nuova settimana: registra le misure e rispondi a quello che l'app non può dedurre da sola da " +
                "ciò che hai già tracciato durante la settimana. Serve tutto al coach per calibrare dieta e " +
                "allenamento sui tuoi progressi reali."}
          </p>

          <div className="on-light rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <p className="text-sm leading-relaxed" style={{ fontWeight: 500 }}>
              📏 Misura peso e circonferenze preferibilmente al mattino, a digiuno, dopo essere andato/a
              in bagno: sono le condizioni in cui i numeri sono più confrontabili da una settimana all'altra.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <label className="block">
              <span className="label block mb-1.5">Peso mattina (kg)</span>
              <input type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(",", "."))}
                     placeholder="es. 78.4" className="input w-full px-4 py-3 font-data" />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Addome (cm){isFreeMode ? " (facoltativo)" : ""}</span>
              <input type="text" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value.replace(",", "."))}
                     placeholder="es. 84" className="input w-full px-4 py-3 font-data" />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Coscia (cm){isFreeMode ? " (facoltativo)" : ""}</span>
              <input type="text" inputMode="decimal" value={thigh} onChange={(e) => setThigh(e.target.value.replace(",", "."))}
                     placeholder="es. 58" className="input w-full px-4 py-3 font-data" />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Braccio (cm){isFreeMode ? " (facoltativo)" : ""}</span>
              <input type="text" inputMode="decimal" value={arm} onChange={(e) => setArm(e.target.value.replace(",", "."))}
                     placeholder="es. 37" className="input w-full px-4 py-3 font-data" />
            </label>
          </div>

          <p className="label mb-2">Quello che i dati da soli non dicono{isFreeMode ? " (facoltativo)" : ""}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="label block mb-1.5">Dolori / fastidi (1-10)</span>
              <select value={pain} onChange={(e) => setPain(e.target.value)} className="input w-full px-4 py-3 text-sm">
                <option value="">— valuta —</option>
                {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label block mb-1.5">Stress percepito (1-10)</span>
              <select value={stress} onChange={(e) => setStress(e.target.value)} className="input w-full px-4 py-3 text-sm">
                <option value="">— valuta —</option>
                {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label block mb-1.5">Digestione (1-10)</span>
              <select value={digestion} onChange={(e) => setDigestion(e.target.value)} className="input w-full px-4 py-3 text-sm">
                <option value="">— valuta —</option>
                {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label block mb-1.5">Qualità del sonno (1-10)</span>
              <select value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} className="input w-full px-4 py-3 text-sm">
                <option value="">— valuta —</option>
                {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {gender === "F" && (
            <label className="block mb-5">
              <span className="label block mb-1.5">Fase del ciclo (facoltativo)</span>
              <select value={cyclePhase} onChange={(e) => setCyclePhase(e.target.value)} className="input w-full px-4 py-3 text-sm">
                <option value="">— non specificato —</option>
                <option value="mestruale">Fase mestruale</option>
                <option value="follicolare">Fase follicolare</option>
                <option value="ovulazione">Ovulazione</option>
                <option value="luteale">Fase luteale</option>
              </select>
            </label>
          )}
          {gender !== "F" && <div className="mb-1" />}

          <p className="label mb-2">Foto (fronte, lato, retro)</p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[["front", "Fronte"], ["side", "Lato"], ["back", "Retro"]].map(([key, lab]) => (
              <label key={key}
                     className="relative overflow-hidden rounded-2xl flex flex-col items-center justify-center gap-1.5 py-4 cursor-pointer transition-transform active:scale-95"
                     style={photos[key]
                       ? { background: `linear-gradient(160deg, ${accent}, ${accentText})` }
                       : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                {photos[key]
                  ? <img src={photos[key].preview} alt={lab} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  : null}
                <span className="relative z-10 flex flex-col items-center gap-1.5">
                  {photos[key]
                    ? <CheckCircle2 size={20} style={{ color: "#FFFFFF" }} />
                    : <Camera size={20} style={{ color: accent }} />}
                  <span className="text-xs" style={{ color: photos[key] ? "#FFFFFF" : "var(--ink-2)", fontWeight: 600 }}>{lab}</span>
                </span>
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto(key)} />
              </label>
            ))}
          </div>

          <button onClick={handleSubmit} disabled={!canSubmit || saving}
                  className="w-full rounded-full px-4 py-3.5 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
            {saving ? "Salvataggio in corso…" : "Registra"}
          </button>
          {saveError && (
            <p className="mt-2 text-center text-sm" style={{ color: "#B91C1C" }}>{saveError}</p>
          )}
          {!canSubmit && (
            <p className="meta mt-2 text-center" style={{ fontSize: "0.68rem" }}>
              {isFreeMode ? "Inserisci almeno il peso per registrare." : "Compila tutti i campi (le foto sono facoltative) per sbloccare l'app."}
            </p>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}

const PAUSE_REASONS = ["Stress", "Impegni personali", "Dolori/infortunio", "Malattia", "Altro"];

/* Vacanza (2-14 giorni) o riposo forzato singolo (motivo obbligatorio):
   mostra un banner se oggi è già coperto da una pausa attiva, altrimenti un
   link discreto per richiederne una. Il coach vede motivo e date in
   ClientDetail (09_CoachDashboard.jsx) — stessa tabella, mai due fonti. */
export function PauseSection({ supabase, userId, accent, accentText }) {
  const [activePause, setActivePause] = useState(undefined); // undefined = non ancora caricato, null = nessuna
  const [showModal, setShowModal] = useState(false);

  const reload = () => {
    fetchActivePause(supabase, userId)
      .then((p) => setActivePause(p ?? null))
      .catch((err) => { console.error("PERFORM: errore lettura pausa attiva", err); setActivePause(null); });
  };
  useEffect(reload, [supabase, userId]);

  if (activePause === undefined) return null;

  return (
    <>
      {activePause ? (
        <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-center gap-3"
             style={{ backgroundColor: "var(--surface-2)", border: `1px solid ${accent}` }}>
          <span style={{ fontSize: "1.3rem" }}>{activePause.type === "vacation" ? "🏖️" : "🛌"}</span>
          <div className="min-w-0">
            <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 700 }}>
              {activePause.type === "vacation" ? "Sei in vacanza" : "Riposo forzato di oggi"}
              {" "}fino al {activePause.end_date.slice(8, 10)}/{activePause.end_date.slice(5, 7)}
            </p>
            <p className="meta mt-0.5">Streak e obiettivi non vengono penalizzati in questi giorni.</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 mb-4 text-sm transition-transform active:scale-[0.98] btn-3d"
                style={{ backgroundColor: "var(--surface-2)", border: `1.5px solid ${accent}`, color: "var(--ink)", fontWeight: 700 }}>
          🏖️ Vai in vacanza o chiedi un riposo forzato
        </button>
      )}
      {showModal && (
        <PauseRequestModal supabase={supabase} userId={userId} accent={accent} accentText={accentText}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); reload(); }} />
      )}
    </>
  );
}

function PauseRequestModal({ supabase, userId, accent, accentText, onClose, onSaved }) {
  const [type, setType] = useState("vacation");
  const [startDate, setStartDate] = useState(toLocalISODate());
  const [endDate, setEndDate] = useState(toLocalISODate());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      await requestPause(supabase, userId, {
        type, startDate,
        endDate: type === "forced_rest" ? startDate : endDate,
        reason: type === "forced_rest" ? reason : null,
        note: note || null,
      });
      onSaved();
    } catch (err) {
      setError(err.message || "Non sono riuscito a registrare la richiesta.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = type === "vacation" ? (startDate && endDate && endDate >= startDate) : (startDate && reason);
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
             backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)", overflowY: "auto" }} onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 overflow-y-auto" onClick={(e) => e.stopPropagation()}
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "88vh" }}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-center justify-between mb-4">
              <p className="h1-gradient">Pausa dal programma</p>
              <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {[["vacation", "Vacanza"], ["forced_rest", "Riposo forzato"]].map(([id, lab]) => (
              <button key={id} onClick={() => setType(id)}
                className="rounded-xl px-1 py-2.5 text-center"
                style={type === id ? { backgroundColor: accent, color: "#FFFFFF" } : { border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{lab}</span>
              </button>
            ))}
          </div>

          {type === "vacation" ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">Dal</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input w-full px-3 py-2.5 text-sm font-data" />
              </label>
              <label className="block">
                <span className="label block mb-1.5">Al</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input w-full px-3 py-2.5 text-sm font-data" />
              </label>
            </div>
          ) : (
            <>
              <label className="block mb-3">
                <span className="label block mb-1.5">Giorno</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input w-full px-3 py-2.5 text-sm font-data" />
              </label>
              <label className="block mb-3">
                <span className="label block mb-1.5">Motivo (obbligatorio, lo vede il coach)</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full px-3 py-2.5 text-sm">
                  <option value="">— scegli —</option>
                  {PAUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </>
          )}

          <label className="block mb-4">
            <span className="label block mb-1.5">Note per il coach (facoltative)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="input w-full px-3 py-2.5 text-sm" style={{ resize: "vertical" }} />
          </label>

          {error && <p className="mb-3 text-sm" style={{ color: "#B91C1C" }}>{error}</p>}

          <button onClick={handleSubmit} disabled={!canSubmit || saving}
                  className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
            {saving ? "Invio…" : "Conferma"}
          </button>
          {type === "vacation" && (
            <p className="meta mt-2 text-center" style={{ fontSize: "0.68rem" }}>La vacanza deve durare tra 2 e 14 giorni.</p>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* Widget lussuoso HRV Matrix: gauge radiale + badge di prontezza del sistema
   nervoso, basato sul valore di HRV simulato/inserito dall'utente. */
function HrvMatrixWidget({ hrv, rhr, accent }) {
  const hrvNum = Number(hrv) || 0;
  const g = hrvNum ? grade("hrv", hrvNum) : "warn";
  const badge = g === "good"
    ? { text: "🟢 PRONTO AL MASSIMO SFORZO", bg: "#10B981" }
    : g === "bad"
    ? { text: "🔴 SFIANCATO - ATTENZIONE", bg: "#DC2626" }
    : { text: "🟡 RECUPERO PARZIALE", bg: "#F0A020" };

  const R = 54, C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, hrvNum / 100));
  const dash = C * pct;
  const ringColor = CANDLE[g].mid;

  return (
    <div className="rounded-2xl p-5 mb-4"
         style={{ background: "linear-gradient(160deg, var(--surface) 0%, var(--surface-2) 100%)",
                  border: "1px solid var(--line)" }}>
      <p className="label mb-3">HRV Matrix</p>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
          <svg viewBox="0 0 128 128" width="128" height="128">
            <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
            <circle cx="64" cy="64" r={R} fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${dash} ${C - dash}`} transform="rotate(-90 64 64)"
                    style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-data" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)" }}>
              {hrvNum || "—"}
            </span>
            <span className="label" style={{ fontSize: "0.55rem" }}>ms HRV</span>
          </div>
        </div>
        <div className="min-w-0 flex-1" style={{ flexBasis: 180 }}>
          <span className="inline-block font-data px-3 py-2 rounded-full mb-2"
                style={{ backgroundColor: badge.bg, color: "#FFFFFF", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.02em" }}>
            {badge.text}
          </span>
          <p className="meta leading-relaxed" style={{ fontSize: "0.72rem" }}>
            Il sistema nervoso autonomo si legge da HRV e RHR insieme: RHR attuale{" "}
            <b style={{ color: "var(--ink)" }}>{Number(rhr) || "—"} bpm</b>. Valori simulati: cambiali qui
            sotto per vedere il badge aggiornarsi subito.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HomeDashboard({
  accent, accentSoft, accentText,
  profile,            // { name, nickname, gender, goalLabel }
  day,                // { weekday, weekNumber, isTraining, sessionLabel, dayNumber }
  target, consumed,   // { kcal, p, c, f }
  streak, level, xp, xpInLevel, xpNeeded,
  mealsBySlot, foods, mealGuide, substitutions,
  exercises,          // [{ id, name, sets, reps, rirTarget, technique, rests, history }]
  setsFor,            // (exercise) => [{ kg, reps, rir }]
  onSetField,         // (exercise, rowIdx, field, value) => void
  sleep,              // { start, end, hours }
  steps, water, waterTarget, autoSteps, rhr, hrv,
  fullHistory,        // { sleep: number[N], steps: number[N], rhr: number[N], hrv: number[N] } — N giorni fino a ieri
  weekPlan,           // [giorno0..6] per l'auto-split
  musclesOf,          // (nome) => [distretti]
  missedDayIdx,       // indice del giorno saltato, -1 se nessuno
  access,             // { nutrition, recovery }
  onSetSleep, onSetSteps, onToggleAutoSteps, onAddWater, onSetTargetOn, onSetTargetOff, onSetRhr, onSetHrv, onSetWaterTarget,
  onEditSleepDay, onEditStepsDay, // corregge un giorno PASSATO di sonno/passi cliccando la sua candela (mai "oggi")
  targetOn, targetOff, isTrainingDay, onToggleTrainingDay,
  onAddFood, onRemoveFood, onUpdateFood, onOpenScanner, onAddCustomFood, onCopyYesterday, onShoppingList,
  onApplyReschedule, onDismissReschedule,
  onUpgrade, onCoachSync, lastCoachSync, coachSyncCount, coachFeed, onSimulateInactivity, onResetActivityToday,
  userPlan, // 'free' | 'performance_pack' | 'scheda_personalizzata' | 'training' | 'full_coaching' — letta da Supabase
  microAddon, // profiles.micro_addon — componente aggiuntivo micronutrienti per Scheda/Training, attivato dal coach
  stressLevel, onSetStressLevel, nightWakeups, onSetNightWakeups, morningEnergy, onSetMorningEnergy,
  caffeineMg, onSetCaffeineMg, caffeineTime, onSetCaffeineTime,
  supabase, userId, // solo per il protocollo integratori reale (prescribed_supplements)
}) {
  // Persistito (stesso principio del tab principale in App.jsx): se il
  // sistema operativo scarica la pagina dalla memoria mentre l'app è in
  // background e il browser la ricarica al ritorno, si riparte dalla
  // stessa sotto-schermata invece che sempre dalla Home.
  const [screen, setScreen] = useState(() => localStorage.getItem("perform_last_screen") || "dash");   // dash | workout | nutrition | recovery
  useEffect(() => { localStorage.setItem("perform_last_screen", screen); }, [screen]);
  const [digestValue, setDigestValue] = useState(0);
  // Alimentazione: "I tuoi target" ora è un pannello compatto in cima alla
  // pagina, non più un tab tra Diario Libero e Sostituzioni — chiuso di
  // default, si espande solo quando il cliente vuole davvero modificarli.
  const [targetsOpen, setTargetsOpen] = useState(false);
  // Allenamento ora si divide in 3: Pesi (scheda/esercizi/volumi, era tutto
  // lo schermo), Cardio (spostato qui da Recupero — è allenamento, non
  // recupero), Wiki (invariata, solo spostata sotto ai 3 bottoni invece che
  // sempre visibile in fondo alla pagina Pesi).
  const [workoutTab, setWorkoutTab] = useState("pesi"); // pesi | cardio | wiki

  // BUG PRESO: cambiare schermata (Allenamento/Alimentazione/Recupero/
  // Integrazione, o tornare alla Home) lasciava la pagina alla stessa
  // posizione di scroll di prima — la nuova schermata poteva apparire già
  // scrollata a metà invece che dall'inizio. Swipe da bordo sinistro →
  // stesso "indietro" del pulsante freccia, come il gesto nativo iOS.
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);
  useEdgeSwipeBack(() => setScreen("dash"), screen !== "dash");

  /* Check settimanale: si attiva da solo appena scatta lunedì (non più anche
     domenica) e blocca la navigazione finché l'atleta non lo compila — solo
     per chi ha davvero un coach (access.pro: full_coaching/scheda
     personalizzata/training), MAI per free/Performance Pack, che registrano
     i propri dati quando vogliono dal Profilo (SEZIONE Recupero/"Registra un
     check", sempre disponibile a tutti). BUG PRESO: "compilato" viveva solo
     in uno stato locale (weeklyCheckDone) che si azzerava a ogni refresh —
     bastava ricaricare la pagina per rivederlo ricomparire lo stesso lunedì.
     Ora si verifica il vero ultimo check salvato (checkins, la stessa
     tabella che legge anche il coach): se è di questa settimana (da lunedì
     in poi) resta chiuso fino al lunedì successivo, altrimenti ricompare. */
  const [showWeeklyCheck, setShowWeeklyCheck] = useState(false);
  const [weeklyCheckDone, setWeeklyCheckDone] = useState(false);
  useEffect(() => {
    const dow = new Date().getDay(); // 1 = lunedì
    if (dow !== 1 || weeklyCheckDone || !access.pro) return;
    if (!(supabase && userId)) { setShowWeeklyCheck(true); return; } // anteprima demo: comportamento invariato
    let cancelled = false;
    const mondayIso = toLocalISODate(mondayOfLocal());
    fetchCheckins(supabase, userId, 1)
      .then((rows) => {
        if (cancelled) return;
        const last = rows[rows.length - 1];
        if (!last || last.date < mondayIso) setShowWeeklyCheck(true);
      })
      .catch((err) => console.error("PERFORM: errore verifica check settimanale già fatto", err));
    return () => { cancelled = true; };
  }, [weeklyCheckDone, access.pro, supabase, userId]);

  /* Cerchi di compliance biometrica: modello grafico di test, override manuali
     (solo per provare colori/soglie), popup analitico aperto. */
  const [ringTestOpen, setRingTestOpen] = useState(false);
  const [trainOverride, setTrainOverride] = useState(null);
  const [nutriOverride, setNutriOverride] = useState(null);
  const [recoveryOverride, setRecoveryOverride] = useState(null);
  const [activeRingPopup, setActiveRingPopup] = useState(null);
  const [selectedCalendarIso, setSelectedCalendarIso] = useState(null); // null = oggi
  // Diario Alimentazione di un giorno PASSATO cliccato sulla striscia
  // calendario (NutritionCalendarStrip) — stesso principio di
  // selectedCalendarIso/CalendarDayReadOnlyView per l'Allenamento, ma qui
  // modificabile (aggiungi/rimuovi alimenti) invece che sola lettura: serve
  // proprio a correggere un pasto dimenticato in un giorno già passato.
  const [selectedNutritionIso, setSelectedNutritionIso] = useState(null); // null = oggi
  const [pastMeals, setPastMeals] = useState(null);
  const [pastMealsLoading, setPastMealsLoading] = useState(false);
  useEffect(() => {
    if (!selectedNutritionIso) { setPastMeals(null); return; }
    if (!supabase || !userId) { setPastMeals(MEAL_SLOTS.reduce((a, s) => ({ ...a, [s.id]: [] }), {})); return; }
    let cancelled = false;
    setPastMealsLoading(true);
    fetchNutritionLogsForDate(supabase, userId, selectedNutritionIso)
      .then((rows) => {
        if (cancelled) return;
        const bySlot = MEAL_SLOTS.reduce((a, s) => ({ ...a, [s.id]: [] }), {});
        rows.forEach((r) => {
          if (!bySlot[r.meal_slot]) bySlot[r.meal_slot] = [];
          bySlot[r.meal_slot].push({ id: r.id, name: r.name, grams: r.grams, kcal: r.kcal, p: r.protein, c: r.carbs, f: r.fat });
        });
        setPastMeals(bySlot);
      })
      .catch((err) => {
        console.error("PERFORM: errore lettura diario giorno passato", err);
        if (!cancelled) setPastMeals(MEAL_SLOTS.reduce((a, s) => ({ ...a, [s.id]: [] }), {}));
      })
      .finally(() => { if (!cancelled) setPastMealsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNutritionIso, supabase, userId]);
  const addFoodForPastDay = (slot, item) => {
    if (!selectedNutritionIso) return;
    const localItem = { ...item };
    setPastMeals((m) => ({ ...(m || {}), [slot]: [...((m || {})[slot] || []), localItem] }));
    if (supabase && userId) {
      addNutritionLogItem(supabase, userId, selectedNutritionIso, slot, item)
        .then((saved) => {
          setPastMeals((m) => ({ ...(m || {}), [slot]: ((m || {})[slot] || []).map((it) => (it === localItem ? { ...it, id: saved.id } : it)) }));
        })
        .catch((err) => console.error("PERFORM: errore salvataggio pasto giorno passato", err));
    }
  };
  const removeFoodForPastDay = (slot, index) => {
    setPastMeals((m) => {
      const item = (m || {})[slot]?.[index];
      if (supabase && userId && item?.id) {
        removeNutritionLogItem(supabase, item.id).catch((err) => console.error("PERFORM: errore rimozione pasto giorno passato", err));
      }
      return { ...(m || {}), [slot]: ((m || {})[slot] || []).filter((_, i) => i !== index) };
    });
  };
  const updateFoodForPastDay = (slot, index, newGrams) => {
    setPastMeals((m) => {
      const items = (m || {})[slot] || [];
      const item = items[index];
      if (!item) return m;
      const patched = scaleFoodItem(item, newGrams);
      if (supabase && userId && item.id) {
        updateNutritionLogItem(supabase, item.id, patched).catch((err) => console.error("PERFORM: errore modifica pasto giorno passato", err));
      }
      return { ...(m || {}), [slot]: items.map((it, i) => (i === index ? patched : it)) };
    });
  };
  // Uscendo da Alimentazione si riparte sempre da "oggi" al prossimo ingresso,
  // invece di restare bloccati sull'ultimo giorno passato corretto.
  useEffect(() => { if (screen !== "nutrition") setSelectedNutritionIso(null); }, [screen]);
  const [, forceMidnightTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceMidnightTick((n) => n + 1), 60000); // ricontrolla ogni minuto
    return () => clearInterval(id);
  }, []);

  // XP / livello / streak reali: STESSA formula del pannello coach e della
  // classifica globale — vedi computeRealXpAndStreak/xpToLevelInfo in
  // coachingData.js. isRealMode dichiarato qui (non più solo sotto, dove
  // vivono i 3 cerchi di compliance) perché streakXpBonus, subito sotto,
  // deve già vedere lo streak reale se disponibile.
  const isRealMode = Boolean(supabase && userId);
  const [realXpStreak, setRealXpStreak] = useState(null); // null = non ancora calcolato
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeRealXpAndStreak(supabase, userId)
      .then((r) => { if (!cancelled) setRealXpStreak(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo XP/streak", err);
        if (!cancelled) setRealXpStreak({ xpTotal: 0, streak: 0 });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);
  const realLevelInfo = isRealMode ? xpToLevelInfo(realXpStreak?.xpTotal ?? 0) : null;
  if (isRealMode) {
    streak = realXpStreak?.streak ?? 0;
    level = realLevelInfo.level;
    xp = realLevelInfo.xp;
    xpInLevel = realLevelInfo.xpInLevel;
    // Barra di progresso: xpNeeded è l'ampiezza TOTALE del livello corrente
    // (denominatore di xpInLevel/xpNeeded), non l'XP mancante al prossimo —
    // stessa convenzione del prop demo che sostituisce. A livello massimo la
    // barra resta piena (xpNeeded = xpInLevel, mai 0/0).
    xpNeeded = realLevelInfo.isMaxLevel ? Math.max(1, realLevelInfo.xpInLevel) : realLevelInfo.xpForNextLevel;
  }

  /* Più giorni di streak si accumulano, più in proporzione si guadagnano punti
     sulle task di oggi: +2% di XP per ogni giorno di streak, fino a un tetto
     del +50% per non farlo esplodere con streak molto lunghi. */
  const streakXpBonus = Math.min(0.5, streak * 0.02);

  // XP: niente più spiegazione permanente in UI (l'elenco "obiettivi di
  // oggi" con task + XP restava aperto ingombrando la Home) — solo
  // un'animazione breve nel momento esatto in cui un'azione sblocca
  // davvero i punti, ovunque ci si trovi nell'app in quel momento.
  const [xpToast, setXpToast] = useState(null); // { key, label, amount } | null
  const xpToastTimer = useRef(null);
  const fireXpToast = (label, amount) => {
    if (xpToastTimer.current) clearTimeout(xpToastTimer.current);
    setXpToast({ key: `${label}-${Date.now()}`, label, amount });
    xpToastTimer.current = setTimeout(() => setXpToast(null), 2600);
  };
  useEffect(() => () => { if (xpToastTimer.current) clearTimeout(xpToastTimer.current); }, []);

  // Stessi 6 obiettivi di sempre (ora non più elencati in permanenza):
  // un ref tiene il valore visto all'ultimo render, un toast scatta solo
  // alla transizione false→true (mai al primo mount, per non festeggiare
  // qualcosa già completato prima di aprire l'app oggi).
  const dailyGoals = [
    ["Allenamento completato", day.isTraining, 50],
    ["Sonno nel range 7-9h", sleep.hours >= 7 && sleep.hours <= 9, 20],
    ["Passi oltre 8.000", Number(steps) >= 8000, 20],
    ["Idratazione al target", water >= waterTarget, 20],
    ["Macros nel target", Math.abs(consumed.kcal - target.kcal) <= target.kcal * 0.05, 25],
    ["Almeno 4 pasti su 6", Object.values(mealsBySlot).filter((a) => a.length).length >= 4, 15],
  ];
  const prevGoalsRef = useRef({});
  useEffect(() => {
    dailyGoals.forEach(([label, done, baseXp]) => {
      const was = prevGoalsRef.current[label];
      if (done && was === false) fireXpToast(label, Math.round(baseXp * (1 + streakXpBonus)));
      prevGoalsRef.current[label] = done;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.isTraining, sleep.hours, steps, water, waterTarget, consumed.kcal, target.kcal, mealsBySlot, streakXpBonus]);

  const remaining = {
    kcal: Math.max(0, target.kcal - consumed.kcal),
    p: Math.max(0, target.p - consumed.p),
    c: Math.max(0, target.c - consumed.c),
    f: Math.max(0, target.f - consumed.f),
  };

  /* "Oggi" è sempre l'ultimo giorno della serie storica: cambiando un input
     (passi, sonno, RHR, HRV) l'ultima colonna si aggiorna e ricolora subito,
     senza dover ricaricare. Le settimane precedenti restano lo storico simulato. */
  const liveHistory = useMemo(() => {
    const sleepArr = [...(fullHistory.sleep || []), sleep.hours || 0];
    const stepsArr = [...(fullHistory.steps || []), Number(steps) || 0];
    const rhrFallback = fullHistory.rhr?.[fullHistory.rhr.length - 1] || 0;
    const hrvFallback = fullHistory.hrv?.[fullHistory.hrv.length - 1] || 0;
    const rhrArr = [...(fullHistory.rhr || []), Number(rhr) || rhrFallback];
    const hrvArr = [...(fullHistory.hrv || []), Number(hrv) || hrvFallback];
    return { sleep: sleepArr, steps: stepsArr, rhr: rhrArr, hrv: hrvArr };
  }, [fullHistory, sleep.hours, steps, rhr, hrv]);

  /* I 3 cerchi di compliance si aggiornano sui dati inseriti ogni giorno:
     Allenamento conta le serie realmente completate oggi (spunta dello Smart
     Rest Timer, tracciata via coachFeed) sul totale previsto dalla scheda;
     Alimentazione e Recupero usano consumato/target e sonno/passi di oggi.
     Tutti e tre uniscono il dato di oggi a uno storico simulato di 6 giorni. */
  const todayStr = toLocalISODate();
  const todayCompletedSets = (coachFeed || []).filter(
    (e) => e.type === "workout" && e.kind === "set-completed" && e.at && toLocalISODate(new Date(e.at)) === todayStr
  ).length;
  const todayExpectedSets = day.isTraining ? (exercises.reduce((a, e) => a + (e.sets || 0), 0) || 10) : 1;
  const todayTrainingPct = day.isTraining ? complPct((todayCompletedSets / todayExpectedSets) * 100) : 100;
  const trainPctComputed = complPct((TRAIN_HISTORY_6D.reduce((a, b) => a + b, 0) + todayTrainingPct) / 7);
  const nutriPctToday = nutritionPrecision(target, consumed);
  const nutriPctComputed = complPct(
    (NUTRI_HISTORY_6D.reduce((a, b) => a + b, 0) + nutriPctToday) / 7
  );
  const recoverySleep7 = [...RECOVERY_SLEEP_6D, sleep.hours || 0];
  const recoverySteps7 = [...RECOVERY_STEPS_6D, Number(steps) || 0];
  const recoveryPain7 = [...RECOVERY_PAIN_6D, 1]; // oggi: nessun dolore segnalato (default)
  const recoveryPctComputed = recoveryWeekScore(recoverySleep7, recoverySteps7, recoveryPain7);

  // Cerchio Allenamento reale: STESSA formula di ClientDetail (coach), mai
  // calcolata due volte — vedi computeTrainingCompliance in coachingData.js.
  // Il simulatore di test (trainOverride) resta solo per la preview demo:
  // sovrascrivere un numero reale con uno slider di prova sarebbe fuorviante.
  // (isRealMode è già dichiarato più sopra, vicino a XP/livello/streak.)
  const [realTrainCompliance, setRealTrainCompliance] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeTrainingCompliance(supabase, userId)
      .then((r) => { if (!cancelled) setRealTrainCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Allenamento", err);
        if (!cancelled) setRealTrainCompliance({ status: "neutral", pct: null, completionPct: null, progression: "neutral" });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);

  const trainPct = isRealMode ? (realTrainCompliance?.pct ?? null) : (trainOverride ?? trainPctComputed);

  // Cerchio Alimentazione reale: STESSA formula di ClientDetail (coach) — vedi
  // computeNutritionCompliance in coachingData.js. Legge solo nutrition_logs
  // + nutrition_targets già salvati, stesso principio degli altri due cerchi.
  const [realNutritionCompliance, setRealNutritionCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeNutritionCompliance(supabase, userId)
      .then((r) => { if (!cancelled) setRealNutritionCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Alimentazione", err);
        if (!cancelled) setRealNutritionCompliance({ status: "neutral", pct: null, daysScored: 0 });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);
  const nutriPct = isRealMode ? (realNutritionCompliance?.pct ?? null) : (nutriOverride ?? nutriPctComputed);

  // Cerchio Recupero reale: STESSA formula di ClientDetail (coach), mai
  // calcolata due volte — vedi computeRecoveryCompliance in coachingData.js.
  // Legge solo daily_metrics già salvato, non lo stato locale del form: si
  // calcola all'apertura della Home, non in diretta a ogni tasto — se il
  // cliente modifica sonno/passi lo vedrà aggiornato al prossimo ricaricamento,
  // stesso comportamento già scelto per il cerchio Allenamento. È il prezzo
  // di avere lo STESSO numero che vede il coach, non un mix stato-locale+DB.
  const [realRecoveryCompliance, setRealRecoveryCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeRecoveryCompliance(supabase, userId)
      .then((r) => { if (!cancelled) setRealRecoveryCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Recupero", err);
        if (!cancelled) setRealRecoveryCompliance({ status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0 });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);

  const recoveryPct = isRealMode ? (realRecoveryCompliance?.pct ?? null) : (recoveryOverride ?? recoveryPctComputed);
  const recoveryTrackedDays = isRealMode ? (realRecoveryCompliance?.trackedDays ?? 0) : recoverySleep7.filter((h) => h > 0).length;

  const progressionLabel = { positive: "In crescita", negative: "In calo", neutral: "Stabile" };

  const complianceRings = [
    {
      id: "train", label: "Allenamento", icon: Dumbbell, pct: trainPct,
      details: isRealMode
        ? [
            { label: "Completamento ultime 7 sessioni", value: realTrainCompliance?.completionPct != null ? `${realTrainCompliance.completionPct}%` : "…" },
            { label: "Progressione carichi vs 7 sessioni prima", value: realTrainCompliance ? progressionLabel[realTrainCompliance.progression] : "…" },
          ]
        : [
            { label: "Serie completate oggi", value: day.isTraining ? `${todayCompletedSets} / ${todayExpectedSets}` : "Riposo" },
            { label: "Media 7 giorni", value: `${trainPctComputed}%` },
            { label: "Diari carichi compilati (storico)", value: "6 / 7" },
          ],
    },
    {
      id: "nutri", label: "Alimentazione", icon: Salad, pct: nutriPct,
      details: isRealMode
        ? [
            { label: "Kcal oggi", value: `${consumed.kcal} / ${target.kcal}` },
            { label: "Giorni valutati (7g)", value: `${realNutritionCompliance?.daysScored ?? 0} / 7` },
          ]
        : [
            { label: "Precisione oggi vs target", value: `${nutriPctToday}%` },
            { label: "Kcal oggi", value: `${consumed.kcal} / ${target.kcal}` },
            { label: "Media 7 giorni", value: `${nutriPctComputed}%` },
          ],
    },
    {
      id: "recovery", label: "Recupero", icon: BedDouble, pct: recoveryPct,
      details: isRealMode
        ? [
            { label: "Sonno medio (7g)", value: realRecoveryCompliance?.sleepAvg != null ? `${realRecoveryCompliance.sleepAvg} h` : "…" },
            { label: "Passi medi (7g)", value: realRecoveryCompliance?.stepsAvg != null ? realRecoveryCompliance.stepsAvg.toLocaleString("it-IT") : "…" },
            { label: "Giorni tracciati", value: `${recoveryTrackedDays} / 7` },
          ]
        : [
            { label: "Sonno medio (7g)", value: `${(recoverySleep7.reduce((a, b) => a + b, 0) / 7).toFixed(1)} h` },
            { label: "Passi medi (7g)", value: Math.round(recoverySteps7.reduce((a, b) => a + b, 0) / 7).toLocaleString("it-IT") },
            { label: "Notti tracciate", value: `${recoveryTrackedDays} / 7` },
          ],
    },
  ];

  const reschedule = useMemo(
    () => (missedDayIdx > -1 ? proposeReschedule(weekPlan, missedDayIdx, day.weekday, musclesOf) : null),
    [missedDayIdx, weekPlan, day.weekday, musclesOf]
  );

  const back = (title) => (
    <div className="flex items-center gap-3 mb-5">
      <button onClick={() => setScreen("dash")}
              className="inner w-10 h-10 rounded-full flex items-center justify-center"
              aria-label="Torna alla Home">
        <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
      </button>
      <div>
        <p className="label mb-0.5">{WEEK_DAYS[day.weekday]}{day.weekNumber != null ? ` · settimana ${day.weekNumber}` : ""}</p>
        <h2 className="h1-gradient">{title}</h2>
      </div>
    </div>
  );

  /* Check del lunedì: blocca TUTTA la navigazione, qualunque schermata
     sia attiva, finché l'atleta non lo compila e invia. */
  if (showWeeklyCheck) {
    return (
      <WeeklyCheckModal
        accent={accent} accentText={accentText} accentSoft={accentSoft} gender={profile.gender}
        supabase={supabase} userId={userId}
        onSubmit={(data) => {
          onCoachSync && onCoachSync({ type: "weekly-check", ...data });
          setWeeklyCheckDone(true);
          setShowWeeklyCheck(false);
        }}
      />
    );
  }

  /* ------------------------------ DASHBOARD ------------------------------ */
  if (screen === "dash") {
    const greeting = getGreeting();
    const firstName = profile.nickname || profile.name.split(" ")[0];

    return (
      <div className="spring-in">
        <XpToastBanner toast={xpToast} />
        {/* banner unico: saluto, gamification, mesociclo, cerchi, livello e XP — niente più card separate */}
        <div className="gradient-border rounded-2xl px-5 py-5 mb-4" style={{ backgroundColor: "var(--surface)" }}>
          <div className="min-w-0" style={{ position: "relative", zIndex: 1 }}>
            <p className="greeting-text" style={{ color: "var(--ink)", fontSize: "1.55rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
              <span className="greeting-emoji">{greeting.icon}</span> {greeting.text}, {firstName}
            </p>

            {/* riga micro-satinata: titolo di livello + streak in tempo reale */}
            <div className="flex items-center justify-between gap-3 rounded-full px-4 py-2 mt-3"
                 style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <span className="title-shine" style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.02em" }}>
                {isRealMode ? `${realLevelInfo.icon} ${realLevelInfo.title}` : levelTitle(level)}
              </span>
              <span className="flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--ink)" }}>
                <Flame size={15} className={streak >= 15 ? "flame-3" : streak >= 8 ? "flame-2" : streak >= 4 ? "flame-1" : ""}
                       style={{ color: accent }} fill={accent} strokeWidth={1.4} />
                {streak} Giorni di Streak
              </span>
            </div>

            {day.mesociclo != null && (
              <div className="mt-3">
                <MesocicloBadge mesociclo={day.mesociclo} week={day.weekNumber} weeks={day.mesocicloWeeks ?? 4} />
              </div>
            )}
            <p className="meta mt-2">
              {day.dayNumber != null ? `Giorno ${day.dayNumber} del percorso · ` : ""}{WEEK_DAYS[day.weekday]}
            </p>
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
          {/* i 3 cerchi di compliance: dentro lo stesso banner, sopra il livello */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <ComplianceRings rings={complianceRings} onSelect={setActiveRingPopup} />
          </div>

          {/* barra XP: pulita, niente più elenco "obiettivi di oggi" da
              espandere — il feedback su cosa fa guadagnare punti arriva
              come animazione (XpToastBanner) nel momento in cui succede. */}
          <div className="w-full mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "var(--ink)", fontSize: "0.9rem", fontWeight: 500 }}>
                Livello {level}
              </span>
              <span className="meta font-data">{xpInLevel} / {xpNeeded} XP</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 10, backgroundColor: "var(--surface-2)" }}>
              <div className="xp-bar xp-bar-shine relative h-full rounded-full overflow-hidden"
                   style={{ width: `${Math.min(100, (xpInLevel / xpNeeded) * 100)}%`,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                <div className="absolute inset-x-0 top-0" style={{ height: "55%",
                       background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))" }} />
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* "Vai in vacanza / chiedi riposo forzato" vive ora nel Profilo
            personale (08_ClientProfileView.jsx), non più qui in Home. */}

        {/* simulatore di test: solo per provare rapidamente i colori/soglie —
            nascosto in modalità reale, non serve (e non avrebbe più effetto
            sul cerchio Allenamento, calcolato davvero) a un cliente vero. */}
        {!isRealMode && (
        <button onClick={() => setRingTestOpen((v) => !v)} className="text-xs mb-4" style={{ color: "var(--ink-2)" }}>
          🧪 {ringTestOpen ? "Nascondi simulatore" : "Simula percentuali (solo test)"}
        </button>
        )}
        {!isRealMode && ringTestOpen && (
          <div className="spring-in rounded-2xl p-4 mb-4 space-y-4"
               style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
            {[
              { label: "Allenamento", value: trainPct, set: setTrainOverride },
              { label: "Alimentazione", value: nutriPct, set: setNutriOverride },
              { label: "Recupero", value: recoveryPct, set: setRecoveryOverride },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
                  <span>{s.label}</span><span>{s.value}%</span>
                </div>
                <input type="range" min="0" max="100" value={s.value}
                       onChange={(e) => s.set(Number(e.target.value))} className="w-full" />
              </div>
            ))}
            <button onClick={() => { setTrainOverride(null); setNutriOverride(null); setRecoveryOverride(null); }}
                    className="text-xs" style={{ color: accentText, fontWeight: 700 }}>
              Usa dati reali
            </button>
            {onSimulateInactivity && (
              <div className="pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--ink-2)" }}>
                  Streak: si azzera se passano più di 24h senza registrare nulla.
                </p>
                <div className="flex gap-2">
                  <button onClick={onSimulateInactivity} className="text-xs rounded-full px-3 py-1.5"
                          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>
                    Simula 3 giorni fermo
                  </button>
                  <button onClick={onResetActivityToday} className="text-xs rounded-full px-3 py-1.5"
                          style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
                    Registra attività oggi
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <CompliancePopup ring={complianceRings.find((r) => r.id === activeRingPopup)} onClose={() => setActiveRingPopup(null)} />

        {/* auto-split del giorno saltato */}
        {reschedule && access.pro && (
          <div className="on-light rounded-2xl p-5 mb-4"
               style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <p className="font-data mb-1.5" style={{ fontSize: "0.6rem", letterSpacing: "0.16em",
                    textTransform: "uppercase", color: "#B45309" }}>
              <RefreshCw size={11} className="inline mr-1.5" style={{ verticalAlign: "-2px" }} />
              Riorganizzazione automatica
            </p>
            <p className="text-sm mb-1" style={{ fontWeight: 500 }}>
              {WEEK_DAYS[reschedule.from]} è saltato: «{reschedule.label}» non risulta completato.
            </p>
            <p className="text-sm leading-relaxed mb-3">
              Propongo di spostarlo a <b>{WEEK_DAYS[reschedule.to]}</b>: il volume settimanale su{" "}
              {reschedule.muscles.slice(0, 4).join(", ")} resta identico
              {reschedule.conflict === 0
                ? " e resta almeno un giorno pieno di recupero tra sedute sugli stessi distretti."
                : " con una sovrapposizione minima, gestibile togliendo una serie al primo esercizio."}{" "}
              Non recuperiamo accumulando due sessioni di fila: si perde più di quanto si guadagna.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onApplyReschedule(reschedule)}
                      className="rounded-full px-4 py-2.5 text-sm btn-3d"
                      style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
                Sposta a {WEEK_DAYS[reschedule.to]}
              </button>
              <button onClick={onDismissReschedule}
                      className="rounded-full px-4 py-2.5 text-sm"
                      style={{ border: "1px solid rgba(17,17,17,0.15)" }}>
                Lascia così
              </button>
            </div>
          </div>
        )}

        {/* le macro-finestre */}
        <div className="grid grid-cols-1 gap-4">
          <Window3D icon={Dumbbell} label="Allenamento" accent={accent} floatClass="icon-float-1"
            sub={day.isTraining ? day.sessionLabel : "Giorno di riposo"}
            onClick={() => setScreen("workout")} />
          <Window3D icon={Salad} label="Alimentazione" accent={accent} floatClass="icon-float-2"
            sub={`${remaining.kcal} kcal rimanenti`}
            onClick={() => setScreen("nutrition")} />
          <Window3D icon={BedDouble} label="Recupero e Attività" accent={accent} floatClass="icon-float-3"
            sub={access.recovery
              ? (sleep.hours ? `${sleep.hours.toFixed(1)}h dormite · ${Number(steps || 0).toLocaleString("it-IT")} passi` : "Registra la notte")
              : ""}
            locked={!access.recovery} onLocked={onUpgrade}
            onClick={() => setScreen("recovery")} />
          <Window3D icon={Pill} label="Integrazione e Timing" accent={accent} floatClass="icon-float-2"
            sub={access.pro ? "Piano del coach attivo" : "Diario libero + wiki scientifica"}
            onClick={() => setScreen("supplements")} />
        </div>
      </div>
    );
  }

  /* ------------------------------ ALLENAMENTO ---------------------------- */
  if (screen === "workout") {
    // Auto-regolazione da recupero reale: il sonno è l'unico dato di
    // recupero disponibile a TUTTI i piani (HRV/RHR sono Premium+ e spesso
    // manuali) — se la notte scorsa è stata corta, un avviso concreto
    // prima di iniziare la sessione, non solo un numero su un grafico.
    const lastNightSleep = sleep?.hours || fullHistory?.sleep?.[fullHistory.sleep.length - 1] || null;
    const poorSleep = lastNightSleep != null && lastNightSleep > 0 && lastNightSleep < THRESH.sleep.bad;
    return (
      <div className="spring-in">
        <XpToastBanner toast={xpToast} />
        {back("Allenamento")}

        <div className="grid grid-cols-3 gap-1.5 mb-5">
          {[["pesi", "Allenamento Pesi"], ["cardio", "Allenamento Cardio"], ["wiki", "Wiki Allenamento"]].map(([id, lab]) => {
            const on = workoutTab === id;
            return (
              <button key={id} onClick={() => setWorkoutTab(id)}
                className="rounded-2xl px-1.5 py-3 transition-all duration-300"
                style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                          : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                <span className="font-data block leading-tight" style={{ fontSize: "0.52rem", letterSpacing: "0.04em",
                        textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>{lab}</span>
              </button>
            );
          })}
        </div>

        {workoutTab === "pesi" && (
          <div className="spring-in">
            {poorSleep && day.isTraining && (
              <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-start gap-3"
                   style={{ backgroundColor: "rgba(240,160,32,0.1)", border: "1px solid rgba(240,160,32,0.35)" }}>
                <span style={{ fontSize: "1.2rem" }}>😴</span>
                <div>
                  <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 700 }}>
                    Hai dormito {lastNightSleep.toFixed(1)}h — sotto le {THRESH.sleep.bad}h consigliate
                  </p>
                  <p className="meta mt-0.5" style={{ lineHeight: 1.5 }}>
                    Il recupero del sistema nervoso è ridotto: valuta di scendere di 1-2 RIR sull'ultima serie di ogni
                    esercizio o di togliere una serie sugli esercizi più pesanti. Non serve saltare la sessione.
                  </p>
                </div>
              </div>
            )}
            {access.pro ? (
              <>
                <WorkoutCalendarStrip weekPlan={weekPlan} selectedIso={selectedCalendarIso} onSelectIso={setSelectedCalendarIso} />
                {selectedCalendarIso ? (
                  <CalendarDayReadOnlyView date={new Date(selectedCalendarIso)} weekPlan={weekPlan} />
                ) : !day.isTraining ? (
                  <div className="card text-center py-10">
                    <BedDouble size={26} className="mx-auto mb-3" style={{ color: accent }} />
                    <p className="h2 mb-1">Oggi è un giorno di riposo</p>
                    <p className="body max-w-xs mx-auto">
                      Nessuna sessione programmata: il recupero è parte del piano, non una pausa dal piano.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {exercises.map((ex, exIdx) => (
                      <ExerciseCard
                        key={ex.id}
                        ex={ex}
                        index={exIdx}
                        rows={setsFor(ex)}
                        onSetField={onSetField}
                        accent={accent}
                        accentText={accentText}
                        userPlan={userPlan}
                        gender={profile.gender}
                        onUpgrade={onUpgrade}
                        onCoachSync={onCoachSync}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <VolumeMatrixCard weekDays={weekPlan} userPlan={userPlan} gender={profile.gender} onUpgrade={onUpgrade} accent={accent} supabase={supabase} userId={userId} />
                </div>
              </>
            ) : (
              <FreeWorkoutBuilder accent={accent} accentText={accentText} accentSoft={accentSoft}
                                   day={day} onUpgrade={onUpgrade} onCoachSync={onCoachSync} userPlan={userPlan} gender={profile.gender}
                                   supabase={supabase} userId={userId} />
            )}
          </div>
        )}

        {workoutTab === "cardio" && (
          <div className="spring-in">
            <CardioSection supabase={supabase} userId={userId} accent={accent} subsAccess={access.paid} onUpgrade={onUpgrade} />
          </div>
        )}

        {workoutTab === "wiki" && (
          <div className="spring-in">
            {access.paid ? (
              <WikiBrowser title="Wiki Allenamento" subtitle="I principi dietro un piano che funziona" data={TRAINING_WIKI} accent={accent}
                intro="Volume, intensità, frequenza e sovraccarico progressivo non sono concetti nati in sala pesi: sono i principi con cui il corpo umano si adatta a qualsiasi sforzo ripetuto — servono a mantenere la massa muscolare e la densità ossea con l'età (prevenzione di sarcopenia e cadute), a costruire la base atletica in qualunque sport, a riabilitarsi dopo un infortunio, e più in generale a restare funzionali nella vita di tutti i giorni. La sala pesi è semplicemente il contesto più controllato e misurabile per applicarli: pro, un ambiente prevedibile dove ogni variabile (carico, serie, recupero) si programma e si verifica; contro, richiede attrezzatura e costanza, e un piano tarato solo sull'estetica può trascurare mobilità e pattern di movimento utili fuori dalla palestra."
                searchPlaceholder="Cerca un argomento (es. volume, RIR, deload...)" />
            ) : (
              <LockedPanel onUpgrade={onUpgrade} accent={accent}
                text="La Wiki Allenamento è disponibile dagli abbonamenti a pagamento, a partire da 5€/mese: capisci il perché dietro ogni scelta del tuo piano." />
            )}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ ALIMENTAZIONE ------------------------- */
  if (screen === "nutrition") {
    // Full Coaching: dieta tipo/target la fissa il coach. Tutti gli altri
    // piani (FREE, Performance Pack, Scheda Personalizzata, Solo Allenamento
    // Coaching) se li calcolano/impostano da soli — vedi NutritionTargetsPanel.
    const targetIsCoachSet = userPlan === "full_coaching";
    return (
      <div className="spring-in">
        <XpToastBanner toast={xpToast} />
        {back("Alimentazione")}

        {/* Striscia calendario: come su Allenamento, per tornare su un giorno
            passato e aggiungere un pasto dimenticato. Oro/Rosa (Giorno ON,
            allenamento) o superficie neutra (Giorno OFF, riposo) — stesso
            weekPlan usato per isTrainingDay/i target di oggi. */}
        <NutritionCalendarStrip weekPlan={weekPlan} selectedIso={selectedNutritionIso} onSelectIso={setSelectedNutritionIso} accent={accent} />

        {selectedNutritionIso ? (
          <div className="rounded-2xl px-4 py-3 mb-5 flex items-center justify-between gap-3"
               style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div>
              <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 700, textTransform: "capitalize" }}>
                {new Date(selectedNutritionIso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <p className="meta mt-0.5">{weekPlan[isoWeekdayOf(new Date(selectedNutritionIso))] ? "🏋️ Giorno ON — Allenamento" : "🧘 Giorno OFF — Riposo"}</p>
            </div>
            <button onClick={() => setSelectedNutritionIso(null)}
              className="shrink-0 rounded-full px-3.5 py-2 text-xs"
              style={{ backgroundColor: "var(--ink)", color: "var(--page)", fontWeight: 600 }}>
              Torna a oggi
            </button>
          </div>
        ) : (
          <>
            {/* I tuoi target + Idratazione: in cima, compatti e affiancati — non
                più un box grande "Rimanenti oggi" seguito da un tab separato "I
                Miei Target" più sotto. "Modifica"/"Dettagli" espande il pannello
                completo (calcolo con le formule, o sola lettura se Full Coaching)
                qui sotto, senza lasciare la pagina. */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="card">
                <p className="label mb-1.5">I tuoi target · oggi</p>
                {/* consumato/target per ciascun valore, non più solo "rimanenti":
                    il numero a sinistra (consumato) sale con calcolo preciso ad
                    ogni alimento aggiunto — stessa fonte (consumed) del diario. */}
                <p className="font-data mb-1.5" style={{ fontSize: "1.15rem", fontWeight: 800, color: accent }}>
                  {consumed.kcal}<span style={{ fontSize: "0.85rem", fontWeight: 600, opacity: 0.75 }}>/{target.kcal}</span>
                  <span className="meta" style={{ fontSize: "0.62rem", fontWeight: 600, marginLeft: 4 }}>kcal consumate</span>
                </p>
                {/* un macro per riga: affiancati andavano a capo male su schermi
                    stretti (spaginava), qui ogni riga sta sempre su una colonna. */}
                <div className="space-y-0.5 font-data mb-2.5" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                  <p style={{ color: MACRO_COLORS.p.base }}>Proteine {consumed.p}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.p}g</span></p>
                  <p style={{ color: MACRO_COLORS.c.base }}>Carboidrati {consumed.c}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.c}g</span></p>
                  <p style={{ color: MACRO_COLORS.f.base }}>Grassi {consumed.f}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.f}g</span></p>
                </div>
                <button onClick={() => setTargetsOpen((v) => !v)}
                  className="w-full rounded-full px-3 py-2 text-xs transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: targetsOpen ? "var(--ink)" : "var(--surface-2)",
                           color: targetsOpen ? "var(--page)" : "var(--ink-2)",
                           border: targetsOpen ? "none" : "1px solid var(--line)", fontWeight: 600 }}>
                  {targetsOpen ? "Chiudi" : targetIsCoachSet ? "Dettagli" : "Modifica"}
                </button>
              </div>

              <div className="card">
                <p className="label mb-1.5">Idratazione</p>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => { haptic("tap"); onAddWater(); }} aria-label="Aggiungi 250 ml"
                          className="relative rounded-xl overflow-hidden shrink-0 transition-transform active:scale-95"
                          style={{ width: 40, height: 62,
                                   background: "linear-gradient(145deg, var(--surface-2) 0%, var(--surface) 100%)",
                                   border: "2px solid var(--line)",
                                   boxShadow: "inset 0 2px 4px rgba(255,255,255,0.5), 0 6px 16px rgba(0,0,0,0.12)" }}>
                    <span className="water-wave absolute left-0 right-0 bottom-0"
                          style={{ height: `${Math.min(100, (water / waterTarget) * 100)}%`,
                                   background: water >= waterTarget
                                     ? `linear-gradient(180deg, ${accentSoft} 0%, ${accent} 100%)`
                                     : "linear-gradient(180deg, #BFD9E8 0%, #7FB3D0 100%)",
                                   transition: "height 0.5s cubic-bezier(0.22,1,0.36,1)" }} />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Droplets size={15} style={{ color: water >= waterTarget ? "#111111" : "#4A6B7C" }} />
                    </span>
                  </button>
                  <div className="min-w-0">
                    <p className="font-data" style={{ color: "var(--ink)", fontSize: "1.05rem", fontWeight: 700 }}>
                      {(water / 1000).toFixed(2)} L
                    </p>
                    <p className="meta" style={{ fontSize: "0.65rem" }}>/ {(waterTarget / 1000).toFixed(1)} L</p>
                  </div>
                </div>
              </div>
            </div>

            {targetsOpen && (
              <div className="mb-5">
                <NutritionTargetsPanel accent={accent} accentSoft={accentSoft} accentText={accentText}
                  targetOn={targetOn} targetOff={targetOff} onSetTargetOn={onSetTargetOn} onSetTargetOff={onSetTargetOff}
                  isTrainingDay={isTrainingDay} onToggleTrainingDay={onToggleTrainingDay}
                  waterTarget={waterTarget} onSetWaterTarget={onSetWaterTarget}
                  isPro={targetIsCoachSet} onUpgrade={onUpgrade} />
              </div>
            )}
          </>
        )}

        {selectedNutritionIso && pastMealsLoading ? (
          <div className="card text-center py-10">
            <Loader2 size={22} className="mx-auto mb-2 animate-spin" style={{ color: accent }} />
            <p className="body">Carico il diario di quel giorno…</p>
          </div>
        ) : (
          <NutritionTabs
            accent={accent} accentSoft={accentSoft} accentText={accentText}
            target={target} mealsBySlot={selectedNutritionIso ? (pastMeals || {}) : mealsBySlot} foods={foods}
            mealGuide={mealGuide} substitutions={substitutions}
            onAddFood={selectedNutritionIso ? addFoodForPastDay : onAddFood}
            onRemoveFood={selectedNutritionIso ? removeFoodForPastDay : onRemoveFood}
            onUpdateFood={selectedNutritionIso ? updateFoodForPastDay : onUpdateFood}
            onOpenScanner={onOpenScanner} onAddCustomFood={onAddCustomFood}
            onCopyYesterday={selectedNutritionIso ? null : onCopyYesterday} onShoppingList={onShoppingList} supabase={supabase}
            fullAccess={targetIsCoachSet}
            subsAccess={userPlan === "performance_pack" || userPlan === "full_coaching"}
            onUpgrade={onUpgrade}
            userPlan={userPlan} gender={profile.gender} waterMl={water} microAddon={microAddon}
            digestValue={digestValue}
            onDigestChange={(v) => { setDigestValue(v); onCoachSync && onCoachSync({ type: "bio-symptom", symptom: "digest", value: v }); }}
            pastDayMode={!!selectedNutritionIso}
          />
        )}
      </div>
    );
  }

  /* ------------------------- INTEGRAZIONE E TIMING ----------------------- */
  if (screen === "supplements") {
    return (
      <div className="spring-in">
        <XpToastBanner toast={xpToast} />
        {back("Integrazione e Timing")}
        <SupplementsPanel accent={accent} accentSoft={accentSoft} accentText={accentText}
                           isPro={userPlan === "full_coaching"} isPaid={!!access.paid} isTrainingDay={isTrainingDay}
                           onUpgrade={onUpgrade} onCoachSync={onCoachSync} onXpEarned={fireXpToast}
                           supabase={supabase} userId={userId} />
      </div>
    );
  }

  /* ------------------------------ RECUPERO ------------------------------ */
  return (
    <div className="spring-in">
      <XpToastBanner toast={xpToast} />
      {back("Recupero e Attività")}

      {/* sonno: casella pulita sopra al grafico, niente card/etichette/legenda colori attorno */}
      <div className="mb-4">
        <p className="label mb-1.5">Inserisci l'ora in cui ti sei addormentato e l'ora della sveglia</p>
        <div className="flex items-center gap-2 mb-2">
          <input type="time" value={sleep.start || ""} onChange={(e) => onSetSleep("start", e.target.value)}
                 aria-label="Ora in cui ti sei addormentato" className="input flex-1 px-3 py-2 text-sm font-data" />
          <span className="meta" style={{ fontSize: "0.7rem" }}>→</span>
          <input type="time" value={sleep.end || ""} onChange={(e) => onSetSleep("end", e.target.value)}
                 aria-label="Ora della sveglia" className="input flex-1 px-3 py-2 text-sm font-data" />
          {sleep.hours > 0 && (
            <span className="font-data shrink-0" style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--ink)" }}>
              {sleep.hours.toFixed(1)}h
            </span>
          )}
        </div>
        <Chart3D kind="sleep" series={liveHistory.sleep} title="😴 Sonno — ore per notte" onEditDay={onEditSleepDay} />
      </div>

      {/* passi: stessa casella pulita sopra al grafico */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Footprints size={16} style={{ color: accent }} className="shrink-0" />
          <input type="number" min="0" value={steps} onChange={(e) => onSetSteps(e.target.value)}
                 disabled={isRealMode ? false : autoSteps} placeholder="Passi di oggi"
                 aria-label="Passi di oggi" className="input flex-1 px-3 py-2 text-sm font-data disabled:opacity-70" />
        </div>
        <Chart3D kind="steps" series={liveHistory.steps} title="👣 Passi — al giorno" onEditDay={onEditStepsDay} />
        {isRealMode ? (
          isAndroid() && isGoogleFitConfigured() ? (
            <GoogleFitStepsSync accent={accent} onSetSteps={onSetSteps} />
          ) : (
            <div className="inner px-4 py-3.5 mt-3">
              <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>Sincronizzazione automatica</p>
              <p className="meta mt-0.5 leading-relaxed">
                {isAndroid()
                  ? "Google Fit non ancora configurato per questo account."
                  : "Funzionalità disponibile a breve — Apple Salute richiede un'app nativa o un servizio di terze parti."}
                {" "}Nel frattempo i passi si registrano qui sopra, a mano.
              </p>
            </div>
          )
        ) : (
        <div className="inner px-4 py-3.5 mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>Sincronizza automaticamente</p>
            <p className="meta mt-0.5 leading-relaxed">
              {autoSteps
                ? "Collegato ai sensori del telefono · si consolida a mezzanotte"
                : "Apple Salute o Google Fit: leggo i passi dal contapassi, senza inserirli a mano"}
            </p>
          </div>
          <button onClick={onToggleAutoSteps} role="switch" aria-checked={autoSteps}
                  aria-label="Sincronizzazione automatica dei passi"
                  className="relative rounded-full transition-all duration-300 shrink-0"
                  style={{ width: 48, height: 28, backgroundColor: autoSteps ? accent : "var(--surface-2)",
                           border: autoSteps ? "none" : "1px solid var(--line)" }}>
            <span className="absolute rounded-full transition-all duration-300"
                  style={{ width: 22, height: 22, top: 3, left: autoSteps ? 23 : 3,
                           backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" }} />
          </button>
        </div>
        )}
      </div>

      {isRealMode ? (
        // HRV/RHR richiedono un device che li misuri davvero (smartwatch/anello):
        // nessuna via gratuita per leggerli qui, un aggregatore terzo è a
        // pagamento e non ancora attivato — meglio un avviso onesto che un
        // finto input manuale che nessun cliente può compilare con un dato vero.
        <div className="card mb-4 text-center py-6">
          <p className="h2 mb-1">RHR e HRV in arrivo</p>
          <p className="body max-w-xs mx-auto">
            Richiedono uno smartwatch o un anello che li misuri: il collegamento è in valutazione.
            Sonno e passi restano già disponibili qui sopra.
          </p>
          <span className="inline-block mt-3 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
            Disponibile a breve
          </span>
        </div>
      ) : (
        <>
          <HrvMatrixWidget hrv={hrv} rhr={rhr} accent={accent} />

          {/* battiti a riposo e HRV, come da smartwatch (Apple Watch / Android) */}
          <div className="card mb-4">
            <p className="label mb-3">Battiti a riposo (RHR) e variabilità cardiaca (HRV)</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">RHR (bpm)</span>
                <input type="number" min="30" max="120" value={rhr} onChange={(e) => onSetRhr(e.target.value)}
                       placeholder="es. 58" className="input w-full px-4 py-3 font-data" />
              </label>
              <label className="block">
                <span className="label block mb-1.5">HRV (ms)</span>
                <input type="number" min="10" max="150" value={hrv} onChange={(e) => onSetHrv(e.target.value)}
                       placeholder="es. 62" className="input w-full px-4 py-3 font-data" />
              </label>
            </div>
            <p className="meta leading-relaxed" style={{ fontSize: "0.68rem" }}>
              Prova a cambiare i valori: il widget HRV Matrix qui sopra e i grafici qui sotto si aggiornano subito.
            </p>
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <span aria-hidden="true" style={{ fontSize: "13px", lineHeight: 1 }}>💓</span>
            <p className="label" style={{ margin: 0 }}>HRV · rosso &lt;40ms · arancione 40-60ms · verde &gt;60ms</p>
          </div>
          <div className="mb-4">
            {userPlan === "free"
              ? <LockedChartOverlay gender={profile.gender} onUpgrade={onUpgrade} />
              : <Chart3D kind="hrv" series={liveHistory.hrv} />}
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <span aria-hidden="true" style={{ fontSize: "13px", lineHeight: 1 }}>❤️</span>
            <p className="label" style={{ margin: 0 }}>RHR a riposo · verde &lt;65bpm · arancione 65-75bpm · rosso &gt;75bpm</p>
          </div>
          <div className="mb-4">
            {userPlan === "free"
              ? <LockedChartOverlay gender={profile.gender} onUpgrade={onUpgrade} />
              : <Chart3D kind="rhr" series={liveHistory.rhr} />}
          </div>
          <p className="meta font-data mb-4 leading-relaxed" style={{ fontSize: "0.68rem" }}>
            I passi si sincronizzano ogni mezzanotte dai sensori del telefono. Il sonno si calcola
            dagli orari di addormentamento e sveglia. RHR e HRV arrivano dal sensore ottico del polso.
          </p>
        </>
      )}

      {/* Cruscotto Recupero Neurale: sonno REM stimato, stress, caffeina con emivita */}
      {userPlan === "free" ? (
        <div className="mb-4">
          <p className="label mb-3">Cruscotto Recupero Neurale</p>
          <LockedChartOverlay gender={profile.gender} onUpgrade={onUpgrade} />
        </div>
      ) : (() => {
        const mg = Number(caffeineMg);
        let caffAlert = null;
        if (mg > 0 && caffeineTime && sleep.start) {
          const [ch, cm] = caffeineTime.split(":").map(Number);
          const [sh, sm] = sleep.start.split(":").map(Number);
          let hoursElapsed = (sh * 60 + sm - (ch * 60 + cm)) / 60;
          if (hoursElapsed < 0) hoursElapsed += 24;
          const residual = Math.round(mg * Math.pow(0.5, hoursElapsed / 5));
          if (hoursElapsed < 6) caffAlert = { hoursElapsed, residual };
        }
        const remEstimate = computeRemSleepEstimate({
          sleepHours: sleep.hours, stressLevel, nightWakeups,
          caffeineResidualMg: caffAlert?.residual, morningEnergy,
        });
        return (
          <div className="card mb-4">
            <p className="label mb-1">Cruscotto Recupero Neurale</p>
            <p className="h1 mb-1">Sonno REM, stress e stimolanti</p>

            <div className="inner flex items-center justify-between px-4 py-3 mb-3">
              <span className="text-sm" style={{ color: "var(--ink)" }}>Sonno profondo stimato</span>
              <span className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>
                {remEstimate != null ? `~${remEstimate} h` : "n/d"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">Stress mentale (1-10)</span>
                <select value={stressLevel} onChange={(e) => onSetStressLevel(e.target.value)}
                        className="input w-full px-4 py-3 text-sm">
                  <option value="">— valuta —</option>
                  {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label block mb-1.5">Risvegli notturni</span>
                <select value={nightWakeups} onChange={(e) => onSetNightWakeups(e.target.value)}
                        className="input w-full px-4 py-3 text-sm">
                  <option value="">— valuta —</option>
                  {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 4 ? "4+" : n}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label block mb-1.5">Energia al risveglio (1-10)</span>
                <select value={morningEnergy} onChange={(e) => onSetMorningEnergy(e.target.value)}
                        className="input w-full px-4 py-3 text-sm">
                  <option value="">— valuta —</option>
                  {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            <p className="label mb-2">Caffeina di oggi</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">Mg assunti</span>
                <input type="text" inputMode="decimal" value={caffeineMg}
                       onChange={(e) => onSetCaffeineMg(e.target.value.replace(",", "."))}
                       placeholder="es. 200" className="input w-full px-4 py-3 font-data" />
              </label>
              <label className="block">
                <span className="label block mb-1.5">Orario ultima dose</span>
                <input type="time" value={caffeineTime} onChange={(e) => onSetCaffeineTime(e.target.value)}
                       className="input w-full px-4 py-3 font-data" />
              </label>
            </div>

            {caffAlert && (
              <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#78350F", lineHeight: 1.5 }}>
                  ⚠️ Emivita caffeina (~5h): ~{caffAlert.residual}mg ancora in circolo stimati a letto. Sopra i
                  50mg residui la letteratura segnala interferenza su addormentamento e fase REM — valuta di
                  anticipare l'ultima dose.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {!access.pro && <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Sonno e passi dicono molto, ma solo se qualcuno li legge nel contesto giusto. Fatti aiutare da un professionista del settore che li integra nel tuo piano completo: vedi gli abbonamenti per iniziare." />}
    </div>
  );
}

/* ============================================================================
   SEZIONE CARDIO — registro attività stile diario Strava semplificato
   Parte del Diario Libero (disponibile a tutti i piani, come dieta/carichi/
   integrazione/passi/sonno già elencati in FREE): registrazione manuale di
   tipo/durata/distanza, storico recente con passo/ritmo calcolato quando c'è
   la distanza, niente dati finti — vuoto finché il cliente non registra
   davvero un'attività (stesso principio già applicato a sonno/passi).
   ========================================================================== */
// BUG PRESO: "Canottaggio/Vogatore" mischiava in una sola voce la voga
// all'aperto (che ha senso tracciare col GPS, si muove nello spazio) e il
// vogatore da palestra (fermo, GPS inutile, ma con SPM/passo /500m — le
// metriche che chi voga davvero guarda). Separati: canottaggio resta
// all'aperto, "Vogatore" è ora un macchinario a sé con i suoi campi.
//
// group: "outdoor" (GPS reale possibile, vedi GPS_CAPABLE/LOOP_ROUTE_CAPABLE
// sotto) o "machine" (fermo, mai GPS — la sezione mostra invece i campi di
// MACHINE_FIELDS specifici per quell'attrezzo, non un form generico uguale
// per tutti). "altro"/"nuoto" restano fuori da entrambi i gruppi: manuale
// puro, nessun campo extra dedicato.
const CARDIO_ACTIVITIES = [
  { id: "corsa", label: "Corsa", icon: "🏃", group: "outdoor" },
  { id: "camminata", label: "Camminata", icon: "🚶", group: "outdoor" },
  { id: "bici", label: "Bici", icon: "🚴", group: "outdoor" },
  { id: "canottaggio", label: "Canottaggio", icon: "🚣", group: "outdoor" },
  { id: "nuoto", label: "Nuoto", icon: "🏊" },
  { id: "tapis_roulant", label: "Tapis Roulant", icon: "🏃‍♂️", group: "machine" },
  { id: "cyclette", label: "Cyclette", icon: "🚲", group: "machine" },
  { id: "ellittica", label: "Ellittica", icon: "🌀", group: "machine" },
  { id: "vogatore", label: "Vogatore", icon: "🛶", group: "machine" },
  { id: "scalatore", label: "Scalatore", icon: "🪜", group: "machine" },
  { id: "altro", label: "Altro", icon: "🔥" },
];
const CARDIO_ACTIVITY_GROUPS = [
  { id: "outdoor", label: "All'aperto — GPS" },
  { id: "machine", label: "In palestra" },
  { id: null, label: "Altro" },
];
// Canottaggio resta GPS-capace (si muove davvero nello spazio, sull'acqua)
// ma senza le strade da seguire di corsa/camminata/bici — LOOP_ROUTE_CAPABLE
// è il sottoinsieme più stretto per cui ha senso chiedere a Mapbox un
// percorso su strada.
const GPS_CAPABLE = new Set(["corsa", "camminata", "bici", "canottaggio"]);
const LOOP_ROUTE_CAPABLE = new Set(["corsa", "camminata", "bici"]);

// Metriche reali per macchinario, non un form generico uguale per tutti:
// ognuna è quella che chi usa davvero quell'attrezzo guarda sul display.
const MACHINE_FIELDS = {
  tapis_roulant: [
    { key: "incline_pct", label: "Pendenza media (%)", placeholder: "es. 2.5", step: "0.5" },
    { key: "speed_avg_kmh", label: "Velocità media (km/h)", placeholder: "es. 10.5", step: "0.1" },
  ],
  cyclette: [
    { key: "resistance_level", label: "Resistenza (livello)", placeholder: "es. 12", step: "1" },
    { key: "power_avg_w", label: "Potenza media (W)", placeholder: "es. 180", step: "1" },
  ],
  ellittica: [
    { key: "resistance_level", label: "Resistenza (livello)", placeholder: "es. 8", step: "1" },
  ],
  vogatore: [
    { key: "spm", label: "Colpi al minuto (SPM)", placeholder: "es. 24", step: "1" },
    { key: "split_500m_sec", label: "Passo medio /500m (sec)", placeholder: "es. 128", step: "1" },
  ],
  scalatore: [
    { key: "floors", label: "Piani saliti", placeholder: "es. 45", step: "1" },
    { key: "resistance_level", label: "Resistenza (livello)", placeholder: "es. 10", step: "1" },
  ],
};

const INTENSITY_STYLES = [
  { id: "liss", label: "LISS", full: "Bassa intensità costante" },
  { id: "moderate", label: "Moderata", full: "Ritmo medio, senza intervalli" },
  { id: "hiit", label: "HIIT", full: "Alta intensità a intervalli" },
];

function paceLabel(durationMin, distanceKm) {
  if (!distanceKm || distanceKm <= 0) return null;
  const paceMinPerKm = durationMin / distanceKm;
  const m = Math.floor(paceMinPerKm);
  const s = Math.round((paceMinPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} min/km`;
}

// Distanza reale fra due punti GPS (formula di haversine, km) — nessuna
// libreria esterna, è poche righe di trigonometria sferica standard.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* Mappa del percorso — Leaflet + tile OpenStreetMap, caricati SOLO qui
   (import dinamico) quando una mappa serve davvero. `live=true` ricentra
   la vista sull'ultimo punto ad ogni aggiornamento (tracciamento in
   corso); `live=false` inquadra l'intero percorso una volta sola (storico). */
function RouteMap({ points, live, accent, height = 220, guidePoints }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const guideLineRef = useRef(null); // percorso ad anello suggerito, tratteggiato, solo guida visiva
  const markerRef = useRef(null); // puntino blu della posizione attuale, solo live
  const leafletRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: live, attributionControl: true, dragging: true, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      const start = points?.[0] || { lat: 45.4642, lng: 9.19 }; // Milano come centro neutro se non c'è ancora un punto
      map.setView([start.lat, start.lng], live ? 17 : 15);
      polylineRef.current = L.polyline([], { color: accent, weight: 5, opacity: 0.95, lineJoin: "round", lineCap: "round" }).addTo(map);
      guideLineRef.current = L.polyline([], { color: accent, weight: 3, opacity: 0.55, dashArray: "2, 10", lineCap: "round" }).addTo(map);
      mapRef.current = map;
      setReady(true);
      // Leaflet calcola le dimensioni al momento della creazione: se il
      // contenitore non aveva ancora le sue dimensioni finali (layout non
      // ancora assestato dentro il Portal), i tile risultano disallineati
      // finché non si ridimensiona la finestra. invalidateSize forzato
      // subito dopo evita di doverlo scoprire per caso.
      requestAnimationFrame(() => map.invalidateSize());
      // Se il tracciamento è già live e la fotocamera GPS non ha ancora
      // dato un punto, prova comunque a centrare sulla posizione vera
      // dell'utente invece di restare fermi su Milano.
      if (live && !points?.length && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { if (!cancelled) map.setView([pos.coords.latitude, pos.coords.longitude], 17); },
          () => {}, { maximumAge: 10000, timeout: 5000 }
        );
      }
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !polylineRef.current || !points?.length) return;
    const L = leafletRef.current;
    const latlngs = points.map((p) => [p.lat, p.lng]);
    polylineRef.current.setLatLngs(latlngs);
    const lastLatLng = latlngs[latlngs.length - 1];

    if (live) {
      // Puntino blu della posizione attuale — stile "You are here" delle
      // mappe native: cerchio bianco con nucleo blu acceso, ricreato solo
      // la prima volta e poi solo spostato (mai un lampo di ricomparsa).
      if (!markerRef.current) {
        markerRef.current = L.circleMarker(lastLatLng, {
          radius: 9, color: "#FFFFFF", weight: 3, fillColor: "#2563EB", fillOpacity: 1,
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng(lastLatLng);
      }
      mapRef.current.panTo(lastLatLng);
    } else {
      mapRef.current.fitBounds(latlngs, { padding: [24, 24] });
    }
  }, [ready, points, live]);

  // Percorso ad anello suggerito (Premium/Coaching, vedi generateLoopRoute):
  // tratteggiato, sotto al percorso reale — resta visibile come guida anche
  // mentre il tracciamento vero disegna sopra man mano che ci si muove.
  useEffect(() => {
    if (!ready || !mapRef.current || !guideLineRef.current) return;
    const latlngs = (guidePoints || []).map((p) => [p.lat, p.lng]);
    guideLineRef.current.setLatLngs(latlngs);
    if (latlngs.length && !points?.length) mapRef.current.fitBounds(latlngs, { padding: [24, 24] });
  }, [ready, guidePoints, points]);

  return <div ref={containerRef} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: "var(--surface-2)" }} />;
}

/* Tracciamento GPS in diretta — stile Strava: percorso disegnato sulla
   mappa in tempo reale, distanza/tempo/passo calcolati dai punti veri del
   GPS del telefono (watchPosition), non inseriti a mano. */
function GpsTrackerModal({ accent, onClose, onSaved, supabase, userId, subsAccess, onUpgrade }) {
  const [activityType, setActivityType] = useState("corsa");
  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [gpsError, setGpsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [snapping, setSnapping] = useState(false); // allineamento a strada in corso dopo lo stop
  const watchIdRef = useRef(null);
  const lastSnapCountRef = useRef(0); // quanti punti aveva il percorso all'ultimo riallineamento live
  const snapInFlightRef = useRef(false); // evita richieste di riallineamento sovrapposte

  // Percorso ad anello suggerito (Premium/Scheda Personalizzata e superiori,
  // vedi subsAccess): resta solo una guida VISIVA tratteggiata sulla mappa,
  // il tracciamento GPS vero funziona esattamente come senza — la distanza/
  // il tempo salvati vengono sempre dai punti GPS reali, mai dal percorso
  // suggerito.
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [suggestedRoute, setSuggestedRoute] = useState(null); // { points, distanceKm, durationMin }
  const [startLocation, setStartLocation] = useState(null);
  const [generatingRoute, setGeneratingRoute] = useState(false);
  const [routeGenError, setRouteGenError] = useState("");
  const [customKm, setCustomKm] = useState("");

  useEffect(() => {
    if (!tracking) return undefined;
    const timer = setInterval(() => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [tracking, startedAt]);

  const start = () => {
    if (!navigator.geolocation) { setGpsError("Il tuo browser non supporta la geolocalizzazione."); return; }
    haptic("confirm");
    setGpsError("");
    setPoints([]);
    setStartedAt(Date.now());
    setTracking(true);
    lastSnapCountRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // Un fix GPS con un'incertezza dichiarata troppo alta (edifici alti,
        // sottopassi, meteo) è spesso la causa dei "salti" a caso sulla
        // mappa — meglio scartarlo che disegnarlo. 30 m è già largo (un
        // buon segnale all'aperto sta sotto i 10 m).
        if (pos.coords.accuracy != null && pos.coords.accuracy > 30) return;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
        setPoints((pts) => {
          if (pts.length && haversineKm(pts[pts.length - 1], p) < 0.002) return pts; // micro-jitter da fermo
          const next = [...pts, p];
          // Riallineamento periodico ANCHE in diretta (non solo a fine
          // sessione): ogni ~10 punti nuovi si rimanda l'intero tracciato
          // a Mapbox Map Matching, così la linea che si vede muoversi segue
          // davvero le strade invece del solo rumore GPS grezzo. Una
          // richiesta ogni ~10 punti (non una per punto) tiene i costi
          // bassi; snapInFlightRef evita chiamate sovrapposte se una
          // risposta tarda ad arrivare.
          if (!snapInFlightRef.current && next.length - lastSnapCountRef.current >= 10 && isMapboxConfigured()) {
            snapInFlightRef.current = true;
            snapRouteToRoads(next, activityType)
              .then((snapped) => { if (snapped) { lastSnapCountRef.current = snapped.length; setPoints(snapped); } else { lastSnapCountRef.current = next.length; } })
              .catch(() => { lastSnapCountRef.current = next.length; })
              .finally(() => { snapInFlightRef.current = false; });
          }
          return next;
        });
      },
      (err) => {
        console.error("PERFORM: errore GPS", err);
        setGpsError(err.code === 1 ? "Serve il permesso di geolocalizzazione per tracciare il percorso." : "Segnale GPS non disponibile — prova all'aperto.");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  };

  const stop = () => {
    haptic("tap");
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
    // Il percorso grezzo del GPS "salta" leggermente anche restando fermi —
    // non è mai su una strada precisa come su Google Maps. Un'unica chiamata
    // a Mapbox Map Matching a fine sessione (mai in diretta: costerebbe una
    // richiesta ad ogni punto) allinea l'intero tracciato alla rete stradale
    // reale prima di mostrarlo/salvarlo. Se fallisce o l'attività non ha
    // strade (nuoto/canottaggio), resta il percorso grezzo — mai un dato
    // inventato al posto di quello vero.
    setPoints((currentPoints) => {
      if (currentPoints.length > 1 && isMapboxConfigured()) {
        setSnapping(true);
        snapRouteToRoads(currentPoints, activityType)
          .then((snapped) => { if (snapped) setPoints(snapped); })
          .catch(() => {})
          .finally(() => setSnapping(false));
      }
      return currentPoints;
    });
  };

  // Percorsi ad anello suggeriti: legge la posizione attuale una volta sola
  // quando si apre il selettore, poi genera un anello reale su strada per
  // la distanza scelta (Mapbox Directions, vedi generateLoopRoute).
  const openRoutePicker = () => {
    setRoutePickerOpen(true);
    setRouteGenError("");
    if (startLocation) return;
    if (!navigator.geolocation) { setRouteGenError("Il tuo browser non supporta la geolocalizzazione."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setStartLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setRouteGenError("Non riesco a leggere la tua posizione — controlla il permesso di geolocalizzazione."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
  };

  const generateRoute = async (km) => {
    if (!startLocation) return;
    setGeneratingRoute(true);
    setRouteGenError("");
    try {
      const route = await generateLoopRoute(startLocation, km, activityType);
      if (!route) { setRouteGenError("Non sono riuscito a generare un percorso da qui — riprova o scegli un'altra distanza."); return; }
      setSuggestedRoute(route);
      setRoutePickerOpen(false);
      haptic("confirm");
    } finally {
      setGeneratingRoute(false);
    }
  };

  useEffect(() => () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  const distanceKm = useMemo(() => {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
    return d;
  }, [points]);

  const durationMin = elapsedSec / 60;
  const avgSpeedKmh = durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
  const maxSpeedKmh = useMemo(() => {
    let max = 0;
    for (let i = 1; i < points.length; i++) {
      const dtH = (points[i].t - points[i - 1].t) / 3_600_000;
      if (dtH > 0) max = Math.max(max, haversineKm(points[i - 1], points[i]) / dtH);
    }
    return max;
  }, [points]);

  const save = async () => {
    setSaving(true);
    try {
      await addCardioLog(supabase, userId, {
        date: toLocalISODate(), activityType, durationMin: Math.max(1, Math.round(durationMin)),
        distanceKm: distanceKm > 0 ? Math.round(distanceKm * 100) / 100 : null,
        route: points.length > 1 ? points : null,
        avgSpeedKmh: avgSpeedKmh > 0 ? Math.round(avgSpeedKmh * 10) / 10 : null,
        maxSpeedKmh: maxSpeedKmh > 0 ? Math.round(maxSpeedKmh * 10) / 10 : null,
      });
      haptic("confirm");
      onSaved();
      onClose();
    } catch (err) {
      console.error("PERFORM: errore salvataggio attività GPS", err);
      setGpsError("Non sono riuscito a salvare l'attività.");
    } finally {
      setSaving(false);
    }
  };

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  const activityMeta = CARDIO_ACTIVITIES.find((a) => a.id === activityType) || CARDIO_ACTIVITIES[0];

  const modalRef = useRef(null);
  useSwipeDownClose(modalRef, () => { stop(); onClose(); });

  return (
    <Portal>
      {/* env(safe-area-inset-top): su iPhone con notch/Dynamic Island la X
          altrimenti finisce sotto la barra di stato ed è impossibile da
          toccare — il modale a tutto schermo parte da y:0, non eredita il
          padding che l'header normale dell'app ha altrove. */}
      <div ref={modalRef} className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: "var(--page)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" style={{ fontSize: "1.2rem" }}>{activityMeta.icon}</span>
            <p className="h2" style={{ margin: 0 }}>{activityMeta.label} GPS</p>
          </div>
          <button onClick={() => { stop(); onClose(); }} aria-label="Chiudi"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <X size={16} style={{ color: "var(--ink-2)" }} />
          </button>
        </div>

        <div className="px-5 relative" data-no-swipe="true">
          <RouteMap points={points} live accent={accent} height={260} guidePoints={suggestedRoute?.points} />
          {snapping && (
            <div className="absolute inset-x-5 top-3 rounded-full px-3.5 py-2 flex items-center gap-2"
              style={{ backgroundColor: "rgba(17,17,17,0.85)", backdropFilter: "blur(6px)" }}>
              <Loader2 size={13} className="animate-spin" style={{ color: "#FFFFFF" }} />
              <span style={{ color: "#FFFFFF", fontSize: "0.72rem", fontWeight: 600 }}>Allineo il percorso alle strade reali…</span>
            </div>
          )}
        </div>

        <div className="px-5 py-5 flex-1 flex flex-col">
          {!tracking && points.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CARDIO_ACTIVITIES.filter((a) => GPS_CAPABLE.has(a.id)).map((a) => {
                const on = activityType === a.id;
                return (
                  <button key={a.id} onClick={() => { setActivityType(a.id); setSuggestedRoute(null); }} type="button"
                    className="rounded-full px-3.5 py-2 text-xs flex items-center gap-1.5 transition-transform active:scale-95"
                    style={on ? { backgroundColor: accent, color: "#FFFFFF", fontWeight: 700, boxShadow: `0 3px 10px ${accent}55` }
                              : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                    <span aria-hidden="true">{a.icon}</span>{a.label}
                  </button>
                );
              })}
            </div>
          )}

          {!tracking && points.length === 0 && LOOP_ROUTE_CAPABLE.has(activityType) && (
            subsAccess ? (
              suggestedRoute ? (
                <div className="rounded-2xl px-4 py-3 mb-5 flex items-center justify-between gap-3"
                  style={{ backgroundColor: `${accent}14`, border: `1px solid ${accent}40` }}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--ink)" }}>Percorso ad anello · {suggestedRoute.distanceKm} km</p>
                    <p className="meta" style={{ fontSize: "0.65rem" }}>~{suggestedRoute.durationMin} min stimati · torna al punto di partenza</p>
                  </div>
                  <button onClick={() => setSuggestedRoute(null)} className="shrink-0 p-1.5 rounded-full" style={{ backgroundColor: "var(--surface)" }} aria-label="Rimuovi percorso suggerito">
                    <X size={13} style={{ color: "var(--ink-2)" }} />
                  </button>
                </div>
              ) : (
                <button onClick={openRoutePicker} type="button"
                  className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm mb-5"
                  style={{ backgroundColor: "var(--surface-2)", border: `1px dashed ${accent}80`, color: "var(--ink)", fontWeight: 600 }}>
                  <Route size={15} style={{ color: accent }} /> Percorsi ad anello suggeriti
                </button>
              )
            ) : (
              <button onClick={onUpgrade} type="button"
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm mb-5"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>
                <Lock size={13} /> Percorsi ad anello suggeriti — dal Performance Pack
              </button>
            )
          )}

          {routePickerOpen && (
            <div className="rounded-2xl px-4 py-4 mb-5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Quanti km vuoi percorrere?</p>
                <button onClick={() => setRoutePickerOpen(false)} aria-label="Chiudi" className="p-1">
                  <X size={15} style={{ color: "var(--ink-2)" }} />
                </button>
              </div>
              {!startLocation && !routeGenError && (
                <p className="meta text-xs mb-3 flex items-center gap-2"><Loader2 size={12} className="animate-spin" />Leggo la tua posizione…</p>
              )}
              {routeGenError && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{routeGenError}</p>}
              <div className="flex flex-wrap gap-2 mb-3">
                {[1, 3, 5, 10, 15].map((km) => (
                  <button key={km} onClick={() => generateRoute(km)} disabled={!startLocation || generatingRoute}
                    className="rounded-full px-4 py-2.5 text-sm font-data disabled:opacity-40 transition-transform active:scale-95"
                    style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
                    {generatingRoute ? <Loader2 size={13} className="animate-spin" /> : `${km} km`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0.5" step="0.5" value={customKm} onChange={(e) => setCustomKm(e.target.value)}
                  placeholder="Altra distanza (km)" className="input flex-1 px-4 py-2.5 font-data text-sm" aria-label="Distanza personalizzata in km" />
                <button onClick={() => generateRoute(Number(customKm))} disabled={!startLocation || generatingRoute || !(Number(customKm) > 0)}
                  className="shrink-0 rounded-full px-4 py-2.5 text-sm disabled:opacity-40 transition-transform active:scale-95"
                  style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
                  Genera
                </button>
              </div>
              <p className="meta mt-3 leading-relaxed" style={{ fontSize: "0.65rem" }}>
                Anello su strade reali che parte e torna qui — la distanza esatta arriva da Mapbox e può discostarsi
                un po' da quella scelta: le strade vere non sono mai un cerchio perfetto.
              </p>
            </div>
          )}

          {/* Tempo trascorso come cifra "hero" — è il numero che si guarda
              di più durante la sessione, deve leggersi da lontano/di corsa. */}
          <div className="text-center mb-5">
            <p className="label mb-1" style={{ letterSpacing: "0.12em" }}>Tempo</p>
            <p className="font-data" style={{
              fontSize: "3.2rem", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em",
              backgroundImage: `linear-gradient(100deg, ${accent}, var(--ink), ${accent})`,
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              {mm}:{ss}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <p className="label mb-1 flex items-center gap-1"><Route size={11} />Distanza</p>
              <p className="font-data text-2xl font-bold" style={{ color: "var(--ink)" }}>{distanceKm.toFixed(2)} <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink-2)" }}>km</span></p>
            </div>
            <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <p className="label mb-1 flex items-center gap-1"><Timer size={11} />Passo medio</p>
              <p className="font-data text-2xl font-bold" style={{ color: "var(--ink)" }}>{paceLabel(durationMin, distanceKm) || "—"}</p>
            </div>
          </div>

          {gpsError && (
            <p className="text-xs mb-4 rounded-xl px-3.5 py-2.5" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626" }}>{gpsError}</p>
          )}

          <div className="mt-auto">
            {!tracking && points.length === 0 && (
              <button onClick={start} className="w-full rounded-full px-4 py-4 text-base btn-3d flex items-center justify-center gap-2"
                style={{ backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}CC)`, color: "#FFFFFF", fontWeight: 800, boxShadow: `0 8px 22px ${accent}4D` }}>
                Inizia
              </button>
            )}
            {tracking && (
              <button onClick={stop} className="w-full rounded-full px-4 py-4 text-base btn-3d"
                style={{ backgroundColor: "#DC2626", color: "#FFFFFF", fontWeight: 800, boxShadow: "0 8px 22px rgba(220,38,38,0.35)" }}>
                Termina
              </button>
            )}
            {!tracking && points.length > 0 && (
              <div className="flex gap-2.5">
                <button onClick={() => { setPoints([]); setElapsedSec(0); }} className="flex-1 rounded-full px-4 py-4 text-sm font-semibold"
                  style={{ border: "1px solid var(--line)", color: "var(--ink-2)", backgroundColor: "transparent" }}>
                  Scarta
                </button>
                <button onClick={save} disabled={saving} className="flex-[2] rounded-full px-4 py-4 text-sm btn-3d disabled:opacity-60"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 800 }}>
                  {saving ? "Salvo…" : "Salva attività"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* Condivisione reale del percorso — Web Share API (apre il pannello di
   condivisione nativo del telefono: Instagram, WhatsApp, Messaggi...),
   con fallback "copia testo" sui browser desktop che non la supportano. */
function shareCardioLog(log, activityLabel) {
  const pace = paceLabel(log.duration_min, log.distance_km);
  const text = `${activityLabel} · ${log.distance_km ? `${log.distance_km} km · ` : ""}${log.duration_min} min${pace ? ` · ${pace}` : ""} 💪 #PERFORM`;
  if (navigator.share) {
    navigator.share({ text, title: "La mia attività PERFORM" }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}

function CardioSection({ supabase, userId, accent, subsAccess, onUpgrade }) {
  const isRealMode = Boolean(supabase && userId);
  const [logs, setLogs] = useState(null); // null finché non caricato (solo isRealMode)
  const [activityType, setActivityType] = useState("corsa");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [gpsOpen, setGpsOpen] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState(null); // id del log con la mappa aperta
  const [intensityStyle, setIntensityStyle] = useState(null); // liss | moderate | hiit | null (non specificato)
  const [hiitRounds, setHiitRounds] = useState("");
  const [hiitWorkSec, setHiitWorkSec] = useState("");
  const [hiitRestSec, setHiitRestSec] = useState("");
  const [machineValues, setMachineValues] = useState({}); // { [fieldKey]: string }

  const activityMeta = CARDIO_ACTIVITIES.find((a) => a.id === activityType);
  const machineFields = MACHINE_FIELDS[activityType] || null;

  const resetForm = () => {
    setDuration(""); setDistance(""); setNotes("");
    setIntensityStyle(null); setHiitRounds(""); setHiitWorkSec(""); setHiitRestSec("");
    setMachineValues({});
  };

  const loadLogs = useCallback(() => {
    if (!isRealMode) return;
    fetchCardioLogs(supabase, userId)
      .then(setLogs)
      .catch((err) => { console.error("PERFORM: errore lettura cardio_logs", err); setLogs([]); });
  }, [isRealMode, supabase, userId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const save = async () => {
    const mins = Number(duration);
    if (!mins || mins <= 0) { setError("Inserisci una durata in minuti."); return; }
    setError("");
    setSaving(true);
    try {
      const machineMetrics = {};
      (machineFields || []).forEach((f) => {
        if (machineValues[f.key]) machineMetrics[f.key] = Number(machineValues[f.key]);
      });
      await addCardioLog(supabase, userId, {
        date: toLocalISODate(), activityType,
        durationMin: mins, distanceKm: distance ? Number(distance) : null, notes: notes.trim() || null,
        intensityStyle, hiitRounds: Number(hiitRounds) || null, hiitWorkSec: Number(hiitWorkSec) || null, hiitRestSec: Number(hiitRestSec) || null,
        machineMetrics,
      });
      haptic("confirm");
      resetForm();
      loadLogs();
    } catch (err) {
      console.error("PERFORM: errore salvataggio attività cardio", err);
      setError("Non sono riuscito a salvare l'attività.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteCardioLog(supabase, id);
      haptic("warning");
      setLogs((ls) => ls.filter((l) => l.id !== id));
    } catch (err) {
      console.error("PERFORM: errore eliminazione attività cardio", err);
    }
  };

  if (!isRealMode) return null; // solo modalità reale: niente storico finto in anteprima

  const thisWeekMin = (logs || [])
    .filter((l) => (Date.now() - new Date(`${l.date}T00:00:00`).getTime()) / 86400000 < 7)
    .reduce((sum, l) => sum + l.duration_min, 0);

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="label flex items-center gap-1.5"><Route size={13} style={{ color: accent }} />Cardio</p>
        {logs && logs.length > 0 && (
          <span className="rounded-full px-2.5 py-1 font-data text-xs font-bold"
            style={{ backgroundColor: `${accent}18`, color: accent }}>
            {thisWeekMin} min questa settimana
          </span>
        )}
      </div>
      <p className="h1 mb-3">Registra un'attività</p>

      {/* Il tipo di attività va scelto PRIMA di tutto: da lì dipende sia se
          mostrare "Traccia con GPS" (ha senso solo all'aperto, mai su un
          macchinario fermo) sia quali campi extra servono davvero. Raggruppati
          per categoria (all'aperto/palestra/altro) invece di un'unica fila di
          11 pill indistinte — si capisce a colpo d'occhio cosa è tracciabile
          col GPS e cosa no. */}
      {CARDIO_ACTIVITY_GROUPS.map((g) => {
        const items = CARDIO_ACTIVITIES.filter((a) => (a.group || null) === g.id);
        if (items.length === 0) return null;
        return (
          <div key={g.id || "altro"} className="mb-2.5">
            <p className="meta mb-1.5" style={{ fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((a) => {
                const on = activityType === a.id;
                return (
                  <button key={a.id} onClick={() => { setActivityType(a.id); setMachineValues({}); }} type="button"
                    className="rounded-full px-3 py-2 text-xs flex items-center gap-1.5 transition-transform active:scale-95"
                    style={on ? { backgroundColor: accent, color: "#FFFFFF", fontWeight: 700, boxShadow: `0 3px 10px ${accent}55` }
                              : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                    <span aria-hidden="true">{a.icon}</span>{a.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {GPS_CAPABLE.has(activityType) && (
        <>
          <button onClick={() => setGpsOpen(true)} type="button"
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl px-4 py-4 text-sm mt-3 mb-3 btn-3d transition-transform active:scale-[0.98]"
            style={{
              backgroundImage: "linear-gradient(120deg, var(--title-a), var(--title-b))",
              color: "#FFFFFF", fontWeight: 800, boxShadow: "0 10px 24px -8px rgba(0,0,0,0.35)",
            }}>
            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.22)" }}>
              <Route size={16} />
            </span>
            <span className="text-left">
              <span className="block" style={{ fontSize: "0.9rem", lineHeight: 1.15 }}>Traccia con GPS</span>
              <span className="block" style={{ fontSize: "0.65rem", fontWeight: 500, opacity: 0.85 }}>percorso, distanza e passo in tempo reale</span>
            </span>
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--line)" }} />
            <p className="meta" style={{ fontSize: "0.65rem" }}>oppure inserisci a mano</p>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--line)" }} />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3 mt-3">
        <label className="block">
          <span className="label block mb-1.5">Durata (min)</span>
          <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)}
            placeholder="es. 35" className="input w-full px-4 py-3 font-data" />
        </label>
        <label className="block">
          <span className="label block mb-1.5">Distanza (km, facoltativo)</span>
          <input type="number" min="0" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)}
            placeholder="es. 5.2" className="input w-full px-4 py-3 font-data" />
        </label>
      </div>

      {/* Campi specifici del macchinario: quelli che chi lo usa davvero legge
          sul display — non un form generico identico per tapis roulant e
          vogatore. */}
      {machineFields && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {machineFields.map((f) => (
            <label key={f.key} className="block">
              <span className="label block mb-1.5">{f.label}</span>
              <input type="number" step={f.step} value={machineValues[f.key] || ""}
                onChange={(e) => setMachineValues((m) => ({ ...m, [f.key]: e.target.value }))}
                placeholder={f.placeholder} className="input w-full px-4 py-3 font-data" />
            </label>
          ))}
        </div>
      )}

      {/* Stile di intensità: si applica a qualunque attività, non solo alle
          macchine — è una scelta di metodo (costante vs a intervalli), mai
          obbligatoria (facoltativo → nessuna etichetta, non "moderata" di
          default: mai un dato mai scelto dall'atleta). */}
      <div className="mb-3">
        <span className="label block mb-1.5">Intensità (facoltativo)</span>
        <div className="flex gap-1.5">
          {INTENSITY_STYLES.map((s) => {
            const on = intensityStyle === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setIntensityStyle(on ? null : s.id)}
                title={s.full}
                className="flex-1 rounded-xl px-2 py-2.5 text-xs transition-transform active:scale-95"
                style={on ? { backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }
                          : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>
                {s.label}
              </button>
            );
          })}
        </div>
        {intensityStyle === "hiit" && (
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <label className="block">
              <span className="label block mb-1" style={{ fontSize: "0.58rem" }}>Round</span>
              <input type="number" min="1" value={hiitRounds} onChange={(e) => setHiitRounds(e.target.value)}
                placeholder="es. 8" className="input w-full px-3 py-2.5 font-data text-sm" />
            </label>
            <label className="block">
              <span className="label block mb-1" style={{ fontSize: "0.58rem" }}>Lavoro (sec)</span>
              <input type="number" min="1" value={hiitWorkSec} onChange={(e) => setHiitWorkSec(e.target.value)}
                placeholder="es. 30" className="input w-full px-3 py-2.5 font-data text-sm" />
            </label>
            <label className="block">
              <span className="label block mb-1" style={{ fontSize: "0.58rem" }}>Recupero (sec)</span>
              <input type="number" min="0" value={hiitRestSec} onChange={(e) => setHiitRestSec(e.target.value)}
                placeholder="es. 90" className="input w-full px-3 py-2.5 font-data text-sm" />
            </label>
          </div>
        )}
      </div>

      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Note (facoltativo, es. percorso, sensazioni...)"
        className="input w-full px-4 py-3 text-sm mb-3" />

      {error && (
        <p className="text-xs mb-3 rounded-xl px-3.5 py-2.5" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626" }}>{error}</p>
      )}

      <button onClick={save} disabled={saving} className="w-full rounded-full px-4 py-3.5 text-sm btn-3d disabled:opacity-60"
        style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
        {saving ? "Salvo…" : "Registra attività"}
      </button>

      {logs === null ? (
        <div className="space-y-2 mt-4">
          {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 58 }} />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center text-center mt-6 py-4">
          <span className="w-11 h-11 rounded-full flex items-center justify-center mb-2.5" style={{ backgroundColor: "var(--surface-2)" }}>
            <Route size={18} style={{ color: "var(--ink-tertiary)" }} />
          </span>
          <p className="meta text-sm">Nessuna attività registrata ancora — la prima comparirà qui.</p>
        </div>
      ) : (
        <div className="space-y-2 mt-4">
          {logs.map((l) => {
            const meta = CARDIO_ACTIVITIES.find((a) => a.id === l.activity_type) || CARDIO_ACTIVITIES[CARDIO_ACTIVITIES.length - 1];
            const pace = paceLabel(l.duration_min, l.distance_km);
            const hasRoute = Array.isArray(l.route) && l.route.length > 1;
            const intensityMeta = INTENSITY_STYLES.find((s) => s.id === l.intensity_style);
            const machineFieldsForLog = MACHINE_FIELDS[l.activity_type] || [];
            const machineSummary = machineFieldsForLog
              .filter((f) => l.machine_metrics?.[f.key] != null)
              .map((f) => `${f.label.replace(/\s*\(.*\)$/, "")} ${l.machine_metrics[f.key]}`);
            return (
              <div key={l.id} className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18`, fontSize: "1rem" }} aria-hidden="true">
                      {meta.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm flex items-center flex-wrap gap-1.5" style={{ color: "var(--ink)", fontWeight: 700 }}>
                        {meta.label}
                        <span className="font-data text-xs" style={{ color: "var(--ink-tertiary)", fontWeight: 400 }}>
                          · {new Date(`${l.date}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                        </span>
                        {intensityMeta && (
                          <span className="rounded-full px-2 py-0.5 font-data" style={{ fontSize: "0.6rem", fontWeight: 700, backgroundColor: `${accent}20`, color: accent }}>
                            {intensityMeta.label}
                          </span>
                        )}
                      </p>
                      <p className="font-data text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        {l.duration_min} min{l.distance_km ? ` · ${l.distance_km} km` : ""}{pace ? ` · ${pace}` : ""}
                      </p>
                      {l.intensity_style === "hiit" && l.hiit_rounds && (
                        <p className="font-data text-xs mt-0.5" style={{ color: "var(--ink-tertiary)" }}>
                          {l.hiit_rounds}× {l.hiit_work_sec}s lavoro / {l.hiit_rest_sec}s recupero
                        </p>
                      )}
                      {machineSummary.length > 0 && (
                        <p className="font-data text-xs mt-0.5" style={{ color: "var(--ink-tertiary)" }}>
                          {machineSummary.join(" · ")}
                        </p>
                      )}
                      {l.notes && <p className="meta text-xs mt-0.5 leading-relaxed">{l.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasRoute && (
                      <>
                        <button onClick={() => shareCardioLog(l, meta.label)} aria-label="Condividi"
                          className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accent}18` }}>
                          <Route size={14} style={{ color: accent }} />
                        </button>
                        <button onClick={() => setExpandedRoute((id) => (id === l.id ? null : l.id))} aria-label="Vedi percorso"
                          className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--surface)" }}>
                          <ChevronDown size={14} style={{ color: "var(--ink-tertiary)", transform: expandedRoute === l.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                        </button>
                      </>
                    )}
                    <button onClick={() => remove(l.id)} aria-label="Elimina attività"
                      className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--surface)" }}>
                      <Trash2 size={14} style={{ color: "var(--ink-tertiary)" }} />
                    </button>
                  </div>
                </div>
                {hasRoute && expandedRoute === l.id && (
                  <div className="mt-3">
                    <RouteMap points={l.route} live={false} accent={accent} height={180} />
                    {(l.avg_speed_kmh || l.max_speed_kmh) && (
                      <p className="meta text-xs mt-2">
                        {l.avg_speed_kmh ? `Velocità media ${l.avg_speed_kmh} km/h` : ""}{l.avg_speed_kmh && l.max_speed_kmh ? " · " : ""}{l.max_speed_kmh ? `Massima ${l.max_speed_kmh} km/h` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {gpsOpen && (
        <GpsTrackerModal accent={accent} supabase={supabase} userId={userId}
          subsAccess={subsAccess} onUpgrade={onUpgrade}
          onClose={() => setGpsOpen(false)} onSaved={loadLogs} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Card dell'esercizio: serie indipendenti, recupero per serie, badge di
   priorità, calcolatore dischi.
   ------------------------------------------------------------------------- */

/* Spiegazione generica di esecuzione quando l'esercizio non ha un how-to
   dedicato: pattern di movimento riconosciuto dal nome. */
function exerciseHowTo(name) {
  const exact = EXERCISE_BIOMECH[name] || EXERCISE_BIOMECH[(name || "").trim()];
  if (exact) return exact.howTo;
  const s = (name || "").toLowerCase();
  if (/panca|croci|dip/.test(s))
    return "Scapole retratte e addotte, piedi ben piantati, discesa controllata fino a sfiorare il petto, spinta esplosiva mantenendo i polsi in linea con gli avambracci.";
  if (/squat|pressa|affond|leg/.test(s))
    return "Piedi alla larghezza delle spalle, core in tensione, scendi mantenendo il peso su tutto il piede fino alla profondità target, risali spingendo il pavimento via da te.";
  if (/stacco|rdl|hip/.test(s))
    return "Schiena neutra per tutto il movimento, bilanciere vicino alle tibie, spingi i fianchi indietro nella fase eccentrica e stringi i glutei in cima.";
  if (/rematore|trazioni|lat|pulley/.test(s))
    return "Parti da una scapola allungata, tira portando il gomito indietro e vicino al fianco, evita di usare lo slancio della schiena.";
  if (/lento|military|alzate|deltoide/.test(s))
    return "Core stabile, evita di inarcare troppo la lombare, controlla la fase di discesa tanto quanto quella di spinta.";
  if (/curl|french|push down/.test(s))
    return "Gomiti fermi lungo i fianchi per tutto il movimento, contrazione piena in cima, discesa controllata senza slanci.";
  return "Esegui il movimento con tecnica controllata, RIR nel range indicato e range di movimento completo, senza compensare con altre articolazioni.";
}

/* Verde Oro: evidenzia i carichi record per dare motivazione visiva prima della serie. */
const RECORD_GOLD_GREEN = "#8CA832";

/* Errori critici da evitare, riconosciuti dal pattern di movimento del nome. */
function exerciseAvoid(name) {
  const exact = EXERCISE_BIOMECH[name] || EXERCISE_BIOMECH[(name || "").trim()];
  if (exact) return exact.avoid;
  const s = (name || "").toLowerCase();
  if (/panca|croci|dip/.test(s))
    return "Non staccare i glutei dalla panca, non far rimbalzare il bilanciere sul petto, non iperestendere le spalle nella fase bassa.";
  if (/squat|pressa|affond|leg/.test(s))
    return "Non far collassare le ginocchia verso l'interno, non sollevare i talloni da terra, non arrotondare la lombare in buca.";
  if (/stacco|rdl|hip/.test(s))
    return "Non arrotondare la schiena per raggiungere il pavimento, non allontanare il bilanciere dalle tibie, non iperestendere la lombare in cima.";
  if (/rematore|trazioni|lat|pulley/.test(s))
    return "Non usare lo slancio per portare su il peso, non accorciare il range di movimento, non anticipare le spalle in avanti.";
  if (/lento|military|alzate|deltoide/.test(s))
    return "Non inarcare eccessivamente la lombare per spingere, non far salire le spalle verso le orecchie, non usare slancio delle gambe.";
  if (/curl|french|push down/.test(s))
    return "Non muovere i gomiti in avanti o indietro, non oscillare il busto, non bloccare in estensione completa con carichi elevati.";
  return "Non sacrificare il range di movimento per aggiungere carico, non compensare con altre articolazioni, non ignorare un dolore articolare acuto.";
}

/* Navigazione cronologica dei carichi: disponibile per TUTTI i piani. Riusa
   gli array "history" già presenti su ogni esercizio (una voce = una settimana
   passata), per tracciare il sovraccarico progressivo nel lungo termine. */
/* Converte il giorno JS (0=Domenica) nella convenzione dell'app (0=Lunedì). */
function isoWeekdayOf(date) { const d = date.getDay(); return d === 0 ? 6 : d - 1; }

/* Simulazione deterministica di "saltato": non avendo un log reale giorno per
   giorno su tutto il calendario, un giorno di allenamento passato risulta
   "mancato" con un pattern stabile (~1 su 5), non casuale a ogni render. */
function wasMissed(date) { return (date.getDate() * 13 + date.getMonth()) % 5 === 0; }

/* Calendario orizzontale a scorrimento libero (drag/swipe): Giallo Oro/Rosa
   per i giorni futuri da allenarsi, Verde per i passati fatti, Rosso per i
   mancati. Cliccando un giorno diverso da oggi si entra in Sola Lettura. */
function WorkoutCalendarStrip({ weekPlan, selectedIso, onSelectIso }) {
  const scrollRef = useRef(null);
  useDragScroll(scrollRef);
  const todayMid = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const days = useMemo(() => Array.from({ length: 45 }, (_, i) => {
    const d = new Date(todayMid); d.setDate(d.getDate() + (i - 30)); return d;
  }), [todayMid]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-today="1"]');
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  return (
    <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ cursor: "grab" }}>
      {days.map((d) => {
        const iso = toLocalISODate(d);
        const isToday = d.getTime() === todayMid.getTime();
        const isFuture = d.getTime() > todayMid.getTime();
        const wd = isoWeekdayOf(d);
        const isTrainingDay = !!weekPlan[wd];
        const missed = !isFuture && !isToday && isTrainingDay && wasMissed(d);

        let bg = "var(--surface)", bd = "var(--line)", fg = "var(--ink)";
        if (isToday) {
          bg = "#F97316"; fg = "#FFFFFF"; bd = "transparent";
        } else if (isTrainingDay) {
          if (isFuture) { bg = "linear-gradient(135deg, var(--title-a), var(--title-b))"; fg = "#FFFFFF"; bd = "transparent"; }
          else if (missed) { bg = "#EF4444"; fg = "#FFFFFF"; bd = "transparent"; }
          else { bg = "#10B981"; fg = "#FFFFFF"; bd = "transparent"; }
        }
        const selected = selectedIso ? iso === selectedIso : isToday;

        return (
          <button key={iso} data-today={isToday ? "1" : "0"} onClick={() => onSelectIso(isToday ? null : iso)}
                  className="shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95"
                  style={{ width: 52, height: 60, background: bg, border: `1.5px solid ${selected && !isToday ? "var(--ink)" : bd}` }}>
            <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.85, color: fg }}>
              {WEEK_DAYS[wd]}
            </span>
            <span style={{ fontSize: "1.05rem", fontWeight: 800, color: fg }}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Vista di Sola Lettura per un giorno del calendario diverso da oggi: split,
   esercizi ed eventuali carichi storici, senza alcun campo modificabile. */
function CalendarDayReadOnlyView({ date, weekPlan }) {
  const todayMid = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const isFuture = date.getTime() > todayMid.getTime();
  const wd = isoWeekdayOf(date);
  const dayData = weekPlan[wd];
  const daysAgo = Math.round((todayMid - date) / 86400000);
  const weeksAgo = Math.max(1, Math.round(daysAgo / 7));
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
        <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 700, textTransform: "capitalize" }}>{dateLabel}</p>
        <p className="meta mt-0.5">
          {isFuture ? "In programma · sola lettura" : "Sessione passata · sola lettura"}
        </p>
      </div>
      {!dayData ? (
        <div className="card text-center py-8">
          <BedDouble size={22} className="mx-auto mb-2" style={{ color: "var(--ink-2)" }} />
          <p className="body">Giorno di riposo secondo lo split.</p>
        </div>
      ) : (
        <>
          <p className="h2">{dayData.label}</p>
          {dayData.exercises.map((ex) => {
            const hist = ex.history || [];
            const entry = !isFuture ? hist[hist.length - weeksAgo] : null;
            return (
              <div key={ex.id || ex.name} className="card">
                <p className="h2 mb-1" style={{ fontSize: "1rem" }}>{ex.name}</p>
                <p className="meta mb-2">{ex.sets} serie × {ex.reps} reps previste</p>
                {isFuture ? (
                  <p className="meta">Sessione futura: nessun carico ancora registrato.</p>
                ) : entry ? (
                  <div className="inner px-4 py-3.5 flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>Carico registrato</span>
                    <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
                      {entry.kg} kg <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>× {entry.reps} reps</span>
                    </span>
                  </div>
                ) : (
                  <p className="meta">Nessun dato registrato per questa giornata.</p>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* Stesso principio del calendario Allenamento (WorkoutCalendarStrip), qui per
   l'Alimentazione: una striscia di giorni passati su cui tornare per
   aggiungere un pasto dimenticato. Il colore distingue Giorno ON (allenamento,
   target più alto) da Giorno OFF (riposo) — stesso weekPlan già usato per
   calcolare isTrainingDay, niente doppia fonte di verità. Solo passato/oggi:
   non si può registrare un pasto nel futuro. */
function NutritionCalendarStrip({ weekPlan, selectedIso, onSelectIso, accent }) {
  const scrollRef = useRef(null);
  useDragScroll(scrollRef);
  const todayMid = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => {
    const d = new Date(todayMid); d.setDate(d.getDate() - (30 - i)); return d;
  }), [todayMid]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-today="1"]');
    if (el) el.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  return (
    <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ cursor: "grab" }}>
      {days.map((d) => {
        const iso = toLocalISODate(d);
        const isToday = d.getTime() === todayMid.getTime();
        const wd = isoWeekdayOf(d);
        const isOn = !!weekPlan[wd];
        const selected = selectedIso ? iso === selectedIso : isToday;

        return (
          <button key={iso} data-today={isToday ? "1" : "0"} onClick={() => onSelectIso(isToday ? null : iso)}
                  className="shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95"
                  style={{ width: 52, height: 60,
                           background: isOn ? "linear-gradient(135deg, var(--title-a), var(--title-b))" : "var(--surface)",
                           border: `1.5px solid ${selected ? "var(--ink)" : isOn ? "transparent" : "var(--line)"}`,
                           boxShadow: isToday ? `0 0 0 2px ${accent}` : "none" }}>
            <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.85,
                           color: isOn ? "#FFFFFF" : "var(--ink-2)" }}>
              {WEEK_DAYS[wd]}
            </span>
            <span style={{ fontSize: "1.05rem", fontWeight: 800, color: isOn ? "#FFFFFF" : "var(--ink)" }}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

function ExerciseCard({ ex, index, rows, onSetField, accent, accentText, userPlan, gender, onUpgrade, onCoachSync }) {
  const [plates, setPlates] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  // Le righe già precompilate da workout_sets (vedi hydration nel wrapper)
  // partono spuntate — altrimenti riaprendo l'app le serie già registrate
  // apparirebbero non completate anche se i dati sono già salvati davvero.
  const [doneRows, setDoneRows] = useState(() => rows.map((r) => r.kg !== "" && r.reps !== "" && r.rir !== ""));
  const [timer, setTimer] = useState(null); // { total, remaining } in secondi

  const isMaxEffort = index < 2;
  const peak = Math.max(0, ...rows.map((r) => Number(r.kg) || 0));
  // "8-10" = stesso range per tutte le serie. "8/12" = target diverso per
  // ogni serie (prima 8, seconda 12). Vedi parseRepsTarget (coachingData.js).
  const repsTargets = useMemo(() => parseRepsTarget(ex.reps, ex.sets), [ex.reps, ex.sets]);
  const hasPerSetTargets = ex.reps?.includes("/");

  /* Storico: supporta sia il vecchio formato (array di kg) sia quello nuovo
     {kg, reps}, per ricordare il carico E le reps dell'ultima volta identica. */
  const historyEntries = (ex.history || []).map((h) => (typeof h === "object" ? h : { kg: h, reps: null }));
  const best = historyEntries.length ? Math.max(...historyEntries.map((h) => h.kg)) : 0;
  const lastEntry = historyEntries.length ? historyEntries[historyEntries.length - 1] : null;

  const pl = platesFor(peak);
  const complete = (r) => r.kg !== "" && r.reps !== "" && r.rir !== "";
  const curIdx = rows.findIndex((r) => !complete(r));
  const restIdx = curIdx === -1 ? rows.length - 1 : curIdx;
  const rest = ex.rests?.[restIdx] ?? 120;
  const fmtRest = (s) => (s < 60 ? `${s}″` : s % 60 === 0 ? `${s / 60}′` : `${Math.floor(s / 60)}′${String(s % 60).padStart(2, "0")}″`);
  const fmtMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const syncToCoach = (payload) =>
    onCoachSync && onCoachSync({ type: "workout", exercise: ex.name, exerciseId: ex.id, ...payload });

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
      syncToCoach({ kind: "video-upload", fileName: file.name });
    }
  };

  /* Smart Rest Timer: alla spunta di completamento di una serie parte in automatico
     il conto alla rovescia tarato sul recupero previsto; al termine, feedback aptico. */
  useEffect(() => {
    if (!timer || timer.remaining <= 0) return undefined;
    const id = setInterval(() => {
      setTimer((t) => {
        if (!t) return t;
        if (t.remaining <= 1) {
          try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (err) { /* non supportato: nessun problema */ }
          return null;
        }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const toggleRowDone = (i) => {
    setDoneRows((d) => {
      const next = d.map((v, k) => (k === i ? !v : v));
      if (next[i]) {
        const dur = ex.rests?.[i] ?? 120;
        setTimer({ total: dur, remaining: dur });
        syncToCoach({ kind: "set-completed", rowIndex: i, row: rows[i] });
      }
      return next;
    });
  };

  const ringR = 27, ringC = 2 * Math.PI * ringR;
  const ringOffset = timer ? ringC * (1 - timer.remaining / timer.total) : 0;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {isMaxEffort && (
          <span className="on-dark px-2 py-1 rounded-md text-xs"
                style={{ backgroundColor: "#111111", letterSpacing: "0.06em", fontWeight: 600 }}>
            ★ MAX EFFORT · <span style={{ color: accent }}>esercizio target</span>
          </span>
        )}
        {peak > best && best > 0 && (
          <span className="px-2 py-1 rounded-md text-xs"
                style={{ backgroundColor: "rgba(140,168,50,0.14)", color: RECORD_GOLD_GREEN,
                         letterSpacing: "0.03em", fontWeight: 700 }}>
            🏆 RECORD · {best} → {peak} kg
          </span>
        )}
      </div>

      <p className="h2">{ex.name}</p>
      <p className="meta mt-0.5">
        {hasPerSetTargets
          ? repsTargets.map((t, i) => `S${i + 1}: ${t}`).join(" · ")
          : `${ex.sets} serie × ${ex.reps} reps`} · RIR {ex.rirTarget}
      </p>
      {ex.technique && <p className="mt-1 text-sm" style={{ color: "var(--ink-2)", fontWeight: 500 }}>Tecnica: {ex.technique}</p>}
      {lastEntry && lastEntry.kg > 0 ? (
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Scorsa sessione identica: <span style={{ color: "var(--ink)", fontWeight: 700 }}>{lastEntry.kg} kg{lastEntry.reps ? ` × ${lastEntry.reps} reps` : ""}</span>
          {best > 0 && <> · record da battere: <span style={{ color: RECORD_GOLD_GREEN, fontWeight: 700 }}>{best} kg</span></>}
        </p>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Scorsa sessione identica: <span style={{ color: "var(--ink)", fontWeight: 700 }}>n/d</span>
        </p>
      )}
      <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink)" }}>
        <Timer size={13} style={{ color: accent }} />
        {curIdx === -1 ? "Serie completate" : `Serie ${restIdx + 1}`} · Rest{" "}
        <span style={{ color: accentText, fontWeight: 700 }}>{fmtRest(rest)}</span>
      </p>

      {/* serie */}
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <span className="col-span-2 label">Serie</span>
          {["Kg", "Reps", "RIR"].map((h) => <span key={h} className="col-span-3 label text-center">{h}</span>)}
          <span className="col-span-1 label text-center">✓</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <span className="col-span-2 text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>S{i + 1}</span>
            {["kg", "reps", "rir"].map((f) => (
              <input key={f} type="number" min="0" value={row[f]}
                     onChange={(e) => { onSetField(ex, i, f, e.target.value); syncToCoach({ kind: "field-change", rowIndex: i, field: f, value: e.target.value }); }}
                     placeholder={f === "reps" ? repsTargets[i] : undefined}
                     className="col-span-3 input w-full px-2 py-2.5 text-center text-sm"
                     aria-label={f === "reps" && repsTargets[i] ? `reps serie ${i + 1} di ${ex.name}, target ${repsTargets[i]}` : `${f} serie ${i + 1} di ${ex.name}`} />
            ))}
            <button onClick={() => toggleRowDone(i)}
                    aria-label={doneRows[i] ? `Segna serie ${i + 1} come da rifare` : `Segna serie ${i + 1} come completata e avvia il recupero`}
                    className="col-span-1 flex items-center justify-center transition-transform active:scale-90">
              {doneRows[i]
                ? <CheckCircle2 size={20} style={{ color: accent }} />
                : <span className="rounded-full" style={{ width: 18, height: 18, border: "1.5px solid var(--ink-2)", display: "block" }} />}
            </button>
          </div>
        ))}
      </div>

      {/* Smart Rest Timer: countdown circolare automatico dopo la spunta */}
      {timer && (
        <div className="spring-in inner p-4 mt-3 flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle cx="32" cy="32" r={ringR} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              <circle cx="32" cy="32" r={ringR} fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={ringC} strokeDashoffset={ringOffset}
                      transform="rotate(-90 32 32)"
                      style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ink)" }}>
                {fmtMMSS(timer.remaining)}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>Recupero in corso</p>
            <p className="meta mt-0.5">Al termine, una vibrazione ti avvisa che è ora della prossima serie.</p>
          </div>
          <button onClick={() => setTimer(null)} className="shrink-0 label" style={{ fontSize: "0.6rem" }}>
            salta
          </button>
        </div>
      )}

      {/* calcolatore dischi */}
      {peak >= 20 && (
        <div className="mt-3">
          <button onClick={() => setPlates((v) => !v)} className="label flex items-center gap-1.5">
            Dischi per {peak} kg {plates ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {plates && (
            <div className="spring-in inner px-4 py-3 mt-2">
              <p className="meta mb-2" style={{ fontSize: "0.65rem" }}>Bilanciere 20 kg · dischi per lato</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: "var(--surface)",
                               border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>bar 20</span>
                {pl.plates.map((p, k) => (
                  <span key={k} className="px-2.5 py-1.5 rounded-full text-xs"
                        style={{ backgroundColor: PLATE_COLOR[p],
                                 color: p === 5 || p === 1.25 ? "#111111" : "#FFFFFF",
                                 border: p === 5 ? "1px solid var(--line)" : "none",
                                 fontWeight: 700 }}>{p}</span>
                ))}
              </div>
              {!pl.ok && (
                <p className="mt-2 text-xs" style={{ color: "#B45309", fontWeight: 600 }}>
                  Restano {pl.left} kg per lato: carico non componibile con i dischi standard.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Guida esercizi: bottone esca visibile a TUTTI (Free, Paid, Coaching) */}
      <div className="mt-3">
        <button onClick={() => setGuideOpen((v) => !v)}
                className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-all duration-300"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <span className="text-sm flex items-center gap-2" style={{ color: "var(--ink)", fontWeight: 600 }}>
            🔍 GUIDA BIOMECCANICA ED ESECUZIONE IMPECCABILE
            {userPlan === "full_coaching" && (
              <span className="rounded-full px-2 py-0.5" style={{ background: "linear-gradient(135deg, #D4AF37, #AA7C11)",
                      color: "#FFFFFF", fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.02em" }}>
                👑 DIRECT
              </span>
            )}
          </span>
          {guideOpen ? <ChevronUp size={15} style={{ color: "var(--ink-2)" }} /> : <ChevronDown size={15} style={{ color: "var(--ink-2)" }} />}
        </button>

        {guideOpen && userPlan === "free" && (
          <div className="spring-in mt-2">
            <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
              title="🔒 CONTENUTO EXCLUSIVE"
              text="Questa esecuzione è protetta dai nostri algoritmi biomeccanici. Passa al Performance Pack (€5/mese) o al Full Coaching per sbloccare le istruzioni da manuale clinico e l'assistente PERFORM AI per settare le macchine ed eseguire l'esercizio alla perfezione senza infortuni!" />
          </div>
        )}

        {guideOpen && userPlan !== "free" && (
          <div className="spring-in inner p-4 mt-2 space-y-4">
              <div>
                <p className="label mb-1.5" style={{ color: "#10B981" }}>🟢 COME SI ESEGUE</p>
                <p className="body text-sm">{ex.howTo || exerciseHowTo(ex.name)}</p>
              </div>
              <div>
                <p className="label mb-1.5" style={{ color: "#DC2626" }}>🔴 COSA EVITARE</p>
                <p className="body text-sm">{ex.avoid || exerciseAvoid(ex.name)}</p>
              </div>

              <PerformAIChatBox exerciseName={ex.name} accent={accent} />

              {userPlan === "full_coaching" && (
                <div>
                  <div className="rounded-2xl px-4 py-3 mb-2 text-center"
                       style={{ background: "linear-gradient(135deg, #D4AF37, #AA7C11)" }}>
                    <span style={{ color: "#FFFFFF", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "0.01em" }}>
                      👑 ASSISTENZA DIRECT WhatsApp
                    </span>
                  </div>
                  <p className="meta mb-2" style={{ fontSize: "0.68rem" }}>
                    Invia il video della tua esecuzione: correzione a occhio clinico a Tempo Zero da parte del
                    Coach Daniel Marsini.
                  </p>
                  <a href={`https://wa.me/390000000000?text=${encodeURIComponent(`Ciao Coach, ti invio il video della mia esecuzione di ${ex.name} per la correzione.`)}`}
                     target="_blank" rel="noopener noreferrer"
                     className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-3"
                     style={{ backgroundColor: "#25D366", color: "#FFFFFF", fontWeight: 700 }}>
                    Apri WhatsApp e invia al Coach
                  </a>
                  <label className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full cursor-pointer transition-transform active:scale-[0.98]"
                         style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
                    <Camera size={15} style={{ color: "#FFFFFF" }} />
                    {videoUrl ? "Sostituisci video" : "Carica video dall'anteprima"}
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  </label>
                  {videoUrl && (
                    <video src={videoUrl} controls className="w-full rounded-xl mt-3" style={{ maxHeight: 220 }} />
                  )}
                  <p className="meta mt-2" style={{ fontSize: "0.62rem" }}>
                    Il video resta visibile solo in questa sessione di anteprima: nell'app reale partirebbe
                    l'invio diretto al coach.
                  </p>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Mini chat simulata: sblocca dritte, impostazioni macchine e info in tempo
   reale sull'esercizio, dal Performance Pack in su. */
function PerformAIChatBox({ exerciseName, accent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const send = () => {
    const q = input.trim();
    if (!q) return;
    const reply = `Su ${exerciseName}: controlla il setup (altezza sedile/leve), tieni la fase eccentrica lenta e ` +
      `il core stabile. Chiedi pure altri dettagli su angolazioni, prese o alternative se qualcosa non ti torna.`;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: reply }]);
    setInput("");
  };

  return (
    <div>
      <p className="label mb-1.5">💬 CHIEDI A PERFORM AI</p>
      {messages.length === 0 && (
        <p className="meta mb-2" style={{ fontSize: "0.72rem" }}>
          Dritte, impostazioni delle macchine o qualunque dubbio in tempo reale su questo esercizio.
        </p>
      )}
      {messages.length > 0 && (
        <div className="space-y-2 mb-2" style={{ maxHeight: 180, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left" }}>
              <span className="inline-block rounded-2xl px-3 py-2 text-xs" style={{
                backgroundColor: m.role === "user" ? accent : "var(--surface)",
                color: m.role === "user" ? "#FFFFFF" : "var(--ink)",
                maxWidth: "85%", border: m.role === "user" ? "none" : "1px solid var(--line)" }}>
                {m.text}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") send(); }}
               placeholder="Scrivi la tua domanda…" className="input flex-1 min-w-0 px-3 py-2.5 text-sm"
               aria-label="Chiedi a PERFORM AI" />
        <button onClick={send} aria-label="Invia" className="shrink-0 rounded-xl px-4 flex items-center justify-center"
                style={{ backgroundColor: "#111111" }}>
          <ChevronRight size={16} style={{ color: "#FFFFFF" }} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Allenamento FREE: routine libera, esercizi a scelta, Lun-Dom, multi-settimana.
   ------------------------------------------------------------------------- */

/* Database esercizi organizzato per distretto muscolare: base italiana pronta
   per la ricerca nel builder della routine (select con optgroup). */
const EXERCISE_DB = {
  Pettorali: [
    "Panca piana bilanciere", "Panca inclinata bilanciere", "Panca inclinata manubri", "Panca piana manubri",
    "Croci ai cavi", "Croci manubri panca piana", "Dip alle parallele", "Chest press macchina", "Pectoral machine (Peck-Deck)",
  ],
  "Gran Dorsale": [
    "Trazioni alla sbarra", "Lat machine avanti", "Rematore bilanciere", "Rematore manubrio monolaterale",
    "Pulley basso", "Pull-over ai cavi", "Stacco da terra", "Iperestensioni lombari",
  ],
  Trapezio: [
    "Shrug bilanciere", "Shrug manubri", "Face pull ai cavi", "Rematore presa larga",
  ],
  "Deltoide Anteriore": [
    "Lento avanti bilanciere", "Military press", "Arnold press", "Alzate frontali manubri", "Alzate frontali ai cavi",
  ],
  "Deltoide Laterale": [
    "Alzate laterali manubri", "Alzate laterali su panca", "Alzate laterali ai cavi", "Alzate laterali macchinario",
  ],
  "Deltoide Posteriore": [
    "Alzate posteriori manubri", "Reverse fly machine", "Alzate posteriori ai cavi",
  ],
  Bicipiti: [
    "Curl bilanciere", "Curl manubri alternato", "Curl a martello", "Preacher curl", "Curl ai cavi",
  ],
  Tricipiti: [
    "French press", "Push down ai cavi", "Dip su panca per tricipiti", "Kickback ai cavi", "Skull crusher",
  ],
  Addome: [
    "Plank", "Crunch ai cavi", "Sollevamento gambe", "Ab wheel rollout",
  ],
  Glutei: [
    "Hip thrust", "Affondi bulgari", "Abduttori macchina", "Glute bridge",
  ],
  Quadricipiti: [
    "Squat bilanciere", "Front squat", "Leg press 45°", "Affondi manubri", "Leg extension",
  ],
  Femorali: [
    "Stacco rumeno", "Leg curl", "Good morning",
  ],
  Adduttori: [
    "Adduttori macchina", "Squat sumo", "Copenhagen plank",
  ],
  Polpacci: [
    "Calf raise in piedi", "Calf raise seduto", "Leg press calf raise",
  ],
};

const EXERCISE_LIBRARY = Object.values(EXERCISE_DB).flat().sort((a, b) => a.localeCompare(b, "it"));

/* Spiegazioni biomeccaniche da manuale esperto per le varianti d'élite più
   richieste: leve, linee di forza e profili di tensione, non solo indicazioni
   generiche. Le voci non presenti qui ricadono sul fallback per pattern. */
const EXERCISE_BIOMECH = {
  "Alzate laterali manubri": {
    howTo: "Il braccio funge da leva lunga con il carico applicato alla mano: il momento resistente cresce " +
      "con l'abduzione, rendendo la tensione massima quando il braccio è parallelo al pavimento e minima in " +
      "basso. Inclina leggermente il busto in avanti per spostare il vettore di forza sul fascio laterale " +
      "invece che sul trapezio, e non superare l'altezza della spalla per non richiamare troppo il deltoide " +
      "anteriore e il trapezio superiore.",
    avoid: "Non usare slancio con le gambe o oscillazione del busto per portare su il peso, non superare " +
      "l'altezza della spalla, non ruotare il polso verso l'alto (mignolo più alto del pollice) per proteggere la cuffia dei rotatori.",
  },
  "Alzate laterali su panca": {
    howTo: "Eliminando lo slancio del busto tramite l'appoggio (seduto o inclinato di lato su una panca), isoli " +
      "quasi completamente il deltoide laterale: la leva resta identica alla variante in piedi, ma senza compensi " +
      "lombari il picco di tensione si sposta più chiaramente a metà del range di movimento, dove il momento " +
      "torcente sull'articolazione è massimo.",
    avoid: "Non staccare la schiena dall'appoggio per aiutarsi con lo slancio (vanificherebbe il senso " +
      "dell'esercizio), non usare un carico che ti costringe a flettere il gomito oltre 90°.",
  },
  "Alzate laterali ai cavi": {
    howTo: "Il cavo mantiene tensione costante lungo tutto l'arco di movimento, a differenza del manubrio dove " +
      "la tensione cala vicino alla posizione di partenza e a fine corsa per via della gravità verticale: il " +
      "profilo di tensione ai cavi è quindi più uniforme, particolarmente utile per il time-under-tension e per " +
      "chi cerca il picco di contrazione in accorciamento.",
    avoid: "Non allontanarti troppo dal punto di ancoraggio del cavo (cambia l'angolo di trazione), non tirare " +
      "con il gomito troppo flesso: il movimento deve restare un'abduzione pura di spalla.",
  },
  "Alzate laterali macchinario": {
    howTo: "Il vincolo meccanico della leva della macchina impone un percorso fisso e spesso una curva di " +
      "resistenza variabile pensata per compensare gli svantaggi di leva naturali dell'articolazione: questo " +
      "permette di isolare il deltoide laterale con il minimo reclutamento di muscoli stabilizzatori, ideale a " +
      "fine allenamento quando la tecnica libera comincia a peggiorare per fatica.",
    avoid: "Non impostare il perno della macchina più in alto o più in basso della propria spalla, non spingere " +
      "con il polso in estensione: il contatto con il cuscinetto deve restare vicino al gomito.",
  },
  "Panca piana bilanciere": {
    howTo: "Scapole retratte e addotte contro la panca creano una base stabile e riducono l'escursione richiesta " +
      "alla spalla; il bilanciere si muove lungo una linea leggermente diagonale (dallo sterno verso gli occhi in " +
      "risalita) per restare sopra il gomito, il punto di massima efficienza della leva in ogni istante del movimento.",
    avoid: "Non far rimbalzare il bilanciere sul petto, non staccare i glutei dalla panca per aumentare l'arco, " +
      "non iperestendere le spalle nella fase più bassa se non hai una mobilità adeguata.",
  },
  "Stacco rumeno": {
    howTo: "Il bilanciere resta a contatto con le cosce per l'intero movimento, minimizzando il braccio di leva " +
      "tra carico e colonna lombare; la flessione avviene quasi solo all'anca (hip hinge), con ginocchia " +
      "leggermente flesse e fisse, caricando i femorali in allungamento sotto tensione.",
    avoid: "Non arrotondare la lombare per raggiungere il pavimento, non allontanare il bilanciere dalle gambe, " +
      "non trasformarlo in uno squat flettendo troppo le ginocchia.",
  },
  "Trazioni alla sbarra": {
    howTo: "La leva è determinata dalla distanza tra le mani e il corpo: presa più larga privilegia il Gran " +
      "Dorsale, presa più stretta e supinata coinvolge di più il bicipite. Il gomito deve tracciare una linea " +
      "verso il basso e leggermente indietro, non solo verso il basso, per massimizzare l'adduzione della scapola.",
    avoid: "Non usare lo slancio (kipping) se l'obiettivo è ipertrofia, non accorciare il range evitando " +
      "l'estensione completa in basso, non anticipare le spalle in avanti nella risalita.",
  },
};

/* Tecniche di intensità più usate in palestra e bodybuilding: modificabili
   liberamente su ogni esercizio, anche dopo averlo creato. */
export const INTENSITY_TECHNIQUES = [
  "RIR 4 (facile)", "RIR 3", "RIR 2", "RIR 1", "RIR 0 (Cedimento)",
  "Dropset", "Rest-Pause", "Stripping", "Cluster Set", "Myo-reps", "Tempo (TUT controllato)",
];

function emptyWeek() { return Array.from({ length: 7 }, () => null); }
function makeExercise(name, sets, reps, targetMuscle) {
  const ex = { name, sets, reps, rest: "90", intensity: "RIR 2" };
  if (targetMuscle) ex.targetMuscle = targetMuscle;
  return ex;
}

function FreeWorkoutBuilder({ accent, accentText, accentSoft, day, onUpgrade, onCoachSync, userPlan, gender, supabase, userId }) {
  const [innerTab, setInnerTab] = useState("oggi");
  const [weeks, setWeeks] = useState([emptyWeek()]);
  const [activeWeek, setActiveWeek] = useState(0);
  const [sets, setSets] = useState({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Libreria esercizi condivisa (SCHEMA_v39), caricata una volta qui e
  // riusata sia dal grafico volumi sia da DayEditor per sapere se un
  // esercizio scritto a mano è già mappato o serve un target manuale.
  const isRealMode = Boolean(supabase && userId);
  const [exerciseLib, setExerciseLib] = useState(DEFAULT_EXERCISE_LIB);
  useEffect(() => {
    if (!isRealMode) return;
    fetchExerciseLibrary(supabase).then(setExerciseLib)
      .catch((err) => console.error("PERFORM: errore caricamento libreria esercizi", err));
  }, [isRealMode, supabase]);

  const todayDay = weeks[0]?.[day.weekday] || null;

  const setsFor = (ex) => sets[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "", rir: "" }));
  const onSetField = (ex, i, f, v) =>
    setSets((s) => {
      const rows = (s[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "", rir: "" }))).map((r, j) => (j === i ? { ...r, [f]: v } : r));
      return { ...s, [ex.id]: rows };
    });

  const toggleDayTraining = (weekIdx, dayIdx) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : (d ? null : { label: "", exercises: [] }))))));

  const setDayLabel = (weekIdx, dayIdx, label) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, label })))));

  const addExercise = (weekIdx, dayIdx, item) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: [...d.exercises, item] })))));

  const removeExercise = (weekIdx, dayIdx, exIdx) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: d.exercises.filter((_, k) => k !== exIdx) })))));

  const updateExercise = (weekIdx, dayIdx, exIdx, patch) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : {
      ...d, exercises: d.exercises.map((e, k) => (k !== exIdx ? e : { ...e, ...patch })),
    })))));

  const addWeek = () => setWeeks((ws) => [...ws, emptyWeek()]);
  const duplicateWeek = (idx) =>
    setWeeks((ws) => [...ws, ws[idx].map((d) => (d ? { ...d, exercises: d.exercises.map((e) => ({ ...e })) } : null))]);
  const deleteWeek = (idx) =>
    setWeeks((ws) => {
      if (ws.length <= 1) return ws; // sempre almeno 1 settimana
      const next = ws.filter((_, i) => i !== idx);
      return next;
    });

  const weeksFromDates = useMemo(() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate), e = new Date(endDate);
    if (isNaN(s) || isNaN(e) || e < s) return null;
    const diffDays = Math.round((e - s) / 86400000);
    return Math.max(1, Math.ceil((diffDays + 1) / 7));
  }, [startDate, endDate]);

  const applyDateRange = () => {
    if (!weeksFromDates) return;
    setWeeks((ws) => Array.from({ length: weeksFromDates }, (_, i) => ws[i] || emptyWeek()));
    setActiveWeek(0);
  };

  useEffect(() => {
    if (activeWeek >= weeks.length) setActiveWeek(Math.max(0, weeks.length - 1));
  }, [weeks.length, activeWeek]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 mb-5">
        {[["oggi", "Sessione di Oggi"], ["routine", "La Mia Routine"]].map(([id, lab]) => {
          const on = innerTab === id;
          return (
            <button key={id} onClick={() => setInnerTab(id)}
              className="rounded-2xl px-2 py-3 transition-all duration-300"
              style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                        : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              <span className="font-data block" style={{ fontSize: "0.6rem", letterSpacing: "0.04em",
                      textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {innerTab === "oggi" ? (
        <div className="spring-in">
          {!todayDay ? (
            <div className="card text-center py-10">
              <Dumbbell size={26} className="mx-auto mb-3" style={{ color: accent }} />
              <p className="h2 mb-1">Nessuna scheda per oggi</p>
              <p className="body max-w-xs mx-auto mb-4">
                {WEEK_DAYS[day.weekday]} risulta come riposo nella tua routine, oppure non l'hai ancora
                impostata. Vai su "La Mia Routine" per costruirla.
              </p>
              <button onClick={() => setInnerTab("routine")} className="rounded-full px-5 py-3 text-sm btn-3d"
                      style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
                Costruisci la routine
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="h2">{todayDay.label || "Sessione di oggi"}</p>
              {todayDay.exercises.length === 0 ? (
                <p className="body">Nessun esercizio ancora aggiunto a questo giorno: aggiungilo da "La Mia Routine".</p>
              ) : todayDay.exercises.map((item, exIdx) => {
                const restNum = Number(item.rest) || 90;
                const exObj = { id: `today-${day.weekday}-${exIdx}`, name: item.name, sets: Number(item.sets) || 3,
                  reps: item.reps || "-", rirTarget: "-", technique: item.intensity || "",
                  rests: Array(Number(item.sets) || 3).fill(restNum), history: [] };
                return (
                  <ExerciseCard key={exObj.id} ex={exObj} index={exIdx} rows={setsFor(exObj)}
                    onSetField={onSetField} accent={accent} accentText={accentText} onCoachSync={onCoachSync}
                    userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="spring-in">
          <div className="card mb-4">
            <p className="label mb-1">Autonomia totale</p>
            <p className="h1 mb-1">Costruisci la tua settimana</p>
            <p className="body mb-4">
              Scegli gli esercizi giorno per giorno, da Lunedì a Domenica. Imposta recupero e intensità per
              ogni esercizio: puoi modificarli in qualsiasi momento, anche dopo averli creati.
            </p>

            <p className="label mb-2">Programma un intervallo di date (calcolo automatico delle settimane)</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">Data inizio</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                       className="input w-full px-4 py-3 font-data text-sm" />
              </label>
              <label className="block">
                <span className="label block mb-1.5">Data fine</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                       className="input w-full px-4 py-3 font-data text-sm" />
              </label>
            </div>
            <button onClick={applyDateRange} disabled={!weeksFromDates}
              className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
              style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
              {weeksFromDates ? `Imposta ${weeksFromDates} settiman${weeksFromDates === 1 ? "a" : "e"}` : "Scegli data inizio e fine"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {weeks.map((_, wi) => (
              <span key={wi} className="inline-flex items-center rounded-full overflow-hidden"
                    style={activeWeek === wi ? { backgroundColor: "var(--ink)" }
                                              : { backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}>
                <button onClick={() => setActiveWeek(wi)} className="px-4 py-2 text-sm"
                  style={{ color: activeWeek === wi ? "var(--page)" : "var(--ink-2)" }}>
                  Settimana {wi + 1}
                </button>
                {weeks.length > 1 && (
                  <button onClick={() => deleteWeek(wi)} aria-label={`Elimina Settimana ${wi + 1}`}
                    className="pr-3 pl-1"
                    style={{ color: activeWeek === wi ? "var(--page)" : "var(--ink-2)" }}>
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}
            <button onClick={addWeek} className="rounded-full px-4 py-2 text-sm flex items-center gap-1.5"
                    style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <Plus size={14} /> Aggiungi settimana
            </button>
            <button onClick={() => duplicateWeek(activeWeek)} className="rounded-full px-4 py-2 text-sm"
                    style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              Duplica questa settimana
            </button>
          </div>

          <div className="space-y-3">
            {WEEK_DAYS.map((dLabel, dIdx) => {
              const dayData = weeks[activeWeek]?.[dIdx] ?? null;
              return (
                <DayEditor key={dIdx} label={dLabel} data={dayData}
                  onToggle={() => toggleDayTraining(activeWeek, dIdx)}
                  onLabel={(v) => setDayLabel(activeWeek, dIdx, v)}
                  onAdd={(item) => addExercise(activeWeek, dIdx, item)}
                  onRemove={(exIdx) => removeExercise(activeWeek, dIdx, exIdx)}
                  onUpdate={(exIdx, patch) => updateExercise(activeWeek, dIdx, exIdx, patch)}
                  accent={accent} accentText={accentText} accentSoft={accentSoft}
                  supabase={supabase} userId={userId} exerciseLib={exerciseLib} onLearned={setExerciseLib} />
              );
            })}
          </div>

          <div className="mt-4">
            <VolumeMatrixCard weekDays={weeks[activeWeek]} userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} accent={accent} supabase={supabase} userId={userId} libOverride={exerciseLib} />
          </div>
        </div>
      )}

      <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Non sai come periodizzare, quando inserire settimane di scarico o di carico, o come dosare l'intensità (RIR, cedimento, dropset...)? Fatti aiutare da un professionista del settore: vedi gli abbonamenti disponibili per metterti in contatto." />
    </div>
  );
}

function DayEditor({ label, data, onToggle, onLabel, onAdd, onRemove, onUpdate, accent, accentText, accentSoft, supabase, userId, exerciseLib, onLearned }) {
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [targetMuscle, setTargetMuscle] = useState("");
  const [setsVal, setSetsVal] = useState("3");
  const [reps, setReps] = useState("8-10");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EXERCISE_LIBRARY.slice(0, 8);
    return EXERCISE_LIBRARY.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const trimmed = query.trim();
  const isKnown = EXERCISE_LIBRARY.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  // BUG PRESO: prima indovinava il distretto con un regex sul nome (spesso
  // sbagliato, "Generico" invisibile al grafico) — ora chiede sempre
  // un'assegnazione manuale per un nome che non è già nella libreria
  // condivisa reale (stessa fonte del pannello coach), niente più indovinelli.
  const inSharedLib = Boolean((exerciseLib || {})[trimmed]);
  const needsTarget = trimmed.length > 0 && !inSharedLib;

  const handleAdd = () => {
    if (!trimmed) return;
    if (needsTarget && !targetMuscle) return;
    // Un esercizio nuovo con target scelto entra nella libreria condivisa:
    // "così se inserisco un nuovo esercizio non perdo tempo a riscriverlo
    // per altri che hanno lo stesso esercizio" — richiesta esplicita.
    if (needsTarget && targetMuscle && supabase && userId) {
      const direct = [DB_MUSCLE_TO_CHART[targetMuscle] || targetMuscle];
      learnExercise(supabase, trimmed, direct, [], userId)
        .then(() => fetchExerciseLibrary(supabase).then((lib) => onLearned?.(lib)))
        .catch((err) => console.error("PERFORM: errore salvataggio esercizio in libreria", err));
    }
    onAdd(makeExercise(trimmed, setsVal, reps, needsTarget ? targetMuscle : undefined));
    setQuery(""); setTargetMuscle(""); setDropOpen(false);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="h2">{label}</p>
        <button onClick={onToggle} role="switch" aria-checked={!!data}
                aria-label={`Alterna riposo/allenamento per ${label}`}
                className="relative rounded-full transition-all duration-300 shrink-0"
                style={{ width: 48, height: 28, backgroundColor: data ? accent : "var(--surface-2)",
                         border: data ? "none" : "1px solid var(--line)" }}>
          <span className="absolute rounded-full transition-all duration-300"
                style={{ width: 22, height: 22, top: 3, left: data ? 23 : 3,
                         backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" }} />
        </button>
      </div>

      {!data ? (
        <p className="meta">Giorno di riposo</p>
      ) : (
        <>
          <input type="text" value={data.label} onChange={(e) => onLabel(e.target.value)}
            placeholder="Nome sessione (es. Push Day)"
            className="input w-full px-4 py-2.5 text-sm mb-3" />

          {data.exercises.length > 0 && (
            <div className="space-y-2 mb-3">
              {data.exercises.map((e, i) => (
                <div key={i} className="inner p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {e.name}
                      {e.targetMuscle && (
                        <span className="ml-1.5 meta" style={{ fontSize: "0.62rem" }}>· {e.targetMuscle}</span>
                      )}
                    </span>
                    <button onClick={() => onRemove(i)} aria-label="Rimuovi esercizio" style={{ color: "var(--ink-2)" }} className="shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                    <label className="block">
                      <span className="label block" style={{ fontSize: "0.52rem" }}>Serie</span>
                      <input type="number" min="1" value={e.sets}
                        onChange={(ev) => onUpdate(i, { sets: ev.target.value })}
                        className="input w-full px-2 py-2 font-data text-xs text-center" />
                    </label>
                    <label className="block">
                      <span className="label block" style={{ fontSize: "0.52rem" }}>Reps</span>
                      <input type="text" value={e.reps}
                        onChange={(ev) => onUpdate(i, { reps: ev.target.value })}
                        className="input w-full px-2 py-2 font-data text-xs text-center" />
                    </label>
                    <label className="block">
                      <span className="label block" style={{ fontSize: "0.52rem" }}>Recupero (sec)</span>
                      <input type="number" min="0" value={e.rest}
                        onChange={(ev) => onUpdate(i, { rest: ev.target.value })}
                        className="input w-full px-2 py-2 font-data text-xs text-center" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="label block mb-1" style={{ fontSize: "0.52rem" }}>Intensità / Tecnica</span>
                    <select value={e.intensity} onChange={(ev) => onUpdate(i, { intensity: ev.target.value })}
                            className="input w-full px-2 py-2 text-xs">
                      {INTENSITY_TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* ricerca con suggerimenti live + digitazione totalmente libera */}
          <div className="relative mb-2">
            <input type="text" value={query}
              onChange={(e) => { setQuery(e.target.value); setDropOpen(true); setTargetMuscle(""); }}
              onFocus={() => setDropOpen(true)}
              onBlur={() => setTimeout(() => setDropOpen(false), 150)}
              placeholder="Cerca o scrivi un esercizio (anche una variante tua)…"
              className="input w-full px-3 py-2.5 text-sm" aria-label={`Cerca esercizio per ${label}`} />
            {dropOpen && filtered.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden"
                   style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)",
                            boxShadow: "0 12px 30px rgba(0,0,0,0.16)", maxHeight: 220, overflowY: "auto" }}>
                {filtered.map((n) => (
                  <button key={n} onMouseDown={() => { setQuery(n); setDropOpen(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm"
                          style={{ color: "var(--ink)", borderBottom: "1px solid var(--line)" }}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {needsTarget && (
            <div className="inner p-3 mb-2">
              <p className="label mb-1.5">Assegna Muscolo Target</p>
              <p className="meta mb-2" style={{ fontSize: "0.65rem" }}>
                Esercizio non riconosciuto: scegli a quale dei 14 distretti inviare il volume, altrimenti il
                grafico resterebbe vuoto per questo movimento.
              </p>
              <select value={targetMuscle} onChange={(e) => setTargetMuscle(e.target.value)}
                      className="input w-full px-3 py-2.5 text-sm">
                <option value="">— scegli un distretto —</option>
                {VOLUME_MUSCLE_ORDER.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-12 gap-2">
            <input type="number" min="1" value={setsVal} onChange={(e) => setSetsVal(e.target.value)}
                   placeholder="Serie" className="input col-span-4 px-3 py-2.5 font-data text-sm text-center" />
            <input type="text" value={reps} onChange={(e) => setReps(e.target.value)}
                   placeholder="Reps" className="input col-span-5 px-3 py-2.5 font-data text-sm text-center" />
            <button onClick={handleAdd} disabled={!trimmed || (needsTarget && !targetMuscle)}
                    className="col-span-3 rounded-xl flex items-center justify-center disabled:opacity-40"
                    style={{ backgroundColor: "#111111" }} aria-label="Aggiungi esercizio">
              <Plus size={17} style={{ color: accent }} />
            </button>
          </div>
          <p className="meta mt-1.5" style={{ fontSize: "0.62rem" }}>
            Recupero (90″ di default) e intensità si impostano dopo l'aggiunta, direttamente su ogni esercizio.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Sottomoduli dell'Alimentazione: Diario Libero per primo.
   ------------------------------------------------------------------------- */

// Corregge la quantità di un alimento già nel diario (grammi cambiati, o
// sbagliati in partenza) riscalando kcal/macro/micro in proporzione, invece
// di dover cancellare la riga e ricercare/reinserire tutto da capo. Usa i
// valori GIÀ salvati sull'item (non richiede di riandare a cercare
// l'alimento originale nel catalogo): perG = valore attuale / grammi attuali.
function scaleFoodItem(item, newGrams) {
  const g = Math.max(1, Math.round(Number(newGrams) || 0));
  const oldGrams = Number(item.grams) || 0;
  if (!oldGrams || g === oldGrams) return { ...item, grams: g };
  const ratio = g / oldGrams;
  const round = (v) => Math.round((Number(v) || 0) * ratio);
  return {
    ...item, grams: g,
    kcal: round(item.kcal), p: round(item.p), c: round(item.c), f: round(item.f),
    na: item.na != null ? round(item.na) : item.na,
    k: item.k != null ? round(item.k) : item.k,
    fe: item.fe != null ? Math.round((Number(item.fe) || 0) * ratio * 10) / 10 : item.fe,
    ca: item.ca != null ? round(item.ca) : item.ca,
    mg: item.mg != null ? round(item.mg) : item.mg,
  };
}

// Icone più sobrie/professionali (pancake, panino, bicchiere col cannuccino
// leggevano "menù per bambini") — stesso set riconoscibile, tono più adulto.
export const MEAL_SLOTS = [
  { id: "colazione", label: "Colazione",  icon: "🍳" },
  { id: "spuntino1", label: "Spuntino 1", icon: "🍎" },
  { id: "pranzo",    label: "Pranzo",     icon: "🥗" },
  { id: "merenda",   label: "Merenda",    icon: "🍊" },
  { id: "cena",      label: "Cena",       icon: "🍽️" },
  { id: "prenanna",  label: "Prenanna",   icon: "🌙" },
];

/* ---------------------------------------------------------------------------
   Integrazione e Timing: momenti della giornata, wiki scientifica, piano PRO.
   ------------------------------------------------------------------------- */

export const SUPP_MOMENTS = [
  { id: "mattina", label: "Mattina", icon: "🌅" },
  { id: "preWo",   label: "Pre-Wo",  icon: "🔥" },
  { id: "postWo",  label: "Post-Wo", icon: "💪" },
  { id: "sera",    label: "Sera",    icon: "🌙" },
];

export const SUPP_WIKI = [
  {
    id: "creatina", name: "Creatina", icon: "⚡",
    dose: "3-5 g/die, tutti i giorni", timing: "Il momento non è critico: ciò che conta è l'assunzione quotidiana costante",
    body: "La creatina monoidrato satura le riserve di fosfocreatina nel muscolo, il sistema energetico più rapido " +
      "per la risintesi di ATP negli sforzi brevi e intensi. Non serve una fase di carico: 3-5 g al giorno saturano " +
      "i depositi in 3-4 settimane con la stessa efficacia. È tra gli integratori con più letteratura a supporto " +
      "per forza e massa magra, ed è sicura per reni e fegato in soggetti sani a queste dosi.",
    deepDive: "Chimicamente è un acido metilguanidinoacetico sintetizzato endogenamente da fegato, reni e pancreas " +
      "a partire da arginina, glicina e metionina, e immagazzinato per il 95% nel tessuto muscolare scheletrico, " +
      "in parte come fosfocreatina. La creatina-chinasi trasferisce rapidamente il gruppo fosfato dalla " +
      "fosfocreatina all'ADP, rigenerando ATP in millisecondi: è il tampone energetico che copre i primi 8-10 " +
      "secondi di uno sforzo massimale, prima che glicolisi e fosforilazione ossidativa prendano il sopravvento. " +
      "Un effetto secondario ben documentato è il richiamo osmotico di acqua intracellulare, che aumenta il volume " +
      "cellulare (cell swelling) e sembra agire anche come segnale anabolico. Livello di evidenza: molto alto " +
      "(centinaia di RCT, meta-analisi convergenti); tra gli integratori sportivi più studiati in assoluto, con " +
      "profilo di sicurezza consolidato anche su cicli pluriennali in soggetti sani.",
  },
  {
    id: "caffeina", name: "Caffeina", icon: "☕",
    dose: "3-6 mg/kg di peso corporeo", timing: "30-60 minuti prima dell'allenamento",
    body: "Agisce come antagonista dei recettori dell'adenosina, riducendo la percezione della fatica e aumentando " +
      "l'attivazione del sistema nervoso centrale. L'effetto ergogenico su forza e resistenza è ben documentato a " +
      "queste dosi. Oltre i 6 mg/kg i benefici non aumentano in proporzione, mentre crescono ansia e disturbi del " +
      "sonno se assunta troppo tardi nel pomeriggio.",
    deepDive: "Molecola xantinica che attraversa liberamente la barriera emato-encefalica e blocca competitivamente " +
      "i recettori dell'adenosina A1 e A2A: l'adenosina si accumula durante la veglia e inibisce l'attività " +
      "neuronale, quindi bloccarla si traduce in maggiore rilascio di dopamina e noradrenalina, vigilanza e ridotta " +
      "percezione dello sforzo (RPE). A livello muscolare periferico contribuisce anche a una maggiore " +
      "mobilizzazione di calcio dal reticolo sarcoplasmatico. Il fegato la metabolizza tramite il citocromo CYP1A2 " +
      "in paraxantina, teobromina e teofillina; l'emivita (3-7 ore, molto variabile su base genetica tra " +
      "metabolizzatori rapidi e lenti) spiega perché la stessa dose serale può compromettere il sonno di alcuni e " +
      "non di altri. Evidenza: alta, con effetto ergogenico riproducibile su forza, potenza e resistenza; la " +
      "tolleranza si sviluppa con l'uso cronico, motivo per cui molti protocolli prevedono cicli di scarico.",
  },
  {
    id: "whey", name: "Whey Protein", icon: "🥛",
    dose: "20-40 g per porzione, in base al fabbisogno proteico residuo", timing: "In qualsiasi momento della giornata: la finestra anabolica post-allenamento è più ampia di quanto si creda",
    body: "La proteina del siero del latte ha un profilo aminoacidico completo e un assorbimento rapido, il che la " +
      "rende comoda per raggiungere la quota proteica giornaliera quando il cibo solido non basta. Non esiste " +
      "un'urgenza di assunzione entro 30 minuti dall'allenamento: la sintesi proteica muscolare resta elevata per " +
      "diverse ore, quindi il totale proteico della giornata conta più del timing preciso.",
    deepDive: "Sottoprodotto della caseificazione, ricco di aminoacidi essenziali e in particolare di leucina " +
      "(circa 10-11% del totale), l'aminoacido che attiva più direttamente il complesso mTORC1, il principale " +
      "regolatore della sintesi proteica muscolare (MPS). La rapida digestione e il picco aminoacidemico precoce " +
      "distinguono la whey dalla caseina (digestione lenta, effetto anti-catabolico prolungato): per questo le " +
      "due si integrano bene in momenti diversi della giornata. Esistono tre forme principali — concentrato " +
      "(WPC, 70-80% proteine, con più lattosio e grassi), isolato (WPI, 90%+, quasi privo di lattosio) e " +
      "idrolizzato (WPH, pre-digerito enzimaticamente, assorbimento ancora più rapido) — con costo e velocità " +
      "d'assorbimento crescenti. Evidenza: molto alta sul ruolo della proteina totale/die nella sintesi proteica " +
      "netta; l'evidenza sul timing preciso rispetto alla sessione di allenamento è più debole di quanto il " +
      "marketing storico abbia suggerito.",
  },
  {
    id: "omega3", name: "Omega 3 (EPA/DHA)", icon: "🐟",
    dose: "1-3 g/die di EPA+DHA combinati", timing: "Durante un pasto, per migliorare l'assorbimento dei grassi",
    body: "EPA e DHA sono acidi grassi essenziali con effetti documentati su infiammazione sistemica, salute " +
      "cardiovascolare e funzione cognitiva. Non hanno un effetto acuto sulla performance in allenamento: il " +
      "beneficio è cumulativo nel tempo, motivo per cui la costanza giornaliera conta più della singola dose.",
    deepDive: "EPA (acido eicosapentaenoico) e DHA (acido docosaesaenoico) sono acidi grassi polinsaturi omega-3 a " +
      "catena lunga che si incorporano nei fosfolipidi di membrana, alterandone fluidità e funzione, e competono " +
      "con l'acido arachidonico (omega-6) come substrato delle ciclossigenasi: il risultato è la produzione di " +
      "eicosanoidi (prostaglandine, trombossani, leucotrieni) meno infiammatori. Il DHA è inoltre un componente " +
      "strutturale primario delle membrane neuronali e retiniche. Nel contesto sportivo l'interesse riguarda la " +
      "riduzione dell'infiammazione da sovraccarico e del DOMS, con dati preliminari anche su un possibile " +
      "supporto alla sintesi proteica in soggetti anziani. Il rapporto omega-6/omega-3 tipico della dieta " +
      "occidentale è spesso squilibrato (10:1 o peggio) a favore dei pro-infiammatori, da cui il razionale " +
      "dell'integrazione quando il pesce grasso è scarso in dieta. Evidenza: alta su cardiovascolare e " +
      "infiammazione sistemica, moderata sul recupero sportivo specifico.",
  },
  {
    id: "citrullina", name: "Citrullina Malato", icon: "💧",
    dose: "6-8 g/die", timing: "40-60 minuti prima dell'allenamento",
    body: "Aumenta la produzione di ossido nitrico favorendo la vasodilatazione e il flusso ematico verso i " +
      "muscoli attivi, con un possibile beneficio nelle serie ad alte ripetizioni e nella percezione di fatica " +
      "muscolare locale. L'effetto è più marcato in protocolli di volume alto (12+ ripetizioni) che nelle serie " +
      "pesanti a basse ripetizioni.",
    deepDive: "La L-citrullina, a differenza dell'arginina assunta per via orale, sfugge quasi completamente al " +
      "metabolismo epatico di primo passaggio (arginasi intestinale ed epatica) e viene convertita in arginina " +
      "nei reni, alzando i livelli plasmatici di arginina in modo più efficiente dell'arginina stessa assunta " +
      "direttamente. L'arginina è il substrato della ossido nitrico sintasi (NOS), che produce NO — un potente " +
      "vasodilatatore che rilassa la muscolatura liscia vascolare attivando la guanilato ciclasi. Il malato, " +
      "intermedio del ciclo di Krebs, viene aggiunto per un possibile contributo al metabolismo aerobico e al " +
      "tamponamento dell'ammoniaca prodotta durante lo sforzo. Il beneficio pratico riportato è soprattutto un " +
      "aumento del numero di ripetizioni eseguibili prima del cedimento in protocolli ad alto volume, coerente " +
      "con una migliore perfusione muscolare. Evidenza: moderata, dose-dipendente, con maggiore consistenza sopra " +
      "i 6-8 g.",
  },
  {
    id: "bcaa", name: "BCAA", icon: "🧬",
    dose: "5-10 g durante o dopo l'allenamento", timing: "Utili soprattutto in allenamento a digiuno o in deficit calorico marcato",
    body: "I BCAA (leucina, isoleucina, valina) sono già presenti in buona quota nella whey e in qualsiasi fonte " +
      "proteica completa. Se l'apporto proteico giornaliero è già adeguato, il beneficio aggiuntivo è marginale. " +
      "Diventano più sensati per chi si allena a digiuno o segue una dieta molto ipocalorica con proteine ai " +
      "limiti minimi.",
    deepDive: "I tre aminoacidi ramificati (leucina, isoleucina, valina) condividono una via metabolica insolita: " +
      "a differenza degli altri aminoacidi, non vengono degradati dal fegato ma direttamente dal muscolo " +
      "scheletrico, tramite l'enzima BCKD (branched-chain alpha-keto acid dehydrogenase), il che li rende " +
      "disponibili molto rapidamente come substrato energetico e segnale anabolico locale. La leucina in " +
      "particolare è l'attivatore più potente di mTORC1 tra tutti gli aminoacidi, ma da sola — senza gli altri " +
      "aminoacidi essenziali che una proteina completa fornisce — innesca la sintesi proteica senza garantire i " +
      "\"mattoni\" necessari per completarla, un limite noto della supplementazione isolata di BCAA rispetto a " +
      "una fonte proteica completa. Evidenza: bassa/moderata come integrazione isolata in soggetti con apporto " +
      "proteico già adeguato; più solida come substrato energetico anti-catabolico in allenamento prolungato a " +
      "digiuno.",
  },
  {
    id: "beta_alanina", name: "Beta-Alanina", icon: "🔋",
    dose: "3-6 g/die, in dosi frazionate", timing: "Non serve pre-workout: conta l'accumulo cronico, non il timing del singolo giorno",
    body: "Aumenta nel tempo le riserve muscolari di carnosina, un tampone che rallenta l'acidificazione durante " +
      "sforzi intensi tra 1 e 4 minuti (es. serie da 8-15 ripetizioni). Il beneficio emerge dopo alcune settimane " +
      "di uso costante. Il formicolio cutaneo (parestesia) che alcuni avvertono è innocuo e dipende dalla dose " +
      "singola, non cumulativo.",
    deepDive: "La beta-alanina è l'aminoacido limitante nella sintesi endogena della carnosina (un dipeptide di " +
      "beta-alanina e istidina), sintetizzata nel muscolo dalla carnosina sintetasi: integrarla alza le riserve " +
      "muscolari di carnosina fino al 40-60% dopo 4-10 settimane d'uso costante. La carnosina agisce come tampone " +
      "intracellulare degli ioni idrogeno (H+) prodotti dalla glicolisi anaerobica durante sforzi intensi, " +
      "rallentando la caduta del pH muscolare che contribuisce alla fatica in sforzi di 60-240 secondi — la " +
      "\"zona\" tipica di serie da 8-15 ripetizioni o sprint ripetuti. La parestesia (formicolio a viso, collo, " +
      "mani) è mediata dai recettori MrgprD delle fibre nervose cutanee, dose-dipendente e transitoria: " +
      "frazionare la dose (es. 800 mg-1,6 g più volte al giorno) la riduce senza intaccare l'efficacia. Evidenza: " +
      "alta per sforzi ripetuti di media durata, scarsa per sforzi brevissimi (<60s) o molto prolungati (>4 min).",
  },
  {
    id: "glutammina", name: "Glutammina", icon: "🌿",
    dose: "5 g/die", timing: "In qualsiasi momento della giornata",
    body: "Nell'atleta sano con un apporto proteico già sufficiente, l'evidenza a supporto di un effetto diretto " +
      "su crescita muscolare o recupero è debole. Il suo ruolo più solido riguarda la salute intestinale e il " +
      "supporto immunitario in periodi di carico di allenamento molto elevato, più che la performance in sé.",
    deepDive: "È l'aminoacido libero più abbondante nel plasma e nel tessuto muscolare, e il principale substrato " +
      "energetico per gli enterociti (le cellule della mucosa intestinale) e per i linfociti: da qui il suo " +
      "ruolo ben documentato nel supportare la barriera intestinale e la funzione immunitaria, specialmente nei " +
      "periodi di sovraccarico da allenamento in cui i livelli plasmatici di glutammina calano fisiologicamente " +
      "(il cosiddetto \"glutamine drop\" osservato negli atleti di endurance overtrained). Nel muscolo scheletrico " +
      "sano l'organismo la sintetizza autonomamente in quantità sufficiente tramite la glutammina sintetasi, il " +
      "che spiega perché l'integrazione aggiunga poco quando dieta e recupero sono già adeguati. Evidenza: solida " +
      "su immunità e integrità intestinale in carichi di allenamento molto elevati o in condizioni cataboliche " +
      "(es. post-chirurgia); debole su ipertrofia o performance nell'atleta sano ben nutrito.",
  },
  {
    id: "zma", name: "ZMA (Zinco-Magnesio-B6)", icon: "💤",
    dose: "Una dose serale secondo etichetta", timing: "30-60 minuti prima di dormire, lontano dai pasti",
    body: "Ha senso soprattutto per chi ha un apporto di zinco o magnesio ai limiti minimi: in quel caso può " +
      "migliorare qualità del sonno e status minerale. In chi non è carente, l'evidenza di un effetto ormonale " +
      "diretto su testosterone o forza è scarsa: non è un anabolizzante naturale.",
    deepDive: "Combinazione di zinco monometionina, magnesio aspartato e vitamina B6, nata da uno studio degli " +
      "anni '90 su football americano che ne suggeriva un aumento di testosterone e forza, mai replicato in modo " +
      "convincente in soggetti con status minerale normale. Lo zinco è cofattore di centinaia di enzimi e " +
      "coinvolto nella sintesi degli ormoni steroidei, il magnesio nella trasmissione neuromuscolare e nella " +
      "regolazione del GABA (da cui il possibile effetto rilassante/sul sonno), la B6 nel metabolismo degli " +
      "aminoacidi e nella sintesi di serotonina e melatonina. Il razionale reale dell'integrazione è correggere " +
      "una carenza subclinica, comune in diete ipocaloriche o povere di carne rossa e semi: in quel contesto " +
      "specifico l'effetto su sonno e recupero è plausibile. Va assunto lontano da calcio e fibre, che ne " +
      "riducono l'assorbimento. Evidenza: solida solo come correzione di carenza, non come booster ormonale " +
      "indipendente dallo status di partenza.",
  },
  {
    id: "multivitaminico", name: "Multivitaminico", icon: "🧪",
    dose: "1 dose secondo etichetta", timing: "Con un pasto, per migliorare l'assorbimento",
    body: "Funziona come rete di sicurezza contro micro-carenze, utile soprattutto in fase di deficit calorico " +
      "prolungato o con un'alimentazione poco varia. Non sostituisce una dieta varia ricca di verdura e frutta, " +
      "che resta la fonte primaria di micronutrienti e fitocomposti.",
    deepDive: "Copre un paniere di vitamine idrosolubili (gruppo B, C) e liposolubili (A, D, E, K) più oligoelementi " +
      "(zinco, selenio, rame, iodio...), ciascuno cofattore di vie metaboliche specifiche: le B, ad esempio, sono " +
      "coenzimi centrali nel metabolismo energetico di carboidrati, grassi e proteine (glicolisi, ciclo di Krebs, " +
      "beta-ossidazione), mentre le liposolubili richiedono la presenza di grassi alimentari per essere assorbite " +
      "a livello intestinale tramite le micelle biliari. Il deficit calorico prolungato riduce quasi " +
      "meccanicamente l'apporto di micronutrienti insieme alle calorie, anche a parità di qualità della dieta, " +
      "rendendo il periodo di definizione muscolare il contesto in cui il razionale d'uso è più solido. Le " +
      "formulazioni ad alto dosaggio di vitamine liposolubili (A, D, E, K) vanno gestite con attenzione perché, " +
      "a differenza delle idrosolubili in eccesso (eliminate con le urine), si accumulano nel tessuto adiposo ed " +
      "epatico. Evidenza: alta come rete di sicurezza in deficit calorico o dieta poco varia, nulla come " +
      "\"potenziatore\" oltre la correzione di una carenza.",
  },
  {
    id: "collagene", name: "Collagene Idrolizzato", icon: "🦴",
    dose: "10-15 g/die", timing: "Idealmente con Vitamina C, 30-60 minuti prima di attività che stressano i tendini",
    body: "Alcuni studi preliminari mostrano un possibile beneficio sulla salute di tendini e articolazioni quando " +
      "l'assunzione precede un carico meccanico specifico. L'evidenza è ancora meno solida rispetto a creatina o " +
      "proteine, ma il profilo di sicurezza è molto buono.",
    deepDive: "Il collagene idrolizzato è collagene animale scisso enzimaticamente in peptidi corti " +
      "(oligopeptidi), assorbiti a livello intestinale più efficientemente della proteina intera e in parte " +
      "ritrovati intatti nel plasma come dipeptidi caratteristici (es. prolina-idrossiprolina), che sembrano " +
      "fungere da segnale per i fibroblasti dei tessuti connettivi (tendini, legamenti, cartilagine) stimolandone " +
      "la sintesi di collagene endogeno. La vitamina C è cofattore essenziale degli enzimi prolil- e " +
      "lisil-idrossilasi che stabilizzano la tripla elica del collagene neoformato: senza di essa la sintesi è " +
      "meno efficiente, da cui il razionale di abbinarli. Il protocollo studiato con maggiore consistenza prevede " +
      "l'assunzione 30-60 minuti prima di un carico meccanico specifico sul tessuto target (es. prima di un " +
      "allenamento di salto per i tendini rotulei), non un consumo generico distribuito nella giornata. Evidenza: " +
      "preliminare ma in crescita, più solida su tendinopatie da sovraccarico che su cartilagine articolare.",
  },
  {
    id: "ashwagandha", name: "Ashwagandha", icon: "🌱",
    dose: "300-600 mg di estratto standardizzato", timing: "Con un pasto, con costanza quotidiana",
    body: "Diversi studi mostrano una riduzione percepita dello stress e, in alcuni casi, un lieve incremento di " +
      "forza o testosterone. La letteratura è in crescita ma non ancora definitiva quanto quella su creatina o " +
      "caffeina: non sostituisce la gestione di sonno e stress, che restano le leve principali.",
    deepDive: "Withania somnifera è una pianta adattogena il cui principio attivo principale sono i withanolidi, " +
      "steroidi vegetali che sembrano modulare l'asse ipotalamo-ipofisi-surrene (HPA), l'asse centrale della " +
      "risposta allo stress: diversi trial ne mostrano un effetto di riduzione del cortisolo salivare/plasmatico " +
      "del 20-30% dopo 6-8 settimane d'uso costante, coerente con l'effetto soggettivo su ansia percepita. Un " +
      "cortisolo cronicamente elevato è catabolico (favorisce la proteolisi muscolare) e interferisce con il " +
      "sonno profondo, il che spiega l'interesse anche in ambito sportivo oltre che nella gestione dello stress " +
      "generale. Gli studi standardizzano l'estratto sulla percentuale di withanolidi (tipicamente 5%): estratti " +
      "non standardizzati hanno concentrazioni molto variabili e risultati meno prevedibili. Evidenza: moderata e " +
      "in crescita su cortisolo, ansia e sonno; più preliminare sull'effetto diretto su forza e testosterone, " +
      "riportato solo in un sottogruppo di studi.",
  },
  {
    id: "melatonina", name: "Melatonina", icon: "🌙",
    dose: "0.5-3 mg", timing: "30-60 minuti prima di dormire",
    body: "Serve soprattutto a risincronizzare il ritmo circadiano (jet lag, turni di lavoro, orari irregolari), " +
      "più che a sedare. Dosi basse sono spesso efficaci quanto dosi alte, con meno effetto di intontimento al " +
      "risveglio: non è un sonnifero nel senso classico del termine.",
    deepDive: "Ormone prodotto dalla ghiandola pineale in risposta al buio, che agisce sui recettori MT1 e MT2 " +
      "del nucleo soprachiasmatico dell'ipotalamo — il \"pacemaker\" circadiano centrale — segnalando all'organismo " +
      "che è notte, senza un'azione sedativa diretta sul sistema nervoso come le benzodiazepine. La sua secrezione " +
      "endogena è fortemente inibita dalla luce blu (schermi, illuminazione artificiale intensa la sera), motivo " +
      "per cui l'igiene del sonno (luce, orari) resta l'intervento con il maggiore impatto, e l'integrazione " +
      "funziona meglio come complemento che come sostituto. Dosi fisiologiche basse (0.3-1 mg) replicano più " +
      "fedelmente il picco naturale e mostrano spesso pari efficacia rispetto a dosi farmacologiche (3-10 mg), " +
      "con minore rischio di sonnolenza residua al risveglio (hangover da melatonina) legato a un'emivita più " +
      "lunga alle dosi alte. Evidenza: molto alta per la risincronizzazione circadiana (jet lag, turnisti), " +
      "moderata come generico aiuto al sonno in chi non ha un disallineamento circadiano di base.",
  },
  {
    id: "elettroliti", name: "Elettroliti / Sali Minerali", icon: "🧂",
    dose: "Variabile in base a sudorazione, clima e durata dello sforzo", timing: "Durante sedute lunghe o con sudorazione abbondante",
    body: "Utili a prevenire crampi e cali di performance in sedute prolungate o in ambienti caldi, dove la " +
      "perdita di sodio e altri minerali con il sudore è significativa. Per sedute brevi in ambienti freschi " +
      "l'acqua da sola è quasi sempre sufficiente.",
    deepDive: "Il sudore non è acqua pura: contiene soprattutto sodio (circa 460-1.840 mg/litro, molto variabile " +
      "da persona a persona) più potassio, magnesio e cloro in quantità minori. Sodio e potassio sono gli ioni " +
      "che mantengono il gradiente elettrochimico attraverso la membrana delle cellule nervose e muscolari " +
      "(pompa sodio-potassio ATPasi): una loro deplezione significativa altera l'eccitabilità della placca " +
      "neuromuscolare, un meccanismo candidato — insieme all'affaticamento neuromuscolare locale — nella genesi " +
      "dei crampi da sforzo prolungato. Reintegrare solo acqua senza elettroliti in sedute molto lunghe e sudate " +
      "può inoltre diluire il sodio plasmatico (iponatriemia da sforzo), un rischio raro ma reale in eventi di " +
      "endurance di più ore. La quantità di sodio perso varia molto su base individuale e climatica, motivo per " +
      "cui non esiste una dose universale: il colore/sapore del sudore secco sulla pelle (chi suda molto sale " +
      "spesso nota residui bianchi) è un indicatore grezzo ma utile. Evidenza: alta per sforzi lunghi (>90 min) o " +
      "in ambiente caldo-umido, marginale per sedute brevi in ambiente fresco.",
  },
  {
    id: "vitamina_d", name: "Vitamina D3", icon: "🌤️",
    dose: "1.000-2.000 UI/die (dose più alta se carenza accertata)", timing: "Con un pasto contenente grassi, per migliorarne l'assorbimento",
    body: "Fondamentale per la salute ossea, la funzione immunitaria e, indirettamente, per la performance: " +
      "la carenza è molto comune nei mesi invernali e in chi si allena prevalentemente al chiuso. Un dosaggio " +
      "del sangue prima di integrare aiuta a capire la dose realmente necessaria, invece di andare a caso.",
    deepDive: "Nonostante il nome, non è una vitamina in senso stretto ma un pro-ormone: la pelle la sintetizza a " +
      "partire dal colesterolo (7-deidrocolesterolo) sotto l'azione dei raggi UVB, poi il fegato la converte in " +
      "25-idrossivitamina D (la forma misurata negli esami del sangue) e il rene nella forma attiva " +
      "1,25-diidrossivitamina D (calcitriolo), un vero ormone steroideo che si lega a recettori nucleari (VDR) " +
      "presenti praticamente in ogni tessuto, incluso il muscolo scheletrico. Regola l'assorbimento intestinale " +
      "di calcio e fosforo (da cui il ruolo osseo), modula centinaia di geni del sistema immunitario e sembra " +
      "influenzare direttamente la funzione contrattile delle fibre muscolari attraverso i VDR muscolari. Essendo " +
      "liposolubile, si accumula nel tessuto adiposo: per questo il sovrappeso è un fattore di rischio " +
      "indipendente per la carenza, e l'assunzione con un pasto grasso ne migliora l'assorbimento. Solo un esame " +
      "del sangue (25-OH-D) distingue una reale carenza da un livello già adeguato, evitando sia il sotto- che il " +
      "sovra-dosaggio. Evidenza: molto alta su osso e immunità, in crescita ma meno definitiva su performance " +
      "muscolare diretta.",
  },
  {
    id: "magnesio", name: "Magnesio", icon: "🌾",
    dose: "300-400 mg/die (forme come bisglicinato o citrato assorbite meglio)", timing: "Alla sera, lontano da caffè e fibre in eccesso",
    body: "Coinvolto in centinaia di reazioni enzimatiche, incluso il rilassamento muscolare e la qualità del " +
      "sonno. Molte diete moderne ne forniscono meno del necessario. Le forme ossido/solfato sono economiche " +
      "ma assorbite peggio e più lassative; bisglicinato e citrato sono generalmente meglio tollerati.",
    deepDive: "È cofattore di oltre 300 enzimi, incluse tutte le reazioni che usano ATP (l'ATP biologicamente " +
      "attivo è in realtà un complesso Mg-ATP): interviene quindi direttamente nella glicolisi, nella " +
      "fosforilazione ossidativa e nella sintesi proteica. A livello neuromuscolare agisce come antagonista " +
      "fisiologico del calcio nei canali NMDA e nei recettori della giunzione neuromuscolare, contribuendo al " +
      "rilassamento muscolare dopo la contrazione — da cui l'uso tradizionale contro i crampi notturni, anche se " +
      "l'evidenza specifica sui crampi è mista. La forma chimica cambia molto la biodisponibilità: ossido e " +
      "solfato hanno una solubilità intestinale bassa (l'ossido non assorbito richiama acqua nel lume intestinale, " +
      "da cui l'effetto lassativo), mentre le forme chelate agli aminoacidi (bisglicinato) o legate ad acidi " +
      "organici (citrato, malato) sono assorbite tramite trasportatori intestinali diversi e più efficienti. " +
      "Evidenza: alta sul ruolo enzimatico generale e sulla correzione di carenza (molto comune con diete povere " +
      "di legumi/frutta secca/verdure a foglia verde), moderata sull'effetto specifico su qualità del sonno.",
  },
  {
    id: "hmb", name: "HMB", icon: "🧱",
    dose: "3 g/die, suddivisi in più dosi", timing: "Distribuito durante la giornata, con costanza quotidiana",
    body: "Metabolita della leucina studiato per il suo possibile effetto anti-catabolico, soprattutto in fase " +
      "di deficit calorico marcato o in soggetti non allenati. Nell'atleta già ben allenato con proteine " +
      "adeguate, il beneficio aggiuntivo rispetto alla sola dieta è modesto.",
    deepDive: "Il beta-idrossi-beta-metilbutirrato è un metabolita della leucina prodotto in piccola parte " +
      "endogenamente (circa il 5% della leucina assunta viene convertita in HMB via alfa-chetoisocaproato). A " +
      "differenza della leucina, il cui effetto principale è stimolare la sintesi proteica via mTORC1, l'HMB " +
      "sembra agire soprattutto sul fronte opposto: inibisce la via ubiquitina-proteasoma, il principale sistema " +
      "di degradazione proteica muscolare, riducendo quindi il catabolismo più che aumentando l'anabolismo. " +
      "Questo lo rende teoricamente più interessante in condizioni cataboliche marcate (deficit calorico severo, " +
      "immobilizzazione, soggetti anziani sarcopenici, principianti non adattati al carico) che nell'atleta " +
      "avanzato in surplus o mantenimento con proteine già adeguate, dove il catabolismo di base è già contenuto. " +
      "Evidenza: moderata e più consistente nei soggetti non allenati o in condizioni cataboliche marcate, debole " +
      "negli atleti allenati con dieta proteica già ottimizzata.",
  },
  {
    id: "taurina", name: "Taurina", icon: "🐂",
    dose: "1-3 g/die", timing: "Pre-workout o con i pasti",
    body: "Amminoacido coinvolto nella regolazione cellulare e nella contrazione muscolare, spesso presente " +
      "negli energy drink insieme alla caffeina. Le evidenze su un effetto ergogenico diretto sono meno solide " +
      "rispetto a creatina o caffeina, ma il profilo di sicurezza alle dosi comuni è buono.",
    deepDive: "Aminoacido solforato (tecnicamente un acido amminosolfonico, non incorporato nelle proteine) " +
      "presente in altissima concentrazione nel muscolo scheletrico e cardiaco, dove regola il volume cellulare e " +
      "il flusso di calcio nel reticolo sarcoplasmatico durante il ciclo contrazione-rilassamento, oltre ad avere " +
      "un'azione antiossidante diretta sui radicali liberi generati dall'esercizio intenso. Modula anche i " +
      "recettori GABA-A, il che spiega un possibile effetto calmante/ansiolitico a dosi più alte — paradossale " +
      "nelle formulazioni pre-workout dove viene abbinata a stimolanti come la caffeina, con cui l'interazione " +
      "netta sulla performance non è del tutto chiarita. È sintetizzata endogenamente da cisteina e metionina in " +
      "quantità solitamente sufficiente nei soggetti sani, motivo per cui il beneficio aggiuntivo " +
      "dell'integrazione resta meno prevedibile rispetto ad altri ergogenici. Evidenza: moderata su resistenza e " +
      "riduzione del danno ossidativo da esercizio, debole/inconsistente su forza massimale.",
  },
  {
    id: "curcuma", name: "Curcuma (Curcumina)", icon: "🟠",
    dose: "500-1.000 mg/die di curcumina, idealmente con piperina per l'assorbimento", timing: "Con un pasto",
    body: "Composto con proprietà antinfiammatorie studiate soprattutto per il recupero articolare e la " +
      "gestione dell'infiammazione da sovraccarico. Da solo è assorbito molto male dall'intestino: la piperina " +
      "(estratto di pepe nero) ne aumenta significativamente la biodisponibilità.",
    deepDive: "La curcumina è il principale curcuminoide della radice di curcuma e agisce come inibitore " +
      "pleiotropico della via NF-kB, il regolatore centrale della trascrizione di citochine pro-infiammatorie " +
      "(TNF-alfa, IL-6, IL-1beta) attivate dal danno muscolare da esercizio intenso — lo stesso bersaglio " +
      "molecolare, a valle, di molti FANS, ma con un profilo di effetti collaterali gastrointestinali molto più " +
      "favorevole. Il suo limite pratico maggiore è la biodisponibilità orale quasi nulla: viene rapidamente " +
      "glucuronidata e solfatata nell'intestino e nel fegato ed eliminata prima di raggiungere concentrazioni " +
      "plasmatiche utili. La piperina, alcaloide del pepe nero, inibisce questi enzimi di coniugazione " +
      "(in particolare la glucuronidazione epatica) aumentando la biodisponibilità della curcumina fino al " +
      "2.000%, il che spiega perché quasi tutti gli integratori efficaci la includano (o usino formulazioni " +
      "alternative come nanoparticelle o fosfolipidi complessati). Evidenza: da moderata ad alta su marcatori " +
      "infiammatori e dolore muscolare percepito post-esercizio (DOMS), se assunta in forma bioottimizzata.",
  },
  {
    id: "proteine_vegetali", name: "Proteine Vegetali (pisello/riso)", icon: "🌱",
    dose: "20-30 g per porzione, come le proteine animali", timing: "In qualsiasi momento, come qualsiasi fonte proteica",
    body: "Alternativa per chi segue una dieta vegetale o ha intolleranze al lattosio: da sola la proteina di " +
      "riso è carente di lisina e quella di pisello di metionina, ma combinate (come in molti prodotti in " +
      "commercio) offrono un profilo aminoacidico completo, paragonabile a whey o uova.",
    deepDive: "Ogni proteina vegetale isolata ha un \"aminoacido limitante\" — quello presente in quantità " +
      "insufficiente rispetto al fabbisogno umano — che ne riduce il punteggio di qualità proteica (DIAAS): nel " +
      "riso è la lisina, nel pisello la metionina/cisteina. Combinando le due fonti in proporzioni studiate " +
      "(tipicamente 60-70% pisello, 30-40% riso) i profili si completano a vicenda, avvicinando il DIAAS " +
      "complessivo a quello della whey. La leucina, l'aminoacido chiave per l'attivazione di mTORC1, è presente " +
      "in quantità leggermente inferiore rispetto alla whey a parità di grammi di proteina, motivo per cui alcuni " +
      "protocolli con proteine vegetali usano porzioni leggermente più alte (o leucina aggiunta) per equiparare " +
      "lo stimolo anabolico per pasto. La digeribilità è generalmente buona ma leggermente inferiore alle " +
      "proteine animali per la presenza di fattori antinutrizionali residui (es. inibitori della tripsina), " +
      "ridotti dai processi di lavorazione industriale. Evidenza: alta sull'equivalenza pratica con whey/caseina " +
      "quando le fonti sono combinate correttamente e la dose per pasto è adeguata (25-30 g+).",
  },
  {
    id: "probiotici", name: "Probiotici", icon: "🦠",
    dose: "Variabile per ceppo, in genere miliardi di UFC/die indicati in etichetta", timing: "A stomaco vuoto o come da indicazioni del prodotto",
    body: "Supportano l'equilibrio della flora intestinale, utile soprattutto dopo cicli di antibiotici, in " +
      "periodi di stress digestivo o con diete molto ricche di proteine. L'effetto è specifico per ceppo: non " +
      "tutti i probiotici fanno la stessa cosa, e la costanza d'uso conta più della singola assunzione.",
    deepDive: "I probiotici sono microrganismi vivi (soprattutto specie di Lactobacillus e Bifidobacterium) che, " +
      "assunti in quantità adeguata (misurata in unità formanti colonia, UFC), competono con i patogeni per siti " +
      "di adesione sull'epitelio intestinale, producono acidi grassi a catena corta (butirrato, propionato, " +
      "acetato) che nutrono direttamente le cellule del colon e modulano la risposta immunitaria mucosale " +
      "tramite l'interazione con le cellule dendritiche dell'intestino. L'effetto è marcatamente ceppo-specifico: " +
      "il Lactobacillus rhamnosus GG e il Saccharomyces boulardii (un lievito probiotico) hanno evidenza solida " +
      "per la diarrea associata ad antibiotici, mentre altri ceppi sono studiati per gonfiore o sindrome " +
      "dell'intestino irritabile — risultati di uno studio su un ceppo non si estrapolano automaticamente ad " +
      "altri. Nell'atleta con dieta iperproteica il razionale d'uso riguarda il carico fermentativo aggiuntivo " +
      "sul colon dalle proteine non digerite che raggiungono l'intestino crasso. Evidenza: alta ma " +
      "ceppo-dipendente; leggere sempre quale ceppo specifico (non solo il genere) è stato usato negli studi di " +
      "riferimento del prodotto.",
  },
  {
    id: "tongkat_ali", name: "Tongkat Ali", icon: "🌳",
    dose: "200-400 mg/die di estratto standardizzato (es. 100:1)", timing: "Al mattino, con costanza per 4-8 settimane",
    body: "Erba adattogena studiata soprattutto per un possibile aumento del testosterone libero in soggetti " +
      "con livelli bassi o sotto stress cronico, e per un effetto positivo su libido e umore. È un integratore " +
      "ormonalmente attivo poco conosciuto fuori dagli ambienti più specializzati: proprio per questo va " +
      "usato con consapevolezza, verificando la qualità dell'estratto e, idealmente, i propri valori ormonali " +
      "prima e dopo un ciclo d'uso.",
    deepDive: "Eurycoma longifolia contiene quassinoidi ed eurypeptidi il cui meccanismo proposto è una riduzione " +
      "della conversione del testosterone in estrogeni (inibizione dell'aromatasi) e del legame " +
      "testosterone-SHBG (sex hormone-binding globulin), la proteina che tiene il testosterone \"legato\" e non " +
      "biologicamente attivo: meno SHBG occupata significa più testosterone libero disponibile ai tessuti, senza " +
      "necessariamente alzare il testosterone totale. Questo spiega perché l'effetto sia più marcato in soggetti " +
      "con livelli bassi o sotto stress cronico (dove il cortisolo elevato sopprime l'asse " +
      "ipotalamo-ipofisi-gonadi) che in soggetti già eutrofici. Essendo ormonalmente attivo, interagisce con lo " +
      "stesso asse regolato da terapie ormonali o farmaci che modulano SHBG/aromatasi. Evidenza: moderata su " +
      "libido e umore, preliminare ma promettente su testosterone libero in soggetti con livelli sub-ottimali; " +
      "gli studi di alta qualità sono ancora relativamente pochi.",
  },
  {
    id: "fadogia", name: "Fadogia Agrestis", icon: "🌿",
    dose: "600 mg/die di estratto (dosaggi più alti non necessariamente più efficaci)", timing: "Al mattino, cicli di 8-12 settimane con pausa",
    body: "Pianta africana diventata popolare online per un possibile effetto pro-testosterone, ma la " +
      "letteratura scientifica su esseri umani è ancora molto limitata: la maggior parte dei dati viene da " +
      "studi animali. È uno degli integratori più \"underground\" in circolazione: l'entusiasmo online supera " +
      "di gran lunga l'evidenza reale, motivo in più per non usarlo a cuor leggero e senza controlli periodici.",
    deepDive: "Gli studi disponibili — quasi tutti su roditori, non su esseri umani — suggeriscono un possibile " +
      "meccanismo di stimolazione diretta delle cellule di Leydig testicolari (le cellule che producono " +
      "testosterone) tramite un'azione simil-LH (ormone luteinizzante), oltre a un effetto sull'asse " +
      "ipotalamo-ipofisi-gonadi a dosaggi più alti che, negli animali, ha mostrato anche segnali di potenziale " +
      "tossicità testicolare a lungo termine — un dato che rende prudente non estrapolare acriticamente le dosi " +
      "\"efficaci\" animali all'uomo. La composizione chimica esatta dei principi attivi (saponine, alcaloidi) " +
      "responsabili dell'effetto non è ancora del tutto caratterizzata, e la qualità/standardizzazione degli " +
      "estratti in commercio varia enormemente da un produttore all'altro. È tra gli integratori con il divario " +
      "più ampio tra popolarità sui social media e reale solidità scientifica alle spalle. Evidenza: molto bassa " +
      "sull'uomo (pochissimi trial clinici piccoli), motivo per cui va trattato come sperimentale e non come " +
      "protocollo consolidato.",
  },
  {
    id: "ecdisterone", name: "Ecdisterone (Beta-Ecdisterone)", icon: "🦗",
    dose: "500-1.000 mg/die", timing: "Con i pasti, in cicli di alcune settimane",
    body: "Fitoecdisteroide estratto da piante come la Spinacia o la Cyanotis, studiato in alcuni lavori per un " +
      "possibile effetto anabolico non ormonale (non altera l'asse testosterone-estrogeni come gli steroidi " +
      "anabolizzanti). I risultati preliminari su forza e massa magra sono interessanti ma provengono da pochi " +
      "studi: resta un composto di nicchia, poco conosciuto rispetto a creatina o proteine, da trattare come " +
      "sperimentale più che come un pilastro consolidato.",
    deepDive: "Gli ecdisteroidi sono ormoni steroidei degli insetti e di alcune piante (fitoecdisteroidi) " +
      "strutturalmente simili al colesterolo ma privi di attività sui recettori androgeni umani: il meccanismo " +
      "d'azione proposto negli studi preliminari coinvolge invece il legame a un recettore estrogenico " +
      "(ERbeta) nel tessuto muscolare, con conseguente attivazione della via PI3K/Akt/mTOR — la stessa cascata " +
      "finale di segnalazione che porta a sintesi proteica e ipertrofia, ma raggiunta con un ligando e un " +
      "recettore diversi da testosterone e recettore androgeno. Questo spiegherebbe perché negli studi disponibili " +
      "non altera i marcatori ormonali tipici degli anabolizzanti (LH, testosterone, SHBG) pur mostrando, in " +
      "alcuni piccoli trial, incrementi di forza e massa magra superiori al placebo. Il numero di studi controllati " +
      "sull'uomo resta comunque limitato e alcuni con metodologia discussa. Evidenza: preliminare/moderata, in " +
      "crescita ma non ancora al livello di consenso scientifico di creatina o proteine.",
  },
  {
    id: "rodiola", name: "Rhodiola Rosea", icon: "🌸",
    dose: "200-400 mg/die di estratto standardizzato (3% rosavine, 1% salidroside)", timing: "Al mattino, a stomaco vuoto",
    body: "Adattogeno usato tradizionalmente contro la fatica fisica e mentale da stress prolungato. Alcuni " +
      "studi mostrano un miglioramento della resistenza percepita e della lucidità mentale in condizioni di " +
      "affaticamento, con un profilo di sicurezza favorevole. È meno conosciuta di ashwagandha ma altrettanto " +
      "interessante per chi gestisce carichi di lavoro e allenamento elevati insieme.",
    deepDive: "I principi attivi principali, rosavine e salidroside, agiscono su più fronti: modulano l'attività " +
      "delle proteine da shock termico (HSP70), coinvolte nella risposta cellulare allo stress ossidativo e " +
      "metabolico dell'esercizio, e influenzano i livelli di monoamine cerebrali (serotonina, dopamina, " +
      "noradrenalina) implicate nella percezione soggettiva di fatica mentale. A differenza degli adattogeni ad " +
      "azione più lenta come l'ashwagandha, la rodiola mostra spesso un effetto acuto misurabile già dopo una " +
      "singola dose in test di fatica cognitiva e fisica, oltre a un effetto cronico dopo settimane d'uso — un " +
      "doppio profilo temporale relativamente insolito tra gli adattogeni. Il dosaggio efficace dipende molto " +
      "dallo standardize su rosavine e salidroside piuttosto che dal peso grezzo dell'estratto, motivo per cui " +
      "prodotti non standardizzati hanno risultati inconsistenti. Evidenza: moderata su fatica mentale acuta e " +
      "resistenza percepita, più preliminare sull'effetto cronico su performance fisica pura.",
  },
  {
    id: "lions_mane", name: "Lion's Mane (Hericium Erinaceus)", icon: "🦁",
    dose: "500-1.000 mg/die di estratto", timing: "Con i pasti, con costanza per diverse settimane",
    body: "Fungo medicinale studiato per un possibile supporto alla crescita e alla manutenzione dei neuroni " +
      "(tramite la stimolazione del fattore di crescita nervoso, NGF), con interesse crescente per la lucidità " +
      "mentale e la salute cognitiva a lungo termine. Gli studi sull'uomo sono ancora pochi ma promettenti: " +
      "un integratore di nicchia, tipico del mondo della longevità più che di quello sportivo classico.",
    deepDive: "Contiene due classi di composti bioattivi unici tra i funghi medicinali: le erinacine (che " +
      "attraversano la barriera emato-encefalica) e le ericenoni, entrambe capaci di stimolare la sintesi di " +
      "NGF (nerve growth factor), una neurotrofina che promuove la sopravvivenza, la crescita e la " +
      "differenziazione dei neuroni, in particolare nell'ippocampo (l'area cerebrale centrale per memoria e " +
      "apprendimento). L'ipotesi alla base dell'interesse per la salute cognitiva a lungo termine è che livelli " +
      "più alti di NGF possano favorire la plasticità sinaptica e rallentare il declino neuronale legato all'età, " +
      "un meccanismo distinto da quello degli stimolanti (caffeina) o degli adattogeni da stress " +
      "(ashwagandha/rodiola): non dà una spinta acuta, ma lavora su tempi lunghi sulla \"manutenzione\" del " +
      "tessuto nervoso. Gli studi controllati sull'uomo sono ancora numericamente pochi e per lo più su soggetti " +
      "anziani con lieve declino cognitivo, non su popolazione sportiva sana. Evidenza: preliminare ma coerente " +
      "sul meccanismo, insufficiente per conclusioni definitive sulla popolazione generale.",
  },
  {
    id: "urolitina_a", name: "Urolitina A", icon: "🍇",
    dose: "500-1.000 mg/die", timing: "In qualsiasi momento della giornata, con costanza",
    body: "Metabolita prodotto dai batteri intestinali a partire da polifenoli del melograno e delle noci: " +
      "molte persone, però, non hanno i batteri giusti per produrne abbastanza da soli, da cui l'interesse per " +
      "l'integrazione diretta. Studiata per il suo ruolo nella mitofagia (il \"riciclo\" dei mitocondri " +
      "danneggiati nelle cellule), è uno dei composti più discussi nel mondo della longevità e del recupero " +
      "muscolare legato all'età, anche se resta poco conosciuto fuori da quell'ambito.",
    deepDive: "Le ellagitannine del melograno e delle noci vengono convertite in acido ellagico e poi in " +
      "urolitine dal microbiota del colon; solo una minoranza della popolazione (stimata attorno al 40%, i " +
      "cosiddetti \"metabolizzatori di tipo B\") ospita i batteri intestinali necessari a completare questa " +
      "conversione in quantità significative, il che rende l'integrazione diretta di urolitina A pura molto più " +
      "affidabile del semplice consumo di melograno. A livello cellulare l'urolitina A attiva la mitofagia — il " +
      "processo con cui la cellula identifica e degrada selettivamente i mitocondri danneggiati o disfunzionali " +
      "tramite le vie PINK1/Parkin — mantenendo così una popolazione mitocondriale più efficiente. L'efficienza " +
      "mitocondriale del muscolo scheletrico declina fisiologicamente con l'età ed è centrale sia per la " +
      "produzione di energia (ATP) sia per la resistenza alla fatica, da cui l'interesse crescente per il " +
      "recupero muscolare in atleti master oltre che nella ricerca sulla longevità in senso stretto. Evidenza: " +
      "preliminare ma con un meccanismo cellulare ben caratterizzato (a differenza di molti composti \"di moda\"), " +
      "supportata da alcuni trial clinici su forza e biomarcatori mitocondriali negli adulti.",
  },
  {
    id: "nmn", name: "NMN (Nicotinamide Mononucleotide)", icon: "🧬",
    dose: "250-500 mg/die", timing: "Al mattino, a stomaco vuoto",
    body: "Precursore del NAD+, una molecola centrale nella produzione di energia cellulare che diminuisce " +
      "naturalmente con l'età. L'integrazione con NMN (o il suo parente NR, Nicotinamide Riboside) è uno dei " +
      "temi più caldi nella ricerca sulla longevità, ma gli studi solidi su esseri umani sono ancora limitati " +
      "rispetto all'entusiasmo mediatico: promettente, ma da considerare sperimentale.",
    deepDive: "Il NAD+ (nicotinammide adenina dinucleotide) è un coenzima essenziale in centinaia di reazioni " +
      "redox, incluse glicolisi, ciclo di Krebs e catena di trasporto degli elettroni mitocondriale — è " +
      "letteralmente la molecola che rende possibile la produzione di ATP — e funge anche da substrato per le " +
      "sirtuine, una famiglia di enzimi collegati alla riparazione del DNA e alla regolazione dell'espressione " +
      "genica legata all'invecchiamento cellulare. I livelli di NAD+ calano fisiologicamente con l'età (fino al " +
      "50% tra i 40 e i 60 anni in alcuni tessuti), e l'NMN è l'immediato precursore a monte del NAD+ nella via " +
      "di salvataggio (salvage pathway) partendo dalla nicotinammide: assunto per via orale, deve prima essere " +
      "convertito (in parte già nell'intestino, in NR) prima di essere captato dalle cellule e fosforilato a " +
      "NAD+. Il razionale è quindi ripristinare un pool di NAD+ più giovanile per sostenere metabolismo " +
      "energetico e funzione mitocondriale. Evidenza: solida sui meccanismi cellulari e sugli studi animali, " +
      "ancora limitata (pochi trial umani, per lo più piccoli e a breve termine) su outcome clinici concreti " +
      "come performance o longevità reale.",
  },
  {
    id: "glicina", name: "Glicina", icon: "💤",
    dose: "3 g/die", timing: "30-60 minuti prima di dormire",
    body: "Amminoacido semplice ed economico, tra i meno \"di moda\" ma con alcune delle evidenze più solide " +
      "sul miglioramento soggettivo della qualità del sonno profondo, probabilmente tramite un lieve " +
      "abbassamento della temperatura corporea centrale. Spesso trascurato rispetto a melatonina o magnesio, " +
      "merita più attenzione di quanta ne riceva di solito.",
    deepDive: "È l'aminoacido non essenziale più semplice (un solo atomo di idrogeno come catena laterale) e " +
      "agisce come neurotrasmettitore inibitorio nel midollo spinale e nel tronco encefalico, oltre a legarsi ai " +
      "recettori NMDA nel cervello. Il meccanismo proposto per il suo effetto sul sonno è la vasodilatazione " +
      "periferica che induce, favorendo la dispersione di calore corporeo e quindi il naturale calo della " +
      "temperatura corporea centrale che precede e accompagna l'addormentamento e l'ingresso nelle fasi di sonno " +
      "profondo (onde lente) — lo stesso principio fisiologico per cui una doccia calda prima di dormire può " +
      "aiutare. A differenza della melatonina, non agisce sul ritmo circadiano ma sulla fisiologia " +
      "termoregolatoria e neuromodulatoria locale, il che la rende complementare (non alternativa) a un eventuale " +
      "uso di melatonina in caso di disallineamento circadiano concomitante. Evidenza: da moderata ad alta sugli " +
      "outcome soggettivi di qualità del sonno (tempo per addormentarsi, sonnolenza diurna residua), meno studiata " +
      "con misure oggettive come la polisonnografia.",
  },
  {
    id: "berberina", name: "Berberina", icon: "🌼",
    dose: "500 mg, 2-3 volte al giorno con i pasti principali", timing: "Con i pasti più ricchi di carboidrati",
    body: "Composto vegetale studiato per il suo effetto sulla sensibilità insulinica e sulla gestione della " +
      "glicemia post-prandiale, con alcuni lavori che la paragonano (con cautela) a farmaci di prima linea per " +
      "il controllo glicemico. Molto meno nota di creatina o proteine ma potenzialmente rilevante per chi " +
      "gestisce composizione corporea e salute metabolica insieme; può interagire con altri farmaci, quindi " +
      "va usata con attenzione se già in terapia.",
    deepDive: "Alcaloide isochinolinico estratto da diverse piante (Berberis, Coptis), il cui meccanismo " +
      "principale è l'attivazione dell'AMPK (AMP-activated protein kinase), lo stesso \"sensore energetico\" " +
      "cellulare attivato dall'esercizio fisico e, farmacologicamente, dalla metformina: l'attivazione dell'AMPK " +
      "aumenta la traslocazione dei trasportatori del glucosio GLUT4 sulla membrana cellulare (più captazione di " +
      "glucosio dal sangue indipendente dall'insulina) e inibisce la gluconeogenesi epatica. Agisce inoltre sul " +
      "microbiota intestinale con un effetto simile agli antibiotici a spettro selettivo, alterando la " +
      "composizione della flora in modo che sembra contribuire indipendentemente al miglioramento del profilo " +
      "metabolico. Proprio perché condivide bersagli molecolari con farmaci ipoglicemizzanti, l'uso concomitante " +
      "con antidiabetici richiede supervisione medica per il rischio di ipoglicemia additiva; inibisce inoltre " +
      "alcuni enzimi del citocromo P450 (CYP3A4, CYP2D6) coinvolti nel metabolismo di molti farmaci comuni. " +
      "Evidenza: alta su glicemia post-prandiale e sensibilità insulinica, con diversi trial che la paragonano " +
      "favorevolmente alla metformina in studi di dimensioni moderate.",
  },
  {
    id: "astaxantina", name: "Astaxantina", icon: "🦐",
    dose: "4-12 mg/die", timing: "Con un pasto contenente grassi",
    body: "Carotenoide antiossidante estratto da alghe e presente nel salmone selvatico, studiato per la " +
      "protezione dallo stress ossidativo indotto dall'esercizio intenso e per un possibile supporto alla " +
      "salute della pelle e degli occhi. Resta un integratore di nicchia rispetto ai classici da palestra, ma " +
      "con un profilo interessante per chi si allena molto e pensa anche al recupero a lungo termine, non solo " +
      "alla prestazione immediata.",
    deepDive: "Carotenoide xantofillico prodotto dalla microalga Haematococcus pluvialis (da cui lo ottiene per " +
      "via alimentare il salmone selvatico, che gli deve il colore rosa), con una struttura molecolare che gli " +
      "permette — a differenza di molti altri antiossidanti — di posizionarsi attraverso l'intero spessore del " +
      "doppio strato lipidico della membrana cellulare, proteggendola dall'ossidazione sia sul lato esterno che " +
      "su quello interno: un meccanismo che gli conferisce una capacità antiossidante misurata come molto " +
      "superiore, molecola per molecola, a vitamina C, E o beta-carotene nei test in vitro. L'esercizio intenso " +
      "genera specie reattive dell'ossigeno (ROS) che, oltre un certo livello, contribuiscono al danno muscolare " +
      "e al ritardo del recupero: l'astaxantina sembra ridurre questo stress ossidativo senza sopprimere del " +
      "tutto le ROS, che a dosi fisiologiche sono anche un segnale utile per gli adattamenti all'allenamento " +
      "(da cui la cautela verso un uso massiccio e indiscriminato di antiossidanti attorno alla sessione). " +
      "Evidenza: moderata su marcatori di stress ossidativo e affaticamento visivo, preliminare ma coerente su " +
      "recupero muscolare in sport di endurance.",
  },
];

/* Piano scritto dal coach: bloccato in lettura per l'utente a pagamento. */
export const SUPP_PLAN_PRO = {
  mattina: [{ name: "Multivitaminico", dose: "1 cpr", note: "a colazione, con cibo" },
            { name: "Omega 3", dose: "2 g", note: "a colazione" }],
  preWo:   [{ name: "Caffeina", dose: "200 mg", note: "40 min prima" },
            { name: "Citrullina Malato", dose: "8 g", note: "40 min prima" }],
  postWo:  [{ name: "Whey Protein", dose: "30 g", note: "entro 1h dalla seduta" },
            { name: "Creatina", dose: "5 g", note: "con lo shaker post-workout" }],
  sera:    [{ name: "Magnesio", dose: "300 mg", note: "30 min prima di dormire" }],
};

/* Lettura codice a barre REALE: Open Food Facts è il database di prodotti
   alimentari aperto e gratuito (nessuna chiave API, stesso principio già
   scelto per PubMed in News & Tips) — un barcode EAN scansionato dalla
   fotocamera del cliente interroga direttamente questo servizio. Se il
   prodotto è nel loro database, arriva già con nome e nutrienti reali
   per 100g; se non lo trovano, il cliente lo aggiunge a mano come sempre
   (e arricchisce anche il nostro catalogo condiviso, custom_foods). */
// BUG PRESO: le richieste a Open Food Facts non specificavano una lingua —
// l'API rispondeva col nome prodotto nella lingua con cui è stato inserito
// da chi l'ha caricato (spesso francese, essendo un progetto nato in
// Francia, con più contributori francofoni per molti prodotti europei).
// &lc=it chiede la versione localizzata in italiano del nome quando esiste
// (fallback automatico all'originale se un prodotto non ce l'ha).
async function lookupBarcodeProduct(barcode) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments&lc=it`);
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments || {};
  const name = [data.product.product_name, data.product.brands].filter(Boolean).join(" — ") || `Prodotto ${barcode}`;
  return {
    name,
    kcal: Math.round(n["energy-kcal_100g"] ?? 0),
    p: Math.round((n["proteins_100g"] ?? 0) * 10) / 10,
    c: Math.round((n["carbohydrates_100g"] ?? 0) * 10) / 10,
    f: Math.round((n["fat_100g"] ?? 0) * 10) / 10,
    // g → mg: stesso fattore usato per tutti e 3 i minerali già tracciati
    // nel diario (na/k qui, fe/ca/mg mancavano del tutto — restavano
    // sempre 0 nella Griglia Micronutrienti anche con dati OFF disponibili).
    na: n["sodium_100g"] != null ? Math.round(n["sodium_100g"] * 1000) : undefined,
    k: n["potassium_100g"] != null ? Math.round(n["potassium_100g"] * 1000) : undefined,
    fe: n["iron_100g"] != null ? Math.round(n["iron_100g"] * 1000 * 10) / 10 : undefined,
    ca: n["calcium_100g"] != null ? Math.round(n["calcium_100g"] * 1000) : undefined,
    mg: n["magnesium_100g"] != null ? Math.round(n["magnesium_100g"] * 1000) : undefined,
  };
}

/* Ricerca testuale (non da barcode) sullo stesso Open Food Facts: il
   catalogo condiviso locale (Supabase) parte vuoto e cresce solo con quello
   che i clienti aggiungono — alimenti "basic" come miele o proteine in
   polvere possono non esserci ancora. Quando i risultati locali sono pochi,
   si interroga anche il database mondiale reale (milioni di prodotti con
   marca, non solo l'ipotetico "generico"), mostrato in una sezione separata
   nella tendina: se il cliente ne sceglie uno, arricchisce comunque il
   catalogo condiviso locale come una scansione barcode. */
async function searchOpenFoodFactsByName(query) {
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    // lc=it: nome prodotto localizzato in italiano quando esiste (stesso fix
    // di lookupBarcodeProduct — di default arrivava spesso in francese).
    // cc=it: dà priorità nel ranking ai prodotti diffusi/venduti in Italia,
    // senza escludere gli altri se non ce ne sono di locali.
    `&search_simple=1&action=process&json=1&page_size=8&fields=product_name,brands,nutriments&lc=it&cc=it`
  );
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = await res.json();
  return (data.products || [])
    .map((product) => {
      const n = product.nutriments || {};
      const kcal = n["energy-kcal_100g"];
      if (kcal == null) return null; // scarta prodotti senza valori nutrizionali compilati
      const name = [product.product_name, product.brands].filter(Boolean).join(" — ");
      if (!name) return null;
      return {
        name,
        kcal: Math.round(kcal),
        p: Math.round((n["proteins_100g"] ?? 0) * 10) / 10,
        c: Math.round((n["carbohydrates_100g"] ?? 0) * 10) / 10,
        f: Math.round((n["fat_100g"] ?? 0) * 10) / 10,
        na: n["sodium_100g"] != null ? Math.round(n["sodium_100g"] * 1000) : undefined,
        k: n["potassium_100g"] != null ? Math.round(n["potassium_100g"] * 1000) : undefined,
        fe: n["iron_100g"] != null ? Math.round(n["iron_100g"] * 1000 * 10) / 10 : undefined,
        ca: n["calcium_100g"] != null ? Math.round(n["calcium_100g"] * 1000) : undefined,
        mg: n["magnesium_100g"] != null ? Math.round(n["magnesium_100g"] * 1000) : undefined,
      };
    })
    .filter(Boolean);
}

/* Fotocamera in diretta + decodifica barcode client-side (ZXing, nessun
   server coinvolto nella lettura): funziona anche su iOS Safari, dove
   l'API nativa BarcodeDetector non esiste.
   BUG PRESO (3 segnalati insieme):
   1. "Non è veloce e non prende tutti i codici, alcuni in verticale" —
      detect() guardava solo il fotogramma così com'è. Un barcode stampato
      verticale sulla confezione (comune) ha bassa probabilità di essere
      letto da un motore ottimizzato per barre orizzontali. Ora un
      fotogramma ogni 3 viene ANCHE provato ruotato di 90° su un canvas
      offscreen — quasi nessun costo in più (un frame su tre), ma i codici
      verticali ora vengono davvero intercettati. Aggiunta anche una
      richiesta di risoluzione più alta (1920×1080 ideale, non il default
      spesso basso del browser) e autofocus continuo dove il dispositivo lo
      espone — entrambi shorthand per "a fuoco e leggibile", non solo
      "veloce".
   2. "Quando scrivo il codice a mano si bugga la fotocamera" — il video
      era sempre a schermo intero con altezza flessibile (flex-1): quando
      si apre la tastiera per scrivere, il viewport visibile si restringe
      di colpo e quel contenitore si ridimensionava sotto al video live in
      diretta, dando l'effetto di schermata che "salta"/si rompe. Ora
      scrivere a mano è una modalità A SÉ (si passa da un link, non un
      campo sempre visibile sotto alla fotocamera): la fotocamera si
      nasconde del tutto e la traccia video si disattiva (niente calcolo
      sprecato mentre l'attenzione è sulla tastiera), niente più
      ridimensionamento in conflitto con la tastiera. */
function BarcodeScannerModal({ onDetected, onClose, accent }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | denied | error
  const [errorMsg, setErrorMsg] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const manualEntryOpenRef = useRef(false);
  const trackRef = useRef(null);
  const rotationCanvasRef = useRef(null);

  useEffect(() => {
    manualEntryOpenRef.current = manualEntryOpen;
    // Niente frame da decodificare mentre si scrive a mano: disattivare la
    // traccia video (non fermarla) permette di riattivarla istantaneamente
    // tornando alla fotocamera, senza dover richiedere di nuovo il permesso
    // o ricreare lo stream.
    if (trackRef.current) trackRef.current.enabled = !manualEntryOpen;
  }, [manualEntryOpen]);

  // BUG EVITATO: onDetected è una funzione inline nel genitore, ricreata ad
  // ogni suo render — se fosse nell'array di dipendenze dell'effetto sotto,
  // ogni render di NutritionTabs (es. digitando in un altro campo) avrebbe
  // fatto ripartire da zero fotocamera e scansione. Il ref tiene sempre
  // l'ultima versione senza dover mai riavviare la fotocamera per questo.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let rafId = null;
    let zxingControls = null;

    async function startScanning() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (err) {
        throw err; // permesso negato o nessuna fotocamera — gestito nel catch sotto
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // Autofocus continuo dove il dispositivo lo espone (non tutti i
      // browser/fotocamere lo supportano): un codice a barre va letto da
      // vicino, l'autofocus di default a volte resta tarato su distanza
      // media e sfoca proprio l'inquadratura ravvicinata che serve qui.
      try {
        const caps = track.getCapabilities?.();
        if (caps?.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch { /* non supportato: si scansiona comunque con l'autofocus di default */ }

      const video = videoRef.current;
      video.srcObject = stream;
      // Autoplay può essere bloccato senza un gesto utente su alcuni browser
      // anche con video muto: forziamo il play esplicitamente invece di
      // fidarci solo dell'attributo autoplay.
      await video.play().catch(() => {});
      if (cancelled) return;
      setStatus("scanning");

      // API nativa BarcodeDetector (Chrome/Edge/Android): più veloce e più
      // affidabile di una libreria JS quando disponibile. ZXing resta il
      // fallback universale (funziona anche su iOS Safari, dove l'API
      // nativa non esiste).
      if ("BarcodeDetector" in window) {
        let detector;
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"].filter((f) => formats.includes(f));
          detector = new window.BarcodeDetector({ formats: wanted.length ? wanted : formats });
        } catch {
          detector = new window.BarcodeDetector();
        }
        let frameCount = 0;
        const loop = async () => {
          if (cancelled) return;
          if (manualEntryOpenRef.current) { rafId = requestAnimationFrame(loop); return; } // in pausa mentre si scrive a mano
          try {
            frameCount++;
            // Un fotogramma ogni 3 viene provato anche ruotato di 90°, per
            // intercettare i codici stampati in verticale sulla confezione
            // senza raddoppiare il costo di calcolo su OGNI fotogramma.
            let source = video;
            if (frameCount % 3 === 0 && video.videoWidth && video.videoHeight) {
              const canvas = rotationCanvasRef.current || (rotationCanvasRef.current = document.createElement("canvas"));
              const vw = video.videoWidth, vh = video.videoHeight;
              canvas.width = vh; canvas.height = vw;
              const ctx = canvas.getContext("2d");
              ctx.save();
              ctx.translate(vh / 2, vw / 2);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(video, -vw / 2, -vh / 2);
              ctx.restore();
              source = canvas;
            }
            const codes = await detector.detect(source);
            if (codes.length > 0) { onDetectedRef.current(codes[0].rawValue); return; }
          } catch {
            // frame non ancora pronto o errore di decodifica transitorio: si riprova al giro dopo
          }
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return;
      }

      const [{ BrowserMultiFormatReader }, zxingLib] = await Promise.all([
        import("@zxing/browser"), import("@zxing/library"),
      ]);
      if (cancelled) return;
      // TRY_HARDER: zxing prova anche letture più costose (incluse rotazioni
      // marcate) invece di arrendersi al primo tentativo pulito — su iOS
      // Safari, unica via senza BarcodeDetector nativo, vale il costo extra.
      const hints = new Map();
      hints.set(zxingLib.DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      zxingControls = await reader.decodeFromStream(stream, video, (result) => {
        if (cancelled || !result || manualEntryOpenRef.current) return;
        onDetectedRef.current(result.getText());
      });
    }

    startScanning().catch((err) => {
      console.error("PERFORM: errore avvio fotocamera per scansione", err);
      if (cancelled) return;
      setStatus(err?.name === "NotAllowedError" ? "denied" : "error");
      setErrorMsg(err?.name === "NotFoundError" ? "Nessuna fotocamera trovata su questo dispositivo." : (err?.message || "Fotocamera non disponibile."));
    });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submitManualCode = (e) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (code) onDetected(code);
  };

  const modalRef = useRef(null);
  useSwipeDownClose(modalRef, onClose);

  return (
    <Portal>
      <div ref={modalRef} className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: "#0A0A0C", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
              {manualEntryOpen ? "Scrivi il codice" : "Codice a barre"}
            </p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem" }}>Open Food Facts — database aperto e gratuito</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <X size={17} style={{ color: "#FFFFFF" }} />
          </button>
        </div>

        {manualEntryOpen ? (
          // Modalità a sé, non un campo sotto alla fotocamera in diretta:
          // niente più conflitto di ridimensionamento con la tastiera che
          // si apre — vedi BUG PRESO in cima al file.
          <div className="flex-1 flex flex-col px-5 py-2">
            <form onSubmit={submitManualCode} className="flex-1 flex flex-col justify-center">
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem" }} className="mb-3">
                Il codice a barre è stampato sotto le barre nere, di solito 8 o 13 cifre.
              </p>
              <input type="text" inputMode="numeric" value={manualCode} onChange={(e) => setManualCode(e.target.value)}
                placeholder="es. 8001505005707" aria-label="Codice a barre manuale" autoFocus
                className="w-full rounded-xl px-4 py-4 text-lg font-data mb-3"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#FFFFFF" }} />
              <button type="submit" disabled={!manualCode.trim()}
                className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: accent, color: "#FFFFFF" }}>
                Cerca
              </button>
            </form>
            <button onClick={() => setManualEntryOpen(false)}
              className="text-sm py-4 text-center"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              ← Torna alla fotocamera
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex-1 overflow-hidden mx-5 rounded-3xl" data-no-swipe="true" style={{ minHeight: 220 }}>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              {status === "scanning" && (
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="relative rounded-2xl" style={{ height: 130, boxShadow: "0 0 0 2000px rgba(0,0,0,0.5)" }}>
                    {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => (
                      <div key={`${v}-${h}`} className="absolute" style={{
                        [v]: -2, [h]: -2, width: 26, height: 26,
                        borderTop: v === "top" ? `3px solid ${accent}` : "none",
                        borderBottom: v === "bottom" ? `3px solid ${accent}` : "none",
                        borderLeft: h === "left" ? `3px solid ${accent}` : "none",
                        borderRight: h === "right" ? `3px solid ${accent}` : "none",
                        borderRadius: 6,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              {(status === "denied" || status === "error") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle size={26} style={{ color: "#F0A020" }} />
                  <p className="text-sm" style={{ color: "#FFFFFF" }}>
                    {status === "denied" ? "Serve il permesso della fotocamera per scansionare — controlla le impostazioni del browser." : errorMsg}
                  </p>
                </div>
              )}
              {status === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={26} className="animate-spin" style={{ color: "#FFFFFF" }} />
                </div>
              )}
            </div>

            {/* Sempre visibile, non solo se la fotocamera fallisce: un
                codice illeggibile (etichetta rovinata, scarsa luce) o nessuna
                fotocamera restano gestibili senza bloccare il cliente. */}
            <button onClick={() => setManualEntryOpen(true)} className="px-5 py-4 text-sm text-center"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              Il codice non si legge? <span style={{ color: accent, fontWeight: 600 }}>Scrivilo a mano</span>
            </button>
          </>
        )}
      </div>
    </Portal>
  );
}

function NutritionTabs({
  accent, accentSoft, accentText, target, mealsBySlot, foods, mealGuide, substitutions,
  onAddFood, onRemoveFood, onUpdateFood, onOpenScanner, onAddCustomFood, onCopyYesterday, onShoppingList,
  fullAccess, subsAccess, onUpgrade,
  userPlan, gender, waterMl, microAddon, digestValue, onDigestChange, supabase,
  pastDayMode, // true quando si sta correggendo un giorno passato (NutritionCalendarStrip):
               // solo il Diario Libero ha senso qui, Sostituzioni/Dieta Tipo/Wiki non sono
               // legate a una data e micronutrienti/check-in digestivo riguardano "oggi".
}) {
  const [tab, setTab] = useState("diary");        // diary è il default
  const [openSlot, setOpenSlot] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [grams, setGrams] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualMacros, setManualMacros] = useState({ kcal: "", p: "", c: "", f: "" });
  // Modifica grammi di un alimento già nel diario: niente più
  // cancella-e-ricerca per correggere una quantità sbagliata o cambiata.
  const [editingGramsKey, setEditingGramsKey] = useState(null); // `${slotId}-${index}`
  const [editGramsValue, setEditGramsValue] = useState("");

  // Diario Libero resta sempre disponibile. "I Miei Target" non è più un tab
  // qui accanto: i target vivono ora in cima alla schermata Alimentazione
  // (fuori da questi tab, sempre visibili e modificabili da lì — vedi
  // screen === "nutrition"), così non serve cercarli in un tab separato.
  // Sostituzioni solo Performance Pack/Full Coaching (subsAccess, più
  // stretto di "qualunque piano a pagamento"); Dieta Tipo, scritta dal
  // coach, solo Full Coaching (fullAccess) — visibili solo i tab a cui il
  // piano dà davvero accesso, non mostrati-ma-bloccati.
  const visibleTabs = pastDayMode ? [["diary", "Diario Libero"]] : [
    ["diary", "Diario Libero"],
    ...(subsAccess ? [["subs", "Sostituzioni"]] : []),
    ...(fullAccess ? [["plan", "Dieta Tipo"]] : []),
    // Wiki Alimentazione: bottone sempre visibile qui in alto (come Wiki
    // Allenamento tra i 3 di Allenamento Pesi/Cardio/Wiki) invece di stare
    // in fondo alla pagina sotto tutto il resto — il contenuto resta
    // bloccato per FREE, ma il bottone si vede e basta un tap per scoprirlo.
    ["wiki", "Wiki Alimentazione"],
  ];
  useEffect(() => {
    if (!visibleTabs.some(([id]) => id === tab)) setTab("diary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsAccess, fullAccess]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods.slice(0, 10);
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, foods]);

  /* Il catalogo condiviso locale non ha ancora tutto (parte vuoto e cresce
     con quello che i clienti aggiungono) — quando i risultati locali sono
     pochi, si cerca anche su Open Food Facts (milioni di prodotti reali),
     con un piccolo debounce per non interrogarlo a ogni singola lettera. */
  const [offResults, setOffResults] = useState([]);
  const [offSearching, setOffSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!dropOpen || selected || manualAddOpen || q.length < 3 || filtered.length >= 6) {
      setOffResults([]);
      return;
    }
    let cancelled = false;
    setOffSearching(true);
    const t = setTimeout(() => {
      searchOpenFoodFactsByName(q)
        .then((results) => { if (!cancelled) setOffResults(results); })
        .catch((err) => { console.error("PERFORM: errore ricerca Open Food Facts", err); if (!cancelled) setOffResults([]); })
        .finally(() => { if (!cancelled) setOffSearching(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, dropOpen, selected, manualAddOpen, filtered.length]);

  const preview = selected && grams ? {
    name: selected.name, grams: Number(grams),
    kcal: Math.round((selected.kcal * Number(grams)) / 100),
    p: Math.round((selected.p * Number(grams)) / 100),
    c: Math.round((selected.c * Number(grams)) / 100),
    f: Math.round((selected.f * Number(grams)) / 100),
    na: Math.round(((selected.na || 0) * Number(grams)) / 100),
    k: Math.round(((selected.k || 0) * Number(grams)) / 100),
    fe: Math.round((((selected.fe || 0) * Number(grams)) / 100) * 10) / 10,
    ca: Math.round(((selected.ca || 0) * Number(grams)) / 100),
    mg: Math.round(((selected.mg || 0) * Number(grams)) / 100),
  } : null;

  const reset = () => { setQuery(""); setSelected(null); setGrams(""); setManualAddOpen(false); setManualMacros({ kcal: "", p: "", c: "", f: "" }); };

  /* Scansione codice a barre reale (Open Food Facts, vedi lookupBarcodeProduct
     sopra) — nessuna simulazione: il barcode letto dalla fotocamera interroga
     davvero il database prodotti. */
  const [scannerSlot, setScannerSlot] = useState(null); // slotId col mirino aperto, o null
  const [scanLookupBusy, setScanLookupBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const handleBarcodeDetected = async (barcode) => {
    setScannerSlot(null);
    setScanLookupBusy(true);
    setScanError("");
    try {
      const food = await lookupBarcodeProduct(barcode);
      if (!food) {
        setScanError(`Nessun prodotto trovato per il codice ${barcode} — aggiungilo tu qui sotto, arricchirai il catalogo per tutti.`);
        setQuery(barcode);
        setManualAddOpen(true);
        return;
      }
      onAddCustomFood && onAddCustomFood(food);
      setSelected(food); setQuery(food.name); setDropOpen(false);
    } catch (err) {
      console.error("PERFORM: errore ricerca codice a barre", err);
      setScanError("Non sono riuscito a cercare il prodotto — controlla la connessione e riprova.");
    } finally {
      setScanLookupBusy(false);
    }
  };

  /* Inserimento manuale: se un alimento non c'è, chi lo cerca lo aggiunge lui
     stesso al catalogo, che così si arricchisce nel tempo come un vero database
     collettivo (stile MyFitnessPal). */
  const saveManualFood = () => {
    const name = query.trim();
    if (!name) return;
    const food = {
      name, kcal: Number(manualMacros.kcal) || 0, p: Number(manualMacros.p) || 0,
      c: Number(manualMacros.c) || 0, f: Number(manualMacros.f) || 0,
    };
    haptic("confirm");
    onAddCustomFood && onAddCustomFood(food);
    setSelected(food); setManualAddOpen(false); setDropOpen(false);
  };

  return (
    <>
      {!pastDayMode && (
        <div className="grid gap-1.5 mb-5" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
          {visibleTabs.map(([id, lab]) => {
            const on = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="rounded-2xl px-1.5 py-3 transition-all duration-300"
                style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                          : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                <span className="font-data block leading-tight" style={{ fontSize: "0.52rem", letterSpacing: "0.04em",
                        textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>{lab}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------------- DIARIO LIBERO ---------------- */}
      {tab === "diary" && (
        <div className="spring-in">
          {onCopyYesterday && (
            <button onClick={onCopyYesterday}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-5"
              style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <RefreshCw size={15} style={{ color: "#FFFFFF" }} />
              Copia i pasti di ieri
            </button>
          )}

          <div className="space-y-4">
            {MEAL_SLOTS.map((slot) => {
              const items = mealsBySlot[slot.id] || [];
              const tot = items.reduce((a, i) => ({
                kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f,
              }), { kcal: 0, p: 0, c: 0, f: 0 });
              const adding = openSlot === slot.id;

              return (
                <div key={slot.id} className="card">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="h2 flex items-center gap-2.5 min-w-0">
                      <span className="text-xl leading-none" aria-hidden="true">{slot.icon}</span>
                      <span className="truncate">{slot.label}</span>
                    </p>
                    <span className="meta font-data shrink-0">
                      {items.length === 0 ? "vuoto" : `${tot.kcal} kcal`}
                    </span>
                  </div>

                  {items.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {items.map((i, k) => {
                        const editKey = `${slot.id}-${k}`;
                        const isEditingGrams = editingGramsKey === editKey;
                        return (
                          <div key={`${i.name}-${k}`} className="inner flex items-center justify-between gap-3 px-4 py-2.5">
                            <span className="text-sm truncate" style={{ color: "var(--ink)" }}>{i.name}</span>
                            {isEditingGrams ? (
                              <span className="flex items-center gap-1.5 shrink-0">
                                <input type="number" min="1" inputMode="numeric" autoFocus value={editGramsValue}
                                  onChange={(e) => setEditGramsValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  className="input px-2 py-1 text-xs font-data text-right" style={{ width: 56 }}
                                  aria-label={`Grammi di ${i.name}`} />
                                <span className="meta" style={{ fontSize: "0.65rem" }}>g</span>
                                <button onClick={() => {
                                    const g = Math.round(Number(editGramsValue));
                                    if (g > 0 && onUpdateFood) { haptic("confirm"); onUpdateFood(slot.id, k, g); }
                                    setEditingGramsKey(null);
                                  }}
                                  aria-label="Salva quantità" className="p-1 rounded-full" style={{ color: accent }}>
                                  <CheckCircle2 size={16} />
                                </button>
                                <button onClick={() => setEditingGramsKey(null)} aria-label="Annulla" className="p-1 rounded-full" style={{ color: "var(--ink-2)" }}>
                                  <X size={13} />
                                </button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-2 shrink-0">
                                {onUpdateFood ? (
                                  <button onClick={() => { setEditingGramsKey(editKey); setEditGramsValue(String(i.grams ?? "")); }}
                                    className="meta font-data text-xs" style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                                    aria-label={`Modifica quantità di ${i.name}`}>
                                    {i.grams} g · {i.kcal} kcal
                                  </button>
                                ) : (
                                  <span className="meta font-data text-xs">{i.grams} g · {i.kcal} kcal</span>
                                )}
                                {onRemoveFood && (
                                  <button onClick={() => { haptic("warning"); onRemoveFood(slot.id, k); }} aria-label={`Rimuovi ${i.name}`}
                                          className="p-1 rounded-full" style={{ color: "var(--ink-2)" }}>
                                    <X size={13} />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex justify-end gap-3 pt-1">
                        <span className="font-data text-xs" style={{ color: MACRO_COLORS.p.base, fontWeight: 700 }}>P {tot.p}</span>
                        <span className="font-data text-xs" style={{ color: MACRO_COLORS.c.base, fontWeight: 700 }}>C {tot.c}</span>
                        <span className="font-data text-xs" style={{ color: MACRO_COLORS.f.base, fontWeight: 700 }}>G {tot.f}</span>
                      </div>
                      {(() => {
                        const leucine = Math.round(tot.p * 0.085 * 10) / 10;
                        const mtorActive = leucine >= 2.5;
                        return (
                          <div className="mt-2 rounded-full px-3 py-1.5 inline-flex items-center gap-1.5"
                               style={{ backgroundColor: mtorActive ? "rgba(16,185,129,0.12)" : "rgba(240,160,32,0.14)",
                                        border: `1px solid ${mtorActive ? "rgba(16,185,129,0.3)" : "rgba(240,160,32,0.35)"}` }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "-0.01em",
                                    color: mtorActive ? "#047857" : "#B45309" }}>
                              {mtorActive
                                ? `✓ Leucina ~${leucine}g • Via mTOR Attiva`
                                : `⚠ Leucina sotto soglia (${leucine}g) • Sintesi limitata`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {!adding ? (
                    <button onClick={() => { setOpenSlot(slot.id); reset(); }}
                      className="inner w-full flex items-center justify-center gap-2 text-sm px-4 py-3"
                      style={{ color: "var(--ink)" }}>
                      <Plus size={15} style={{ color: accent }} />
                      Aggiungi alimento
                    </button>
                  ) : (
                    <div className="inner p-4">
                      {/* ricerca: nero pieno, piena larghezza */}
                      <div className="relative mb-2.5">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ color: "var(--ink-2)" }} />
                        <input type="text" value={query}
                          onChange={(e) => { setQuery(e.target.value); setSelected(null); setDropOpen(true); }}
                          onFocus={() => setDropOpen(true)}
                          // BUG PRESO: chiudeva la tendina 180ms dopo ogni blur, ANCHE
                          // quando l'utente aveva appena aperto il form "aggiungi
                          // manualmente" e stava per compilare kcal/macro — la tendina
                          // (che conteneva quel form) spariva sotto ai suoi occhi prima
                          // che potesse scrivere nulla. Il form ora vive fuori dalla
                          // tendina (sotto), quindi non dipende più da dropOpen.
                          onBlur={() => setTimeout(() => setDropOpen(false), 180)}
                          placeholder="Cerca alimento…"
                          className="input search-strong w-full pl-10 pr-9 py-3"
                          aria-label={`Cerca alimento per ${slot.label}`} />
                        {selected && (
                          <button onClick={reset} className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                                  style={{ color: "var(--ink-2)" }} aria-label="Svuota">
                            <X size={14} />
                          </button>
                        )}
                        {dropOpen && !selected && !manualAddOpen && (
                          <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl overflow-hidden"
                               style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)",
                                        boxShadow: "0 16px 40px rgba(0,0,0,0.16)", maxHeight: 288, overflowY: "auto" }}>
                            {/* Kcal/macro per 100g già in dropdown, non solo dopo aver scelto:
                                pane, pasta, yogurt... esistono in decine di varianti con valori
                                diversi — l'utente riconosce quello giusto (o il più vicino a
                                quello mangiato) dai numeri, non deve indovinarlo dal solo nome. */}
                            {filtered.map((f) => (
                              <button key={f.name}
                                onMouseDown={() => { setSelected(f); setQuery(f.name); setDropOpen(false); }}
                                className="search-strong w-full text-left px-4 py-2.5"
                                style={{ borderBottom: "1px solid var(--line)" }}>
                                <span className="block truncate">{f.name}</span>
                                <span className="font-data flex gap-2.5 mt-0.5" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                                  <span style={{ color: MACRO_COLORS.kcal.base }}>{f.kcal} kcal</span>
                                  <span style={{ color: MACRO_COLORS.p.base }}>P{f.p}</span>
                                  <span style={{ color: MACRO_COLORS.c.base }}>C{f.c}</span>
                                  <span style={{ color: MACRO_COLORS.f.base }}>G{f.f}</span>
                                  <span style={{ color: "var(--ink-tertiary)", fontWeight: 400 }}>/100g</span>
                                </span>
                              </button>
                            ))}

                            {/* Open Food Facts: solo quando il catalogo condiviso locale
                                ne ha pochi o nessuno — un alimento scelto da qui arricchisce
                                comunque il catalogo locale, come una scansione barcode. */}
                            {(offSearching || offResults.length > 0) && (
                              <div className="px-4 py-2" style={{ backgroundColor: "var(--surface-2)" }}>
                                <p className="meta" style={{ fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                  🌍 Dal database globale (Open Food Facts)
                                </p>
                              </div>
                            )}
                            {offSearching && (
                              <p className="meta text-sm px-4 py-3 flex items-center gap-2">
                                <Loader2 size={13} className="animate-spin" /> Cerco nel database globale…
                              </p>
                            )}
                            {offResults.map((f) => (
                              <button key={`off-${f.name}`}
                                onMouseDown={() => { onAddCustomFood && onAddCustomFood(f); setSelected(f); setQuery(f.name); setDropOpen(false); }}
                                className="search-strong w-full text-left px-4 py-2.5"
                                style={{ borderBottom: "1px solid var(--line)" }}>
                                <span className="block truncate">{f.name}</span>
                                <span className="font-data flex gap-2.5 mt-0.5" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                                  <span style={{ color: MACRO_COLORS.kcal.base }}>{f.kcal} kcal</span>
                                  <span style={{ color: MACRO_COLORS.p.base }}>P{f.p}</span>
                                  <span style={{ color: MACRO_COLORS.c.base }}>C{f.c}</span>
                                  <span style={{ color: MACRO_COLORS.f.base }}>G{f.f}</span>
                                  <span style={{ color: "var(--ink-tertiary)", fontWeight: 400 }}>/100g</span>
                                </span>
                              </button>
                            ))}

                            {filtered.length === 0 && !offSearching && offResults.length === 0 && (
                              <div className="px-4 py-3">
                                <p className="meta text-sm mb-2">Nessun risultato per "{query}".</p>
                                <button onMouseDown={() => setManualAddOpen(true)}
                                  className="text-sm rounded-full px-3.5 py-2"
                                  style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
                                  ➕ Aggiungi "{query}" al catalogo
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Form "nuovo alimento": indipendente da dropOpen (mai più
                          nascosto da un blur mentre ci si sta scrivendo dentro). */}
                      {manualAddOpen && !selected && (
                        <div className="rounded-2xl p-4 mb-2.5"
                          style={{ backgroundColor: `${accent}0D`, border: `1.5px solid ${accent}40` }}>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}22` }}>
                                <Plus size={14} style={{ color: accent }} />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>Nuovo alimento — "{query}"</p>
                                <p className="meta" style={{ fontSize: "0.65rem" }}>valori per 100 g a crudo</p>
                              </div>
                            </div>
                            <button onClick={() => setManualAddOpen(false)} aria-label="Annulla"
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--surface)" }}>
                              <X size={13} style={{ color: "var(--ink-2)" }} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[["kcal", "Kcal"], ["p", "Proteine g"], ["c", "Carbo g"], ["f", "Grassi g"]].map(([k, lab]) => (
                              <label key={k} className="block">
                                <span className="label block mb-1" style={{ fontSize: "0.62rem" }}>{lab}</span>
                                <input type="number" min="0" value={manualMacros[k]}
                                  onChange={(e) => setManualMacros((m) => ({ ...m, [k]: e.target.value }))}
                                  placeholder="0" className="input w-full px-3 py-2.5 text-sm font-data" aria-label={lab} />
                              </label>
                            ))}
                          </div>
                          <button onClick={saveManualFood}
                            className="w-full rounded-full px-4 py-3 text-sm btn-3d transition-transform active:scale-[0.98]"
                            style={{ backgroundImage: `linear-gradient(120deg, ${accent}, ${accent}CC)`, color: "#FFFFFF", fontWeight: 700, boxShadow: `0 6px 16px ${accent}40` }}>
                            Salva nel catalogo e usa
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2 mb-3">
                        <input type="number" min="1" inputMode="numeric" value={grams}
                          onChange={(e) => setGrams(e.target.value)} placeholder="Grammi (a crudo)"
                          className="input flex-1 min-w-0 px-4 py-3 font-data text-sm"
                          aria-label="Grammi a crudo" />
                        <button onClick={() => { setScannerSlot(slot.id); onOpenScanner && onOpenScanner(slot.id); }} aria-label="Codice a barre" disabled={scanLookupBusy}
                          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform active:scale-95"
                          style={{ backgroundColor: "#111111" }}>
                          {scanLookupBusy ? <Loader2 size={19} className="animate-spin" style={{ color: accent }} /> : <Barcode size={19} style={{ color: accent }} />}
                        </button>
                        {/* Inserimento manuale al posto della vecchia stima AI da foto:
                            sempre raggiungibile (non solo quando la ricerca non trova
                            nulla), apre subito il form nome + valori/100g qui sotto. */}
                        <button onClick={() => { setManualAddOpen(true); setDropOpen(false); }} aria-label="Aggiungi alimento manualmente"
                          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform active:scale-95"
                          style={{ backgroundColor: "#111111" }}>
                          <Plus size={19} style={{ color: accent }} />
                        </button>
                      </div>

                      {scanError && (
                        <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(240,160,32,0.12)", color: "#B45309" }}>{scanError}</p>
                      )}
                      {scannerSlot === slot.id && (
                        <BarcodeScannerModal accent={accent} onClose={() => setScannerSlot(null)} onDetected={handleBarcodeDetected} />
                      )}

                      {selected && (
                        <div className="mb-4">
                          <p className="label mb-2">
                            {selected.name} · per 100 g a crudo:{" "}
                            <span className="font-data" style={{ color: "var(--ink)" }}>
                              {selected.kcal} kcal · P{selected.p} · C{selected.c} · G{selected.f}
                            </span>
                          </p>
                          <MacroRow values={preview || { kcal: 0, p: 0, c: 0, f: 0 }} />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => { if (preview) { haptic("confirm"); onAddFood(slot.id, preview); reset(); setOpenSlot(null); } }}
                          disabled={!preview}
                          className="flex-1 rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
                          style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
                          Aggiungi a {slot.label}
                        </button>
                        <button onClick={() => { setOpenSlot(null); reset(); }}
                          className="px-4 py-3 rounded-full text-sm"
                          style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                          Chiudi
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        {/* Micronutrienti, upsell e check-in digestivo riguardano "oggi" (il
            check-in in particolare è un dato biologico del momento, non del
            giorno che si sta correggendo) — nascosti mentre si modifica un
            giorno passato dalla striscia calendario. */}
        {!pastDayMode && (
          <>
            <MicronutrientGrid mealsBySlot={mealsBySlot} userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} accent={accent} waterMl={waterMl} microAddon={microAddon} />

            {/* Non "!fullAccess" (che ora significa solo "non è Full Coaching"):
                Scheda Personalizzata e Solo Allenamento Coaching hanno già un
                coach vero, non ha senso proporgli di trovarne uno. Il nudge ha
                senso solo per chi non ne ha nessuno. */}
            {(userPlan === "free" || userPlan === "performance_pack") && (
              <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
                text="Registrare cosa mangi è il primo passo. Il secondo è sapere se sta davvero funzionando: fatti aiutare da un professionista del settore che legge il tuo diario e aggiusta il piano per te." />
            )}

            {/* ultima cosa del Diario Libero: check-in digestivo, facoltativo */}
            <div className="card mt-4">
              <p className="label mb-1">Ultima cosa</p>
              <EmojiRating label="Digestione / Gonfiore" icon="🤢" emojis={DIGEST_EMOJIS}
                value={digestValue} onChange={onDigestChange} />
            </div>
          </>
        )}
        </div>
      )}

      {/* "I Miei Target" non è più un tab qui: vive in cima alla schermata
          Alimentazione (screen === "nutrition"), sempre visibile. */}

      {/* ---------------- DIETA TIPO (solo Full Coaching, il tab
          stesso è nascosto agli altri piani — vedi visibleTabs sopra) ---------------- */}
      {tab === "plan" && fullAccess && (
        <div className="spring-in">
          <div className="card">
            <p className="label mb-1">Dieta scritta dal coach</p>
            <p className="h1 mb-1">La tua dieta tipo</p>
            <p className="body mb-4">
              Costruita sui macro di oggi ({target.kcal} kcal · P{target.p} / C{target.c} / G{target.f}).
              Le grammature sono già scalate: è la traccia, il Diario Libero resta il posto dove registri
              ciò che mangi davvero.
            </p>
            <button onClick={onShoppingList}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-4"
              style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <ShoppingCart size={15} style={{ color: "#FFFFFF" }} />
              Genera la lista della spesa
            </button>
            <div className="space-y-3">
              {mealGuide.map((slot, i) => (
                <div key={MEAL_SLOTS[i].id} className="inner px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm flex items-center gap-2" style={{ color: "var(--ink)", fontWeight: 500 }}>
                      <span aria-hidden="true">{MEAL_SLOTS[i].icon}</span>{MEAL_SLOTS[i].label}
                    </p>
                    <span className="meta font-data text-xs shrink-0">
                      {slot.tot.kcal} kcal · P{slot.tot.p} / C{slot.tot.c} / G{slot.tot.f}
                    </span>
                  </div>
                  {slot.items.map((it) => (
                    <p key={it.name} className="font-data text-xs flex justify-between py-0.5">
                      <span style={{ color: "var(--ink)" }}>{it.name}</span>
                      <span style={{ color: accentText, fontWeight: 600 }}>{it.grams} g</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SOSTITUZIONI (Premium/Scheda Personalizzata e
          superiori, tab nascosto sotto — vedi visibleTabs sopra) ---------------- */}
      {tab === "subs" && subsAccess && (
        <div className="spring-in">
          <SubsPanel substitutions={substitutions} foods={foods} accent={accent} accentSoft={accentSoft}
                     accentText={accentText} />
        </div>
      )}

      {tab === "wiki" && (
        <div className="spring-in">
          {userPlan !== "free" ? (
            <WikiBrowser title="Wiki Alimentazione" subtitle="Cosa sappiamo davvero" data={NUTRITION_WIKI} accent={accent}
              intro="Proteine, deficit/surplus calorico e micronutrienti contano per chiunque, non solo per chi si allena: energia quotidiana, funzione immunitaria, lucidità mentale, salute ossea e longevità dipendono dalla stessa base nutrizionale. In un percorso in sala pesi questi principi vengono applicati con più precisione — si pesano gli alimenti, si calcola un target di macro, si programmano fasi di surplus o deficit — perché servono risultati misurabili in tempi definiti: pro, un controllo molto più fine su composizione corporea e performance; contro, richiede tracking costante e, se vissuto in modo ossessivo, può peggiorare il rapporto con il cibo invece di migliorarlo — per la sola salute generale bastano abitudini molto più semplici."
              searchPlaceholder="Cerca un argomento (es. proteine, deficit, digiuno...)" />
          ) : (
            <LockedPanel onUpgrade={onUpgrade} accent={accent}
              text="La Wiki Alimentazione è disponibile dagli abbonamenti a pagamento, a partire da 5€/mese: capisci il perché dietro ogni scelta del tuo piano." />
          )}
        </div>
      )}
    </>
  );
}

function UpsellFooter({ accent, accentSoft, accentText, onUpgrade, text }) {
  const body = text || (
    "Non sai bene come, quando e perché fare le cose? Fatti aiutare da un professionista del settore: " +
    "con il Full Coaching il piano è costruito su misura sui tuoi dati, passo dopo passo."
  );
  return (
    <div className="rounded-2xl px-5 py-4 mt-4" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
      <p className="font-data mb-2 flex items-center gap-1.5" style={{ fontSize: "0.58rem", letterSpacing: "0.12em",
              textTransform: "uppercase", color: accent, fontWeight: 700 }}>
        <Sparkles size={12} style={{ color: accent }} />
        Supervisionato da un professionista del settore
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm leading-relaxed min-w-0" style={{ color: "var(--ink)", fontWeight: 500, flex: "1 1 220px" }}>
          {body}
        </p>
        <button onClick={onUpgrade} className="rounded-full px-5 py-2.5 text-sm shrink-0 transition-transform active:scale-95 btn-3d"
                style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
          Scopri il Full Coaching →
        </button>
      </div>
    </div>
  );
}

function LockedPanel({ text, onUpgrade, accent }) {
  return (
    <div className="card text-center py-10">
      <p className="h2 mb-2">Il tuo abbonamento non lo prevede</p>
      <p className="body max-w-xs mx-auto mb-5">{text}</p>
      <button onClick={onUpgrade} className="rounded-full px-5 py-3 text-sm"
              style={{ backgroundColor: accent, color: "#111111", fontWeight: 600 }}>
        Vedi i piani
      </button>
    </div>
  );
}

/* Sostituzioni: calcolo deterministico sul catalogo REALE (base + alimenti
   condivisi dagli utenti), non più un testo libero interpretato da un'IA.
   BUG PRESO: la versione precedente pareggiava UN SOLO macro dominante
   (proteine O carbo O grassi) su una manciata di alimenti hardcoded — "100g
   fiocchi di avena" tornava con carbo giusti ma proteine/grassi a caso.
   Ora: si sceglie l'alimento vero dal catalogo + i grammi, si calcolano le
   sue kcal/macro esatti, e si cercano nello stesso catalogo gli alimenti che,
   a parità di kcal, si avvicinano di più su TUTTI e tre i macro insieme —
   l'unica cosa che cambia è la fonte e la quantità, non il totale nutrizionale. */
function computeFoodAt(food, grams) {
  const scale = grams / 100;
  return {
    kcal: food.kcal * scale, p: food.p * scale, c: food.c * scale, f: food.f * scale,
  };
}

function findSubstitutes(sourceFood, grams, foods, count = 4) {
  const target = computeFoodAt(sourceFood, grams);
  if (!target.kcal) return [];
  return foods
    .filter((f) => f.name !== sourceFood.name && f.kcal > 0)
    .map((alt) => {
      // Stessa quantità di calorie del piatto originale: è il vincolo che
      // definisce una "sostituzione" (non ha senso pareggiare i macro se poi
      // cambiano le calorie totali del pasto).
      const altGrams = Math.max(1, Math.round((target.kcal / alt.kcal) * 100));
      const at = computeFoodAt(alt, altGrams);
      const pctErr = (val, ref) => (ref > 0 ? Math.abs(val - ref) / ref : val > 0 ? 1 : 0);
      const errP = pctErr(at.p, target.p), errC = pctErr(at.c, target.c), errF = pctErr(at.f, target.f);
      const avgErrPct = Math.round(((errP + errC + errF) / 3) * 100);
      return { alt, altGrams, at, avgErrPct };
    })
    .sort((a, b) => a.avgErrPct - b.avgErrPct)
    .slice(0, count);
}

function SubsPanel({ substitutions, foods, accent, accentSoft, accentText }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(null);
  const [grams, setGrams] = useState("100");
  const [dropOpen, setDropOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods.slice(0, 8);
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, foods]);

  const gramsNum = Number(grams) || 0;
  const target = source && gramsNum > 0 ? computeFoodAt(source, gramsNum) : null;
  const results = source && gramsNum > 0 ? findSubstitutes(source, gramsNum, foods) : [];

  return (
    <div className="spring-in">
      <div className="card mb-5">
        <p className="label mb-1">Calcolo esatto sul catalogo reale</p>
        <p className="h1 mb-1">Trova un alimento equivalente</p>
        <p className="body mb-4">
          Scegli l'alimento e la quantità: cerco nel catalogo le fonti che, alla stessa quantità di
          calorie, hanno lo scarto più basso su proteine, carboidrati e grassi insieme.
        </p>

        <div className="relative mb-2.5">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--ink-2)" }} />
          <input type="text" value={query}
            onChange={(e) => { setQuery(e.target.value); setSource(null); setDropOpen(true); }}
            onFocus={() => setDropOpen(true)}
            onBlur={() => setTimeout(() => setDropOpen(false), 180)}
            placeholder="Cerca l'alimento di partenza…"
            className="input search-strong w-full pl-10 pr-9 py-3"
            aria-label="Alimento di partenza" />
          {source && (
            <button onMouseDown={() => { setSource(null); setQuery(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: "var(--ink-2)" }} aria-label="Svuota">
              <X size={14} />
            </button>
          )}
          {dropOpen && !source && (
            <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl overflow-hidden"
                 style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)",
                          boxShadow: "0 16px 40px rgba(0,0,0,0.16)", maxHeight: 260, overflowY: "auto" }}>
              {filtered.map((f) => (
                <button key={f.name}
                  onMouseDown={() => { setSource(f); setQuery(f.name); setDropOpen(false); }}
                  className="search-strong w-full text-left px-4 py-2.5"
                  style={{ borderBottom: "1px solid var(--line)" }}>
                  <span className="block truncate">{f.name}</span>
                  <span className="font-data flex gap-2.5 mt-0.5" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                    <span style={{ color: MACRO_COLORS.kcal.base }}>{f.kcal} kcal</span>
                    <span style={{ color: MACRO_COLORS.p.base }}>P{f.p}</span>
                    <span style={{ color: MACRO_COLORS.c.base }}>C{f.c}</span>
                    <span style={{ color: MACRO_COLORS.f.base }}>G{f.f}</span>
                    <span style={{ color: "var(--ink-tertiary)", fontWeight: 400 }}>/100g</span>
                  </span>
                </button>
              ))}
              {filtered.length === 0 && <p className="meta text-sm px-4 py-3">Nessun risultato per "{query}".</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input type="number" min="1" inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value)}
            placeholder="Grammi" className="input flex-1 px-4 py-3 font-data text-sm" aria-label="Grammi dell'alimento di partenza" />
          <span className="meta shrink-0">grammi a crudo</span>
        </div>

        {target && (
          <div className="inner px-4 py-3 mb-4">
            <p className="label mb-1.5">{source.name} · {gramsNum} g</p>
            <div className="flex gap-3">
              <span className="font-data text-xs" style={{ color: MACRO_COLORS.kcal.base, fontWeight: 700 }}>{Math.round(target.kcal)} kcal</span>
              <span className="font-data text-xs" style={{ color: MACRO_COLORS.p.base, fontWeight: 700 }}>P {Math.round(target.p)}</span>
              <span className="font-data text-xs" style={{ color: MACRO_COLORS.c.base, fontWeight: 700 }}>C {Math.round(target.c)}</span>
              <span className="font-data text-xs" style={{ color: MACRO_COLORS.f.base, fontWeight: 700 }}>G {Math.round(target.f)}</span>
            </div>
          </div>
        )}

        {source && results.length === 0 && (
          <p className="body">Nessuna alternativa sensata nel catalogo per questo alimento — prova con una quantità diversa.</p>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.alt.name} className="inner px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 500 }}>{r.alt.name}</span>
                  <span className="font-data text-xs shrink-0" style={{ color: accentText, fontWeight: 700 }}>{r.altGrams} g</span>
                </div>
                <div className="flex gap-3 mt-1.5">
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.kcal.base, fontWeight: 700 }}>{Math.round(r.at.kcal)} kcal</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.p.base, fontWeight: 700 }}>P {Math.round(r.at.p)}</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.c.base, fontWeight: 700 }}>C {Math.round(r.at.c)}</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.f.base, fontWeight: 700 }}>G {Math.round(r.at.f)}</span>
                </div>
                <p className="meta mt-1.5 leading-relaxed text-xs">
                  {r.avgErrPct <= 5 ? "Macro praticamente identici" : `~${r.avgErrPct}% di scarto medio sui macro`} a parità di calorie.
                </p>
              </div>
            ))}
            <p className="meta mt-2 leading-relaxed" style={{ fontSize: "0.68rem" }}>
              Le alternative pareggiano calorie e macro, non i micronutrienti: se un alimento è nel piano per
              un motivo specifico (ferro, omega-3, fibre), il coach te lo segnala.
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <p className="label mb-1">Metodo del coach</p>
        <p className="h1 mb-4">Tabella sostituzioni</p>
        <div className="space-y-3">
          {substitutions.map((row) => (
            <div key={row.group} className="inner px-4 py-3.5">
              <p className="label mb-1.5" style={{ color: accentText }}>{row.group}</p>
              <p className="text-sm mb-2" style={{ color: "var(--ink)", fontWeight: 500 }}>{row.base} =</p>
              <div className="flex flex-wrap gap-1.5">
                {row.eq.map((e) => (
                  <span key={e} className="font-data text-xs px-2.5 py-1.5 rounded-full"
                        style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   I Miei Target: FREE → macro editabili a mano + calcolatore teorico (formule,
   con %BF opzionale → Katch-McArdle per una stima più accurata);
   PRO → sola lettura, i macro li fissa il coach.
   ------------------------------------------------------------------------- */

const ACTIVITY_FACTORS = [
  { id: "sed",  label: "Sedentario",              factor: 1.2 },
  { id: "lig",  label: "Leggero (1-3 all./sett.)", factor: 1.375 },
  { id: "mod",  label: "Moderato (3-5 all./sett.)", factor: 1.55 },
  { id: "alt",  label: "Alto (6-7 all./sett.)",     factor: 1.725 },
  { id: "molt", label: "Molto alto (fisico + sport)", factor: 1.9 },
];

const GOALS = [
  { id: "def",  label: "Deficit (dimagrimento)", mult: 0.8,  pPerKg: 2.2, fPerKg: 0.8, pPerKgLBM: 2.6, fPerKgLBM: 1.0 },
  { id: "mant", label: "Mantenimento",            mult: 1.0,  pPerKg: 1.8, fPerKg: 0.9, pPerKgLBM: 2.2, fPerKgLBM: 1.1 },
  { id: "sur",  label: "Surplus (massa)",         mult: 1.12, pPerKg: 1.8, fPerKg: 1.0, pPerKgLBM: 2.0, fPerKgLBM: 1.2 },
];

/* Fasce indicative di massa grassa (stima generica) quando la persona non
   conosce la propria % esatta: permette comunque di usare Katch-McArdle. */
const BF_CATEGORIES = {
  M: [
    { id: "molto_magro", label: "Molto magro", bf: 8 },
    { id: "magro",       label: "Magro",        bf: 13 },
    { id: "normo",       label: "Normopeso",    bf: 19 },
    { id: "sovrappeso",  label: "Sovrappeso",   bf: 27 },
    { id: "obeso",       label: "Obeso",        bf: 35 },
  ],
  F: [
    { id: "molto_magro", label: "Molto magra",  bf: 16 },
    { id: "magro",       label: "Magra",        bf: 21 },
    { id: "normo",       label: "Normopeso",    bf: 27 },
    { id: "sovrappeso",  label: "Sovrappeso",   bf: 34 },
    { id: "obeso",       label: "Obesa",        bf: 42 },
  ],
};

function computeTheoreticalTarget({ sex, age, weight, height, activityId, goalId, bfValue, bfCategoryId }) {
  const w = Number(weight), h = Number(height), a = Number(age);
  if (!w || !h || !a) return null;

  const explicitBf = Number(bfValue);
  const categoryBf = bfCategoryId ? BF_CATEGORIES[sex === "F" ? "F" : "M"].find((c) => c.id === bfCategoryId)?.bf : null;
  const resolvedBf = explicitBf > 0 && explicitBf < 60 ? explicitBf : (categoryBf || null);

  const act = ACTIVITY_FACTORS.find((x) => x.id === activityId) || ACTIVITY_FACTORS[1];
  const goal = GOALS.find((x) => x.id === goalId) || GOALS[1];

  let bmr, formula, lbm = null;
  if (resolvedBf) {
    lbm = w * (1 - resolvedBf / 100);
    bmr = 370 + 21.6 * lbm;
    formula = "Katch-McArdle (da % massa grassa)";
  } else {
    bmr = sex === "F" ? (10 * w + 6.25 * h - 5 * a - 161) : (10 * w + 6.25 * h - 5 * a + 5);
    formula = "Mifflin-St Jeor (stima di base)";
  }

  const tdee = bmr * act.factor;
  const kcal = Math.round(tdee * goal.mult);
  const p = Math.round((lbm ?? w) * (lbm ? goal.pPerKgLBM : goal.pPerKg));
  const f = Math.round((lbm ?? w) * (lbm ? goal.fPerKgLBM : goal.fPerKg));
  const kcalLeft = Math.max(0, kcal - p * 4 - f * 9);
  const c = Math.round(kcalLeft / 4);

  return { kcal, p, c, f, bmr: Math.round(bmr), tdee: Math.round(tdee), formula, bf: resolvedBf, lbm: lbm ? Math.round(lbm * 10) / 10 : null };
}

/* Ciclizzazione ON/OFF: dalla stessa scheda antropometrica calcola due target
   diversi con lo switch biologico reale — Giorno ON: TDEE pieno con l'attività
   scelta, carboidrati alti per le scorte di glicogeno e grassi controllati.
   Giorno OFF: TDEE calcolato a riposo (attività "sedentario"), carboidrati
   tagliati nettamente e grassi alzati per supportare la produzione ormonale,
   il recupero e la sensibilità insulinica. La proteina resta costante nei
   due giorni. */
function computeCyclingTargets(calcInputs) {
  const onResult = computeTheoreticalTarget(calcInputs);
  if (!onResult) return null;

  const offResult = computeTheoreticalTarget({ ...calcInputs, activityId: "sed" });
  const w = Number(calcInputs.weight) || 70;
  const base = onResult.lbm ?? w; // massa magra se nota, altrimenti peso totale

  const goal = GOALS.find((g) => g.id === calcInputs.goalId) || GOALS[1];
  const fOffPerKg = onResult.lbm ? goal.fPerKgLBM * 1.25 : goal.fPerKg * 1.25; // grassi alzati nel giorno OFF

  const kcalOff = offResult.kcal;
  const pOff = onResult.p; // proteina costante
  const fOff = Math.round(base * fOffPerKg);
  const kcalLeftOff = Math.max(0, kcalOff - pOff * 4 - fOff * 9);
  const cOff = Math.round(kcalLeftOff / 4); // carbo tagliati di conseguenza

  return {
    on: { kcal: onResult.kcal, p: onResult.p, c: onResult.c, f: onResult.f },
    off: { kcal: kcalOff, p: pOff, c: cOff, f: fOff },
    formula: onResult.formula,
    bmr: onResult.bmr,
  };
}

function NutritionTargetsPanel({ accent, accentSoft, accentText, targetOn, targetOff, onSetTargetOn, onSetTargetOff,
  isTrainingDay, onToggleTrainingDay, waterTarget, onSetWaterTarget, isPro, onUpgrade }) {
  const target = isTrainingDay ? targetOn : targetOff; // il target "di oggi" si sceglie da solo
  const [mode, setMode] = useState("manual"); // manual | calc
  const [dayType, setDayType] = useState("on"); // on | off — quale dei due si sta modificando
  const [draftOn, setDraftOn] = useState({ p: targetOn.p, c: targetOn.c, f: targetOn.f });
  const [draftOff, setDraftOff] = useState({ p: targetOff.p, c: targetOff.c, f: targetOff.f });
  const [calc, setCalc] = useState({ sex: "M", age: "30", weight: "80", height: "178", activityId: "mod", goalId: "mant",
    bfValue: "", bfCategoryId: "" });
  const [waterDraft, setWaterDraft] = useState(waterTarget);

  const cycling = useMemo(() => computeCyclingTargets(calc), [calc]);
  const bfOptions = BF_CATEGORIES[calc.sex === "F" ? "F" : "M"];
  const recommendedWater = Math.round(((Number(calc.weight) || 70) * 35) / 50) * 50;

  const draft = dayType === "on" ? draftOn : draftOff;
  const setDraft = dayType === "on" ? setDraftOn : setDraftOff;
  const onSetTargetForType = dayType === "on" ? onSetTargetOn : onSetTargetOff;

  /* Formula matematica reale: 1g Proteine = 4 kcal, 1g Carbo = 4 kcal,
     1g Grassi = 9 kcal. Le calorie totali NON si inseriscono mai a mano: si
     ricalcolano all'istante, in automatico, ogni volta che cambia un grammo. */
  const computedKcal = Math.round((Number(draft.p) || 0) * 4 + (Number(draft.c) || 0) * 4 + (Number(draft.f) || 0) * 9);

  if (isPro) {
    return (
      <div className="spring-in">
        <div className="card">
          <p className="label mb-1">Impostati dal coach</p>
          <p className="h1 mb-1">I tuoi macro attuali</p>
          <p className="body mb-4">
            Oggi è un giorno {isTrainingDay ? "ON (allenamento)" : "OFF (riposo)"}: con il Full Coaching i target
            per entrambi i tipi di giorno li fisso io in base ai tuoi progressi, non sono modificabili da qui.
            Se vuoi ricalibrarli, parliamone in chat.
          </p>
          <MacroRow values={{ kcal: target.kcal, p: target.p, c: target.c, f: target.f }} />
        </div>
      </div>
    );
  }

  return (
    <div className="spring-in">
      {/* Il pulsante "Simula" esiste SOLO in preview demo (onToggleTrainingDay
          null in isRealMode): il tipo di giornata reale si legge dalla scheda
          assegnata dal coach, non si simula più a mano in produzione. */}
      <div className="card mb-4">
        <p className="label mb-1">Oggi</p>
        <div className="flex items-center justify-between gap-3">
          <p className="h1-gradient" style={{ margin: 0 }}>
            {isTrainingDay ? "🏋️ Giorno ON — Allenamento" : "🧘 Giorno OFF — Riposo"}
          </p>
          {onToggleTrainingDay && (
            <button onClick={onToggleTrainingDay}
                    className="shrink-0 rounded-full px-3.5 py-2 text-xs"
                    style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
              Simula {isTrainingDay ? "OFF" : "ON"}
            </button>
          )}
        </div>
        <p className="body mt-2">
          Il target si aggiorna da solo ogni giorno in base al tipo di giornata: {target.kcal} kcal oggi
          (P{target.p} / C{target.c} / G{target.f}).
        </p>
      </div>

      {/* idratazione: obiettivo modificabile + raccomandazione sui dati inseriti */}
      <div className="card mb-4">
        <p className="label mb-1">Idratazione</p>
        <p className="h1 mb-1">Il tuo obiettivo d'acqua</p>
        <p className="body mb-3">
          Sei libero di impostarlo come preferisci, oppure applicare la stima consigliata in base al tuo peso
          corporeo (~35 ml per kg, un riferimento generico usato spesso in ambito sportivo).
        </p>
        <div className="flex items-center gap-2 mb-2">
          <input type="number" min="500" step="50" value={waterDraft}
            onChange={(e) => setWaterDraft(e.target.value)}
            className="input flex-1 min-w-0 px-4 py-3 font-data" aria-label="Obiettivo acqua in ml" />
          <button onClick={() => onSetWaterTarget && onSetWaterTarget(Number(waterDraft) || waterTarget)}
            className="shrink-0 rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] btn-3d"
            style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
            Salva
          </button>
        </div>
        <button onClick={() => { setWaterDraft(recommendedWater); onSetWaterTarget && onSetWaterTarget(recommendedWater); }}
          className="w-full rounded-full px-4 py-2.5 text-sm transition-transform active:scale-[0.98]"
          style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
          Usa il consigliato: {(recommendedWater / 1000).toFixed(2)} L (dal peso inserito nel calcolatore qui sotto)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-5">
        {[["manual", "Modifica a mano"], ["calc", "Calcola con le formule"]].map(([id, lab]) => {
          const on = mode === id;
          return (
            <button key={id} onClick={() => setMode(id)}
              className="rounded-2xl px-2 py-2.5 transition-all duration-300"
              style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                        : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              <span className="font-data block" style={{ fontSize: "0.58rem", letterSpacing: "0.04em",
                      textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {mode === "manual" ? (
        <div className="card mb-4">
          <p className="label mb-1">Pianifica nel tempo</p>
          <p className="h1 mb-1">Macro per ogni tipo di giornata</p>
          <p className="body mb-4">
            Sei in un piano libero: imposta i macro per i giorni ON (allenamento) e OFF (riposo) separatamente.
            L'app sceglie da sola quello giusto ogni giorno, in base al programma.
          </p>

          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {[["on", "🏋️ Giorno ON"], ["off", "🧘 Giorno OFF"]].map(([id, lab]) => {
              const active = dayType === id;
              const isToday = (id === "on") === isTrainingDay;
              return (
                <button key={id} onClick={() => setDayType(id)}
                  className="rounded-2xl px-2 py-2.5 transition-all duration-300 relative"
                  style={active ? { backgroundColor: accent, color: "#FFFFFF" }
                                : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                  <span className="text-sm" style={{ fontWeight: 700 }}>{lab}</span>
                  {isToday && (
                    <span className="block" style={{ fontSize: "0.55rem", opacity: 0.85, marginTop: 2 }}>oggi</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {[["p", "Proteine (g)"], ["c", "Carboidrati (g)"], ["f", "Grassi (g)"]].map(([f, lab]) => (
              <label key={f} className="block">
                <span className="label block mb-1.5">{lab}</span>
                <input type="number" min="0" value={draft[f]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                  className="input w-full px-4 py-3 font-data" />
              </label>
            ))}
          </div>

          {/* le calorie non si inseriscono mai a mano: si ricalcolano all'istante */}
          <div className="inner px-4 py-3.5 flex items-center justify-between mb-4">
            <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
              Calorie totali <span className="meta">(calcolate: P×4 + C×4 + G×9)</span>
            </span>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: accentText, transition: "color 0.3s ease" }}>
              {computedKcal} kcal
            </span>
          </div>

          <button onClick={() => onSetTargetForType && onSetTargetForType({
              kcal: computedKcal, p: Number(draft.p) || 0, c: Number(draft.c) || 0, f: Number(draft.f) || 0 })}
            className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] btn-3d"
            style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
            Salva il giorno {dayType === "on" ? "ON" : "OFF"}
          </button>
        </div>
      ) : (
        <div className="card mb-4">
          <p className="label mb-1">Stima teorica</p>
          <p className="h1 mb-1">Calcola i tuoi macro con la ciclizzazione ON/OFF</p>
          <p className="body mb-4">
            Inserisci i tuoi dati una sola volta: calcolo automaticamente <b>entrambi</b> i target. Giorno ON:
            TDEE pieno con l'attività scelta, carboidrati alti per le scorte di glicogeno. Giorno OFF: TDEE a
            riposo, carboidrati tagliati e grassi alzati per supportare ormoni, recupero e sensibilità
            insulinica. La proteina resta costante nei due giorni. Se conosci (o stimi) la tua percentuale di
            massa grassa uso Katch-McArdle, più accurata perché basata sulla massa magra; altrimenti Mifflin-St
            Jeor. È una stima teorica di partenza: i numeri vanno aggiustati osservando i risultati reali.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="label block mb-1.5">Sesso</span>
              <select value={calc.sex} onChange={(e) => setCalc((c) => ({ ...c, sex: e.target.value }))}
                      className="input w-full px-4 py-3">
                <option value="M">Uomo</option>
                <option value="F">Donna</option>
              </select>
            </label>
            <label className="block">
              <span className="label block mb-1.5">Età</span>
              <input type="number" min="14" max="90" value={calc.age}
                onChange={(e) => setCalc((c) => ({ ...c, age: e.target.value }))}
                className="input w-full px-4 py-3 font-data" />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Peso (kg)</span>
              <input type="number" min="30" value={calc.weight}
                onChange={(e) => setCalc((c) => ({ ...c, weight: e.target.value }))}
                className="input w-full px-4 py-3 font-data" />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Altezza (cm)</span>
              <input type="number" min="120" value={calc.height}
                onChange={(e) => setCalc((c) => ({ ...c, height: e.target.value }))}
                className="input w-full px-4 py-3 font-data" />
            </label>
          </div>

          <label className="block mb-3">
            <span className="label block mb-1.5">Livello di attività (giorno ON)</span>
            <select value={calc.activityId} onChange={(e) => setCalc((c) => ({ ...c, activityId: e.target.value }))}
                    className="input w-full px-4 py-3 text-sm">
              {ACTIVITY_FACTORS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>

          <label className="block mb-3">
            <span className="label block mb-1.5">Obiettivo</span>
            <select value={calc.goalId} onChange={(e) => setCalc((c) => ({ ...c, goalId: e.target.value }))}
                    className="input w-full px-4 py-3 text-sm">
              {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>

          <div className="inner p-4 mb-4">
            <p className="label mb-2">% Massa grassa (opzionale, per una stima più accurata)</p>
            <input type="number" min="3" max="60" step="0.5" value={calc.bfValue}
              onChange={(e) => setCalc((c) => ({ ...c, bfValue: e.target.value, bfCategoryId: e.target.value ? "" : c.bfCategoryId }))}
              placeholder="es. 18" className="input w-full px-4 py-3 font-data mb-2" />
            <p className="meta mb-2" style={{ fontSize: "0.68rem" }}>
              Non sai la percentuale esatta? Scegli la fascia più vicina:
            </p>
            <select value={calc.bfCategoryId} disabled={!!calc.bfValue}
              onChange={(e) => setCalc((c) => ({ ...c, bfCategoryId: e.target.value }))}
              className="input w-full px-4 py-3 text-sm disabled:opacity-40">
              <option value="">— Non specificato (uso Mifflin-St Jeor) —</option>
              {bfOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          {cycling && (
            <div className="mb-4 space-y-3">
              <p className="meta font-data" style={{ fontSize: "0.65rem" }}>
                Formula: {cycling.formula} · metabolismo basale ≈ {cycling.bmr} kcal
              </p>
              <div>
                <p className="text-sm mb-1.5" style={{ color: "var(--ink)", fontWeight: 700 }}>🏋️ Giorno ON — Allenamento</p>
                <MacroRow values={{ kcal: cycling.on.kcal, p: cycling.on.p, c: cycling.on.c, f: cycling.on.f }} />
              </div>
              <div>
                <p className="text-sm mb-1.5" style={{ color: "var(--ink)", fontWeight: 700 }}>🧘 Giorno OFF — Riposo</p>
                <MacroRow values={{ kcal: cycling.off.kcal, p: cycling.off.p, c: cycling.off.c, f: cycling.off.f }} />
              </div>
            </div>
          )}

          <button onClick={() => {
              if (!cycling) return;
              setDraftOn({ p: cycling.on.p, c: cycling.on.c, f: cycling.on.f });
              setDraftOff({ p: cycling.off.p, c: cycling.off.c, f: cycling.off.f });
              onSetTargetOn && onSetTargetOn(cycling.on);
              onSetTargetOff && onSetTargetOff(cycling.off);
              setMode("manual");
            }}
            disabled={!cycling}
            className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
            style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
            Applica la ciclizzazione ON/OFF automatica
          </button>
        </div>
      )}

      <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Calorie e macro dipendono da tanti fattori che una formula, da sola, non può cogliere del tutto. Fatti aiutare da un professionista del settore che li calibra sui tuoi risultati reali, settimana dopo settimana." />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Integrazione e Timing: FREE → diario libero + wiki; PRO → piano bloccato + XP.
   ------------------------------------------------------------------------- */

// BUG PRESO: la Wiki Integratori viveva SEMPRE in fondo alla pagina, sotto
// tutta la checklist del giorno — poco visibile, ingombrante da scorrere
// per arrivarci. Ora è un bottone in alto, stesso principio dei 3 di
// Allenamento (Pesi/Cardio/Wiki): apre la sua schermata dedicata invece di
// stare in coda a tutto il resto.
function SupplementsPanel({ accent, accentSoft, accentText, isPro, isPaid, isTrainingDay, onUpgrade, onCoachSync, onXpEarned, supabase, userId }) {
  const [suppTab, setSuppTab] = useState("diario");
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 mb-5">
        {[["diario", "Integrazione"], ["wiki", "Wiki Integratori"]].map(([id, lab]) => {
          const on = suppTab === id;
          return (
            <button key={id} onClick={() => setSuppTab(id)}
              className="rounded-2xl px-1.5 py-3 transition-all duration-300"
              style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                        : { backgroundColor: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              <span className="font-data block leading-tight" style={{ fontSize: "0.52rem", letterSpacing: "0.04em",
                      textTransform: "uppercase", fontWeight: on ? 600 : 400 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {suppTab === "diario" ? (
        isPro
          ? <SupplementsPlanLocked accent={accent} accentSoft={accentSoft} accentText={accentText} isTrainingDay={isTrainingDay} onCoachSync={onCoachSync} onXpEarned={onXpEarned} supabase={supabase} userId={userId} />
          : <SupplementsFreeDiary accent={accent} accentSoft={accentSoft} accentText={accentText} isPaid={isPaid} isTrainingDay={isTrainingDay} onUpgrade={onUpgrade} onCoachSync={onCoachSync} onXpEarned={onXpEarned} />
      ) : (
        <div className="spring-in">
          {isPaid ? (
            <SupplementWikiBrowser accent={accent} />
          ) : (
            <LockedPanel onUpgrade={onUpgrade} accent={accent}
              text="La Wiki Integratori è disponibile dagli abbonamenti a pagamento, a partire da 5€/mese: fatti aiutare da un professionista del settore a capire cosa vale davvero la pena assumere." />
          )}
        </div>
      )}
    </>
  );
}

function SupplementsFreeDiary({ accent, accentSoft, accentText, isPaid, isTrainingDay, onUpgrade, onCoachSync, onXpEarned }) {
  const [customMoments, setCustomMoments] = useState([]);
  const [newMomentName, setNewMomentName] = useState("");
  const allMoments = useMemo(() => [...SUPP_MOMENTS, ...customMoments], [customMoments]);
  /* Nei giorni OFF i moduli pre/post-workout si nascondono da soli e gli
     stimolanti si azzerano per favorire il recupero recettoriale. */
  const visibleMoments = useMemo(
    () => allMoments.filter((m) => isTrainingDay !== false || (m.id !== "preWo" && m.id !== "postWo")),
    [allMoments, isTrainingDay]
  );

  const [entries, setEntries] = useState(() => SUPP_MOMENTS.reduce((a, m) => ({ ...a, [m.id]: [] }), {}));
  const [draft, setDraft] = useState(() => SUPP_MOMENTS.reduce((a, m) => ({ ...a, [m.id]: { name: "", qty: "", time: "", dayType: "all" } }), {}));
  const [nowClock, setNowClock] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notifTriggered, setNotifTriggered] = useState({});

  const addCustomMoment = () => {
    const label = newMomentName.trim();
    if (!label) return;
    const id = `custom-${Date.now()}`;
    setCustomMoments((m) => [...m, { id, label, icon: "✨" }]);
    setEntries((s) => ({ ...s, [id]: [] }));
    setDraft((d) => ({ ...d, [id]: { name: "", qty: "", time: "", dayType: "all" } }));
    setNewMomentName("");
  };
  const removeCustomMoment = (id) => {
    setCustomMoments((m) => m.filter((x) => x.id !== id));
    setEntries((s) => { const n = { ...s }; delete n[id]; return n; });
    setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
  };

  /* Orologio locale: controlla ogni 30 secondi se è ora di un promemoria e,
     se il permesso è stato concesso, simula l'invio della notifica al telefono. */
  useEffect(() => {
    const id = setInterval(() => {
      const hhmm = new Date().toTimeString().slice(0, 5);
      setNowClock(hhmm);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Object.entries(entries).forEach(([momentId, list]) => {
      list.forEach((e) => {
        const key = `${momentId}-${e.id}-${nowClock}`;
        if (e.reminderOn && !e.taken && e.time === nowClock && !notifTriggered[key]) {
          setNotifTriggered((n) => ({ ...n, [key]: true }));
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("Promemoria integratore", { body: `${e.name}${e.qty ? ` · ${e.qty}` : ""} — è l'ora` });
            }
          } catch (err) { /* notifiche non disponibili in questo ambiente: nessun problema */ }
        }
      });
    });
  }, [nowClock, entries, notifTriggered]);

  const requestReminderPermission = () => {
    try { if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission(); }
    catch (err) { /* ambiente senza supporto: la promemoria resta comunque visibile in-app */ }
  };

  const addEntry = (momentId) => {
    const d = draft[momentId];
    if (!d.name.trim()) return;
    const entry = { id: Date.now() + Math.random(), name: d.name.trim(), qty: d.qty.trim(), time: d.time,
      dayType: d.dayType || "all", reminderOn: !!d.time, taken: false };
    setEntries((s) => ({ ...s, [momentId]: [...s[momentId], entry] }));
    setDraft((dr) => ({ ...dr, [momentId]: { name: "", qty: "", time: "", dayType: "all" } }));
    if (entry.reminderOn) requestReminderPermission();
  };
  const removeEntry = (momentId, id) =>
    setEntries((s) => ({ ...s, [momentId]: s[momentId].filter((e) => e.id !== id) }));
  const toggleTaken = (momentId, id) => {
    setEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, taken: !e.taken } : e)) }));
    onCoachSync && onCoachSync({ type: "supplement", momentId, id });
  };
  const toggleReminder = (momentId, id) => {
    setEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, reminderOn: !e.reminderOn } : e)) }));
    requestReminderPermission();
  };
  const setEntryTime = (momentId, id, time) =>
    setEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, time } : e)) }));

  /* XP solo se si completa TUTTO il protocollo del giorno: chi ha costruito
     una lista più lunga non guadagna più punti di chi ne ha una più corta.
     Niente più spiegazione permanente in UI — il toast (onXpEarned) scatta
     nel momento esatto in cui si completa tutto, non prima. */
  const allEntries = Object.values(entries).flat();
  const totalEntries = allEntries.length;
  const takenEntries = allEntries.filter((e) => e.taken).length;
  const allDone = totalEntries > 0 && takenEntries === totalEntries;
  const wasAllDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) onXpEarned && onXpEarned("Integrazione completata", 50);
    wasAllDoneRef.current = allDone;
  }, [allDone, onXpEarned]);

  return (
    <div className="spring-in">
      {totalEntries > 0 && (
        <div className="card mb-4">
          <p className="label mb-1">Il tuo protocollo</p>
          <div className="inner px-4 py-3.5 flex items-center justify-between gap-3">
            <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
              {takenEntries} / {totalEntries} completati oggi
            </span>
            {allDone && <CheckCircle2 size={18} style={{ color: accentText }} />}
          </div>
        </div>
      )}

      {/* diario per momenti, come nella dieta: banner con nome, quantità, spunta e orario */}
      <div className="space-y-4 mb-6">
        {visibleMoments.map((m) => {
          const sorted = [...(entries[m.id] || [])]
            .filter((e) => !e.dayType || e.dayType === "all" || e.dayType === (isTrainingDay ? "on" : "off"))
            .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
          const isCustom = m.id.startsWith("custom-");
          return (
          <div key={m.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="h2 flex items-center gap-2.5" style={{ margin: 0 }}>
                <span className="inline-flex items-center justify-center rounded-full"
                      style={{ width: 30, height: 30, backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <span style={{ fontSize: "0.95rem", lineHeight: 1, filter: "saturate(0.65) contrast(0.92)" }} aria-hidden="true">{m.icon}</span>
                </span>
                <span>{m.label}</span>
              </p>
              {isCustom && (
                <button onClick={() => removeCustomMoment(m.id)} aria-label={`Rimuovi il momento ${m.label}`} style={{ color: "var(--ink-2)" }}>
                  <X size={15} />
                </button>
              )}
            </div>

            {sorted.length > 0 && (
              <div className="space-y-2 mb-3">
                {sorted.map((e) => (
                  <div key={e.id} className="inner p-3.5">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleTaken(m.id, e.id)}
                              aria-label={e.taken ? "Segna come non ancora presa" : "Segna come presa"}
                              className="shrink-0 transition-transform active:scale-90">
                        {e.taken
                          ? <CheckCircle2 size={20} style={{ color: accent }} />
                          : <span className="rounded-full block" style={{ width: 18, height: 18, border: "1.5px solid var(--ink-2)" }} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm block truncate" style={{ color: "var(--ink)", fontWeight: 500,
                                textDecoration: e.taken ? "line-through" : "none", opacity: e.taken ? 0.6 : 1 }}>
                          {e.time && <span style={{ color: accentText, fontWeight: 700 }}>{e.time} · </span>}
                          {e.name}{e.qty ? ` · ${e.qty}` : ""}
                          {e.dayType === "on" && <span className="meta" style={{ fontSize: "0.6rem" }}> · solo ON</span>}
                          {e.dayType === "off" && <span className="meta" style={{ fontSize: "0.6rem" }}> · solo OFF</span>}
                        </span>
                      </div>
                      <button onClick={() => removeEntry(m.id, e.id)} aria-label="Rimuovi" className="shrink-0" style={{ color: "var(--ink-2)" }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5 pl-8">
                      <input type="time" value={e.time} onChange={(ev) => setEntryTime(m.id, e.id, ev.target.value)}
                             className="input px-3 py-2 font-data text-xs" style={{ width: 108 }}
                             aria-label={`Orario promemoria per ${e.name}`} />
                      <button onClick={() => toggleReminder(m.id, e.id)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs transition-all duration-300"
                              style={e.reminderOn ? { backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }
                                                   : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
                              aria-pressed={e.reminderOn}>
                        🔔 {e.reminderOn ? "Promemoria attivo" : "Attiva promemoria"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {[["all", "Sempre"], ["on", "🏋️ Solo ON"], ["off", "🧘 Solo OFF"]].map(([id, lab]) => (
                <button key={id} onClick={() => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], dayType: id } }))}
                        className="rounded-xl px-2 py-2 text-xs transition-all duration-300"
                        style={(draft[m.id].dayType || "all") === id
                          ? { backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }
                          : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 500 }}>
                  {lab}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-2">
              <input type="text" value={draft[m.id].name}
                onChange={(ev) => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], name: ev.target.value } }))}
                placeholder="Integratore (es. Creatina)" className="input col-span-6 px-3 py-3 text-sm"
                aria-label={`Nome integratore per ${m.label}`} />
              <input type="text" value={draft[m.id].qty}
                onChange={(ev) => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], qty: ev.target.value } }))}
                placeholder="Quantità" className="input col-span-3 px-3 py-3 text-sm"
                aria-label={`Quantità integratore per ${m.label}`} />
              <input type="time" value={draft[m.id].time}
                onChange={(ev) => setDraft((d) => ({ ...d, [m.id]: { ...d[m.id], time: ev.target.value } }))}
                className="input col-span-2 px-1 py-3 font-data text-xs"
                aria-label={`Orario per ${m.label}`} />
              <button onClick={() => addEntry(m.id)} aria-label="Aggiungi"
                className="col-span-1 rounded-xl flex items-center justify-center transition-transform active:scale-95"
                style={{ backgroundColor: "#111111" }}>
                <Plus size={17} style={{ color: accent }} />
              </button>
            </div>
            <p className="meta mt-1.5" style={{ fontSize: "0.6rem" }}>
              Imposta un orario e attiva il promemoria per ricevere una notifica sul telefono a quell'ora.
            </p>
          </div>
          );
        })}
      </div>

      <div className="card mb-6">
        <p className="label mb-1">Autogestione · disponibile su tutti i piani</p>
        <p className="h1 mb-3">Aggiungi un momento tuo</p>
        <div className="flex gap-2">
          <input type="text" value={newMomentName} onChange={(e) => setNewMomentName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") addCustomMoment(); }}
                 placeholder="es. Prima di dormire, A pranzo…" className="input flex-1 min-w-0 px-4 py-3 text-sm"
                 aria-label="Nome del nuovo momento della giornata" />
          <button onClick={addCustomMoment} aria-label="Crea il momento"
                  className="shrink-0 rounded-xl px-4 flex items-center justify-center"
                  style={{ backgroundColor: "#111111" }}>
            <Plus size={17} style={{ color: accent }} />
          </button>
        </div>
        <p className="meta mt-2" style={{ fontSize: "0.65rem" }}>
          Crea la tua lista di spunta quotidiana anche fuori dai 4 momenti base, e per ogni voce scegli se vale
          Sempre, solo nei giorni ON o solo nei giorni OFF — tutto incluso, su qualsiasi piano.
        </p>
      </div>

      <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Sai quali integratori scegliere, con quali dosi e in che momento assumerli? Fatti aiutare da un professionista del settore che ti scrive un protocollo su misura anche su questo: vedi gli abbonamenti per iniziare." />
    </div>
  );
}

/* Popup scorrevole di approfondimento: si apre al tap su un integratore
   della wiki, con il riassunto pratico (dose/timing/body) già presente in
   cima e l'approfondimento chimico/biologico/fisiologico (deepDive) sotto,
   dentro un'area che scorre — testo lungo, niente layout che esplode la
   pagina. Stesso pattern visivo di CompliancePopup (overlay + foglio). */
function SupplementDetailModal({ supplement, accent, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose, !!supplement);
  if (!supplement) return null;
  const w = supplement;
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="spring-in w-full sm:max-w-md rounded-3xl p-6 flex flex-col"
           style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "85vh" }}
           onClick={(e) => e.stopPropagation()}>
        <div ref={headerRef} className="shrink-0">
          <SwipeHandle />
          <div className="flex items-center justify-between mb-3">
            <p className="h1 flex items-center gap-2">
              <span aria-hidden="true" style={{ filter: "saturate(0.65) contrast(0.92)" }}>{w.icon}</span>{w.name}
            </p>
            <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
          </div>
        </div>
        <div className="overflow-y-auto pr-1" style={{ overflowX: "hidden" }}>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="font-data px-2.5 py-1 rounded-full"
                  style={{ fontSize: "0.6rem", letterSpacing: "0.08em", backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
              DOSE · {w.dose}
            </span>
            <span className="font-data px-2.5 py-1 rounded-full"
                  style={{ fontSize: "0.6rem", letterSpacing: "0.08em", backgroundColor: "var(--surface-2)",
                           border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              TIMING · {w.timing}
            </span>
          </div>
          <p className="body mb-4">{w.body}</p>
          {w.deepDive && (
            <div className="inner p-4">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>Approfondimento chimico-fisiologico</p>
              <p className="body" style={{ fontSize: "0.86rem", lineHeight: 1.6 }}>{w.deepDive}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}

/* ============================================================================
   WIKI ALIMENTAZIONE + WIKI ALLENAMENTO (Premium e superiori)
   Stessa base scientifica su cui poggiano NUTRITION_MASTER_PROMPT/
   TRAINING_MASTER_PROMPT in 09_CoachDashboard.jsx (soglia di leucina,
   volume diretto/sinergico, le 4 leve per lo stallo...), qui spiegata al
   cliente in prima persona invece che al coach come istruzione operativa —
   stesso contenuto, due destinatari diversi. Nessuna fonte inventata: solo
   consenso scientifico consolidato (fisiologia, non un singolo studio
   isolato), come già la Wiki Integratori qui sopra.
   ========================================================================== */
export const NUTRITION_WIKI = [
  {
    id: "proteine", name: "Proteine", icon: "🥩",
    badge1: "1.6-2.2 g/kg/die", badge2: "Distribuite su 3-4 pasti",
    body: "Sono l'unico macronutriente davvero indispensabile per costruire/mantenere massa muscolare: forniscono gli " +
      "amminoacidi essenziali per la sintesi proteica. Per chi si allena con i pesi, 1.6-2.2 g per kg di peso corporeo " +
      "al giorno coprono il fabbisogno nella quasi totalità dei casi, con margini di sicurezza inclusi.",
    deepDive: "La sintesi proteica muscolare si attiva quando un pasto supera la soglia di leucina (~2-3 g, circa " +
      "8.5% della quota proteica di origine animale) che stimola la via mTOR — sotto quella soglia l'effetto anabolico " +
      "è molto più debole anche a parità di proteine totali. Per questo distribuire le proteine su 3-4 pasti principali " +
      "(non concentrarle in uno solo) massimizza il numero di 'finestre' di sintesi attivate nella giornata. Fonti " +
      "animali (carne, pesce, uova, latticini) hanno un profilo amminoacidico completo; fonti vegetali (legumi, soia, " +
      "seitan) richiedono spesso combinazioni per coprire tutti gli essenziali, ma a parità di grammi totali giornalieri " +
      "funzionano ugualmente bene per chi segue un regime vegetariano/vegano ben pianificato.",
  },
  {
    id: "carboidrati", name: "Carboidrati", icon: "🍚",
    badge1: "Il carburante principale", badge2: "Timing utile, non obbligatorio",
    body: "Sono la fonte energetica più rapida per il sistema nervoso e per il lavoro muscolare ad alta intensità " +
      "(ripetizioni, sprint). Tagliarli drasticamente non serve a dimagrire più in fretta: conta il totale calorico, " +
      "ma con pochi carboidrati la qualità degli allenamenti spesso cala.",
    deepDive: "I carboidrati si immagazzinano come glicogeno in muscoli e fegato: il glicogeno muscolare è il " +
      "substrato preferito per sforzi 60-90 secondi ad alta intensità, tipici dell'allenamento con i pesi. Distribuire " +
      "una quota maggiore di carboidrati intorno alla sessione di allenamento (pre e post) non è indispensabile per la " +
      "performance del singolo allenamento se il glicogeno è già ripristinato, ma aiuta il recupero percepito e la " +
      "qualità delle sessioni successive nei giorni ad alto volume. L'indice glicemico conta meno del contesto: un " +
      "carboidrato ad alto IG post-allenamento (quando la sensibilità insulinica muscolare è più alta) è utile proprio " +
      "per la velocità di ripristino del glicogeno.",
  },
  {
    id: "grassi", name: "Grassi", icon: "🥑",
    badge1: "20-30% delle calorie", badge2: "Mai sotto lo 0.5-0.8 g/kg",
    body: "Servono alla sintesi ormonale (testosterone, estrogeni) e all'assorbimento delle vitamine liposolubili " +
      "(A, D, E, K). Scendere troppo in basso per allungare i carboidrati o le proteine può peggiorare il quadro " +
      "ormonale, soprattutto in deficit calorico prolungato.",
    deepDive: "Non tutti i grassi sono equivalenti: gli acidi grassi essenziali omega-3 (EPA/DHA, pesce azzurro) e " +
      "omega-6 non possono essere sintetizzati dal corpo e vanno introdotti con la dieta. Il rapporto omega-6/omega-3 " +
      "nella dieta occidentale moderna è spesso sbilanciato a favore degli omega-6 (oli vegetali raffinati, cibi " +
      "processati) — aumentare il pesce grasso 2-3 volte a settimana riequilibra il rapporto senza integratori. I " +
      "grassi saturi non sono da demonizzare in toto entro range moderati (circa un terzo dei grassi totali), ma un " +
      "eccesso cronico è associato a peggior profilo lipidico in soggetti predisposti.",
  },
  {
    id: "deficit", name: "Deficit calorico", icon: "📉",
    badge1: "15-25% sotto il TDEE", badge2: "Non oltre 0.5-1% peso/settimana",
    body: "È l'unico prerequisito reale per perdere grasso: senza deficit calorico non si dimagrisce, qualunque sia " +
      "la composizione della dieta. Un deficit troppo aggressivo (oltre il 25-30%) accelera la perdita di peso ma " +
      "aumenta il rischio di perdere anche massa muscolare, non solo grasso.",
    deepDive: "Un tasso di perdita di peso dello 0.5-1% del peso corporeo a settimana è generalmente il compromesso " +
      "migliore tra velocità e conservazione della massa magra in presenza di allenamento con i pesi e proteine " +
      "adeguate. In deficit prolungato l'adattamento metabolico (riduzione del dispendio oltre quanto spiegato dalla " +
      "sola perdita di peso, per calo di NEAT e efficienza metabolica) è reale ma limitato: gestibile con refeed " +
      "periodici di carboidrati o diet break a mantenimento ogni 6-10 settimane di deficit continuo, non con tagli " +
      "calorici sempre più drastici.",
  },
  {
    id: "surplus", name: "Surplus calorico", icon: "📈",
    badge1: "5-15% sopra il TDEE", badge2: "'Pulito' vs 'sporco': conta la qualità",
    body: "Serve per massimizzare la crescita muscolare quando l'obiettivo è la massa, ma un surplus eccessivo non " +
      "accelera la sintesi proteica oltre un certo punto — aumenta solo l'accumulo di grasso. Un surplus moderato " +
      "(5-15% sopra il mantenimento) è quasi sempre la scelta più efficiente.",
    deepDive: "La velocità massima di crescita muscolare naturale è biologicamente limitata (circa 0.25-0.5% del " +
      "peso corporeo al mese per un uomo intermedio, meno per una donna o per un atleta già avanzato) — surplus " +
      "calorici molto alti (over 20%) non accelerano questo tetto biologico, spostano solo più energia verso il " +
      "tessuto adiposo. Il termine 'bulk pulito' non riguarda la qualità morale del cibo ma la dimensione del " +
      "surplus: stesso principio del deficit, verificato e corretto ogni 2-3 settimane sul trend di peso reale, non " +
      "su una stima teorica del TDEE che varia da persona a persona.",
  },
  {
    id: "sodio-potassio", name: "Sodio e Potassio", icon: "🧂",
    badge1: "Sodio: max 2.3 g/die", badge2: "Potassio: target 3.5 g/die",
    body: "Regolano l'equilibrio idrico e la trasmissione nervosa/muscolare. Il rischio più comune non è la carenza " +
      "di sodio (onnipresente nei cibi processati) ma l'eccesso, mentre il potassio è spesso sotto il fabbisogno per " +
      "scarso consumo di verdura, frutta e legumi.",
    deepDive: "Sodio e potassio lavorano insieme nella pompa Na+/K+-ATPasi che mantiene il potenziale di membrana " +
      "delle cellule nervose e muscolari — uno squilibrio cronico (troppo sodio, poco potassio) è associato a " +
      "pressione arteriosa più alta nella popolazione sensibile al sale. Per un atleta la strategia più semplice è " +
      "ridurre i cibi confezionati/bustine di condimento (fonte dominante di sodio in eccesso) e aumentare alimenti " +
      "densi in potassio come patate, patate dolci, banana e spinaci, piuttosto che inseguire numeri precisi su " +
      "un'etichetta.",
  },
  {
    id: "ferro", name: "Ferro", icon: "🩸",
    badge1: "8 mg/die uomini", badge2: "18 mg/die donne fertili",
    body: "Componente dell'emoglobina, trasporta ossigeno ai muscoli — una carenza peggiora direttamente la " +
      "performance aerobica e la sensazione di fatica. Il fabbisogno femminile in età fertile è più del doppio di " +
      "quello maschile per le perdite mestruali, un dato spesso sottovalutato nella programmazione alimentare.",
    deepDive: "Il ferro eme (fonti animali: carne rossa, molluschi) ha un assorbimento intestinale 2-3 volte " +
      "superiore al ferro non-eme (fonti vegetali: legumi, spinaci) — chi segue un regime vegetariano/vegano deve " +
      "prestare più attenzione alle fonti e agli abbinamenti. La vitamina C assunta nello stesso pasto aumenta " +
      "l'assorbimento del ferro non-eme, mentre tè, caffè e calcio nello stesso pasto lo riducono se assunti in " +
      "grandi quantità. Un'atleta donna con affaticamento cronico e performance in calo merita sempre un controllo " +
      "della ferritina, non solo dell'emoglobina.",
  },
  {
    id: "calcio-vitd", name: "Calcio e Vitamina D", icon: "🦴",
    badge1: "Calcio: 1000 mg/die", badge2: "Vitamina D: spesso da integrare",
    body: "Calcio e vitamina D lavorano insieme per la salute ossea, cruciale per chi si allena con i pesi ad alta " +
      "intensità. La vitamina D si sintetizza soprattutto con l'esposizione solare: chi vive a latitudini nordiche o " +
      "si allena prevalentemente al chiuso rischia carenza tutto l'anno, non solo d'inverno.",
    deepDive: "La vitamina D regola l'assorbimento intestinale del calcio: senza livelli adeguati di vitamina D, " +
      "anche un apporto di calcio corretto viene assorbito male. La sintesi cutanea richiede esposizione diretta di " +
      "pelle non protetta, difficile da ottenere in modo affidabile in gran parte dell'anno alle nostre latitudini — " +
      "è uno dei pochi casi in cui l'integrazione (spesso 1000-2000 UI/die) è raccomandata anche a chi ha " +
      "un'alimentazione già equilibrata, previa verifica dei livelli ematici (25-OH vitamina D) col proprio medico.",
  },
  {
    id: "magnesio", name: "Magnesio", icon: "💊",
    badge1: "310-400 mg/die", badge2: "Sonno, crampi, recupero",
    body: "Coinvolto in oltre 300 reazioni enzimatiche, incluse quelle del metabolismo energetico e del rilassamento " +
      "muscolare. Una carenza lieve è comune in chi si allena molto (perdite con il sudore) e può manifestarsi come " +
      "sonno peggiore, crampi o affaticamento senza una causa apparente.",
    deepDive: "Il magnesio compete/coopera col calcio nella contrazione-rilassamento muscolare: il calcio innesca la " +
      "contrazione, il magnesio favorisce il rilassamento — una carenza relativa può quindi manifestarsi con crampi " +
      "o tensione muscolare persistente. Ha anche un ruolo nella regolazione del GABA, il principale neurotrasmettitore " +
      "inibitorio del sistema nervoso centrale, il che spiega perché molti riportano un sonno più profondo " +
      "aumentando l'apporto (mandorle, semi di zucca, spinaci) o integrando la sera, prima di dormire.",
  },
  {
    id: "fibra", name: "Fibra alimentare", icon: "🌾",
    badge1: "25-35 g/die", badge2: "Sazietà + salute del microbiota",
    body: "Rallenta la digestione, aumenta la sazietà a parità di calorie e nutre il microbiota intestinale. Utile " +
      "soprattutto in deficit calorico, quando la fame è la variabile che decide se il piano è sostenibile o no nel " +
      "tempo.",
    deepDive: "La fibra solubile (avena, legumi, mele) forma un gel viscoso che rallenta lo svuotamento gastrico e " +
      "modula l'assorbimento di glucosio e colesterolo; la fibra insolubile (crusca, verdure a foglia) aumenta il " +
      "volume delle feci e la motilità intestinale. Il microbiota fermenta la fibra solubile producendo acidi grassi " +
      "a catena corta (butirrato in primis), che nutrono le cellule del colon e hanno un ruolo nella regolazione " +
      "dell'infiammazione sistemica — un motivo in più per non ridurre verdura e legumi nemmeno nelle diete più " +
      "ipocaloriche.",
  },
  {
    id: "digiuno", name: "Digiuno intermittente", icon: "⏱️",
    badge1: "Strumento, non magia", badge2: "Conta comunque il totale calorico",
    body: "Restringere la finestra dei pasti (es. 16:8) non ha un effetto metabolico speciale sul dimagrimento " +
      "rispetto allo stesso totale calorico distribuito diversamente — funziona per chi lo trova più semplice da " +
      "seguire, non perché 'brucia più grasso'.",
    deepDive: "Gli studi che confrontano digiuno intermittente e pasti distribuiti a parità di calorie e proteine " +
      "totali non trovano differenze significative in perdita di grasso o massa magra: il beneficio, quando c'è, è " +
      "quasi sempre comportamentale (meno decisioni alimentari, meno spuntini impulsivi), non metabolico. Per chi " +
      "si allena ad alta intensità con i pesi, allenarsi a digiuno prolungato può peggiorare la performance nella " +
      "sessione — se la finestra di digiuno copre l'orario di allenamento, vale la pena verificare l'effetto sulla " +
      "propria prestazione prima di adottarlo stabilmente.",
  },
  {
    id: "chetogenica", name: "Dieta chetogenica", icon: "🥓",
    badge1: "<50 g carboidrati/die", badge2: "Per casi specifici, non per tutti",
    body: "Forza il corpo a usare i chetoni (dai grassi) come carburante principale al posto del glucosio. Funziona " +
      "per perdere peso come qualunque dieta ipocalorica sostenibile, ma per un atleta di forza/ipertrofia spesso " +
      "penalizza il volume e l'intensità di allenamento sostenibili.",
    deepDive: "In assenza di carboidrati il fegato produce corpi chetonici dagli acidi grassi, che diventano il " +
      "substrato energetico principale per cervello e muscoli dopo un periodo di adattamento (1-3 settimane, la " +
      "cosiddetta 'keto flu' iniziale). Il glicogeno muscolare resta però il substrato preferito per sforzi brevi e " +
      "intensi tipici dei pesi: la performance nel breve-medio termine tende a calare rispetto a una dieta con " +
      "carboidrati adeguati. Ha applicazioni cliniche specifiche (epilessia farmacoresistente, alcuni contesti " +
      "metabolici) dove l'evidenza è solida; come scelta per la sola composizione corporea in un atleta di forza è " +
      "raramente la strategia più efficiente.",
  },
  {
    id: "mediterranea", name: "Dieta mediterranea", icon: "🫒",
    badge1: "Il modello più studiato", badge2: "Olio EVO, pesce, legumi, verdura",
    body: "È il pattern alimentare con più evidenza a lungo termine per salute cardiovascolare e longevità: alta " +
      "quota di grassi insaturi (olio EVO), pesce, legumi, cereali integrali, verdura e frutta, moderata carne rossa " +
      "e zuccheri raffinati.",
    deepDive: "A differenza delle diete 'da laboratorio' definite per macro, la dieta mediterranea è uno studio di " +
      "popolazioni reali osservate per decenni (studi PREDIMED e successivi), con riduzione documentata di eventi " +
      "cardiovascolari maggiori nei gruppi che la seguivano rispetto a diete di controllo a basso contenuto di " +
      "grassi. Per un atleta è un'ottima base di partenza qualitativa (fonti di grassi e proteine, densità " +
      "nutrizionale) su cui poi calibrare le quantità (kcal, proteine, timing dei carboidrati) in base all'obiettivo " +
      "specifico — non è in conflitto con un piano da bodybuilding/powerlifting, ne è la base.",
  },
  {
    id: "idratazione", name: "Idratazione", icon: "💧",
    badge1: "30-35 ml/kg di peso", badge2: "Di più nei giorni di allenamento",
    body: "Anche una disidratazione lieve (2% del peso corporeo perso in acqua) peggiora misurabilmente forza, " +
      "resistenza e capacità di concentrazione. Il fabbisogno di base è di circa 30-35 ml per kg di peso corporeo, " +
      "più il sudore perso durante l'allenamento.",
    deepDive: "L'acqua è il solvente di quasi tutte le reazioni metaboliche e regola la termoregolazione tramite " +
      "sudorazione: durante l'esercizio ad alta intensità in ambiente caldo si possono perdere anche 1-2 litri di " +
      "sudore in un'ora, con elettroliti (sodio soprattutto) al seguito — per sessioni sotto l'ora, acqua semplice " +
      "basta; oltre l'ora, o con sudorazione abbondante, reintegrare anche il sodio (non solo acqua) previene i " +
      "crampi da deplezione elettrolitica meglio della sola idratazione.",
  },
];

export const TRAINING_WIKI = [
  {
    id: "ipertrofia", name: "Ipertrofia: i 3 meccanismi", icon: "💪",
    badge1: "Tensione meccanica", badge2: "+ stress metabolico + danno",
    body: "La crescita muscolare nasce da tre stimoli che si sommano: tensione meccanica (il carico sollevato), " +
      "stress metabolico (l'accumulo di metaboliti nel muscolo, la 'bruciore') e danno muscolare (i microtraumi da " +
      "riparare). Nessuno dei tre da solo è sufficiente o necessario in assoluto — un piano efficace li combina.",
    deepDive: "La tensione meccanica è considerata il driver dominante: carichi moderati-alti (60-85% del massimale) " +
      "portati vicino al cedimento reclutano le unità motorie a soglia più alta (le fibre a maggior potenziale di " +
      "crescita). Lo stress metabolico (accumulo di lattato, ioni idrogeno, fosfato inorganico) amplifica la risposta " +
      "ormonale locale e il reclutamento di fibre, ma da solo (carichi molto leggeri) produce meno crescita a parità " +
      "di volume totale. Il danno muscolare innesca la risposta infiammatoria e la sintesi proteica riparativa, ma " +
      "un danno eccessivo (DOMS molto forte) può addirittura ritardare il recupero e ridurre il volume allenabile " +
      "nella settimana successiva — l'obiettivo non è 'distruggere' il muscolo ogni sessione.",
  },
  {
    id: "volume", name: "Volume di allenamento", icon: "📊",
    badge1: "10-20 serie dirette/settimana", badge2: "Per gruppo muscolare",
    body: "Il volume (serie totali per gruppo muscolare a settimana) è la variabile con più impatto diretto " +
      "sull'ipertrofia dopo l'intensità di sforzo. La maggior parte dei praticanti cresce meglio tra 10 e 20 serie " +
      "dirette a settimana per gruppo, distribuite su più sessioni.",
    deepDive: "Sotto le ~6-8 serie settimanali per gruppo lo stimolo è spesso insufficiente per crescita ottimale " +
      "in un praticante intermedio/avanzato; oltre le 20-25 serie i rendimenti calano rapidamente e il rischio di " +
      "recupero insufficiente sale, specie se il volume è concentrato in poche sessioni. Le serie 'sinergiche/" +
      "indirette' (es. i tricipiti lavorati durante la panca) contano circa al 50% di una serie diretta nel computo " +
      "totale — un piano ben progettato tiene conto di questa sovrapposizione invece di sommare ogni serie come se " +
      "fosse isolata, altrimenti il volume reale su un gruppo può essere doppio di quanto sembra sulla carta.",
  },
  {
    id: "rir-rpe", name: "RIR e RPE", icon: "🎯",
    badge1: "RIR 1-3 la maggior parte delle serie", badge2: "RIR 0 solo occasionale",
    body: "RIR (Reps In Reserve) e RPE (Rate of Perceived Exertion) misurano quanto sei vicino al cedimento muscolare. " +
      "Allenarsi quasi sempre a RIR 1-3 (a 1-3 ripetizioni dal cedimento) massimizza lo stimolo senza accumulare " +
      "fatica sistemica eccessiva ogni singola serie.",
    deepDive: "Andare sistematicamente a cedimento assoluto (RIR 0) su ogni serie di ogni sessione aumenta la fatica " +
      "neuromuscolare e il tempo di recupero necessario molto più di quanto aumenti lo stimolo ipertrofico rispetto " +
      "a fermarsi a RIR 1-2 — la letteratura mostra rendimenti simili tra RIR 0-1 e RIR 2-3 quando il volume totale " +
      "è equalizzato, ma con recupero peggiore nel primo caso. Il cedimento vero e proprio ha comunque un posto: " +
      "usato con criterio (ultima serie di un esercizio, non su tutte), specie su esercizi monoarticolari a basso " +
      "rischio articolare (leg extension, curl), dove il costo di recupero è più basso che su un multiarticolare " +
      "pesante come lo squat.",
  },
  {
    id: "frequenza", name: "Frequenza di allenamento", icon: "📅",
    badge1: "2× a settimana per gruppo", badge2: "Meglio di 1× a parità di volume",
    body: "Allenare ogni gruppo muscolare almeno 2 volte a settimana (invece di 1 sola seduta molto lunga) distribuisce " +
      "meglio il volume totale e sembra produrre risultati leggermente superiori a parità di serie settimanali " +
      "complessive.",
    deepDive: "La sintesi proteica muscolare resta elevata per circa 24-48 ore dopo una sessione di allenamento " +
      "intenso, poi torna ai livelli basali: allenare lo stesso gruppo una sola volta a settimana lascia diversi " +
      "giorni in cui la sintesi proteica non è stimolata da un nuovo stimolo. Distribuire lo stesso volume totale " +
      "su 2-3 sessioni per gruppo mantiene più costante l'attivazione della sintesi proteica nell'arco della " +
      "settimana. Attenzione però al volume PER sessione: raddoppiare la frequenza senza dimezzare adeguatamente il " +
      "volume per seduta porta solo più fatica, non più crescita.",
  },
  {
    id: "sovraccarico", name: "Sovraccarico progressivo", icon: "📈",
    badge1: "Il principio che guida tutto", badge2: "Carico, serie, reps o tecnica",
    body: "Senza un aumento progressivo dello stimolo nel tempo (carico, serie, ripetizioni o difficoltà tecnica) il " +
      "corpo non ha motivo di continuare ad adattarsi. È il principio più importante di tutti, più della scelta " +
      "specifica di esercizi o di split.",
    deepDive: "Il sovraccarico progressivo non significa solo 'metti più peso ogni settimana' — è insostenibile " +
      "linearmente per più di poche settimane in un praticante intermedio/avanzato. Le leve disponibili sono: più " +
      "peso a parità di reps, più ripetizioni a parità di peso, più serie a parità di carico/reps, meno recupero a " +
      "parità di tutto il resto, o tecnica più pulita/ROM più ampio a parità di carico esterno. Un programma ben " +
      "strutturato alterna queste leve nel tempo (spesso in blocchi/mesocicli) invece di forzare solo l'aumento del " +
      "carico, che porta più rapidamente a stallo o infortunio.",
  },
  {
    id: "recupero-serie", name: "Recupero tra le serie", icon: "⏳",
    badge1: "2-3 min su multiarticolari pesanti", badge2: "60-90 sec su isolamento",
    body: "Il tempo di recupero tra le serie va calibrato sull'obiettivo: più lungo (2-3 minuti) sugli esercizi " +
      "multiarticolari pesanti per mantenere la qualità delle serie successive, più breve (60-90 secondi) su esercizi " +
      "di isolamento a basso costo sistemico.",
    deepDive: "Recuperi troppo brevi (30-60 sec) su esercizi pesanti come squat o stacco non permettono il pieno " +
      "ripristino della fosfocreatina (il sistema energetico dominante nei primi 10-15 secondi di sforzo massimale), " +
      "costringendo a ridurre il carico o le ripetizioni nelle serie successive — meno stimolo di tensione meccanica " +
      "totale nella sessione. Su esercizi di isolamento, dove il rischio tecnico è più basso e lo stimolo target è " +
      "spesso lo stress metabolico più che il carico assoluto, recuperi più brevi non compromettono significativamente " +
      "la qualità e permettono di fare più volume nello stesso tempo di sessione.",
  },
  {
    id: "deload", name: "Deload", icon: "🔋",
    badge1: "Ogni 4-8 settimane", badge2: "Riduci volume e/o intensità per 1 settimana",
    body: "Una settimana programmata a volume o intensità ridotti (non uno stop completo) ogni 4-8 settimane di " +
      "allenamento continuo dissipa la fatica accumulata prima che diventi sovrallenamento, permettendo di tornare " +
      "più forti nella settimana successiva.",
    deepDive: "La fatica si accumula più velocemente della capacità di adattamento reale (il 'fitness') man mano che " +
      "un blocco di allenamento avanza: le prestazioni possono restare stabili o calare leggermente pur essendo il " +
      "corpo effettivamente più forte 'sotto' quella fatica. Un segnale oggettivo utile è il calo dell'HRV rispetto " +
      "alla propria media recente insieme a stress percepito alto: quella combinazione, non la sola sensazione " +
      "soggettiva di stanchezza, è l'indicatore più affidabile che è il momento di scaricare prima di arrivare al " +
      "sovrallenamento conclamato, molto più lento da recuperare di un deload programmato in tempo.",
  },
  {
    id: "tecniche-intensita", name: "Tecniche di intensità", icon: "🔥",
    badge1: "Rest-pause, drop-set, super-set", badge2: "Solo su base solida, non da principianti",
    body: "Rest-pause, drop-set, stripping e super-set aumentano lo stress metabolico e permettono di superare il " +
      "cedimento apparente, ma hanno un costo di recupero alto — vanno usate con criterio, non su ogni esercizio " +
      "di ogni sessione, e mai come primo approccio per chi è alle prime armi.",
    deepDive: "Un principiante cresce già in modo ottimale con il solo sovraccarico progressivo su un volume di base " +
      "moderato: aggiungere tecniche avanzate prima di aver esaurito i margini di crescita 'semplice' brucia margine " +
      "di progressione futura senza un vantaggio reale nel breve termine, aumentando solo la fatica da gestire. Su un " +
      "atleta avanzato, dove il sovraccarico progressivo lineare rallenta, tecniche come il rest-pause (una breve " +
      "pausa di 15-20 secondi dopo il cedimento per strappare altre 2-3 ripetizioni) o il drop-set (ridurre il carico " +
      "del 20-30% e continuare subito dopo il cedimento) diventano strumenti utili per estrarre altro stimolo dallo " +
      "stesso tempo di allenamento, tipicamente 1-2 volte a settimana per gruppo muscolare, non di più.",
  },
  {
    id: "rom", name: "Range di movimento (ROM)", icon: "↕️",
    badge1: "ROM completo, di norma", badge2: "Parziali: solo per obiettivi specifici",
    body: "Allenarsi con l'escursione articolare completa produce generalmente più ipertrofia dei ROM parziali, " +
      "specie nella porzione allungata del movimento (es. lo squat profondo vs. il mezzo squat). I ROM parziali " +
      "hanno un ruolo, ma come aggiunta mirata, non come sostituto.",
    deepDive: "La porzione 'allungata' di un esercizio (es. la parte bassa dello squat, il fondo della panca) sembra " +
      "produrre uno stimolo ipertrofico superiore per unità di tempo rispetto alla porzione 'accorciata', probabilmente " +
      "per il maggiore stress meccanico sul muscolo in allungamento. Questo non significa che i parziali siano inutili: " +
      "sono usati con criterio per lavorare in sicurezza intorno a un fastidio articolare, per sovraccaricare oltre il " +
      "massimale su un tratto specifico (parziali in alto nello stacco per la forza di lockout), o come tecnica " +
      "d'intensità a fine serie quando il ROM completo non è più possibile mantenendo la forma corretta.",
  },
  {
    id: "cardio-interferenza", name: "Cardio e interferenza", icon: "🏃",
    badge1: "2-3 sessioni/settimana", badge2: "Distanziato dai pesi se possibile",
    body: "Il cardio non 'brucia' la massa muscolare se dosato correttamente, ma un eccesso di lavoro aerobico ad " +
      "alta frequenza/intensità può interferire con gli adattamenti di forza/ipertrofia se sommato senza criterio ai " +
      "pesi. 2-3 sessioni moderate a settimana sono generalmente ben tollerate senza compromessi.",
    deepDive: "L'effetto interferenza nasce da una parziale sovrapposizione delle vie di segnalazione cellulare " +
      "attivate dal lavoro aerobico (via AMPK) e dal lavoro di forza (via mTOR) — un'attivazione molto intensa e " +
      "frequente di AMPK può in teoria smorzare il segnale anabolico di mTOR. In pratica, per volumi di cardio " +
      "moderati (2-3 sessioni da 20-30 minuti) l'interferenza è minima o assente nella maggior parte degli studi. Se " +
      "possibile, distanziare cardio e pesi di alcune ore (o farli in giorni diversi) riduce ulteriormente qualunque " +
      "interferenza residua, ed è preferibile a farli sempre in sequenza diretta nella stessa sessione quando " +
      "l'obiettivo primario è la massa muscolare.",
  },
  {
    id: "riscaldamento", name: "Riscaldamento", icon: "🌡️",
    badge1: "5-10 min generale", badge2: "+ serie di avvicinamento specifiche",
    body: "Alza la temperatura muscolare e prepara le articolazioni al carico, riducendo il rischio di infortunio e " +
      "migliorando la performance nelle prime serie pesanti. Le serie di avvicinamento (pesi crescenti verso il " +
      "carico di lavoro) contano più del semplice cardio leggero generico.",
    deepDive: "Un riscaldamento generale (5-10 minuti di attività leggera) aumenta la temperatura dei tessuti e la " +
      "velocità di conduzione nervosa, ma l'elemento più specifico ed efficace prima di un esercizio pesante come " +
      "squat o panca sono le serie di avvicinamento progressive (es. 50%, 70%, 85% del carico di lavoro per poche " +
      "ripetizioni) — preparano il pattern motorio specifico di quell'esercizio, non solo la temperatura corporea " +
      "generica. Lo stretching statico prolungato PRIMA di un esercizio di forza può temporaneamente ridurre la " +
      "produzione di forza: se serve mobilità, meglio mobilità dinamica prima e stretching statico eventualmente a " +
      "fine sessione.",
  },
  {
    id: "mobilita", name: "Mobilità articolare", icon: "🤸",
    badge1: "10-15 min, 3-4×/settimana", badge2: "Prevenzione, non solo performance",
    body: "Una buona mobilità nelle articolazioni coinvolte (caviglie, anche, spalle) permette di raggiungere il ROM " +
      "completo con tecnica corretta, riducendo compensi che nel tempo portano a infortuni da sovraccarico. Non " +
      "serve diventare contorsionisti: basta coprire il range richiesto dai propri esercizi principali.",
    deepDive: "Un deficit di mobilità in un'articolazione spesso si traduce in un compenso in un'altra: caviglie " +
      "rigide durante lo squat costringono a inclinare il busto più in avanti, aumentando lo stress lombare; spalle " +
      "poco mobili nel lento avanti costringono a inarcare eccessivamente la schiena. Lavorare sulla mobilità " +
      "specifica delle articolazioni limitanti per i propri esercizi principali (non un programma generico) è più " +
      "efficiente: 10-15 minuti mirati 3-4 volte a settimana, spesso integrati nel riscaldamento, sono sufficienti " +
      "per la maggior parte dei praticanti non agonisti.",
  },
];

/* Componente generico riusato da Wiki Alimentazione e Wiki Allenamento — la
   Wiki Integratori sopra resta com'era (SUPP_WIKI/SupplementWikiBrowser/
   SupplementDetailModal), non l'ho toccata: stesso pattern visivo, dati e
   didascalie diverse passate come prop invece di duplicare il componente. */
function WikiDetailModal({ entry, accent, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose, !!entry);
  if (!entry) return null;
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="spring-in w-full sm:max-w-md rounded-3xl p-6 flex flex-col"
           style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "85vh" }}
           onClick={(e) => e.stopPropagation()}>
        <div ref={headerRef} className="shrink-0">
          <SwipeHandle />
          <div className="flex items-center justify-between mb-3">
            <p className="h1 flex items-center gap-2">
              <span aria-hidden="true" style={{ filter: "saturate(0.65) contrast(0.92)" }}>{entry.icon}</span>{entry.name}
            </p>
            <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
          </div>
        </div>
        <div className="overflow-y-auto pr-1" style={{ overflowX: "hidden" }}>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="font-data px-2.5 py-1 rounded-full"
                  style={{ fontSize: "0.6rem", letterSpacing: "0.08em", backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
              {entry.badge1}
            </span>
            <span className="font-data px-2.5 py-1 rounded-full"
                  style={{ fontSize: "0.6rem", letterSpacing: "0.08em", backgroundColor: "var(--surface-2)",
                           border: "1px solid var(--line)", color: "var(--ink-2)" }}>
              {entry.badge2}
            </span>
          </div>
          <p className="body mb-4">{entry.body}</p>
          {entry.deepDive && (
            <div className="inner p-4">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>Approfondimento scientifico</p>
              <p className="body" style={{ fontSize: "0.86rem", lineHeight: 1.6 }}>{entry.deepDive}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}

function WikiBrowser({ title, subtitle, intro, data, accent, searchPlaceholder }) {
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const filtered = data.filter((w) => w.name.toLowerCase().includes(query.trim().toLowerCase()));
  const openEntry = data.find((w) => w.id === openId) || null;

  return (
    <div className="card">
      <p className="label mb-1">{title}</p>
      <p className="h1 mb-3">{subtitle}</p>
      {intro && <p className="body mb-4" style={{ lineHeight: 1.6 }}>{intro}</p>}
      <div className="relative mb-3">
        <Search size={15} style={{ color: "var(--ink-2)", position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder={searchPlaceholder} className="input w-full pl-10 pr-4 py-3 text-sm" aria-label={title} />
      </div>
      <div className="flex flex-wrap gap-2 mb-1">
        {filtered.length === 0 && <p className="meta text-sm">Nessun argomento trovato per "{query}".</p>}
        {filtered.map((w) => (
          <button key={w.id} onClick={() => setOpenId(w.id)}
            className="rounded-full px-3.5 py-2 text-sm flex items-center gap-1.5 transition-all duration-300"
            style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
            <span aria-hidden="true" style={{ filter: "saturate(0.7) brightness(1.15)" }}>{w.icon}</span>{w.name}
          </button>
        ))}
      </div>
      <WikiDetailModal entry={openEntry} accent={accent} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* Wiki integratori condivisa: cercabile, usata sia dal profilo FREE che PRO,
   così ci si può informare in entrambi i piani allo stesso modo. Il tap su
   un integratore apre SupplementDetailModal invece di espandersi in linea:
   l'approfondimento è troppo lungo per stare comodo dentro la card. */
function SupplementWikiBrowser({ accent }) {
  const [openWiki, setOpenWiki] = useState(null);
  const [wikiQuery, setWikiQuery] = useState("");
  const filteredWiki = SUPP_WIKI.filter((w) => w.name.toLowerCase().includes(wikiQuery.trim().toLowerCase()));
  const openSupplement = SUPP_WIKI.find((w) => w.id === openWiki) || null;

  return (
    <div className="card">
      <p className="label mb-1">Wiki integratori</p>
      <p className="h1 mb-3">Cosa sappiamo davvero</p>
      <p className="body mb-4" style={{ lineHeight: 1.6 }}>
        Creatina, omega-3, vitamina D, magnesio e buona parte di questa lista hanno un ruolo anche fuori dalla sala
        pesi: salute cognitiva, ossea, cardiovascolare e qualità del sonno, utili a chiunque a prescindere
        dall'allenamento. In un contesto di performance vengono dosati e sincronizzati con l'allenamento per un
        beneficio specifico e misurabile in più — pro, un piccolo margine reale quando la base (allenamento e dieta)
        è già solida; contro, non sostituiscono quella base, e alcuni prodotti di moda in palestra hanno molta meno
        evidenza scientifica di quanto il marketing lasci intendere.
      </p>
      <div className="relative mb-3">
        <Search size={15} style={{ color: "var(--ink-2)", position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
        <input type="text" value={wikiQuery} onChange={(e) => setWikiQuery(e.target.value)}
               placeholder="Cerca un integratore (es. magnesio, creatina...)"
               className="input w-full pl-10 pr-4 py-3 text-sm" aria-label="Cerca nella wiki integratori" />
      </div>
      <div className="flex flex-wrap gap-2 mb-1">
        {filteredWiki.length === 0 && (
          <p className="meta text-sm">Nessun integratore trovato per "{wikiQuery}".</p>
        )}
        {filteredWiki.map((w) => (
          <button key={w.id} onClick={() => setOpenWiki(w.id)}
            className="rounded-full px-3.5 py-2 text-sm flex items-center gap-1.5 transition-all duration-300"
            style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
            <span aria-hidden="true" style={{ filter: "saturate(0.7) brightness(1.15)" }}>{w.icon}</span>{w.name}
          </button>
        ))}
      </div>

      <SupplementDetailModal supplement={openSupplement} accent={accent} onClose={() => setOpenWiki(null)} />
    </div>
  );
}

function SupplementsPlanLocked({ accent, accentSoft, accentText, isTrainingDay, onCoachSync, onXpEarned, supabase, userId }) {
  const [checked, setChecked] = useState({});
  const isRealMode = Boolean(supabase && userId);

  // Protocollo reale (prescribed_supplements), raggruppato per `moment` come
  // l'ha scritto il coach — testo libero, non i 4 SUPP_MOMENTS fissi della
  // demo (il coach può rinominare le sezioni in WeekSuppsEditor). Se
  // supabase/userId non arrivano (preview isolata), resta la lista demo
  // SUPP_PLAN_PRO di sempre; se arrivano ma il coach non ha ancora
  // prescritto nulla, mostra uno stato vuoto esplicito — mai la demo al
  // posto di un dato reale mancante.
  const [prescribed, setPrescribed] = useState(null); // null = non ancora caricato (solo isRealMode)
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    fetchPrescribedSupplements(supabase, userId)
      .then((rows) => { if (!cancelled) setPrescribed(rows); })
      .catch((err) => {
        console.error("PERFORM: errore lettura prescribed_supplements", err);
        if (!cancelled) setPrescribed([]);
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);

  // BUG PRESO: fetchPrescribedSupplements ordina i momenti ALFABETICAMENTE
  // ("mattina" < "postWo" < "preWo" < "sera") — Post-Wo finiva prima di
  // Pre-Wo nell'ordine di fetch, e il raggruppamento per Map preservava
  // quell'ordine sbagliato. L'ordine cronologico vero (mattina→pre
  // workout→post workout→sera) viene sempre da SUPP_MOMENTS; un momento
  // libero scritto dal coach che non combacia va in coda, nell'ordine in
  // cui compare.
  // ON/OFF: stessa logica già usata per l'alimentazione (weekPlan[oggi]
  // reale, non un calendario a parte) — un integratore 'on' compare solo
  // nei giorni di allenamento, 'off' solo nei giorni di riposo, 'all'
  // (default) sempre.
  const realGroups = useMemo(() => {
    if (!prescribed) return [];
    const forToday = prescribed.filter((it) => {
      const dt = it.day_type || "all";
      return dt === "all" || (dt === "on") === !!isTrainingDay;
    });
    const byMoment = new Map();
    forToday.forEach((it) => {
      if (!byMoment.has(it.moment)) byMoment.set(it.moment, []);
      byMoment.get(it.moment).push(it);
    });
    const canonicalOrder = SUPP_MOMENTS.map((m) => m.id);
    const sortedMoments = [...byMoment.keys()].sort((a, b) => {
      const ia = canonicalOrder.indexOf(a), ib = canonicalOrder.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return sortedMoments.map((moment) => ({
      id: moment,
      label: SUPP_MOMENTS.find((m) => m.id === moment)?.label || moment,
      items: byMoment.get(moment),
    }));
  }, [prescribed, isTrainingDay]);

  const groups = isRealMode
    ? realGroups
    : SUPP_MOMENTS.map((m) => ({ id: m.id, label: m.label, icon: m.icon, items: SUPP_PLAN_PRO[m.id].map((it, i) => ({ id: `${m.id}-${i}`, ...it })) }));

  const toggle = (momentId, itemId) => {
    const key = `${momentId}-${itemId}`;
    haptic("tap");
    setChecked((c) => ({ ...c, [key]: !c[key] }));
    onCoachSync && onCoachSync({ type: "supplement", momentId, id: itemId });
  };
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const doneItems = groups.reduce((n, g) => n + g.items.filter((it) => checked[`${g.id}-${it.id}`]).length, 0);
  const allDone = totalItems > 0 && doneItems === totalItems;
  const wasAllDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) onXpEarned && onXpEarned("Integrazione completata", 50);
    wasAllDoneRef.current = allDone;
  }, [allDone, onXpEarned]);

  if (isRealMode && prescribed === null) {
    return <p className="body px-1">Caricamento protocollo…</p>;
  }

  return (
    <div className="spring-in">
      {/* Niente più card "Piano scritto dal coach" con la spiegazione delle
          regole XP — solo i momenti della giornata in ordine, come chiesto:
          la pagina resta il protocollo, non un testo da leggere prima. */}
      {totalItems > 0 && (
        <div className="inner px-4 py-3 flex items-center justify-between gap-3 mb-4">
          <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
            {doneItems} / {totalItems} completate oggi
          </span>
          {allDone && <CheckCircle2 size={18} style={{ color: accentText }} />}
        </div>
      )}

      {totalItems === 0 ? (
        <div className="card text-center py-8">
          <p className="body">Il coach non ha ancora prescritto integratori.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="card">
              <p className="h2 flex items-center gap-2.5 mb-3">
                {g.icon && (
                  <span className="inline-flex items-center justify-center rounded-full"
                        style={{ width: 30, height: 30, backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: "0.95rem", lineHeight: 1, filter: "saturate(0.65) contrast(0.92)" }} aria-hidden="true">{g.icon}</span>
                  </span>
                )}
                <span>{g.label}</span>
              </p>
              <div className="space-y-1.5">
                {g.items.map((it) => {
                  const done = !!checked[`${g.id}-${it.id}`];
                  return (
                    <button key={it.id} onClick={() => toggle(g.id, it.id)}
                      className="inner w-full flex items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]">
                      {done ? <CheckCircle2 size={18} style={{ color: accentText }} className="shrink-0" />
                            : <span className="shrink-0 rounded-full" style={{ width: 17, height: 17, border: "1.5px solid var(--ink-2)" }} />}
                      <span className="min-w-0 flex-1">
                        <span className="text-sm block truncate" style={{ color: "var(--ink)", fontWeight: 500,
                                textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
                          {it.name}{it.dose ? ` · ${it.dose}` : ""}
                        </span>
                        {it.note && <span className="meta block text-xs mt-0.5">{it.note}</span>}
                      </span>
                      <Lock size={12} style={{ color: "var(--ink-2)" }} className="shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   6 · ANTEPRIMA — da eliminare in produzione
   ========================================================================== */

const F = [
  { name: "Riso Basmati", kcal: 350, p: 8, c: 78, f: 1, na: 5, k: 115, fe: 0.8, ca: 10, mg: 25 },
  { name: "Petto di Pollo", kcal: 110, p: 23, c: 0, f: 2, na: 45, k: 256, fe: 0.7, ca: 5, mg: 25 },
  { name: "Avena in Fiocchi", kcal: 370, p: 13, c: 60, f: 7, na: 2, k: 362, fe: 4.25, ca: 52, mg: 138 },
  { name: "Yogurt Greco 0%", kcal: 57, p: 10, c: 4, f: 0, na: 36, k: 141, fe: 0.05, ca: 110, mg: 11 },
  { name: "Salmone Fresco", kcal: 185, p: 20, c: 0, f: 12, na: 59, k: 384, fe: 0.3, ca: 9, mg: 27 },
  { name: "Banana", kcal: 89, p: 1, c: 23, f: 0, na: 1, k: 358, fe: 0.26, ca: 5, mg: 27 },
  { name: "Olio Extravergine d'Oliva", kcal: 899, p: 0, c: 0, f: 100, na: 2, k: 1, fe: 0.56, ca: 1, mg: 0 },
  { name: "Mandorle", kcal: 603, p: 22, c: 4, f: 55, na: 1, k: 733, fe: 3.71, ca: 269, mg: 270 },
  { name: "Sale da cucina", kcal: 0, p: 0, c: 0, f: 0, na: 39340, k: 8, fe: 1.2, ca: 24, mg: 1 },
  // Catalogo base ampliato (era usato solo dal vecchio generatore IA di
  // sostituzioni, ora sostituito da un calcolo esatto sul catalogo reale —
  // vedi SubsPanel/findSubstitutes sopra — ma i valori restano utili come
  // base sempre disponibile per TUTTI, oltre agli alimenti condivisi dagli
  // utenti in custom_foods).
  // BUG PRESO: questi 29 alimenti (tra i più comuni in assoluto — pollo,
  // pasta, uova, tonno...) non avevano na/k/fe/ca/mg, a differenza dei primi
  // 9 della lista sopra. Chiunque registrasse un pasto reale con QUESTI
  // alimenti vedeva Sodio/Potassio/Ferro/Calcio/Magnesio restare a zero
  // nella Griglia Micronutrienti anche avendo loggato tutta la giornata —
  // non un dato mancante isolato, ma la normalità per la maggior parte dei
  // pasti reali. Valori per 100g (riferimento USDA FoodData Central).
  { name: "Fesa di Tacchino", kcal: 104, p: 24, c: 0, f: 1, na: 50, k: 250, fe: 0.7, ca: 8, mg: 25 },
  { name: "Merluzzo", kcal: 82, p: 18, c: 0, f: 0.7, na: 54, k: 413, fe: 0.25, ca: 12, mg: 24 },
  { name: "Orata", kcal: 121, p: 20, c: 0, f: 4.5, na: 65, k: 380, fe: 0.4, ca: 15, mg: 25 },
  { name: "Uova Intere", kcal: 143, p: 13, c: 1, f: 10, na: 142, k: 126, fe: 1.75, ca: 56, mg: 12 },
  { name: "Albume d'Uovo", kcal: 52, p: 11, c: 0.7, f: 0.2, na: 166, k: 163, fe: 0.08, ca: 7, mg: 11 },
  { name: "Bresaola", kcal: 151, p: 32, c: 0.4, f: 2.6, na: 1500, k: 400, fe: 3, ca: 10, mg: 25 },
  { name: "Tonno al Naturale", kcal: 116, p: 26, c: 0, f: 1, na: 250, k: 260, fe: 1, ca: 5, mg: 30 },
  { name: "Manzo Magro (scottona)", kcal: 137, p: 21, c: 0, f: 5.5, na: 55, k: 320, fe: 2, ca: 5, mg: 21 },
  { name: "Lonza di Maiale", kcal: 143, p: 21, c: 0, f: 6, na: 55, k: 350, fe: 0.8, ca: 5, mg: 22 },
  { name: "Fiocchi di Latte", kcal: 98, p: 11, c: 3.4, f: 4.3, na: 350, k: 100, fe: 0.1, ca: 60, mg: 8 },
  { name: "Ceci Secchi", kcal: 364, p: 19, c: 61, f: 6, na: 24, k: 875, fe: 6.24, ca: 105, mg: 79 },
  { name: "Lenticchie Secche", kcal: 352, p: 24, c: 60, f: 1, na: 6, k: 677, fe: 6.51, ca: 35, mg: 47 },
  { name: "Tofu", kcal: 76, p: 8, c: 1.9, f: 4.8, na: 7, k: 121, fe: 5.36, ca: 350, mg: 30 },
  { name: "Pasta", kcal: 353, p: 12, c: 71, f: 1.5, na: 6, k: 223, fe: 1.8, ca: 21, mg: 53 },
  { name: "Patate", kcal: 77, p: 2, c: 17, f: 0.1, na: 6, k: 425, fe: 0.8, ca: 12, mg: 23 },
  { name: "Pane Integrale", kcal: 247, p: 13, c: 41, f: 3.4, na: 450, k: 230, fe: 2.5, ca: 40, mg: 65 },
  { name: "Pane Comune", kcal: 289, p: 8, c: 59, f: 1, na: 500, k: 115, fe: 1.2, ca: 30, mg: 25 },
  { name: "Quinoa", kcal: 368, p: 14, c: 64, f: 6, na: 5, k: 563, fe: 4.57, ca: 47, mg: 197 },
  { name: "Farro", kcal: 335, p: 15, c: 67, f: 2.5, na: 8, k: 388, fe: 3.5, ca: 27, mg: 105 },
  { name: "Cous Cous", kcal: 376, p: 13, c: 77, f: 1, na: 10, k: 166, fe: 1.1, ca: 24, mg: 44 },
  { name: "Piselli", kcal: 81, p: 5, c: 14, f: 0.4, na: 5, k: 244, fe: 1.47, ca: 25, mg: 33 },
  { name: "Mais Dolce", kcal: 86, p: 3.2, c: 19, f: 1.2, na: 15, k: 270, fe: 0.5, ca: 2, mg: 37 },
  { name: "Burro d'Arachidi", kcal: 588, p: 25, c: 20, f: 50, na: 430, k: 649, fe: 1.9, ca: 43, mg: 168 },
  { name: "Avocado", kcal: 160, p: 2, c: 9, f: 15, na: 7, k: 485, fe: 0.55, ca: 12, mg: 29 },
  { name: "Noci", kcal: 654, p: 15, c: 14, f: 65, na: 2, k: 441, fe: 2.91, ca: 98, mg: 158 },
  { name: "Noci di Macadamia", kcal: 718, p: 8, c: 14, f: 76, na: 5, k: 368, fe: 3.69, ca: 85, mg: 130 },
  { name: "Semi di Chia", kcal: 486, p: 17, c: 42, f: 31, na: 16, k: 407, fe: 7.72, ca: 631, mg: 335 },
  { name: "Semi di Lino", kcal: 534, p: 18, c: 29, f: 42, na: 30, k: 813, fe: 5.73, ca: 255, mg: 392 },
  { name: "Burro", kcal: 717, p: 0.9, c: 0.1, f: 81, na: 15, k: 24, fe: 0.02, ca: 24, mg: 2 },
  { name: "Cocco Essiccato", kcal: 660, p: 7, c: 24, f: 65, na: 37, k: 543, fe: 3.3, ca: 26, mg: 90 },
];

const GUIDE = MEAL_SLOTS.map((_, i) => ({
  items: [{ name: F[i % F.length].name, grams: 80 + i * 10, kcal: 200 + i * 20 }],
  tot: { kcal: 300 + i * 30, p: 20 + i, c: 30 + i * 2, f: 8 },
}));

const SUBS = [
  { group: "Fonti di carboidrati", base: "70 g riso basmati", eq: ["70 g pasta", "280 g patate", "90 g pane integrale"] },
  { group: "Fonti proteiche magre", base: "150 g petto di pollo", eq: ["150 g tacchino", "3 uova intere", "180 g merluzzo"] },
  { group: "Fonti di grassi", base: "10 g olio EVO", eq: ["15 g mandorle", "15 g burro d'arachidi", "30 g avocado"] },
];

/* Wrapper di compatibilità per proposeReschedule: distretti diretti +
   sinergici dalla libreria esercizi condivisa (coachingData.js), appiattiti
   in un'unica lista — nome non in libreria = nessun conflitto ipotizzato. */
const MUSCLES_OF = (n) => {
  const entry = DEFAULT_EXERCISE_LIB[n];
  return entry ? [...entry.direct, ...entry.indirect] : [];
};

/* Generatore deterministico di storico simulato: 7 settimane di dati plausibili
   per sonno/passi/HRV/RHR, così i grafici hanno settimane e mesi da scorrere. */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simulateSeries(seed, length, min, max, decimals = 0) {
  const rand = mulberry32(seed);
  const factor = 10 ** decimals;
  return Array.from({ length }, () => Math.round((min + rand() * (max - min)) * factor) / factor);
}

export default function HomePreview({
  gender: genderProp,
  dark: darkProp,
  onToggleDark: onToggleDarkProp,
  planTier: planProp,      // 'free' | 'performance_pack' | 'full_coaching' — mappato da App.jsx (Supabase, qui simulato)
  isOwner,                 // true solo per danielmarsini@coach.com (App.jsx) — il proprietario non ha bisogno di abbonamenti
  profileOverride,         // { name, nickname } dalla sessione reale, sostituisce i valori di preview
  microAddon: microAddonProp, // profiles.micro_addon reale — componente aggiuntivo micronutrienti per Scheda/Training
  supabase: supabaseProp,  // se passato insieme a userId, sostituisce scheda/target finti con quelli reali assegnati dal coach
  userId,
} = {}) {
  // Controlled/uncontrolled ibrido: se App.jsx passa le prop, questo componente
  // segue lo stato condiviso (tema/genere/piano); altrimenti resta autonomo
  // per continuare a funzionare come preview isolata (npm run dev su questo file).
  const isControlled = genderProp !== undefined;
  const [dark, setDark] = useState(darkProp ?? false);
  const [gender, setGender] = useState(genderProp ?? "M");
  // I 3 piani a coaching reale (full_coaching, scheda_personalizzata, training)
  // valgono tutti "PRO" ai fini di questo gate: la loro intera ragion d'essere
  // è la scheda assegnata dal coach, quindi devono vedere exercises/weekPlan
  // reali (WorkoutCalendarStrip + ExerciseCard), non FreeWorkoutBuilder — che
  // è la routine autogestita del piano FREE, mai collegata a Supabase.
  const [planTier, setPlanTier] = useState(
    planProp === "full_coaching" || planProp === "scheda_personalizzata" || planProp === "training" ? "PRO"
      : planProp === "performance_pack" ? "BASE" : "FREE"
  );
  useEffect(() => { if (darkProp !== undefined) setDark(darkProp); }, [darkProp]);
  useEffect(() => { if (genderProp !== undefined) setGender(genderProp); }, [genderProp]);
  useEffect(() => {
    if (planProp === undefined) return;
    setPlanTier(planProp === "full_coaching" || planProp === "scheda_personalizzata" || planProp === "training" ? "PRO"
      : planProp === "performance_pack" ? "BASE" : "FREE");
  }, [planProp]);
  // Diario pasti: in preview isolata parte con un esempio precompilato
  // (Avena in Fiocchi); in modalità reale parte vuoto — un cliente vero non
  // deve mai vedere un pasto che non ha registrato lui. Il diario reale di
  // oggi arriva dal fetch qui sotto appena caricato.
  const [meals, setMeals] = useState(
    MEAL_SLOTS.reduce((a, s) => ({ ...a, [s.id]: (s.id === "colazione" && !(supabaseProp && userId))
      ? [{ name: "Avena in Fiocchi", grams: 60, kcal: 222, p: 8, c: 36, f: 4 }] : [] }), {})
  );
  const [sets, setSets] = useState({});
  // BUG PRESO: questi due partivano sempre con un seed plausibile (7.5h,
  // 6400 passi) anche in modalità reale — il salvataggio automatico qui
  // sotto (riga ~5540) li scriveva nel database come se il cliente li
  // avesse davvero inseriti, ogni giorno, a prescindere. Ora il seed vive
  // SOLO in anteprima isolata (nessun supabase/userId reali); un account
  // vero parte vuoto finché non arriva un dato vero (manuale o dal fetch
  // sotto) — coerente con "mai un numero inventato" già scritto qui sotto.
  const [sleep, setSleep] = useState(
    (supabaseProp && userId) ? { start: "", end: "", hours: 0 } : { start: "23:30", end: "07:00", hours: 7.5 }
  );
  const [steps, setSteps] = useState((supabaseProp && userId) ? "" : "6400");
  // Sonno/passi reali: seed di "oggi" (se già registrato) e storico dal DB.
  // useState({}) invece di null: distingue "non ancora caricato" (nessuna
  // chiave) da "caricato, niente di registrato in questi 49 giorni" (chiavi
  // presenti con array di zeri) — la seconda condizione è quella che deve
  // arrivare a fullHistory, mai un momentaneo array vuoto scambiato per dati.
  const [realHistory, setRealHistory] = useState(null); // null finché non caricato (solo isRealMode)
  const [water, setWater] = useState(1500);
  const [autoSteps, setAutoSteps] = useState(false);
  // isTrainingDay REALE si calcola più sotto da weekPlan (la scheda vera
  // assegnata dal coach) appena è disponibile — questo stato resta solo per
  // il toggle manuale "Simula ON/OFF" della preview demo.
  const [manualTrainingDay, setManualTrainingDay] = useState(true);
  const [targetOn, setTargetOn] = useState({ kcal: 3000, p: 200, c: 380, f: 75 });   // giorno ON (allenamento)
  const [targetOff, setTargetOff] = useState({ kcal: 2550, p: 200, c: 230, f: 85 }); // giorno OFF (riposo)

  // Dati reali: se supabase+userId sono passati (da App.jsx), sovrascrive i target
  // finti con quelli assegnati davvero dal coach (nutrition_targets). Se il coach
  // non ha ancora assegnato nulla, resta il target di default sopra (nessun crash).
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    fetchBothNutritionTargets(supabaseProp, userId)
      .then(({ targetOn: realOn, targetOff: realOff }) => {
        if (realOn) setTargetOn(realOn);
        if (realOff) setTargetOff(realOff);
      })
      .catch((err) => console.error("PERFORM: errore lettura nutrition_targets", err));
  }, [supabaseProp, userId]);

  // Scheda assegnata dal coach per l'INTERA settimana corrente (Lun→Dom, stesso
  // schema lunedì-domenica già usato da fetchWeekWorkout/weekDatesFrom lato
  // coach — vedi 09_CoachDashboard.jsx/coachingData.js), non più solo oggi:
  // serve perché WorkoutCalendarStrip/CalendarDayReadOnlyView possano mostrare
  // il giorno che il cliente clicca davvero, non solo quello odierno. Se un
  // giorno non ha nulla assegnato resta null — niente dati finti mostrati a
  // un utente reale.
  const [assignedWeek, setAssignedWeek] = useState(null); // null = non ancora caricato; 7 elementi Lun→Dom
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    let cancelled = false;
    const weekDates = weekDatesFromLocal(mondayOfLocal());
    fetchAssignedWorkouts(supabaseProp, userId, weekDates[0], weekDates[6])
      .then(async (rows) => {
        const byDate = new Map();
        rows.forEach((r) => {
          if (!byDate.has(r.date)) byDate.set(r.date, []);
          byDate.get(r.date).push(r);
        });
        // Serie già registrate (workout_sets) da precompilare in `sets`, per
        // esercizio: senza questo il salvataggio funziona ma riaprendo l'app
        // i campi kg/reps/rir risultano vuoti — i dati ci sono nel DB, la UI
        // semplicemente non li rileggeva mai all'avvio. Costruito nella STESSA
        // callback di setAssignedWeek (non in un useEffect separato) apposta:
        // così arrivano nello stesso render in cui ExerciseCard monta la
        // prima volta con dati reali, ed è quel render a decidere lo stato
        // iniziale delle checkbox "serie completata" — un tick dopo sarebbe
        // troppo tardi, l'useState di ExerciseCard non si aggiorna da solo.
        const setsPatch = {};
        const week = await Promise.all(weekDates.map(async (date) => {
          const dayRows = byDate.get(date);
          if (!dayRows || dayRows.length === 0) return null;
          const exercisesForDay = await Promise.all(dayRows.map(async (r) => {
            const [history, loggedSets] = await Promise.all([
              fetchExerciseHistory(supabaseProp, userId, r.exercise_name),
              fetchWorkoutSets(supabaseProp, r.id),
            ]);
            if (loggedSets.length > 0) {
              setsPatch[r.id] = Array.from({ length: r.sets_count ?? 3 }, (_, i) => {
                const logged = loggedSets.find((s) => s.set_number === i + 1);
                return logged
                  ? { kg: logged.load_kg ?? "", reps: logged.reps_completed ?? "", rir: logged.rir ?? "" }
                  : { kg: "", reps: "", rir: "" };
              });
            }
            return {
              id: r.id,               // id reale della riga workout_logs, serve per salvare il log dopo
              name: r.exercise_name,
              sets: r.sets_count ?? 3,
              reps: r.reps_target || "—",   // prescrizione del coach (SCHEMA_v17); "—" solo se davvero non impostata
              rirTarget: r.rir_target || "—",   // prescrizione del coach (SCHEMA_v21); "—" solo se davvero non impostato
              technique: r.intensity_technique || "",
              rests: Array.from({ length: r.sets_count ?? 3 }, () => r.rest_seconds ?? 120),
              history,
              splitLabel: r.split_label,
              // BUG PRESO: mancavano qui — computeVolume(weekPlan) per un
              // esercizio custom non ancora nella libreria condivisa si
              // affida SOLO a questi due campi (il nome da solo non basta).
              // Senza, l'esercizio spariva del tutto dal volume lato
              // cliente (0 serie), mentre il coach — che legge muscleTarget/
              // synergists direttamente da fetchWeekWorkout — lo vedeva
              // giusto: due grafici con numeri diversi sugli stessi esercizi.
              muscleTarget: r.muscle_target || null,
              synergists: r.synergist_targets || [],
            };
          }));
          return { label: dayRows[0].split_label || "Scheda di oggi", exercises: exercisesForDay };
        }));
        if (cancelled) return;
        setAssignedWeek(week);
        if (Object.keys(setsPatch).length > 0) setSets((prev) => ({ ...setsPatch, ...prev }));
      })
      .catch((err) => {
        console.error("PERFORM: errore lettura workout_logs assegnati", err);
        if (!cancelled) setAssignedWeek(Array(7).fill(null));
      });
    return () => { cancelled = true; };
  }, [supabaseProp, userId]);

  // Sonno/passi reali (daily_metrics): un'unica fetch su una finestra di
  // HISTORY_DAYS+1 giorni (storico + oggi) — seed lo stato di "oggi" se il
  // cliente l'aveva già registrato in questa stessa giornata, e costruisce
  // l'array per i grafici a candela con dati veri, 0 = giorno non tracciato
  // (mai un numero inventato per riempire un buco).
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    let cancelled = false;
    const today = toLocalISODate();
    const pastDates = pastDatesUntilYesterday(HISTORY_DAYS);
    fetchDailyMetricsRange(supabaseProp, userId, pastDates[0], today)
      .then((rows) => {
        if (cancelled) return;
        const byDate = new Map(rows.map((r) => [r.date, r]));
        const todayRow = byDate.get(today);
        if (todayRow) {
          if (todayRow.sleep_start || todayRow.sleep_end) {
            setSleep({ start: todayRow.sleep_start?.slice(0, 5) || "", end: todayRow.sleep_end?.slice(0, 5) || "", hours: Number(todayRow.sleep_hours) || 0 });
          }
          if (todayRow.steps != null) setSteps(String(todayRow.steps));
        }
        setRealHistory({
          sleep: pastDates.map((d) => Number(byDate.get(d)?.sleep_hours) || 0),
          steps: pastDates.map((d) => Number(byDate.get(d)?.steps) || 0),
          hrv: pastDates.map((d) => Number(byDate.get(d)?.hrv_ms) || 0),
          rhr: pastDates.map((d) => Number(byDate.get(d)?.rhr_bpm) || 0),
        });
      })
      .catch((err) => console.error("PERFORM: errore lettura daily_metrics", err));
    return () => { cancelled = true; };
  }, [supabaseProp, userId]);

  // Salvataggio reale di sonno/passi: debounced (900ms, stesso principio già
  // usato per l'anamnesi) per non scrivere a ogni singolo tasto/click. Scrive
  // solo dopo il primo caricamento (realHistory !== null): altrimenti il seed
  // di "oggi" qui sopra si ri-salverebbe da solo un istante dopo averlo letto.
  useEffect(() => {
    if (!supabaseProp || !userId || realHistory === null) return undefined;
    const t = setTimeout(() => {
      upsertDailyMetrics(supabaseProp, userId, toLocalISODate(), {
        sleep_start: sleep.start || null,
        sleep_end: sleep.end || null,
        sleep_hours: sleep.hours || null,
        steps: steps !== "" ? Number(steps) : null,
      }).catch((err) => console.error("PERFORM: errore salvataggio daily_metrics", err));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep.start, sleep.end, sleep.hours, steps, supabaseProp, userId, realHistory]);

  // Correzione di un giorno PASSATO di sonno/passi (candela cliccata nel
  // grafico storico) — "oggi" non passa da qui, ha già i suoi campi sopra
  // al grafico e la scrittura debounced qui sopra. Aggiorna sia Supabase
  // sia lo stato locale (altrimenti il grafico tornerebbe al vecchio
  // valore al prossimo re-render, prima del prossimo fetch completo).
  const editDailyMetricDay = (kind, dateISO, value) => {
    if (!supabaseProp || !userId) return;
    const patch = kind === "sleep" ? { sleep_hours: value } : { steps: value };
    upsertDailyMetrics(supabaseProp, userId, dateISO, patch)
      .then(() => {
        setRealHistory((h) => {
          if (!h) return h;
          const idx = pastDatesUntilYesterday(HISTORY_DAYS).indexOf(dateISO);
          if (idx === -1) return h;
          const nextArr = [...h[kind]];
          nextArr[idx] = value;
          return { ...h, [kind]: nextArr };
        });
      })
      .catch((err) => console.error("PERFORM: errore modifica giorno storico", err));
  };

  // Diario pasti reale di oggi (nutrition_logs): se il cliente aveva già
  // registrato qualcosa oggi (stessa sessione precedente, o riapertura
  // dell'app), lo ricarica al posto del diario vuoto di default. Ogni item
  // porta con sé l'id reale della riga, necessario per poterlo rimuovere.
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    let cancelled = false;
    fetchNutritionLogsForDate(supabaseProp, userId, toLocalISODate())
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const bySlot = {};
        rows.forEach((r) => {
          if (!bySlot[r.meal_slot]) bySlot[r.meal_slot] = [];
          bySlot[r.meal_slot].push({
            id: r.id, name: r.name, grams: Number(r.grams) || 0,
            kcal: Number(r.kcal), p: Number(r.protein), c: Number(r.carbs), f: Number(r.fat),
          });
        });
        setMeals((m) => {
          const next = { ...m };
          MEAL_SLOTS.forEach((slot) => { if (bySlot[slot.id]) next[slot.id] = bySlot[slot.id]; });
          return next;
        });
      })
      .catch((err) => console.error("PERFORM: errore lettura diario pasti", err));
    return () => { cancelled = true; };
  }, [supabaseProp, userId]);

  const [rhr, setRhr] = useState("58");
  const [hrv, setHrv] = useState("62");
  const [stressLevel, setStressLevel] = useState("");
  const [caffeineMg, setCaffeineMg] = useState("");
  const [caffeineTime, setCaffeineTime] = useState("");
  // Sonno REM: nessun dispositivo reale a monte (HRV/RHR restano bloccati
  // "disponibile a breve"), quindi non è una misura ma una STIMA calcolata
  // da noi da ore dormite + stress + risvegli notturni + caffeina + energia
  // al risveglio — vedi computeRemSleepEstimate qui sotto. Sostituisce il
  // vecchio campo manuale "inserisci le tue ore di REM", che chiedeva al
  // cliente un dato che nessuno sa davvero misurare a occhio.
  const [nightWakeups, setNightWakeups] = useState("");
  const [morningEnergy, setMorningEnergy] = useState("");
  const [demoFullHistory] = useState(() => ({
    sleep: simulateSeries(101, 49, 5.5, 8.4, 1),
    steps: simulateSeries(202, 49, 4200, 13200, 0),
    hrv: simulateSeries(303, 49, 36, 74, 0),
    rhr: simulateSeries(404, 49, 52, 79, 0),
  }));
  // In modalità reale: storico vero da daily_metrics (0 = giorno non
  // tracciato). Finché non è ancora arrivato (realHistory === null), array di
  // zeri della stessa lunghezza — mai la demo al posto di un caricamento.
  const fullHistory = Boolean(supabaseProp && userId)
    ? (realHistory ?? { sleep: Array(HISTORY_DAYS).fill(0), steps: Array(HISTORY_DAYS).fill(0), hrv: Array(HISTORY_DAYS).fill(0), rhr: Array(HISTORY_DAYS).fill(0) })
    : demoFullHistory;
  const [waterTarget, setWaterTarget] = useState(4000);

  /* Simula la sincronizzazione in tempo reale con il pannello del coach (in
     produzione: ogni evento viene scritto sull'oggetto di stato collegato a
     Supabase, cosicché il coach possa leggere e calibrare dieta/allenamento/
     integrazione sui progressi reali dell'atleta). Ogni evento aggiorna anche
     "l'ultima registrazione": se passano più di 24 ore senza che arrivi
     nessun evento, lo streak si azzera. */
  const [coachFeed, setCoachFeed] = useState([]);
  const [lastActivityDate, setLastActivityDate] = useState(() => toLocalISODate());
  const pushCoachSync = (evt) => {
    setCoachFeed((f) => [...f.slice(-99), { ...evt, at: new Date().toISOString() }]);
    setLastActivityDate(toLocalISODate());

    // Salvataggio reale: quando il cliente spunta una serie come completata su
    // un esercizio assegnato dal coach (isRealMode + exerciseId reale), scrive
    // sia lo storico completo (workout_sets, una riga per serie) sia un
    // riassunto rapido su workout_logs (ultima serie + stato "done").
    if (isRealMode && evt.type === "workout" && evt.kind === "set-completed" && evt.exerciseId && evt.row) {
      const { kg, reps, rir } = evt.row;
      logWorkoutSet(supabaseProp, evt.exerciseId, userId, evt.rowIndex + 1, {
        repsCompleted: reps !== "" ? Number(reps) : null,
        loadKg: kg !== "" ? Number(kg) : null,
        rir: rir !== "" ? Number(rir) : null,
      }).catch((err) => console.error("PERFORM: errore salvataggio workout_sets", err));
    }
  };
  const simulateInactivity = () => {
    const d = new Date(); d.setDate(d.getDate() - 3);
    setLastActivityDate(toLocalISODate(d));
  };
  const resetActivityToday = () => setLastActivityDate(toLocalISODate());

  /* Catalogo alimenti che cresce nel tempo: ogni inserimento manuale lo
     arricchisce, come un database collettivo stile MyFitnessPal.
     BUG PRESO: era SOLO state locale del browser (mai scritto su
     Supabase) — perso al refresh, mai visto da nessun altro cliente.
     custom_foods (SCHEMA_v43) lo rende reale e condiviso: chi lo cerca
     dopo lo trova già pronto, non solo chi l'ha scritto. */
  const [sharedFoods, setSharedFoods] = useState([]);
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    let cancelled = false;
    fetchCustomFoods(supabaseProp).then((rows) => { if (!cancelled) setSharedFoods(rows); })
      .catch((err) => console.error("PERFORM: errore caricamento catalogo alimenti condiviso", err));
    return () => { cancelled = true; };
  }, [supabaseProp, userId]);
  const addCustomFood = (food) => {
    setSharedFoods((cf) => (cf.some((f) => f.name.toLowerCase() === food.name.toLowerCase()) ? cf : [...cf, food]));
    if (supabaseProp && userId) learnCustomFood(supabaseProp, food, userId);
  };
  const allFoods = useMemo(() => [...F, ...sharedFoods], [sharedFoods]);

  const accent = gender === "F" ? (dark ? "#D4A5A5" : "#9D6666") : (dark ? "#C5A059" : "#8C6E33");
  const accentSoft = gender === "F" ? "rgba(212,165,165,0.5)" : "rgba(197,160,89,0.5)";
  const accentText = gender === "F" ? "#9D6666" : "#8C6E33";

  const isRealMode = Boolean(supabaseProp && userId);

  const demoExercises = [
    { id: "e1", name: "Panca piana bilanciere", sets: 4, reps: "6-8", rirTarget: "2", technique: "Rest-Pause ultima serie", rests: [180, 180, 180, 240],
      history: [{ kg: 72.5, reps: 7 }, { kg: 75, reps: 6 }, { kg: 77.5, reps: 6 }] },
    { id: "e2", name: "Rematore bilanciere", sets: 4, reps: "8-10", rirTarget: "2", technique: "", rests: [150, 150, 150, 180],
      history: [{ kg: 65, reps: 9 }, { kg: 67.5, reps: 8 }] },
    { id: "e3", name: "Alzate laterali manubri", sets: 3, reps: "12-15", rirTarget: "1", technique: "", rests: [90, 90, 90],
      history: [{ kg: 12, reps: 14 }, { kg: 12.5, reps: 13 }] },
  ];
  const setsFor = (ex) => sets[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "", rir: "" }));
  const onSetField = (ex, i, f, v) =>
    setSets((s) => {
      const rows = (s[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "", rir: "" }))).map((r, j) => (j === i ? { ...r, [f]: v } : r));
      return { ...s, [ex.id]: rows };
    });

  const consumed = Object.values(meals).flat().reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );

  // In modalità reale: la settimana assegnata dal coach così com'è arrivata
  // dal fetch qui sopra (7 elementi Lun→Dom, null = riposo/non assegnato). In
  // preview isolata: la scheda dimostrativa di sempre.
  const weekPlan = isRealMode
    ? (assignedWeek ?? Array(7).fill(null))
    : [
        { label: "Upper A — Spinta", exercises: demoExercises }, null,
        { label: "Upper B", exercises: [{ name: "Trazioni" }] }, null,
        { label: "Lower B", exercises: [{ name: "Stacco rumeno" }] }, null, null,
      ];

  // "Oggi" è solo l'indice di weekPlan che corrisponde alla data odierna —
  // non più una fetch/stato separato: stessa identica fonte dati che usa la
  // striscia calendario per qualunque altro giorno cliccato (CalendarDayReadOnlyView
  // legge weekPlan[isoWeekdayOf(date)] allo stesso modo).
  const todayWeekdayIdx = isoWeekdayOf(new Date());
  const exercises = isRealMode ? (weekPlan[todayWeekdayIdx]?.exercises ?? []) : demoExercises;

  // ON/OFF alimentazione sincronizzato con la scheda vera: giorno assegnato
  // dal coach (weekPlan[oggi] non null) = ON, riposo (null) = OFF. Prima era
  // solo un toggle manuale mai collegato alla scheda reale — "Simula ON/OFF"
  // resta ma solo come test per la preview demo (isRealMode lo ignora).
  const isTrainingDay = isRealMode ? weekPlan[todayWeekdayIdx] != null : manualTrainingDay;
  const target = isTrainingDay ? targetOn : targetOff; // il target attivo "oggi" si sceglie da solo

  // Stesso principio di exercises/weekPlan qui sopra: in modalità reale niente
  // numeri inventati. isTraining/sessionLabel riflettono la scheda vera di
  // oggi; weekNumber/dayNumber/mesociclo/mesocicloWeeks restano null — non
  // c'è ancora una fonte reale per quei quattro campi (nessun collegamento a
  // un vero "giorno N del percorso"), e mostrare "Giorno 15" a un cliente
  // vero sarebbe un dato falso, non solo un placeholder innocuo.
  const day = isRealMode
    ? { weekday: todayWeekdayIdx, weekNumber: null, isTraining: exercises.length > 0, sessionLabel: exercises[0]?.splitLabel || "", dayNumber: null, mesociclo: null, mesocicloWeeks: null }
    : { weekday: 0, weekNumber: 3, isTraining: isTrainingDay, sessionLabel: "Upper A — Spinta", dayNumber: 15, mesociclo: 2, mesocicloWeeks: 4 };

  // Il proprietario (danielmarsini@coach.com) vede sempre tutto sbloccato:
  // non è un cliente, non ha un piano da rispettare, ogni gate va bypassato.
  const access = isOwner
    ? { nutrition: true, recovery: true, pro: true, paid: true }
    : { nutrition: true, recovery: true, pro: planTier === "PRO", paid: planTier === "BASE" || planTier === "PRO" };

  return (
    <div className={isControlled ? "app-root" : "app-root min-h-screen"} data-theme={dark ? "dark" : "light"}
         style={{ backgroundColor: isControlled ? "transparent" : (dark ? "#09090B" : "#FFFFFF"),
                  transition: "background-color 0.4s ease",
                  /* letto da 'userGender' su Supabase: qui simulato con lo stato locale 'gender' */
                  "--title-a": gender === "F" ? "#E5C1CD" : "#D4AF37",
                  "--title-b": gender === "F" ? "#F4E0E6" : "#F3E5AB",
                  "--title-c": gender === "F" ? "#C896A6" : "#AA7C11" }}>
      <style>{`
        .app-root { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          --page:#FFFFFF; --surface:#FFFFFF; --surface-2:#FCFCFD; --line:rgba(17,17,17,0.06);
          --shadow:0 8px 30px rgba(0,0,0,0.02); --ink:#1A1A1A; --ink-2:#8E8E93; --ink-3:#52525B; }
        .app-root[data-theme="dark"] { --page:#09090B; --surface:#18181B; --surface-2:#131316;
          --line:rgba(255,255,255,0.07); --shadow:0 8px 30px rgba(0,0,0,0.38);
          --ink:#FAFAFA; --ink-2:#A1A1AA; --ink-3:#E4E4E7; }
        .font-data{font-family:inherit;font-weight:600;letter-spacing:-0.01em;font-variant-numeric:tabular-nums}
        /* gradiente animato condiviso: Oro Lucido Vivo (uomo) / Rosa Cipria Luminescente (donna) */
        .title-shine{background-image:linear-gradient(100deg, var(--title-a), var(--title-b), var(--title-c), var(--title-b), var(--title-a));
          background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
          animation:performGlow 5s ease-in-out infinite;display:inline-block}
        @media (prefers-reduced-motion: reduce){.title-shine{animation:none}}
        /* BUG PRESO: si chiamava ".h1" come la classe (diversa, testo pieno
           var(--ink)) di 08_ClientProfileView.jsx/04_AppShell.jsx — nomi
           di classe globali non isolati fra file, l'ultimo <style> montato
           vinceva la cascata per QUALUNQUE elemento .h1 in tutta l'app.
           Risultato: "Impostazioni" e altri titoli altrove diventavano
           invisibili (color:transparent senza il gradiente giusto sotto,
           le variabili --title-a/b/c non esistono fuori da questo file).
           Rinominata in modo univoco: mai più una collisione fra file. */
        .h1-gradient{font-size:1.45rem;font-weight:700;letter-spacing:-0.01em}
        .h1-gradient{background-image:linear-gradient(100deg, var(--title-a), var(--title-b), var(--title-c), var(--title-b), var(--title-a));
          background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
          animation:performGlow 5s ease-in-out infinite;display:inline-block}
        @media (prefers-reduced-motion: reduce){.h1-gradient{animation:none}}
        /* micro-bordo animato, per le card premium (banner principale) */
        .gradient-border{position:relative;border:1.5px solid transparent;border-radius:1rem;background-clip:padding-box}
        .gradient-border::before{content:"";position:absolute;inset:-1.5px;border-radius:inherit;padding:1.5px;
          background:linear-gradient(100deg, var(--title-a), var(--title-b), var(--title-c), var(--title-b), var(--title-a));
          background-size:220% auto;animation:performGlow 4s ease-in-out infinite;
          -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
          -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0}
        @media (prefers-reduced-motion: reduce){.gradient-border::before{animation:none}}
        .h2{color:var(--ink);font-size:1.12rem;font-weight:600;letter-spacing:-0.005em}
        .body{color:var(--ink-3);font-size:.9rem;font-weight:400;line-height:1.6;letter-spacing:.01em}
        .meta{color:var(--ink-2);font-size:.82rem;font-weight:400;letter-spacing:.01em}
        .label{font-family:inherit;color:var(--ink-2);font-size:.68rem;
          text-transform:uppercase;letter-spacing:.1em;font-weight:600}
        .card{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);
          border-radius:1rem;padding:1.5rem}
        .card-tap{transition:transform .2s ease}.card-tap:active{transform:scale(.985)}
        .inner{background:var(--surface-2);border:1px solid var(--line);border-radius:.85rem}
        .input{background:var(--surface);border:1px solid var(--line);color:var(--ink);
          border-radius:.7rem;font-size:.95rem}
        .input::placeholder{color:var(--ink-2)}
        .search-strong{color:#111111!important;font-weight:600}
        .app-root[data-theme="dark"] .search-strong{color:#FAFAFA!important}
        .on-light,.on-light *{color:#111111!important}
        .on-dark,.on-dark *{color:#FAFAFA!important}
        .xp-bar{transition:width .8s cubic-bezier(.22,1.2,.36,1)}
        @keyframes xpBarShine{0%{background-position:200% 50%}100%{background-position:0% 50%}}
        .xp-bar-shine{background-image:linear-gradient(90deg, var(--title-a), var(--title-b), var(--title-c), var(--title-b), var(--title-a));
          background-size:220% auto;animation:xpBarShine 3.5s linear infinite}
        @media (prefers-reduced-motion: reduce){.xp-bar-shine{animation:none}}
        /* Bagliore vivo dei cerchi di compliance: pulsa nel colore REALE
           dell'arco (--ring-color, impostato per anello in ComplianceCircle)
           — mai un elemento bianco/grigio separato sopra il colore. */
        .ring-glow-pulse{animation:ringGlowPulse 2.6s ease-in-out infinite}
        @keyframes ringGlowPulse{
          0%, 100%{filter:brightness(0.94) saturate(0.92)}
          50%{filter:brightness(1.28) saturate(1.2)}
        }
        @media (prefers-reduced-motion: reduce){.ring-glow-pulse{animation:none}}
        /* toast XP: entra dall'alto, resta un attimo, si dissolve da sola */
        .xp-toast-wrap{position:fixed;top:calc(env(safe-area-inset-top, 0px) + 14px);left:0;right:0;
          display:flex;justify-content:center;z-index:70;pointer-events:none}
        .xp-toast{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:999px;
          background:linear-gradient(120deg, var(--title-a), var(--title-b));color:#FFFFFF;
          font-size:0.8rem;font-weight:700;box-shadow:0 10px 24px -6px rgba(0,0,0,0.4);
          animation:xpToastPop 2.6s cubic-bezier(.22,1,.36,1) both}
        .xp-toast-label{font-weight:500;opacity:0.9}
        @keyframes xpToastPop{0%{opacity:0;transform:translateY(-14px) scale(.9)}
          12%{opacity:1;transform:translateY(0) scale(1)}82%{opacity:1;transform:translateY(0) scale(1)}
          100%{opacity:0;transform:translateY(-8px) scale(.96)}}
        @media (prefers-reduced-motion: reduce){.xp-toast{animation:none}}
        @keyframes springIn{0%{opacity:0;transform:translateY(10px) scale(.985)}
          55%{opacity:1;transform:translateY(-2px) scale(1.004)}100%{opacity:1;transform:none}}
        .spring-in{animation:springIn .3s cubic-bezier(.22,1.2,.36,1) both}
        @keyframes counterPop{0%{transform:scale(.82);opacity:.5}60%{transform:scale(1.1);opacity:1}
          100%{transform:scale(1);opacity:1}}
        .counter-pop{animation:counterPop .32s cubic-bezier(.34,1.56,.64,1) both}
        @keyframes candleRise{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
        .candle-rise{animation:candleRise .6s cubic-bezier(.22,1,.36,1) both}
        @keyframes performGlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes ringBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
        @keyframes chart3dSheen{0%{top:160%}100%{top:-60%}}
        .chart3d-sheen{animation:chart3dSheen 2.8s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.chart3d-sheen{animation:none}}
        .ring-breathe{animation:ringBreathe 3.4s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.ring-breathe{animation:none}}
        .metallic-badge{background-size:220% auto;animation:performGlow 4s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.metallic-badge{animation:none}}
        @keyframes greetingWave{0%,100%{transform:rotate(0deg)}20%{transform:rotate(14deg)}40%{transform:rotate(-8deg)}60%{transform:rotate(14deg)}80%{transform:rotate(0deg)}}
        .greeting-emoji{display:inline-block;transform-origin:70% 70%;animation:greetingWave 2.4s ease-in-out infinite}
        @keyframes greetingIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .greeting-text{animation:greetingIn .6s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.greeting-emoji,.greeting-text{animation:none}}
        @keyframes iconFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .icon-float-1{animation:iconFloat 3.2s ease-in-out infinite}
        .icon-float-2{animation:iconFloat 3.2s ease-in-out .5s infinite}
        .icon-float-3{animation:iconFloat 3.2s ease-in-out 1s infinite}
        @keyframes flameFlicker{0%,100%{transform:scale(1) rotate(-1.5deg)}30%{transform:scale(1.08) rotate(1.5deg)}
          60%{transform:scale(.96) rotate(-1deg)}80%{transform:scale(1.05) rotate(2deg)}}
        .flame-1{animation:flameFlicker 1.6s ease-in-out infinite}
        .flame-2{animation:flameFlicker 1.1s ease-in-out infinite;filter:drop-shadow(0 0 6px currentColor)}
        .flame-3{animation:flameFlicker .75s ease-in-out infinite;filter:drop-shadow(0 0 10px currentColor)}
        @keyframes waterWave{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
        .water-wave{animation:waterWave 3s ease-in-out infinite;transform-origin:bottom}
        @keyframes skeletonPulse{0%,100%{opacity:.55}50%{opacity:1}}
        .skeleton{background:var(--surface-2);animation:skeletonPulse 1.3s ease-in-out infinite;border-radius:.75rem}
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      {!isControlled && (
        <div className="fixed top-3 right-3 z-50 flex gap-2">
          <button onClick={() => setDark((v) => !v)} className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF" }}>
            {dark ? "Light" : "Onyx"}
          </button>
          <button onClick={() => setGender((g) => (g === "M" ? "F" : "M"))} className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF" }}>
            {gender === "M" ? "Oro" : "Rosa"}
          </button>
          <button onClick={() => setPlanTier((t) => (t === "FREE" ? "BASE" : t === "BASE" ? "PRO" : "FREE"))}
            className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF" }}>
            {planTier === "FREE" ? "Profilo FREE" : planTier === "BASE" ? "Profilo Base (5€)" : "Profilo PRO"}
          </button>
        </div>
      )}

      <main className={isControlled ? "" : "max-w-2xl mx-auto px-4 py-8"} style={isControlled ? undefined : { paddingBottom: 60 }}>
        <HomeDashboard
          accent={accent} accentSoft={accentSoft} accentText={accentText}
          profile={{ name: "Marco Bianchi", nickname: "IronWolf", ...profileOverride, gender, goalLabel: "86 kg mantenendo i carichi" }}
          day={day}
          target={target} consumed={consumed}
          targetOn={targetOn} targetOff={targetOff}
          onSetTargetOn={(patch) => setTargetOn((t) => ({ ...t, ...patch }))}
          onSetTargetOff={(patch) => setTargetOff((t) => ({ ...t, ...patch }))}
          isTrainingDay={isTrainingDay} onToggleTrainingDay={isRealMode ? null : () => setManualTrainingDay((v) => !v)}
          streak={computeStreak("2026-07-19", 12, lastActivityDate)} level={4} xp={1840} xpInLevel={340} xpNeeded={590}
          mealsBySlot={meals} foods={allFoods} mealGuide={GUIDE} substitutions={SUBS}
          exercises={exercises} setsFor={setsFor} onSetField={onSetField}
          sleep={sleep} steps={steps} water={water} waterTarget={waterTarget} autoSteps={autoSteps}
          onSetWaterTarget={setWaterTarget}
          onEditSleepDay={(dateISO, v) => editDailyMetricDay("sleep", dateISO, v)}
          onEditStepsDay={(dateISO, v) => editDailyMetricDay("steps", dateISO, v)}
          rhr={rhr} hrv={hrv}
          fullHistory={fullHistory}
          weekPlan={weekPlan} musclesOf={MUSCLES_OF} missedDayIdx={-1}
          access={access}
          supabase={supabaseProp} userId={userId}
          // BUG PRESO: qui sotto veniva SEMPRE derivato dal bucket a 3 valori
          // FREE/BASE/PRO (vedi planTier più sotto) — utile per i gate larghi
          // "è un piano a pagamento?"/"è un piano da coaching?", ma quel
          // bucket comprime scheda_personalizzata e training nello stesso
          // "PRO" di full_coaching. Passato così a valle, Sostituzioni/Dieta
          // Tipo/Micronutrienti (che devono distinguere Full Coaching dagli
          // altri due piani da coaching) vedevano SEMPRE "full_coaching" per
          // tutti e tre. planProp (il piano reale da Supabase, via App.jsx)
          // resta quello vero; il bucket demo serve solo quando non c'è
          // un App.jsx reale a fornirlo (preview isolata).
          userPlan={planProp ?? (planTier === "FREE" ? "free" : planTier === "BASE" ? "performance_pack" : "full_coaching")}
          microAddon={microAddonProp}
          onSetSleep={(k, v) => setSleep((s) => {
            const next = { ...s, [k]: v };
            if (next.start && next.end) {
              const [h1, m1] = next.start.split(":").map(Number);
              const [h2, m2] = next.end.split(":").map(Number);
              next.hours = ((h2 * 60 + m2 - (h1 * 60 + m1) + 1440) % 1440) / 60;
            }
            return next;
          })}
          onSetSteps={setSteps}
          onToggleAutoSteps={() => { setAutoSteps((v) => !v); if (!autoSteps) setSteps("7250"); }}
          onAddWater={() => setWater((w) => Math.min(5000, w + 250))}
          onSetRhr={setRhr} onSetHrv={setHrv}
          nightWakeups={nightWakeups} onSetNightWakeups={setNightWakeups}
          morningEnergy={morningEnergy} onSetMorningEnergy={setMorningEnergy}
          stressLevel={stressLevel} onSetStressLevel={setStressLevel}
          caffeineMg={caffeineMg} onSetCaffeineMg={setCaffeineMg}
          caffeineTime={caffeineTime} onSetCaffeineTime={setCaffeineTime}
          onCoachSync={pushCoachSync} lastCoachSync={coachFeed[coachFeed.length - 1]} coachSyncCount={coachFeed.length}
          coachFeed={coachFeed}
          onSimulateInactivity={simulateInactivity} onResetActivityToday={resetActivityToday}
          onAddFood={(slot, item) => {
            const localItem = { ...item };
            setMeals((m) => ({ ...m, [slot]: [...m[slot], localItem] }));
            if (supabaseProp && userId) {
              addNutritionLogItem(supabaseProp, userId, toLocalISODate(), slot, item)
                .then((saved) => {
                  setMeals((m) => ({ ...m, [slot]: m[slot].map((it) => (it === localItem ? { ...it, id: saved.id } : it)) }));
                })
                .catch((err) => console.error("PERFORM: errore salvataggio pasto", err));
            }
          }}
          onRemoveFood={(slot, index) => {
            setMeals((m) => {
              const item = m[slot][index];
              if (supabaseProp && userId && item?.id) {
                removeNutritionLogItem(supabaseProp, item.id).catch((err) => console.error("PERFORM: errore rimozione pasto", err));
              }
              return { ...m, [slot]: m[slot].filter((_, i) => i !== index) };
            });
          }}
          onUpdateFood={(slot, index, newGrams) => {
            setMeals((m) => {
              const items = m[slot] || [];
              const item = items[index];
              if (!item) return m;
              const patched = scaleFoodItem(item, newGrams);
              if (supabaseProp && userId && item.id) {
                updateNutritionLogItem(supabaseProp, item.id, patched).catch((err) => console.error("PERFORM: errore modifica pasto", err));
              }
              return { ...m, [slot]: items.map((it, i) => (i === index ? patched : it)) };
            });
          }}
          onOpenScanner={() => {}} onAddCustomFood={addCustomFood}
          onCopyYesterday={() => {}} onShoppingList={() => {}}
          onApplyReschedule={() => {}} onDismissReschedule={() => {}}
          onUpgrade={() => {}}
        />
      </main>
    </div>
  );
}
