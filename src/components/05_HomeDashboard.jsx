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

import React, { useState, useMemo, useEffect, useRef, useCallback, useId } from "react";
import ErrorBoundary from "./ErrorBoundary.jsx";
import {
  Dumbbell, Salad, BedDouble, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ArrowLeft, Plus, X, Search, Barcode, Camera, RefreshCw, Sparkles, ShoppingCart,
  CheckCircle2, Flame, Timer, Droplets, Footprints, Pill, Lock, Route, Trash2,
  Loader2, AlertTriangle, Mic, MicOff, MessageCircle, GripVertical, History, Pencil, Check, Navigation, Trophy,
  Newspaper, Medal, User, Settings,
} from "lucide-react";
import { fetchBothNutritionTargets, fetchDietPlan, fetchAssignedWorkouts, fetchWorkoutDayNotes, fetchWeekExerciseHistories, logWorkoutSet, fetchPrescribedSupplements, fetchSupplementIntakeToday, setSupplementTaken, computeTrainingCompliance, computeRecoveryCompliance, computeNutritionCompliance, fetchDailyMetricsRange, upsertDailyMetrics, fetchTodayWellness, fetchStreakFreezeStatus, useStreakFreezeToday, fetchNutritionLogsForDate, addNutritionLogItem, removeNutritionLogItem, updateNutritionLogItem, computeRealXpAndStreak, xpToLevelInfo, LEVEL_TIERS, LEVELS_PER_TIER, levelMinXp, LEVEL_REWARDS, saveCheckin,
  fetchSelfSupplements, addSelfSupplement, removeSelfSupplement, removeSelfSupplementMoment, updateSelfSupplementReminder,
  fetchSelfSupplementIntakeToday, setSelfSupplementTaken, fetchCheckins, uploadCheckinPhoto, fetchWorkoutDoneDates, fetchNutritionLoggedDates, requestPause, fetchActivePause, fetchCardioLogs, addCardioLog, deleteCardioLog, computeVolume, computeVolumeContributions, weekExerciseHistoryKey, MUSCLES as VOLUME_MUSCLES, DEFAULT_EXERCISE_LIB, fetchExerciseLibrary, learnExercise, DB_MUSCLE_TO_CHART, parseRepsTarget, fetchCustomFoods, learnCustomFood, markGuideTourCompleted, fetchWorkoutTemplates, isRealCoachingPlan, fetchFoodUsageStats, fetchSectionNovelty, markSectionSeen, formatSetsReps, guessBodyFocusLabel, fetchAnamnesis } from "../lib/coachingData.js";
import { THRESH, chart3dPct, CANDLE, grade, computeReadinessScore, computeEnergyExpenditure, computeAgeFromBirthDate } from "../lib/biometrics.js";
import { enqueueWrite, flushOfflineQueue, cancelQueuedWrite, useOfflineQueueCount } from "../lib/offlineQueue.js";
import { readCache, writeCache } from "../lib/localCache.js";
import { useDragReorder, moveItem } from "../lib/useDragReorder.js";
import { useEdgeSwipeBack, useSwipeDownClose } from "../lib/useSwipeGesture.js";
import { saveScrollPosition, getScrollPosition } from "../lib/scrollMemory.js";
import { haptic } from "../lib/haptics.js";
import { playSound, playRestTick } from "../lib/sounds.js";
import { isMapboxConfigured, snapRouteToRoads, generateLoopRoute } from "../lib/mapbox.js";
import Portal from "./Portal.jsx";
import SwipeHandle from "./SwipeHandle.jsx";
import { isAndroid, isGoogleFitConfigured, syncTodayStepsFromGoogleFit, isGoogleFitConnected, disconnectGoogleFit } from "../lib/googleFit.js";
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

// Data odierna che si auto-corregge, usata da ogni "preso oggi" (integratori,
// protocollo Pro e diario autogestito) per forzare un refetch reale appena
// cambia il giorno di calendario — altrimenti lo stato React resta quello di
// ieri finché l'app non viene ricaricata del tutto. BUG PRESO: un
// setInterval(60s) da solo non basta su mobile — un tab/PWA lasciato in
// background viene sospeso dal browser (i timer non girano affatto finché
// non torna in foreground), quindi riaprendo l'app la mattina dopo si vedeva
// ancora "ieri" per un bel po' prima che l'intervallo si "svegliasse". Il
// listener su visibilitychange ricontrolla subito al ritorno in foreground,
// invece di aspettare il prossimo tick dell'intervallo.
function useTodayIso() {
  const [todayIso, setTodayIso] = useState(() => toLocalISODate());
  useEffect(() => {
    const recheck = () => setTodayIso((prev) => {
      const now = toLocalISODate();
      return prev !== now ? now : prev;
    });
    const id = setInterval(recheck, 60000);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, []);
  return todayIso;
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

// THRESH/chart3dPct/CANDLE/grade/computeReadinessScore: spostate in
// ../lib/biometrics.js — modulo di calcolo dedicato (mai definizioni di
// logica di dominio dentro un componente UI da 12.000+ righe), esteso lì
// con HRV/RHR opzionali. Stessa formula, stesso comportamento: nessun
// cambiamento visibile, vedi biometrics.js per i dettagli e i test.

const READINESS_PART_ICON = { sleep: "😴", steps: "🚶", hrv: "🫀", rhr: "❤️", motivation: "🔥", fatigue: "🔋" };

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
        {/* BUG PRESO: non esisteva NESSUN modo di scollegare Google Fit una
            volta collegato — la funzione disconnectGoogleFit c'era già in
            googleFit.js ma non era mai richiamata da un pulsante. */}
        {connected && (
          <button
            onClick={() => { disconnectGoogleFit(); setConnected(false); }}
            className="mt-1 text-xs underline"
            style={{ color: "var(--ink-2)" }}
          >
            Scollega
          </button>
        )}
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
function LockedChartOverlay({ gender, onUpgrade, title, text, ctaLabel, onCtaClick }) {
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
          {text || "Passa al Premium (€5/mese) per analizzare i tuoi grafici storici stile Apple Salute e monitorare il recupero del Sistema Nervoso."}
        </p>
        {/* BUG PRESO: il bottone era SEMPRE "Scopri il Premium" + onUpgrade
            (apre le Impostazioni sull'abbonamento), anche nel caso "componente
            aggiuntivo" qui sotto — dove il testo sopra dice esplicitamente
            "parlane con il tuo coach" a chi ha GIÀ un piano di coaching reale
            (Scheda Personalizzata/Coaching Allenamento, sopra Premium). Un
            cliente pagante finiva su una schermata di upgrade che non
            c'entra nulla con quello che gli era stato appena detto di fare.
            ctaLabel/onCtaClick opzionali permettono a un chiamante di
            sovrascrivere testo e azione del bottone caso per caso. */}
        <button onClick={onCtaClick || onUpgrade} className="rounded-full px-5 py-2.5 text-sm transition-transform active:scale-95 btn-3d"
                style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
          {ctaLabel || "Scopri il Premium →"}
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
   · FREE → bloccata, upgrade a Premium.
   · Full Coaching → sbloccata sempre, inclusa nel piano.
   · Premium → sbloccata sempre (invariato, è il piano che vende
     proprio i grafici avanzati).
   · Scheda Personalizzata / Solo Allenamento Coaching → NON inclusa: è un
     componente aggiuntivo a pagamento separato (micro_addon su profiles,
     lo attiva il coach quando il cliente lo richiede/paga), diverso dal
     semplice upgrade di piano — copy e CTA dedicate. */
function MicronutrientGrid({ mealsBySlot, userPlan, gender, onUpgrade, onOpenChat, accent, waterMl, microAddon }) {
  if (userPlan === "free") {
    return (
      <div className="mt-4">
        <p className="label mb-2">Micronutrienti · target giornaliero</p>
        <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
          title="🔒 SBLOCCA IL LABORATORIO CHIMICO CELLULARE"
          text="Passa al Premium (€5/mese) per sbloccare l'analisi in tempo reale di Sodio, Potassio, Ferro, Calcio e Magnesio. Monitora le tue carenze croniche ed ottieni i consigli AI per prevenire crampi, ritenzione idrica sotto la pelle e svuotamento muscolare in palestra." />
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
          text="L'analisi di Sodio, Potassio, Ferro, Calcio e Magnesio non è inclusa nel tuo piano: è un componente a parte. Parlane con il tuo coach per attivarlo."
          ctaLabel="Scrivi al coach →" onCtaClick={onOpenChat} />
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
   e la grafica di quello dei clienti", richiesta esplicita.
   onClick (opzionale): drill-down — richiesta esplicita "facendo clic su
   un distretto specifico deve aprirsi un dettaglio che mostra esattamente
   quali esercizi e serie hanno generato quel volume totale". Quando
   passato, l'intera riga diventa un bottone (tap-friendly, non solo
   l'etichetta) — quando assente la barra resta un elemento puramente
   visivo com'era, invariata per chi non ha ancora un drill-down da offrire. */
export function VolumeBar({ muscle, direct, indirect, accent, onClick }) {
  const total = direct + indirect;
  const maxScale = 30;
  const dPct = Math.max(0, Math.min(100, (direct / maxScale) * 100));
  const iPct = Math.max(0, Math.min(100 - dPct, (indirect / maxScale) * 100));
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className="flex items-center gap-3 w-full text-left" style={onClick ? { background: "none" } : undefined}
         aria-label={onClick ? `Dettaglio volume ${muscle}` : undefined}>
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
    </Tag>
  );
}

/* Popup di dettaglio del volume di UN distretto: quali esercizi e quante
   serie (dirette al 100%, sinergiche al 50%) hanno generato il totale
   mostrato in barra — richiesta esplicita di drill-down sul grafico volumi.
   Stesso pattern di overlay di CompliancePopup più sopra in questo file. */
export function VolumeDrillModal({ muscle, contributions, accent, onClose }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
             backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)", overflowY: "auto" }} onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 overflow-y-auto"
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "88vh" }}
             onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <p className="h1">{muscle}</p>
            <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
          </div>
          <p className="meta mb-4">
            {contributions.length === 0
              ? "Nessun esercizio contribuisce a questo distretto questa settimana."
              : "Serie dirette (100%) e sinergiche (50%) per esercizio, questa settimana."}
          </p>
          <div className="space-y-2">
            {contributions.map((c) => {
              const total = c.directSets + c.indirectSets;
              return (
                <div key={c.exerciseName} className="inner flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.exerciseName}</span>
                  <span className="text-sm shrink-0" style={{ color: accent, fontWeight: 800 }}>
                    {Number.isInteger(total) ? total : total.toFixed(1)}
                    {c.indirectSets > 0 && (
                      <span className="meta ml-1.5" style={{ fontSize: "0.66rem", fontWeight: 600 }}>
                        ({c.directSets > 0 ? `${c.directSets} dirette + ` : ""}{c.indirectSets} sinergiche)
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Portal>
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

  // Drill-down (richiesta esplicita): tocca un distretto per vedere quali
  // esercizi/serie hanno generato quel totale — calcolato al volo solo per
  // il distretto aperto, mai per tutti e 15 ad ogni render.
  const [drillMuscle, setDrillMuscle] = useState(null);
  const drillContributions = useMemo(
    () => (drillMuscle ? computeVolumeContributions(weekDays, libOverride || lib, drillMuscle) : []),
    [drillMuscle, weekDays, lib, libOverride]
  );

  return (
    <div className="card mb-4">
      <p className="h1 mb-4">Volume settimanale per gruppo muscolare</p>

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
            text="Passa al Premium (€5/mese) per vedere l'istogramma dinamico in tempo reale dello stimolo settimanale sui 15 distretti muscolari." />
        </>
      ) : involved.length === 0 ? (
        <p className="meta">Aggiungi esercizi alla settimana per vedere la matrice popolarsi.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {involved.map((m) => (
              <VolumeBar key={m} muscle={m} direct={volume[m].direct} indirect={volume[m].indirect} accent={accent}
                         onClick={() => setDrillMuscle(m)} />
            ))}
          </div>
          <p className="meta mt-3" style={{ fontSize: "0.68rem" }}>
            Barra piena = serie dirette · barra chiara = stimolo indiretto (50% delle serie sui distretti sinergici) · tocca un distretto per il dettaglio
          </p>
        </>
      )}

      {drillMuscle && (
        <VolumeDrillModal muscle={drillMuscle} contributions={drillContributions} accent={accent} onClose={() => setDrillMuscle(null)} />
      )}
    </div>
  );
}

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

export function Window3D({ icon: Icon, label, sub, accent, floatClass, onClick, locked, onLocked, novelty }) {
  return (
    <button onClick={locked ? onLocked : onClick}
            className="card card-tap relative w-full text-left overflow-hidden flex items-center gap-3.5"
            style={{ padding: "1.1rem 1.25rem" }}
            aria-disabled={locked}>
      {novelty && (
        <span aria-hidden="true" className="absolute" style={{ top: 10, right: 12, width: 10, height: 10 }}>
          <span className="novelty-ping absolute inset-0 rounded-full" style={{ backgroundColor: "#E5484D" }} />
          <span className="absolute inset-0 rounded-full" style={{ backgroundColor: "#E5484D", boxShadow: "0 0 0 2px var(--surface)" }} />
        </span>
      )}
      <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${floatClass}`}
           style={{ background: "radial-gradient(circle at 32% 28%, #3A3A3A 0%, #111111 62%)",
                    boxShadow: `0 8px 18px rgba(0,0,0,0.28), inset 0 2px 3px rgba(255,255,255,0.18),
                                inset 0 -3px 6px rgba(0,0,0,0.55)` }}>
        <Icon size={21} style={{ color: accent, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="h2 flex items-center justify-between">
          {label}
          <ChevronRight size={17} style={{ color: "var(--ink-2)" }} />
        </p>
        {sub && <p className="meta mt-0.5">{sub}</p>}
      </div>

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
export function complianceHsl(pct) {
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
export function complianceTier(p) {
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

// Dati biometrici SOLO per l'anteprima demo (nessuna sessione reale): stesso
// principio delle altre costanti *_6D qui sopra, un valore plausibile fisso
// per mostrare il Bilancio energetico funzionante prima del login. In
// modalità reale questi non vengono mai usati — arrivano da anamnesi/check.
const DEMO_BIOMETRICS = { weightKg: 82, heightCm: 179, age: 29 };

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
/* Il cerchio Recupero è una media storica (7 giorni di sonno/passi): non
   sente ancora com'è oggi. La prontezza (computeReadinessScore) è invece il
   segnale di OGGI — pesa 30% sul cerchio, il resto resta lo storico, così un
   giorno eccellente/pessimo si vede subito ma non ribalta da solo una
   settimana intera. Se manca lo storico ma c'è la prontezza di oggi, il
   cerchio parte comunque da quella invece di restare "n/d". */
export function blendRecoveryWithReadiness(basePct, readiness) {
  if (!readiness) return basePct;
  if (basePct == null) return Math.round(readiness.score);
  return complPct(basePct * 0.7 + readiness.score * 0.3);
}
function nutritionPrecision(target, consumed) {
  const dims = ["kcal", "p", "c", "f"];
  const devs = dims.map((d) => (target[d] > 0 ? Math.min(1, Math.abs(consumed[d] - target[d]) / target[d]) : 0));
  return complPct((1 - devs.reduce((a, b) => a + b, 0) / dims.length) * 100);
}

/* Anello singolo: vivo, fluido, con lucentezza 3D (sheen + glow), colore
   continuo che si intensifica agli estremi.
   Redesign "strumento di misurazione seria" (non più solo gamification):
   tacche di graduazione ogni 10% come un quadrante analogico professionale,
   cifre in font-data (monospazio, tabular-nums — stesso carattere usato per
   XP e altri numeri "di precisione" nell'app) invece del font testuale
   normale, ed etichetta di stato in maiuscolo piccolo sotto la percentuale —
   nessuna emoji, nessun elemento giocoso: deve leggersi come lo strumento
   che misura le prestazioni di un atleta serio, non come un badge. */
export function ComplianceCircle({ pct, size = 76, stroke = 8 }) {
  // pct === null → nulla da misurare questa settimana (es. niente assegnato):
  // stato neutro esplicito, non un 0% (allarme) né un 100% (falso completo).
  const isNeutral = pct == null;
  const { h: ringH, s: ringS, l: ringL } = complianceHsl(pct ?? 0);
  const color = isNeutral ? "var(--ink-2)" : `hsl(${ringH.toFixed(0)}, ${ringS.toFixed(0)}%, ${ringL.toFixed(0)}%)`;
  // BUG PRESO (due tentativi prima di questo): un cerchio SEPARATO in tinta
  // chiara che gira lungo TUTTO l'anello (parte piena + parte vuota) veniva
  // letto come "una righetta grigia" — sia perché passava anche sopra il
  // tratto vuoto, sia perché una tinta troppo schiarita della stessa
  // tonalità finisce comunque per apparire desaturata/grigiastra su schermo
  // piccolo. Fix vero: niente elemento separato — il gradiente lucido è lo
  // STROKE STESSO dell'arco colorato (stessa tecnica di .xp-bar-shine, ma
  // via <linearGradient> perché gli SVG non supportano background-position
  // sullo stroke). Essendo lo stesso path con lo stesso strokeDasharray/
  // strokeDashoffset già usato per fermare l'arco a pct%, la brillantezza
  // finisce ESATTAMENTE dove finisce il colore — non un pixel oltre.
  const gradId = useId();
  const loL = Math.max(0, ringL - 14);
  const hiL = Math.min(97, ringL + 30);
  const hiS = Math.max(30, ringS - 12);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  const filledLen = c * (Math.max(0, Math.min(100, pct ?? 0)) / 100);
  // Tacche di graduazione ogni 10%, come un quadrante analogico: partono dal
  // 12 in punto (stesso riferimento -90° dell'arco) e girano in senso orario.
  // Radius leggermente più interno della traccia, così restano visibili
  // sotto l'arco colorato senza sporgere dal cerchio.
  const tickInner = r - stroke / 2 - 1;
  const tickOuter = tickInner - Math.max(2, size * 0.045);
  const ticks = Array.from({ length: 10 }, (_, i) => {
    const angle = ((i * 36 - 90) * Math.PI) / 180;
    return {
      x1: cx + tickOuter * Math.cos(angle), y1: cy + tickOuter * Math.sin(angle),
      x2: cx + tickInner * Math.cos(angle), y2: cy + tickInner * Math.sin(angle),
    };
  });
  return (
    <div className="relative shrink-0 ring-breathe" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {!isNeutral && (
          <>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor={`hsl(${ringH.toFixed(0)}, ${ringS.toFixed(0)}%, ${loL.toFixed(0)}%)`} />
                <stop offset="35%" stopColor={color} />
                <stop offset="50%" stopColor={`hsl(${ringH.toFixed(0)}, ${hiS.toFixed(0)}%, ${hiL.toFixed(0)}%)`} />
                <stop offset="65%" stopColor={color} />
                <stop offset="100%" stopColor={`hsl(${ringH.toFixed(0)}, ${ringS.toFixed(0)}%, ${loL.toFixed(0)}%)`} />
                <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="2.6s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
            <circle className="ring-glow-pulse" cx={cx} cy={cy} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c - filledLen} transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.22,1,.36,1)" }} />
          </>
        )}
        {isNeutral && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={Math.max(1.5, stroke * 0.3)}
                  strokeDasharray="4 5" strokeOpacity="0.55" />
        )}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--page)" strokeWidth={1} strokeOpacity={0.7} strokeLinecap="round" />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-data" style={{ fontSize: size > 60 ? "1.05rem" : "0.85rem", fontWeight: 700, color: isNeutral ? "var(--ink-2)" : "var(--ink)", transition: "color 0.3s ease", lineHeight: 1 }}>
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
        return (
          <button key={r.id} onClick={() => onSelect(r.id)}
                  className="flex flex-col items-center gap-2 transition-transform active:scale-95">
            <ComplianceCircle pct={r.pct} />
            <span className="text-xs text-center" style={{ color: "var(--ink-2)", fontWeight: 700, opacity: 0.7 }}>
              {r.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Popup analitico a comparsa, stile Instagram: si apre dal basso, sfondo
   sfumato, dettaglio del singolo reparto in un colpo d'occhio. */
/* Il punteggio di prontezza (vedi computeReadinessScore più sopra) vive qui
   dentro, non più come card separata in Home: è il segnale di OGGI che
   spiega perché il cerchio Recupero è quello che è (ci contribuisce
   direttamente, vedi blendRecoveryWithReadiness), quindi il suo dettaglio
   appartiene al popup del cerchio Recupero. */
function CompliancePopup({ ring, onClose, readiness }) {
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
          {ring.insight && (
            <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <p className="text-sm" style={{ color: "var(--ink)", lineHeight: 1.5, fontWeight: 500 }}>{ring.insight}</p>
            </div>
          )}
          {ring.id === "recovery" && readiness && (
            <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm" style={{ fontWeight: 700, color: "var(--ink)" }}>Prontezza di oggi</span>
                <span className="font-data" style={{ fontSize: "0.95rem", fontWeight: 800, color: CANDLE[readiness.tone].label }}>
                  {readiness.score}/100
                </span>
              </div>
              <p className="meta" style={{ lineHeight: 1.4 }}>
                {readiness.label} · {readiness.parts.map((p) => `${READINESS_PART_ICON[p.key] || ""} ${p.label}`).join(" · ")}
                {readiness.penaltyApplied && " · dolore/stress recenti considerati"}
              </p>
              <p className="meta mt-1.5" style={{ fontSize: "0.62rem" }}>
                Contribuisce al {"Recupero"} di oggi insieme alla media di sonno e passi degli ultimi 7 giorni.
              </p>
            </div>
          )}
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

/* Mappa di tutti i gradi (tier da 5 sotto-livelli ciascuno, LEVEL_TIERS in
   coachingData.js): mostra la soglia XP di ingresso di ognuno, in ordine,
   col grado attuale evidenziato — motiva a vedere quanto manca al prossimo
   invece di scoprirlo un livello alla volta. */
function LevelRoadmapModal({ currentXp, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  const currentInfo = xpToLevelInfo(currentXp);
  const currentTierIdx = Math.min(Math.floor(currentInfo.level / LEVELS_PER_TIER), LEVEL_TIERS.length - 1);
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
             backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)", overflowY: "auto" }} onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 overflow-y-auto"
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "88vh" }}
             onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-center justify-between mb-1">
              <p className="h1">Tutti i gradi</p>
              <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
            </div>
            <p className="meta mb-4">{currentInfo.xp.toLocaleString("it-IT")} XP totali</p>
          </div>
          <div className="space-y-2">
            {/* Nomi dei gradi (Neofita/Intermedio/...) rimossi — ogni riga
                mostra ora il range di livelli numerici che copre, coerente
                col resto dell'app dopo la rimozione dei nomi. */}
            {LEVEL_TIERS.map((tier, i) => {
              const startXp = levelMinXp(i * LEVELS_PER_TIER);
              const isCurrent = i === currentTierIdx;
              const isPast = i < currentTierIdx;
              const rangeStart = i * LEVELS_PER_TIER + 1;
              const rangeEnd = rangeStart + LEVELS_PER_TIER - 1;
              // Ricompensa di livello (LEVEL_REWARDS, richiesta esplicita):
              // ogni grado nella roadmap mostra anche COSA sblocca, non solo
              // la soglia XP — l'incentivo diventa concreto, non solo un nome.
              const reward = LEVEL_REWARDS.find((r) => r.level === rangeStart);
              const rewardUnlocked = (currentInfo.level + 1) >= rangeStart;
              return (
                <div key={i} className="inner flex items-center justify-between gap-3 px-4 py-3"
                     style={isCurrent ? { border: `1.5px solid var(--ink)` } : undefined}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="min-w-0">
                      <span className="text-sm truncate block" style={{ color: isPast || isCurrent ? "var(--ink)" : "var(--ink-2)", fontWeight: isCurrent ? 700 : 500 }}>
                        {isCurrent ? `Livello ${currentInfo.level + 1}` : `Livello ${rangeStart}–${rangeEnd}`}
                      </span>
                      {reward && (
                        <span className="block mt-0.5" style={{ fontSize: "0.68rem", color: rewardUnlocked ? "var(--ink-2)" : "var(--ink-tertiary)" }}>
                          {reward.icon} {reward.title}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="font-data text-xs shrink-0" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
                    {isCurrent ? "Ora" : `${startXp.toLocaleString("it-IT")} XP`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="meta mt-4 leading-relaxed" style={{ fontSize: "0.72rem" }}>
            Ogni grado ha 5 livelli: superato l'ultimo si passa automaticamente al grado successivo, senza un tetto massimo.
          </p>
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
  // BUG PRESO: il testo usava .title-shine (gradiente background-clip:text
  // che legge --title-a/b/c dall'inline style di .app-root) — quando quelle
  // variabili non erano ancora disponibili nel punto esatto in cui il Portal
  // viene montato, il testo restava senza alcun colore di fallback (nero su
  // uno sfondo quasi nero, illeggibile). Colori ora fissi e garantiti,
  // indipendenti da qualunque variabile ereditata.
  return (
    <Portal>
      <div key={toast.key} className="xp-toast-wrap" aria-live="polite">
        <div className="xp-toast">
          <Sparkles size={15} style={{ color: "#F3E5AB" }} />
          <span style={{ color: "#F3E5AB", fontWeight: 800 }}>+{toast.amount} XP</span>
          <span className="xp-toast-label" style={{ color: "#FFFFFF" }}>{toast.label}</span>
        </div>
      </div>
    </Portal>
  );
}

/* Celebrazione automatica di un nuovo PR (record personale): stesso identico
   meccanismo/CSS di XpToastBanner qui sopra (Portal, stessa animazione
   xpToastPop), niente libreria di confetti — appare da sola non appena una
   serie appena spuntata batte il carico massimo storico di quell'esercizio. */
function PRCelebrationToast({ toast }) {
  if (!toast) return null;
  return (
    <Portal>
      <div key={toast.key} className="xp-toast-wrap" aria-live="polite">
        <div className="xp-toast" style={{ background: "rgba(140,110,20,0.94)" }}>
          <span aria-hidden="true">🎉</span>
          <span style={{ color: "#FFFFFF", fontWeight: 800 }}>Nuovo record</span>
          <span className="xp-toast-label" style={{ color: "#FFFFFF" }}>
            {toast.exerciseName}: {toast.prevBest} → {toast.kg} kg
          </span>
        </div>
      </div>
    </Portal>
  );
}

/* Spiegazione dello streak, aperta toccando il numero in Home (prima stava
   scritto per esteso accanto al fuoco — "X Giorni di Streak" — ripulito per
   una Home più professionale: qui il numero grande basta, il significato si
   scopre solo se serve). Contiene anche "Congela streak di oggi", spostato
   qui dentro invece di stare sempre visibile sotto il fuoco. */
function StreakInfoModal({ streak, supabase, userId, accent, level, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6"
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
             onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-center justify-between mb-1">
              <p className="h1">Streak</p>
              <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
            </div>
          </div>
          <p className="flex items-center gap-2 my-4" style={{ fontSize: "2rem", fontWeight: 800, color: "var(--ink)" }}>
            <Flame size={26} style={{ color: accent }} fill={accent} strokeWidth={1.4} />
            {streak}
          </p>
          <p className="body mb-4" style={{ lineHeight: 1.5 }}>
            Giorni consecutivi in cui hai registrato qualcosa — un allenamento, un pasto, sonno e passi. Se ti
            dimentichi un giorno hai fino a tutto il giorno dopo per recuperarlo prima che si azzeri davvero.
          </p>
          {supabase && userId && <StreakFreezeButton supabase={supabase} userId={userId} accent={accent} level={level} />}
        </div>
      </div>
    </Portal>
  );
}

/* "Streak freeze" (SCHEMA_v58): congela lo streak di oggi senza bisogno di
   un coach — a differenza della Pausa/Vacanza (PauseSection, riservata a chi
   ha un coaching reale e richiede una richiesta), disponibile a TUTTI i
   piani, con un tetto di 2 congelamenti ogni 30 giorni per non svuotare di
   significato lo streak. */
function StreakFreezeButton({ supabase, userId, accent, level }) {
  const [status, setStatus] = useState(null); // { remaining, usedToday, cap }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Ricompensa di livello (LEVEL_REWARDS, coachingData.js): il tetto cresce
  // con il livello reale del cliente, non più fisso a 2 — vedi
  // freezeBonusForLevel.
  const load = useCallback(() => {
    fetchStreakFreezeStatus(supabase, userId, level)
      .then(setStatus)
      .catch((err2) => console.error("PERFORM: errore lettura streak freeze", err2));
  }, [supabase, userId, level]);
  useEffect(() => { load(); }, [load]);

  if (!status) return null;

  const handleFreeze = () => {
    setBusy(true);
    setErr("");
    useStreakFreezeToday(supabase, userId)
      .then(() => load())
      .catch((err2) => { console.error("PERFORM: errore congelamento streak", err2); setErr("Non sono riuscito a congelare lo streak di oggi."); })
      .finally(() => setBusy(false));
  };

  return (
    <div className="mt-2">
      <button onClick={handleFreeze} disabled={busy || status.usedToday || status.remaining === 0}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs"
        style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)",
                 opacity: (status.usedToday || status.remaining === 0) ? 0.6 : 1, fontWeight: 600 }}>
        <span style={{ color: "var(--ink)" }}>🧊 {status.usedToday ? "Streak congelato oggi" : "Congela streak di oggi"}</span>
        <span style={{ color: "var(--ink-2)" }}>{status.remaining}/{status.cap} rimasti (30 giorni)</span>
      </button>
      {err && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{err}</p>}
    </div>
  );
}

/* Input vocale per il diario alimentare (Web Speech API, nessun servizio
   terzo/chiave a pagamento): detta il nome dell'alimento invece di digitarlo,
   il testo riconosciuto sostituisce la query di ricerca — da lì in poi è la
   stessa identica ricerca testuale già esistente (catalogo locale + Open Food
   Facts). Non supportato da tutti i browser (in particolare Safari iOS):
   nessun pulsante mostrato quando l'API non esiste, mai un finto controllo
   che non farebbe nulla. */
function VoiceSearchButton({ onTranscript, lang = "it-IT" }) {
  const [listening, setListening] = useState(false);
  const [unsupported] = useState(() => typeof window === "undefined" || !(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recRef = useRef(null);

  useEffect(() => () => { try { recRef.current?.stop(); } catch (err) { /* già fermo */ } }, []);

  if (unsupported) return null;

  const toggle = () => {
    if (listening) { recRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onTranscript(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch (err) { setListening(false); }
  };

  return (
    <button type="button" onClick={toggle} aria-label={listening ? "Ferma dettatura" : "Detta il nome dell'alimento"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors">
      {listening
        ? <MicOff size={16} style={{ color: "#DC2626" }} className="animate-pulse" />
        : <Mic size={16} style={{ color: "var(--ink-2)" }} />}
    </button>
  );
}

/* Anima un numero intero dal suo valore precedente al nuovo, invece di un
   salto istantaneo — usata dalla barra XP per dare un feedback visivo
   "conta in su" quando si sbloccano punti, non solo il toast. Nessuna
   dipendenza esterna: un semplice requestAnimationFrame con easing. */
function useCountUp(value, durationMs = 900) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quadratico
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return display;
}

/* ============================================================================
   5 · HOME DASHBOARD
   ========================================================================== */

/* Saluto dinamico in base all'orario locale del dispositivo. */

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buongiorno" };
  if (h >= 12 && h < 18) return { text: "Buon pomeriggio" };
  return { text: "Buonasera" };
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

/* ============================================================================
   GUIDA INTERATTIVA PERFORM — v2: spotlight reale sugli elementi della Home
   (richiesta esplicita: "rendi la guida interattiva, non pagine da mandare
   avanti ma cosa cliccare/inserirci dentro schermate dell'app"). La v1 era
   comunque solo una sequenza di slide astratte, una diversa dall'altra ma
   sempre lette-e-premi-Avanti — questa punta un vero ritaglio (spotlight)
   sopra un elemento REALE della Home già montato sullo schermo (cerchi di
   compliance, streak, barra XP, le 4 card di sezione, il tab Chat in bottom
   nav) invece di un'icona generica in una schermata a parte. Ogni step porta
   un `target` (attributo data-tour sull'elemento vero, vedi più sotto per i
   punti di aggancio) o resta senza (welcome/chiusura, card centrata). Un
   target mai trovato (elemento non montato per quel piano) fa avanzare da
   solo lo step dopo una breve attesa — mai un buco a schermo vuoto. Mostrata
   UNA sola volta, subito dopo l'onboarding (guide_tour_completed,
   SCHEMA_v70), diversa per ognuno dei 5 piani come già in v1. */
const GUIDE_BOT_ICON = MessageCircle;

// Contenuto specifico per piano: ognuno vede SOLO le funzioni che ha
// davvero (Free non ha una chat col coach da mostrare, Full Coaching ha
// dieta ON/OFF e sostituzioni automatiche che Free non vede mai). L'ultimo
// step di ogni sequenza è sempre la chiusura/CTA, con testo diverso a
// seconda che ci sia già un upsell sensato da proporre o no.
const GUIDE_TOUR_STEPS = {
  free: [
    { icon: GUIDE_BOT_ICON, kicker: "La tua guida rapida", title: "Ciao! Sono qui per orientarti.",
      body: "Ti mostro le funzioni principali di PERFORM direttamente sulla tua Home: tocca Avanti e ti indico dove sono, una alla volta. Si può saltare in qualsiasi momento." },
    { icon: Flame, kicker: "Home", target: "compliance", title: "I 3 cerchi raccontano la tua settimana.",
      body: "Allenamento, Alimentazione e Recupero: ognuno è una percentuale calcolata sui tuoi ultimi giorni reali. Toccane uno per vedere il dettaglio — non sono solo un numero, spiegano il perché." },
    { icon: Dumbbell, kicker: "Allenamento", target: "card-workout", title: "Costruisci la tua routine libera.",
      body: "Tocca questa card per aprire \"La Mia Routine\" e scegliere tu gli esercizi giorno per giorno. Segna carico e reps mentre alleni: si salva da sola, niente da confermare." },
    { icon: Salad, kicker: "Alimentazione", target: "card-nutrition", title: "Diario libero e target personalizzabile.",
      body: "Da qui registri i pasti nel Diario Libero e imposti tu il tuo target calorico/macro in cima alla pagina — puoi cambiarlo quando vuoi." },
    { icon: BedDouble, kicker: "Recupero & Integrazione", target: "card-recovery", title: "Sonno, passi e integratori.",
      body: "Registrali ogni giorno da qui e dalla card Integrazione qui sotto: alimentano il cerchio Recupero e ti aiutano a capire quando serve rallentare." },
    { icon: Trophy, kicker: "Streak e livelli", target: "xp", title: "Ogni giorno registrato conta.",
      body: "Anche solo un pasto segnato mantiene viva la streak (il numero accanto alla fiamma). Tocca questa barra quando vuoi per vedere quanto manca al prossimo livello — trofei e storico li trovi nel tuo Profilo." },
    { icon: Newspaper, kicker: "News & Tips", target: "news-feed", tab: "news", title: "Contenuti scientifici, non chiacchiere.",
      body: "Articoli su allenamento e alimentazione, tradotti e spiegati in modo semplice. Salva quelli utili nella tua Cassaforte personale per ritrovarli quando vuoi." },
    { icon: Medal, kicker: "Classifica", target: "ranking-podium", tab: "ranking", title: "Ti alleni, guadagni XP, scali la classifica.",
      body: "Confrontati con la community PERFORM: ogni allenamento e pasto registrato ti fa salire. Un modo in più per restare motivato ogni giorno." },
    { icon: User, kicker: "Profilo", target: "profile-identity", tab: "profile", title: "Livello, XP e i tuoi progressi in un colpo d'occhio.",
      body: "Qui trovi il tuo Archivio Check, i trofei guadagnati e puoi modificare foto e bio quando vuoi." },
    { icon: Settings, kicker: "Impostazioni", target: "header-settings", tab: "home", title: "Sempre a portata di tocco.",
      body: "La rotella in alto ti segue su ogni schermata: da qui gestisci abbonamento, notifiche, tema chiaro/scuro e account." },
    { icon: Sparkles, kicker: "Pronto a iniziare", title: "Comincia da qui.",
      body: "Con un piano a pagamento sblocchi grafici storici avanzati, la guida biomeccanica di ogni esercizio e — dalla Scheda Personalizzata in su — un coach vero che segue i tuoi progressi. Vedi gli abbonamenti quando vuoi, dalle Impostazioni." },
  ],
  performance_pack: [
    { icon: GUIDE_BOT_ICON, kicker: "La tua guida rapida", title: "Ciao! Sono qui per orientarti.",
      body: "Ti mostro le funzioni principali di PERFORM Premium direttamente sulla tua Home: tocca Avanti e ti indico dove sono, una alla volta. Si può saltare in qualsiasi momento." },
    { icon: Flame, kicker: "Home", target: "compliance", title: "I 3 cerchi raccontano la tua settimana.",
      body: "Allenamento, Alimentazione e Recupero: ognuno è una percentuale calcolata sui tuoi ultimi giorni reali. Toccane uno per vedere il dettaglio." },
    { icon: Dumbbell, kicker: "Allenamento", target: "card-workout", title: "Routine libera + guida a ogni esercizio.",
      body: "Tocca questa card per costruire la tua scheda in \"La Mia Routine\": per ogni esercizio hai anche la guida biomeccanica (come eseguirlo, cosa evitare) e la Wiki Allenamento con i principi scientifici dietro un piano che funziona." },
    { icon: Salad, kicker: "Alimentazione", target: "card-nutrition", title: "Diario, sostituzioni e micronutrienti.",
      body: "Oltre al Diario Libero, le Sostituzioni trovano al volo l'alimento equivalente per macro se ti manca qualcosa, e l'analisi in tempo reale di Sodio/Potassio/Ferro/Calcio/Magnesio ti segnala le carenze croniche." },
    { icon: History, kicker: "Recupero", target: "card-recovery", title: "Grafici storici stile Apple Salute.",
      body: "Tocca questa card: sonno, passi, HRV — l'andamento nel tempo, non solo il numero di oggi." },
    { icon: Trophy, kicker: "Streak e livelli", target: "xp", title: "Ogni giorno registrato conta.",
      body: "Anche solo un pasto segnato mantiene viva la streak. Tocca questa barra per vedere il tuo progresso — livelli e trofei li trovi nel tuo Profilo." },
    { icon: Newspaper, kicker: "News & Tips", target: "news-feed", tab: "news", title: "Contenuti scientifici, non chiacchiere.",
      body: "Articoli su allenamento e alimentazione, tradotti e spiegati in modo semplice. Salva quelli utili nella tua Cassaforte personale per ritrovarli quando vuoi." },
    { icon: Medal, kicker: "Classifica", target: "ranking-podium", tab: "ranking", title: "Ti alleni, guadagni XP, scali la classifica.",
      body: "Confrontati con la community PERFORM: ogni allenamento e pasto registrato ti fa salire. Un modo in più per restare motivato ogni giorno." },
    { icon: User, kicker: "Profilo", target: "profile-identity", tab: "profile", title: "Livello, XP e i tuoi progressi in un colpo d'occhio.",
      body: "Qui trovi il tuo Archivio Check, i trofei guadagnati e puoi modificare foto e bio quando vuoi." },
    { icon: Settings, kicker: "Impostazioni", target: "header-settings", tab: "home", title: "Sempre a portata di tocco.",
      body: "La rotella in alto ti segue su ogni schermata: da qui gestisci abbonamento, notifiche, tema chiaro/scuro e account." },
    { icon: Sparkles, kicker: "Pronto a iniziare", title: "Comincia da qui.",
      body: "Se vuoi una scheda costruita su misura da un coach vero, con follow-up diretto, dalla Scheda Personalizzata in su hai anche quello. Vedi gli abbonamenti quando vuoi, dalle Impostazioni." },
  ],
  scheda_personalizzata: [
    { icon: GUIDE_BOT_ICON, kicker: "La tua guida rapida", title: "Ciao! Sono qui per orientarti.",
      body: "Ti mostro come sfruttare al meglio la tua Scheda Personalizzata direttamente sulla tua Home. Si può saltare in qualsiasi momento." },
    { icon: Flame, kicker: "Home", target: "compliance", title: "I 3 cerchi raccontano la tua settimana.",
      body: "Allenamento, Alimentazione e Recupero: percentuali calcolate sui tuoi ultimi giorni reali. Toccane uno per il dettaglio." },
    { icon: Dumbbell, kicker: "Allenamento", target: "card-workout", title: "La scheda costruita dal coach è qui.",
      body: "Tocca questa card: trovi gli esercizi assegnati sui tuoi obiettivi reali, non una scheda generica. Segna carico e reps mentre alleni: si salva da sola." },
    { icon: MessageCircle, kicker: "Chat privata", target: "nav-chat", title: "Il coach è a un messaggio di distanza.",
      body: "Per le prime settimane hai una chat privata diretta col coach, qui in basso: usala per dubbi su esecuzione, dolori o qualsiasi cosa nella scheda non torni." },
    { icon: Salad, kicker: "Alimentazione & Integrazione", target: "card-nutrition", title: "Restano autogestite, come nel Diario Libero.",
      body: "Diario pasti (qui) e integratori (nella card Integrazione qui sotto) li registri tu — se in futuro vuoi anche il piano alimentare costruito dal coach, lo trovi tra gli abbonamenti a coaching completo." },
    { icon: Trophy, kicker: "Streak e livelli", target: "streak", title: "Ogni giorno registrato conta.",
      body: "Anche solo un pasto segnato mantiene viva questa fiamma. Livelli e trofei nel tuo Profilo." },
    { icon: Newspaper, kicker: "News & Tips", target: "news-feed", tab: "news", title: "Contenuti scientifici, non chiacchiere.",
      body: "Articoli su allenamento e alimentazione, tradotti e spiegati in modo semplice. Salva quelli utili nella tua Cassaforte personale per ritrovarli quando vuoi." },
    { icon: Medal, kicker: "Classifica", target: "ranking-podium", tab: "ranking", title: "Ti alleni, guadagni XP, scali la classifica.",
      body: "Confrontati con la community PERFORM: ogni allenamento e pasto registrato ti fa salire. Un modo in più per restare motivato ogni giorno." },
    { icon: User, kicker: "Profilo", target: "profile-identity", tab: "profile", title: "Livello, XP e i tuoi progressi in un colpo d'occhio.",
      body: "Qui trovi il tuo Archivio Check, i trofei guadagnati e puoi modificare foto e bio quando vuoi." },
    { icon: Settings, kicker: "Impostazioni", target: "header-settings", tab: "home", title: "Sempre a portata di tocco.",
      body: "La rotella in alto ti segue su ogni schermata: da qui gestisci abbonamento, notifiche, tema chiaro/scuro e account." },
    { icon: Sparkles, kicker: "Pronto a iniziare", title: "Comincia da qui.",
      body: "Buon lavoro — il coach legge davvero quello che registri per calibrare i tuoi prossimi allenamenti." },
  ],
  training: [
    { icon: GUIDE_BOT_ICON, kicker: "La tua guida rapida", title: "Ciao! Sono qui per orientarti.",
      body: "Ti mostro come sfruttare al meglio il tuo Coaching Allenamento direttamente sulla tua Home. Si può saltare in qualsiasi momento." },
    { icon: Flame, kicker: "Home", target: "compliance", title: "I 3 cerchi raccontano la tua settimana.",
      body: "Allenamento, Alimentazione e Recupero: percentuali calcolate sui tuoi ultimi giorni reali. Toccane uno per il dettaglio." },
    { icon: Dumbbell, kicker: "Allenamento", target: "card-workout", title: "Scheda aggiornata in continuo, mai statica.",
      body: "Tocca questa card: il coach la fa evolvere settimana dopo settimana sui tuoi progressi reali. Segna carico e reps mentre alleni, e guarda il grafico Volume settimanale per capire dove stai lavorando di più." },
    { icon: MessageCircle, kicker: "Chat privata", target: "nav-chat", title: "Il coach è sempre a un messaggio di distanza.",
      body: "Chat diretta qui in basso, attiva per tutta la durata dell'abbonamento — usala per dubbi su esecuzione, dolori o qualunque correzione." },
    { icon: CheckCircle2, kicker: "Check settimanale", title: "Peso e sensazioni, ogni settimana.",
      body: "Compilalo quando te lo propone l'app: è quello che il coach legge per capire se serve scaricare, spingere di più, o cambiare rotta." },
    { icon: Trophy, kicker: "Streak e livelli", target: "streak", title: "Ogni giorno registrato conta.",
      body: "Anche solo un pasto segnato mantiene viva questa fiamma. Livelli e trofei nel tuo Profilo." },
    { icon: Newspaper, kicker: "News & Tips", target: "news-feed", tab: "news", title: "Contenuti scientifici, non chiacchiere.",
      body: "Articoli su allenamento e alimentazione, tradotti e spiegati in modo semplice. Salva quelli utili nella tua Cassaforte personale per ritrovarli quando vuoi." },
    { icon: Medal, kicker: "Classifica", target: "ranking-podium", tab: "ranking", title: "Ti alleni, guadagni XP, scali la classifica.",
      body: "Confrontati con la community PERFORM: ogni allenamento e pasto registrato ti fa salire. Un modo in più per restare motivato ogni giorno." },
    { icon: User, kicker: "Profilo", target: "profile-identity", tab: "profile", title: "Livello, XP e i tuoi progressi in un colpo d'occhio.",
      body: "Qui trovi il tuo Archivio Check, i trofei guadagnati e puoi modificare foto e bio quando vuoi." },
    { icon: Settings, kicker: "Impostazioni", target: "header-settings", tab: "home", title: "Sempre a portata di tocco.",
      body: "La rotella in alto ti segue su ogni schermata: da qui gestisci abbonamento, notifiche, tema chiaro/scuro e account." },
    { icon: Sparkles, kicker: "Pronto a iniziare", title: "Comincia da qui.",
      body: "Hai un coach vero che segue i tuoi progressi passo passo — più registri con costanza, più preciso può essere il suo lavoro." },
  ],
  full_coaching: [
    { icon: GUIDE_BOT_ICON, kicker: "La tua guida rapida", title: "Ciao! Sono qui per orientarti.",
      body: "Ti mostro come sfruttare al meglio il tuo Full Coaching direttamente sulla tua Home. Si può saltare in qualsiasi momento." },
    { icon: Flame, kicker: "Home", target: "compliance", title: "I 3 cerchi raccontano la tua settimana.",
      body: "Allenamento, Alimentazione e Recupero: percentuali calcolate sui tuoi ultimi giorni reali. Toccane uno per il dettaglio." },
    { icon: Dumbbell, kicker: "Allenamento", target: "card-workout", title: "Scheda aggiornata in continuo, mai statica.",
      body: "Tocca questa card: il coach la fa evolvere settimana dopo settimana sui tuoi progressi reali. Segna carico e reps mentre alleni." },
    { icon: Salad, kicker: "Alimentazione", target: "card-nutrition", title: "Dieta calcolata su misura, ON/OFF.",
      body: "Il coach imposta un target diverso per i giorni di allenamento e di riposo. Se ti manca un alimento, le Sostituzioni trovano al volo l'equivalente per macro — il piano resta in target senza rifare i calcoli a mano." },
    { icon: Pill, kicker: "Integrazione", target: "card-supplements", title: "Protocollo assegnato dal coach.",
      body: "Tocca questa card: trovi cosa prendere, quando e perché — spuntalo ogni giorno, il coach lo vede." },
    { icon: MessageCircle, kicker: "Chat privata", target: "nav-chat", title: "Il coach è sempre a un messaggio di distanza.",
      body: "Chat diretta qui in basso e check settimanale (peso e sensazioni): è così che il coach calibra ogni cosa sui tuoi progressi reali, non su un piano scritto una volta e dimenticato." },
    { icon: Trophy, kicker: "Streak e livelli", target: "streak", title: "Ogni giorno registrato conta.",
      body: "Anche solo un pasto segnato mantiene viva questa fiamma. Livelli e trofei nel tuo Profilo." },
    { icon: Newspaper, kicker: "News & Tips", target: "news-feed", tab: "news", title: "Contenuti scientifici, non chiacchiere.",
      body: "Articoli su allenamento e alimentazione, tradotti e spiegati in modo semplice. Salva quelli utili nella tua Cassaforte personale per ritrovarli quando vuoi." },
    { icon: Medal, kicker: "Classifica", target: "ranking-podium", tab: "ranking", title: "Ti alleni, guadagni XP, scali la classifica.",
      body: "Confrontati con la community PERFORM: ogni allenamento e pasto registrato ti fa salire. Un modo in più per restare motivato ogni giorno." },
    { icon: User, kicker: "Profilo", target: "profile-identity", tab: "profile", title: "Livello, XP e i tuoi progressi in un colpo d'occhio.",
      body: "Qui trovi il tuo Archivio Check, i trofei guadagnati e puoi modificare foto e bio quando vuoi." },
    { icon: Settings, kicker: "Impostazioni", target: "header-settings", tab: "home", title: "Sempre a portata di tocco.",
      body: "La rotella in alto ti segue su ogni schermata: da qui gestisci abbonamento, notifiche, tema chiaro/scuro e account." },
    { icon: Sparkles, kicker: "Pronto a iniziare", title: "Comincia da qui.",
      body: "Hai tutto il necessario e un coach vero che segue ogni aspetto del tuo percorso — più registri con costanza, più preciso può essere il suo lavoro." },
  ],
};

// Rimisura il rettangolo del bersaglio reale (data-tour="<id>") a ogni
// cambio di step, e lo tiene aggiornato su resize/scroll — un piccolo
// intervallo di sicurezza (elementi che montano/animano con un attimo di
// ritardo, es. novità/badge) invece di un MutationObserver, per restare
// semplice su una guida mostrata una volta sola e per pochi secondi.
function useTourTargetRect(targetId) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!targetId) { setRect(null); return undefined; }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${targetId}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = setInterval(measure, 300);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); clearInterval(id); };
  }, [targetId]);
  return rect;
}

// Ritaglio "spotlight" sopra l'overlay scuro: lo stesso trucco CSS di
// qualunque coachmark tour (box-shadow enorme invece del target reale),
// pointer-events:none così i tap nell'area evidenziata restano gestiti
// dall'overlay sotto (la guida avanza al tocco, l'elemento reale non è
// interagibile finché la guida è aperta — evita azioni reali involontarie,
// es. aprire un upsell su una card bloccata, mentre si sta solo spiegando).
function TourSpotlight({ rect }) {
  if (!rect) return null;
  const pad = 8;
  return (
    <div className="fixed pointer-events-none spring-in" aria-hidden="true"
      style={{
        top: rect.top - pad, left: rect.left - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        borderRadius: 18, boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
        border: "2px solid #C5A059", zIndex: 90,
        transition: "top 240ms ease, left 240ms ease, width 240ms ease, height 240ms ease",
      }} />
  );
}

/* Guida interattiva PERFORM: fumetto ancorato al bersaglio reale (sotto se
   c'è spazio, altrimenti sopra) quando lo step ha un target, altrimenti
   card centrata (welcome/chiusura) — stessa identità visiva della v1 e di
   AppIntroTutorial (11_OnboardingFlow.jsx): icona in cerchio sfumato,
   kicker, title-shine, corpo breve, dots di avanzamento. Mostrata una sola
   volta (guide_tour_completed, SCHEMA_v70) subito dopo l'onboarding.
   onFinish marca il flag sia al completamento sia al salto: chi salta ha
   scelto di saltare, non va ripresentata al prossimo accesso. */
function SpotlightTour({ plan, gender, onFinish, onNavigateTab }) {
  const steps = GUIDE_TOUR_STEPS[plan] || GUIDE_TOUR_STEPS.free;
  const [step, setStep] = useState(0);
  const last = step === steps.length - 1;
  const s = steps[step];
  const Icon = s.icon;
  const isFemale = gender === "F";
  const accentColor = isFemale ? "#D4A5A5" : "#C5A059";
  const rect = useTourTargetRect(s.target);

  const next = useCallback(() => setStep((n) => Math.min(n + 1, steps.length - 1)), [steps.length]);

  // Step con `tab`: News/Classifica/Profilo vivono su un altro tab, non sulla
  // Home. AppShell tiene ogni tab visitato montato (solo display:none sugli
  // inattivi, mai smontato) — cambiare tab qui non fa perdere il Portal della
  // guida, che resta ancorato dentro l'albero Home. onNavigateTab è lo stesso
  // callback già passato come onOpenChat (setTab di App.jsx).
  useEffect(() => {
    if (s.tab && onNavigateTab) onNavigateTab(s.tab);
  }, [step, s.tab, onNavigateTab]);

  // Un target mai trovato (elemento non montato per questo piano/stato, es.
  // Recupero bloccato per Free) non deve bloccare la guida a metà: dopo una
  // breve attesa si passa avanti da soli invece di restare su un overlay
  // scuro senza ritaglio e senza spiegazione. Uno step che ha appena cambiato
  // tab ha bisogno di più tempo (es. Classifica è lazy-loaded via
  // React.lazy: deve ancora scaricarsi e montare al primo utilizzo).
  useEffect(() => {
    if (!s.target || rect) return undefined;
    const t = setTimeout(() => { if (!last) next(); }, s.tab ? 2600 : 1200);
    return () => clearTimeout(t);
  }, [step, s.target, s.tab, rect, last, next]);

  const cardWidth = 320;
  const pos = (() => {
    if (!rect) return null;
    const vh = window.innerHeight, vw = window.innerWidth;
    const cardHeight = 220;
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow > cardHeight + 24 || spaceBelow > rect.top;
    const top = placeBelow
      ? Math.min(rect.bottom + 14, vh - cardHeight - 16)
      : Math.max(16, rect.top - cardHeight - 14);
    const left = Math.min(Math.max(16, rect.left), vw - cardWidth - 16);
    return { top, left };
  })();

  // Chi salta o finisce la guida da un altro tab (News/Classifica/Profilo)
  // torna sulla Home: la guida è partita lì, non deve lasciare l'utente su
  // uno step di passaggio senza spiegazione.
  const finishAndReturnHome = () => { if (onNavigateTab) onNavigateTab("home"); onFinish(); };
  const finish = () => (last ? finishAndReturnHome() : next());

  return (
    <Portal>
      <div className="fixed inset-0" style={{ zIndex: 89 }} onClick={finish}>
        {rect
          ? <TourSpotlight rect={rect} />
          : <div className="fixed inset-0" style={{ backgroundColor: "rgba(0,0,0,0.72)" }} />}
      </div>

      <div className="fixed spring-in" key={step}
        style={{
          zIndex: 91,
          ...(pos
            ? { top: pos.top, left: pos.left, width: cardWidth }
            : { inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }),
        }}
        onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 20px 50px rgba(0,0,0,0.4)", maxWidth: pos ? undefined : 420 }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="rounded-full flex items-center justify-center shrink-0"
                 style={{ width: 34, height: 34, background: isFemale ? "rgba(212,165,165,0.18)" : "rgba(197,160,89,0.18)" }}>
              <Icon size={17} style={{ color: accentColor }} />
            </div>
            <p className="font-data" style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-2)" }}>
              {s.kicker}
            </p>
          </div>
          <p className="title-shine mb-1.5" style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
            {s.title}
          </p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ink-2)" }}>
            {s.body}
          </p>

          <div className="flex items-center justify-between gap-2">
            <button onClick={finishAndReturnHome} className="text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
              Salta la guida
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep((v) => v - 1)} className="text-xs rounded-full px-3 py-2"
                  style={{ border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>
                  Indietro
                </button>
              )}
              <button onClick={finish} className="text-xs rounded-full px-4 py-2"
                style={{ backgroundColor: accentColor, color: "#111111", fontWeight: 700 }}>
                {last ? "Ho capito, si parte!" : "Avanti"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3.5">
            {steps.map((_, i) => (
              <span key={i} className="rounded-full" style={{ width: i === step ? 16 : 6, height: 6,
                backgroundColor: i === step ? accentColor : "var(--line)", transition: "width 200ms ease" }} />
            ))}
          </div>
        </div>
      </div>
    </Portal>
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

/* Scala 1-10 generica per aderenza e stress/digestione: qui il valore va da
   1 (peggio) a 10 (meglio), coerente con le altre scale a 10 punti dell'app. */
const CHECK_SCALE_10 = Array.from({ length: 10 }, (_, i) => i + 1);

/* Scala 1-10 riutilizzabile (digestione/motivazione/fatica percepita — vedi
   daily_metrics, SCHEMA_v57): stesso <select> del check settimanale sopra,
   con una didascalia opzionale per chiarire il verso della scala quando non
   è "10 = meglio" di default (fatica percepita è invertita: 1 = ottima). */
function Scale10Rating({ label, value, onChange, hint }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      <select value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)}
              className="input w-full px-4 py-3 text-sm">
        <option value="">— valuta —</option>
        {CHECK_SCALE_10.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {hint && <span className="text-xs block mt-1" style={{ color: "var(--ink-2)" }}>{hint}</span>}
    </label>
  );
}

/* Card di feedback a fine allenamento (motivazione + fatica percepita —
   daily_metrics, SCHEMA_v57): disponibile a TUTTI i piani (non solo chi ha un
   coach), un giorno = una riga, così il coach può incrociarla con sonno/
   stress/digestione nei grafici trend invece di decidere refeed/deload a
   caso. Facoltativa: l'atleta può chiudere l'app senza compilarla. */
function WorkoutFeedbackCard({ motivation, fatigue, onMotivationChange, onFatigueChange, accentText }) {
  const saved = motivation > 0 && fatigue > 0;
  return (
    <div className="card mt-4 p-5">
      <p className="h2 mb-1">Come è andata oggi?</p>
      <p className="meta mb-3" style={{ lineHeight: 1.5 }}>
        Facoltativo, ma aiuta il tuo coach a leggere quando serve un giorno di scarico o un refeed — non solo dai
        carichi sollevati.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Scale10Rating label="Motivazione (1-10)" value={motivation} onChange={onMotivationChange} hint="10 = ottima" />
        <Scale10Rating label="Fatica percepita (1-10)" value={fatigue} onChange={onFatigueChange} hint="1 = ottima, 10 = pessima" />
      </div>
      {saved && <p className="text-xs mt-3" style={{ color: accentText, fontWeight: 600 }}>✓ Salvato</p>}
    </div>
  );
}

/* Pop-up del Check settimanale (lunedì): bloccante, idro-satinato, con i 5 campi
   di compilazione rapida più 3 foto. Al termine simula il salvataggio dei
   parametri biometrici storici su Supabase (legati all'ID utente) e sblocca
   di nuovo la navigazione della Home. */
export function WeeklyCheckModal({ accent, accentText, accentSoft, gender, onSubmit, supabase, userId, onClose, onSkip }) {
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
  // Circonferenze e foto: sempre disponibili, in entrambi i flussi — nessuna
  // cadenza mensile che le blocchi, l'utente le registra quando vuole.
  const showFullSection = true;
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

  // Nel check periodico servono peso E sensazioni (dolori, stress,
  // digestione, sonno) — quello che davvero cambia settimana per settimana e
  // che l'app non può dedurre da sola. Circonferenze e foto non bloccano mai
  // l'invio, in nessuna modalità: contano solo se il cliente (o il ritmo
  // mensile) le porta in questo giro.
  const canSubmit = isFreeMode
    ? !!weight
    : !!(weight && pain && stress && digestion && sleepQuality);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError("");
    const data = {
      // BUG PRESO: weight era sempre Number(weight) anche a campo vuoto —
      // Number("") è 0, quindi un check senza peso (ora possibile) salvava
      // un falso "0 kg" invece di lasciarlo assente.
      weight: weight ? Number(weight) : null, waist: waist ? Number(waist) : null, thigh: thigh ? Number(thigh) : null, arm: arm ? Number(arm) : null,
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
              ? "Registra misure e stato del momento quando vuoi: ogni check in più affina il trend che vedi qui e che vede il coach."
              : showFullSection
                ? "Il check di oggi è più completo: include anche circonferenze e foto, che si aggiornano una volta al mese per seguire l'andamento nel tempo. Peso e sensazioni servono per registrarlo."
                : "Peso e sensazioni della settimana: bastano questi per registrare il check."}
          </p>

          {showFullSection && (
            <div className="on-light rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <p className="text-sm leading-relaxed" style={{ fontWeight: 500 }}>
                📏 Se registri peso o circonferenze, fallo preferibilmente al mattino, a digiuno, dopo essere
                andato/a in bagno: sono le condizioni in cui i numeri restano confrontabili da un controllo all'altro.
              </p>
            </div>
          )}

          <div className={showFullSection ? "grid grid-cols-2 gap-3 mb-5" : "mb-5"}>
            <label className="block">
              <span className="label block mb-1.5">Peso mattina (kg)</span>
              <input type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(",", "."))}
                     placeholder="es. 78.4" className="input w-full px-4 py-3 font-data" />
            </label>
            {showFullSection && (
              <>
                <label className="block">
                  <span className="label block mb-1.5">Addome (cm)</span>
                  <input type="text" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value.replace(",", "."))}
                         placeholder="es. 84" className="input w-full px-4 py-3 font-data" />
                </label>
                <label className="block">
                  <span className="label block mb-1.5">Coscia (cm)</span>
                  <input type="text" inputMode="decimal" value={thigh} onChange={(e) => setThigh(e.target.value.replace(",", "."))}
                         placeholder="es. 58" className="input w-full px-4 py-3 font-data" />
                </label>
                <label className="block">
                  <span className="label block mb-1.5">Braccio (cm)</span>
                  <input type="text" inputMode="decimal" value={arm} onChange={(e) => setArm(e.target.value.replace(",", "."))}
                         placeholder="es. 37" className="input w-full px-4 py-3 font-data" />
                </label>
              </>
            )}
          </div>

          <p className="label mb-2">Quello che i dati da soli non dicono</p>
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
              <span className="label block mb-1.5">Fase del ciclo</span>
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

          {showFullSection && (
            <>
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
                    {/* BUG PRESO: capture="user" forzava la fotocamera anteriore tramite
                        un intent Android non affidabile su molti dispositivi (specie
                        Samsung) — spesso non apriva nulla al tap, quindi niente file
                        selezionato e niente da caricare. Nessun vincolo di capture, come
                        nell'allegato chat: si apre la scelta nativa fotocamera/galleria. */}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto(key)} />
                  </label>
                ))}
              </div>
            </>
          )}

          <button onClick={handleSubmit} disabled={!canSubmit || saving}
                  className="w-full rounded-full px-4 py-3.5 text-sm transition-transform active:scale-[0.98] disabled:opacity-40 btn-3d"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
            {saving ? "Salvataggio in corso…" : "Registra"}
          </button>
          {onSkip && (
            <button onClick={onSkip} className="w-full text-center mt-3 text-sm" style={{ color: "var(--ink-2)", fontWeight: 500 }}>
              Salta per ora
            </button>
          )}
          {saveError && (
            <p className="mt-2 text-center text-sm" style={{ color: "#B91C1C" }}>{saveError}</p>
          )}
          {!canSubmit && (
            <p className="meta mt-2 text-center" style={{ fontSize: "0.68rem" }}>
              {isFreeMode ? "Inserisci almeno il peso per registrare." : "Inserisci peso, dolori, stress, digestione e sonno per registrare."}
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
                className="flex items-center gap-1.5 mb-4 text-xs transition-opacity active:opacity-60"
                style={{ color: "var(--ink-2)", fontWeight: 600 }}>
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
  workoutLoading,     // true SOLO al primo caricamento reale, prima che assignedWeek arrivi (mai dalla demo)
  target, consumed,   // { kcal, p, c, f }
  streak, level, xp, xpInLevel, xpNeeded,
  mealsBySlot, foods, mealGuide,
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
  onAddFood, onRemoveFood, onUpdateFood, onOpenScanner, onAddCustomFood, onCopyYesterday,
  onApplyReschedule, onDismissReschedule,
  onUpgrade, onOpenChat, onNavigateTab, onCoachSync, lastCoachSync, coachSyncCount, coachFeed, onSimulateInactivity, onResetActivityToday,
  pendingSyncCount,
  userPlan, // 'free' | 'performance_pack' | 'scheda_personalizzata' | 'training' | 'full_coaching' — letta da Supabase
  schedaAddonChatActive, // add-on Scheda Personalizzata (SCHEMA_v68): chat col coach attiva a prescindere da userPlan
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
  // Digestione (Alimentazione, ex check-in a emoji locale) + motivazione/
  // fatica percepita (fine allenamento) — daily_metrics, SCHEMA_v57. 0 =
  // non ancora valutato oggi. Disponibili a TUTTI i piani (non solo chi ha
  // un coach): l'atleta le vede/compila da solo nel suo Profilo, il coach le
  // legge in sola lettura per incrociarle con sonno/stress nei grafici trend.
  const [digestValue, setDigestValue] = useState(0);
  const [motivation, setMotivation] = useState(0);
  const [fatigue, setFatigue] = useState(0);
  const [wellnessLoaded, setWellnessLoaded] = useState(false);
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    fetchTodayWellness(supabase, userId, toLocalISODate())
      .then((row) => {
        if (cancelled) return;
        setDigestValue(row.digestion || 0);
        setMotivation(row.motivation || 0);
        setFatigue(row.fatigue || 0);
        setWellnessLoaded(true);
      })
      .catch((err) => { console.error("PERFORM: errore lettura valutazioni giornaliere", err); if (!cancelled) setWellnessLoaded(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId]);
  // Salvataggio reale, debounced (stesso principio di sonno/passi): solo dopo
  // il primo caricamento, altrimenti il seed di "oggi" qui sopra si
  // ri-salverebbe da solo (con gli altri due ancora a 0) un istante dopo
  // averlo letto, azzerando un valore già presente sulle altre due colonne.
  useEffect(() => {
    if (!supabase || !userId || !wellnessLoaded) return;
    const t = setTimeout(() => {
      upsertDailyMetrics(supabase, userId, toLocalISODate(), {
        digestion: digestValue || null,
        motivation: motivation || null,
        fatigue: fatigue || null,
      }).catch((err) => console.error("PERFORM: errore salvataggio valutazioni giornaliere", err));
    }, 600);
    return () => clearTimeout(t);
  }, [digestValue, motivation, fatigue, wellnessLoaded, supabase, userId]);

  // Punteggio di prontezza (vedi computeReadinessScore più sopra): dolore e
  // stress arrivano solo dal check periodico (checkins), non giornalieri —
  // fetch dedicato e indipendente da quello del check settimanale qui sotto
  // (che smette di girare una volta completato o per chi non è access.pro,
  // mentre il punteggio di prontezza serve a TUTTI i piani).
  const [recentSensations, setRecentSensations] = useState(null);
  // Peso più recente: stesso fetch di recentSensations qui sopra (le righe
  // di fetchCheckins portano già il campo weight, vedi coachingData.js) —
  // niente query in più solo per prenderlo, coerente con il resto della
  // codebase (BUG PRESO altrove nell'app per query duplicate evitabili).
  // Serve per il Bilancio energetico (BMR + calorie attive dai passi) qui
  // sotto: il peso corrente, non quello dell'anamnesi iniziale, che può
  // risalire a mesi fa.
  const [latestWeightKg, setLatestWeightKg] = useState(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    fetchCheckins(supabase, userId, 10)
      .then((rows) => {
        if (cancelled) return;
        const reversed = [...rows].reverse(); // dal più recente
        const lastSensation = reversed.find((r) => r.pain != null || r.stress != null);
        if (!lastSensation) { setRecentSensations(null); }
        else {
          const daysAgo = Math.floor((Date.now() - new Date(`${lastSensation.date}T00:00:00`)) / 86400000);
          setRecentSensations({ pain: lastSensation.pain, stress: lastSensation.stress, daysAgo });
        }
        const lastWeight = reversed.find((r) => r.weight != null);
        setLatestWeightKg(lastWeight ? Number(lastWeight.weight) : null);
      })
      .catch((err) => console.error("PERFORM: errore lettura sensazioni/peso recenti", err));
    return () => { cancelled = true; };
  }, [supabase, userId]);

  // Altezza/età (anamnesi) + peso iniziale come fallback finché non esiste
  // ancora un check registrato: serve, insieme a latestWeightKg sopra, al
  // Bilancio energetico stimato più sotto. Fetch leggero (una singola riga
  // JSON), gira per TUTTI i piani — l'anamnesi di base è compilabile da
  // chiunque dal Profilo, non solo da chi ha un coach (vedi 08_ClientProfileView.jsx).
  const [anamBio, setAnamBio] = useState(null); // { heightCm, age, initialWeightKg } | null finché non caricato
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    fetchAnamnesis(supabase, userId)
      .then((answers) => {
        if (cancelled) return;
        setAnamBio({
          heightCm: Number(answers?.altezza) || null,
          // BUG PRESO: leggeva answers.eta, un campo che l'anamnesi non
          // scrive mai — la domanda vera chiede la DATA di nascita
          // ("nascita"), quindi l'età va sempre calcolata da lì (vedi
          // computeAgeFromBirthDate in ../lib/biometrics.js). Per questo il
          // Bilancio energetico restava sempre "dati insufficienti" anche
          // con l'anamnesi completa.
          age: computeAgeFromBirthDate(answers?.nascita) ?? (Number(answers?.eta) || null),
          initialWeightKg: Number(answers?.peso) || null,
        });
      })
      .catch((err) => console.error("PERFORM: errore lettura anamnesi (dati biometrici)", err));
    return () => { cancelled = true; };
  }, [supabase, userId]);

  // Guida interattiva PERFORM (SCHEMA_v70): mostrata una sola volta, subito
  // dopo l'onboarding — sostituisce il vecchio banner "Giorno 1 di 14" a
  // percorso fisso. null finché non è stata letta (niente lampo del tour
  // che appare e sparisce mentre si aspetta la risposta reale).
  const [guideTourSeen, setGuideTourSeen] = useState(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    supabase.from("profiles").select("guide_tour_completed").eq("id", userId).maybeSingle()
      .then(({ data, error }) => { if (error) throw error; if (!cancelled) setGuideTourSeen(Boolean(data?.guide_tour_completed)); })
      .catch((err) => console.error("PERFORM: errore lettura stato guida interattiva", err));
    return () => { cancelled = true; };
  }, [supabase, userId]);
  const finishGuideTour = () => {
    setGuideTourSeen(true); // ottimistico: mai far ricomparire il tour per un errore di rete transitorio
    markGuideTourCompleted(supabase, userId).catch((err) => console.error("PERFORM: errore salvataggio guida interattiva completata", err));
  };
  // Alimentazione: "I tuoi target" ora è un pannello compatto in cima alla
  // pagina, non più un tab tra Diario Libero e Sostituzioni — chiuso di
  // default, si espande solo quando il cliente vuole davvero modificarli.
  const [targetsOpen, setTargetsOpen] = useState(false);
  // Allenamento ora si divide in 3: Pesi (scheda/esercizi/volumi, era tutto
  // lo schermo), Cardio (spostato qui da Recupero — è allenamento, non
  // recupero), Wiki (invariata, solo spostata sotto ai 3 bottoni invece che
  // sempre visibile in fondo alla pagina Pesi).
  const [workoutTab, setWorkoutTab] = useState("pesi"); // pesi | cardio | wiki

  // BUG PRESO (v1): cambiare schermata (Allenamento/Alimentazione/Recupero/
  // Integrazione, o tornare alla Home) lasciava la pagina alla stessa
  // posizione di scroll di prima — la nuova schermata poteva apparire già
  // scrollata a metà invece che dall'inizio. Fix era un window.scrollTo(0,0)
  // fisso, che però buttava via anche lo scroll DELLA SCHERMATA STESSA da
  // una visita all'altra — es. scorrere a metà della lista esercizi in
  // Allenamento, tornare alla Home, riaprire Allenamento e ritrovarsi di
  // nuovo in cima. Ora ogni schermata ricorda la propria posizione
  // (scrollMemory.js): resta a 0 solo alla prima visita, poi torna sempre
  // dove l'utente l'aveva lasciata — anche dopo un reload dell'app causato
  // dal sistema operativo che scarica la pagina in background.
  // Swipe da bordo sinistro → stesso "indietro" del pulsante freccia, come
  // il gesto nativo iOS.
  useEffect(() => {
    window.scrollTo(0, getScrollPosition(`home:${screen}`));
  }, [screen]);
  useEffect(() => {
    const onScroll = () => saveScrollPosition(`home:${screen}`, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [screen]);
  useEdgeSwipeBack(() => setScreen("dash"), screen !== "dash");

  /* Check settimanale: non più legato al lunedì — resta un promemoria
     finché l'atleta non lo compila almeno con peso e sensazioni (dolori/
     stress/digestione/sonno), skippabile per quella comparsa ma non "per
     sempre": solo per chi ha davvero un coach (access.pro), MAI per free/
     Premium, che registrano i propri dati quando vogliono dal Profilo
     ("Registra un check", sempre disponibile a tutti).
     Circonferenze e foto: nessuna cadenza mensile che le blocchi — il
     WeeklyCheckModal le mostra sempre, in entrambi i flussi (richiesta
     esplicita: "non mi fa inserire foto quando mi pare").

     BUG PRESO (segnalato: "invasivo, compare ogni volta che riapro l'app"):
     l'effect sotto girava a OGNI mount di HomeDashboard (ogni riapertura
     dell'app, ogni volta che si torna sulla tab Home da un'altra) e, se il
     check della settimana non risultava ancora fatto, mostrava SEMPRE il
     popup — anche riaprendo l'app dieci volte in un'ora solo per controllare
     altro. Fix: al massimo una comparsa nella finestra "mattina" (6-12) e
     una nella finestra "sera" (18-24) per giorno di calendario — mai più di
     due popup/giorno, mai fuori da quelle due finestre — tracciato in
     localStorage (per-dispositivo, si azzera da solo cambiando giorno). Se
     l'atleta non lo compila mai, la stessa cadenza si ripete ogni giorno
     finché non arriva lunedì mattina: da lì è semplicemente il check della
     settimana NUOVA (weeklyAlreadyDone si ricalcola sempre dal lunedì
     corrente, nessuna logica di "rinuncia" da gestire a parte). */
  const WEEKLY_CHECK_PROMPT_KEY = "perform_weekly_check_prompts";
  const weeklyCheckPromptWindow = () => {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return "morning";
    if (h >= 18) return "evening";
    return null; // fuori dalle due finestre: mai un popup qui, qualunque sia lo stato del check
  };
  const readWeeklyCheckPrompts = () => {
    const today = toLocalISODate();
    try {
      const saved = JSON.parse(localStorage.getItem(WEEKLY_CHECK_PROMPT_KEY) || "null");
      if (saved && saved.date === today && Array.isArray(saved.windows)) return saved;
    } catch { /* dato corrotto: riparte pulito */ }
    return { date: today, windows: [] };
  };
  const markWeeklyCheckPrompted = (windowName) => {
    try {
      const state = readWeeklyCheckPrompts();
      if (!state.windows.includes(windowName)) state.windows.push(windowName);
      localStorage.setItem(WEEKLY_CHECK_PROMPT_KEY, JSON.stringify(state));
    } catch { /* best-effort, mai bloccare il check per questo */ }
  };

  const [showWeeklyCheck, setShowWeeklyCheck] = useState(false);
  const [weeklyCheckDone, setWeeklyCheckDone] = useState(false);
  useEffect(() => {
    if (weeklyCheckDone || !access.pro) return undefined;
    if (!(supabase && userId)) { setShowWeeklyCheck(true); return undefined; } // anteprima demo, comportamento invariato
    const promptWindow = weeklyCheckPromptWindow();
    if (!promptWindow) return undefined; // fuori mattina/sera: non disturbare
    if (readWeeklyCheckPrompts().windows.includes(promptWindow)) return undefined; // già mostrato in questa finestra oggi
    let cancelled = false;
    const mondayIso = toLocalISODate(mondayOfLocal());
    fetchCheckins(supabase, userId, 60)
      .then((rows) => {
        if (cancelled) return;
        const thisWeek = rows.filter((r) => r.date >= mondayIso);
        const weeklyAlreadyDone = thisWeek.some((r) =>
          r.weight != null && r.pain != null && r.stress != null && r.digestion != null && r.sleep_quality != null);
        if (!weeklyAlreadyDone) {
          markWeeklyCheckPrompted(promptWindow);
          setShowWeeklyCheck(true);
        }
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
  const [levelRoadmapOpen, setLevelRoadmapOpen] = useState(false);
  const [streakInfoOpen, setStreakInfoOpen] = useState(false);
  const [selectedCalendarIso, setSelectedCalendarIso] = useState(null); // null = oggi
  const [pdfExportOpen, setPdfExportOpen] = useState(false); // esportazione PDF scheda, vedi WorkoutPdfExport

  // Giorni realmente "saltati" nelle due strisce calendario (Allenamento e
  // Alimentazione): letti una volta dal vero storico, mai un pattern finto.
  const [workoutDoneDates, setWorkoutDoneDates] = useState(() => new Set());
  const [nutritionLoggedDates, setNutritionLoggedDates] = useState(() => new Set());
  useEffect(() => {
    if (!supabase || !userId) return;
    const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
    const fromD = new Date(todayD); fromD.setDate(fromD.getDate() - 30);
    const fromISO = toLocalISODate(fromD), toISO = toLocalISODate(todayD);
    fetchWorkoutDoneDates(supabase, userId, fromISO, toISO).then(setWorkoutDoneDates).catch((err) => console.error("PERFORM: errore lettura giorni allenati", err));
    fetchNutritionLoggedDates(supabase, userId, fromISO, toISO).then(setNutritionLoggedDates).catch((err) => console.error("PERFORM: errore lettura giorni alimentazione registrati", err));
  }, [supabase, userId]);

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
          bySlot[r.meal_slot].push({
            id: r.id, name: r.name, grams: r.grams, kcal: r.kcal, p: r.protein, c: r.carbs, f: r.fat,
            na: r.sodium_mg, k: r.potassium_mg, fe: r.iron_mg, ca: r.calcium_mg, mg: r.magnesium_mg,
          });
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
    // Stesso pattern offline-first di onAddFood (Home, oggi): id generato
    // subito lato client, così un pasto di backfill registrato con rete
    // assente non sparisce ma va in coda e si sincronizza da solo.
    const clientId = crypto.randomUUID();
    const localItem = { ...item, id: clientId };
    setPastMeals((m) => ({ ...(m || {}), [slot]: [...((m || {})[slot] || []), localItem] }));
    if (supabase && userId) {
      addNutritionLogItem(supabase, userId, selectedNutritionIso, slot, item, clientId)
        .catch((err) => {
          console.error("PERFORM: errore salvataggio pasto giorno passato, lo metto in coda per riprovare quando torna la rete", err);
          enqueueWrite("nutrition-log", { userId, dateISO: selectedNutritionIso, mealSlot: slot, item, clientId });
        });
    }
  };
  const removeFoodForPastDay = (slot, index) => {
    setPastMeals((m) => {
      const item = (m || {})[slot]?.[index];
      if (supabase && userId && item?.id) {
        cancelQueuedWrite("nutrition-log", (p) => p.clientId === item.id).then((cancelled) => {
          if (!cancelled) {
            removeNutritionLogItem(supabase, item.id).catch((err) => console.error("PERFORM: errore rimozione pasto giorno passato", err));
          }
        });
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

  // Pallino "novità" (SCHEMA_v80): Allenamento/Alimentazione/Integrazione si
  // illuminano quando il coach ha aggiornato quella sezione dopo l'ultima
  // visita del cliente. Ricalcolato anche a ogni coachSyncCount (stesso
  // segnale di "qualcosa è cambiato" già usato per XP/streak sopra), non solo
  // al mount — così il pallino appare senza dover ricaricare la pagina se il
  // coach salva mentre il cliente è già sulla Home.
  const [sectionNovelty, setSectionNovelty] = useState({ workout: false, nutrition: false, supplements: false });
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    fetchSectionNovelty(supabase, userId)
      .then((n) => { if (!cancelled) setSectionNovelty(n); })
      .catch((err) => console.error("PERFORM: errore lettura novità sezioni", err));
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId, coachSyncCount]);

  // Aprire una sezione la segna "vista": il pallino sparisce subito, finché
  // il coach non tocca di nuovo quella sezione specifica.
  useEffect(() => {
    if (!isRealMode) return;
    if (screen !== "workout" && screen !== "nutrition" && screen !== "supplements") return;
    if (!sectionNovelty[screen]) return;
    markSectionSeen(supabase, userId, screen)
      .then(() => setSectionNovelty((prev) => ({ ...prev, [screen]: false })))
      .catch((err) => console.error("PERFORM: errore segna sezione vista", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, isRealMode]);

  const [realXpStreak, setRealXpStreak] = useState(null); // null = non ancora calcolato
  // BUG PRESO: prima si ricalcolava SOLO una volta al mount — se l'atleta
  // completava una serie, registrava un pasto o il sonno mentre era già
  // sulla Home, xp_total/streak mostrati restavano quelli letti all'apertura
  // finché non ricaricava la pagina, dando l'impressione che "a volte gli XP
  // non si registrano" (in realtà il dato reale era scritto, solo non
  // riletto). Ora si ricalcola anche ad ogni nuovo evento (coachSyncCount,
  // che cresce a ogni serie completata) e periodicamente come rete di
  // sicurezza per gli altri casi (pasto aggiunto, sonno/passi salvati).
  // BUG PRESO (segnalato: "l'utente sale di livello ma la Home mostra
  // ancora il livello precedente"): il rinfresco periodico ogni 20s si
  // affidava a un setInterval — sui browser mobile un tab/PWA in background
  // sospende (o rallenta pesantemente) i setInterval, esattamente come
  // successo al timer di recupero (vedi readRestTimer/writeRestTimer più
  // sopra). Se il livello cambiava mentre l'app era in background (es. XP
  // bonus assegnato dal coach da un altro dispositivo, o un ricalcolo che
  // scatta a mezzanotte) e non era passato da coachSyncCount, tornando
  // sull'app poteva volerci ben più dei 20s dichiarati prima del prossimo
  // tick — a volte "per sempre" finché non si toccava di nuovo qualcosa. Un
  // rinfresco immediato al rientro (visibilitychange) chiude questo buco
  // senza aspettare il timer.
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    const refresh = () => {
      computeRealXpAndStreak(supabase, userId)
        .then((r) => { if (!cancelled) setRealXpStreak(r); })
        .catch((err) => {
          console.error("PERFORM: errore calcolo XP/streak", err);
          if (!cancelled) setRealXpStreak((prev) => prev ?? { xpTotal: 0, streak: 0 });
        });
    };
    refresh();
    const id = setInterval(refresh, 20000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealMode, supabase, userId, coachSyncCount]);
  const realLevelInfo = isRealMode ? xpToLevelInfo(realXpStreak?.xpTotal ?? 0) : null;
  if (isRealMode) {
    streak = realXpStreak?.streak ?? 0;
    // BUG PRESO (segnalato: "il livello è rimasto sempre a livello 1 anche
    // se ho fatto la progressione fino al livello 2"): xpToLevelInfo().level
    // è 0-indicizzato (0 = primo livello) — ogni altro punto dell'app che lo
    // mostra aggiunge sempre +1 per la UI (LevelRoadmapModal poco sopra in
    // questo stesso file, Classifica, Profilo). Solo questo badge, sopra la
    // barra XP in Home, mostrava il numero grezzo non scalato: un atleta al
    // secondo vero livello (level interno 1) vedeva "Livello 1" invece di
    // "Livello 2", sempre indietro di uno rispetto a dove si vede ovunque
    // altrove nell'app.
    level = realLevelInfo.level + 1;
    xp = realLevelInfo.xp;
    xpInLevel = realLevelInfo.xpInLevel;
    // Barra di progresso: xpNeeded è l'ampiezza TOTALE del livello corrente
    // (denominatore di xpInLevel/xpNeeded), non l'XP mancante al prossimo —
    // stessa convenzione del prop demo che sostituisce. A livello massimo la
    // barra resta piena (xpNeeded = xpInLevel, mai 0/0).
    xpNeeded = realLevelInfo.isMaxLevel ? Math.max(1, realLevelInfo.xpInLevel) : realLevelInfo.xpForNextLevel;
  }
  // Valore mostrato sulla barra XP: segue xpInLevel con un'animazione "conta
  // in su" invece di un salto istantaneo quando arriva un ricalcolo con più
  // punti — la larghezza della barra stessa anima via CSS transition (vedi
  // render qui sotto), qui si anima solo il numero.
  const xpBarDisplay = useCountUp(xpInLevel, 900);

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
    xpToastTimer.current = setTimeout(() => setXpToast(null), 7000); // deve combaciare con xpToastPop qui sotto
    playSound("xp");
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
  // BUG PRESO: "was === false" doveva bastare a non festeggiare al primo
  // mount, ma sonno/passi/pasti/macro arrivano da fetch async — nei primi
  // istanti questo effetto gira già una volta con i valori di default
  // (quasi tutti "non fatto"), che scrive was=false in prevGoalsRef PRIMA
  // che i dati veri siano arrivati. Quando i dati veri arrivano un attimo
  // dopo e un obiettivo risulta già completato (perché lo era da prima,
  // non perché l'utente ha appena fatto qualcosa), questo sembrava una
  // transizione false→true vera e faceva scattare il toast — quindi gli XP
  // comparivano ad ogni apertura dell'app. readyRef rimanda l'inizio del
  // "festeggia le transizioni" di qualche secondo, il tempo che i fetch
  // reali si assestino: fino ad allora si aggiorna solo la baseline, senza
  // sparare toast.
  const goalsReadyRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { goalsReadyRef.current = true; }, 2500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    dailyGoals.forEach(([label, done, baseXp]) => {
      const was = prevGoalsRef.current[label];
      if (goalsReadyRef.current && done && was === false) fireXpToast(label, Math.round(baseXp * (1 + streakXpBonus)));
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

  // Punteggio di prontezza di oggi: calcolato una sola volta qui (non più
  // duplicato per ogni schermata che ne ha bisogno — Home, popup del cerchio
  // Recupero, avviso pre-allenamento), vedi computeReadinessScore in
  // ../lib/biometrics.js. HRV/RHR entrano SOLO in modalità demo: in
  // modalità reale nessun dispositivo li fornisce ancora (vedi "RHR e HRV
  // in arrivo" più sotto), e gli stati hrv/rhr qui restano ai loro valori
  // demo di default ("58"/"62") finché quell'integrazione non esiste —
  // passarli sempre avrebbe iniettato un dato finto nel punteggio reale di
  // un cliente vero, esattamente ciò che questa app non fa mai.
  const readiness = computeReadinessScore({
    sleepHours: sleep.hours, steps: Number(steps) || 0,
    hrv: isRealMode ? null : Number(hrv) || null,
    rhr: isRealMode ? null : Number(rhr) || null,
    motivation, fatigue, recentSensations,
  });

  // Bilancio energetico stimato di oggi (BMR + calorie attive dai passi):
  // vedi computeEnergyExpenditure in ../lib/biometrics.js. Peso: il più
  // recente registrato in un check, o quello dell'anamnesi iniziale finché
  // non esiste ancora un check; altezza/età: solo anamnesi (non cambiano
  // giorno per giorno). In demo mostra numeri plausibili (DEMO_BIOMETRICS),
  // MAI in modalità reale: lì, finché mancano dati veri, `missing` lo dice
  // esplicitamente e la UI mostra un invito a completarli, non un numero.
  const bioWeightKg = isRealMode ? (latestWeightKg ?? anamBio?.initialWeightKg ?? null) : DEMO_BIOMETRICS.weightKg;
  const bioHeightCm = isRealMode ? (anamBio?.heightCm ?? null) : DEMO_BIOMETRICS.heightCm;
  const bioAge = isRealMode ? (anamBio?.age ?? null) : DEMO_BIOMETRICS.age;
  const energyExpenditure = computeEnergyExpenditure({
    weightKg: bioWeightKg, heightCm: bioHeightCm, age: bioAge, gender: profile.gender,
    steps: Number(steps) || 0,
  });

  // Cerchio Allenamento reale: STESSA formula di ClientDetail (coach), mai
  // calcolata due volte — vedi computeTrainingCompliance in coachingData.js.
  // Il simulatore di test (trainOverride) resta solo per la preview demo:
  // sovrascrivere un numero reale con uno slider di prova sarebbe fuorviante.
  // (isRealMode è già dichiarato più sopra, vicino a XP/livello/streak.)
  // BUG PRESO / redesign richiesto: prima si ricalcolava SOLO al mount della
  // Home — se il cliente registrava una serie, un pasto o il sonno mentre era
  // già sulla schermata, il cerchio restava fermo al valore letto
  // all'apertura finché non ricaricava la pagina ("i cerchi non si muovono
  // quando registro qualcosa"). Stesso pattern già in uso per XP/streak qui
  // sopra: si ricalcola SUBITO a ogni nuovo evento (coachSyncCount, che
  // cresce già a ogni serie completata) e ogni 20s come rete di sicurezza per
  // gli eventi che non passano da coachFeed (pasto aggiunto, sonno/passi
  // salvati) — il cerchio si muove entro pochi secondi da qualunque
  // registrazione, non al prossimo accesso.
  const [realTrainCompliance, setRealTrainCompliance] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    const refresh = () => {
      computeTrainingCompliance(supabase, userId)
        .then((r) => { if (!cancelled) setRealTrainCompliance(r); })
        .catch((err) => {
          console.error("PERFORM: errore calcolo cerchio Allenamento", err);
          if (!cancelled) setRealTrainCompliance((prev) => prev ?? { status: "neutral", pct: null, completionPct: null, progression: "neutral" });
        });
    };
    refresh();
    const id = setInterval(refresh, 20000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealMode, supabase, userId, coachSyncCount]);

  const trainPct = isRealMode ? (realTrainCompliance?.pct ?? null) : (trainOverride ?? trainPctComputed);

  // Cerchio Alimentazione reale: STESSA formula di ClientDetail (coach) — vedi
  // computeNutritionCompliance in coachingData.js. Legge solo nutrition_logs
  // + nutrition_targets già salvati, stesso principio degli altri due cerchi.
  const [realNutritionCompliance, setRealNutritionCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    const refresh = () => {
      computeNutritionCompliance(supabase, userId)
        .then((r) => { if (!cancelled) setRealNutritionCompliance(r); })
        .catch((err) => {
          console.error("PERFORM: errore calcolo cerchio Alimentazione", err);
          if (!cancelled) setRealNutritionCompliance((prev) => prev ?? { status: "neutral", pct: null, daysScored: 0 });
        });
    };
    refresh();
    const id = setInterval(refresh, 20000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealMode, supabase, userId, coachSyncCount]);
  const nutriPct = isRealMode ? (realNutritionCompliance?.pct ?? null) : (nutriOverride ?? nutriPctComputed);

  // Cerchio Recupero reale: STESSA formula di ClientDetail (coach), mai
  // calcolata due volte — vedi computeRecoveryCompliance in coachingData.js.
  // Legge solo daily_metrics già salvato, non lo stato locale del form.
  const [realRecoveryCompliance, setRealRecoveryCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    const refresh = () => {
      computeRecoveryCompliance(supabase, userId)
        .then((r) => { if (!cancelled) setRealRecoveryCompliance(r); })
        .catch((err) => {
          console.error("PERFORM: errore calcolo cerchio Recupero", err);
          if (!cancelled) setRealRecoveryCompliance((prev) => prev ?? { status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0, windowDays: 0 });
        });
    };
    refresh();
    const id = setInterval(refresh, 20000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealMode, supabase, userId, coachSyncCount]);

  const recoveryBasePct = isRealMode ? (realRecoveryCompliance?.pct ?? null) : recoveryPctComputed;
  const recoveryPct = recoveryOverride ?? blendRecoveryWithReadiness(recoveryBasePct, readiness);
  const recoveryTrackedDays = isRealMode ? (realRecoveryCompliance?.trackedDays ?? 0) : recoverySleep7.filter((h) => h > 0).length;
  const recoveryWindowDays = isRealMode ? (realRecoveryCompliance?.windowDays ?? 0) : 7;

  const progressionLabel = { positive: "In crescita", negative: "In calo", neutral: "Stabile" };

  // Messaggio diagnostico per popup — richiesta esplicita: i 3 cerchi
  // "sembrano messi lì solo per bellezza" se il tap mostra solo numeri grezzi
  // senza spiegare COSA li sta tenendo bassi/alti né cosa fare. Un'unica
  // frase concreta per cerchio, calcolata dai dati già letti sopra (nessuna
  // nuova query): la causa principale del voto attuale + un'indicazione
  // pratica, non solo la statistica.
  const trainInsight = isRealMode && realTrainCompliance?.status === "ok"
    ? (() => {
        const { completionPct, progression, improved, worsened, comparable } = realTrainCompliance;
        if (completionPct < 70) {
          return `Hai completato circa il ${completionPct}% delle serie previste nelle ultime sessioni: è il motivo principale per cui il cerchio non è più alto. Punta a chiudere ogni serie assegnata, anche a peso ridotto se serve.`;
        }
        if (progression === "positive" && comparable > 0) {
          return `Il carico è salito in ${improved} esercizi su ${comparable} rispetto alla sessione precedente: stai progredendo bene, continua così.`;
        }
        if (progression === "negative" && comparable > 0) {
          return `Il carico è sceso in tutti gli esercizi confrontabili (${worsened}/${comparable}) rispetto alla sessione precedente: valuta se hai recuperato a sufficienza — sonno, stress, giorni di riposo.`;
        }
        return "Stai completando le sessioni come previsto: continua così per mantenere il cerchio alto.";
      })()
    : null;

  const nutriInsight = isRealMode && target?.kcal > 0
    ? (() => {
        const dims = [
          { key: "p", label: "le proteine" },
          { key: "c", label: "i carboidrati" },
          { key: "f", label: "i grassi" },
        ].filter((d) => target[d.key] > 0);
        if (dims.length === 0) return null;
        const worst = dims.reduce((a, b) =>
          (Math.abs(consumed[b.key] - target[b.key]) > Math.abs(consumed[a.key] - target[a.key]) ? b : a));
        const dev = Math.round(consumed[worst.key] - target[worst.key]);
        if (Math.abs(dev) < 8) return "Sei in target su tutti i macro principali oggi: continua così.";
        return `Oggi ${worst.label} sono il macro più lontano dal target: ${Math.round(consumed[worst.key])}g su ${Math.round(target[worst.key])}g (${dev > 0 ? "+" : ""}${dev}g) — è la prima cosa da aggiustare.`;
      })()
    : null;

  const recoveryInsight = isRealMode && realRecoveryCompliance
    ? (() => {
        if (recoveryWindowDays > 0 && recoveryTrackedDays / recoveryWindowDays < 0.6) {
          return `Hai registrato sonno/passi solo ${recoveryTrackedDays} giorni su ${recoveryWindowDays}: i giorni non tracciati pesano come pessimi nella media. Registra più spesso per un dato preciso.`;
        }
        if (realRecoveryCompliance.sleepAvg != null && realRecoveryCompliance.sleepAvg < 7) {
          return `Il sonno medio (${realRecoveryCompliance.sleepAvg}h) è sotto le 7–7,5h consigliate per un buon recupero: è probabilmente ciò che tiene basso il cerchio.`;
        }
        return "Sonno e passi sono nella norma: il recupero sta procedendo bene.";
      })()
    : null;

  const complianceRings = [
    {
      id: "train", label: "Allenamento", icon: Dumbbell, pct: trainPct, insight: trainInsight,
      details: isRealMode
        ? [
            { label: "Completamento sessioni recenti", value: realTrainCompliance?.completionPct != null ? `${realTrainCompliance.completionPct}%` : "…" },
            { label: "Progressione carichi vs sessioni precedenti", value: realTrainCompliance ? progressionLabel[realTrainCompliance.progression] : "…" },
          ]
        : [
            { label: "Serie completate oggi", value: day.isTraining ? `${todayCompletedSets} / ${todayExpectedSets}` : "Riposo" },
            { label: "Media 7 giorni", value: `${trainPctComputed}%` },
            { label: "Diari carichi compilati (storico)", value: "6 / 7" },
          ],
    },
    {
      id: "nutri", label: "Alimentazione", icon: Salad, pct: nutriPct, insight: nutriInsight,
      details: isRealMode
        ? [
            { label: "Kcal oggi", value: `${consumed.kcal} / ${target.kcal}` },
            { label: "Giorni valutati", value: `${realNutritionCompliance?.daysScored ?? 0}` },
          ]
        : [
            { label: "Precisione oggi vs target", value: `${nutriPctToday}%` },
            { label: "Kcal oggi", value: `${consumed.kcal} / ${target.kcal}` },
            { label: "Media 7 giorni", value: `${nutriPctComputed}%` },
          ],
    },
    {
      id: "recovery", label: "Recupero", icon: BedDouble, pct: recoveryPct, insight: recoveryInsight,
      details: isRealMode
        ? [
            { label: "Sonno medio", value: realRecoveryCompliance?.sleepAvg != null ? `${realRecoveryCompliance.sleepAvg} h` : "…" },
            { label: "Passi medi", value: realRecoveryCompliance?.stepsAvg != null ? realRecoveryCompliance.stepsAvg.toLocaleString("it-IT") : "…" },
            { label: "Giorni tracciati", value: `${recoveryTrackedDays} / ${recoveryWindowDays}` },
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

  /* Check settimanale: occupa tutta la schermata (non un vero blocco di
     navigazione: skippabile per questa sessione, vedi onSkip), finché
     l'atleta non lo compila almeno con peso e sensazioni.
     guideTourSeen === true (non solo "!== false"): un nuovo iscritto a un
     piano coaching può ritrovarsi con ENTRAMBI showWeeklyCheck e la guida
     interattiva veri al primo accesso — la guida ha sempre la priorità,
     chiedere di compilare un check prima ancora di sapere cos'è l'app
     sarebbe fuori sequenza. In modalità demo (isRealMode false, dove
     guideTourSeen resta sempre null perché non c'è nessun profilo reale da
     leggere) questa condizione non cambia nulla: la guida non è mai gated
     lì, e il comportamento della preview resta quello di sempre. */
  if (showWeeklyCheck && (!isRealMode || guideTourSeen === true)) {
    return (
      <WeeklyCheckModal
        accent={accent} accentText={accentText} accentSoft={accentSoft} gender={profile.gender}
        supabase={supabase} userId={userId}
        onSkip={() => setShowWeeklyCheck(false)}
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
            {/* Gradiente condiviso oro/rosa (stessi --title-a/b/c del
                title-shine) applicato al fuocherello: definito una sola
                volta, invisibile di suo (0x0), referenziato via url(#...). */}
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
              <defs>
                <linearGradient id="flameShineGrad" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="objectBoundingBox">
                  <stop offset="0%" style={{ stopColor: "var(--title-a)" }} />
                  <stop offset="50%" style={{ stopColor: "var(--title-b)" }} />
                  <stop offset="100%" style={{ stopColor: "var(--title-c)" }} />
                  <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3.5s" repeatCount="indefinite" />
                </linearGradient>
              </defs>
            </svg>

            <div className="flex items-start justify-between gap-3">
              <p className="greeting-text min-w-0" style={{ fontSize: "1.55rem", fontWeight: 500, letterSpacing: "0.01em", lineHeight: 1.15 }}>
                <span className="title-shine">{greeting.text} {firstName}</span>
              </p>

              {/* Streak: fuoco + numero, oro/rosa lucido come il titolo di
                  livello, niente più riquadro attorno — solo il numero,
                  tocca per aprire la spiegazione (e "Congela streak di
                  oggi" dentro, StreakInfoModal). */}
              <button onClick={() => setStreakInfoOpen(true)}
                      className="inline-flex items-center gap-1.5 shrink-0"
                      style={{ background: "none" }}
                      aria-label="Streak: tocca per i dettagli"
                      data-tour="streak">
                <Flame size={32} className={streak >= 15 ? "flame-3" : streak >= 8 ? "flame-2" : "flame-1"}
                       fill="url(#flameShineGrad)" stroke="url(#flameShineGrad)" strokeWidth={1.3}
                       style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 9px rgba(212,175,55,0.5))" }} />
                <span className="title-shine" style={{ fontSize: "1.7rem", fontWeight: 800 }}>{streak}</span>
              </button>
            </div>

            <p className="meta mt-1" style={{ fontSize: "0.72rem" }}>
              {day.dayNumber != null
                ? `Giorno ${day.dayNumber} del percorso · ${WEEK_DAYS[day.weekday]}`
                : new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" })}
            </p>

            {day.mesociclo != null && (
              <div className="mt-3">
                <MesocicloBadge mesociclo={day.mesociclo} week={day.weekNumber} weeks={day.mesocicloWeeks ?? 4} />
              </div>
            )}
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
          {/* i 3 cerchi di compliance: dentro lo stesso banner, sopra il livello */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }} data-tour="compliance">
            <ComplianceRings rings={complianceRings} onSelect={setActiveRingPopup} />
          </div>

          {/* barra XP: pulita, niente più elenco "obiettivi di oggi" da
              espandere — il feedback su cosa fa guadagnare punti arriva
              come animazione (XpToastBanner) nel momento in cui succede.
              Cliccabile: apre la mappa di tutti i livelli, per capire
              subito quanto manca al prossimo grado e restare motivati. */}
          <button onClick={() => setLevelRoadmapOpen(true)} className="w-full text-left mt-4 pt-4"
                  style={{ borderTop: "1px solid var(--line)", background: "none" }}
                  aria-label="Vedi tutti i livelli"
                  data-tour="xp">
            {/* Il nome del grado (Neofita/Intermedio/...) è stato rimosso su
                richiesta esplicita — resta solo il numero di livello, meno
                gamificato/"cringe" e comunque già sufficiente a mostrare il
                progresso insieme alla barra XP sotto. */}
            <div className="mb-2 flex items-center justify-between">
              <p className="title-shine" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                Livello {level}
              </p>
              <span className="meta font-data">{xpBarDisplay} / {xpNeeded} XP</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 10, backgroundColor: "var(--surface-2)" }}>
              {/* Perf: anima transform invece di width — width forza un
                  reflow di layout a ogni frame, transform:scaleX è
                  composited dalla GPU (mai un ricalcolo di layout). Il
                  box resta largo il 100% (background-size/position del
                  bagliore restano corretti, calcolati sulla larghezza
                  vera), lo scaleX lo comprime visivamente in modo
                  matematicamente identico a una width più stretta. */}
              <div className="xp-bar xp-bar-shine relative h-full rounded-full overflow-hidden"
                   style={{ width: "100%",
                            transform: `scaleX(${Math.min(1, xpBarDisplay / xpNeeded)})`,
                            transformOrigin: "left",
                            transition: "transform 900ms cubic-bezier(.22,1,.36,1)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                <div className="absolute inset-x-0 top-0" style={{ height: "55%",
                       background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))" }} />
              </div>
            </div>
            {/* Ricompensa di livello (richiesta esplicita, LEVEL_REWARDS):
                anticipa COSA sblocca il prossimo grado, non solo QUANDO —
                l'incentivo diventa concreto invece che un numero astratto. */}
            {(() => {
              const nextReward = LEVEL_REWARDS.find((r) => r.level > level);
              if (!nextReward) return null;
              return (
                <p className="meta mt-2" style={{ fontSize: "0.72rem" }}>
                  {nextReward.icon} Livello {nextReward.level}: {nextReward.title}
                </p>
              );
            })()}
          </button>
          </div>
        </div>

        {!!pendingSyncCount && (
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-4"
               style={{ backgroundColor: "rgba(240,160,32,0.1)", border: "1px solid rgba(240,160,32,0.35)" }}>
            <Loader2 size={14} className="animate-spin" style={{ color: "#B45309", flexShrink: 0 }} />
            <p className="text-xs" style={{ color: "#B45309", fontWeight: 600 }}>
              {pendingSyncCount === 1 ? "1 registrazione in attesa di rete" : `${pendingSyncCount} registrazioni in attesa di rete`} — si sincronizza tutto da solo appena torna la connessione.
            </p>
          </div>
        )}
        {isRealMode && guideTourSeen === false && (
          <SpotlightTour plan={userPlan} gender={profile.gender} onFinish={finishGuideTour} onNavigateTab={onNavigateTab} />
        )}

        {/* La prontezza di oggi non è più una card separata qui: vive dentro
            il popup del cerchio Recupero (CompliancePopup, tocca il cerchio
            per aprirlo) e contribuisce già alla sua percentuale, vedi
            blendRecoveryWithReadiness più sopra. */}

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

        <CompliancePopup ring={complianceRings.find((r) => r.id === activeRingPopup)} onClose={() => setActiveRingPopup(null)} readiness={readiness} />
        {levelRoadmapOpen && (
          <LevelRoadmapModal currentXp={isRealMode ? (realXpStreak?.xpTotal ?? 0) : xp} onClose={() => setLevelRoadmapOpen(false)} />
        )}
        {streakInfoOpen && (
          <StreakInfoModal streak={streak} supabase={supabase} userId={userId} accent={accent} level={level}
                            onClose={() => setStreakInfoOpen(false)} />
        )}

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

        {/* le macro-finestre: gap ridotto (2.5 invece di 4) — icona ora a
            fianco del titolo invece che sopra, le 4 card sono più compatte
            e più vicine fra loro, come richiesto. */}
        <div className="grid grid-cols-1 gap-2.5">
          <div data-tour="card-workout">
            <Window3D icon={Dumbbell} label="Allenamento" accent={accent} floatClass="icon-float-1"
              sub={day.isTraining ? day.sessionLabel : "Giorno di riposo"}
              novelty={sectionNovelty.workout}
              onClick={() => setScreen("workout")} />
          </div>
          <div data-tour="card-nutrition">
            <Window3D icon={Salad} label="Alimentazione" accent={accent} floatClass="icon-float-2"
              sub={`${remaining.kcal} kcal rimanenti`}
              novelty={sectionNovelty.nutrition}
              onClick={() => setScreen("nutrition")} />
          </div>
          <div data-tour="card-supplements">
            <Window3D icon={Pill} label="Integrazione" accent={accent} floatClass="icon-float-2"
              sub={access.pro ? "Piano del coach attivo" : "Diario libero + wiki scientifica"}
              novelty={sectionNovelty.supplements}
              onClick={() => setScreen("supplements")} />
          </div>
          <div data-tour="card-recovery">
            <Window3D icon={BedDouble} label="Recupero e Attività" accent={accent} floatClass="icon-float-3"
              sub={access.recovery
                ? (sleep.hours ? `${sleep.hours.toFixed(1)}h dormite · ${Number(steps || 0).toLocaleString("it-IT")} passi` : "Registra la notte")
                : ""}
              locked={!access.recovery} onLocked={onUpgrade}
              onClick={() => setScreen("recovery")} />
          </div>
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
    // Stesso punteggio di prontezza della Home (calcolato una sola volta più
    // sopra, vedi `readiness`): qui diventa un avviso concreto SOLO quando il
    // fattore più basso non è già il sonno (coperto dall'avviso sopra, più
    // specifico) — mai due avvisi sovrapposti per lo stesso giorno.
    const lowReadinessNonSleep = readiness && readiness.tone === "bad" && readiness.lowest?.key !== "sleep" && !poorSleep;
    const READINESS_ADVICE = {
      steps: "Sei stato molto fermo negli ultimi giorni: il corpo arriva alla sessione meno pronto a livello circolatorio. Un riscaldamento più lungo del solito aiuta.",
      motivation: "La motivazione registrata è bassa: valuta di iniziare dall'esercizio che ti piace di più invece che dal primo in scheda, o di accorciare leggermente la sessione.",
      fatigue: "La fatica percepita è alta: valuta di scendere di 1-2 RIR sull'ultima serie di ogni esercizio o di togliere una serie sugli esercizi più pesanti.",
    };
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
            {lowReadinessNonSleep && day.isTraining && (
              <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-start gap-3"
                   style={{ backgroundColor: "rgba(240,160,32,0.1)", border: "1px solid rgba(240,160,32,0.35)" }}>
                <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                <div>
                  <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {readiness.label} oggi ({readiness.score}/100)
                  </p>
                  <p className="meta mt-0.5" style={{ lineHeight: 1.5 }}>
                    {READINESS_ADVICE[readiness.lowest.key] || "Valuta una sessione più leggera del solito. Non serve saltarla."}
                  </p>
                </div>
              </div>
            )}
            {access.pro ? (
              <>
                <div className="flex justify-end mb-2">
                  <button onClick={() => setPdfExportOpen(true)} className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5"
                          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                    📄 Esporta PDF
                  </button>
                </div>
                {pdfExportOpen && <WorkoutPdfExport weekPlan={weekPlan} onClose={() => setPdfExportOpen(false)} />}
                <WorkoutCalendarStrip weekPlan={weekPlan} selectedIso={selectedCalendarIso} onSelectIso={setSelectedCalendarIso} doneDates={workoutDoneDates} />
                {selectedCalendarIso ? (
                  <CalendarDayReadOnlyView date={new Date(selectedCalendarIso)} weekPlan={weekPlan} />
                ) : workoutLoading ? (
                  // BUG PRESO: prima del primo fetch riuscito, weekPlan era
                  // sempre Array(7).fill(null) → isTraining sempre false →
                  // questa stessa schermata mostrava "giorno di riposo"
                  // anche in un giorno di allenamento vero, per poi cambiare
                  // di scatto appena arrivava il dato reale. Un caricamento
                  // non deve mai sembrare un risultato.
                  <div className="card text-center py-10">
                    <Loader2 size={24} className="animate-spin mx-auto mb-3" style={{ color: accent }} />
                    <p className="body">Carico la tua scheda di allenamento…</p>
                  </div>
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
                    {/* Riscaldamento & Mobilità (SCHEMA_v84): testo libero
                        scritto dal coach (a mano o dal generatore AI) in base
                        agli esercizi di oggi — mai serie/carichi da segnare,
                        solo da leggere prima di iniziare. */}
                    {day.warmup && (
                      <WarmupStretchCard icon="🔥" eyebrow="Prima di iniziare" title="Riscaldamento" text={day.warmup} />
                    )}
                    {exercises.map((ex, exIdx) => (
                      ex.kind === "cardio" ? (
                        // Cardio (SCHEMA_v84): il coach lo aggiunge a mano come
                        // una voce in più — solo nome + minuti, mai serie/
                        // carichi da monitorare come gli esercizi di forza.
                        <div key={ex.id} className="card flex items-center gap-3">
                          <span style={{ fontSize: "1.3rem" }} aria-hidden="true">🏃</span>
                          <div className="flex-1">
                            <p className="h2" style={{ fontSize: "1rem" }}>{ex.name}</p>
                            <p className="meta">Cardio</p>
                          </div>
                          <span className="font-data" style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
                            {ex.durationMin} min
                          </span>
                        </div>
                      ) : (
                        <SafeExerciseCard
                          key={ex.id}
                          ex={ex}
                          index={exIdx}
                          rows={setsFor(ex)}
                          onSetField={onSetField}
                          accent={accent}
                          accentText={accentText}
                          userPlan={userPlan}
                          schedaAddonChatActive={schedaAddonChatActive}
                          gender={profile.gender}
                          onUpgrade={onUpgrade}
                          onOpenChat={onOpenChat}
                          onCoachSync={onCoachSync}
                          supabase={supabase}
                          userId={userId}
                        />
                      )
                    ))}
                    {/* Stretching di fine sessione (SCHEMA_v84): stesso
                        principio del riscaldamento sopra, ma a chiusura
                        della lista esercizi invece che in apertura. */}
                    {day.stretching && (
                      <WarmupStretchCard icon="🧘" eyebrow="A fine sessione" title="Stretching" text={day.stretching} />
                    )}
                  </div>
                )}
                {/* "Come è andata oggi?" sopra il grafico del volume — prima
                    era condiviso e finiva sempre DOPO qualunque volume
                    (anche quello interno a FreeWorkoutBuilder), qui invece
                    precede il grafico di questo stesso piano di coaching. */}
                {day.isTraining && !selectedCalendarIso && (
                  <WorkoutFeedbackCard motivation={motivation} fatigue={fatigue}
                    onMotivationChange={setMotivation} onFatigueChange={setFatigue} accentText={accentText} />
                )}
                <div className="mt-4">
                  <VolumeMatrixCard weekDays={weekPlan} userPlan={userPlan} gender={profile.gender} onUpgrade={onUpgrade} accent={accent} supabase={supabase} userId={userId} />
                </div>
              </>
            ) : (
              <>
                {/* Boundary locale, non solo quella globale in main.jsx: un
                    crash qui non deve travolgere il resto dell'app — e con
                    l'autosave su localStorage sopra, anche un "Ricarica"
                    forzato da qui non perde più la routine in corso. */}
                <ErrorBoundary>
                  <FreeWorkoutBuilder accent={accent} accentText={accentText} accentSoft={accentSoft}
                                       day={day} onUpgrade={onUpgrade} onCoachSync={onCoachSync} userPlan={userPlan} gender={profile.gender}
                                       schedaAddonChatActive={schedaAddonChatActive}
                                       supabase={supabase} userId={userId} />
                </ErrorBoundary>
                {/* Disponibile a TUTTI i piani, non solo a fine giorno di
                    oggi (mai su un giorno passato aperto dal calendario). */}
                {day.isTraining && !selectedCalendarIso && (
                  <WorkoutFeedbackCard motivation={motivation} fatigue={fatigue}
                    onMotivationChange={setMotivation} onFatigueChange={setFatigue} accentText={accentText} />
                )}
              </>
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
              <LockedChartOverlay gender={profile.gender} onUpgrade={onUpgrade}
                title="🔒 SBLOCCA LA SCIENZA DIETRO IL TUO ALLENAMENTO"
                text="Volume, intensità, RIR, sovraccarico progressivo, deload: capisci il PERCHÉ dietro ogni serie che fai, non solo il cosa. Dal Premium (€5/mese) in su hai accesso completo, ricercabile, sempre aggiornato." />
            )}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ ALIMENTAZIONE ------------------------- */
  if (screen === "nutrition") {
    // Full Coaching: dieta tipo/target la fissa il coach. Tutti gli altri
    // piani (FREE, Premium, Scheda Personalizzata, Solo Allenamento
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
        <NutritionCalendarStrip weekPlan={weekPlan} selectedIso={selectedNutritionIso} onSelectIso={setSelectedNutritionIso} accent={accent} loggedDates={nutritionLoggedDates} />

        {selectedNutritionIso ? (
          <div className="rounded-2xl px-4 py-3.5 mb-5" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between gap-3 mb-3">
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
            {/* Totale calorie/macro DI QUEL GIORNO (non di oggi): ricalcolato a
                ogni render dai pastMeals già in stato, quindi sempre preciso
                quando si aggiunge/toglie/modifica un alimento — nessuna cache
                separata da tenere sincronizzata. */}
            {(() => {
              const dayTotals = Object.values(pastMeals || {}).flat().reduce(
                (a, i) => ({ kcal: a.kcal + (i.kcal || 0), p: a.p + (i.p || 0), c: a.c + (i.c || 0), f: a.f + (i.f || 0) }),
                { kcal: 0, p: 0, c: 0, f: 0 }
              );
              return (
                <div className="pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                  <p className="font-data mb-1.5" style={{ fontSize: "1.05rem", fontWeight: 800, color: accent }}>
                    {dayTotals.kcal}<span className="meta" style={{ fontSize: "0.62rem", fontWeight: 600, marginLeft: 4 }}>kcal totali quel giorno</span>
                  </p>
                  <div className="flex gap-3 font-data" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                    <span style={{ color: MACRO_COLORS.p.base }}>P {dayTotals.p}g</span>
                    <span style={{ color: MACRO_COLORS.c.base }}>C {dayTotals.c}g</span>
                    <span style={{ color: MACRO_COLORS.f.base }}>G {dayTotals.f}g</span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <>
            {/* I tuoi target + Idratazione: un unico riquadro, non più due
                card separate affiancate — stessi dati, meno dettagli visivi
                superflui, più pulito. "Modifica"/"Dettagli" espande il
                pannello completo (calcolo con le formule, o sola lettura se
                Full Coaching) qui sotto, senza lasciare la pagina. */}
            <div className="card mb-5">
              <p className="label mb-1.5">I tuoi target · oggi</p>
              {/* consumato/target per ciascun valore, non più solo "rimanenti":
                  il numero a sinistra (consumato) sale con calcolo preciso ad
                  ogni alimento aggiunto — stessa fonte (consumed) del diario.
                  Oro Lucido Vivo (title-shine), stesso trattamento usato per
                  ogni altro numero di risalto nell'app — non più un colore
                  piatto qui, era l'unico punto fuori standard. */}
              <p className="font-data mb-1.5" style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                <span className="title-shine">{consumed.kcal}</span><span style={{ fontSize: "0.85rem", fontWeight: 600, opacity: 0.75, color: "var(--ink)" }}>/{target.kcal}</span>
                <span className="meta" style={{ fontSize: "0.62rem", fontWeight: 600, marginLeft: 4 }}>kcal consumate</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-data mb-3" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                <span style={{ color: MACRO_COLORS.p.base }}>Proteine {consumed.p}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.p}g</span></span>
                <span style={{ color: MACRO_COLORS.c.base }}>Carboidrati {consumed.c}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.c}g</span></span>
                <span style={{ color: MACRO_COLORS.f.base }}>Grassi {consumed.f}<span style={{ opacity: 0.6, fontWeight: 500 }}>/{target.f}g</span></span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 mb-3" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  {/* Prima grigio neutro con icona blu spenta — si confondeva con
                      lo sfondo della card, niente segnalava che andava premuto
                      per registrare l'acqua. Ora blu acceso finché l'obiettivo
                      non è raggiunto (icona bianca a contrasto), oro a target
                      raggiunto — sempre riconoscibile come pulsante da toccare. */}
                  <button onClick={() => { haptic("tap"); onAddWater(); }} aria-label="Aggiungi 250 ml"
                          className="rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90"
                          style={{ width: 32, height: 32, backgroundColor: water >= waterTarget ? accent : "#0EA5E9", border: "1px solid var(--line)" }}>
                    <Droplets size={15} style={{ color: water >= waterTarget ? "#111111" : "#FFFFFF" }} />
                  </button>
                  <p className="font-data" style={{ color: "var(--ink)", fontSize: "0.85rem", fontWeight: 700 }}>
                    {(water / 1000).toFixed(2)}<span className="meta" style={{ fontWeight: 500 }}>/{(waterTarget / 1000).toFixed(1)} L</span>
                  </p>
                </div>
                <span className="label">Idratazione</span>
              </div>

              <button onClick={() => setTargetsOpen((v) => !v)}
                className="w-full rounded-full px-3 py-2 text-xs transition-transform active:scale-[0.98]"
                style={{ backgroundColor: targetsOpen ? "var(--ink)" : "var(--surface-2)",
                         color: targetsOpen ? "var(--page)" : "var(--ink-2)",
                         border: targetsOpen ? "none" : "1px solid var(--line)", fontWeight: 600 }}>
                {targetsOpen ? "Chiudi" : targetIsCoachSet ? "Dettagli" : "Modifica"}
              </button>
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
            mealGuide={mealGuide}
            onAddFood={selectedNutritionIso ? addFoodForPastDay : onAddFood}
            onRemoveFood={selectedNutritionIso ? removeFoodForPastDay : onRemoveFood}
            onUpdateFood={selectedNutritionIso ? updateFoodForPastDay : onUpdateFood}
            onOpenScanner={onOpenScanner} onAddCustomFood={onAddCustomFood}
            onCopyYesterday={selectedNutritionIso ? null : onCopyYesterday} supabase={supabase} userId={userId}
            fullAccess={targetIsCoachSet} isRealMode={isRealMode}
            subsAccess={userPlan === "performance_pack" || userPlan === "full_coaching"}
            onUpgrade={onUpgrade} onOpenChat={onOpenChat}
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
        {back("Integrazione")}
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

      {/* Bilancio energetico stimato: metabolismo basale (Mifflin-St Jeor,
          da peso/altezza/età/sesso — anamnesi + peso dell'ultimo check) +
          calorie attive stimate dai passi di oggi. Vedi
          computeEnergyExpenditure in ../lib/biometrics.js. Mai un numero
          quando mancano i dati per calcolarlo davvero: un invito onesto a
          completare l'anamnesi, non una stima "a occhio". */}
      <div className="card mb-4">
        <p className="label mb-3">Bilancio energetico stimato · oggi</p>
        {energyExpenditure.complete ? (
          <>
            <p className="font-data mb-1.5" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
              <span className="title-shine">{energyExpenditure.total.toLocaleString("it-IT")}</span>
              <span className="meta" style={{ fontSize: "0.62rem", fontWeight: 600, marginLeft: 4 }}>kcal stimate</span>
            </p>
            <div className="flex gap-4 font-data" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
              <span style={{ color: "var(--ink-2)" }}>Basale <b style={{ color: "var(--ink)" }}>{energyExpenditure.bmr.toLocaleString("it-IT")}</b></span>
              <span style={{ color: "var(--ink-2)" }}>Attività <b style={{ color: "var(--ink)" }}>+{energyExpenditure.activeKcal.toLocaleString("it-IT")}</b></span>
            </div>
            <p className="meta mt-2.5 leading-relaxed" style={{ fontSize: "0.68rem" }}>
              Metabolismo basale (formula di Mifflin-St Jeor) + calorie attive stimate dai passi di oggi — una stima, non
              una misura di calorimetria diretta. Non include l'allenamento coi pesi né altra attività non camminata.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
              {(energyExpenditure.missing.includes("weightKg") || energyExpenditure.missing.includes("heightCm") || energyExpenditure.missing.includes("age"))
                ? "Completa peso, altezza ed età per calcolarlo"
                : "Registra i passi di oggi per completare la stima"}
            </p>
            <p className="meta mt-1 leading-relaxed">
              Basta compilare l'anamnesi dal Profilo (o registrare il tuo primo check) per vedere qui il tuo dispendio
              energetico stimato — metabolismo basale più l'attività quotidiana.
            </p>
          </>
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
// "Canottaggio" (voga all'aperto) rimosso su richiesta esplicita: restava
// "Vogatore" da palestra (fermo, GPS inutile, ma con SPM/passo /500m — le
// metriche che chi voga davvero guarda) come unico macchinario a sé.
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
const GPS_CAPABLE = new Set(["corsa", "camminata", "bici"]);
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

// Icona del puntino "sei qui": prima del via mostra anche la direzione del
// telefono (bussola, vedi useDeviceHeading in GpsTrackerModal) ruotando la
// freccia — girando solo il telefono, senza muoversi, si capisce già verso
// dove si punta. headingDeg null (bussola non disponibile/non ancora
// concessa) mostra lo stesso puntino ma senza freccia orientata.
function meMarkerIcon(L, headingDeg) {
  const arrow = headingDeg == null ? "" :
    `<div style="position:absolute;inset:-7px;display:flex;align-items:center;justify-content:center;
                 transform:rotate(${headingDeg}deg);transition:transform 0.12s linear;">
       <svg width="13" height="13" viewBox="0 0 24 24" style="transform:translateY(-13px)">
         <path d="M12 2 L18 20 L12 15.5 L6 20 Z" fill="#2563EB" />
       </svg>
     </div>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:18px;height:18px;">
             <div style="width:18px;height:18px;border-radius:50%;background:#2563EB;border:3px solid #FFFFFF;
                         box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>
             ${arrow}
           </div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

/* Mappa del percorso — Leaflet + tile CARTO Positron (base OpenStreetMap,
   stile pulito e leggero pensato apposta per disegnarci sopra dati, molto
   più curato dei tile grezzi osm.org di prima), caricati SOLO qui (import
   dinamico) quando una mappa serve davvero. `live=true` ricentra la vista
   sull'ultimo punto ad ogni aggiornamento (tracciamento in corso);
   `live=false` inquadra l'intero percorso una volta sola (storico).
   `previewPoint`/`headingDeg`: posizione e direzione del telefono PRIMA di
   premere Inizia — richiesta esplicita, prima la mappa restava vuota/su
   Milano finché non si avviava davvero il tracciamento. */
function RouteMap({ points, live, accent, height = 220, guidePoints, previewPoint, headingDeg }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const guideLineRef = useRef(null); // percorso ad anello suggerito, tratteggiato, solo guida visiva
  const markerRef = useRef(null); // puntino blu della posizione attuale, solo live
  const previewMarkerRef = useRef(null); // puntino "sei qui" PRIMA del via, con freccia bussola
  const leafletRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      // attributionControl:false + controllo minimale con prefix:false: il
      // credito "Leaflet" (facoltativo, solo auto-promozione della libreria)
      // sparisce, resta solo quello legalmente dovuto ai fornitori dei tile
      // (OpenStreetMap/CARTO) — non l'ingombrante "Leaflet | © OpenStreetMap"
      // di prima, richiesta esplicita.
      const map = L.map(containerRef.current, { zoomControl: live, attributionControl: false, dragging: true, scrollWheelZoom: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
        maxZoom: 20, subdomains: "abcd",
      }).addTo(map);
      L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);
      const start = points?.[0] || previewPoint || { lat: 45.4642, lng: 9.19 }; // Milano come centro neutro se non c'è ancora un punto vero
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
      if (live && !points?.length && !previewPoint && navigator.geolocation) {
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
      // Il tracciamento vero è iniziato: il puntino "sei qui" pre-via non
      // serve più, il marker live sopra prende il suo posto.
      if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
      mapRef.current.panTo(lastLatLng);
    } else {
      mapRef.current.fitBounds(latlngs, { padding: [24, 24] });
    }
  }, [ready, points, live]);

  // Puntino "sei qui" + freccia bussola, SOLO prima che il tracciamento
  // abbia già i suoi punti veri (altrimenti l'effetto sopra ha già la
  // priorità e lo rimuove).
  useEffect(() => {
    if (!ready || !mapRef.current || points?.length) return;
    const L = leafletRef.current;
    if (!previewPoint) {
      if (previewMarkerRef.current) { previewMarkerRef.current.remove(); previewMarkerRef.current = null; }
      return;
    }
    const latlng = [previewPoint.lat, previewPoint.lng];
    if (!previewMarkerRef.current) {
      previewMarkerRef.current = L.marker(latlng, { icon: meMarkerIcon(L, headingDeg), zIndexOffset: 500 }).addTo(mapRef.current);
      mapRef.current.setView(latlng, 16);
    } else {
      previewMarkerRef.current.setLatLng(latlng);
      previewMarkerRef.current.setIcon(meMarkerIcon(L, headingDeg));
    }
  }, [ready, previewPoint, headingDeg, points]);

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

  // Posizione + direzione del telefono PRIMA di premere Inizia — richiesta
  // esplicita: prima la mappa restava vuota (o centrata su Milano) finché
  // non si avviava davvero il tracciamento, ora si vede subito dove ci si
  // trova e, girando il telefono, verso dove si punta.
  const [previewPos, setPreviewPos] = useState(null);
  const [headingDeg, setHeadingDeg] = useState(null);
  const [compassNeedsTap, setCompassNeedsTap] = useState(false); // iOS 13+: la bussola parte solo dopo un gesto esplicito dell'utente

  useEffect(() => {
    if (tracking || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPreviewPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silenzioso: niente preview se il permesso non c'è ancora, il vero errore arriva comunque al tap su Inizia
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tracking]);

  useEffect(() => {
    if (typeof DeviceOrientationEvent === "undefined") return undefined;
    // iOS Safari: webkitCompassHeading è già assoluto (0 = Nord, orario) —
    // il modo più affidabile, nessuna calibrazione richiesta lato nostro.
    // Altrove (Android/Chrome): alpha gira in senso opposto e non è
    // garantito assoluto rispetto al Nord — event.absolute===true è la
    // condizione che lo rende utilizzabile, altrimenti si scarta (meglio
    // nessuna freccia che una freccia sbagliata).
    const onOrientation = (e) => {
      if (typeof e.webkitCompassHeading === "number") setHeadingDeg(e.webkitCompassHeading);
      else if (e.absolute && e.alpha != null) setHeadingDeg((360 - e.alpha) % 360);
    };
    // iOS 13+ richiede un permesso esplicito concesso da un gesto utente
    // (un semplice addEventListener non basta, gli eventi non arriverebbero
    // mai): se l'API esiste, si mostra un pulsante dedicato invece di
    // richiederlo silenziosamente al mount (fallirebbe sempre).
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      setCompassNeedsTap(true);
      return undefined;
    }
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, []);

  const enableCompass = () => {
    DeviceOrientationEvent.requestPermission().then((state) => {
      if (state !== "granted") return;
      setCompassNeedsTap(false);
      const onOrientation = (e) => {
        if (typeof e.webkitCompassHeading === "number") setHeadingDeg(e.webkitCompassHeading);
        else if (e.absolute && e.alpha != null) setHeadingDeg((360 - e.alpha) % 360);
      };
      window.addEventListener("deviceorientation", onOrientation);
    }).catch(() => {});
  };

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
    // strade, resta il percorso grezzo — mai un dato inventato al posto di
    // quello vero.
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
          <RouteMap points={points} live accent={accent} height={260} guidePoints={suggestedRoute?.points}
            previewPoint={!tracking ? previewPos : null} headingDeg={headingDeg} />
          {snapping && (
            <div className="absolute inset-x-5 top-3 rounded-full px-3.5 py-2 flex items-center gap-2"
              style={{ backgroundColor: "rgba(17,17,17,0.85)", backdropFilter: "blur(6px)" }}>
              <Loader2 size={13} className="animate-spin" style={{ color: "#FFFFFF" }} />
              <span style={{ color: "#FFFFFF", fontSize: "0.72rem", fontWeight: 600 }}>Allineo il percorso alle strade reali…</span>
            </div>
          )}
          {/* iOS 13+ non concede mai l'accesso alla bussola senza un tap
              esplicito dell'utente — un pulsante discreto sopra la mappa,
              non un popup invadente al mount. */}
          {!tracking && compassNeedsTap && (
            <button onClick={enableCompass} type="button"
              className="absolute left-5 top-3 rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs"
              style={{ backgroundColor: "rgba(17,17,17,0.85)", backdropFilter: "blur(6px)", color: "#FFFFFF", fontWeight: 600 }}>
              <Navigation size={12} /> Attiva bussola
            </button>
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
                <Lock size={13} /> Percorsi ad anello suggeriti — dal Premium
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
          {/* BUG PRESO: usava var(--title-a)/var(--title-b) — le due tinte PIÙ
              CHIARE del gradiente a 3 tappe di title-shine (pensato per testo
              su sfondo scuro, non per uno sfondo pieno con testo bianco sopra)
              — risultato un oro/rosa lavato, testo poco leggibile. `accent`
              (già passato a questo componente) è lo stesso colore pieno
              lucido usato per ogni altra CTA primaria dell'app. */}
          <button onClick={() => setGpsOpen(true)} type="button"
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl px-4 py-4 text-sm mt-3 mb-3 btn-3d transition-transform active:scale-[0.98]"
            style={{
              backgroundColor: accent,
              color: "#FFFFFF", fontWeight: 800, boxShadow: `0 10px 24px -8px ${accent}88`,
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
   priorità.
   ------------------------------------------------------------------------- */

/* Guida di esecuzione: SOLO un match esatto sul nome (EXERCISE_BIOMECH,
   sotto) o la guida scritta dal coach (ex.howTo/avoid, SCHEMA_v61) — mai
   più un indovinello per parole chiave nel nome (es. "panca"/"curl"/
   "squat"...). Quel pattern-matching, su un esercizio inserito a mano dal
   coach o dal cliente con un nome che casualmente conteneva una di quelle
   parole, restituiva spesso una spiegazione sbagliata (es. un nome con
   "panca" dentro riceveva sempre la spiegazione della panca piana, anche
   se l'esercizio non c'entrava). Meglio nessuna guida che una guida
   sicura di sé ma sbagliata: ExerciseCard mostra un avviso discreto
   quando manca, invece di indovinare. */
function exactExerciseBiomech(name) {
  return EXERCISE_BIOMECH[name] || EXERCISE_BIOMECH[(name || "").trim()] || null;
}
function exerciseHowTo(name) { return exactExerciseBiomech(name)?.howTo || null; }
function exerciseAvoid(name) { return exactExerciseBiomech(name)?.avoid || null; }

/* Verde Oro: evidenzia i carichi record per dare motivazione visiva prima della serie. */
const RECORD_GOLD_GREEN = "#8CA832";

/* Navigazione cronologica dei carichi: disponibile per TUTTI i piani. Riusa
   gli array "history" già presenti su ogni esercizio (una voce = una settimana
   passata), per tracciare il sovraccarico progressivo nel lungo termine. */
/* Converte il giorno JS (0=Domenica) nella convenzione dell'app (0=Lunedì). */
function isoWeekdayOf(date) { const d = date.getDay(); return d === 0 ? 6 : d - 1; }

/* Esportazione PDF della scheda (richiesta esplicita): "pulsante dedicato
   per esportare e scaricare la scheda in un file PDF formattato, pulito e
   stampabile" — niente libreria di generazione PDF aggiunta al bundle (già
   segnalato pesante in build, vedi warning chunk >500kB): il browser stesso
   sa produrre un PDF vero da una pagina stampabile ("Salva come PDF" è una
   destinazione di stampa su ogni browser moderno, desktop e mobile). Questo
   componente monta un layout a tutto schermo pensato SOLO per la stampa
   (CSS .pdf-export-print in HomeDashboard qui sotto nasconde tutto il resto
   dell'app durante print, mostra solo lui) — il pulsante "Stampa / Salva
   PDF" chiama semplicemente window.print(). */
function WorkoutPdfExport({ weekPlan, onClose }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 overflow-y-auto pdf-export-print" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="no-print flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, backgroundColor: "#FFFFFF", zIndex: 1 }}>
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#111111" }}>
            <ArrowLeft size={16} /> Chiudi
          </button>
          <button onClick={() => window.print()} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ backgroundColor: "#111111", color: "#FFFFFF" }}>
            🖨️ Stampa / Salva PDF
          </button>
        </div>
        <div className="pdf-export-content max-w-2xl mx-auto px-6 py-8">
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#111111", marginBottom: "0.2rem" }}>PERFORM — Scheda di Allenamento</h1>
          <p style={{ fontSize: "0.8rem", color: "#6B7280", marginBottom: "1.6rem" }}>
            Settimana del {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          {weekPlan.every((d) => !d) ? (
            <p style={{ fontSize: "0.9rem", color: "#6B7280" }}>Nessun allenamento assegnato questa settimana.</p>
          ) : (
            weekPlan.map((day, i) => day && (
              <div key={i} style={{ marginBottom: "1.8rem", pageBreakInside: "avoid" }}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#111111", marginBottom: "0.6rem", borderBottom: "2px solid #111111", paddingBottom: "0.3rem" }}>
                  {WEEK_DAYS[i]} — {day.label || "Sessione"}
                </h2>
                {day.warmup && (
                  <p style={{ fontSize: "0.8rem", color: "#374151", marginBottom: "0.6rem" }}>
                    <strong>Riscaldamento:</strong> {day.warmup}
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #D1D5DB" }}>
                      {["Esercizio", "Serie", "Rep", "RIR", "Recupero", "Tecnica"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.35rem 0.4rem", color: "#6B7280", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(day.exercises || []).map((ex, j) => (
                      <tr key={ex.id || j} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111", fontWeight: 500 }}>{ex.name}</td>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111" }}>{ex.kind === "cardio" ? "—" : ex.sets}</td>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111" }}>{ex.kind === "cardio" ? `${ex.durationMin ?? "—"} min` : ex.reps}</td>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111" }}>{ex.kind === "cardio" ? "—" : (ex.rirTarget ?? "—")}</td>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111" }}>{ex.kind === "cardio" ? "—" : `${(ex.rests && ex.rests[0]) ?? "—"}s`}</td>
                        <td style={{ padding: "0.35rem 0.4rem", color: "#111111" }}>{ex.technique || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {day.stretching && (
                  <p style={{ fontSize: "0.8rem", color: "#374151", marginTop: "0.6rem" }}>
                    <strong>Stretching:</strong> {day.stretching}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Portal>
  );
}

/* Calendario orizzontale a scorrimento libero (drag/swipe): stesso sfondo
   scuro per ogni giorno (mai più un pillolo colorato pieno), solo il testo
   cambia colore — oggi lucido oro/rosa (title-shine), Giorno ON lucido
   verde (allenamento previsto), Giorno OFF bianco normale. Un pallino rosso
   sotto segnala un Giorno ON passato senza un allenamento REALMENTE
   completato (doneDates, dal vero storico — mai un pattern finto). Cliccando
   un giorno diverso da oggi si entra in Sola Lettura. */
function WorkoutCalendarStrip({ weekPlan, selectedIso, onSelectIso, doneDates }) {
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
        const missed = !isFuture && !isToday && isTrainingDay && !(doneDates?.has(iso));
        const selected = selectedIso ? iso === selectedIso : isToday;
        const textClass = isToday ? "title-shine" : isTrainingDay ? "green-shine" : "";

        return (
          <button key={iso} data-today={isToday ? "1" : "0"} onClick={() => onSelectIso(isToday ? null : iso)}
                  className="relative shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95"
                  style={{ width: 52, height: 60, backgroundColor: "var(--surface)",
                           border: `1.5px solid ${selected ? "var(--ink)" : "var(--line)"}` }}>
            <span className={textClass} style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.85,
                           color: textClass ? undefined : "var(--ink)" }}>
              {WEEK_DAYS[wd]}
            </span>
            <span className={textClass} style={{ fontSize: "1.05rem", fontWeight: 800, color: textClass ? undefined : "var(--ink)" }}>
              {d.getDate()}
            </span>
            {missed && <span className="absolute rounded-full" style={{ bottom: 6, width: 5, height: 5, backgroundColor: "#EF4444" }} aria-label="Allenamento saltato" />}
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

  // BUG PRESO/RICHIESTA: prima c'era un riquadro che ripeteva la data già
  // visibile (evidenziata) sulla striscia calendario sopra — ridondante — e
  // un giorno futuro mostrava sempre "nessun carico" anche quando esisteva
  // uno storico reale. Scheda pulita: solo nome sessione ed esercizi; un
  // giorno futuro mostra l'ULTIMO carico mai registrato per quell'esercizio
  // (utile per sapere da dove ripartire), un giorno passato specifico mostra
  // il carico di QUELLA settimana esatta — "nessun carico ancora
  // registrato" resta solo quando lo storico è davvero vuoto.
  return (
    <div className="space-y-3">
      {!dayData ? (
        <div className="card text-center py-8">
          <BedDouble size={22} className="mx-auto mb-2" style={{ color: "var(--ink-2)" }} />
          <p className="body">Giorno di riposo secondo lo split.</p>
        </div>
      ) : (
        <>
          <p className="h2">{dayData.label}</p>
          {dayData.warmup && (
            <WarmupStretchCard icon="🔥" eyebrow="Prima di iniziare" title="Riscaldamento" text={dayData.warmup} />
          )}
          {dayData.exercises.map((ex) => {
            if (ex.kind === "cardio") {
              return (
                <div key={ex.id || ex.name} className="card flex items-center gap-3">
                  <span style={{ fontSize: "1.3rem" }} aria-hidden="true">🏃</span>
                  <div className="flex-1">
                    <p className="h2" style={{ fontSize: "1rem" }}>{ex.name}</p>
                    <p className="meta">Cardio</p>
                  </div>
                  <span className="font-data" style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
                    {ex.durationMin} min
                  </span>
                </div>
              );
            }
            const hist = ex.history || [];
            const entry = isFuture ? hist[hist.length - 1] : hist[hist.length - weeksAgo];
            return (
              <div key={ex.id || ex.name} className="card">
                <p className="h2 mb-1" style={{ fontSize: "1rem" }}>{ex.name}</p>
                <p className="meta mb-2">{formatSetsReps(ex.sets, ex.reps)} previste</p>
                {entry ? (
                  <div className="inner px-4 py-3.5 flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {isFuture ? "Ultimo carico registrato" : "Carico registrato"}
                    </span>
                    <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)" }}>
                      {entry.kg} kg <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>× {entry.reps} reps</span>
                    </span>
                  </div>
                ) : (
                  <p className="meta">Nessun carico ancora registrato.</p>
                )}
              </div>
            );
          })}
          {dayData.stretching && (
            <WarmupStretchCard icon="🧘" eyebrow="A fine sessione" title="Stretching" text={dayData.stretching} />
          )}
        </>
      )}
    </div>
  );
}

/* Stesso principio del calendario Allenamento (WorkoutCalendarStrip), qui per
   l'Alimentazione: una striscia di giorni — passati, oggi E futuri, come su
   Allenamento — su cui tornare per aggiungere un pasto dimenticato o vedere
   in anticipo il target di un giorno che deve ancora arrivare. Stesso sfondo
   scuro per ogni giorno, solo il testo cambia colore: oggi lucido oro/rosa,
   Giorno ON lucido verde, Giorno OFF bianco normale. Un pallino rosso sotto
   segnala un giorno passato senza nemmeno un pasto registrato. */
function NutritionCalendarStrip({ weekPlan, selectedIso, onSelectIso, accent, loggedDates }) {
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
        const isOn = !!weekPlan[wd];
        const missed = !isFuture && !isToday && !(loggedDates?.has(iso));
        const selected = selectedIso ? iso === selectedIso : isToday;
        const textClass = isToday ? "title-shine" : isOn ? "green-shine" : "";

        return (
          <button key={iso} data-today={isToday ? "1" : "0"} onClick={() => onSelectIso(isToday ? null : iso)}
                  className="relative shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95"
                  style={{ width: 52, height: 60, backgroundColor: "var(--surface)",
                           border: `1.5px solid ${selected ? "var(--ink)" : "var(--line)"}` }}>
            <span className={textClass} style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.85,
                           color: textClass ? undefined : "var(--ink)" }}>
              {WEEK_DAYS[wd]}
            </span>
            <span className={textClass} style={{ fontSize: "1.05rem", fontWeight: 800, color: textClass ? undefined : "var(--ink)" }}>
              {d.getDate()}
            </span>
            {missed && <span className="absolute rounded-full" style={{ bottom: 6, width: 5, height: 5, backgroundColor: "#EF4444" }} aria-label="Nessun pasto registrato" />}
          </button>
        );
      })}
    </div>
  );
}

/* Riga di una serie di una sessione PASSATA, modificabile in loco: corregge un
   carico/reps dimenticati di segnare durante l'allenamento. Salva subito su
   workout_sets via logWorkoutSet (stessa upsert usata durante la sessione
   live) — nessuno stato "in sospeso" da confermare altrove. */
function PastSetRow({ workoutLogId, set, supabase, userId }) {
  const [editing, setEditing] = useState(false);
  const [kg, setKg] = useState(set.kg ?? "");
  const [reps, setReps] = useState(set.reps ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await logWorkoutSet(supabase, workoutLogId, userId, set.setNumber, {
        repsCompleted: reps === "" ? null : Number(reps),
        loadKg: kg === "" ? null : Number(kg),
        rir: set.rir ?? null, // preserva il RIR già registrato, mai azzerato da una correzione kg/reps
      });
      setEditing(false);
    } catch (err) {
      // BUG PRESO: un fallimento qui restava solo in console — l'editor
      // rimaneva aperto senza nessuna spiegazione, sembrava che il tap su
      // "salva" non avesse fatto nulla.
      console.error("PERFORM: errore correzione serie passata", err);
      setError("Non sono riuscito a salvare — riprova.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-12 gap-2 items-center">
        <span className="col-span-2 text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>S{set.setNumber}</span>
        {editing ? (
          <>
            <input type="number" min="0" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus
                   className="col-span-4 input w-full px-2 py-2 text-center text-sm" aria-label={`kg serie ${set.setNumber}`} />
            <input type="number" min="0" value={reps} onChange={(e) => setReps(e.target.value)}
                   className="col-span-4 input w-full px-2 py-2 text-center text-sm" aria-label={`reps serie ${set.setNumber}`} />
            <button onClick={save} disabled={saving} className="col-span-2 flex items-center justify-center" aria-label="Salva correzione">
              {saving ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--ink-2)" }} /> : <Check size={18} style={{ color: "#10B981" }} />}
            </button>
          </>
        ) : (
          <>
            <span className="col-span-4 text-center text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{set.kg != null ? `${set.kg} kg` : "—"}</span>
            <span className="col-span-4 text-center text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{set.reps != null ? `${set.reps} reps` : "—"}</span>
            <button onClick={() => setEditing(true)} className="col-span-2 flex items-center justify-center" aria-label={`Modifica serie ${set.setNumber}`}>
              <Pencil size={14} style={{ color: "var(--ink-2)" }} />
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}

/* Una sessione passata intera: data + tutte le serie (non solo il top set),
   ognuna modificabile singolarmente via PastSetRow.
   missed=true: giorno assegnato ma mai registrato (nessuna serie salvata
   finora, vedi missedByExerciseName in coachingData.js) — le stesse righe
   PastSetRow partono vuote invece che precompilate, e lo stesso
   logWorkoutSet le CREA alla prima modifica invece di correggerle: nessuna
   distinzione di codice serve tra "correggi" e "registra da zero", solo
   un'etichetta diversa per far capire all'atleta perché è tutto vuoto. */
function PastSessionCard({ session, supabase, userId, missed = false }) {
  const label = new Date(`${session.date}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="inner px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="meta" style={{ fontWeight: 700 }}>{label}</p>
        {missed && (
          <span className="text-xs" style={{ fontWeight: 700, color: "#D97706" }}>
            Mai registrato
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {session.sets.map((s) => (
          <PastSetRow key={s.setNumber} workoutLogId={session.workoutLogId} set={s} supabase={supabase} userId={userId} />
        ))}
      </div>
    </div>
  );
}

// BUG PRESO (segnalato): "esco dall'app (es. Spotify) e rientro, il timer
// sparisce o si azzera" — il timer di recupero viveva SOLO come stato React
// in memoria (un countdown a scalare, un secondo alla volta). Un cambio app
// breve su mobile spesso ricarica la pagina PWA da zero al rientro, che
// azzera qualunque stato React incluso questo; anche senza reload completo,
// un setInterval in background viene sospeso dai browser mobile e non
// recupera mai i secondi persi. Fix: un solo timer di recupero "attivo" per
// volta, salvato in localStorage come timestamp assoluto di fine (endAt) —
// sopravvive a reload/chiusura perché al rientro basta ricalcolare quanto
// manca rispetto all'orologio di sistema, mai contare "quanti tick ho perso".
const REST_TIMER_KEY = "perform_rest_timer";
function readRestTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(REST_TIMER_KEY) || "null");
    if (!saved || typeof saved.endAt !== "number" || typeof saved.total !== "number" || !saved.exerciseId) return null;
    return saved;
  } catch { return null; }
}
function writeRestTimer(entry) {
  try {
    if (entry) localStorage.setItem(REST_TIMER_KEY, JSON.stringify(entry));
    else localStorage.removeItem(REST_TIMER_KEY);
  } catch { /* best-effort, mai bloccare il timer per questo */ }
}

// Sincronizza (best-effort, mai bloccante) rest_timer_notifications lato
// server con lo stato del timer locale qui sopra: la Edge Function
// rest-timer-push (cron ogni minuto, vedi le sue istruzioni di deploy) la
// legge per mandare un push reale quando l'app è chiusa o in background
// troppo a lungo per avvisare da sola (beep/vibrazione/Notification()
// locale, che restano il meccanismo primario mentre l'app è aperta).
// Upsert quando il timer parte, cancellazione quando finisce mentre l'app è
// ancora aperta (il push non serve più, l'atleta l'ha già visto/sentito
// qui) o quando viene annullato a mano. Fallisce in silenzio: il countdown
// locale resta la fonte di verità primaria, mai bloccato da un problema di
// rete verso questa sincronizzazione secondaria.
function syncRestTimerNotification(supabase, userId, entry) {
  if (!supabase || !userId) return;
  if (entry) {
    supabase.from("rest_timer_notifications")
      .upsert({ user_id: userId, fire_at: new Date(entry.endAt).toISOString(), exercise_name: entry.exerciseName }, { onConflict: "user_id" })
      .then(({ error }) => { if (error) console.error("PERFORM: errore salvataggio promemoria push timer di recupero", error); });
  } else {
    supabase.from("rest_timer_notifications").delete().eq("user_id", userId)
      .then(({ error }) => { if (error) console.error("PERFORM: errore cancellazione promemoria push timer di recupero", error); });
  }
}

// Riscaldamento/stretching: collassati di default (richiesta esplicita —
// occupavano spazio anche quando l'atleta non ha bisogno di rileggerli ogni
// volta), un tap apre il testo intero scritto dal coach. L'etichetta breve
// aggiunge il distretto SOLO se riconoscibile dal testo (guessBodyFocusLabel),
// mai un'etichetta inventata.
function WarmupStretchCard({ icon, eyebrow, title, text }) {
  const [open, setOpen] = useState(false);
  const focus = guessBodyFocusLabel(text);
  return (
    <div className="card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="label mb-0.5">{eyebrow}</p>
          <p className="h2" style={{ fontSize: "0.95rem" }}>{icon} {title}{focus ? ` ${focus}` : ""}</p>
        </div>
        {open ? <ChevronUp size={16} style={{ color: "var(--ink-2)" }} className="shrink-0" /> : <ChevronDown size={16} style={{ color: "var(--ink-2)" }} className="shrink-0" />}
      </button>
      {open && <p className="body mt-2" style={{ whiteSpace: "pre-line" }}>{text}</p>}
    </div>
  );
}

// Rete di sicurezza per-esercizio: un boundary locale (vedi ErrorBoundary.jsx,
// fallback opzionale) attorno a OGNI singola card, non più solo quello
// globale in main.jsx. BUG PRESO: dati reali imprevedibili (scheda coach,
// routine libera, template applicati — provenienze diverse, forme diverse)
// hanno già fatto crashare ExerciseCard più volte per proprietà mancanti non
// ancora previste; con un solo boundary globale QUALUNQUE crash su UN
// esercizio smontava l'intera pagina Allenamento ("Qualcosa è andato
// storto" a schermo intero). Ora un problema resta isolato alla sua card:
function ExerciseCard({ ex, index, rows, onSetField, accent, accentText, userPlan, schedaAddonChatActive, gender, onUpgrade, onOpenChat, onCoachSync, supabase, userId }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [timer, setTimer] = useState(null); // { total, remaining, endAt } — endAt: epoch ms di fine, fonte di verità

  // Ripristina un timer già in corso per QUESTO esercizio al mount — copre
  // sia il rientro in un tab già aperto (setTimer perso per unmount/remount
  // di ExerciseCard) sia un reload completo della pagina.
  useEffect(() => {
    const saved = readRestTimer();
    if (!saved || saved.exerciseId !== ex.id) return;
    const remaining = Math.ceil((saved.endAt - Date.now()) / 1000);
    if (remaining > 0) setTimer({ total: saved.total, remaining, endAt: saved.endAt });
    else writeRestTimer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [prToast, setPrToast] = useState(null);

  const isMaxEffort = index < 2;
  const peak = Math.max(0, ...rows.map((r) => Number(r.kg) || 0));
  // "8-10" = stesso range per tutte le serie. "8/12" = target diverso per
  // ogni serie (prima 8, seconda 12). Vedi parseRepsTarget (coachingData.js).
  // BUG PRESO (schermata nera "Qualcosa è andato storto" su Allenamento):
  // ex.reps arriva da fonti diverse (scheda coach, routine libera, template)
  // — non sempre garantito essere una stringa. .includes("/") su un ex.reps
  // numerico mandava in crash l'intera card (e quindi l'intera schermata,
  // niente error boundary locale). String(...) prima di ogni uso rende
  // questo robusto qualunque sia il tipo originale, come già fa
  // parseRepsTarget/formatSetsReps in coachingData.js.
  const repsStr = ex.reps == null ? "" : String(ex.reps);
  const repsTargets = useMemo(() => parseRepsTarget(repsStr, ex.sets), [repsStr, ex.sets]);
  const hasPerSetTargets = repsStr.includes("/");
  // Guida: SOLO quella scritta dal coach (ex.howTo/avoid, libreria condivisa)
  // o un match esatto sul nome (exerciseHowTo/exerciseAvoid) — mai un
  // indovinello. hasGuide === false è uno stato legittimo (esercizio non
  // ancora documentato), non un errore da nascondere con un fallback.
  const howTo = ex.howTo || exerciseHowTo(ex.name);
  const avoid = ex.avoid || exerciseAvoid(ex.name);
  const hasGuide = Boolean(howTo);
  // Chat col coach: riservata a chi ha davvero un coach dietro (Scheda
  // Personalizzata, Coaching Allenamento, Full Coaching) — stessa fonte
  // unica di App.jsx (isRealCoachingPlan, coachingData.js), non più una
  // terza copia hardcoded della stessa condizione.
  const hasCoachChat = isRealCoachingPlan(userPlan) || schedaAddonChatActive;

  /* Storico: historyEntries resta il TOP SET per sessione (serve solo al
     confronto record/PR toast qui sotto, mai mostrato da solo all'atleta —
     richiesta esplicita: "fai vedere tutte le serie non solo il top set"). */
  const historyEntries = (ex.history || []).map((h) => (typeof h === "object" ? h : { kg: h, reps: null }));
  const best = historyEntries.length ? Math.max(...historyEntries.map((h) => h.kg)) : 0;
  // Scorsa sessione per intero (TUTTE le serie, non solo la prima o il top
  // set): ex.setHistory è già ordinato dal più recente (vedi
  // fetchWeekExerciseHistories in coachingData.js), quindi [0] è l'ultima volta.
  const lastSession = ex.setHistory && ex.setHistory.length > 0 ? ex.setHistory[0] : null;
  const lastSessionSets = lastSession ? lastSession.sets.filter((s) => s.kg != null && s.kg > 0) : [];

  const complete = (r) => r.kg !== "" && r.reps !== "";
  const curIdx = rows.findIndex((r) => !complete(r));
  const restIdx = curIdx === -1 ? rows.length - 1 : curIdx;
  const rest = ex.rests?.[restIdx] ?? 120;
  const fmtRest = (s) => (s < 60 ? `${s}″` : s % 60 === 0 ? `${s / 60}′` : `${Math.floor(s / 60)}′${String(s % 60).padStart(2, "0")}″`);
  const fmtMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const syncToCoach = (payload) =>
    onCoachSync && onCoachSync({ type: "workout", exercise: ex.name, exerciseId: ex.id, ...payload });

  /* Smart Rest Timer: alla spunta di completamento di una serie parte in automatico
     il conto alla rovescia tarato sul recupero previsto; al termine, feedback aptico.
     Richiesta esplicita: un beep ogni secondo negli ultimi 10 secondi, per
     prepararsi alla serie successiva, più un tentativo di notifica se il
     recupero finisce mentre l'app è in background (cambio app/schermata per
     un secondo). BUG NOTO E DOCUMENTATO (vedi useTodayIso più sopra in questo
     stesso file): un tab/PWA in background viene sospeso dal browser mobile,
     questo stesso setInterval compreso — la notifica qui sotto parte solo se
     il browser lascia ancora eseguire questo codice in quel momento (di solito
     vero per un cambio app breve, non garantito se il telefono si blocca o
     resta in background a lungo: stessa identica limitazione già accettata
     per il vecchio promemoria integratori locale, prima della push reale). */
  useEffect(() => {
    if (!timer) return undefined;
    const endAt = timer.endAt;
    // BUG PRESO: ricalcola SEMPRE il tempo rimanente da endAt (timestamp
    // assoluto) confrontato con l'orologio di sistema, invece di scalare un
    // contatore un secondo alla volta — così un setInterval sospeso o
    // ritardato dal browser (tab in background, telefono che si blocca) non
    // perde mai la sincronizzazione: al prossimo tick, o al rientro
    // (visibilitychange), il countdown mostra il valore corretto in un colpo,
    // mai "recuperato" ticchettando in fretta o congelato al vecchio valore.
    let lastBeepedSecond = null;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining <= 0) {
        try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (err) { /* non supportato: nessun problema */ }
        playRestTick(0);
        if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("Recupero finito", { body: `${ex.name}: è ora della prossima serie.`, tag: "rest-timer" }); } catch (err) { /* best-effort */ }
        }
        writeRestTimer(null);
        syncRestTimerNotification(supabase, userId, null); // finito con l'app aperta: il push non serve più
        setTimer(null);
        return;
      }
      if (remaining <= 10 && remaining !== lastBeepedSecond) {
        lastBeepedSecond = remaining;
        playRestTick(remaining);
      }
      setTimer((t) => (t && t.endAt === endAt ? { ...t, remaining } : t));
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [timer?.endAt, ex.name, supabase, userId]);

  // Registrazione automatica: niente più spunta manuale — appena kg e reps
  // sono entrambi inseriti la serie si considera fatta. Il confronto è per
  // VALORE (non solo "completa sì/no") così un ritocco a una serie già
  // completa la ri-salva senza far ripartire il timer una seconda volta;
  // il timer e il controllo record partono solo al primo passaggio a
  // "completa", il salvataggio invece segue ogni correzione successiva.
  const prevRowsRef = useRef(rows.map((r) => ({ kg: r.kg, reps: r.reps })));
  useEffect(() => {
    rows.forEach((r, i) => {
      const prev = prevRowsRef.current[i] || { kg: "", reps: "" };
      const isComplete = complete(r);
      const wasComplete = prev.kg !== "" && prev.reps !== "";
      const valueChanged = prev.kg !== r.kg || prev.reps !== r.reps;
      if (!isComplete || !valueChanged) return;

      syncToCoach({ kind: "set-completed", rowIndex: i, row: r });
      if (!wasComplete) {
        // BUG PRESO: completare una serie — l'azione più frequente di tutta
        // l'app — non dava MAI un haptic, nonostante sia l'esempio d'uso
        // esplicito nell'header di haptics.js ("completa serie"). Altre
        // azioni molto meno frequenti (acqua, cibo, cardio) lo avevano già.
        haptic("confirm");
        const dur = ex.rests?.[i] ?? 120;
        const endAt = Date.now() + dur * 1000;
        setTimer({ total: dur, remaining: dur, endAt });
        writeRestTimer({ total: dur, endAt, exerciseId: ex.id, exerciseName: ex.name });
        syncRestTimerNotification(supabase, userId, { endAt, exerciseName: ex.name });
        // Celebrazione automatica: questa serie appena completata batte il
        // carico massimo storico di questo esercizio (mai il primo giorno
        // registrato, best === 0 non è un vero confronto).
        const kg = Number(r.kg) || 0;
        if (best > 0 && kg > best) {
          setPrToast({ key: Date.now(), exerciseName: ex.name, prevBest: best, kg });
          setTimeout(() => setPrToast(null), 7000);
        }
      }
    });
    prevRowsRef.current = rows.map((r) => ({ kg: r.kg, reps: r.reps }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const ringR = 27, ringC = 2 * Math.PI * ringR;
  const ringOffset = timer ? ringC * (1 - timer.remaining / timer.total) : 0;

  // Entry point per correggere/recuperare serie passate: si clicca il nome
  // dell'esercizio stesso, non più un pannello separato più in basso —
  // richiesta esplicita, e più naturale: "voglio sistemare QUESTO esercizio"
  // parte proprio dal suo nome.
  const canRecoverHistory = Boolean(((ex.setHistory && ex.setHistory.length > 0) || (ex.missedSessions && ex.missedSessions.length > 0)) && supabase && userId);

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

      {canRecoverHistory ? (
        <button onClick={() => setHistoryOpen((v) => !v)} className="flex items-center gap-1.5 text-left">
          <span className="h2" style={{ textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "var(--ink-2)", textUnderlineOffset: 3 }}>
            {ex.name}
          </span>
          <History size={13} style={{ color: "var(--ink-2)" }} />
          {ex.missedSessions && ex.missedSessions.length > 0 && (
            <span className="text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
              ({ex.missedSessions.length} da recuperare)
            </span>
          )}
        </button>
      ) : (
        <p className="h2">{ex.name}</p>
      )}
      {/* Riga compatta unica: "2x6-8 RIR0 120sec" — richiesta esplicita, si
          legge a colpo d'occhio, niente "Tecnica: ..." (enum di 5 valori
          brevi, ridondante qui) né testo prolisso. */}
      <p className="meta mt-0.5 font-data">
        {hasPerSetTargets
          ? repsTargets.map((t, i) => `S${i + 1}: ${t}`).join(" · ")
          : formatSetsReps(ex.sets, ex.reps)} RIR{ex.rirTarget} {ex.rests?.[0] ?? 120}sec
      </p>
      {/* "Scorsa sessione": kg×reps per ogni serie, senza fronzoli (niente
          "record da battere" — il badge 🏆 RECORD sopra basta già). */}
      <p className="mt-1 text-sm font-data" style={{ color: "var(--ink-2)" }}>
        Scorsa:{" "}
        <span style={{ color: "var(--ink)", fontWeight: 700 }}>
          {lastSessionSets.length > 0 ? lastSessionSets.map((s) => `${s.kg}x${s.reps}`).join(" ") : "n/d"}
        </span>
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink)" }}>
        <Timer size={13} style={{ color: accent }} />
        {curIdx === -1 ? "Serie completate" : `Serie ${restIdx + 1}`} · Rest{" "}
        <span style={{ color: accentText, fontWeight: 700 }}>{fmtRest(rest)}</span>
      </p>

      {/* serie */}
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <span className="col-span-2 label">Serie</span>
          {["Kg", "Reps"].map((h) => <span key={h} className="col-span-4 label text-center">{h}</span>)}
          <span className="col-span-2 label text-center">✓</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <span className="col-span-2 text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>S{i + 1}</span>
            {["kg", "reps"].map((f) => (
              <input key={f} type="number" min="0" value={row[f]}
                     onChange={(e) => onSetField(ex, i, f, e.target.value)}
                     placeholder={f === "reps" ? repsTargets[i] : undefined}
                     className="col-span-4 input w-full px-2 py-2.5 text-center text-sm"
                     aria-label={f === "reps" && repsTargets[i] ? `reps serie ${i + 1} di ${ex.name}, target ${repsTargets[i]}` : `${f} serie ${i + 1} di ${ex.name}`} />
            ))}
            {/* Non più un pulsante: la serie si registra da sola appena kg e
                reps sono compilati (vedi l'effetto sopra) — questo è solo
                un riflesso passivo di quello stato, niente da toccare qui. */}
            <span className="col-span-2 flex items-center justify-center" aria-hidden="true">
              {complete(row)
                ? <CheckCircle2 size={20} style={{ color: accent }} />
                : <span className="rounded-full" style={{ width: 18, height: 18, border: "1.5px solid var(--ink-2)", display: "block" }} />}
            </span>
          </div>
        ))}
      </div>

      {/* Smart Rest Timer: countdown circolare automatico non appena la serie è completa */}
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
          <button onClick={() => { setTimer(null); writeRestTimer(null); syncRestTimerNotification(supabase, userId, null); }} className="shrink-0 label" style={{ fontSize: "0.6rem" }}>
            salta
          </button>
        </div>
      )}

      {/* Guida esecuzione: bottone discreto, visibile a tutti (Free, Paid,
          Coaching) — il contenuto dietro cambia per piano. Titolo piccolo e
          sobrio, non più a tutto maiuscolo con emoji vistose. */}
      <div className="mt-3">
        <button onClick={() => setGuideOpen((v) => !v)}
                className="w-full flex items-center justify-between rounded-2xl px-3.5 py-2.5 transition-all duration-300"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
            <Search size={13} style={{ color: "var(--ink-2)" }} />
            Guida all'esecuzione
          </span>
          {guideOpen ? <ChevronUp size={14} style={{ color: "var(--ink-2)" }} /> : <ChevronDown size={14} style={{ color: "var(--ink-2)" }} />}
        </button>

        {guideOpen && userPlan === "free" && (
          <div className="spring-in mt-2">
            <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
              title="Contenuto riservato agli abbonati"
              text="La guida biomeccanica di ogni esercizio (come eseguirlo, cosa evitare, ed eventuale video del coach) è inclusa dal Premium in su. Con Scheda Personalizzata, Coaching Allenamento o Full Coaching hai anche una chat privata diretta col coach per farti correggere." />
          </div>
        )}

        {guideOpen && userPlan !== "free" && (
          <div className="spring-in inner p-4 mt-2 space-y-4">
              {hasGuide ? (
                <>
                  <div>
                    <p className="label mb-1.5" style={{ color: "#10B981" }}>🟢 COME SI ESEGUE</p>
                    <p className="body text-sm">{howTo}</p>
                  </div>
                  {avoid && (
                    <div>
                      <p className="label mb-1.5" style={{ color: "#DC2626" }}>🔴 COSA EVITARE</p>
                      <p className="body text-sm">{avoid}</p>
                    </div>
                  )}
                  {ex.videoUrl && (
                    <div>
                      <p className="label mb-1.5">🎥 VIDEO DEL COACH</p>
                      <video src={ex.videoUrl} controls className="w-full rounded-xl" style={{ maxHeight: 220 }} />
                    </div>
                  )}
                </>
              ) : (
                <p className="meta text-sm" style={{ lineHeight: 1.5 }}>
                  Il coach non ha ancora scritto la guida per questo esercizio specifico
                  {hasCoachChat ? " — chiedigli pure direttamente in chat." : "."}
                </p>
              )}

              {hasCoachChat && (
                <button onClick={onOpenChat} disabled={!onOpenChat}
                        className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full transition-transform active:scale-[0.98]"
                        style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
                  <MessageCircle size={15} style={{ color: "#FFFFFF" }} />
                  Chat con il coach
                </button>
              )}
          </div>
        )}
      </div>

      {/* Sessioni precedenti: non solo il top set (com'era prima) ma OGNI
          serie svolta, modificabile — utile per correggere un carico/reps che
          ci si è scordati di segnare al momento (richiesta esplicita).
          Include anche i giorni assegnati ma MAI registrati (missedSessions,
          status "missed" mai toccato): capita di allenarsi davvero e
          scordarsi di segnarlo in app — qui si recupera invece di perderlo
          per sempre, con le stesse righe usate per correggere una sessione
          già fatta (vedi nota su PastSessionCard). Si apre/chiude cliccando
          il nome dell'esercizio qui sopra, non più un pannello a sé. */}
      {canRecoverHistory && (
        <div className="mt-3">
          {historyOpen && (
            <div className="spring-in mt-2 space-y-2">
              {(ex.missedSessions ?? []).map((m) => (
                <PastSessionCard
                  key={m.workoutLogId}
                  missed
                  session={{
                    workoutLogId: m.workoutLogId,
                    date: m.date,
                    sets: Array.from({ length: m.setsCount || 1 }, (_, i) => ({ setNumber: i + 1, kg: null, reps: null, rir: null })),
                  }}
                  supabase={supabase} userId={userId}
                />
              ))}
              {(ex.setHistory ?? []).map((session) => (
                <PastSessionCard key={session.workoutLogId} session={session} supabase={supabase} userId={userId} />
              ))}
            </div>
          )}
        </div>
      )}
      <PRCelebrationToast toast={prToast} />
    </div>
  );
}

// React.memo: una schermata Allenamento può avere 10-15+ ExerciseCard nella
// stessa lista, e il componente padre (500+ righe di stato per tutta la
// schermata Home) ricrea qualcosa a OGNI interazione, anche in una sezione
// non correlata (Alimentazione, un toast XP...). Senza memo ogni card
// intera si ri-renderizza a ogni singola digitazione ovunque nella
// schermata — con onSetField/onCoachSync ora stabilizzati (useCallback,
// vedi sopra) il confronto shallow delle props regge davvero: una card si
// ri-renderizza solo quando i SUOI dati cambiano, non quelli di un'altra.
const MemoExerciseCard = React.memo(ExerciseCard);

function SafeExerciseCard(props) {
  return (
    <ErrorBoundary fallback={
      <div className="card">
        <p className="body text-sm" style={{ color: "var(--ink-2)" }}>
          Non sono riuscito a mostrare "{props.ex?.name || "questo esercizio"}" — riprova più tardi o contatta il coach se il problema resta.
        </p>
      </div>
    }>
      <MemoExerciseCard {...props} />
    </ErrorBoundary>
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

// BUG PRESO (segnalato): la routine costruita qui (giorni/esercizi/serie di
// "La Mia Routine", piano Free/Premium autogestito) non veniva MAI
// scritta da nessuna parte — solo stato React locale. Un reload qualunque
// (l'app riavviata, il tab ucciso in background da Android per liberare
// RAM, un crash imprevisto catturato da ErrorBoundary più in alto)
// cancellava ore di lavoro senza preavviso: è così che un cliente non è
// riuscito a impostare i suoi esercizi. Salvataggio reale su Supabase è un
// progetto più grande (nuova tabella, RLS) — qui, subito, un autosave su
// localStorage per singolo utente: niente più lavoro perso a un reload,
// qualunque sia la causa del reload.
function freeRoutineStorageKey(userId) {
  return `perform_free_routine_${userId || "demo"}`;
}
function loadFreeRoutine(userId) {
  try {
    const raw = localStorage.getItem(freeRoutineStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) return null;
    return parsed;
  } catch {
    return null; // JSON corrotto o privacy mode: si riparte da vuoto, mai un crash
  }
}

/* Catalogo split (SCHEMA_v59 + SCHEMA_v71): richiesta esplicita — chi si
   costruisce la routine da solo (Free/Premium) non deve inventarsi uno
   split da zero né indovinare i muscoli di ogni esercizio "perché l'ho già
   fatto io col mio occhio da professionista". Stessa tabella già usata dal
   coach per applicare uno split ai propri clienti (workout_templates),
   ora leggibile anche qui — sola lettura, il coach resta l'unico che può
   aggiungerne o toglierne. Applicare un template SOSTITUISCE gli esercizi
   della settimana attiva (mai un merge parziale che confonderebbe cosa
   viene da dove); da lì in poi resta libero da personalizzare come
   qualunque esercizio aggiunto a mano — stesso editor, stesso drag-to-
   reorder, stessa possibilità di modificare o rimuovere. */
function TemplateBrowserModal({ supabase, onClose, onApply, accent }) {
  const [templates, setTemplates] = useState(null); // null = in caricamento
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    fetchWorkoutTemplates(supabase)
      .then(setTemplates)
      .catch((err) => {
        console.error("PERFORM: errore caricamento catalogo split", err);
        setError("Non sono riuscito a caricare il catalogo.");
        setTemplates([]);
      });
  }, [supabase]);

  const trainingDays = (t) => t.days.filter(Boolean).length;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5"
             style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <div className="flex items-center justify-between mb-1">
            <p className="h2">Catalogo split</p>
            <button onClick={onClose} aria-label="Chiudi" className="p-1"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
          </div>
          <p className="body mb-4" style={{ fontSize: "0.85rem" }}>
            Split pronte, pensate per rispettare volume e recupero settimanale. Applicane una alla settimana
            corrente — dopo puoi ancora modificare, riordinare o rimuovere ogni esercizio come vuoi.
          </p>
          {error && <p className="text-sm mb-3" style={{ color: "#DC2626" }}>{error}</p>}
          {templates === null ? (
            <p className="body">Caricamento…</p>
          ) : templates.length === 0 ? (
            <p className="body">Nessun modello disponibile per ora.</p>
          ) : (
            <div className="space-y-2.5">
              {templates.map((t) => (
                <div key={t.id} className="inner p-3.5">
                  <p className="h2" style={{ fontSize: "0.95rem" }}>{t.name}</p>
                  <p className="meta mt-0.5">{trainingDays(t)} giorni di allenamento a settimana</p>
                  {confirmId === t.id ? (
                    <div className="flex gap-2 mt-2.5">
                      <button onClick={() => setConfirmId(null)} className="flex-1 rounded-full px-3 py-2.5 text-xs font-semibold"
                              style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                        Annulla
                      </button>
                      <button onClick={() => onApply(t)} className="flex-1 rounded-full px-3 py-2.5 text-xs btn-3d"
                              style={{ backgroundColor: accent, color: "#111111", fontWeight: 700 }}>
                        Sostituisci questa settimana
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(t.id)} className="mt-2.5 rounded-full px-3.5 py-2 text-xs font-semibold"
                            style={{ border: "1px solid var(--line)", color: "var(--ink)" }}>
                      Applica a questa settimana
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

function FreeWorkoutBuilder({ accent, accentText, accentSoft, day, onUpgrade, onCoachSync, userPlan, schedaAddonChatActive, gender, supabase, userId }) {
  const [innerTab, setInnerTab] = useState("oggi");
  const restored = useMemo(() => loadFreeRoutine(userId), [userId]);
  const [weeks, setWeeks] = useState(() => restored?.weeks ?? [emptyWeek()]);
  const [activeWeek, setActiveWeek] = useState(() => restored?.activeWeek ?? 0);
  const [sets, setSets] = useState({});
  const [startDate, setStartDate] = useState(() => restored?.startDate ?? "");
  const [endDate, setEndDate] = useState(() => restored?.endDate ?? "");

  useEffect(() => {
    try {
      localStorage.setItem(freeRoutineStorageKey(userId), JSON.stringify({ weeks, activeWeek, startDate, endDate }));
    } catch {
      /* quota piena o privacy mode: niente di grave, l'autosave riprova al prossimo cambiamento */
    }
  }, [userId, weeks, activeWeek, startDate, endDate]);

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

  const setsFor = (ex) => sets[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "" }));
  // useCallback (mai ricreata a ogni render): passata a OGNI ExerciseCard
  // della giornata (ora memo-izzato, vedi sotto) — usa solo l'updater
  // funzionale di setSets, quindi non ha bisogno di richiudere su `sets` e
  // può restare la STESSA funzione tra un render e l'altro. Prima, essendo
  // ricreata ogni volta, invalidava il memo di ogni card a ogni digitazione
  // in una qualunque di esse (o in qualsiasi altro stato della schermata).
  const onSetField = useCallback((ex, i, f, v) =>
    setSets((s) => {
      const rows = (s[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "" }))).map((r, j) => (j === i ? { ...r, [f]: v } : r));
      return { ...s, [ex.id]: rows };
    }), []);

  const toggleDayTraining = (weekIdx, dayIdx) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : (d ? null : { label: "", exercises: [] }))))));

  const setDayLabel = (weekIdx, dayIdx, label) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, label })))));

  const setDayStretching = (weekIdx, dayIdx, stretching) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, stretching })))));

  const addExercise = (weekIdx, dayIdx, item) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: [...d.exercises, item] })))));

  const removeExercise = (weekIdx, dayIdx, exIdx) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: d.exercises.filter((_, k) => k !== exIdx) })))));

  const updateExercise = (weekIdx, dayIdx, exIdx, patch) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : {
      ...d, exercises: d.exercises.map((e, k) => (k !== exIdx ? e : { ...e, ...patch })),
    })))));

  const reorderExercise = (weekIdx, dayIdx, fromIdx, toIdx) =>
    setWeeks((ws) => ws.map((w, wi) => (wi !== weekIdx ? w : w.map((d, di) => (di !== dayIdx ? d : { ...d, exercises: moveItem(d.exercises, fromIdx, toIdx) })))));

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

  // Catalogo split: converte template.days (forma "coach", muscleTarget/
  // synergists in nomi estesi — vedi saveWeekWorkout in coachingData.js)
  // nella forma locale di questo editor. muscleTarget/synergists si
  // portano dietro TALI QUALI (non serve convertirli in nomi brevi):
  // computeVolume (coachingData.js) accetta già entrambi i formati per
  // ex.targetMuscle/ex.synergists, li converte da sé via DB_MUSCLE_TO_CHART
  // — così il grafico Volumi è corretto da subito, anche prima che il
  // coach abbia eseguito la migrazione che aggiunge questi esercizi alla
  // libreria condivisa.
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const applyTemplateToWeek = (template) => {
    const converted = template.days.map((d) => d && {
      label: d.label,
      exercises: d.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: String(ex.rest ?? 90),
        intensity: ex.rirTarget ? `RIR ${ex.rirTarget}` : (ex.technique || ""),
        targetMuscle: ex.muscleTarget,
        synergists: ex.synergists || [],
      })),
    });
    setWeeks((ws) => ws.map((w, wi) => (wi !== activeWeek ? w : converted)));
    setTemplateBrowserOpen(false);
  };

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
                  <SafeExerciseCard key={exObj.id} ex={exObj} index={exIdx} rows={setsFor(exObj)}
                    onSetField={onSetField} accent={accent} accentText={accentText} onCoachSync={onCoachSync}
                    userPlan={userPlan} schedaAddonChatActive={schedaAddonChatActive} gender={gender} onUpgrade={onUpgrade} />
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
            {isRealMode && userPlan !== "free" && (
              <button onClick={() => setTemplateBrowserOpen(true)} className="rounded-full px-4 py-2 text-sm flex items-center gap-1.5"
                      style={{ border: `1px solid ${accent}`, color: accent, fontWeight: 600 }}>
                📋 Sfoglia split pronte
              </button>
            )}
          </div>
          {templateBrowserOpen && (
            <TemplateBrowserModal supabase={supabase} accent={accent}
              onClose={() => setTemplateBrowserOpen(false)} onApply={applyTemplateToWeek} />
          )}

          <div className="space-y-3">
            {WEEK_DAYS.map((dLabel, dIdx) => {
              const dayData = weeks[activeWeek]?.[dIdx] ?? null;
              return (
                <DayEditor key={dIdx} label={dLabel} data={dayData}
                  onToggle={() => toggleDayTraining(activeWeek, dIdx)}
                  onLabel={(v) => setDayLabel(activeWeek, dIdx, v)}
                  onStretching={(v) => setDayStretching(activeWeek, dIdx, v)}
                  onAdd={(item) => addExercise(activeWeek, dIdx, item)}
                  onRemove={(exIdx) => removeExercise(activeWeek, dIdx, exIdx)}
                  onUpdate={(exIdx, patch) => updateExercise(activeWeek, dIdx, exIdx, patch)}
                  onReorder={(fromIdx, toIdx) => reorderExercise(activeWeek, dIdx, fromIdx, toIdx)}
                  accent={accent} accentText={accentText} accentSoft={accentSoft}
                  supabase={supabase} userId={userId} exerciseLib={exerciseLib} onLearned={setExerciseLib} />
              );
            })}
          </div>

          {/* Servizio guida+chat col coach: qui, non dentro ogni singolo
              esercizio (il piano Free non ha ExerciseCard/guida per
              esercizio, costruisce la scheda da solo) — un solo invito
              discreto, professionale, sopra la Matrice dei Volumi. Solo per
              Free: Premium lo vede già incluso nel proprio piano. */}
          {userPlan === "free" && (
            <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
              text="Dal Premium in su hai anche la guida biomeccanica di ogni esercizio (come eseguirlo, cosa evitare); con un piano di coaching hai in più una chat privata diretta col coach per farti correggere." />
          )}

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

// Stessa logica di collasso automatico/manuale del WeekWorkoutEditor coach
// (richiesta esplicita: "stessa modalità di editor allenamento" anche per
// free/premium) — "completo" qui non richiede un RIR target (il builder
// autogestito usa il select Intensità/Tecnica al suo posto).
function isFreeExerciseComplete(e) {
  return Boolean(e.name?.trim()) && e.sets !== "" && e.sets != null
    && String(e.reps ?? "").trim() !== "" && e.rest !== "" && e.rest != null && Boolean(e.intensity);
}

function DayEditor({ label, data, onToggle, onLabel, onStretching, onAdd, onRemove, onUpdate, onReorder, accent, accentText, accentSoft, supabase, userId, exerciseLib, onLearned }) {
  const [query, setQuery] = useState("");
  const reorder = useDragReorder({ length: data?.exercises?.length ?? 0, onReorder });
  const [dropOpen, setDropOpen] = useState(false);
  const [targetMuscle, setTargetMuscle] = useState("");
  const [setsVal, setSetsVal] = useState("3");
  const [reps, setReps] = useState("8-10");
  const [collapsedOverrides, setCollapsedOverrides] = useState({});
  const isCollapsedFor = (e, i) => (i in collapsedOverrides ? collapsedOverrides[i] : isFreeExerciseComplete(e));
  const toggleCollapsed = (i, e) => setCollapsedOverrides((s) => ({ ...s, [i]: !isCollapsedFor(e, i) }));

  // Richiesta esplicita: gli esercizi particolari già classificati dal coach
  // (muscoli diretti/sinergici già assegnati "col suo occhio da
  // professionista") devono comparire anche qui mentre l'utente digita, non
  // solo nella lista statica EXERCISE_LIBRARY — altrimenti un Premium che
  // non conosce a memoria il nome esatto non lo trova mai, e finisce a
  // riclassificare da zero un esercizio già pronto in libreria condivisa.
  const searchableNames = useMemo(() => {
    const merged = new Set([...EXERCISE_LIBRARY, ...Object.keys(exerciseLib || {})]);
    return [...merged].sort((a, b) => a.localeCompare(b, "it"));
  }, [exerciseLib]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchableNames.slice(0, 8);
    return searchableNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [query, searchableNames]);

  const trimmed = query.trim();
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
              {data.exercises.map((e, i) => isCollapsedFor(e, i) ? (
                <div key={i} ref={reorder.setRowRef(i)} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#111111", ...reorder.rowStyle(i) }}>
                  <div className="flex items-start gap-2">
                    <span {...reorder.handleProps(i)} aria-label="Trascina per riordinare" className="shrink-0 mt-0.5" style={{ ...reorder.handleProps(i).style, color: "#9CA3AF" }}>
                      <GripVertical size={15} />
                    </span>
                    <button type="button" onClick={() => toggleCollapsed(i, e)} className="flex-1 min-w-0 flex items-start justify-between gap-2 text-left">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug" style={{ color: "#FFFFFF" }}>
                          {e.name}{e.targetMuscle ? ` · ${e.targetMuscle}` : ""}
                        </p>
                        <p className="text-[11px] font-data mt-0.5" style={{ color: "#9CA3AF" }}>
                          {formatSetsReps(e.sets, e.reps)} · {e.intensity} · {e.rest}s rec
                        </p>
                      </div>
                      <ChevronDown size={14} className="shrink-0 mt-0.5" style={{ color: "#9CA3AF" }} />
                    </button>
                    <button onClick={() => onRemove(i)} aria-label="Rimuovi esercizio" style={{ color: "#9CA3AF" }} className="shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div key={i} ref={reorder.setRowRef(i)} style={reorder.rowStyle(i)} className="inner p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="flex items-center gap-1.5 text-sm min-w-0" style={{ color: "var(--ink)", fontWeight: 500 }}>
                      <span {...reorder.handleProps(i)} aria-label="Trascina per riordinare" className="shrink-0" style={{ ...reorder.handleProps(i).style, color: "var(--ink-tertiary)" }}>
                        <GripVertical size={15} />
                      </span>
                      <button type="button" onClick={() => toggleCollapsed(i, e)} aria-label="Comprimi esercizio" className="shrink-0" style={{ color: "var(--ink-2)" }}>
                        <ChevronUp size={13} />
                      </button>
                      <span>
                        {e.name}
                        {e.targetMuscle && (
                          <span className="ml-1.5 meta" style={{ fontSize: "0.62rem" }}>· {e.targetMuscle}</span>
                        )}
                      </span>
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
              onChange={(e) => { setQuery(String(e.target.value ?? "")); setDropOpen(true); setTargetMuscle(""); }}
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
                Esercizio non riconosciuto: scegli a quale dei 15 distretti inviare il volume, altrimenti il
                grafico resterebbe vuoto per questo movimento.
              </p>
              <select value={targetMuscle} onChange={(e) => setTargetMuscle(e.target.value)}
                      className="input w-full px-3 py-2.5 text-sm">
                <option value="">— scegli un distretto —</option>
                {VOLUME_MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
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

          <label className="block mt-3">
            <span className="label block mb-1">🧘 Stretching (a fine sessione)</span>
            <textarea value={data.stretching || ""} rows={3} onChange={(e) => onStretching(e.target.value)}
              placeholder="Es. Stretching pettorali 2x30 sec, Stretching quadricipiti 2x30 sec per lato…"
              className="input w-full px-3 py-2.5 text-sm" style={{ resize: "vertical" }} />
          </label>
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

// "Pomeriggio" aggiunto come 5° momento fisso (BUG PRESO: prima non
// esisteva nell'elenco canonico, quindi un coach che ne aveva bisogno era
// costretto a scrivere un momento libero — mai riconosciuto nell'ordine
// cronologico corretto lato cliente, finiva sempre in coda invece che a
// metà giornata). Posizionato tra Mattina e Pre-Workout.
export const SUPP_MOMENTS = [
  { id: "mattina",    label: "Mattina",    icon: "🌅" },
  { id: "pomeriggio", label: "Pomeriggio", icon: "☀️" },
  { id: "preWo",      label: "Pre-Wo",     icon: "🔥" },
  { id: "postWo",     label: "Post-Wo",    icon: "💪" },
  { id: "sera",       label: "Sera",       icon: "🌙" },
];

// BUG PRESO: il riconoscimento di un momento standard era case-sensitive
// (m.id === moment): un coach che digitava "Mattina"/"MATTINA"/"sera " a
// mano (rinominando una sezione invece di usare il pulsante standard, o
// una sezione salvata prima che "Pomeriggio" esistesse come momento fisso)
// non veniva MAI riconosciuto come uno dei 5 momenti canonici — id_ref
// restava null, il testo tornava in coda o in ordine alfabetico invece che
// mattina→pomeriggio→pre-wo→post-wo→sera. Confronto ora case-insensitive e
// senza spazi ai bordi, su id E label, così qualunque variante di
// maiuscole/minuscole scritta dal coach viene comunque riconosciuta.
export function matchSuppMoment(raw) {
  const norm = (s) => (s || "").trim().toLowerCase();
  const r = norm(raw);
  return SUPP_MOMENTS.find((m) => norm(m.id) === r || norm(m.label) === r) || null;
}

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
    pros: [
      "Il rapporto costo/beneficio più alto tra tutti gli integratori sportivi: economica, sicura ed efficace per la quasi totalità delle persone.",
      "Nessuna fase di carico necessaria e nessun ciclo di scarico richiesto: può essere assunta stabilmente per anni.",
    ],
    cons: [
      "Il richiamo di acqua intracellulare può tradursi in 1-2 kg di peso in più nelle prime settimane, un dato da non confondere con grasso.",
      "Un sottogruppo di soggetti ('non responder') mostra un beneficio minimo, probabilmente per riserve muscolari già vicine alla saturazione naturale.",
    ],
    conclusion: "La creatina monoidrato a 3-5 g/die è l'integratore con il rapporto evidenza/sicurezza più solido in assoluto: va considerata la base di qualunque protocollo di integrazione orientato a forza e massa muscolare.",
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
    pros: [
      "Effetto ergogenico rapido e riproducibile già dalla prima assunzione, senza bisogno di settimane di accumulo.",
      "Economica e ampiamente disponibile, con un effetto misurabile su forza, potenza e resistenza in un'unica sostanza.",
    ],
    cons: [
      "Lo sviluppo di tolleranza con l'uso cronico riduce l'effetto nel tempo se non si prevedono periodi di scarico.",
      "Assunta troppo tardi nel pomeriggio/sera può compromettere significativamente la qualità del sonno, specie nei metabolizzatori lenti.",
    ],
    conclusion: "La caffeina è un ergogenico affidabile a 3-6 mg/kg 30-60 minuti prima dell'allenamento, ma va gestita con cicli di scarico periodici e mai a ridosso del sonno, per non pagare in recupero quello che si guadagna in performance.",
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
    pros: [
      "Pratica e rapida per raggiungere la quota proteica giornaliera quando il cibo solido non è disponibile o sufficiente.",
      "Profilo aminoacidico completo con alta leucina, paragonabile alle migliori fonti proteiche animali.",
    ],
    cons: [
      "Non è superiore al cibo intero a parità di proteine totali: è uno strumento di comodità, non un ingrediente magico.",
      "Le forme concentrate (WPC) contengono più lattosio, un problema per chi ha intolleranza.",
    ],
    conclusion: "La whey è lo strumento più pratico per colmare il gap proteico giornaliero quando il cibo solido non basta, ma resta intercambiabile con qualunque fonte proteica completa a parità di grammi assunti.",
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
    pros: [
      "Beneficio documentato e ampio su salute cardiovascolare e infiammazione sistemica, non solo su un ipotetico effetto sportivo.",
      "Utile correzione quando il pesce grasso è scarso nella dieta abituale, un caso molto comune.",
    ],
    cons: [
      "Nessun effetto acuto sulla performance: il beneficio è cumulativo e richiede costanza per settimane/mesi.",
      "Dosaggi molto alti senza controllo medico possono interferire con la coagulazione in soggetti predisposti.",
    ],
    conclusion: "Gli omega-3 sono un integratore da assumere per costanza quotidiana e beneficio a lungo termine su salute generale, non per un effetto acuto sulla singola sessione di allenamento.",
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
    pros: [
      "Beneficio più marcato proprio nei protocolli ad alto volume/alte ripetizioni, un caso d'uso frequente nell'ipertrofia.",
      "Profilo di sicurezza molto buono, senza interazioni note rilevanti alle dosi comuni.",
    ],
    cons: [
      "Effetto poco rilevante su serie pesanti a basse ripetizioni, dove il meccanismo (vasodilatazione, resistenza alla fatica locale) conta meno.",
      "Richiede la dose piena (6-8 g) per essere efficace: dosi più basse, comuni in molti pre-workout, spesso sono sotto-dosate.",
    ],
    conclusion: "La citrullina malato è utile soprattutto in protocolli ad alto volume/alte ripetizioni, con un effetto dose-dipendente che richiede almeno 6-8 g per essere realmente presente.",
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
    pros: [
      "Disponibilità energetica rapida durante allenamenti lunghi a digiuno, quando le riserve aminoacidiche circolanti sono più basse.",
      "Utili come opzione a basso costo calorico in fase di dieta molto ipocalorica con proteine ai limiti minimi.",
    ],
    cons: [
      "Con un apporto proteico giornaliero già adeguato, il beneficio aggiuntivo rispetto alla sola dieta è marginale o nullo.",
      "La leucina isolata senza gli altri aminoacidi essenziali attiva la sintesi proteica senza fornire tutti i 'mattoni' per completarla.",
    ],
    conclusion: "I BCAA hanno senso soprattutto per chi si allena a digiuno o in deficit calorico marcato con proteine ai limiti minimi: con un apporto proteico giornaliero già adeguato, una fonte proteica completa resta la scelta più efficiente.",
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
    pros: [
      "Effetto solido e riproducibile proprio nella zona di sforzo tipica dell'ipertrofia (serie da 8-15 ripetizioni).",
      "Non serve timing pre-workout: conta l'accumulo cronico, quindi si integra facilmente in qualunque routine.",
    ],
    cons: [
      "Il beneficio emerge solo dopo 4-10 settimane di uso costante: nessun effetto acuto alla prima assunzione.",
      "La parestesia (formicolio) alla dose singola alta può risultare fastidiosa per alcuni, anche se innocua.",
    ],
    conclusion: "La beta-alanina è efficace per sforzi ripetuti di media durata (8-15 reps), ma richiede settimane di uso costante per accumulare carnosina muscolare: non è uno strumento acuto pre-workout come la caffeina.",
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
    pros: [
      "Supporto solido e documentato su barriera intestinale e sistema immunitario nei periodi di carico di allenamento molto elevato.",
      "Profilo di sicurezza molto favorevole, senza controindicazioni note alle dosi comuni.",
    ],
    cons: [
      "Nell'atleta sano con dieta e recupero già adeguati, l'evidenza su un effetto diretto su crescita muscolare o performance è debole.",
      "Il corpo la sintetizza autonomamente in quantità sufficiente nella maggior parte delle condizioni, riducendo il beneficio marginale dell'integrazione.",
    ],
    conclusion: "La glutammina ha un razionale solido soprattutto per salute intestinale e immunitaria in periodi di carico molto elevato, non come strumento diretto per crescita muscolare o performance nell'atleta ben nutrito.",
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
    pros: [
      "Corregge efficacemente una carenza subclinica di zinco/magnesio, comune in diete ipocaloriche o povere di carne rossa e semi.",
      "Il magnesio incluso può migliorare la qualità del sonno percepita, un beneficio reale a prescindere dall'effetto ormonale.",
    ],
    cons: [
      "In soggetti con status minerale già normale, l'effetto su testosterone o forza non è mai stato replicato in modo convincente.",
      "Va assunto lontano da calcio e fibre, che ne riducono l'assorbimento — un vincolo pratico spesso ignorato.",
    ],
    conclusion: "Lo ZMA ha senso come correzione di una carenza subclinica di zinco/magnesio, non come 'booster ormonale naturale': l'effetto reale dipende interamente dallo status di partenza, non da un meccanismo indipendente.",
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
    pros: [
      "Rete di sicurezza economica ed efficace contro micro-carenze, soprattutto in deficit calorico prolungato o dieta poco varia.",
      "Facile da integrare stabilmente nella routine, senza timing critico o interazioni rilevanti alle dosi da etichetta.",
    ],
    cons: [
      "Non sostituisce una dieta varia ricca di verdura e frutta, che resta la fonte primaria di micronutrienti e fitocomposti.",
      "Le formulazioni ad alto dosaggio di vitamine liposolubili vanno gestite con attenzione perché si accumulano nel tessuto adiposo/epatico.",
    ],
    conclusion: "Il multivitaminico è una rete di sicurezza utile, non un potenziatore: il suo valore reale è massimo in deficit calorico o con un'alimentazione poco varia, marginale con una dieta già ricca e diversificata.",
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
    pros: [
      "Profilo di sicurezza molto buono, adatto anche a un uso preventivo di lungo periodo su tendini sotto carico ripetuto.",
      "Il protocollo (30-60 min prima del carico specifico + vitamina C) è semplice da integrare nella routine pre-allenamento.",
    ],
    cons: [
      "L'evidenza è ancora meno solida rispetto a creatina o proteine: i benefici riportati sono promettenti ma non definitivi.",
      "Il beneficio richiede il timing specifico prima del carico meccanico target, non un'assunzione generica distribuita nella giornata.",
    ],
    conclusion: "Il collagene idrolizzato è un'opzione ragionevole e sicura per la salute tendinea, specialmente in chi ha un carico articolare/tendineo elevato, ma va assunto con il protocollo specifico (+ vitamina C, prima del carico) per avere le migliori probabilità di beneficio.",
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
    pros: [
      "Effetto documentato e in crescita sulla riduzione del cortisolo e dell'ansia percepita dopo 6-8 settimane d'uso.",
      "Profilo di sicurezza favorevole, utile complemento (non sostituto) alla gestione di sonno e stress.",
    ],
    cons: [
      "L'effetto diretto su forza e testosterone è riportato solo in un sottogruppo di studi, non ancora un dato consolidato.",
      "Estratti non standardizzati sulla percentuale di withanolidi hanno risultati molto meno prevedibili di quelli usati negli studi.",
    ],
    conclusion: "L'ashwagandha ha un razionale solido soprattutto per la gestione dello stress e del cortisolo, con un potenziale effetto su forza ancora preliminare: va scelta con estratto standardizzato e non sostituisce la gestione di base di sonno e stress.",
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
    pros: [
      "Evidenza molto solida per la risincronizzazione del ritmo circadiano (jet lag, turni di lavoro, orari irregolari).",
      "Dosi basse (0.3-1 mg) sono spesso efficaci quanto dosi alte, con meno intontimento residuo al risveglio.",
    ],
    cons: [
      "Non è un sedativo classico: in chi non ha un disallineamento circadiano di base, l'effetto come 'aiuto al sonno' generico è più modesto.",
      "L'igiene del sonno (luce, orari regolari) resta l'intervento con il maggiore impatto: la melatonina funziona come complemento, non sostituto.",
    ],
    conclusion: "La melatonina è lo strumento giusto per risincronizzare il ritmo circadiano (jet lag, turni), non un sonnifero generico: dosi basse funzionano bene quanto quelle alte, con meno effetti residui al risveglio.",
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
    pros: [
      "Previene efficacemente crampi e cali di performance nelle sedute lunghe o in ambiente caldo-umido.",
      "Riduce il rischio di iponatriemia da diluizione in eventi di endurance di più ore, dove la sola acqua non basta.",
    ],
    cons: [
      "Per sedute brevi in ambiente fresco l'acqua da sola è quasi sempre sufficiente: l'integrazione elettrolitica extra è superflua.",
      "Non esiste una dose universale: il fabbisogno varia molto su base individuale e climatica, richiedendo un aggiustamento personale.",
    ],
    conclusion: "Gli elettroliti diventano rilevanti soprattutto per sedute lunghe (oltre 90 minuti) o in ambiente caldo-umido: per allenamenti brevi in condizioni fresche, l'acqua semplice resta la scelta più semplice ed efficace.",
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
    pros: [
      "Evidenza molto alta e consolidata sul ruolo osseo e immunitario, con carenza diffusa nella popolazione generale.",
      "Facile ed economico da correggere una volta individuata la carenza tramite esame del sangue.",
    ],
    cons: [
      "Essendo liposolubile, si accumula nel tessuto adiposo/epatico: un sovradosaggio prolungato senza controllo non è privo di rischi.",
      "L'effetto diretto sulla performance muscolare è ancora meno definitivo rispetto al ruolo osseo/immunitario.",
    ],
    conclusion: "Un esame del sangue (25-OH-D) prima di integrare è il modo corretto di procedere: la vitamina D3 è tra i pochi casi dove l'integrazione a occhio, senza dato di partenza, rischia di essere inefficace o eccessiva.",
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
    pros: [
      "Correzione efficace di una carenza molto comune (diete povere di legumi/frutta secca/verdure a foglia verde).",
      "Le forme chelate (bisglicinato, citrato) sono ben tollerate e assorbite meglio delle forme economiche (ossido, solfato).",
    ],
    cons: [
      "Le forme economiche (ossido, solfato) sono scarsamente assorbite e più lassative: la scelta della forma chimica conta quanto la dose.",
      "L'evidenza sull'effetto specifico su qualità del sonno è più moderata rispetto a quella sul ruolo enzimatico generale.",
    ],
    conclusion: "Il magnesio in forma ben assorbita (bisglicinato o citrato) corregge efficacemente una carenza molto comune: la scelta della forma chimica è tanto importante quanto la dose per evitare sia il malassorbimento sia l'effetto lassativo.",
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
    pros: [
      "Razionale solido nelle condizioni cataboliche marcate: deficit calorico severo, principianti, soggetti anziani sarcopenici.",
      "Profilo di sicurezza molto buono, senza controindicazioni note rilevanti alle dosi comuni.",
    ],
    cons: [
      "Nell'atleta avanzato con proteine già ottimizzate, il beneficio aggiuntivo rispetto alla sola dieta è modesto o assente.",
      "Va assunto distribuito durante la giornata (non in un'unica dose) per mantenere l'effetto anti-catabolico costante.",
    ],
    conclusion: "L'HMB ha senso soprattutto in condizioni cataboliche marcate (deficit severo, principianti, anziani sarcopenici): nell'atleta avanzato con dieta proteica già ottimizzata, il beneficio aggiuntivo è modesto.",
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
    pros: [
      "Effetto antiossidante diretto documentato sul danno ossidativo indotto dall'esercizio intenso.",
      "Sintetizzata endogenamente in quantità di solito sufficiente, il che ne rende sicura anche l'assunzione regolare.",
    ],
    cons: [
      "L'evidenza sull'effetto ergogenico diretto (forza massimale) è debole/inconsistente rispetto a creatina o caffeina.",
      "L'interazione con la caffeina nelle formulazioni pre-workout non è del tutto chiarita sul piano dell'effetto netto.",
    ],
    conclusion: "La taurina è un integratore sicuro con un effetto più solido su resistenza e riduzione del danno ossidativo che su forza massimale: da considerare un complemento, non un pilastro come creatina o caffeina.",
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
    pros: [
      "Effetto documentato su marcatori infiammatori e DOMS, con un profilo di effetti collaterali molto più favorevole dei FANS.",
      "Ampiamente studiata e sicura per un uso regolare in periodi di alto carico di allenamento.",
    ],
    cons: [
      "Da sola (senza piperina o formulazioni bioottimizzate) ha una biodisponibilità orale quasi nulla: gran parte dei prodotti in commercio è sotto-dosata in pratica.",
      "Un uso massiccio e indiscriminato di antiossidanti attorno alla sessione può in teoria smorzare parte degli adattamenti utili all'allenamento.",
    ],
    conclusion: "La curcumina è utile per il recupero articolare e la gestione dell'infiammazione da sovraccarico, ma solo in formulazione bioottimizzata (con piperina o equivalente): senza, la biodisponibilità è troppo bassa per avere un effetto reale.",
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
    pros: [
      "Equivalenza pratica documentata con whey/caseina quando le fonti (pisello + riso) sono combinate correttamente.",
      "Unica opzione per chi segue un regime vegano o ha intolleranza al lattosio, senza compromessi sulla qualità proteica.",
    ],
    cons: [
      "Le fonti isolate singolarmente (solo riso o solo pisello) hanno un aminoacido limitante e non sono equivalenti da sole.",
      "Leucina leggermente inferiore a parità di grammi rispetto alla whey, che richiede porzioni per pasto leggermente più alte.",
    ],
    conclusion: "Le proteine vegetali combinate (pisello + riso) sono un'alternativa equivalente alla whey per chi segue un regime vegetale, a patto di usare dosi per pasto adeguate (25-30 g+) per compensare la leucina leggermente inferiore.",
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
    pros: [
      "Supporto documentato alla salute intestinale, particolarmente utile dopo cicli di antibiotici o con diete molto iperproteiche.",
      "Rischio molto basso alle dosi comuni, adatti a un uso regolare e prolungato.",
    ],
    cons: [
      "L'effetto è marcatamente ceppo-specifico: i risultati di uno studio su un ceppo non si estrapolano automaticamente ad altri prodotti.",
      "Molti prodotti in commercio non specificano il ceppo esatto usato negli studi di riferimento, rendendo difficile valutare l'efficacia reale.",
    ],
    conclusion: "I probiotici sono utili soprattutto in contesti specifici (post-antibiotico, dieta molto iperproteica, stress digestivo), ma l'efficacia dipende interamente dal ceppo specifico: va sempre verificato quale ceppo è usato, non solo il genere batterico in etichetta.",
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
    pros: [
      "Effetto più marcato proprio in soggetti con testosterone basso o sotto stress cronico, un caso d'uso reale e frequente.",
      "Non altera direttamente il testosterone totale come un anabolizzante, agendo piuttosto su SHBG e aromatasi.",
    ],
    cons: [
      "Essendo ormonalmente attivo, interagisce con lo stesso asse regolato da terapie ormonali o farmaci che modulano SHBG/aromatasi: attenzione se già in terapia.",
      "Gli studi di alta qualità sull'uomo sono ancora relativamente pochi rispetto a integratori più consolidati.",
    ],
    conclusion: "Il Tongkat Ali va usato con consapevolezza, idealmente verificando i propri valori ormonali prima e dopo un ciclo d'uso: il beneficio è più probabile in chi parte da livelli di testosterone bassi o sotto stress cronico, meno prevedibile in soggetti già eutrofici.",
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
    pros: [
      "Meccanismo d'azione plausibile (stimolazione diretta delle cellule di Leydig) osservato negli studi animali disponibili.",
    ],
    cons: [
      "Evidenza sull'uomo quasi inesistente: la maggior parte dei dati viene da studi su roditori, non trasferibili automaticamente.",
      "Segnali di potenziale tossicità testicolare a lungo termine osservati negli animali a dosaggi più alti, un dato che impone prudenza.",
      "Qualità e standardizzazione degli estratti in commercio molto variabile da un produttore all'altro.",
    ],
    conclusion: "La Fadogia Agrestis va trattata come sperimentale, non come protocollo consolidato: il divario tra popolarità online e reale solidità scientifica è tra i più ampi di tutta la Wiki Integratori, e l'assenza di trial umani solidi impone cautela e controlli periodici a chi decide comunque di usarla.",
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
    pros: [
      "Non altera i marcatori ormonali tipici degli anabolizzanti (LH, testosterone, SHBG) negli studi disponibili.",
      "Alcuni piccoli trial mostrano incrementi di forza e massa magra superiori al placebo con un meccanismo cellulare plausibile.",
    ],
    cons: [
      "Il numero di studi controllati sull'uomo resta limitato, e alcuni hanno metodologia discussa.",
      "Non ancora al livello di consenso scientifico di creatina o proteine: resta un composto di nicchia da trattare come promettente ma non consolidato.",
    ],
    conclusion: "L'ecdisterone mostra un meccanismo interessante e non ormonale, con risultati preliminari incoraggianti su forza e massa magra: va trattato come opzione sperimentale in crescita, non ancora come pilastro consolidato al pari di creatina o proteine.",
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
    pros: [
      "Effetto acuto misurabile già dopo una singola dose su fatica cognitiva/fisica, un profilo temporale insolito tra gli adattogeni.",
      "Utile complemento specifico per chi gestisce carichi di lavoro e allenamento elevati insieme.",
    ],
    cons: [
      "L'effetto cronico su performance fisica pura è più preliminare rispetto a quello su fatica mentale acuta.",
      "Il dosaggio efficace dipende dallo standardize su rosavine/salidroside: prodotti non standardizzati danno risultati inconsistenti.",
    ],
    conclusion: "La Rhodiola Rosea è particolarmente interessante per chi gestisce carichi di lavoro e allenamento elevati insieme, con un effetto acuto sulla fatica percepita più consistente di quello cronico sulla performance fisica pura.",
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
    pros: [
      "Meccanismo biologico ben caratterizzato (stimolazione dell'NGF) rispetto a molti composti 'di moda' senza base fisiologica chiara.",
      "Profilo di sicurezza favorevole, adatto a un uso di lungo periodo orientato alla salute cognitiva.",
    ],
    cons: [
      "Gli studi controllati sull'uomo sono ancora pochi e per lo più su soggetti anziani con declino cognitivo, non su popolazione sportiva sana.",
      "Nessun effetto acuto: lavora su tempi lunghi, non è utile per chi cerca una spinta immediata su lucidità mentale.",
    ],
    conclusion: "Il Lion's Mane è un integratore di nicchia orientato alla salute cognitiva a lungo termine più che alla performance sportiva immediata: il meccanismo è promettente ma gli studi sulla popolazione sportiva sana restano insufficienti per conclusioni definitive.",
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
    pros: [
      "Meccanismo cellulare ben caratterizzato (mitofagia via PINK1/Parkin), supportato da alcuni trial clinici su forza e biomarcatori mitocondriali.",
      "L'integrazione diretta bypassa il limite dei 'non produttori' (circa il 60% della popolazione) che non converte abbastanza urolitina A dal solo consumo di melograno.",
    ],
    cons: [
      "L'evidenza resta preliminare: i trial clinici disponibili sono ancora relativamente pochi e su outcome specifici.",
      "Il beneficio più consistente è documentato negli adulti/atleti master, meno negli sportivi giovani sani.",
    ],
    conclusion: "L'Urolitina A ha un meccanismo cellulare tra i più solidi tra i composti emergenti per longevità e recupero muscolare, particolarmente rilevante per chi non produce naturalmente abbastanza urolitina dal solo melograno — l'integrazione diretta risolve questo limite biologico individuale.",
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
    pros: [
      "Meccanismo cellulare solido e ben studiato (via di salvataggio del NAD+), coerente con il declino documentato dei livelli di NAD+ con l'età.",
      "Profilo di sicurezza favorevole nei trial umani disponibili finora.",
    ],
    cons: [
      "I trial umani sono ancora pochi, per lo più piccoli e a breve termine: mancano dati solidi su outcome concreti come performance o longevità reale.",
      "L'entusiasmo mediatico supera nettamente la solidità dell'evidenza clinica attuale sull'uomo.",
    ],
    conclusion: "L'NMN ha un razionale biologico solido e uno dei meccanismi cellulari meglio caratterizzati tra i composti emergenti, ma resta da considerare sperimentale finché non arriveranno trial umani più ampi e a lungo termine su outcome clinici concreti.",
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
    pros: [
      "Economica, semplice e con un meccanismo fisiologico chiaro (termoregolazione), complementare (non alternativo) alla melatonina.",
      "Evidenza da moderata ad alta sugli outcome soggettivi di qualità del sonno, spesso trascurata rispetto a integratori più 'di moda'.",
    ],
    cons: [
      "Meno studiata con misure oggettive (polisonnografia) rispetto agli outcome soggettivi riportati.",
      "Non agisce sul ritmo circadiano: inutile da sola per jet lag o turni di lavoro, dove la melatonina resta lo strumento specifico.",
    ],
    conclusion: "La glicina è un'opzione economica e sottovalutata per la qualità del sonno, complementare alla melatonina quando serve anche una risincronizzazione circadiana: agisce su un meccanismo fisiologico diverso (temperatura corporea) e non sostitutivo.",
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
    pros: [
      "Evidenza alta e diversi trial che la paragonano favorevolmente alla metformina su glicemia post-prandiale e sensibilità insulinica.",
      "Meccanismo condiviso con l'esercizio fisico (attivazione dell'AMPK), un razionale coerente per chi gestisce composizione corporea e salute metabolica insieme.",
    ],
    cons: [
      "Interagisce con enzimi del citocromo P450 coinvolti nel metabolismo di molti farmaci comuni: rischio di interazioni non banale.",
      "L'uso concomitante con antidiabetici richiede supervisione medica per il rischio di ipoglicemia additiva.",
    ],
    conclusion: "La berberina ha un'evidenza solida su glicemia e sensibilità insulinica, ma proprio per la sua attività farmacologica reale va usata con attenzione e supervisione medica se già in terapia con altri farmaci, non trattata come un semplice 'estratto vegetale' innocuo.",
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
    pros: [
      "Capacità antiossidante molecola per molecola superiore a vitamina C, E o beta-carotene nei test in vitro, con un meccanismo di membrana unico.",
      "Beneficio aggiuntivo documentato su affaticamento visivo, non solo su recupero muscolare.",
    ],
    cons: [
      "Un uso massiccio e indiscriminato di antiossidanti attorno alla sessione può in teoria smorzare parte delle ROS utili come segnale di adattamento all'allenamento.",
      "L'evidenza sul recupero muscolare specifico resta preliminare, seppur coerente con il meccanismo proposto.",
    ],
    conclusion: "L'astaxantina è un integratore di nicchia interessante per chi si allena molto e pensa anche al recupero a lungo termine, con un profilo antiossidante superiore ad altri composti più noti — non va però usata in dosi massicce attorno alla sessione, per non smorzare gli adattamenti utili all'allenamento.",
  },
  {
    id: "timing-integrazione", name: "Timing dell'integrazione: cosa conta davvero", icon: "🕐",
    dose: "Dipende dal singolo integratore", timing: "Costanza quotidiana > timing perfetto, per la maggior parte dei prodotti",
    body: "Per la maggior parte degli integratori (creatina, omega-3, vitamina D, magnesio) il momento esatto della " +
      "giornata conta molto meno della costanza d'uso quotidiana. Solo un piccolo sottogruppo (caffeina, citrullina, " +
      "beta-alanina frazionata, elettroliti durante lo sforzo) ha un timing realmente critico legato al meccanismo " +
      "d'azione.",
    deepDive: "La distinzione pratica è tra integratori 'a effetto acuto' (agiscono nella finestra di poche ore " +
      "dall'assunzione, quindi il timing rispetto all'allenamento conta: caffeina, citrullina) e integratori 'ad " +
      "accumulo cronico' (agiscono saturando un deposito o correggendo una carenza nel tempo, quindi conta la " +
      "costanza giornaliera più del momento preciso: creatina, beta-alanina, omega-3, vitamina D, magnesio). " +
      "Confondere le due categorie porta a errori pratici comuni: prendere la creatina 'solo nei giorni di " +
      "allenamento' (inutile, dato che agisce per saturazione del deposito muscolare, non per effetto acuto) o " +
      "aspettarsi un effetto immediato dalla beta-alanina alla prima assunzione (richiede settimane di accumulo).",
    pros: [
      "Semplifica enormemente l'aderenza: per la maggior parte degli integratori basta la costanza, non serve pianificare il timing esatto ogni giorno.",
      "Aiuta a evitare errori pratici comuni, come sospendere la creatina nei giorni di riposo pensando serva solo pre-allenamento.",
    ],
    cons: [
      "Per il piccolo sottogruppo a effetto acuto (caffeina, citrullina, elettroliti), ignorare il timing riduce concretamente il beneficio ottenibile.",
      "Richiede conoscere la categoria del singolo integratore, non una regola universale valida per tutti.",
    ],
    conclusion: "La domanda giusta non è 'quando lo prendo' ma 'è un integratore ad effetto acuto o ad accumulo cronico': per la maggior parte dei prodotti la costanza quotidiana conta più di qualunque timing preciso, con poche eccezioni ben definite (caffeina, citrullina, elettroliti).",
  },
  {
    id: "leggere-evidenza", name: "Come leggere il livello di evidenza di un integratore", icon: "🔍",
    dose: "—", timing: "—",
    body: "Non tutti gli integratori hanno lo stesso livello di prova scientifica alle spalle: creatina e caffeina " +
      "hanno centinaia di studi convergenti, altri (Fadogia Agrestis, NMN) hanno pochi trial umani piccoli. Sapere " +
      "leggere questa differenza evita sia lo scetticismo ingiustificato sia l'entusiasmo cieco verso ogni novità.",
    deepDive: "Una gerarchia pratica, dal livello di evidenza più alto al più basso: meta-analisi di più RCT " +
      "(randomized controlled trial) convergenti sull'uomo, un singolo RCT ben condotto sull'uomo, studi osservazionali " +
      "sull'uomo, studi preliminari/pilota su piccoli campioni, e infine studi solo su animali o meccanismi cellulari " +
      "in vitro. Un integratore può avere un meccanismo d'azione molto plausibile e ben caratterizzato (es. Fadogia " +
      "Agrestis, NMN) senza per questo avere prove solide sull'uomo: il meccanismo spiega 'perché potrebbe " +
      "funzionare', non 'conferma che funzioni' negli esseri umani a quelle dosi. Anche il conflitto d'interesse " +
      "conta: studi finanziati direttamente dal produttore di un integratore vanno letti con più cautela di studi " +
      "indipendenti, non per squalificarli automaticamente ma per pesarli correttamente nel quadro complessivo.",
    pros: [
      "Permette di distinguere integratori con base solida (creatina, caffeina) da quelli ancora sperimentali (Fadogia, NMN) senza scartarli a priori.",
      "Protegge sia dallo scetticismo ingiustificato verso composti nuovi ma promettenti, sia dall'entusiasmo cieco verso ogni novità di tendenza.",
    ],
    cons: [
      "Richiede tempo e un minimo di alfabetizzazione scientifica per essere applicato correttamente a ogni singolo prodotto.",
      "Il marketing degli integratori spesso presenta risultati preliminari come se fossero consolidati, rendendo necessaria una lettura critica attiva.",
    ],
    conclusion: "Prima di integrare qualcosa, vale la pena chiedersi su che tipo di prova si basa: centinaia di RCT sull'uomo, pochi studi piccoli, o solo meccanismi cellulari plausibili — la risposta cambia completamente quanta fiducia riporre in un dato prodotto e a quale dose.",
  },
  {
    id: "stacking-ciclizzazione", name: "Stacking e ciclizzazione: quando hanno senso", icon: "🧩",
    dose: "—", timing: "—",
    body: "Combinare più integratori (stacking) o alternare periodi di uso e pausa (ciclizzazione) ha senso solo per " +
      "un sottogruppo specifico di prodotti (caffeina, alcuni adattogeni) dove si sviluppa tolleranza — per la " +
      "maggior parte degli integratori (creatina, vitamina D, omega-3) cicli e pause non hanno un razionale " +
      "fisiologico e riducono solo la costanza d'uso.",
    deepDive: "La tolleranza (calo dell'effetto con l'uso cronico) si sviluppa per meccanismi recettoriali specifici: " +
      "la caffeina, ad esempio, con l'uso quotidiano prolungato porta a un aumento del numero di recettori " +
      "dell'adenosina (up-regulation), riducendo l'effetto della stessa dose — un ciclo di scarico di 1-2 settimane " +
      "resetta parzialmente questa sensibilità. Creatina, vitamina D o magnesio, al contrario, agiscono saturando un " +
      "deposito fisiologico o correggendo una carenza: non c'è un meccanismo recettoriale che sviluppa tolleranza, " +
      "quindi cicli e pause non hanno un vantaggio fisiologico documentato e comportano solo la perdita temporanea " +
      "del beneficio (es. il deposito di fosfocreatina torna a scendere se si smette la creatina). Lo stacking " +
      "(combinare più prodotti) ha senso quando i meccanismi d'azione sono complementari e non ridondanti (es. " +
      "creatina + beta-alanina, che agiscono su sistemi energetici diversi), meno quando si sommano prodotti con lo " +
      "stesso meccanismo aspettandosi un effetto additivo che raramente si verifica in proporzione.",
    pros: [
      "La ciclizzazione mirata (es. caffeina) recupera davvero sensibilità e beneficio perso con l'uso cronico continuo.",
      "Lo stacking di integratori con meccanismi complementari (es. creatina + beta-alanina) copre più vie fisiologiche senza ridondanza.",
    ],
    cons: [
      "Applicare cicli/pause a integratori che agiscono per saturazione (creatina, vitamina D) è controproducente: si perde solo temporaneamente il beneficio, senza alcun vantaggio in cambio.",
      "Lo stacking di prodotti con lo stesso meccanismo d'azione raramente produce un effetto realmente additivo proporzionale al numero di prodotti assunti.",
    ],
    conclusion: "Cicli e stacking vanno applicati con criterio in base al meccanismo specifico di ogni integratore, non come regola generale 'meglio variare sempre': per la creatina e simili la costanza continua è la scelta corretta, per la caffeina e gli adattogeni un ciclo periodico ha un razionale fisiologico reale.",
  },
];

/* Piano scritto dal coach: bloccato in lettura per l'utente a pagamento. */
export const SUPP_PLAN_PRO = {
  mattina:    [{ name: "Multivitaminico", dose: "1 cpr", note: "a colazione, con cibo" },
               { name: "Omega 3", dose: "2 g", note: "a colazione" }],
  pomeriggio: [{ name: "Vitamina D3+K2", dose: "2.000 UI", note: "a pranzo, con grassi" }],
  preWo:      [{ name: "Caffeina", dose: "200 mg", note: "40 min prima" },
               { name: "Citrullina Malato", dose: "8 g", note: "40 min prima" }],
  postWo:     [{ name: "Whey Protein", dose: "30 g", note: "entro 1h dalla seduta" },
               { name: "Creatina", dose: "5 g", note: "con lo shaker post-workout" }],
  sera:       [{ name: "Magnesio", dose: "300 mg", note: "30 min prima di dormire" }],
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

// Aggrega gli alimenti della Dieta Tipo (mealGuide, uno slot per pasto) in
// un'unica lista per nome, sommando i grammi dove lo stesso alimento
// ricorre in più pasti — stessa fonte già mostrata pasto per pasto qui
// sotto, nessun secondo calcolo/piano parallelo.
function aggregateShoppingList(mealGuide) {
  const totals = new Map();
  (mealGuide || []).forEach((slot) => {
    (slot.items || []).forEach((it) => {
      totals.set(it.name, (totals.get(it.name) || 0) + (it.grams || 0));
    });
  });
  return [...totals.entries()]
    .map(([name, grams]) => ({ name, grams: Math.round(grams) }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/* Lista della spesa: spuntabile mentre si è al supermercato (stato solo
   locale, si azzera chiudendo — è un aiuto per quella spesa, non un dato da
   salvare). Stesso linguaggio visivo di CompliancePopup/WeeklyCheckModal. */
function ShoppingListModal({ items, accent, onClose }) {
  const [checked, setChecked] = useState({});
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)", overflowY: "auto" }}
           onClick={onClose}>
        <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 overflow-y-auto"
             style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)", maxHeight: "88vh" }}
             onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-center justify-between mb-1.5">
              <p className="h1 flex items-center gap-2">
                <ShoppingCart size={18} style={{ color: accent }} /> Lista della spesa
              </p>
              <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
            </div>
          </div>
          <p className="body mb-4">Dagli alimenti della tua dieta tipo, quantità totali per l'intera giornata.</p>
          {items.length === 0 ? (
            <p className="meta">Nessun alimento nel piano di oggi.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((it) => {
                const on = !!checked[it.name];
                return (
                  <button key={it.name} onClick={() => setChecked((c) => ({ ...c, [it.name]: !c[it.name] }))}
                    className="inner w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]">
                    <span className="flex items-center gap-2.5 min-w-0">
                      {on
                        ? <CheckCircle2 size={19} style={{ color: accent }} className="shrink-0" />
                        : <span className="shrink-0" style={{ width: 19, height: 19, borderRadius: "50%", border: "1.5px solid var(--line)" }} />}
                      <span className="truncate" style={{ color: on ? "var(--ink-2)" : "var(--ink)", textDecoration: on ? "line-through" : "none" }}>
                        {it.name}
                      </span>
                    </span>
                    <span className="font-data text-xs shrink-0" style={{ color: "var(--ink-2)" }}>{it.grams} g</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

function NutritionTabs({
  accent, accentSoft, accentText, target, mealsBySlot, foods, mealGuide,
  onAddFood, onRemoveFood, onUpdateFood, onOpenScanner, onAddCustomFood, onCopyYesterday,
  fullAccess, subsAccess, onUpgrade, onOpenChat, isRealMode,
  userPlan, gender, waterMl, microAddon, digestValue, onDigestChange, supabase, userId,
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
  const [manualMicrosOpen, setManualMicrosOpen] = useState(false);
  const [manualMacros, setManualMacros] = useState({ kcal: "", p: "", c: "", f: "", na: "", k: "", fe: "", ca: "", mg: "" });
  // Modifica grammi di un alimento già nel diario: niente più
  // cancella-e-ricerca per correggere una quantità sbagliata o cambiata.
  const [editingGramsKey, setEditingGramsKey] = useState(null); // `${slotId}-${index}`
  const [editGramsValue, setEditGramsValue] = useState("");
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  // BUG PRESO: onCopyYesterday poteva fallire (rete, RLS) e l'unico segnale
  // era un console.error — il pulsante tornava normale senza nessuna
  // spiegazione, sembrava non avesse fatto nulla.
  const [copyYesterdayBusy, setCopyYesterdayBusy] = useState(false);
  const [copyYesterdayError, setCopyYesterdayError] = useState("");

  // Diario Libero resta sempre disponibile. "I Miei Target" non è più un tab
  // qui accanto: i target vivono ora in cima alla schermata Alimentazione
  // (fuori da questi tab, sempre visibili e modificabili da lì — vedi
  // screen === "nutrition"), così non serve cercarli in un tab separato.
  // Sostituzioni solo Premium/Full Coaching (subsAccess, più
  // stretto di "qualunque piano a pagamento") — ma il bottone resta sempre
  // visibile (vedi tab === "subs" sotto), il contenuto è bloccato con una
  // spiegazione accattivante invece di sparire. Dieta Tipo, scritta dal
  // coach, solo Full Coaching (fullAccess). BUG PRESO (storico): questo tab
  // mostrava SEMPRE lo stesso mealGuide segnaposto fisso a ogni cliente Full
  // Coaching, spacciandolo per "scritto dal coach", perché il coach panel
  // non aveva ancora modo di salvare i pasti stessi (solo macro/calorie,
  // nutrition_targets) — mai un dato inventato. Ora che il coach può
  // davvero salvare i pasti (diet_plans, SCHEMA_v83 — "Salva modifiche" in
  // WeekDietEditor), in modalità reale il tab compare appena esiste almeno
  // un pasto assegnato per il profilo ON/OFF di oggi (mealGuide reale, non
  // più il segnaposto GUIDE); resta nascosto finché il coach non ha ancora
  // compilato nulla.
  const hasRealDietPlan = Array.isArray(mealGuide) && mealGuide.some((slot) => slot.items && slot.items.length > 0);
  const visibleTabs = pastDayMode ? [["diary", "Diario Libero"]] : [
    ["diary", "Diario Libero"],
    // Sostituzioni: bottone sempre visibile anche a chi non ha ancora il
    // piano giusto (come Wiki qui sotto) — il contenuto resta bloccato con
    // una spiegazione accattivante invece di sparire, per invogliare
    // all'upgrade invece di nascondere che la funzione esiste.
    ["subs", "Sostituzioni"],
    ...(fullAccess && (!isRealMode || hasRealDietPlan) ? [["plan", "Dieta Tipo"]] : []),
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

  // Abitudini alimentari personali (fetchFoodUsageStats, coachingData.js):
  // caricate una volta sola all'apertura di questa schermata, usate qui sotto
  // per proporre per primi gli alimenti mangiati più spesso, e più giù
  // (pickFood) per precompilare i grammi con l'ultima quantità usata per
  // quell'alimento — la maggior parte delle persone ripete più o meno
  // sempre le stesse quantità degli stessi alimenti.
  const [foodUsage, setFoodUsage] = useState(new Map());
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    fetchFoodUsageStats(supabase, userId)
      .then((stats) => { if (!cancelled) setFoodUsage(stats); })
      .catch((err) => console.error("PERFORM: errore lettura abitudini alimentari", err));
    return () => { cancelled = true; };
  }, [supabase, userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
    const byUsage = [...base].sort((a, b) => (foodUsage.get(b.name)?.count ?? 0) - (foodUsage.get(a.name)?.count ?? 0));
    return byUsage.slice(0, 10);
  }, [query, foods, foodUsage]);

  // Unico punto in cui si "sceglie" un alimento già noto (dal catalogo locale
  // o da Open Food Facts) — precompila i grammi con l'ultima quantità
  // davvero usata per questo nome, se ce n'è una; altrimenti lascia il campo
  // come sta (l'utente digita, come oggi). Tap sui grammi per modificarli
  // resta sempre possibile, prima o dopo l'aggiunta al pasto.
  const pickFood = (food) => {
    setSelected(food);
    setQuery(food.name);
    setDropOpen(false);
    const usage = foodUsage.get(food.name);
    if (usage) setGrams(String(usage.lastGrams));
  };

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
      na: Number(manualMacros.na) || 0, k: Number(manualMacros.k) || 0, fe: Number(manualMacros.fe) || 0,
      ca: Number(manualMacros.ca) || 0, mg: Number(manualMacros.mg) || 0,
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
            <>
              <button onClick={async () => {
                  setCopyYesterdayBusy(true); setCopyYesterdayError("");
                  try { await onCopyYesterday(); }
                  catch (err) { setCopyYesterdayError("Non sono riuscito a copiare i pasti di ieri — riprova."); }
                  finally { setCopyYesterdayBusy(false); }
                }}
                disabled={copyYesterdayBusy}
                className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-5 disabled:opacity-60"
                style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
                {copyYesterdayBusy ? <Loader2 size={15} className="animate-spin" style={{ color: "#FFFFFF" }} /> : <RefreshCw size={15} style={{ color: "#FFFFFF" }} />}
                Copia i pasti di ieri
              </button>
              <p className="text-xs text-center mb-5" style={{ color: "#DC2626", display: copyYesterdayError ? "block" : "none" }}>
                {copyYesterdayError || " "}
              </p>
            </>
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
                        {selected ? (
                          <button onClick={reset} className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                                  style={{ color: "var(--ink-2)" }} aria-label="Svuota">
                            <X size={14} />
                          </button>
                        ) : (
                          <VoiceSearchButton onTranscript={(t) => { setQuery(t); setSelected(null); setDropOpen(true); }} />
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
                                onMouseDown={() => pickFood(f)}
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
                                onMouseDown={() => { onAddCustomFood && onAddCustomFood(f); pickFood(f); }}
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
                          {/* Micronutrienti: opzionali e ripiegati di default — un
                              alimento aggiunto a mano senza compilarli qui non
                              contribuiva MAI ai totali di sodio/potassio/ferro/
                              calcio/magnesio del diario, nemmeno dopo il fix dello
                              schema (nutrition_logs/custom_foods hanno le colonne,
                              ma restano vuote se nessuno le scrive). */}
                          <button type="button" onClick={() => setManualMicrosOpen((v) => !v)}
                            className="text-xs font-medium mb-2" style={{ color: accent }}>
                            {manualMicrosOpen ? "− Nascondi micronutrienti" : "+ Aggiungi micronutrienti (opzionale)"}
                          </button>
                          {manualMicrosOpen && (
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              {[["na", "Sodio mg"], ["k", "Potassio mg"], ["fe", "Ferro mg"], ["ca", "Calcio mg"], ["mg", "Magnesio mg"]].map(([k, lab]) => (
                                <label key={k} className="block">
                                  <span className="label block mb-1" style={{ fontSize: "0.62rem" }}>{lab}</span>
                                  <input type="number" min="0" value={manualMacros[k]}
                                    onChange={(e) => setManualMacros((m) => ({ ...m, [k]: e.target.value }))}
                                    placeholder="0" className="input w-full px-3 py-2.5 text-sm font-data" aria-label={lab} />
                                </label>
                              ))}
                            </div>
                          )}
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
            <MicronutrientGrid mealsBySlot={mealsBySlot} userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} onOpenChat={onOpenChat} accent={accent} waterMl={waterMl} microAddon={microAddon} />

            {/* Non "!fullAccess" (che ora significa solo "non è Full Coaching"):
                Scheda Personalizzata e Solo Allenamento Coaching hanno già un
                coach vero, non ha senso proporgli di trovarne uno. Il nudge ha
                senso solo per chi non ne ha nessuno. */}
            {(userPlan === "free" || userPlan === "performance_pack") && (
              <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
                text="Registrare cosa mangi è il primo passo. Il secondo è sapere se sta davvero funzionando: fatti aiutare da un professionista del settore che legge il tuo diario e aggiusta il piano per te." />
            )}

            {/* ultima cosa del Diario Libero: digestione di oggi, 1-10, facoltativa —
                salvata su daily_metrics (SCHEMA_v57), visibile anche al coach nei
                grafici trend per decidere refeed/deload non a caso. */}
            <div className="card mt-4">
              <p className="label mb-1">Ultima cosa</p>
              <Scale10Rating label="Digestione (1-10)" value={digestValue} onChange={onDigestChange} hint="10 = ottima" />
            </div>
          </>
        )}
        </div>
      )}

      {/* "I Miei Target" non è più un tab qui: vive in cima alla schermata
          Alimentazione (screen === "nutrition"), sempre visibile. */}

      {/* ---------------- DIETA TIPO (solo Full Coaching, il tab
          stesso è nascosto agli altri piani — vedi visibleTabs sopra) ---------------- */}
      {tab === "plan" && fullAccess && (!isRealMode || hasRealDietPlan) && (
        <div className="spring-in">
          <div className="card">
            <p className="label mb-1">Dieta scritta dal coach</p>
            <p className="h1 mb-1">La tua dieta tipo</p>
            <p className="body mb-4">
              Costruita sui macro di oggi ({target.kcal} kcal · P{target.p} / C{target.c} / G{target.f}).
              Le grammature sono già scalate: è la traccia, il Diario Libero resta il posto dove registri
              ciò che mangi davvero.
            </p>
            <button onClick={() => setShoppingListOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-4"
              style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <ShoppingCart size={15} style={{ color: "#FFFFFF" }} />
              Genera la lista della spesa
            </button>
            <div className="space-y-3">
              {mealGuide.map((slot, i) => {
                // slot.name/slot.time sono il nome/orario REALI che il coach ha
                // dato al pasto in WeekDietEditor (snapshotMeals) — quanti pasti
                // vuole, chiamati come vuole, nell'ordine che vuole. MEAL_SLOTS
                // resta solo un fallback per il segnaposto demo (GUIDE, che non
                // ha name/time) e per trovare un'icona sensata quando il nome
                // del coach coincide con una delle 6 fasce canoniche.
                const label = slot.name || MEAL_SLOTS[i]?.label || "Pasto";
                const icon = MEAL_SLOTS.find((s) => s.label.toLowerCase() === (slot.name || "").toLowerCase())?.icon
                  || MEAL_SLOTS[i]?.icon || "🍽️";
                return (
                  <div key={slot.name ? `${slot.name}-${i}` : MEAL_SLOTS[i].id} className="inner px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span aria-hidden="true" className="text-sm leading-none">{icon}</span>
                      <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{label}</p>
                      {slot.time && (
                        <span className="font-data text-[10px] ml-auto px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: "var(--surface-2)", color: "var(--ink-soft)" }}>
                          {slot.time}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                      {[["Kcal", Math.round(slot.tot.kcal), ""], ["Prot", slot.tot.p, "g"], ["Carb", slot.tot.c, "g"], ["Grassi", slot.tot.f, "g"]].map(([lab, val, unit]) => (
                        <div key={lab} className="rounded-lg py-1.5 text-center" style={{ backgroundColor: "var(--surface-2)" }}>
                          <p className="font-data" style={{ fontSize: "0.55rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-soft)" }}>{lab}</p>
                          <p className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{val}{unit}</p>
                        </div>
                      ))}
                    </div>
                    {slot.items.map((it) => (
                      <p key={it.name} className="font-data text-xs flex justify-between py-0.5">
                        <span style={{ color: "var(--ink)" }}>{it.name}</span>
                        <span style={{ color: accentText, fontWeight: 600 }}>{it.grams} g</span>
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SOSTITUZIONI (Premium/Full Coaching —
          bottone sempre visibile, contenuto bloccato altrove) ---------------- */}
      {tab === "subs" && (
        <div className="spring-in">
          {subsAccess ? (
            <SubsPanel foods={foods} accent={accent} accentSoft={accentSoft}
                       accentText={accentText} />
          ) : (
            <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
              title="🔒 NON PIÙ BLOCCATO DA UN ALIMENTO CHE NON HAI"
              text="Finito il pollo, niente riso in casa, un ristorante senza quel piatto? Le Sostituzioni trovano al volo l'alimento equivalente per macro nel tuo stesso catalogo — il piano resta in target senza rifare i calcoli a mano. Incluso dal Premium (€5/mese) in su." />
          )}
        </div>
      )}

      {tab === "wiki" && (
        <div className="spring-in">
          {userPlan !== "free" ? (
            <WikiBrowser title="Wiki Alimentazione" subtitle="Cosa sappiamo davvero" data={NUTRITION_WIKI} accent={accent}
              intro="Proteine, deficit/surplus calorico e micronutrienti contano per chiunque, non solo per chi si allena: energia quotidiana, funzione immunitaria, lucidità mentale, salute ossea e longevità dipendono dalla stessa base nutrizionale. In un percorso in sala pesi questi principi vengono applicati con più precisione — si pesano gli alimenti, si calcola un target di macro, si programmano fasi di surplus o deficit — perché servono risultati misurabili in tempi definiti: pro, un controllo molto più fine su composizione corporea e performance; contro, richiede tracking costante e, se vissuto in modo ossessivo, può peggiorare il rapporto con il cibo invece di migliorarlo — per la sola salute generale bastano abitudini molto più semplici."
              searchPlaceholder="Cerca un argomento (es. proteine, deficit, digiuno...)" />
          ) : (
            <LockedChartOverlay gender={gender} onUpgrade={onUpgrade}
              title="🔒 SBLOCCA LA SCIENZA DIETRO LA TUA DIETA"
              text="Deficit e surplus calorico, timing delle proteine, micronutrienti: capisci il PERCHÉ dietro ogni target che segui, non solo il numero. Dal Premium (€5/mese) in su hai accesso completo, ricercabile, sempre aggiornato." />
          )}
        </div>
      )}

      {shoppingListOpen && (
        <ShoppingListModal items={aggregateShoppingList(mealGuide)} accent={accent} onClose={() => setShoppingListOpen(false)} />
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

function SubsPanel({ foods, accent, accentSoft, accentText }) {
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
  const results = useMemo(
    () => (source && gramsNum > 0 ? findSubstitutes(source, gramsNum, foods) : []),
    [source, gramsNum, foods]
  );

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
          : <SupplementsFreeDiary accent={accent} accentSoft={accentSoft} accentText={accentText} isPaid={isPaid} isTrainingDay={isTrainingDay} onUpgrade={onUpgrade} onCoachSync={onCoachSync} onXpEarned={onXpEarned} supabase={supabase} userId={userId} />
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

function SupplementsFreeDiary({ accent, accentSoft, accentText, isPaid, isTrainingDay, onUpgrade, onCoachSync, onXpEarned, supabase, userId }) {
  const isRealMode = Boolean(supabase && userId);

  // BUG PRESO: l'intero diario autogestito (momenti personalizzati, ogni
  // integratore, orario/promemoria, spunta "preso") era SOLO stato React
  // locale — spariva sempre riaprendo l'app. Reale ora tramite
  // self_supplements/self_supplement_intake (SCHEMA_v56), stesso pattern
  // già validato per il protocollo Pro (prescribed_supplements/
  // supplement_intake). In demo (!isRealMode) resta lo stato locale di
  // sempre, invariato.
  const [realRows, setRealRows] = useState(null); // null = non ancora caricato
  const [realTaken, setRealTaken] = useState(null);
  const loadReal = useCallback(() => {
    if (!isRealMode) return;
    Promise.all([fetchSelfSupplements(supabase, userId), fetchSelfSupplementIntakeToday(supabase, userId)])
      .then(([rows, taken]) => { setRealRows(rows); setRealTaken(taken); })
      .catch((err) => {
        console.error("PERFORM: errore lettura diario integratori autogestito", err);
        setRealRows([]); setRealTaken(new Set());
      });
  }, [isRealMode, supabase, userId]);
  const todayIso = useTodayIso();
  useEffect(() => { loadReal(); }, [loadReal, todayIso]);

  // Momenti personalizzati creati in questa sessione ma ancora senza nessun
  // integratore: un momento vuoto non ha nessuna riga da salvare (niente da
  // ricordare), quindi resta solo locale finché non ci si aggiunge davvero
  // il primo integratore — da lì in poi lo ricostruisce realRows a ogni
  // apertura, come qualunque altro momento reale.
  const [pendingCustomMoments, setPendingCustomMoments] = useState([]);
  const [demoCustomMoments, setDemoCustomMoments] = useState([]);
  const [newMomentName, setNewMomentName] = useState("");

  const realCustomMoments = useMemo(() => {
    const seen = new Map();
    (realRows ?? []).forEach((r) => {
      if (r.moment_id.startsWith("custom-") && !seen.has(r.moment_id)) {
        seen.set(r.moment_id, { id: r.moment_id, label: r.moment_label || r.moment_id, icon: "✨" });
      }
    });
    return [...seen.values()];
  }, [realRows]);
  const customMoments = isRealMode
    ? [...realCustomMoments, ...pendingCustomMoments.filter((m) => !realCustomMoments.some((rm) => rm.id === m.id))]
    : demoCustomMoments;

  const allMoments = useMemo(() => [...SUPP_MOMENTS, ...customMoments], [customMoments]);
  /* Nei giorni OFF i moduli pre/post-workout si nascondono da soli e gli
     stimolanti si azzerano per favorire il recupero recettoriale. */
  const visibleMoments = useMemo(
    () => allMoments.filter((m) => isTrainingDay !== false || (m.id !== "preWo" && m.id !== "postWo")),
    [allMoments, isTrainingDay]
  );

  const [demoEntries, setDemoEntries] = useState(() => SUPP_MOMENTS.reduce((a, m) => ({ ...a, [m.id]: [] }), {}));
  const realEntries = useMemo(() => {
    const grouped = {};
    (realRows ?? []).forEach((r) => {
      if (!grouped[r.moment_id]) grouped[r.moment_id] = [];
      grouped[r.moment_id].push({
        id: r.id, name: r.name, qty: r.qty || "", time: r.reminder_time || "",
        dayType: r.day_type || "all", reminderOn: !!r.reminder_on, taken: !!realTaken?.has(r.id),
      });
    });
    return grouped;
  }, [realRows, realTaken]);
  const entries = isRealMode ? realEntries : demoEntries;

  const [draft, setDraft] = useState(() => SUPP_MOMENTS.reduce((a, m) => ({ ...a, [m.id]: { name: "", qty: "", time: "", dayType: "all" } }), {}));
  // Ogni momento (canonico o personalizzato, in arrivo da un fetch reale o
  // creato al volo) deve avere una riga di bozza pronta prima che l'input
  // provi a leggerla — seeding automatico appena compare un momento nuovo.
  useEffect(() => {
    setDraft((d) => {
      const missing = allMoments.filter((m) => !d[m.id]);
      if (missing.length === 0) return d;
      const next = { ...d };
      missing.forEach((m) => { next[m.id] = { name: "", qty: "", time: "", dayType: "all" }; });
      return next;
    });
  }, [allMoments]);

  const [nowClock, setNowClock] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notifTriggered, setNotifTriggered] = useState({});

  const addCustomMoment = () => {
    const label = newMomentName.trim();
    if (!label) return;
    const id = `custom-${Date.now()}`;
    if (isRealMode) {
      setPendingCustomMoments((m) => [...m, { id, label, icon: "✨" }]);
    } else {
      setDemoCustomMoments((m) => [...m, { id, label, icon: "✨" }]);
      setDemoEntries((s) => ({ ...s, [id]: [] }));
    }
    setNewMomentName("");
  };
  const removeCustomMoment = (id) => {
    if (isRealMode) {
      setPendingCustomMoments((m) => m.filter((x) => x.id !== id));
      if (realCustomMoments.some((m) => m.id === id)) {
        removeSelfSupplementMoment(supabase, userId, id)
          .then(loadReal)
          .catch((err) => console.error("PERFORM: errore rimozione momento integratori", err));
      }
    } else {
      setDemoCustomMoments((m) => m.filter((x) => x.id !== id));
      setDemoEntries((s) => { const n = { ...s }; delete n[id]; return n; });
    }
    setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
  };

  /* Orologio locale: controlla ogni 30 secondi se è ora di un promemoria e,
     se il permesso è stato concesso, mostra subito una notifica LOCALE — utile
     solo se l'app è già aperta in quel momento esatto. Il vero promemoria che
     arriva anche ad app chiusa è la Edge Function supplement-reminders (push
     reale via VAPID, stesso meccanismo di daily-reminders): questa resta come
     rinforzo immediato quando capita di avere l'app aperta all'orario giusto,
     non l'unico canale come prima. */
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
    const reminderOn = !!d.time;
    if (isRealMode) {
      const custom = customMoments.find((m) => m.id === momentId);
      const sortOrder = (entries[momentId] || []).length;
      addSelfSupplement(supabase, userId, {
        momentId, momentLabel: custom ? custom.label : null,
        name: d.name.trim(), qty: d.qty.trim(), dayType: d.dayType || "all", sortOrder,
      })
        .then((row) => {
          if (reminderOn) updateSelfSupplementReminder(supabase, row.id, { reminderTime: d.time, reminderOn: true }).catch(() => {});
          setPendingCustomMoments((m) => m.filter((x) => x.id !== momentId));
          loadReal();
        })
        .catch((err) => console.error("PERFORM: errore salvataggio integratore autogestito", err));
    } else {
      const entry = { id: Date.now() + Math.random(), name: d.name.trim(), qty: d.qty.trim(), time: d.time,
        dayType: d.dayType || "all", reminderOn, taken: false };
      setDemoEntries((s) => ({ ...s, [momentId]: [...(s[momentId] || []), entry] }));
    }
    setDraft((dr) => ({ ...dr, [momentId]: { name: "", qty: "", time: "", dayType: "all" } }));
    if (reminderOn) requestReminderPermission();
  };
  const removeEntry = (momentId, id) => {
    if (isRealMode) {
      removeSelfSupplement(supabase, id).then(loadReal).catch((err) => console.error("PERFORM: errore rimozione integratore autogestito", err));
    } else {
      setDemoEntries((s) => ({ ...s, [momentId]: s[momentId].filter((e) => e.id !== id) }));
    }
  };
  const toggleTaken = (momentId, id) => {
    if (isRealMode) {
      const wasTaken = realTaken?.has(id);
      const taken = !wasTaken;
      setRealTaken((s) => { const n = new Set(s); wasTaken ? n.delete(id) : n.add(id); return n; });
      setSelfSupplementTaken(supabase, userId, id, taken).catch((err) => {
        // BUG-CLASS PRESA (stessa già risolta per le serie e per il diario
        // alimentare): con rete assente questo era un rollback silenzioso —
        // la spunta tornava indietro, indistinguibile da "non ho toccato
        // nulla". setSelfSupplementTaken è idempotente (insert/delete
        // tollerano il duplicato/il già-assente, vedi coachingData.js), va
        // quindi in coda e si ritenta da solo: NIENTE rollback, la spunta
        // resta come l'ha lasciata l'utente.
        console.error("PERFORM: errore salvataggio spunta integratore autogestito, la metto in coda per riprovare quando torna la rete", err);
        enqueueWrite("self-supplement-taken", { userId, id, taken });
      });
    } else {
      setDemoEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, taken: !e.taken } : e)) }));
    }
    onCoachSync && onCoachSync({ type: "supplement", momentId, id });
  };
  const toggleReminder = (momentId, id) => {
    if (isRealMode) {
      const current = (realRows ?? []).find((r) => r.id === id);
      const nextOn = !current?.reminder_on;
      setRealRows((rows) => rows.map((r) => (r.id === id ? { ...r, reminder_on: nextOn } : r)));
      updateSelfSupplementReminder(supabase, id, { reminderTime: current?.reminder_time, reminderOn: nextOn })
        .catch((err) => console.error("PERFORM: errore aggiornamento promemoria", err));
    } else {
      setDemoEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, reminderOn: !e.reminderOn } : e)) }));
    }
    requestReminderPermission();
  };
  const setEntryTime = (momentId, id, time) => {
    if (isRealMode) {
      const current = (realRows ?? []).find((r) => r.id === id);
      setRealRows((rows) => rows.map((r) => (r.id === id ? { ...r, reminder_time: time } : r)));
      updateSelfSupplementReminder(supabase, id, { reminderTime: time, reminderOn: current?.reminder_on })
        .catch((err) => console.error("PERFORM: errore aggiornamento orario integratore", err));
    } else {
      setDemoEntries((s) => ({ ...s, [momentId]: s[momentId].map((e) => (e.id === id ? { ...e, time } : e)) }));
    }
  };

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

  if (isRealMode && (realRows === null || realTaken === null)) {
    return <p className="body px-1">Caricamento…</p>;
  }

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
            <div className="inner p-4 mb-3">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>Approfondimento chimico-fisiologico</p>
              <p className="body" style={{ fontSize: "0.86rem", lineHeight: 1.6 }}>{w.deepDive}</p>
            </div>
          )}
          {w.chart && (
            <div className="inner p-4 mb-3">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>{w.chart.title || "In grafico"}</p>
              <WikiBarChart {...w.chart} accent={accent} />
            </div>
          )}
          {(w.pros?.length > 0 || w.cons?.length > 0) && (
            <div className="space-y-2 mb-3">
              {w.pros?.length > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                  <p className="label mb-1.5" style={{ color: "#10B981", fontSize: "0.6rem" }}>Pro</p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {w.pros.map((p, i) => <li key={i} className="meta" style={{ fontSize: "0.74rem", lineHeight: 1.5, marginBottom: 3 }}>{p}</li>)}
                  </ul>
                </div>
              )}
              {w.cons?.length > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(240,160,32,0.08)", border: "1px solid rgba(240,160,32,0.28)" }}>
                  <p className="label mb-1.5" style={{ color: "#B45309", fontSize: "0.6rem" }}>Contro</p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {w.cons.map((c, i) => <li key={i} className="meta" style={{ fontSize: "0.74rem", lineHeight: 1.5, marginBottom: 3 }}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {w.conclusion && (
            <div className="rounded-xl p-3.5" style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}35` }}>
              <p className="label mb-1" style={{ color: accent, fontSize: "0.6rem" }}>Conclusione</p>
              <p className="body" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>{w.conclusion}</p>
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
    pros: [
      "È il macronutriente con più margine di errore verso l'alto: sforare leggermente il target proteico non ha conseguenze negative significative.",
      "Ha il più alto effetto termico (costo digestivo) tra i macronutrienti e il maggior impatto sulla sazietà a parità di calorie.",
      "Un apporto adeguato protegge la massa muscolare anche in deficit calorico prolungato.",
    ],
    cons: [
      "Oltre 2.2-2.5 g/kg non porta benefici aggiuntivi misurabili, solo un costo economico e di sazietà da gestire nel piano alimentare.",
      "Concentrare tutte le proteine in 1-2 pasti riduce il numero di finestre di sintesi proteica attivate nella giornata rispetto a una distribuzione più regolare.",
    ],
    conclusion: "1.6-2.2 g/kg/die distribuiti su 3-4 pasti coprono il fabbisogno nella quasi totalità dei casi: aumentare oltre questo range non produce benefici proporzionali, mentre scendere sotto 1.6 g/kg mette a rischio la massa muscolare, specie in deficit calorico.",
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
    pros: [
      "Sostengono direttamente la qualità delle sessioni ad alta intensità e il recupero tra una seduta e l'altra nei periodi di volume alto.",
      "Sono la leva più facile da modulare al rialzo o al ribasso a parità di proteine e grassi per aggiustare il totale calorico.",
    ],
    cons: [
      "Tagliarli drasticamente per 'accelerare' il dimagrimento non produce risultati migliori a parità di deficit calorico, solo più fatica e allenamenti peggiori.",
      "Un eccesso cronico oltre il fabbisogno calorico totale si converte comunque in accumulo di grasso, indipendentemente dall'indice glicemico della fonte.",
    ],
    conclusion: "I carboidrati vanno dosati in funzione del volume di allenamento e dell'obiettivo calorico, non demonizzati né sopravvalutati: sono lo strumento più pratico per sostenere le prestazioni quando il totale calorico lo permette.",
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
    pros: [
      "Indispensabili per la sintesi ormonale e l'assorbimento delle vitamine liposolubili: non sono comprimibili a piacere come i carboidrati.",
      "Ad alta densità calorica, sono utili per raggiungere un surplus calorico senza volumi di cibo eccessivi.",
    ],
    cons: [
      "Scendere sotto 0.5-0.8 g/kg per allungare altri macro può peggiorare il quadro ormonale, soprattutto in deficit prolungato.",
      "Per la loro alta densità calorica, un eccesso non controllato è la via più facile per sforare il totale calorico senza accorgersene.",
    ],
    conclusion: "I grassi vanno mantenuti in un range minimo di sicurezza (0.5-0.8 g/kg) indipendentemente dall'obiettivo, con il resto della quota calorica ripartito tra proteine e carboidrati in base a preferenze e prestazione.",
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
    chart: {
      title: "Velocità di perdita peso e rischio di perdere massa magra",
      labels: ["<0.5%", "0.5-1%", "1-1.5%", ">1.5%"],
      values: [2, 3, 6, 9],
      unit: "",
      highlight: 1,
      caption: "Rischio relativo di perdita di massa magra per fascia di velocità di dimagrimento settimanale (% del peso corporeo); indicativo, non un dato individuale.",
    },
    pros: [
      "È l'unica leva che determina davvero la perdita di grasso: nessun trucco di timing o combinazione di alimenti la sostituisce.",
      "Un deficit moderato (15-25%) è sostenibile per mesi, permettendo di preservare meglio la performance in palestra rispetto a tagli drastici.",
    ],
    cons: [
      "Un deficit troppo aggressivo accelera la perdita di peso ma aumenta il rischio di perdere massa muscolare oltre che grasso.",
      "Il deficit prolungato senza pause porta ad adattamento metabolico e cala l'aderenza psicologica al piano nel tempo.",
    ],
    conclusion: "Un deficit del 15-25% con una velocità di perdita dello 0.5-1% del peso a settimana, corretto periodicamente sul trend di peso reale e intervallato da diet break, è il compromesso più sostenibile tra risultato e conservazione della massa magra.",
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
    pros: [
      "Un surplus moderato massimizza il rapporto tra massa muscolare guadagnata e grasso accumulato, riducendo il lavoro di definizione successivo.",
      "Più margine calorico rispetto al mantenimento, utile per sostenere volumi di allenamento più alti senza fatica cronica da scarsità energetica.",
    ],
    cons: [
      "Un surplus troppo alto non accelera la crescita muscolare oltre il tetto biologico naturale, solo l'accumulo di grasso.",
      "Richiede un monitoraggio regolare del peso: senza correzioni periodiche, il surplus reale tende a derivare oltre quanto pianificato.",
    ],
    conclusion: "Un surplus del 5-15% sopra il mantenimento, verificato e corretto ogni 2-3 settimane sul trend di peso reale, massimizza la crescita muscolare per unità di grasso accumulato — surplus più alti non velocizzano la crescita, solo l'aumento di grasso.",
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
    pros: [
      "Un adeguato sodio pre-allenamento in giorni caldi/ad alta sudorazione previene crampi ed è utile per la performance, non solo un rischio da limitare.",
      "Aumentare il potassio da cibo vero (patate, banana, spinaci) è economico e privo di rischi di eccesso rispetto all'integrazione diretta.",
    ],
    cons: [
      "L'eccesso cronico di sodio da cibi processati è associato a pressione arteriosa più alta nei soggetti sale-sensibili.",
      "Un eccesso di potassio da integrazione (non da cibo) può essere pericoloso in presenza di problemi renali non diagnosticati.",
    ],
    conclusion: "La strategia più semplice ed efficace è ridurre i cibi confezionati (fonte dominante di sodio in eccesso) e aumentare gli alimenti naturalmente ricchi di potassio, senza bisogno di inseguire numeri precisi su un'etichetta per la maggior parte delle persone sane.",
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
    pros: [
      "Facile da correggere con la dieta (carne rossa, molluschi, legumi + vitamina C) nella maggior parte dei casi non clinicamente gravi.",
      "Il controllo della ferritina è un esame economico e diffuso, utile per intercettare una carenza prima che diventi anemia conclamata.",
    ],
    cons: [
      "Il ferro non-eme da fonti vegetali ha un assorbimento molto inferiore: chi è vegetariano/vegano deve dedicare più attenzione agli abbinamenti alimentari.",
      "L'integrazione di ferro senza carenza accertata va evitata: un eccesso cronico non necessario può essere dannoso.",
    ],
    conclusion: "Un apporto adeguato di ferro va garantito soprattutto nelle donne in età fertile e nei regimi vegetariani/vegani, con verifica della ferritina in caso di affaticamento cronico inspiegato — l'integrazione va riservata a una carenza accertata, non presa 'per sicurezza'.",
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
    pros: [
      "La vitamina D è uno dei pochi micronutrienti dove l'integrazione è ragionevole anche senza carenza diagnosticata, dato quanto è diffusa l'insufficienza.",
      "Un buon apporto di calcio e vitamina D sostiene la densità ossea, un fattore diretto di prevenzione infortuni per chi carica pesante.",
    ],
    cons: [
      "Senza verifica dei livelli ematici, l'integrazione di vitamina D è una stima alla cieca: il dosaggio ottimale varia molto da persona a persona.",
      "Un eccesso cronico di calcio da integrazione (non da cibo) non è privo di rischi e va evitato senza reale necessità.",
    ],
    conclusion: "Verificare i livelli ematici di vitamina D col proprio medico è il primo passo prima di integrare stabilmente; il calcio va invece prioritariamente coperto da cibo (latticini, verdure a foglia, acqua ricca di calcio), con l'integrazione riservata a carenze accertate.",
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
    pros: [
      "Una carenza lieve è facilmente correggibile con cibo (frutta secca, semi, verdure a foglia) senza bisogno di integrazione nella maggior parte dei casi.",
      "Il suo ruolo nel rilassamento muscolare e nervoso lo rende utile in particolare per chi si allena molto o dorme male.",
    ],
    cons: [
      "Un eccesso da integrazione (non da cibo) può causare disturbi gastrointestinali, in particolare con le forme meno biodisponibili.",
      "L'effetto sul sonno, per quanto riportato spesso in modo soggettivo, non è garantito allo stesso modo per tutti.",
    ],
    conclusion: "Coprire il fabbisogno di magnesio prevalentemente da cibo è sufficiente per la maggior parte dei praticanti; l'integrazione serale ha senso soprattutto in presenza di crampi, tensione muscolare o sonno disturbato senza altra causa evidente.",
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
    pros: [
      "Aumenta la sazietà a parità di calorie, rendendo un deficit calorico più gestibile senza fame eccessiva.",
      "Nutre il microbiota intestinale, con effetti positivi documentati sulla regolazione dell'infiammazione sistemica.",
    ],
    cons: [
      "Un aumento troppo brusco della fibra può causare gonfiore e disagio intestinale: va introdotta gradualmente.",
      "Un eccesso può interferire con l'assorbimento di alcuni micronutrienti se assunta insieme in grandi quantità.",
    ],
    conclusion: "25-35 g/die di fibra, da fonti varie (verdura, legumi, cereali integrali) e introdotte gradualmente, sostengono sazietà e salute intestinale senza il disagio di un aumento troppo rapido — particolarmente utile da non sacrificare proprio nelle diete più ipocaloriche.",
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
    pros: [
      "Semplifica la gestione dei pasti per chi trova più facile aderire a un piano con meno decisioni alimentari nella giornata.",
      "Non richiede alimenti specifici o esclusioni: è compatibile con qualunque composizione di macronutrienti.",
    ],
    cons: [
      "Nessun vantaggio metabolico dimostrato sul dimagrimento rispetto allo stesso totale calorico distribuito diversamente.",
      "Se la finestra di digiuno copre l'orario di allenamento, la performance nella sessione può peggiorare, specie su volumi/intensità alti.",
    ],
    conclusion: "Il digiuno intermittente è uno strumento di aderenza comportamentale, non una strategia metabolicamente superiore: ha senso per chi lo trova più semplice da seguire, non va adottato aspettandosi un vantaggio sul dimagrimento che la ricerca non conferma.",
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
    pros: [
      "Ha applicazioni cliniche specifiche solide (es. epilessia farmacoresistente) dove l'evidenza è forte, non solo un uso estetico.",
      "L'alto senso di sazietà di grassi/proteine può aiutare l'aderenza al deficit calorico per alcune persone.",
    ],
    cons: [
      "Penalizza tipicamente il volume e l'intensità di allenamento sostenibili per uno sport di forza/ipertrofia rispetto a una dieta con carboidrati adeguati.",
      "Il periodo di adattamento iniziale ('keto flu') comporta spesso stanchezza e cali di performance nelle prime 1-3 settimane.",
    ],
    conclusion: "Per un atleta di forza o ipertrofia, la chetogenica è raramente la strategia più efficiente per la composizione corporea: funziona come qualunque dieta ipocalorica sostenibile, ma il costo in termini di performance in palestra è quasi sempre più alto di un piano con carboidrati adeguati.",
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
    pros: [
      "È il pattern alimentare con più evidenza a lungo termine su popolazioni reali, non solo su studi metabolici di breve durata.",
      "Compatibile con qualunque obiettivo di composizione corporea: fornisce la qualità delle fonti, non entra in conflitto con le quantità calcolate per l'obiettivo.",
    ],
    cons: [
      "Da sola non specifica le quantità (kcal, proteine) necessarie per un obiettivo di performance o composizione corporea: va integrata con un calcolo specifico.",
      "Alcuni alimenti cardine (olio EVO in quantità) sono molto calorici: senza attenzione alle porzioni può facilitare un surplus non voluto.",
    ],
    conclusion: "La dieta mediterranea è la base qualitativa ideale su cui costruire qualunque piano orientato alla performance: definisce da dove vengono i nutrienti, mentre le quantità (calorie, proteine, timing) vanno calibrate separatamente in base all'obiettivo specifico.",
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
    pros: [
      "Anche una lieve correzione della disidratazione abituale (2-3 bicchieri d'acqua in più al giorno) migliora misurabilmente concentrazione e prestazione per molte persone.",
      "È la variabile nutrizionale più economica e priva di controindicazioni da correggere.",
    ],
    cons: [
      "Un'iperidratazione estrema in tempi brevi (litri d'acqua in poche ore) può causare iponatriemia, un rischio reale seppur raro negli sport di endurance estremi.",
      "Il fabbisogno varia molto con clima, sudorazione individuale e intensità: un numero fisso uguale per tutti è solo un punto di partenza.",
    ],
    conclusion: "30-35 ml/kg di base più il sudore perso in allenamento è una stima di partenza solida per la maggior parte delle persone; nei giorni caldi o ad alta sudorazione va integrato anche il sodio, non solo l'acqua, per prevenire i crampi da deplezione elettrolitica.",
  },
  {
    id: "bilancio-energetico", name: "Bilancio energetico e TDEE reale", icon: "⚖️",
    badge1: "Il TDEE stimato è un punto di partenza", badge2: "Il trend di peso è il dato vero",
    body: "Il TDEE (dispendio energetico totale giornaliero) calcolato con formule (Mifflin-St Jeor e simili) è solo " +
      "una stima di partenza, con un margine di errore reale anche del 10-20% da persona a persona — il dato che conta " +
      "davvero è come il peso si muove nel tempo alle calorie che si stanno effettivamente mangiando.",
    deepDive: "Le formule predittive del TDEE si basano su peso, altezza, età e livello di attività dichiarato, ma non " +
      "catturano variabili individuali come il NEAT (dispendio da attività non strutturata: camminare, muoversi, " +
      "gesticolare, che può variare di centinaia di calorie al giorno tra persone apparentemente simili), l'efficienza " +
      "metabolica individuale o la storia dietetica recente (chi esce da un lungo deficit ha spesso un TDEE reale più " +
      "basso di quanto la formula predica). L'approccio corretto è usare la formula come punto di partenza, poi " +
      "correggerla ogni 2-3 settimane osservando il trend di peso reale (media mobile, non il singolo giorno, per " +
      "eliminare il rumore dato dalla ritenzione idrica) rispetto alle calorie effettivamente consumate.",
    pros: [
      "Evita di affidarsi ciecamente a un numero teorico che può essere sbagliato del 10-20% per la singola persona.",
      "Il metodo di correzione empirica (calorie fisse, osservazione del trend) funziona indipendentemente da quanto la formula di partenza sia accurata.",
    ],
    cons: [
      "Richiede pazienza: servono almeno 2-3 settimane di dati coerenti (pesata regolare, aderenza calorica) prima che il trend sia affidabile.",
      "La ritenzione idrica (stress, sonno, ciclo mestruale, sodio, carboidrati) può mascherare temporaneamente il trend reale se si guarda solo il peso del singolo giorno.",
    ],
    conclusion: "Il TDEE calcolato è solo un punto di partenza da correggere sempre con i dati reali: pesata regolare, media mobile settimanale e aggiustamento delle calorie ogni 2-3 settimane battono qualunque formula, per quanto sofisticata.",
  },
  {
    id: "nutrient-timing", name: "Nutrient timing: la finestra anabolica", icon: "⏰",
    badge1: "Molto più ampia di 30-60 minuti", badge2: "Il totale giornaliero conta di più",
    body: "La 'finestra anabolica' post-allenamento è molto più ampia di quanto si credeva un tempo (non 30-60 minuti, " +
      "ma diverse ore) — a parità di calorie e proteine totali giornaliere, il timing preciso del pasto post-workout " +
      "ha un impatto marginale sul risultato finale.",
    deepDive: "La sensibilità muscolare alla sintesi proteica indotta dall'allenamento resta elevata per 24-48 ore " +
      "dopo la sessione, non solo nella prima ora: uno studio spesso citato ha mostrato risultati comparabili tra " +
      "chi assumeva proteine subito prima/dopo l'allenamento e chi le assumeva più tardi nella giornata, a parità di " +
      "proteine totali. Il timing resta comunque rilevante in casi specifici: chi si allena a digiuno da molte ore, " +
      "chi fa doppie sedute nello stesso giorno (dove il ripristino rapido del glicogeno conta), o semplicemente chi " +
      "trova più comodo strutturare i pasti intorno all'allenamento per pura organizzazione pratica.",
    pros: [
      "Libera dall'ansia del 'devo mangiare entro 30 minuti': il totale giornaliero di proteine e calorie conta molto di più del timing preciso.",
      "Semplifica la programmazione dei pasti, che può seguire gli orari di vita reali invece di un vincolo rigido post-allenamento.",
    ],
    cons: [
      "In contesti specifici (doppie sedute, allenamento a digiuno molto prolungato) un timing più attento resta utile per la performance della sessione successiva.",
      "Il messaggio 'il timing non conta' viene talvolta frainteso come 'non serve strutturare i pasti', quando in realtà una distribuzione regolare resta utile per altri motivi (sazietà, sintesi proteica distribuita).",
    ],
    conclusion: "Il totale di calorie e proteine nell'arco della giornata determina il risultato molto più del timing preciso del pasto post-allenamento: la finestra anabolica ristretta a 30-60 minuti è un mito superato dalla ricerca più recente.",
  },
  {
    id: "iifym-vs-pulito", name: "IIFYM (dieta flessibile) vs. dieta 'pulita'", icon: "🍱",
    badge1: "Entrambe funzionano se aderenza è alta", badge2: "80/20 come compromesso pratico",
    body: "IIFYM ('if it fits your macros': qualunque alimento va bene purché rientri nei macro target) e la dieta " +
      "'pulita' (solo alimenti considerati integri/non processati) producono risultati simili in termini di " +
      "composizione corporea quando calorie e proteine sono equalizzate — la differenza reale è nell'aderenza e nella " +
      "sazietà a lungo termine, che variano da persona a persona.",
    deepDive: "Il corpo non distingue una caloria 'pulita' da una 'flessibile' ai fini del bilancio energetico: la " +
      "composizione corporea risponde principalmente a calorie totali, proteine e (in seconda battuta) al mantenimento " +
      "della massa muscolare tramite allenamento. La differenza pratica è che alimenti a bassa densità calorica e alto " +
      "contenuto di fibra (dieta 'pulita') tendono a dare più sazietà per caloria, un vantaggio in deficit; alimenti " +
      "più processati inseriti con criterio (dieta flessibile) possono migliorare l'aderenza psicologica sul lungo " +
      "periodo per chi si sente 'privato' con un regime troppo rigido. Un compromesso pratico diffuso è la regola " +
      "80/20: circa l'80% dei pasti da fonti dense di nutrienti, il restante 20% libero per gestire la sostenibilità " +
      "sociale e psicologica del piano.",
    pros: [
      "IIFYM aumenta la sostenibilità sociale e psicologica del piano per chi si sente privato con un regime troppo rigido.",
      "La dieta 'pulita' dà più sazietà per caloria grazie alla densità di fibra e volume, un vantaggio concreto in deficit.",
    ],
    cons: [
      "L'IIFYM applicato senza criterio (solo cibo processato, macro a posto) rischia carenze di micronutrienti e fibra nel lungo periodo.",
      "Un regime 'pulito' troppo rigido, senza margine di flessibilità, spesso peggiora l'aderenza a lungo termine e aumenta il rischio di abbuffate compensatorie.",
    ],
    conclusion: "Non esiste un vincitore assoluto tra i due approcci: la regola 80/20 (fonti dense di nutrienti come base, margine flessibile per la sostenibilità) copre sia la qualità nutrizionale sia l'aderenza psicologica nel lungo periodo, il vero fattore che decide il risultato finale.",
  },
  {
    id: "refeed-diet-break", name: "Refeed e diet break", icon: "🔁",
    badge1: "Refeed: 1-2 giorni a mantenimento", badge2: "Diet break: 1-2 settimane a mantenimento",
    body: "Il refeed (1-2 giorni a calorie di mantenimento, spesso con più carboidrati) e il diet break (1-2 settimane " +
      "intere a mantenimento) sono strumenti programmati per alleggerire la fatica psicologica e metabolica di un " +
      "deficit prolungato, non un 'premio' occasionale scollegato dal piano.",
    deepDive: "In deficit calorico prolungato calano gradualmente leptina, ormoni tiroidei e NEAT (movimento non " +
      "strutturato), un adattamento che riduce il dispendio energetico oltre quanto spiegato dalla sola perdita di " +
      "peso. Un refeed breve non inverte questo adattamento in modo permanente, ma un diet break di 1-2 settimane a " +
      "mantenimento (non un surplus) permette un parziale recupero ormonale e una pausa psicologica dalla restrizione, " +
      "utile soprattutto in deficit molto lunghi (oltre le 10-12 settimane continuative). Vanno programmati in " +
      "anticipo dentro il piano, non decisi d'impulso in un momento di scarsa aderenza — altrimenti rischiano di " +
      "diventare una scusa per uscire dal deficit senza un reale beneficio strutturato.",
    pros: [
      "Un diet break programmato migliora l'aderenza psicologica nei deficit molto lunghi, riducendo il rischio di abbandono del piano.",
      "Aiuta a recuperare parzialmente gli adattamenti ormonali/metabolici che si accumulano in deficit prolungato.",
    ],
    cons: [
      "Se non programmato in anticipo, rischia di trasformarsi in una scusa per uscire dal deficit senza un reale beneficio strutturato.",
      "Un refeed/diet break troppo frequente (ogni settimana) vanifica il deficit medio necessario per progredire.",
    ],
    conclusion: "Refeed e diet break sono strumenti, non premi: programmati in anticipo (ogni 6-10 settimane di deficit continuo) danno un reale beneficio ormonale e psicologico; usati d'impulso diventano solo un modo per rallentare il progresso senza vantaggi strutturati.",
  },
  {
    id: "reverse-diet", name: "Reverse diet: uscire dal deficit", icon: "🔼",
    badge1: "Salita graduale delle calorie", badge2: "50-100 kcal/settimana",
    body: "Uscire da un deficit prolungato tornando di colpo a mantenimento spesso produce un rapido aumento di peso " +
      "percepito (soprattutto ritenzione idrica). Una reverse diet (salita graduale delle calorie, 50-100 kcal a " +
      "settimana) permette al metabolismo e alla percezione psicologica di riadattarsi in modo più controllato.",
    deepDive: "Dopo un deficit prolungato, il corpo ha ridotto parzialmente NEAT e dispendio energetico come " +
      "adattamento: tornare di colpo a un apporto calorico molto più alto porta a un aumento di peso rapido, in gran " +
      "parte glicogeno e acqua (il glicogeno lega circa 3 g di acqua per grammo), che viene spesso interpretato " +
      "erroneamente come grasso riacquistato in pochi giorni, causando ansia e abbandono del piano. Salire " +
      "gradualmente (50-100 kcal a settimana) permette di osservare il trend di peso reale mentre il metabolismo si " +
      "riadatta, e di fermarsi al livello di mantenimento corretto individuale invece di continuare a salire alla " +
      "cieca.",
    pros: [
      "Riduce l'ansia da rapido aumento di peso percepito (in realtà quasi sempre acqua/glicogeno, non grasso) che spesso segue la fine di un deficit.",
      "Permette di individuare con più precisione il vero livello di mantenimento calorico individuale, spesso diverso dalla stima teorica iniziale.",
    ],
    cons: [
      "Richiede diverse settimane di salita graduale e monitoraggio costante, più lento di un semplice ritorno diretto a mantenimento.",
      "Se non comunicata bene psicologicamente, la fase di salita calorica può comunque generare ansia in chi è abituato a vedere il peso scendere.",
    ],
    conclusion: "La reverse diet è lo strumento giusto dopo un deficit prolungato per uscire in modo controllato, evitando sia l'ansia da rapido aumento di peso apparente sia un ritorno troppo brusco che rende difficile individuare il vero mantenimento calorico.",
  },
  {
    id: "peso-vs-composizione", name: "Peso sulla bilancia vs. composizione corporea", icon: "🧍",
    badge1: "Il peso include acqua, glicogeno, cibo", badge2: "Non solo grasso o muscolo",
    body: "Il numero sulla bilancia oscilla per molte ragioni diverse dal grasso corporeo: ritenzione idrica, " +
      "glicogeno, contenuto intestinale, ciclo mestruale, sodio del giorno prima. Interpretare ogni oscillazione " +
      "giornaliera come guadagno o perdita di grasso porta a decisioni sbagliate sul piano.",
    deepDive: "Il glicogeno muscolare ed epatico lega acqua (~3 g per grammo di glicogeno): un solo pasto ricco di " +
      "carboidrati dopo un periodo di restrizione può aggiungere anche 1-2 kg di peso in acqua nel giro di 24-48 ore, " +
      "senza alcun grasso reale guadagnato. Stress, sonno scarso e la fase del ciclo mestruale (nelle donne) alterano " +
      "significativamente la ritenzione idrica giorno per giorno. Per questo il trend su media mobile settimanale " +
      "(non il singolo dato) è l'unico modo affidabile di leggere il peso sulla bilancia; misure di circonferenza " +
      "(vita, fianchi) e foto periodiche a parità di condizioni (luce, orario, angolazione) danno un quadro più " +
      "completo della composizione corporea reale rispetto al solo numero sulla bilancia.",
    pros: [
      "Capire cosa muove davvero la bilancia riduce l'ansia da oscillazioni giornaliere che non riflettono un reale cambiamento di grasso.",
      "Affiancare circonferenze e foto periodiche al peso dà un quadro molto più completo della composizione corporea reale.",
    ],
    cons: [
      "Richiede più dati e più disciplina di tracking (pesata regolare, condizioni costanti per foto/misure) rispetto a guardare solo il peso.",
      "Interpretare male un'oscillazione da acqua come perdita/guadagno di grasso porta a decisioni sbagliate sul piano se non si guarda il trend.",
    ],
    conclusion: "Il peso sulla bilancia va letto solo come trend su media mobile settimanale, mai come singolo dato giornaliero: affiancato a circonferenze e foto periodiche, dà un quadro molto più affidabile di come sta cambiando davvero la composizione corporea.",
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
    pros: [
      "Spiega perché approcci molto diversi (bodybuilding a volume alto, powerlifting a basso volume/alta intensità) possono comunque produrre crescita: pesano diversamente sui tre meccanismi.",
      "Dà un modello pratico per variare lo stimolo nel tempo senza cambiare sport: più carico per la tensione, più prossimità al cedimento/isolamento per lo stress metabolico, più ROM/eccentriche per il danno.",
      "Aiuta a capire perché il solo 'sentire bruciore' non è un indicatore affidabile di qualità della seduta.",
    ],
    cons: [
      "I tre meccanismi non sono misurabili individualmente in palestra: restano un modello utile per ragionare, non un numero da tracciare.",
      "Un'enfasi eccessiva sul danno muscolare (cercare il DOMS ad ogni costo) è controproducente e allunga i tempi di recupero reale.",
    ],
    conclusion: "Nessuno dei tre meccanismi va inseguito isolatamente: un piano che unisce carichi progressivi vicino al cedimento, una quota di lavoro metabolico e un ROM adeguato copre tutte e tre le vie senza bisogno di 'sentire' nulla in particolare per sapere che la seduta ha funzionato.",
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
    chart: {
      title: "Stimolo ipertrofico per fascia di volume settimanale",
      labels: ["<6", "6-10", "10-14", "14-20", "20-25", ">25"],
      values: [3, 6, 8, 9, 7, 5],
      unit: "",
      highlight: 3,
      caption: "Andamento relativo (curva a campana), non un punteggio assoluto: la finestra 14-20 serie è indicativa per un praticante intermedio, individualmente può spostarsi in entrambe le direzioni.",
    },
    pros: [
      "È la leva con il rapporto sforzo/risultato più prevedibile: aumentare le serie settimanali dentro il proprio range recuperabile produce quasi sempre più crescita.",
      "Facile da programmare e da tracciare in modo oggettivo (basta contare le serie dirette per gruppo).",
      "Si presta bene a una progressione graduale nel tempo (mesociclo che parte basso e sale verso il picco prima del deload).",
    ],
    cons: [
      "Più volume richiede più tempo in palestra e più capacità di recupero (sonno, alimentazione, stress di vita) — non è una leva 'gratis'.",
      "Oltre la propria soglia individuale il volume extra non solo non aiuta, ma può peggiorare il recupero e quindi la qualità delle serie successive.",
      "Contare le serie in modo grezzo, senza considerare il lavoro sinergico/indiretto, porta facilmente a sovrastimare il volume reale su alcuni gruppi.",
    ],
    conclusion: "Il volume va programmato come un cursore da muovere nel tempo, non come un numero fisso: partire nella parte bassa del proprio range recuperabile, salire nelle settimane successive, e usare i segnali di recupero (qualità delle serie, sonno, motivazione) per capire quando si è vicini al proprio limite personale più che affidarsi a un numero identico per tutti.",
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
    pros: [
      "Permette di regolare l'intensità di sforzo in modo soggettivo ma coerente, anche senza conoscere il massimale esatto su ogni esercizio.",
      "Riduce il rischio di sovrallenamento rispetto a cercare il cedimento assoluto su ogni serie.",
      "Si adatta automaticamente ai giorni no (stanchezza, sonno scarso): lo stesso RIR target richiede meno peso quando il corpo è meno pronto.",
    ],
    cons: [
      "È una stima soggettiva: i principianti tendono a sovrastimare il RIR reale (pensano di avere più margine di quanto ne abbiano) finché non maturano esperienza propriocettiva.",
      "Il RIR percepito cambia con la fatica accumulata nella sessione: le ultime serie di un allenamento lungo tendono a 'sembrare' più vicine al cedimento anche a parità di reps in riserva reali.",
    ],
    conclusion: "Il RIR/RPE è uno strumento di auto-regolazione, non un numero scientifico esatto: usato con costanza (stessa scala, stesso criterio ogni sessione) diventa affidabile nel tempo e permette di allenarsi vicino al cedimento senza sforare in fatica ingestibile quasi ogni volta.",
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
    pros: [
      "A parità di volume settimanale totale, distribuirlo su più sessioni riduce la fatica accumulata per singola seduta e mantiene più alta la qualità media delle serie.",
      "Permette di allenare un gruppo muscolare più spesso senza necessariamente aumentare il volume totale, utile quando il tempo per sessione è limitato.",
    ],
    cons: [
      "Più sessioni per gruppo significa più giorni in palestra o sessioni più lunghe: un vincolo organizzativo reale, non solo fisiologico.",
      "Aumentare la frequenza senza ridurre il volume per seduta porta solo più fatica accumulata, non un beneficio aggiuntivo.",
    ],
    conclusion: "La frequenza è uno strumento per distribuire il volume, non un obiettivo a sé: 2-3 sedute a settimana per gruppo sono un buon punto di partenza per la maggior parte, ma il volume totale settimanale resta la variabile che guida davvero il risultato.",
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
    pros: [
      "È il principio che spiega ogni altro progresso: senza sovraccarico progressivo nessuna variabile (esercizi, split, integratori) produce crescita a lungo termine.",
      "Avere più leve disponibili (carico, reps, serie, recupero, tecnica) permette di continuare a progredire anche quando una singola leva è esaurita nel breve periodo.",
    ],
    cons: [
      "Cercare di progredire su tutte le leve contemporaneamente ogni settimana è insostenibile e porta a stallo precoce o infortunio.",
      "Non tutte le leve sono ugualmente tracciabili: 'tecnica più pulita' è più difficile da misurare oggettivamente di carico o reps.",
    ],
    conclusion: "Il sovraccarico progressivo va pianificato, non lasciato al caso: scegliere quale leva spingere in ogni blocco di allenamento (es. carico in un mesociclo, volume nel successivo) è più sostenibile che inseguire un aumento su tutti i fronti ogni singola settimana.",
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
    pros: [
      "Calibrare il recupero per esercizio (non un tempo fisso uguale per tutto l'allenamento) massimizza sia la qualità sui compound pesanti sia la densità di lavoro sull'isolamento.",
      "Recuperi più brevi su isolamento permettono sessioni più corte a parità di volume totale svolto.",
    ],
    cons: [
      "Recuperi troppo brevi su esercizi pesanti multiarticolari compromettono il carico utilizzabile nelle serie successive, riducendo lo stimolo di tensione meccanica totale.",
      "Recuperi molto lunghi su tutto l'allenamento allungano eccessivamente la durata della sessione senza benefici aggiuntivi oltre un certo punto.",
    ],
    conclusion: "Non esiste un tempo di recupero 'giusto' universale: la regola pratica è recuperare abbastanza da mantenere la qualità tecnica e il carico target sulla serie successiva, di più sui multiarticolari pesanti, di meno sull'isolamento a basso rischio.",
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
    pros: [
      "Un deload programmato è molto più economico (in termini di tempo perso) di un infortunio da sovraccarico o di un sovrallenamento conclamato, che possono costare settimane.",
      "Dà un punto di reset regolare per rivalutare tecnica, mobilità e sensazioni generali prima di aprire il blocco successivo.",
    ],
    cons: [
      "Un deload troppo frequente (ogni 2-3 settimane) rallenta inutilmente il progresso se la fatica non lo giustifica ancora.",
      "Un deload troppo drastico (stop completo) fa perdere parzialmente gli adattamenti neuromuscolari più freschi rispetto a una semplice riduzione di volume/intensità.",
    ],
    conclusion: "Il deload va programmato in anticipo dentro il piano (ogni 4-8 settimane, non a caso) ma anche letto in tempo reale attraverso i segnali di recupero: meglio scaricare una settimana prima del previsto che aspettare il sovrallenamento conclamato.",
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
    pros: [
      "Permettono di superare il cedimento apparente ed estrarre stimolo aggiuntivo in un tempo di sessione limitato, utile quando il tempo in palestra è la vera risorsa scarsa.",
      "Su un atleta avanzato, dove il sovraccarico progressivo lineare rallenta, offrono una leva di progressione alternativa al semplice aumento di carico.",
    ],
    cons: [
      "Il costo di recupero è alto: usate troppo spesso (ogni serie, ogni sessione) accumulano fatica più velocemente di quanto il corpo riesca a smaltirla.",
      "Su un principiante non aggiungono un vantaggio reale rispetto al sovraccarico progressivo semplice, e bruciano margine di progressione futura inutilmente presto.",
    ],
    conclusion: "Le tecniche di intensità sono un'aggiunta per chi ha già esaurito i margini del sovraccarico progressivo semplice, da dosare (1-2 volte a settimana per gruppo) e non da usare come base dell'intero programma.",
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
    pros: [
      "Il ROM completo, specie nella porzione allungata, sembra produrre più ipertrofia per serie rispetto ai parziali a parità di altre condizioni.",
      "I parziali restano uno strumento utile e sicuro per lavorare intorno a un fastidio articolare o per sovraccaricare un tratto specifico.",
    ],
    cons: [
      "Il ROM completo richiede più mobilità articolare e spesso un carico assoluto inferiore rispetto ai parziali, a parità di sforzo percepito.",
      "Usare solo parziali come scelta abituale (non per necessità) rinuncia allo stimolo extra della porzione allungata del movimento.",
    ],
    conclusion: "Il ROM completo va considerato la scelta di default per la maggior parte degli esercizi e dei praticanti; i parziali restano uno strumento mirato per situazioni specifiche, non un sostituto sistematico.",
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
    pros: [
      "Il cardio moderato migliora la capacità di recupero tra le serie e la salute cardiovascolare generale senza compromettere in modo significativo forza e ipertrofia.",
      "Fatto in giorni o orari separati dai pesi, l'interferenza residua è minima anche a volumi medio-alti.",
    ],
    cons: [
      "Cardio molto frequente e intenso, specialmente subito prima dei pesi, può ridurre la performance nella sessione di forza che segue.",
      "Il cardio aggiunge un costo di recupero che va sottratto dalla capacità di recupero totale disponibile per l'allenamento con i pesi.",
    ],
    conclusion: "Il cardio moderato (2-3 sessioni a settimana) non va evitato per paura di perdere massa: va semplicemente dosato e, quando possibile, distanziato dai pesi per minimizzare qualsiasi interferenza sugli adattamenti di forza e ipertrofia.",
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
    pros: [
      "Riduce concretamente il rischio di infortunio sulle prime serie pesanti e migliora la performance immediata.",
      "Le serie di avvicinamento fungono anche da ultimo controllo tecnico prima del carico di lavoro vero.",
    ],
    cons: [
      "Un riscaldamento eccessivamente lungo consuma tempo ed energie che andrebbero risparmiate per le serie di lavoro.",
      "Stretching statico prolungato subito prima dei pesi può temporaneamente ridurre la produzione di forza, un errore comune tra chi confonde mobilità pre-workout con stretching statico.",
    ],
    conclusion: "Un riscaldamento efficace è breve e mirato: pochi minuti generali seguiti da serie di avvicinamento progressive sull'esercizio specifico, con mobilità dinamica al posto dello stretching statico se serve preparare un range di movimento particolare.",
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
    pros: [
      "Una buona mobilità nelle articolazioni chiave permette di raggiungere il ROM completo con tecnica corretta, ampliando lo stimolo ipertrofico disponibile.",
      "Lavoro mirato (non generico) richiede poco tempo per un beneficio importante sulla longevità articolare.",
    ],
    cons: [
      "Un eccesso di mobility work generico, non mirato alle proprie limitazioni reali, sottrae tempo senza un beneficio proporzionale.",
      "La mobilità va mantenuta nel tempo: i progressi si perdono se il lavoro viene interrotto per periodi lunghi.",
    ],
    conclusion: "La mobilità va trattata come manutenzione mirata delle articolazioni effettivamente limitanti nei propri esercizi principali, non come un programma generico uguale per tutti: pochi minuti mirati, con costanza, bastano per la maggior parte dei praticanti non agonisti.",
  },
  {
    id: "volume-basso", name: "Volume basso: quando ha senso", icon: "📉",
    badge1: "6-10 serie/settimana", badge2: "Recupero limitato o forza-focus",
    body: "Un volume settimanale basso (indicativamente 6-10 serie dirette per gruppo) non è automaticamente " +
      "'insufficiente': ha senso per chi ha capacità di recupero limitata, per periodi ad alta intensità/bassa " +
      "densità (blocchi di forza), o come punto di partenza di un mesociclo che poi sale progressivamente.",
    deepDive: "Il volume basso massimizza la qualità per serie: con meno serie totali è più facile mantenere carichi " +
      "vicini al massimale e recupero quasi completo tra le sessioni, condizione tipica dei blocchi orientati alla " +
      "forza più che all'ipertrofia pura. È anche la scelta giusta per chi ha poco tempo, per i principianti nelle " +
      "prime settimane (dove anche poco stimolo produce adattamento, per la scarsa esperienza di allenamento), o per " +
      "chi sta rientrando da un infortunio o da uno stop prolungato, dove un volume aggressivo rischierebbe di " +
      "sommarsi a una capacità di recupero già ridotta.",
    pros: [
      "Massimizza la qualità e la freschezza per ogni singola serie, con recupero quasi completo tra le sessioni.",
      "Più sostenibile nel tempo per chi ha poca disponibilità oraria o uno stile di vita molto stressante.",
      "Punto di partenza ideale per un mesociclo che sale progressivamente verso volumi più alti.",
    ],
    cons: [
      "Per un praticante intermedio/avanzato con buon recupero, un volume stabilmente basso lascia sul tavolo margine di crescita disponibile.",
      "Rende più difficile distribuire lo stimolo su più angolazioni/varianti di esercizio per lo stesso gruppo muscolare.",
    ],
    conclusion: "Il volume basso non è un compromesso al ribasso: è la scelta corretta in specifiche fasi (forza, recupero da infortunio, rientro, principianti) o come base di partenza di un mesociclo — il problema nasce solo se resta basso per mesi consecutivi in un praticante che avrebbe margine di recupero per salire.",
  },
  {
    id: "volume-alto", name: "Volume alto: quando ha senso", icon: "📈",
    badge1: "20-25+ serie/settimana", badge2: "Solo su base di recupero solida",
    body: "Un volume alto (20-25 o più serie dirette a settimana per gruppo) può produrre crescita superiore per chi " +
      "ha già una buona capacità di recupero consolidata, ma è una leva ad alto rischio: senza sonno, alimentazione e " +
      "gestione dello stress adeguati produce più fatica che crescita.",
    deepDive: "Il volume alto ha senso tipicamente nella fase 'di picco' di un mesociclio in accumulo, nelle settimane " +
      "immediatamente precedenti a un deload programmato, o per praticanti avanzati che hanno già esaurito i margini " +
      "di crescita ai volumi moderati. Va introdotto gradualmente (non da zero a 25 serie in una settimana) e monitorato " +
      "attentamente: un calo delle prestazioni nelle serie finali della settimana, un peggioramento del sonno o un RIR " +
      "percepito che sale a parità di carico sono segnali che il volume ha superato la capacità di recupero reale, " +
      "non solo quella teorica sulla carta.",
    pros: [
      "Nella fase giusta del mesociclo, può estrarre l'ultima quota di stimolo disponibile prima del deload.",
      "Utile per praticanti avanzati che hanno già esaurito i margini di crescita ai volumi moderati.",
    ],
    cons: [
      "Ad alto rischio di superare la capacità di recupero reale se non introdotto gradualmente, con effetto netto negativo sulla crescita.",
      "Richiede una base di sonno, alimentazione e gestione dello stress già solida: senza quella, il volume alto è quasi sempre controproducente.",
      "Aumenta significativamente il tempo richiesto in palestra per sessione.",
    ],
    conclusion: "Il volume alto è uno strumento da fase avanzata di mesociclo, non un punto di partenza: va raggiunto gradualmente, mantenuto per poche settimane, e seguito da un deload — usato come stato permanente porta quasi sempre a stallo o sovrallenamento.",
  },
  {
    id: "piu-serie-meno-esercizi", name: "Più serie, meno esercizi", icon: "🔁",
    badge1: "2-3 esercizi per gruppo", badge2: "Più serie a testa",
    body: "Concentrare il volume settimanale su pochi esercizi (2-3 per gruppo) eseguiti con più serie ciascuno " +
      "permette di padroneggiare meglio la tecnica e di applicare un sovraccarico progressivo più lineare e " +
      "misurabile nel tempo.",
    deepDive: "Con meno esercizi da gestire, la curva di apprendimento tecnico è più rapida: la stessa esecuzione " +
      "ripetuta molte volte a settimana permette di affinare il pattern motorio e di caricare con più sicurezza. È " +
      "anche più semplice tracciare la progressione (stesso esercizio, stesso schema di serie/reps settimana dopo " +
      "settimana) e capire con chiarezza se si sta davvero progredendo o si è in stallo, cosa più difficile quando " +
      "gli esercizi cambiano di continuo.",
    pros: [
      "Progressione più facile da tracciare e da interpretare: stesso esercizio, stesso schema, confronto diretto settimana su settimana.",
      "Permette di padroneggiare la tecnica più rapidamente, riducendo il rischio infortunio nel tempo.",
      "Sessioni spesso più rapide da organizzare, con meno cambi di attrezzatura.",
    ],
    cons: [
      "Espone di più a stalli specifici di quell'esercizio (plateau tecnico o articolare) senza alternative pronte.",
      "Copre meno angolazioni del muscolo, potenzialmente lasciando alcune porzioni meno stimolate nel tempo.",
    ],
    conclusion: "Questo approccio è ideale in fasi di apprendimento tecnico o di forza, dove la coerenza dell'esecuzione conta più della varietà — va bilanciato periodicamente con qualche variante per coprire angolazioni diverse ed evitare stalli specifici di un solo movimento.",
  },
  {
    id: "meno-serie-piu-esercizi", name: "Meno serie, più esercizi", icon: "🔀",
    badge1: "4-6 esercizi per gruppo", badge2: "Meno serie a testa",
    body: "Distribuire lo stesso volume settimanale su più esercizi diversi (4-6 per gruppo, con meno serie ciascuno) " +
      "copre più angolazioni del muscolo e riduce il logoramento articolare/tecnico di un singolo movimento ripetuto " +
      "molte volte.",
    deepDive: "Muscoli con più capi o inserzioni (es. il deltoide, il pettorale, i dorsali) rispondono ad angolazioni " +
      "diverse in modo parzialmente differenziato: variare gli esercizi permette di stimolare porzioni che un singolo " +
      "movimento privilegia meno. Il rovescio della medaglia è che con meno serie per esercizio è più difficile " +
      "isolare un vero e proprio trend di progressione (il carico può variare per motivi tecnici da un esercizio " +
      "all'altro, rendendo il confronto meno diretto), e il tempo dedicato all'apprendimento tecnico si divide su più " +
      "movimenti contemporaneamente.",
    pros: [
      "Copre più angolazioni dello stesso gruppo muscolare, utile per uno sviluppo più completo nel lungo periodo.",
      "Riduce il logoramento tecnico/articolare di un singolo movimento ripetuto con carichi alti molte volte a settimana.",
      "Mantiene la sessione più varia e stimolante dal punto di vista motivazionale.",
    ],
    cons: [
      "Più difficile tracciare una progressione lineare chiara su ogni singolo esercizio con così poche serie a testa.",
      "Richiede più tempo per padroneggiare tecnicamente ogni movimento, rallentando l'apprendimento su ciascuno.",
    ],
    conclusion: "Utile soprattutto in fasi di ipertrofia pura orientate a uno sviluppo completo del muscolo, o quando serve variare per gestire un fastidio articolare — l'equilibrio ideale per la maggior parte dei praticanti sta nel mezzo tra i due estremi, non in uno dei due puri.",
  },
  {
    id: "rep-effettive", name: "Ripetizioni effettive (serie vicino al cedimento)", icon: "🧮",
    badge1: "Solo le ultime reps contano davvero", badge2: "Le prime reps di una serie da 12 sono 'gratis'",
    body: "In una serie fino a RIR 1-2, solo le ultime ripetizioni (quelle svolte a fatica alta, vicino al reclutamento " +
      "massimo delle unità motorie) generano la maggior parte dello stimolo ipertrofico — le prime ripetizioni di una " +
      "serie lunga sono relativamente 'a basso costo/basso stimolo'.",
    deepDive: "Il reclutamento delle unità motorie a soglia più alta (quelle col maggior potenziale di crescita) avviene " +
      "progressivamente durante una serie, man mano che le fibre già attive si affaticano: nelle prime ripetizioni di " +
      "una serie da 12 lavorano soprattutto le unità motorie a soglia più bassa, quelle a soglia alta entrano in gioco " +
      "solo verso la fine, quando la fatica costringe il sistema nervoso a reclutarle. Questo è il motivo per cui il " +
      "concetto di 'ripetizioni effettive' (le reps svolte in prossimità del cedimento) è più predittivo della crescita " +
      "rispetto al semplice conteggio totale di ripetizioni svolte in una sessione: due serie da 12 fermate a metà " +
      "producono meno ripetizioni effettive di una singola serie da 12 portata a RIR 1.",
    pros: [
      "Spiega perché fermarsi troppo lontano dal cedimento (RIR 4-5 sistematico) riduce lo stimolo anche a parità di reps totali svolte.",
      "Aiuta a capire perché poche serie ben eseguite vicino al cedimento possono superare molte serie fatte con ampio margine.",
    ],
    cons: [
      "Concettualmente utile, ma non è misurabile con precisione in tempo reale — resta una stima basata sulla sensazione di fatica.",
      "Spinge, se mal interpretato, a cercare il cedimento assoluto su ogni serie, con un costo di recupero che spesso supera il beneficio.",
    ],
    conclusion: "Contare le 'reps effettive' più che le reps totali aiuta a valutare la qualità reale di una serie: l'obiettivo pratico è arrivare vicino al cedimento (RIR 1-3) sulla maggior parte delle serie di lavoro, non accumulare ripetizioni lontane dalla fatica reale.",
  },
  {
    id: "basso-rep-range", name: "Range di ripetizioni basso (1-6)", icon: "🏋️",
    badge1: "Forza + tensione meccanica alta", badge2: "Carichi 80-95% del massimale",
    body: "Le ripetizioni basse (1-6) con carichi pesanti (80-95% del massimale) massimizzano la tensione meccanica " +
      "per ripetizione e sono lo stimolo principale per lo sviluppo della forza massimale, con un contributo " +
      "ipertrofico comunque presente se il volume totale è sufficiente.",
    deepDive: "A carichi molto alti il numero di ripetizioni disponibili prima del cedimento è basso, quindi per " +
      "accumulare un volume totale di lavoro paragonabile a range più alti servono più serie. Il vantaggio specifico " +
      "del range basso è l'adattamento neurale (reclutamento ed efficienza del sistema nervoso nel produrre forza), " +
      "determinante per le prestazioni di forza pura, oltre alla tensione meccanica elevata per singola ripetizione. " +
      "Lo svantaggio pratico è il maggior stress articolare/sul sistema nervoso centrale e il tempo di recupero più " +
      "lungo necessario tra le sessioni sullo stesso schema.",
    pros: [
      "Massimizza gli adattamenti neurali e la forza massimale espressa, oltre alla tensione meccanica per ripetizione.",
      "Le sessioni sono spesso più brevi a parità di serie (meno tempo sotto tensione per ripetizione).",
    ],
    cons: [
      "Stress articolare e sul sistema nervoso centrale più alto, con tempi di recupero tra sessioni generalmente più lunghi.",
      "Da solo (senza altri range) lascia meno stimolo di stress metabolico, una delle tre vie dell'ipertrofia.",
    ],
    conclusion: "Il range basso è indispensabile per chi persegue la forza massimale ed è una componente utile anche in un programma di ipertrofia, ma raramente conviene come unico range di lavoro: la combinazione con range medi/alti copre meglio tutte le vie dello stimolo.",
  },
  {
    id: "alto-rep-range", name: "Range di ripetizioni alto (15-30+)", icon: "🔄",
    badge1: "Stress metabolico alto", badge2: "Carichi 40-60% del massimale",
    body: "Le ripetizioni alte (15-30 o più) con carichi più leggeri (40-60% del massimale) generano molto stress " +
      "metabolico e, se portate vicino al cedimento, producono un'ipertrofia comparabile ai range più bassi a parità " +
      "di prossimità allo sforzo massimo — con un impatto articolare/sistemico generalmente inferiore.",
    deepDive: "La letteratura più recente mostra che l'ipertrofia è simile tra range di ripetizioni molto diversi " +
      "quando le serie sono portate a una simile prossimità del cedimento e il volume è equalizzato — la variabile " +
      "chiave non è il numero di ripetizioni in sé, ma quanto vicino al cedimento si arriva. Il range alto ha però un " +
      "costo specifico: richiede una tolleranza al disagio metabolico (bruciore, fiato corto) più alta, e su alcuni " +
      "esercizi (es. squat pesante) risulta poco pratico portare 25-30 ripetizioni vicino al cedimento in sicurezza. " +
      "È particolarmente utile su esercizi di isolamento a basso rischio articolare, o per chi ha limitazioni che " +
      "sconsigliano carichi molto pesanti.",
    pros: [
      "Impatto articolare inferiore rispetto ai carichi molto pesanti, utile per chi ha limitazioni o fastidi articolari.",
      "Ipertrofia comparabile ai range bassi quando le serie sono portate vicino al cedimento con volume equalizzato.",
      "Buon complemento per esercizi di isolamento dove il rischio tecnico ad alte reps resta basso.",
    ],
    cons: [
      "Richiede una tolleranza al disagio metabolico alta: molte serie vengono interrotte prima del vero cedimento per il disagio percepito, non per esaurimento muscolare reale.",
      "Poco pratico o sicuro su alcuni multiarticolari pesanti portati vicino al cedimento a reps molto alte.",
    ],
    conclusion: "Il range alto è uno strumento valido e sottoutilizzato, specie su isolamento o per chi ha limitazioni articolari — la condizione necessaria per farlo funzionare è portare davvero le serie vicino al cedimento, non fermarsi presto per il disagio percepito.",
  },
  {
    id: "ipertrofia-mio-sarco", name: "Ipertrofia miofibrillare vs. sarcoplasmatica", icon: "🔬",
    badge1: "Miofibrillare: più forza", badge2: "Sarcoplasmatica: più volume percepito",
    body: "L'ipertrofia miofibrillare (crescita delle proteine contrattili, actina e miosina) aumenta soprattutto la " +
      "forza; l'ipertrofia sarcoplasmatica (aumento del fluido e delle riserve energetiche nel sarcoplasma) contribuisce " +
      "più al volume visivo del muscolo. In pratica i due processi coesistono sempre, non sono allenabili in modo " +
      "completamente separato.",
    deepDive: "La distinzione, storicamente usata per spiegare le differenze tra powerlifter (più forza per centimetro " +
      "di muscolo) e bodybuilder (più volume muscolare visibile a parità di forza relativa), è utile concettualmente " +
      "ma va presa con cautela: la ricerca diretta sull'ipertrofia sarcoplasmatica isolata nell'uomo è limitata, e i " +
      "due tipi di adattamento non sono facilmente separabili con i protocolli di allenamento tipici. In termini " +
      "pratici, range di ripetizioni più bassi e carichi più pesanti tendono a privilegiare relativamente di più gli " +
      "adattamenti neurali e miofibrillari, mentre volumi più alti a range medio-alto con maggiore stress metabolico " +
      "sembrano associarsi relativamente di più agli adattamenti sarcoplasmatici/metabolici — ma è una differenza di " +
      "enfasi, non un interruttore on/off.",
    pros: [
      "Aiuta a spiegare perché atleti con la stessa massa muscolare visibile possono avere livelli di forza molto diversi.",
      "Dà un razionale per variare range di ripetizioni e volume nel tempo invece di allenarsi sempre nello stesso modo.",
    ],
    cons: [
      "La distinzione è più teorica che praticamente allenabile in modo isolato: ogni programma di allenamento produce entrambi i tipi di adattamento in proporzioni diverse, mai uno puro.",
      "Rischia di essere usata per giustificare protocolli estremi ('solo alte reps per il volume') senza basi solide altrettanto forti quanto il concetto sottostante.",
    ],
    conclusion: "Utile come modello per capire perché atleti di forza e atleti estetici si allenano diversamente, ma da non prendere alla lettera come due 'interruttori' separati da allenare in isolamento — un programma bilanciato tra range di ripetizioni copre naturalmente entrambe le vie.",
  },
  {
    id: "mono-frequenza", name: "Mono-frequenza (1×/settimana per gruppo)", icon: "1️⃣",
    badge1: "1 sessione/settimana per gruppo", badge2: "Volume alto concentrato",
    body: "Allenare ogni gruppo muscolare una sola volta a settimana, con tutto il volume settimanale concentrato in " +
      "un'unica sessione lunga (tipico degli split 'bro split'), può funzionare ma è generalmente meno efficiente della " +
      "multi-frequenza a parità di volume totale.",
    deepDive: "Con la mono-frequenza, il volume molto alto in un'unica sessione porta spesso a un calo di qualità " +
      "nelle ultime serie (fatica accumulata) e lascia il muscolo senza un nuovo stimolo per la maggior parte della " +
      "settimana, dato che la sintesi proteica elevata post-allenamento dura circa 24-48 ore. È comunque un approccio " +
      "valido per chi ha vincoli organizzativi (poche sessioni disponibili a settimana), per chi preferisce sessioni " +
      "focalizzate su 1-2 gruppi con grande varietà di esercizi ed angolazioni, o come fase di specializzazione mirata " +
      "su un singolo gruppo in ritardo.",
    pros: [
      "Permette sessioni molto focalizzate con grande varietà di esercizi/angolazioni sullo stesso gruppo in un'unica seduta.",
      "Si adatta bene a chi ha disponibilità di sole 3-5 sessioni a settimana e vuole coprire tutto il corpo.",
      "Utile come fase di specializzazione temporanea su un gruppo muscolare specifico in ritardo.",
    ],
    cons: [
      "Il volume molto alto concentrato in un'unica sessione porta spesso a un calo di qualità nelle ultime serie per fatica accumulata.",
      "Il muscolo resta senza un nuovo stimolo di sintesi proteica per la maggior parte della settimana rispetto alla multi-frequenza.",
    ],
    conclusion: "La mono-frequenza non è sbagliata, ma a parità di volume settimanale totale la multi-frequenza tende a produrre risultati leggermente superiori per la maggior parte dei praticanti — resta comunque una scelta legittima per vincoli organizzativi o fasi di specializzazione mirata.",
  },
  {
    id: "multi-frequenza", name: "Multi-frequenza (2-4×/settimana per gruppo)", icon: "🔢",
    badge1: "2-4 sessioni/settimana per gruppo", badge2: "Volume distribuito",
    body: "Distribuire il volume settimanale di un gruppo muscolare su 2-4 sessioni più brevi mantiene la sintesi " +
      "proteica muscolare stimolata più a lungo nell'arco della settimana ed è generalmente l'approccio con il miglior " +
      "rapporto tra risultato e recupero per la maggior parte dei praticanti intermedi/avanzati.",
    deepDive: "Con la multi-frequenza ogni sessione lavora un gruppo muscolare quando è ancora relativamente fresco, " +
      "permettendo di mantenere carichi e qualità tecnica più alti su ogni serie rispetto a concentrare tutto in " +
      "un'unica sessione molto lunga e faticosa. Il punto critico è dividere correttamente il volume totale: se la " +
      "frequenza aumenta senza una corrispondente riduzione del volume per sessione, il risultato è solo più fatica " +
      "settimanale complessiva, non più stimolo utile — motivo per cui la multi-frequenza va programmata pensando al " +
      "volume settimanale totale diviso sulle sessioni, non aggiunta come extra sopra un volume già pieno.",
    pros: [
      "Mantiene la sintesi proteica stimolata più costantemente nell'arco della settimana rispetto alla mono-frequenza.",
      "Permette di lavorare ogni gruppo muscolare quando è relativamente fresco, con carichi e qualità tecnica più alti.",
      "Si adatta bene a schemi full-body o upper/lower, spesso più sostenibili nel tempo.",
    ],
    cons: [
      "Richiede più sessioni a settimana o sessioni che coprono più gruppi contemporaneamente, un vincolo organizzativo per chi ha poco tempo.",
      "Se il volume per sessione non viene ridotto in proporzione all'aumento di frequenza, il risultato netto è solo più fatica senza beneficio aggiuntivo.",
    ],
    conclusion: "Per la maggior parte dei praticanti intermedi/avanzati, distribuire il volume settimanale su 2-3 sessioni per gruppo è la scelta con il miglior rapporto tra risultato e recupero — a patto di dividere correttamente il volume totale sulle sessioni, non di sommarne uno nuovo ad ogni seduta aggiuntiva.",
  },
  {
    id: "mev", name: "MEV — Minimo Volume Effettivo", icon: "🌱",
    badge1: "La soglia minima che produce crescita", badge2: "Sotto il MEV: mantenimento, non crescita",
    body: "Il MEV (Minimum Effective Volume) è la quantità minima di serie settimanali per gruppo muscolare sotto la " +
      "quale non si ottiene più una crescita significativa — è più bassa del volume di mantenimento e cambia da " +
      "persona a persona e da periodo a periodo.",
    deepDive: "Il MEV non è un numero fisso identico per tutti: dipende dall'esperienza di allenamento (un principiante " +
      "ha un MEV più basso di un avanzato, perché ogni stimolo produce relativamente più adattamento), dalla genetica " +
      "individuale di risposta al volume, e dallo stato di recupero del momento (stress di vita, sonno, alimentazione). " +
      "In pratica il MEV è utile soprattutto come concetto guida per periodi a bassa disponibilità (rientro da " +
      "infortunio, periodi di vita molto stressanti, deload) — sapere qual è la propria soglia minima personale evita " +
      "di scendere sotto il punto in cui il volume smette di produrre adattamento, sprecando comunque tempo e fatica " +
      "senza il ritorno atteso.",
    chart: {
      title: "MEV / MAV / MRV — zone di volume settimanale",
      labels: ["MEV", "MAV (basso)", "MAV (alto)", "MRV"],
      values: [8, 14, 20, 26],
      unit: " serie",
      highlight: 0,
      caption: "Valori indicativi per un praticante intermedio; le soglie individuali si spostano con esperienza, genetica e capacità di recupero del momento.",
    },
    pros: [
      "Utile come soglia di sicurezza nei periodi di scarsa disponibilità: sapere il proprio MEV evita di scendere sotto la quantità minima che ancora produce crescita.",
      "Aiuta a distinguere un periodo di mantenimento intenzionale da uno stallo per volume insufficiente.",
    ],
    cons: [
      "Non è misurabile con un numero preciso e universale: resta una stima che richiede tempo e osservazione dei propri progressi per essere calibrata individualmente.",
      "Cambia nel tempo (con esperienza e stato di recupero), quindi non è una soglia fissa da impostare una volta per sempre.",
    ],
    conclusion: "Il MEV è la soglia da conoscere per i periodi difficili, non l'obiettivo a cui puntare stabilmente: la maggior parte della programmazione dovrebbe muoversi tra MEV e MRV, usando il MEV come rete di sicurezza quando la vita lascia poco spazio al recupero.",
  },
  {
    id: "mav", name: "MAV — Massimo Volume Adattivo", icon: "🌿",
    badge1: "La zona dove si cresce di più", badge2: "Il grosso della programmazione va qui",
    body: "Il MAV (Maximum Adaptive Volume) è la fascia di volume che produce il miglior rapporto tra stimolo e " +
      "recupero — non il volume più alto tollerabile, ma quello che massimizza la crescita reale nel tempo. La maggior " +
      "parte della programmazione dovrebbe stare in questa fascia, non ai suoi estremi.",
    deepDive: "A differenza del MRV (il tetto massimo tollerabile) e del MEV (la soglia minima efficace), il MAV " +
      "descrive un intervallo, non un punto singolo: tipicamente la parte centrale-alta del range recuperabile " +
      "individuale, dove ogni serie aggiuntiva produce ancora un ritorno chiaramente positivo senza però erodere il " +
      "recupero della settimana successiva. Praticamente, un mesociclo ben strutturato parte vicino al MEV nelle prime " +
      "settimane, sale progressivamente attraverso il MAV nelle settimane centrali, e tocca (o supera leggermente) il " +
      "MRV solo nell'ultima settimana prima del deload — passare la maggior parte del tempo nel MAV, non ai due estremi, " +
      "è ciò che distingue una programmazione efficace da una che oscilla tra troppo poco e troppo stimolo.",
    chart: {
      title: "MEV / MAV / MRV — zone di volume settimanale",
      labels: ["MEV", "MAV (basso)", "MAV (alto)", "MRV"],
      values: [8, 14, 20, 26],
      unit: " serie",
      highlight: 2,
      caption: "Il MAV è la fascia centrale (non un punto singolo) dove la maggior parte del mesociclo dovrebbe essere programmata.",
    },
    pros: [
      "È la fascia con il miglior rapporto tra stimolo e recupero: il posto dove dovrebbe stare la maggior parte della programmazione.",
      "Dà un criterio pratico per strutturare un mesociclo (partire basso, salire attraverso il MAV, toccare il MRV solo alla fine).",
    ],
    cons: [
      "Come MEV e MRV, non è un numero preciso misurabile in laboratorio dal singolo utente: richiede osservazione dei progressi nel tempo per essere stimato bene.",
      "Si sposta con lo stato di recupero, quindi la stessa quantità di serie può essere 'nel MAV' in una settimana e 'sopra il MRV' in un'altra più stressante.",
    ],
    conclusion: "Il MAV è dove dovrebbe vivere la maggior parte della programmazione settimanale: non il minimo per crescere né il massimo tollerabile, ma la zona dove ogni serie aggiuntiva rende ancora chiaramente di più di quanto costa in recupero.",
  },
  {
    id: "mrv", name: "MRV — Massimo Volume Recuperabile", icon: "🚧",
    badge1: "Il tetto massimo tollerabile", badge2: "Oltre il MRV: solo fatica, non più crescita",
    body: "L'MRV (Maximum Recoverable Volume) è la quantità massima di volume settimanale che il corpo riesce ancora " +
      "a recuperare completamente prima della sessione successiva — oltre questa soglia il volume extra produce solo " +
      "fatica accumulata, non ulteriore crescita.",
    deepDive: "L'MRV non è un limite fisico assoluto ma la soglia oltre la quale il rapporto costo/beneficio del " +
      "volume diventa negativo: il recupero (sonno, alimentazione, gestione dello stress, età allenante) determina " +
      "quanto è alto per ciascuno. Segnali pratici che si è vicini o oltre il proprio MRV includono un calo delle " +
      "prestazioni nelle ultime sessioni della settimana nonostante lo sforzo percepito resti alto, un peggioramento " +
      "della qualità del sonno, un RIR percepito che sale a parità di carico abituale, o una motivazione che cala senza " +
      "una causa esterna evidente. Toccare (o superare leggermente) l'MRV ha un ruolo solo nell'ultima settimana prima " +
      "di un deload programmato — usarlo come volume di crociera stabile porta quasi sempre a sovrallenamento nel " +
      "medio periodo.",
    chart: {
      title: "MEV / MAV / MRV — zone di volume settimanale",
      labels: ["MEV", "MAV (basso)", "MAV (alto)", "MRV"],
      values: [8, 14, 20, 26],
      unit: " serie",
      highlight: 3,
      caption: "L'MRV è il tetto, non l'obiettivo: va toccato solo nell'ultima settimana di un mesociclo, seguito da un deload.",
    },
    pros: [
      "Conoscere approssimativamente il proprio MRV aiuta a riconoscere in anticipo i segnali di sovraccarico prima che diventino sovrallenamento conclamato.",
      "Utile come picco pianificato nell'ultima settimana di un mesociclo, subito prima di un deload.",
    ],
    cons: [
      "Oltre il MRV il volume extra è puro spreco di tempo e recupero: un errore comune è confondere 'riesco a farlo' con 'sto recuperando bene', quando in realtà si sta già oltre la soglia.",
      "L'MRV si abbassa rapidamente in periodi di vita più stressanti (sonno scarso, lavoro intenso), e continuare a programmare come se fosse costante porta a stallo.",
    ],
    conclusion: "L'MRV è il tetto da rispettare, non il volume da inseguire ogni settimana: va toccato solo nella fase finale di un mesociclo, con un deload programmato subito dopo — usato come regime stabile è la causa più comune di stallo e sovrallenamento nei praticanti che 'vogliono fare sempre di più'.",
  },
];

/* Componente generico riusato da Wiki Alimentazione e Wiki Allenamento — la
   Wiki Integratori sopra resta com'era (SUPP_WIKI/SupplementWikiBrowser/
   SupplementDetailModal), non l'ho toccata: stesso pattern visivo, dati e
   didascalie diverse passate come prop invece di duplicare il componente. */
/* Grafico a barre minimale per la Wiki (nessuna libreria, SVG puro): rende
   visivi i concetti dose-risposta (volume, MEV/MAV/MRV, range di
   ripetizioni...) invece di lasciarli solo a parole. Valori "relativi"
   quando la letteratura descrive una FORMA di curva (sale-plateau-scende)
   più che un numero assoluto uguale per chiunque — mai spacciare per
   precisione individuale quello che è un andamento di popolazione. */
function WikiBarChart({ labels, values, unit, accent, highlight, caption }) {
  const W = 280, H = 128, pad = 8, baseY = H - 30;
  const max = Math.max(...values) * 1.2;
  const n = values.length;
  const slot = (W - pad * 2) / n;
  const barW = Math.min(46, slot - 14);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Grafico">
        <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} stroke="var(--line)" />
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * (baseY - 18));
          const x = pad + i * slot + (slot - barW) / 2;
          const y = baseY - h;
          const isHi = highlight === i;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx={5}
                fill={isHi ? accent : "var(--surface-2)"} stroke={isHi ? accent : "var(--line)"} strokeWidth="1" />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">{v}{unit || ""}</text>
              <text x={x + barW / 2} y={H - 12} textAnchor="middle" fontSize="8" fill="var(--ink-2)">{labels[i]}</text>
            </g>
          );
        })}
      </svg>
      {caption && <p className="meta mt-1" style={{ fontSize: "0.66rem", lineHeight: 1.4, fontStyle: "italic" }}>{caption}</p>}
    </div>
  );
}

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
            <div className="inner p-4 mb-3">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>Approfondimento scientifico</p>
              <p className="body" style={{ fontSize: "0.86rem", lineHeight: 1.6 }}>{entry.deepDive}</p>
            </div>
          )}
          {entry.chart && (
            <div className="inner p-4 mb-3">
              <p className="label mb-2" style={{ letterSpacing: "0.08em" }}>{entry.chart.title || "In grafico"}</p>
              <WikiBarChart {...entry.chart} accent={accent} />
            </div>
          )}
          {(entry.pros?.length || entry.cons?.length) && (
            <div className="space-y-2 mb-3">
              {entry.pros?.length > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                  <p className="label mb-1.5" style={{ color: "#10B981", fontSize: "0.6rem" }}>Pro</p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {entry.pros.map((p, i) => <li key={i} className="meta" style={{ fontSize: "0.74rem", lineHeight: 1.5, marginBottom: 3 }}>{p}</li>)}
                  </ul>
                </div>
              )}
              {entry.cons?.length > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(240,160,32,0.08)", border: "1px solid rgba(240,160,32,0.28)" }}>
                  <p className="label mb-1.5" style={{ color: "#B45309", fontSize: "0.6rem" }}>Contro</p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {entry.cons.map((c, i) => <li key={i} className="meta" style={{ fontSize: "0.74rem", lineHeight: 1.5, marginBottom: 3 }}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          {entry.conclusion && (
            <div className="rounded-xl p-3.5" style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}35` }}>
              <p className="label mb-1" style={{ color: accent, fontSize: "0.6rem" }}>Conclusione</p>
              <p className="body" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>{entry.conclusion}</p>
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
  const [checked, setChecked] = useState({}); // solo demo: la Pro reale usa takenIds (dato reale, sotto)
  const isRealMode = Boolean(supabase && userId);

  // BUG PRESO: spuntare un integratore come "preso oggi" era SOLO stato
  // React locale (checked, sopra) — spariva sempre riaprendo l'app, nessuna
  // scrittura su Supabase. Ora, in modalità reale, "preso" è un dato vero
  // (supplement_intake, SCHEMA_v54): caricato una volta all'apertura,
  // aggiornato in ottimistico al tap con rollback se la scrittura fallisce.
  const [takenIds, setTakenIds] = useState(null); // null = non ancora caricato (solo isRealMode)
  // BUG PRESO: la fetch girava una sola volta al mount — con AppShell che
  // tiene ogni tab montato per sempre (display:none, mai un vero unmount),
  // un utente che apre l'app un giorno, la lascia in background e la
  // riapre il giorno dopo SENZA un reload completo continuava a vedere
  // takenIds di IERI (lo stato React non si aggiornava mai da solo). La
  // scrittura era già corretta (setSupplementTaken usa sempre la data di
  // oggi), il problema era solo in lettura: todayIso rientra nelle
  // dipendenze e forza un refetch reale appena cambia il giorno di
  // calendario (vedi useTodayIso per il motivo del listener su
  // visibilitychange, non solo un setInterval).
  const todayIso = useTodayIso();
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    fetchSupplementIntakeToday(supabase, userId)
      .then((ids) => { if (!cancelled) setTakenIds(ids); })
      .catch((err) => {
        console.error("PERFORM: errore lettura supplement_intake", err);
        if (!cancelled) setTakenIds(new Set());
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId, todayIso]);

  // Protocollo reale (prescribed_supplements), raggruppato per `moment` come
  // l'ha scritto il coach — testo libero, non i 4 SUPP_MOMENTS fissi della
  // demo (il coach può rinominare le sezioni in WeekSuppsEditor). Se
  // supabase/userId non arrivano (preview isolata), resta la lista demo
  // SUPP_PLAN_PRO di sempre; se arrivano ma il coach non ha ancora
  // prescritto nulla, mostra uno stato vuoto esplicito — mai la demo al
  // posto di un dato reale mancante.
  // null = non ancora caricato (solo isRealMode). Inizializzato dall'ultimo
  // protocollo noto (localCache.js): così se l'app riparte con rete assente
  // (non solo se cade a metà sessione) il cliente vede comunque l'ultimo
  // protocollo visto, non uno stato vuoto indistinguibile da "il coach non
  // ha ancora prescritto nulla".
  const [prescribed, setPrescribed] = useState(() => (userId ? readCache(`prescribed_${userId}`) : null));
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    fetchPrescribedSupplements(supabase, userId)
      .then((rows) => { if (!cancelled) { setPrescribed(rows); writeCache(`prescribed_${userId}`, rows); } })
      .catch((err) => {
        // BUG PRESO: azzerava a [] su QUALSIASI fallimento, anche solo rete
        // assente — un protocollo reale già assegnato spariva e sembrava
        // "nessuna prescrizione", invece di "non sono riuscito a
        // ricaricare, ecco l'ultimo che avevo". Mai perdere un dato reale
        // già mostrato per un semplice errore di rete.
        console.error("PERFORM: errore lettura prescribed_supplements, mostro l'ultimo protocollo noto", err);
        if (!cancelled) setPrescribed((prev) => prev ?? []);
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
      const ia = canonicalOrder.indexOf(matchSuppMoment(a)?.id ?? a);
      const ib = canonicalOrder.indexOf(matchSuppMoment(b)?.id ?? b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return sortedMoments.map((moment) => ({
      id: moment,
      label: matchSuppMoment(moment)?.label || moment,
      items: byMoment.get(moment),
    }));
  }, [prescribed, isTrainingDay]);

  const groups = isRealMode
    ? realGroups
    : SUPP_MOMENTS.map((m) => ({ id: m.id, label: m.label, icon: m.icon, items: SUPP_PLAN_PRO[m.id].map((it, i) => ({ id: `${m.id}-${i}`, ...it })) }));

  // BUG PRESO (segnalato): la spunta "preso" a volte sembrava non
  // registrarsi davvero. Il salvataggio era già corretto (ottimistico +
  // rollback), ma un rollback silenzioso (nessun messaggio) è indistinguibile
  // da "ho toccato e non è successo niente" se l'utente nel frattempo ha già
  // cambiato schermata: ora un fallimento resta visibile finché non viene
  // ritentato con successo, invece di sparire senza traccia.
  const [intakeError, setIntakeError] = useState("");
  const toggle = (momentId, itemId) => {
    haptic("tap");
    if (isRealMode) {
      const wasTaken = takenIds?.has(itemId);
      const taken = !wasTaken;
      setIntakeError("");
      setTakenIds((s) => { const n = new Set(s); wasTaken ? n.delete(itemId) : n.add(itemId); return n; });
      setSupplementTaken(supabase, userId, itemId, taken).catch((err) => {
        // Rete assente: setSupplementTaken è idempotente (insert/delete
        // tollerano il duplicato/il già-assente), quindi va in coda e si
        // ritenta da solo invece di un rollback silenzioso — la spunta
        // resta come l'ha lasciata l'utente. Un vero errore del server (non
        // di rete) è raro qui proprio perché la scrittura è idempotente;
        // teniamo comunque il messaggio visibile finché non si sincronizza.
        console.error("PERFORM: errore salvataggio supplement_intake, la metto in coda per riprovare quando torna la rete", err);
        enqueueWrite("supplement-taken", { userId, itemId, taken });
      });
    } else {
      const key = `${momentId}-${itemId}`;
      setChecked((c) => ({ ...c, [key]: !c[key] }));
    }
    onCoachSync && onCoachSync({ type: "supplement", momentId, id: itemId });
  };
  const isDone = (g, it) => (isRealMode ? !!takenIds?.has(it.id) : !!checked[`${g.id}-${it.id}`]);
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const doneItems = groups.reduce((n, g) => n + g.items.filter((it) => isDone(g, it)).length, 0);
  const allDone = totalItems > 0 && doneItems === totalItems;
  const wasAllDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) onXpEarned && onXpEarned("Integrazione completata", 50);
    wasAllDoneRef.current = allDone;
  }, [allDone, onXpEarned]);

  if (isRealMode && (prescribed === null || takenIds === null)) {
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
      {intakeError && (
        <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
          {intakeError}
        </p>
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
                  const done = isDone(g, it);
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
  schedaAddonChatUntil, // profiles.scheda_addon_chat_until (SCHEMA_v68) — chat col coach per chi ha comprato la Scheda Personalizzata come add-on sopra Free/Premium, non collegata a planProp
  supabase: supabaseProp,  // se passato insieme a userId, sostituisce scheda/target finti con quelli reali assegnati dal coach
  userId,
  onUpgrade: onUpgradeProp,   // apre le impostazioni/abbonamento (App.jsx) — no-op in preview isolata
  onOpenChat: onOpenChatProp, // passa al tab Chat (App.jsx) — no-op in preview isolata
  onNavigateTab: onNavigateTabProp, // cambia tab (App.jsx: setTab) — usato dalla guida interattiva per News/Classifica/Profilo, no-op in preview isolata
} = {}) {
  // Controlled/uncontrolled ibrido: se App.jsx passa le prop, questo componente
  // segue lo stato condiviso (tema/genere/piano); altrimenti resta autonomo
  // per continuare a funzionare come preview isolata (npm run dev su questo file).
  const isControlled = genderProp !== undefined;
  const schedaAddonChatActive = Boolean(schedaAddonChatUntil) && new Date(schedaAddonChatUntil) > new Date();
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
  const [water, setWater] = useState(0);
  const [autoSteps, setAutoSteps] = useState(false);
  // isTrainingDay REALE si calcola più sotto da weekPlan (la scheda vera
  // assegnata dal coach) appena è disponibile — questo stato resta solo per
  // il toggle manuale "Simula ON/OFF" della preview demo.
  const [manualTrainingDay, setManualTrainingDay] = useState(true);
  // Inizializzati dall'ultimo target noto (localCache.js) se c'è, altrimenti
  // il default finto di sempre — mai un flash a vuoto se il coach ha già
  // assegnato qualcosa e la prima richiesta parte offline.
  const [targetOn, setTargetOn] = useState(() => (userId && readCache(`nutTargetOn_${userId}`)) || { kcal: 3000, p: 200, c: 380, f: 75 });   // giorno ON (allenamento)
  const [targetOff, setTargetOff] = useState(() => (userId && readCache(`nutTargetOff_${userId}`)) || { kcal: 2550, p: 200, c: 230, f: 85 }); // giorno OFF (riposo)

  // Dati reali: se supabase+userId sono passati (da App.jsx), sovrascrive i target
  // finti con quelli assegnati davvero dal coach (nutrition_targets). Se il coach
  // non ha ancora assegnato nulla, resta il target di default sopra (nessun crash).
  // Un fallimento (rete assente) non tocca lo stato: resta quello dell'ultima
  // volta riuscita (o il default), mai azzerato per un errore di rete.
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    fetchBothNutritionTargets(supabaseProp, userId)
      .then(({ targetOn: realOn, targetOff: realOff }) => {
        if (realOn) { setTargetOn(realOn); writeCache(`nutTargetOn_${userId}`, realOn); }
        if (realOff) { setTargetOff(realOff); writeCache(`nutTargetOff_${userId}`, realOff); }
      })
      .catch((err) => console.error("PERFORM: errore lettura nutrition_targets, mostro l'ultimo valore noto", err));
  }, [supabaseProp, userId]);

  // Dieta tipo pasto-per-pasto assegnata dal coach (diet_plans, SCHEMA_v83) —
  // fino a questa feature "Salva modifiche" lato coach scriveva SOLO il
  // target sopra, mai i pasti stessi, quindi questo fetch non esisteva e il
  // tab "Dieta Tipo" restava sempre nascosto in modalità reale (vedi
  // NutritionTabs più sotto). null finché non caricato o non assegnato.
  const [dietPlan, setDietPlan] = useState(() => (userId && readCache(`dietPlan_${userId}`)) || { on: null, off: null });
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    fetchDietPlan(supabaseProp, userId)
      .then((plan) => { setDietPlan(plan); writeCache(`dietPlan_${userId}`, plan); })
      .catch((err) => console.error("PERFORM: errore lettura diet_plans, mostro l'ultimo valore noto", err));
  }, [supabaseProp, userId]);

  // Scheda assegnata dal coach per l'INTERA settimana corrente (Lun→Dom, stesso
  // schema lunedì-domenica già usato da fetchWeekWorkout/weekDatesFrom lato
  // coach — vedi 09_CoachDashboard.jsx/coachingData.js), non più solo oggi:
  // serve perché WorkoutCalendarStrip/CalendarDayReadOnlyView possano mostrare
  // il giorno che il cliente clicca davvero, non solo quello odierno. Se un
  // giorno non ha nulla assegnato resta null — niente dati finti mostrati a
  // un utente reale.
  // null = non ancora caricato; 7 elementi Lun→Dom. Inizializzato dall'ultima
  // scheda nota (localCache.js) se c'è: un'app riaperta con rete assente
  // mostra subito l'ultima settimana vista, non una schermata vuota.
  const [assignedWeek, setAssignedWeek] = useState(() => (userId ? readCache(`assignedWeek_${userId}`) : null));
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    let cancelled = false;
    const weekDates = weekDatesFromLocal(mondayOfLocal());
    Promise.all([
      fetchAssignedWorkouts(supabaseProp, userId, weekDates[0], weekDates[6]),
      fetchWorkoutDayNotes(supabaseProp, userId, weekDates[0], weekDates[6]).catch(() => new Map()),
    ])
      .then(async ([rows, dayNotesByDate]) => {
        const byDate = new Map();
        rows.forEach((r) => {
          if (!byDate.has(r.date)) byDate.set(r.date, []);
          byDate.get(r.date).push(r);
        });
        // BUG PRESO (perf): prima, per OGNI esercizio della settimana, 3
        // chiamate quasi indipendenti (fetchExerciseHistory, fetchWorkoutSets,
        // fetchExerciseSetHistory) — le prime due rifacevano per giunta la
        // STESSA query su workout_logs, solo con colonne diverse su
        // workout_sets. Con 15-20 esercizi in una settimana, decine di
        // round-trip solo per caricare la Home. fetchWeekExerciseHistories
        // fa lo stesso lavoro con 2 query totali (vedi coachingData.js).
        const { historyByExerciseName, setHistoryByExerciseName, loggedSetsByLogId, missedByExerciseName } =
          await fetchWeekExerciseHistories(supabaseProp, userId, rows);

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
        const week = weekDates.map((date) => {
          const dayRows = byDate.get(date);
          if (!dayRows || dayRows.length === 0) return null;
          const exercisesForDay = dayRows.map((r) => {
            const loggedSets = loggedSetsByLogId.get(r.id) ?? [];
            if (loggedSets.length > 0) {
              setsPatch[r.id] = Array.from({ length: r.sets_count ?? 3 }, (_, i) => {
                const logged = loggedSets.find((s) => s.set_number === i + 1);
                return logged
                  ? { kg: logged.load_kg ?? "", reps: logged.reps_completed ?? "" }
                  : { kg: "", reps: "" };
              });
            }
            return {
              id: r.id,               // id reale della riga workout_logs, serve per salvare il log dopo
              name: r.exercise_name,
              kind: r.kind || "strength",
              durationMin: r.duration_min ?? null,
              sets: r.sets_count ?? 3,
              reps: r.reps_target || "—",   // prescrizione del coach (SCHEMA_v17); "—" solo se davvero non impostata
              rirTarget: r.rir_target || "—",   // prescrizione del coach (SCHEMA_v21); "—" solo se davvero non impostato
              technique: r.intensity_technique || "",
              rests: Array.from({ length: r.sets_count ?? 3 }, () => r.rest_seconds ?? 120),
              // BUG PRESO (segnalato): "confronto in assoluto" — lo storico
              // veniva letto per nome esercizio, ignorando su quale giorno
              // della settimana ricorre. Stessa chiave nomeEsercizio::
              // giornoSettimana usata da fetchWeekExerciseHistories
              // (coachingData.js): un esercizio ripetuto più volte a
              // settimana su giorni diversi costruisce lo storico solo
              // dalle occorrenze passate nello STESSO giorno.
              history: historyByExerciseName.get(weekExerciseHistoryKey(r.exercise_name, date)) ?? [],
              setHistory: setHistoryByExerciseName.get(weekExerciseHistoryKey(r.exercise_name, date)) ?? [], // [{workoutLogId, date, sets:[{setNumber, kg, reps}]}] — sessioni passate modificabili
              missedSessions: missedByExerciseName.get(weekExerciseHistoryKey(r.exercise_name, date)) ?? [], // [{workoutLogId, date, setsCount}] — giorni assegnati mai registrati, recuperabili
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
          });
          const dayNotes = dayNotesByDate.get(date);
          return {
            label: dayRows[0].split_label || "Scheda di oggi",
            warmup: dayNotes?.warmupText || "",
            stretching: dayNotes?.stretchingText || "",
            exercises: exercisesForDay,
          };
        });
        if (cancelled) return;
        setAssignedWeek(week);
        writeCache(`assignedWeek_${userId}`, week);
        if (Object.keys(setsPatch).length > 0) setSets((prev) => ({ ...setsPatch, ...prev }));
      })
      .catch((err) => {
        console.error("PERFORM: errore lettura workout_logs assegnati, mostro l'ultima scheda nota", err);
        // BUG PRESO: azzerava SEMPRE a "nessun giorno assegnato" (anche su
        // un semplice errore di rete) — un cliente che riapriva l'app
        // offline vedeva la scheda sparire del tutto, anche se l'ultima
        // volta online l'aveva già vista per intero (ora in cache). Il
        // fallback vuoto resta solo per quando non c'è proprio nulla, né
        // dalla cache né da un caricamento precedente in questa sessione.
        if (!cancelled) setAssignedWeek((prev) => prev ?? Array(7).fill(null));
      });
    return () => { cancelled = true; };
  }, [supabaseProp, userId]);

  // Guida biomeccanica per esercizio (SCHEMA_v61): libreria condivisa,
  // scritta dal coach una sola volta per esercizio — letta qui una volta
  // sola e incrociata per nome con gli esercizi assegnati (sotto, dove
  // viene costruito `exercises`), invece di indovinarla dal nome con
  // exerciseHowTo/exerciseAvoid (la causa della guida sbagliata sugli
  // esercizi inseriti manualmente, non presenti in quel elenco fisso).
  const [homeExerciseLib, setHomeExerciseLib] = useState(null);
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    fetchExerciseLibrary(supabaseProp).then(setHomeExerciseLib)
      .catch((err) => console.error("PERFORM: errore lettura libreria esercizi (guida)", err));
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
      })
        .then(() => pushCoachSync({ type: "recovery-metrics" })) // il cerchio Recupero si muove subito, non al prossimo poll
        .catch((err) => console.error("PERFORM: errore salvataggio daily_metrics", err));
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
            na: Number(r.sodium_mg) || 0, k: Number(r.potassium_mg) || 0, fe: Number(r.iron_mg) || 0,
            ca: Number(r.calcium_mg) || 0, mg: Number(r.magnesium_mg) || 0,
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

  // §07 memo "Verso l'élite" (Mai perdere una serie), esteso ora anche ad
  // alimentazione e integrazione (richiesta esplicita: poter aprire scheda
  // di allenamento/alimentazione/integrazione anche con rete scarsa,
  // registrare e vedersi sincronizzare tutto da solo al ritorno online).
  // Wifi di sala pesi scarso, la serie/il pasto/la spunta appena registrati
  // devono arrivare comunque. Se la scrittura fallisce (rete assente, non
  // un errore di validazione) viene messa in coda offline (IndexedDB, vedi
  // lib/offlineQueue.js) e riprovata da sola quando la rete torna.
  // flushQueue gira al mount, quando la rete torna (`online`) e quando la
  // scheda ridiventa visibile — mai il Background Sync API del Service
  // Worker, che Safari/iOS (il target primario di questa app) non supporta
  // affatto. pendingSyncCount ora è reattivo (useOfflineQueueCount): conta
  // OGNI tipo di scrittura in coda, anche quelle messe/tolte da componenti
  // lontani (SupplementsFreeDiary, SupplementsPlanLocked...) che non hanno
  // accesso diretto a questo state.
  const pendingSyncCount = useOfflineQueueCount();
  const flushQueue = useCallback(() => {
    if (!supabaseProp) return;
    flushOfflineQueue({
      "workout-set": (payload) => logWorkoutSet(supabaseProp, payload.exerciseId, payload.userId, payload.setNumber, {
        repsCompleted: payload.repsCompleted, loadKg: payload.loadKg, rir: payload.rir,
      }),
      "nutrition-log": (payload) => addNutritionLogItem(supabaseProp, payload.userId, payload.dateISO, payload.mealSlot, payload.item, payload.clientId),
      "supplement-taken": (payload) => setSupplementTaken(supabaseProp, payload.userId, payload.itemId, payload.taken),
      "self-supplement-taken": (payload) => setSelfSupplementTaken(supabaseProp, payload.userId, payload.id, payload.taken),
    }).catch((err) => console.error("PERFORM: errore sincronizzazione coda offline", err));
  }, [supabaseProp]);
  useEffect(() => {
    flushQueue();
    const onVisible = () => { if (document.visibilityState === "visible") flushQueue(); };
    window.addEventListener("online", flushQueue);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flushQueue);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flushQueue]);

  // useCallback: passata come onCoachSync a ogni ExerciseCard (ora
  // memo-izzato) e a molti altri pannelli (Alimentazione, Integrazione...).
  // Ricreata a ogni render invaliderebbe il memo di TUTTE le card ogni
  // volta che QUALSIASI stato di questa schermata cambia, non solo quello
  // dell'esercizio toccato — deps esplicite (isRealMode/userId/supabaseProp
  // cambiano solo su login/logout, mai durante l'uso normale).
  const pushCoachSync = useCallback((evt) => {
    setCoachFeed((f) => [...f.slice(-99), { ...evt, at: new Date().toISOString() }]);
    setLastActivityDate(toLocalISODate());

    // Salvataggio reale: quando kg e reps sono entrambi compilati su un
    // esercizio assegnato dal coach (isRealMode + exerciseId reale), scrive
    // sia lo storico completo (workout_sets, una riga per serie) sia un
    // riassunto rapido su workout_logs (ultima serie + stato "done"). Il RIR
    // non si raccoglie più per singola serie (resta solo come indicazione
    // del coach nella guida esercizio): sempre null qui.
    if (isRealMode && evt.type === "workout" && evt.kind === "set-completed" && evt.exerciseId && evt.row) {
      const { kg, reps } = evt.row;
      const payload = {
        exerciseId: evt.exerciseId, userId, setNumber: evt.rowIndex + 1,
        repsCompleted: reps !== "" ? Number(reps) : null,
        loadKg: kg !== "" ? Number(kg) : null,
        rir: null,
      };
      logWorkoutSet(supabaseProp, payload.exerciseId, payload.userId, payload.setNumber, {
        repsCompleted: payload.repsCompleted, loadKg: payload.loadKg, rir: payload.rir,
      }).catch((err) => {
        console.error("PERFORM: errore salvataggio workout_sets, la metto in coda per riprovare quando torna la rete", err);
        enqueueWrite("workout-set", payload);
      });
    }
  }, [isRealMode, userId, supabaseProp]);
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

  // BUG PRESO: "Copia i pasti di ieri" era onCopyYesterday={() => {}} — un
  // no-op, esattamente come onUpgrade prima di questa stessa sessione di
  // fix. Ora legge davvero il diario di ieri (nutrition_logs) e reinserisce
  // ogni voce su OGGI, sia sullo stato locale (per vederli subito) sia su
  // Supabase (addNutritionLogItem, stessa funzione già usata per un
  // alimento aggiunto a mano).
  const copyYesterdayMeals = async () => {
    if (!supabaseProp || !userId) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    try {
      const rows = await fetchNutritionLogsForDate(supabaseProp, userId, toLocalISODate(y));
      if (rows.length === 0) return;
      const todayIso = toLocalISODate();
      const saved = await Promise.all(rows.map((r) =>
        addNutritionLogItem(supabaseProp, userId, todayIso, r.meal_slot,
          { name: r.name, grams: r.grams, kcal: r.kcal, p: r.protein, c: r.carbs, f: r.fat,
            na: r.sodium_mg, k: r.potassium_mg, fe: r.iron_mg, ca: r.calcium_mg, mg: r.magnesium_mg })
      ));
      setMeals((m) => {
        const next = { ...m };
        saved.forEach((s) => {
          const item = {
            id: s.id, name: s.name, grams: s.grams, kcal: s.kcal, p: s.protein, c: s.carbs, f: s.fat,
            na: s.sodium_mg, k: s.potassium_mg, fe: s.iron_mg, ca: s.calcium_mg, mg: s.magnesium_mg,
          };
          next[s.meal_slot] = [...(next[s.meal_slot] || []), item];
        });
        return next;
      });
    } catch (err) {
      // BUG PRESO: l'errore restava solo in console — il pulsante tornava
      // normale e sembrava che "copia i pasti di ieri" non avesse fatto
      // nulla, senza nessuna spiegazione. Rilanciato: il pulsante che invoca
      // questa funzione (NutritionTabs) lo intercetta e mostra un errore vero.
      console.error("PERFORM: errore copia pasti di ieri", err);
      throw err;
    }
  };

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
  const setsFor = (ex) => sets[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "" }));
  // useCallback: stessa ragione della gemella in FreeWorkoutBuilder più
  // sopra — passata a ogni ExerciseCard della settimana (ora memo-izzato),
  // deve restare la stessa funzione tra un render e l'altro per non
  // invalidare il memo di TUTTE le card a ogni digitazione o a qualunque
  // altro stato che cambia in questa schermata enorme.
  const onSetField = useCallback((ex, i, f, v) =>
    setSets((s) => {
      const rows = (s[ex.id] || Array.from({ length: ex.sets }, () => ({ kg: "", reps: "" }))).map((r, j) => (j === i ? { ...r, [f]: v } : r));
      return { ...s, [ex.id]: rows };
    }), []);

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
  const exercisesRaw = isRealMode ? (weekPlan[todayWeekdayIdx]?.exercises ?? []) : demoExercises;
  // Guida coach (howTo/avoid/videoUrl) incrociata per nome esatto — un
  // esercizio non ancora documentato dal coach resta senza guida invece di
  // mostrarne una sbagliata: gestito da ExerciseCard (nessuna sezione
  // guida se ex.howTo è assente).
  const exercises = isRealMode && homeExerciseLib
    ? exercisesRaw.map((ex) => {
        const entry = homeExerciseLib[ex.name];
        return entry ? { ...ex, howTo: entry.howTo || ex.howTo, avoid: entry.avoid || ex.avoid, videoUrl: entry.videoUrl || ex.videoUrl } : ex;
      })
    : exercisesRaw;

  // ON/OFF alimentazione sincronizzato con la scheda vera: giorno assegnato
  // dal coach (weekPlan[oggi] non null) = ON, riposo (null) = OFF. Prima era
  // solo un toggle manuale mai collegato alla scheda reale — "Simula ON/OFF"
  // resta ma solo come test per la preview demo (isRealMode lo ignora).
  const isTrainingDay = isRealMode ? weekPlan[todayWeekdayIdx] != null : manualTrainingDay;
  const target = isTrainingDay ? targetOn : targetOff; // il target attivo "oggi" si sceglie da solo

  // mealGuide reale per il tab "Dieta Tipo": i pasti del profilo ON/OFF
  // attivo "oggi" (stessa scelta del target sopra). BUG PRESO: mappare questi
  // pasti sulle 6 fasce fisse di MEAL_SLOTS per POSIZIONE (colazione→prenanna)
  // rietichettava a forza qualunque pasto il coach avesse scritto — con 5
  // pasti invece di 6 tutto scalava di una posizione (es. "Pranzo" mostrato
  // come "Spuntino 1"). Il coach nomina/ordina/conta i pasti come vuole in
  // WeekDietEditor: qui si mostra esattamente quell'elenco (name/time propri
  // di ogni pasto, vedi snapshotMeals in 09_CoachDashboard.jsx), niente
  // corrispondenza posizionale con MEAL_SLOTS.
  const realDietProfile = isTrainingDay ? dietPlan.on : dietPlan.off;
  const realMealGuide = realDietProfile?.meals ?? [];

  // Stesso principio di exercises/weekPlan qui sopra: in modalità reale niente
  // numeri inventati. isTraining/sessionLabel riflettono la scheda vera di
  // oggi; weekNumber/dayNumber/mesociclo/mesocicloWeeks restano null — non
  // c'è ancora una fonte reale per quei quattro campi (nessun collegamento a
  // un vero "giorno N del percorso"), e mostrare "Giorno 15" a un cliente
  // vero sarebbe un dato falso, non solo un placeholder innocuo.
  const day = isRealMode
    ? { weekday: todayWeekdayIdx, weekNumber: null, isTraining: exercises.length > 0, sessionLabel: exercises[0]?.splitLabel || "", dayNumber: null, mesociclo: null, mesocicloWeeks: null, warmup: weekPlan[todayWeekdayIdx]?.warmup || "", stretching: weekPlan[todayWeekdayIdx]?.stretching || "" }
    : { weekday: 0, weekNumber: 3, isTraining: isTrainingDay, sessionLabel: "Upper A — Spinta", dayNumber: 15, mesociclo: 2, mesocicloWeeks: 4, warmup: "", stretching: "" };

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
        /* Esportazione PDF scheda (WorkoutPdfExport sopra): in stampa,
           nascondere TUTTO il resto dell'app (bottom nav, header, il resto
           della pagina Home dietro l'overlay) e mostrare solo il contenuto
           stampabile — altrimenti il PDF include anche i pulsanti "Chiudi"/
           "Stampa" e tutta l'interfaccia interattiva intorno. */
        @media print {
          body * { visibility: hidden; }
          .pdf-export-print, .pdf-export-print * { visibility: visible; }
          .pdf-export-print { position: absolute; inset: 0; }
          .pdf-export-print .no-print { display: none !important; }
        }
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
        /* stesso meccanismo di title-shine, tonalità verde fissa (non
           dipende dal genere): Giorno ON nelle strisce calendario
           Allenamento/Alimentazione. */
        .green-shine{background-image:linear-gradient(100deg, #10B981, #6EE7B7, #047857, #6EE7B7, #10B981);
          background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
          animation:performGlow 5s ease-in-out infinite;display:inline-block}
        @media (prefers-reduced-motion: reduce){.green-shine{animation:none}}
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
        .xp-bar{transition:transform .8s cubic-bezier(.22,1.2,.36,1)}
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
        /* toast XP: entra dal basso appena sopra la barra di navigazione,
           resta ben visibile, poi si dissolve da sola lentamente (non un
           taglio netto) — testo lucido oro/rosa (title-shine), non più un
           pillolo pieno colorato: più elegante, coerente coi titoli. */
        .xp-toast-wrap{position:fixed;bottom:calc(env(safe-area-inset-bottom, 0px) + 82px);left:0;right:0;
          display:flex;justify-content:center;z-index:70;pointer-events:none}
        .xp-toast{display:flex;align-items:center;gap:7px;padding:10px 18px;border-radius:999px;
          background:rgba(9,9,11,0.88);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);
          border:1px solid rgba(255,255,255,0.1);
          font-size:0.82rem;font-weight:700;box-shadow:0 14px 30px -8px rgba(0,0,0,0.5);
          animation:xpToastPop 7s cubic-bezier(.22,1,.36,1) both}
        .xp-toast-label{font-weight:600;opacity:0.92}
        @keyframes xpToastPop{0%{opacity:0;transform:translateY(14px) scale(.92)}
          4%{opacity:1;transform:translateY(0) scale(1)}
          60%{opacity:1;transform:translateY(0) scale(1)}
          100%{opacity:0;transform:translateY(4px) scale(.99)}}
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
        @keyframes noveltyPing{0%{transform:scale(1);opacity:0.7}75%,100%{transform:scale(2.4);opacity:0}}
        .novelty-ping{animation:noveltyPing 1.6s cubic-bezier(0,0,0.2,1) infinite}
        @media (prefers-reduced-motion: reduce){.novelty-ping{animation:none;opacity:0}}
        .metallic-badge{background-size:220% auto;animation:performGlow 4s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.metallic-badge{animation:none}}
        @keyframes greetingIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .greeting-text{animation:greetingIn .6s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.greeting-text{animation:none}}
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
          workoutLoading={isRealMode && assignedWeek === null}
          target={target} consumed={consumed}
          targetOn={targetOn} targetOff={targetOff}
          onSetTargetOn={(patch) => setTargetOn((t) => ({ ...t, ...patch }))}
          onSetTargetOff={(patch) => setTargetOff((t) => ({ ...t, ...patch }))}
          isTrainingDay={isTrainingDay} onToggleTrainingDay={isRealMode ? null : () => setManualTrainingDay((v) => !v)}
          streak={computeStreak("2026-07-19", 12, lastActivityDate)} level={4} xp={1840} xpInLevel={340} xpNeeded={590}
          mealsBySlot={meals} foods={allFoods} mealGuide={isRealMode ? realMealGuide : GUIDE}
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
          schedaAddonChatActive={schedaAddonChatActive}
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
          pendingSyncCount={pendingSyncCount}
          coachFeed={coachFeed}
          onSimulateInactivity={simulateInactivity} onResetActivityToday={resetActivityToday}
          onAddFood={(slot, item) => {
            // BUG PRESO (segnalato): rete assente in palestra/fuori casa e il
            // pasto appena registrato spariva — solo console.error, mai
            // ritentato. Stesso principio già in uso per le serie
            // (workout-set): id generato SUBITO lato client (mai attendere
            // la risposta del server per saperlo) così l'elemento è già
            // "vero" in UI, e se addNutritionLogItem fallisce per rete
            // assente lo mettiamo in coda invece di perderlo — si
            // sincronizza da solo al ritorno online (flushQueue sopra).
            const dateISO = toLocalISODate();
            const clientId = crypto.randomUUID();
            const localItem = { ...item, id: clientId };
            setMeals((m) => ({ ...m, [slot]: [...m[slot], localItem] }));
            if (supabaseProp && userId) {
              addNutritionLogItem(supabaseProp, userId, dateISO, slot, item, clientId)
                .then(() => pushCoachSync({ type: "nutrition" })) // il cerchio Alimentazione si muove subito, non al prossimo poll
                .catch((err) => {
                  console.error("PERFORM: errore salvataggio pasto, lo metto in coda per riprovare quando torna la rete", err);
                  enqueueWrite("nutrition-log", { userId, dateISO, mealSlot: slot, item, clientId });
                });
            }
          }}
          onRemoveFood={(slot, index) => {
            setMeals((m) => {
              const item = m[slot][index];
              if (supabaseProp && userId && item?.id) {
                // Se il pasto non è ancora sincronizzato (rimosso prima che
                // la coda offline riuscisse a scaricarlo) non ha senso
                // cancellarlo sul server: non esiste ancora lì. Si annulla
                // direttamente la scrittura in coda, altrimenti verrebbe
                // inserita comunque al ritorno online e resterebbe
                // "fantasma" nel diario.
                cancelQueuedWrite("nutrition-log", (p) => p.clientId === item.id).then((cancelled) => {
                  if (!cancelled) {
                    removeNutritionLogItem(supabaseProp, item.id)
                      .then(() => pushCoachSync({ type: "nutrition" }))
                      .catch((err) => console.error("PERFORM: errore rimozione pasto", err));
                  }
                });
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
                updateNutritionLogItem(supabaseProp, item.id, patched)
                  .then(() => pushCoachSync({ type: "nutrition" }))
                  .catch((err) => console.error("PERFORM: errore modifica pasto", err));
              }
              return { ...m, [slot]: items.map((it, i) => (i === index ? patched : it)) };
            });
          }}
          onOpenScanner={() => {}} onAddCustomFood={addCustomFood}
          onCopyYesterday={copyYesterdayMeals}
          onApplyReschedule={() => {}} onDismissReschedule={() => {}}
          onUpgrade={onUpgradeProp || (() => {})}
          onOpenChat={onOpenChatProp || (() => {})}
          onNavigateTab={onNavigateTabProp || (() => {})}
        />
      </main>
    </div>
  );
}
