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

import React, { useState, useMemo, useEffect, useId, useRef } from "react";
import {
  Dumbbell, Salad, BedDouble, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ArrowLeft, Plus, X, Search, Barcode, Camera, RefreshCw, Sparkles, ShoppingCart,
  CheckCircle2, Flame, Timer, Droplets, Footprints, Moon, Pill, Lock,
} from "lucide-react";
import { fetchBothNutritionTargets, fetchAssignedWorkouts, fetchExerciseHistory, logWorkoutSet } from "../lib/coachingData.js";

/* ============================================================================
   0 · NOTA — l'header istituzionale (logo, marchio "PERFORM", firma) è
   gestito centralmente da 04_AppShell.jsx: qui non viene più duplicato.
   ========================================================================== */

/* ============================================================================
   1 · UTILITÀ
   ========================================================================== */

export const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

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
  sleep: { bad: 6,    mid: 7.5,   fmt: (v) => `${v.toFixed(1)}h` },
  steps: { bad: 8000, mid: 10000, fmt: (v) => `${(v / 1000).toFixed(1)}k` },
  hrv:   { bad: 40,   mid: 60,    fmt: (v) => `${Math.round(v)}ms` },
  rhr:   { bad: 75,   mid: 65,    fmt: (v) => `${Math.round(v)}bpm`, invert: true },
};

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
function Chart3D({ kind, series }) {
  const scrollRef = useRef(null);
  useDragScroll(scrollRef);
  const t = THRESH[kind];
  const maxVal = Math.max(...series, t.mid * 1.15, 1);

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

  return (
    <div className="relative rounded-2xl p-4 overflow-hidden"
         style={{ backgroundColor: "rgba(255,255,255,0.07)", backdropFilter: "blur(16px) saturate(160%)",
                  WebkitBackdropFilter: "blur(16px) saturate(160%)",
                  border: "0.5px solid rgba(255,255,255,0.4)", boxShadow: "0 12px 34px rgba(0,0,0,0.14)" }}>
      <div ref={scrollRef} className="flex items-end gap-2.5 overflow-x-auto"
           style={{ cursor: "grab", scrollBehavior: "smooth" }}>
        {series.map((v, i) => {
          const idxFromEnd = series.length - 1 - i;
          const hPct = v > 0 ? Math.max(6, Math.min(100, (v / maxVal) * 100)) : 3;
          const tone = CANDLE[grade(kind, v)];
          return (
            <div key={i} className="shrink-0 flex flex-col items-center" style={{ width: 20 }}>
              <div style={{ height: 148, width: 20, display: "flex", alignItems: "flex-end" }}>
                <div className="relative overflow-hidden" style={{ width: 20, height: `${hPct}%`, borderRadius: 2,
                       background: `linear-gradient(180deg, ${tone.top} 0%, ${tone.mid} 45%, ${tone.dark} 100%)`,
                       border: "0.5px solid rgba(255,255,255,0.55)",
                       boxShadow: `0 4px 12px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)` }}>
                  <div className="absolute inset-x-0 top-0" style={{ height: "35%",
                         background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))" }} />
                  <div className="chart3d-sheen absolute top-0 bottom-0" style={{ width: "45%",
                         background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }} />
                </div>
              </div>
              <span className="font-data" style={{ fontSize: "0.5rem", fontWeight: 600, color: "var(--ink-3)", marginTop: 5, whiteSpace: "nowrap" }}>
                {dateLabelFor(idxFromEnd)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between mt-3">
        <span className="font-data" style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--ink)" }}>
          {t.fmt(series[series.length - 1] || 0)}
        </span>
        <span className="label" style={{ margin: 0 }}>Trascina per lo storico</span>
      </div>
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
        <button onClick={onUpgrade} className="rounded-full px-5 py-2.5 text-sm transition-transform active:scale-95"
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

/* Griglia dei 5 micronutrienti: sbloccata da Performance Pack in su, coperta
   dal lucchetto glassmorphism per i profili FREE. */
function MicronutrientGrid({ mealsBySlot, userPlan, gender, onUpgrade, accent, waterMl }) {
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

/* Mappa anatomica: distretto primario (diretto, 100%) + distretti sinergici
   (50%). Dorso separato in Gran Dorsale e Trapezio come due distretti clinici
   distinti; Adduttori incluso come distretto a sé. */
/* Mappa anatomica: distretto primario (diretto, 100%) + distretti sinergici
   (50%). 14 categorie anatomiche reali e distinte: nessuna dicitura generica
   "Deltoidi" o "Dorso" unificata — deltoide anteriore/laterale/posteriore e
   Gran Dorsale/Trapezio sono sempre trattati come distretti separati. */
const MUSCLE_MAP = [
  { test: /panca|croci|dip|chest|pectoral|peck/,                    primary: ["Pettorali"],          secondary: ["Tricipiti", "Deltoide Anteriore"] },
  { test: /squat|pressa|affond|front squat|leg press/,              primary: ["Quadricipiti"],        secondary: ["Glutei", "Adduttori"] },
  { test: /stacco|rdl|rumeno|good morning|femoral|leg curl/,        primary: ["Femorali", "Glutei"],  secondary: ["Gran Dorsale", "Adduttori"] },
  { test: /adduttori|adductor|copenhagen|sumo/,                     primary: ["Adduttori"],           secondary: [] },
  { test: /abduttori|abductor|glute bridge|hip thrust/,             primary: ["Glutei"],              secondary: ["Adduttori"] },
  { test: /shrug|scrollate/,                                        primary: ["Trapezio"],            secondary: [] },
  { test: /face pull|rematore presa larga|rematore gomiti alti/,    primary: ["Trapezio", "Deltoide Posteriore"], secondary: [] },
  { test: /iperestension/,                                          primary: ["Femorali"],            secondary: ["Gran Dorsale"] },
  { test: /rematore|trazioni|lat machine|pulley|pull-over|pullover/, primary: ["Gran Dorsale"],       secondary: ["Bicipiti", "Trapezio"] },
  { test: /alzate laterali/,                                        primary: ["Deltoide Laterale"],   secondary: ["Trapezio"] },
  { test: /alzate posteriori|reverse fly/,                          primary: ["Deltoide Posteriore"], secondary: ["Trapezio", "Gran Dorsale"] },
  { test: /alzate frontali|lento|military|arnold|shoulder press/,   primary: ["Deltoide Anteriore"],  secondary: ["Trapezio"] },
  { test: /curl|preacher|hammer|martello/,                          primary: ["Bicipiti"],            secondary: [] },
  { test: /french|push down|kickback|skull crusher|tricipiti/,      primary: ["Tricipiti"],           secondary: [] },
  { test: /calf/,                                                   primary: ["Polpacci"],            secondary: [] },
  { test: /plank|crunch|addominali|ab wheel|sollevamento gambe/,    primary: ["Addome"],              secondary: [] },
];
const VOLUME_MUSCLE_ORDER = [
  "Pettorali", "Gran Dorsale", "Trapezio",
  "Deltoide Anteriore", "Deltoide Laterale", "Deltoide Posteriore",
  "Bicipiti", "Tricipiti", "Addome", "Glutei",
  "Quadricipiti", "Femorali", "Adduttori", "Polpacci",
];

function muscleMapFor(name) {
  const s = (name || "").toLowerCase();
  const hit = MUSCLE_MAP.find((m) => m.test.test(s));
  return hit || { primary: ["Generico"], secondary: [] };
}

/* Soglie a semaforo sul volume settimanale (serie dirette + 50% sinergici):
   sotto 8 o sopra 25 = rosso, 8-9 o 21-25 = arancione, 10-20 = verde ottimale. */
function volumeTone(sets) {
  if (sets < 8 || sets > 25) return "bad";
  if (sets < 10 || sets > 20) return "warn";
  return "good";
}

/* Ciclo istantaneo: somma le serie dirette (100%) e sui sinergici (50%) di
   ogni esercizio della settimana, per distretto muscolare. */
function computeVolumeMatrix(weekDays) {
  const totals = {};
  const add = (muscle, amount) => { totals[muscle] = (totals[muscle] || 0) + amount; };
  (weekDays || []).forEach((day) => {
    const exercises = day?.exercises || [];
    exercises.forEach((ex) => {
      const sets = Number(ex.sets) || 3;
      if (ex.targetMuscle) {
        // assegnazione manuale (esercizio scritto a mano, non riconosciuto): 100% diretto, nessun sinergico ipotizzato
        add(ex.targetMuscle, sets);
        return;
      }
      const { primary, secondary } = muscleMapFor(ex.name);
      primary.forEach((m) => add(m, sets));
      secondary.forEach((m) => add(m, sets * 0.5));
    });
  });
  return totals;
}

/* Barra lucida a semaforo: gradiente + velo di luce in cima, stessa energia
   3D del brand, colorata in base alla soglia di volume. */
function VolumeBar({ muscle, sets }) {
  const tone = volumeTone(sets);
  const c = CANDLE[tone];
  const maxScale = 30;
  const pct = Math.max(4, Math.min(100, (sets / maxScale) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs shrink-0 truncate" style={{ width: 92, color: "var(--ink)", fontWeight: 600 }}>{muscle}</span>
      <div className="flex-1 relative rounded-full overflow-hidden" style={{ height: 16, backgroundColor: "var(--surface-2)" }}>
        <div className="h-full rounded-full relative overflow-hidden"
             style={{ width: `${pct}%`, background: `linear-gradient(180deg, ${c.top}, ${c.mid} 55%, ${c.dark})`,
                      boxShadow: `0 2px 6px ${c.mid}66`,
                      transition: "width 0.6s cubic-bezier(.22,1,.36,1), background 0.4s ease" }}>
          <div className="absolute inset-x-0 top-0" style={{ height: "45%",
                 background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))" }} />
        </div>
      </div>
      <span className="text-xs shrink-0 text-right" style={{ width: 34, color: c.label, fontWeight: 800 }}>
        {Number.isInteger(sets) ? sets : sets.toFixed(1)}
      </span>
    </div>
  );
}

/* Card completa della Matrice dei Volumi: mostra solo i distretti realmente
   coinvolti questa settimana, ordinati anatomicamente. */
function VolumeMatrixCard({ weekDays, userPlan, gender, onUpgrade }) {
  const totals = useMemo(() => computeVolumeMatrix(weekDays), [weekDays]);
  const involved = VOLUME_MUSCLE_ORDER.filter((m) => totals[m] > 0);

  return (
    <div className="card mb-4">
      <p className="label mb-1">Matrice dei Volumi</p>
      <p className="h1 mb-1">Stimolo settimanale reale</p>
      <p className="body mb-4">
        Ricalcolata a ogni esercizio inserito: serie dirette al 100%, serie sui distretti sinergici al 50%.
        Verde 10-20 serie (ottimale) · arancione 8-9 o 21-25 (al limite) · rosso sotto 8 o sopra 25.
      </p>

      {userPlan === "free" ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {VOLUME_MUSCLE_ORDER.map((m) => (
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
          {involved.map((m) => <VolumeBar key={m} muscle={m} sets={totals[m]} />)}
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
function complianceColor(pct) {
  const p = complPct(pct);
  let lo = COMPLIANCE_COLOR_STOPS[0], hi = COMPLIANCE_COLOR_STOPS[COMPLIANCE_COLOR_STOPS.length - 1];
  for (let i = 0; i < COMPLIANCE_COLOR_STOPS.length - 1; i++) {
    if (p >= COMPLIANCE_COLOR_STOPS[i].pct && p <= COMPLIANCE_COLOR_STOPS[i + 1].pct) {
      lo = COMPLIANCE_COLOR_STOPS[i]; hi = COMPLIANCE_COLOR_STOPS[i + 1]; break;
    }
  }
  const span = hi.pct - lo.pct || 1;
  const t = (p - lo.pct) / span;
  const h = lo.h + (hi.h - lo.h) * t;
  const s = lo.s + (hi.s - lo.s) * t;
  const l = lo.l + (hi.l - lo.l) * t;
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
  const uid = useId();
  const color = complianceColor(pct);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  return (
    <div className="relative shrink-0 ring-breathe" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <linearGradient id={`ringGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.78" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#ringGrad-${uid})`} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c - c * (pct / 100)} transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.22,1,.36,1), stroke 0.4s ease",
                         filter: `drop-shadow(0 0 5px ${color}99)` }} />
        {/* velo lucido: piccolo arco più chiaro in alto, per dare tridimensionalità */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFFFFF" strokeOpacity="0.4"
                strokeWidth={Math.max(1.5, stroke * 0.22)} strokeLinecap="round"
                strokeDasharray={`${c * 0.12} ${c}`} strokeDashoffset={c * 0.06} transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span style={{ fontSize: size > 60 ? "1.05rem" : "0.85rem", fontWeight: 700, color: "var(--ink)", transition: "color 0.3s ease" }}>{pct}%</span>
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
        const tier = complianceTier(r.pct);
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
  if (!ring) return null;
  const tier = complianceTier(ring.pct);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
         style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="spring-in w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6"
           style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="h1 flex items-center gap-2">
            <ring.icon size={18} style={{ color: tier.color }} /> {ring.label}
          </p>
          <button onClick={onClose} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
        </div>
        <p style={{ fontSize: "2.6rem", fontWeight: 700, color: tier.color, lineHeight: 1 }}>{ring.pct}%</p>
        <p className="meta mb-4 mt-1">{tier.label} · media ultimi 7 giorni</p>
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

function computeStreak(referenceDateStr = "2026-07-19", baseStreak = 12, lastActivityDateStr) {
  const ref = new Date(referenceDateStr); ref.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const grown = Math.max(1, baseStreak + Math.round((now - ref) / 86400000));

  if (!lastActivityDateStr) return grown;
  const last = new Date(lastActivityDateStr); last.setHours(0, 0, 0, 0);
  const gapDays = Math.round((now - last) / 86400000);
  return gapDays > 1 ? 0 : grown; // più di 24h senza registrare nulla → streak azzerato
}

/* Bio-sintomi: valutazione rapida da 1 a 5 con emoji, sempre facoltativa.
   Digestione/Gonfiore vive nell'ultima parte dell'Alimentazione; Energia,
   DOMS e Dolori vivono nel Recupero, insieme alle note di fine giornata. */
const DIGEST_EMOJIS = ["🤢", "😖", "😐", "🙂", "✨"];
const ENERGY_EMOJIS = ["😴", "😪", "😐", "🙂", "⚡"];
const DOMS_EMOJIS   = ["😩", "🥴", "😐", "🙂", "💪"];
const PAIN_EMOJIS   = ["🚨", "😣", "😐", "🙂", "✅"];

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

/* Check-in di fine giornata nel Recupero: Energia, DOMS, Dolori a emoji +
   note libere, tutto facoltativo. */
function EveningCheckIn({ onCoachSync }) {
  const [energy, setEnergy] = useState(0);
  const [doms, setDoms] = useState(0);
  const [pain, setPain] = useState(0);
  const [note, setNote] = useState("");

  const rate = (setter, symptom) => (v) => {
    setter(v);
    onCoachSync && onCoachSync({ type: "bio-symptom", symptom, value: v });
  };

  return (
    <div className="card mb-4">
      <p className="label mb-1">Check-in di fine giornata</p>
      <p className="body mb-4">Facoltativo: valuta solo quello che ti interessa tracciare.</p>
      <div className="space-y-5">
        <EmojiRating label="Energia / Focus" icon="⚡" emojis={ENERGY_EMOJIS} value={energy} onChange={rate(setEnergy, "energy")} />
        <EmojiRating label="Livello DOMS" icon="🤕" emojis={DOMS_EMOJIS} value={doms} onChange={rate(setDoms, "doms")} />
        <EmojiRating label="Segnalazione Dolori" icon="⚠️" emojis={PAIN_EMOJIS} value={pain} onChange={rate(setPain, "pain")} />
      </div>
      <div className="mt-5">
        <p className="label mb-1.5">Note (facoltative)</p>
        <textarea value={note} rows={3}
          onChange={(e) => { setNote(e.target.value); onCoachSync && onCoachSync({ type: "bio-note", value: e.target.value }); }}
          placeholder="Qualcosa da segnalare al coach? Scrivilo qui…"
          className="input w-full px-4 py-3 text-sm" style={{ resize: "vertical" }} />
      </div>
    </div>
  );
}

/* Pop-up serale bloccante ed elegante: ricorda il check-in di fine giornata
   insieme a passi e sonno. */
function EveningReminderModal({ accent, accentText, onDismiss, onGoToForm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
         style={{ backgroundColor: "rgba(9,9,11,0.55)", backdropFilter: "blur(3px)" }}>
      <div className="spring-in rounded-3xl p-6 w-full" style={{ maxWidth: 380, backgroundColor: "var(--surface)",
              border: `1.5px solid ${accent}`, boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35)" }}>
        <span className="inline-flex items-center justify-center rounded-full mb-4"
              style={{ width: 48, height: 48, backgroundColor: accent }}>
          <Moon size={22} style={{ color: "#FFFFFF" }} />
        </span>
        <p className="h1 mb-2">È ora del check-in serale</p>
        <p className="body mb-5">
          Prima di chiudere la giornata, ricordati di registrare i passi di oggi e il sonno di questa notte.
          Il check-in su energia, DOMS e dolori resta facoltativo: compilalo solo se vuoi. Servono al coach
          per leggere i tuoi pattern nel tempo.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onGoToForm} className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
            Compila ora
          </button>
          <button onClick={onDismiss} className="w-full rounded-full px-4 py-3 text-sm"
                  style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
            Più tardi
          </button>
        </div>
      </div>
    </div>
  );
}

/* Scala 1-10 generica per aderenza e stress/digestione: qui il valore va da
   1 (peggio) a 10 (meglio), coerente con le altre scale a 10 punti dell'app. */
const CHECK_SCALE_10 = Array.from({ length: 10 }, (_, i) => i + 1);

/* Pop-up del Check Domenica/Lunedì: bloccante, idro-satinato, con i 5 campi
   di compilazione rapida più 3 foto. Al termine simula il salvataggio dei
   parametri biometrici storici su Supabase (legati all'ID utente) e sblocca
   di nuovo la navigazione della Home. */
function WeeklyCheckModal({ accent, accentText, accentSoft, gender, onSubmit }) {
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [thigh, setThigh] = useState("");
  const [arm, setArm] = useState("");
  const [pain, setPain] = useState("");
  const [stress, setStress] = useState("");
  const [digestion, setDigestion] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [cyclePhase, setCyclePhase] = useState("");
  const [photos, setPhotos] = useState({ front: null, side: null, back: null });
  const [saving, setSaving] = useState(false);

  const handlePhoto = (key) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotos((p) => {
      if (p[key]) URL.revokeObjectURL(p[key]);
      return { ...p, [key]: URL.createObjectURL(file) };
    });
  };

  const canSubmit = weight && waist && thigh && arm && pain && stress && digestion && sleepQuality;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSaving(true);
    // simula il salvataggio dei parametri biometrici storici su Supabase,
    // legati all'ID utente: qui basta un breve delay per dare il feedback
    // visivo di "sincronizzazione" prima di sbloccare la Home.
    setTimeout(() => {
      onSubmit({
        weight: Number(weight), waist: Number(waist), thigh: Number(thigh), arm: Number(arm),
        pain: Number(pain), stress: Number(stress), digestion: Number(digestion), sleepQuality: Number(sleepQuality),
        cyclePhase: cyclePhase || null,
        photos: { front: !!photos.front, side: !!photos.side, back: !!photos.back },
      });
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(9,9,11,0.65)", backdropFilter: "blur(6px)" }}>
      <div className="spring-in relative w-full overflow-y-auto rounded-2xl p-6"
           style={{ maxWidth: 420, maxHeight: "92vh", backgroundColor: "var(--surface)",
                    border: `1.5px solid ${accent}`, boxShadow: "0 28px 70px -14px rgba(0,0,0,0.45)" }}>
        {/* velo lucido idro-satinato, per l'effetto glassmorphism */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none"
             style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%)" }} />

        <div className="relative">
          <span className="inline-flex items-center justify-center rounded-full mb-4"
                style={{ width: 48, height: 48, backgroundColor: accent }}>
            <Camera size={22} style={{ color: "#FFFFFF" }} />
          </span>
          <p className="h1 mb-2">Check settimanale</p>
          <p className="body mb-4">
            Fine settimana: registra le misure e rispondi a quello che l'app non può dedurre da sola da
            ciò che hai già tracciato durante la settimana. Serve tutto al coach per calibrare dieta e
            allenamento sui tuoi progressi reali.
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
                     className="rounded-2xl flex flex-col items-center justify-center gap-1.5 py-4 cursor-pointer transition-transform active:scale-95"
                     style={photos[key]
                       ? { background: `linear-gradient(160deg, ${accent}, ${accentText})` }
                       : { backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                {photos[key]
                  ? <CheckCircle2 size={20} style={{ color: "#FFFFFF" }} />
                  : <Camera size={20} style={{ color: accent }} />}
                <span className="text-xs" style={{ color: photos[key] ? "#FFFFFF" : "var(--ink-2)", fontWeight: 600 }}>{lab}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto(key)} />
              </label>
            ))}
          </div>

          <button onClick={handleSubmit} disabled={!canSubmit || saving}
                  className="w-full rounded-full px-4 py-3.5 text-sm transition-transform active:scale-[0.98] disabled:opacity-40"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
            {saving ? "Salvataggio in corso…" : "Invia Check al Coach"}
          </button>
          {!canSubmit && (
            <p className="meta mt-2 text-center" style={{ fontSize: "0.68rem" }}>
              Compila tutti i campi (le foto sono facoltative) per sbloccare l'app.
            </p>
          )}
        </div>
      </div>
    </div>
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
  targetOn, targetOff, isTrainingDay, onToggleTrainingDay,
  onAddFood, onOpenScanner, onOpenPhoto, onAddCustomFood, onCopyYesterday, onShoppingList,
  onGenerateSimilar, onApplyReschedule, onDismissReschedule,
  onUpgrade, onCoachSync, lastCoachSync, coachSyncCount, coachFeed, onSimulateInactivity, onResetActivityToday,
  userPlan, // 'free' | 'performance_pack' | 'full_coaching' — letta da Supabase, qui simulata
  remSleep, onSetRemSleep, stressLevel, onSetStressLevel,
  caffeineMg, onSetCaffeineMg, caffeineTime, onSetCaffeineTime,
}) {
  const [screen, setScreen] = useState("dash");   // dash | workout | nutrition | recovery
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [showEveningReminder, setShowEveningReminder] = useState(false);
  const [digestValue, setDigestValue] = useState(0);

  /* Check Domenica/Lunedì: si attiva da solo a fine settimana e blocca la
     navigazione dell'app finché l'atleta non lo compila. Una volta inviato,
     resta chiuso per il resto della sessione. */
  const [showWeeklyCheck, setShowWeeklyCheck] = useState(false);
  const [weeklyCheckDone, setWeeklyCheckDone] = useState(false);
  useEffect(() => {
    const dow = new Date().getDay(); // 0 = domenica, 1 = lunedì
    if ((dow === 0 || dow === 1) && !weeklyCheckDone && access.pro) setShowWeeklyCheck(true);
  }, [weeklyCheckDone, access.pro]);

  /* Cerchi di compliance biometrica: modello grafico di test, override manuali
     (solo per provare colori/soglie), popup analitico aperto. */
  const [ringTestOpen, setRingTestOpen] = useState(false);
  const [trainOverride, setTrainOverride] = useState(null);
  const [nutriOverride, setNutriOverride] = useState(null);
  const [recoveryOverride, setRecoveryOverride] = useState(null);
  const [activeRingPopup, setActiveRingPopup] = useState(null);
  const [selectedCalendarIso, setSelectedCalendarIso] = useState(null); // null = oggi
  const [, forceMidnightTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceMidnightTick((n) => n + 1), 60000); // ricontrolla ogni minuto
    return () => clearInterval(id);
  }, []);

  /* Più giorni di streak si accumulano, più in proporzione si guadagnano punti
     sulle task di oggi: +2% di XP per ogni giorno di streak, fino a un tetto
     del +50% per non farlo esplodere con streak molto lunghi. */
  const streakXpBonus = Math.min(0.5, streak * 0.02);

  /* Controllo automatico: a fine giornata (dalle 21:00) propone il check-in
     serale, se non è già stato chiuso in questa sessione — solo nei piani
     PRO (Coaching Allenamento / Full Coaching). */
  useEffect(() => {
    if (new Date().getHours() >= 21 && access.pro) setShowEveningReminder(true);
  }, [access.pro]);

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
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCompletedSets = (coachFeed || []).filter(
    (e) => e.type === "workout" && e.kind === "set-completed" && e.at && e.at.slice(0, 10) === todayStr
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

  const trainPct = trainOverride ?? trainPctComputed;
  const nutriPct = nutriOverride ?? nutriPctComputed;
  const recoveryPct = recoveryOverride ?? recoveryPctComputed;
  const recoveryTrackedDays = recoverySleep7.filter((h) => h > 0).length;

  const complianceRings = [
    {
      id: "train", label: "Allenamento", icon: Dumbbell, pct: trainPct,
      details: [
        { label: "Serie completate oggi", value: day.isTraining ? `${todayCompletedSets} / ${todayExpectedSets}` : "Riposo" },
        { label: "Media 7 giorni", value: `${trainPctComputed}%` },
        { label: "Diari carichi compilati (storico)", value: "6 / 7" },
      ],
    },
    {
      id: "nutri", label: "Alimentazione", icon: Salad, pct: nutriPct,
      details: [
        { label: "Precisione oggi vs target", value: `${nutriPctToday}%` },
        { label: "Kcal oggi", value: `${consumed.kcal} / ${target.kcal}` },
        { label: "Media 7 giorni", value: `${nutriPctComputed}%` },
      ],
    },
    {
      id: "recovery", label: "Recupero", icon: BedDouble, pct: recoveryPct,
      details: [
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
        <p className="label mb-0.5">{WEEK_DAYS[day.weekday]} · settimana {day.weekNumber}</p>
        <h2 className="h1">{title}</h2>
      </div>
    </div>
  );

  /* Check Domenica/Lunedì: blocca TUTTA la navigazione, qualunque schermata
     sia attiva, finché l'atleta non lo compila e invia. */
  if (showWeeklyCheck) {
    return (
      <WeeklyCheckModal
        accent={accent} accentText={accentText} accentSoft={accentSoft} gender={profile.gender}
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
                {levelTitle(level)}
              </span>
              <span className="flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--ink)" }}>
                <Flame size={15} className={streak >= 15 ? "flame-3" : streak >= 8 ? "flame-2" : streak >= 4 ? "flame-1" : ""}
                       style={{ color: accent }} fill={accent} strokeWidth={1.4} />
                {streak} Giorni di Streak
              </span>
            </div>

            <div className="mt-3">
              <MesocicloBadge mesociclo={day.mesociclo ?? 1} week={day.weekNumber} weeks={day.mesocicloWeeks ?? 4} />
            </div>
            <p className="meta mt-2">
              Giorno {day.dayNumber} del percorso · {WEEK_DAYS[day.weekday]}
            </p>
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
          {/* i 3 cerchi di compliance: dentro lo stesso banner, sopra il livello */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <ComplianceRings rings={complianceRings} onSelect={setActiveRingPopup} />
          </div>

          {/* barra XP: la checklist vive qui dentro, stesso banner */}
          <button onClick={() => setChecklistOpen((v) => !v)} className="w-full mt-4 pt-4 text-left"
                  style={{ borderTop: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5" style={{ color: "var(--ink)", fontSize: "0.9rem", fontWeight: 500 }}>
                Livello {level}
                <span className="label" style={{ fontSize: "0.55rem" }}>
                  {checklistOpen ? "chiudi" : "obiettivi di oggi"}
                </span>
              </span>
              <span className="meta font-data flex items-center gap-1.5">
                {xpInLevel} / {xpNeeded} XP
                {checklistOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 10, backgroundColor: "var(--surface-2)" }}>
              <div className="xp-bar xp-bar-shine relative h-full rounded-full overflow-hidden"
                   style={{ width: `${Math.min(100, (xpInLevel / xpNeeded) * 100)}%`,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                <div className="absolute inset-x-0 top-0" style={{ height: "55%",
                       background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))" }} />
              </div>
            </div>
          </button>

          {checklistOpen && (
            <div className="spring-in mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="text-xs mb-2.5" style={{ color: accentText, fontWeight: 700 }}>
                Bonus streak: +{Math.round(streakXpBonus * 100)}% XP su ogni task di oggi
              </p>
              <div className="space-y-2">
                {[
                  ["Allenamento completato", day.isTraining, 50],
                  ["Sonno nel range 7-9h", sleep.hours >= 7 && sleep.hours <= 9, 20],
                  ["Passi oltre 8.000", Number(steps) >= 8000, 20],
                  ["Idratazione al target", water >= waterTarget, 20],
                  ["Macros nel target", Math.abs(consumed.kcal - target.kcal) <= target.kcal * 0.05, 25],
                  ["Almeno 4 pasti su 6", Object.values(mealsBySlot).filter((a) => a.length).length >= 4, 15],
                ].map(([label, done, baseXp]) => (
                  <div key={label} className="inner flex items-center gap-3 px-4 py-2.5">
                    {done ? <CheckCircle2 size={16} style={{ color: accentText }} className="shrink-0" />
                          : <span className="shrink-0 rounded-full" style={{ width: 15, height: 15, border: "1.5px solid var(--ink-2)" }} />}
                    <span className="text-sm flex-1" style={{ color: "var(--ink)" }}>{label}</span>
                    <span className="font-data text-xs shrink-0" style={{ color: done ? accentText : "var(--ink-2)" }}>
                      +{Math.round(baseXp * (1 + streakXpBonus))} XP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* simulatore di test: solo per provare rapidamente i colori/soglie */}
        <button onClick={() => setRingTestOpen((v) => !v)} className="text-xs mb-4" style={{ color: "var(--ink-2)" }}>
          🧪 {ringTestOpen ? "Nascondi simulatore" : "Simula percentuali (solo test)"}
        </button>
        {ringTestOpen && (
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
                      className="rounded-full px-4 py-2.5 text-sm"
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
    return (
      <div className="spring-in">
        {back("Allenamento")}
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
              <VolumeMatrixCard weekDays={weekPlan} userPlan={userPlan} gender={profile.gender} onUpgrade={onUpgrade} />
            </div>
          </>
        ) : (
          <FreeWorkoutBuilder accent={accent} accentText={accentText} accentSoft={accentSoft}
                               day={day} onUpgrade={onUpgrade} onCoachSync={onCoachSync} userPlan={userPlan} gender={profile.gender} />
        )}
      </div>
    );
  }

  /* ------------------------------ ALIMENTAZIONE ------------------------- */
  if (screen === "nutrition") {
    return (
      <div className="spring-in">
        {back("Alimentazione")}
        <div className="card mb-5">
          <p className="label mb-3">Rimanenti oggi</p>
          <MacroRow values={remaining} />
          <p className="meta font-data mt-3 text-center">
            {consumed.kcal} / {target.kcal} kcal consumate
          </p>
        </div>

        {/* idratazione: spostata qui dal Recupero, fa parte dell'Alimentazione */}
        <div className="card mb-5">
          <p className="label mb-3">Idratazione</p>
          <div className="flex items-center gap-4">
            <button onClick={onAddWater} aria-label="Aggiungi 250 ml"
                    className="relative rounded-2xl overflow-hidden shrink-0 transition-transform active:scale-95"
                    style={{ width: 62, height: 96,
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
                <Droplets size={21} style={{ color: water >= waterTarget ? "#111111" : "#4A6B7C" }} />
              </span>
            </button>
            <div className="flex-1 min-w-0">
              <p style={{ color: "var(--ink)", fontSize: "1.3rem", fontWeight: 500 }}>
                {(water / 1000).toFixed(2)} L
                <span className="meta"> / {(waterTarget / 1000).toFixed(1)} L</span>
              </p>
              <p className="meta mt-1">Ogni tocco aggiunge 250 ml</p>
            </div>
          </div>
        </div>

        <NutritionTabs
          accent={accent} accentSoft={accentSoft} accentText={accentText}
          target={target} mealsBySlot={mealsBySlot} foods={foods}
          mealGuide={mealGuide} substitutions={substitutions}
          onAddFood={onAddFood} onOpenScanner={onOpenScanner} onOpenPhoto={onOpenPhoto} onAddCustomFood={onAddCustomFood}
          onCopyYesterday={onCopyYesterday} onShoppingList={onShoppingList}
          onGenerateSimilar={onGenerateSimilar}
          targetOn={targetOn} targetOff={targetOff}
          onSetTargetOn={onSetTargetOn} onSetTargetOff={onSetTargetOff}
          isTrainingDay={isTrainingDay} onToggleTrainingDay={onToggleTrainingDay}
          waterTarget={waterTarget} onSetWaterTarget={onSetWaterTarget}
          fullAccess={access.pro} onUpgrade={onUpgrade}
          userPlan={userPlan} gender={profile.gender} waterMl={water}
          digestValue={digestValue}
          onDigestChange={(v) => { setDigestValue(v); onCoachSync && onCoachSync({ type: "bio-symptom", symptom: "digest", value: v }); }}
        />
      </div>
    );
  }

  /* ------------------------- INTEGRAZIONE E TIMING ----------------------- */
  if (screen === "supplements") {
    return (
      <div className="spring-in">
        {back("Integrazione e Timing")}
        <SupplementsPanel accent={accent} accentSoft={accentSoft} accentText={accentText}
                           isPro={!!access.pro} isPaid={!!access.paid} isTrainingDay={isTrainingDay}
                           onUpgrade={onUpgrade} onCoachSync={onCoachSync} />
      </div>
    );
  }

  /* ------------------------------ RECUPERO ------------------------------ */
  return (
    <div className="spring-in">
      {back("Recupero e Attività")}

      {showEveningReminder && (
        <EveningReminderModal accent={accent} accentText={accentText}
          onDismiss={() => setShowEveningReminder(false)}
          onGoToForm={() => setShowEveningReminder(false)} />
      )}

      {access.pro && (
        <button onClick={() => setShowEveningReminder(true)}
                className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-3"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 500 }}>
          🔔 Prova il promemoria del check-in serale
        </button>
      )}

      {access.pro && (
        <button onClick={() => setShowWeeklyCheck(true)}
                className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full mb-4"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 500 }}>
          📸 Prova il check Domenica/Lunedì
        </button>
      )}

      {/* sonno */}
      <div className="card mb-4">
        <p className="label mb-3">Sonno di questa notte</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="label block mb-1.5">Addormentato</span>
            <input type="time" value={sleep.start || ""} onChange={(e) => onSetSleep("start", e.target.value)}
                   className="input w-full px-4 py-3 font-data" />
          </label>
          <label className="block">
            <span className="label block mb-1.5">Sveglia</span>
            <input type="time" value={sleep.end || ""} onChange={(e) => onSetSleep("end", e.target.value)}
                   className="input w-full px-4 py-3 font-data" />
          </label>
        </div>
        {sleep.hours > 0 && (
          <div className="inner px-4 py-3 flex items-center gap-2.5">
            <Moon size={15} style={{ color: accent }} />
            <span className="text-sm" style={{ color: "var(--ink)" }}>
              {sleep.hours.toFixed(1)} ore ·{" "}
              <span style={{ color: CANDLE[grade("sleep", sleep.hours)].label, fontWeight: 600 }}>
                {grade("sleep", sleep.hours) === "good" ? "nel range"
                  : grade("sleep", sleep.hours) === "warn" ? "al limite" : "insufficiente"}
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <Moon size={13} style={{ color: accent }} />
        <p className="label" style={{ margin: 0 }}>Sonno · rosso &lt;6h · arancione 6-7,5h · verde &gt;7,5h</p>
      </div>
      <div className="mb-4"><Chart3D kind="sleep" series={liveHistory.sleep} /></div>

      {/* passi */}
      <div className="card mb-4">
        <p className="label mb-3">Passi di oggi</p>
        <div className="flex items-center gap-3 mb-3">
          <Footprints size={18} style={{ color: accent }} className="shrink-0" />
          <input type="number" min="0" value={steps} onChange={(e) => onSetSteps(e.target.value)}
                 disabled={autoSteps} placeholder="Passi di oggi"
                 className="input w-full px-4 py-3 font-data disabled:opacity-70" />
        </div>
        <div className="inner px-4 py-3.5 flex items-center justify-between gap-3">
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
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <Footprints size={13} style={{ color: accent }} />
        <p className="label" style={{ margin: 0 }}>Passi · rosso &lt;6k · arancione 6-10k · verde &gt;10k</p>
      </div>
      <div className="mb-4"><Chart3D kind="steps" series={liveHistory.steps} /></div>

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

      {/* Cruscotto Recupero Neurale: sonno REM, stress, caffeina con emivita */}
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
        return (
          <div className="card mb-4">
            <p className="label mb-1">Cruscotto Recupero Neurale</p>
            <p className="h1 mb-1">Sonno REM, stress e stimolanti</p>
            <p className="body mb-4">Tutto si aggiorna in diretta e incide sul cerchio Recupero.</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="label block mb-1.5">Sonno profondo (REM, h)</span>
                <input type="text" inputMode="decimal" value={remSleep}
                       onChange={(e) => onSetRemSleep(e.target.value.replace(",", "."))}
                       placeholder="es. 1.5" className="input w-full px-4 py-3 font-data" />
              </label>
              <label className="block">
                <span className="label block mb-1.5">Stress mentale (1-10)</span>
                <select value={stressLevel} onChange={(e) => onSetStressLevel(e.target.value)}
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

      {access.pro ? (
        <EveningCheckIn onCoachSync={onCoachSync} />
      ) : (
        <div className="mb-4">
          <LockedPanel onUpgrade={onUpgrade} accent={accent}
            text="Il check-in di fine giornata (energia, DOMS, dolori e note per il coach) è parte del Full Coaching: fatti aiutare da un professionista del settore che lo legge ogni sera." />
        </div>
      )}

      {!access.pro && <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Sonno e passi dicono molto, ma solo se qualcuno li legge nel contesto giusto. Fatti aiutare da un professionista del settore che li integra nel tuo piano completo: vedi gli abbonamenti per iniziare." />}
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
        const iso = d.toISOString().slice(0, 10);
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



function ExerciseCard({ ex, index, rows, onSetField, accent, accentText, userPlan, gender, onUpgrade, onCoachSync }) {
  const [plates, setPlates] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [doneRows, setDoneRows] = useState(() => rows.map(() => false));
  const [timer, setTimer] = useState(null); // { total, remaining } in secondi

  const isMaxEffort = index < 2;
  const peak = Math.max(0, ...rows.map((r) => Number(r.kg) || 0));

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
      <p className="meta mt-0.5">{ex.sets} serie × {ex.reps} reps · RIR {ex.rirTarget}</p>
      {ex.technique && <p className="mt-1 text-sm" style={{ color: "var(--ink-2)", fontWeight: 500 }}>Tecnica: {ex.technique}</p>}
      {lastEntry && lastEntry.kg > 0 && (
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Scorsa sessione identica: <span style={{ color: "var(--ink)", fontWeight: 700 }}>{lastEntry.kg} kg{lastEntry.reps ? ` × ${lastEntry.reps} reps` : ""}</span>
          {best > 0 && <> · record da battere: <span style={{ color: RECORD_GOLD_GREEN, fontWeight: 700 }}>{best} kg</span></>}
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
                     className="col-span-3 input w-full px-2 py-2.5 text-center text-sm"
                     aria-label={`${f} serie ${i + 1} di ${ex.name}`} />
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

const EXERCISE_LIBRARY = Object.values(EXERCISE_DB).flat();

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

function FreeWorkoutBuilder({ accent, accentText, accentSoft, day, onUpgrade, onCoachSync, userPlan, gender }) {
  const [innerTab, setInnerTab] = useState("oggi");
  const [weeks, setWeeks] = useState([emptyWeek()]);
  const [activeWeek, setActiveWeek] = useState(0);
  const [sets, setSets] = useState({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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
              <button onClick={() => setInnerTab("routine")} className="rounded-full px-5 py-3 text-sm"
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
              className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40"
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
                  accent={accent} accentText={accentText} accentSoft={accentSoft} />
              );
            })}
          </div>

          <div className="mt-4">
            <VolumeMatrixCard weekDays={weeks[activeWeek]} userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} />
          </div>
        </div>
      )}

      <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Non sai come periodizzare, quando inserire settimane di scarico o di carico, o come dosare l'intensità (RIR, cedimento, dropset...)? Fatti aiutare da un professionista del settore: vedi gli abbonamenti disponibili per metterti in contatto." />
    </div>
  );
}

function DayEditor({ label, data, onToggle, onLabel, onAdd, onRemove, onUpdate, accent, accentText, accentSoft }) {
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
  /* Se il nome scritto a mano non è nella lista ufficiale e il pattern non lo
     riconosce, serve un'assegnazione manuale del distretto per non lasciare
     vuoto il grafico dei volumi. */
  const needsTarget = trimmed.length > 0 && !isKnown && muscleMapFor(trimmed).primary[0] === "Generico";

  const handleAdd = () => {
    if (!trimmed) return;
    if (needsTarget && !targetMuscle) return;
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

export const MEAL_SLOTS = [
  { id: "colazione", label: "Colazione",  icon: "🥞" },
  { id: "spuntino1", label: "Spuntino 1", icon: "🥤" },
  { id: "pranzo",    label: "Pranzo",     icon: "🥙" },
  { id: "merenda",   label: "Merenda",    icon: "🥪" },
  { id: "cena",      label: "Cena",       icon: "🍽️" },
  { id: "prenanna",  label: "Prenanna",   icon: "🥛" },
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
  },
  {
    id: "caffeina", name: "Caffeina", icon: "☕",
    dose: "3-6 mg/kg di peso corporeo", timing: "30-60 minuti prima dell'allenamento",
    body: "Agisce come antagonista dei recettori dell'adenosina, riducendo la percezione della fatica e aumentando " +
      "l'attivazione del sistema nervoso centrale. L'effetto ergogenico su forza e resistenza è ben documentato a " +
      "queste dosi. Oltre i 6 mg/kg i benefici non aumentano in proporzione, mentre crescono ansia e disturbi del " +
      "sonno se assunta troppo tardi nel pomeriggio.",
  },
  {
    id: "whey", name: "Whey Protein", icon: "🥛",
    dose: "20-40 g per porzione, in base al fabbisogno proteico residuo", timing: "In qualsiasi momento della giornata: la finestra anabolica post-allenamento è più ampia di quanto si creda",
    body: "La proteina del siero del latte ha un profilo aminoacidico completo e un assorbimento rapido, il che la " +
      "rende comoda per raggiungere la quota proteica giornaliera quando il cibo solido non basta. Non esiste " +
      "un'urgenza di assunzione entro 30 minuti dall'allenamento: la sintesi proteica muscolare resta elevata per " +
      "diverse ore, quindi il totale proteico della giornata conta più del timing preciso.",
  },
  {
    id: "omega3", name: "Omega 3 (EPA/DHA)", icon: "🐟",
    dose: "1-3 g/die di EPA+DHA combinati", timing: "Durante un pasto, per migliorare l'assorbimento dei grassi",
    body: "EPA e DHA sono acidi grassi essenziali con effetti documentati su infiammazione sistemica, salute " +
      "cardiovascolare e funzione cognitiva. Non hanno un effetto acuto sulla performance in allenamento: il " +
      "beneficio è cumulativo nel tempo, motivo per cui la costanza giornaliera conta più della singola dose.",
  },
  {
    id: "citrullina", name: "Citrullina Malato", icon: "💧",
    dose: "6-8 g/die", timing: "40-60 minuti prima dell'allenamento",
    body: "Aumenta la produzione di ossido nitrico favorendo la vasodilatazione e il flusso ematico verso i " +
      "muscoli attivi, con un possibile beneficio nelle serie ad alte ripetizioni e nella percezione di fatica " +
      "muscolare locale. L'effetto è più marcato in protocolli di volume alto (12+ ripetizioni) che nelle serie " +
      "pesanti a basse ripetizioni.",
  },
  {
    id: "bcaa", name: "BCAA", icon: "🧬",
    dose: "5-10 g durante o dopo l'allenamento", timing: "Utili soprattutto in allenamento a digiuno o in deficit calorico marcato",
    body: "I BCAA (leucina, isoleucina, valina) sono già presenti in buona quota nella whey e in qualsiasi fonte " +
      "proteica completa. Se l'apporto proteico giornaliero è già adeguato, il beneficio aggiuntivo è marginale. " +
      "Diventano più sensati per chi si allena a digiuno o segue una dieta molto ipocalorica con proteine ai " +
      "limiti minimi.",
  },
  {
    id: "beta_alanina", name: "Beta-Alanina", icon: "🔋",
    dose: "3-6 g/die, in dosi frazionate", timing: "Non serve pre-workout: conta l'accumulo cronico, non il timing del singolo giorno",
    body: "Aumenta nel tempo le riserve muscolari di carnosina, un tampone che rallenta l'acidificazione durante " +
      "sforzi intensi tra 1 e 4 minuti (es. serie da 8-15 ripetizioni). Il beneficio emerge dopo alcune settimane " +
      "di uso costante. Il formicolio cutaneo (parestesia) che alcuni avvertono è innocuo e dipende dalla dose " +
      "singola, non cumulativo.",
  },
  {
    id: "glutammina", name: "Glutammina", icon: "🌿",
    dose: "5 g/die", timing: "In qualsiasi momento della giornata",
    body: "Nell'atleta sano con un apporto proteico già sufficiente, l'evidenza a supporto di un effetto diretto " +
      "su crescita muscolare o recupero è debole. Il suo ruolo più solido riguarda la salute intestinale e il " +
      "supporto immunitario in periodi di carico di allenamento molto elevato, più che la performance in sé.",
  },
  {
    id: "zma", name: "ZMA (Zinco-Magnesio-B6)", icon: "💤",
    dose: "Una dose serale secondo etichetta", timing: "30-60 minuti prima di dormire, lontano dai pasti",
    body: "Ha senso soprattutto per chi ha un apporto di zinco o magnesio ai limiti minimi: in quel caso può " +
      "migliorare qualità del sonno e status minerale. In chi non è carente, l'evidenza di un effetto ormonale " +
      "diretto su testosterone o forza è scarsa: non è un anabolizzante naturale.",
  },
  {
    id: "multivitaminico", name: "Multivitaminico", icon: "🧪",
    dose: "1 dose secondo etichetta", timing: "Con un pasto, per migliorare l'assorbimento",
    body: "Funziona come rete di sicurezza contro micro-carenze, utile soprattutto in fase di deficit calorico " +
      "prolungato o con un'alimentazione poco varia. Non sostituisce una dieta varia ricca di verdura e frutta, " +
      "che resta la fonte primaria di micronutrienti e fitocomposti.",
  },
  {
    id: "collagene", name: "Collagene Idrolizzato", icon: "🦴",
    dose: "10-15 g/die", timing: "Idealmente con Vitamina C, 30-60 minuti prima di attività che stressano i tendini",
    body: "Alcuni studi preliminari mostrano un possibile beneficio sulla salute di tendini e articolazioni quando " +
      "l'assunzione precede un carico meccanico specifico. L'evidenza è ancora meno solida rispetto a creatina o " +
      "proteine, ma il profilo di sicurezza è molto buono.",
  },
  {
    id: "ashwagandha", name: "Ashwagandha", icon: "🌱",
    dose: "300-600 mg di estratto standardizzato", timing: "Con un pasto, con costanza quotidiana",
    body: "Diversi studi mostrano una riduzione percepita dello stress e, in alcuni casi, un lieve incremento di " +
      "forza o testosterone. La letteratura è in crescita ma non ancora definitiva quanto quella su creatina o " +
      "caffeina: non sostituisce la gestione di sonno e stress, che restano le leve principali.",
  },
  {
    id: "melatonina", name: "Melatonina", icon: "🌙",
    dose: "0.5-3 mg", timing: "30-60 minuti prima di dormire",
    body: "Serve soprattutto a risincronizzare il ritmo circadiano (jet lag, turni di lavoro, orari irregolari), " +
      "più che a sedare. Dosi basse sono spesso efficaci quanto dosi alte, con meno effetto di intontimento al " +
      "risveglio: non è un sonnifero nel senso classico del termine.",
  },
  {
    id: "elettroliti", name: "Elettroliti / Sali Minerali", icon: "🧂",
    dose: "Variabile in base a sudorazione, clima e durata dello sforzo", timing: "Durante sedute lunghe o con sudorazione abbondante",
    body: "Utili a prevenire crampi e cali di performance in sedute prolungate o in ambienti caldi, dove la " +
      "perdita di sodio e altri minerali con il sudore è significativa. Per sedute brevi in ambienti freschi " +
      "l'acqua da sola è quasi sempre sufficiente.",
  },
  {
    id: "vitamina_d", name: "Vitamina D3", icon: "🌤️",
    dose: "1.000-2.000 UI/die (dose più alta se carenza accertata)", timing: "Con un pasto contenente grassi, per migliorarne l'assorbimento",
    body: "Fondamentale per la salute ossea, la funzione immunitaria e, indirettamente, per la performance: " +
      "la carenza è molto comune nei mesi invernali e in chi si allena prevalentemente al chiuso. Un dosaggio " +
      "del sangue prima di integrare aiuta a capire la dose realmente necessaria, invece di andare a caso.",
  },
  {
    id: "magnesio", name: "Magnesio", icon: "🌾",
    dose: "300-400 mg/die (forme come bisglicinato o citrato assorbite meglio)", timing: "Alla sera, lontano da caffè e fibre in eccesso",
    body: "Coinvolto in centinaia di reazioni enzimatiche, incluso il rilassamento muscolare e la qualità del " +
      "sonno. Molte diete moderne ne forniscono meno del necessario. Le forme ossido/solfato sono economiche " +
      "ma assorbite peggio e più lassative; bisglicinato e citrato sono generalmente meglio tollerati.",
  },
  {
    id: "hmb", name: "HMB", icon: "🧱",
    dose: "3 g/die, suddivisi in più dosi", timing: "Distribuito durante la giornata, con costanza quotidiana",
    body: "Metabolita della leucina studiato per il suo possibile effetto anti-catabolico, soprattutto in fase " +
      "di deficit calorico marcato o in soggetti non allenati. Nell'atleta già ben allenato con proteine " +
      "adeguate, il beneficio aggiuntivo rispetto alla sola dieta è modesto.",
  },
  {
    id: "taurina", name: "Taurina", icon: "🐂",
    dose: "1-3 g/die", timing: "Pre-workout o con i pasti",
    body: "Amminoacido coinvolto nella regolazione cellulare e nella contrazione muscolare, spesso presente " +
      "negli energy drink insieme alla caffeina. Le evidenze su un effetto ergogenico diretto sono meno solide " +
      "rispetto a creatina o caffeina, ma il profilo di sicurezza alle dosi comuni è buono.",
  },
  {
    id: "curcuma", name: "Curcuma (Curcumina)", icon: "🟠",
    dose: "500-1.000 mg/die di curcumina, idealmente con piperina per l'assorbimento", timing: "Con un pasto",
    body: "Composto con proprietà antinfiammatorie studiate soprattutto per il recupero articolare e la " +
      "gestione dell'infiammazione da sovraccarico. Da solo è assorbito molto male dall'intestino: la piperina " +
      "(estratto di pepe nero) ne aumenta significativamente la biodisponibilità.",
  },
  {
    id: "proteine_vegetali", name: "Proteine Vegetali (pisello/riso)", icon: "🌱",
    dose: "20-30 g per porzione, come le proteine animali", timing: "In qualsiasi momento, come qualsiasi fonte proteica",
    body: "Alternativa per chi segue una dieta vegetale o ha intolleranze al lattosio: da sola la proteina di " +
      "riso è carente di lisina e quella di pisello di metionina, ma combinate (come in molti prodotti in " +
      "commercio) offrono un profilo aminoacidico completo, paragonabile a whey o uova.",
  },
  {
    id: "probiotici", name: "Probiotici", icon: "🦠",
    dose: "Variabile per ceppo, in genere miliardi di UFC/die indicati in etichetta", timing: "A stomaco vuoto o come da indicazioni del prodotto",
    body: "Supportano l'equilibrio della flora intestinale, utile soprattutto dopo cicli di antibiotici, in " +
      "periodi di stress digestivo o con diete molto ricche di proteine. L'effetto è specifico per ceppo: non " +
      "tutti i probiotici fanno la stessa cosa, e la costanza d'uso conta più della singola assunzione.",
  },
  {
    id: "tongkat_ali", name: "Tongkat Ali", icon: "🌳",
    dose: "200-400 mg/die di estratto standardizzato (es. 100:1)", timing: "Al mattino, con costanza per 4-8 settimane",
    body: "Erba adattogena studiata soprattutto per un possibile aumento del testosterone libero in soggetti " +
      "con livelli bassi o sotto stress cronico, e per un effetto positivo su libido e umore. È un integratore " +
      "ormonalmente attivo poco conosciuto fuori dagli ambienti più specializzati: proprio per questo va " +
      "usato con consapevolezza, verificando la qualità dell'estratto e, idealmente, i propri valori ormonali " +
      "prima e dopo un ciclo d'uso.",
  },
  {
    id: "fadogia", name: "Fadogia Agrestis", icon: "🌿",
    dose: "600 mg/die di estratto (dosaggi più alti non necessariamente più efficaci)", timing: "Al mattino, cicli di 8-12 settimane con pausa",
    body: "Pianta africana diventata popolare online per un possibile effetto pro-testosterone, ma la " +
      "letteratura scientifica su esseri umani è ancora molto limitata: la maggior parte dei dati viene da " +
      "studi animali. È uno degli integratori più \"underground\" in circolazione: l'entusiasmo online supera " +
      "di gran lunga l'evidenza reale, motivo in più per non usarlo a cuor leggero e senza controlli periodici.",
  },
  {
    id: "ecdisterone", name: "Ecdisterone (Beta-Ecdisterone)", icon: "🦗",
    dose: "500-1.000 mg/die", timing: "Con i pasti, in cicli di alcune settimane",
    body: "Fitoecdisteroide estratto da piante come la Spinacia o la Cyanotis, studiato in alcuni lavori per un " +
      "possibile effetto anabolico non ormonale (non altera l'asse testosterone-estrogeni come gli steroidi " +
      "anabolizzanti). I risultati preliminari su forza e massa magra sono interessanti ma provengono da pochi " +
      "studi: resta un composto di nicchia, poco conosciuto rispetto a creatina o proteine, da trattare come " +
      "sperimentale più che come un pilastro consolidato.",
  },
  {
    id: "rodiola", name: "Rhodiola Rosea", icon: "🌸",
    dose: "200-400 mg/die di estratto standardizzato (3% rosavine, 1% salidroside)", timing: "Al mattino, a stomaco vuoto",
    body: "Adattogeno usato tradizionalmente contro la fatica fisica e mentale da stress prolungato. Alcuni " +
      "studi mostrano un miglioramento della resistenza percepita e della lucidità mentale in condizioni di " +
      "affaticamento, con un profilo di sicurezza favorevole. È meno conosciuta di ashwagandha ma altrettanto " +
      "interessante per chi gestisce carichi di lavoro e allenamento elevati insieme.",
  },
  {
    id: "lions_mane", name: "Lion's Mane (Hericium Erinaceus)", icon: "🦁",
    dose: "500-1.000 mg/die di estratto", timing: "Con i pasti, con costanza per diverse settimane",
    body: "Fungo medicinale studiato per un possibile supporto alla crescita e alla manutenzione dei neuroni " +
      "(tramite la stimolazione del fattore di crescita nervoso, NGF), con interesse crescente per la lucidità " +
      "mentale e la salute cognitiva a lungo termine. Gli studi sull'uomo sono ancora pochi ma promettenti: " +
      "un integratore di nicchia, tipico del mondo della longevità più che di quello sportivo classico.",
  },
  {
    id: "urolitina_a", name: "Urolitina A", icon: "🍇",
    dose: "500-1.000 mg/die", timing: "In qualsiasi momento della giornata, con costanza",
    body: "Metabolita prodotto dai batteri intestinali a partire da polifenoli del melograno e delle noci: " +
      "molte persone, però, non hanno i batteri giusti per produrne abbastanza da soli, da cui l'interesse per " +
      "l'integrazione diretta. Studiata per il suo ruolo nella mitofagia (il \"riciclo\" dei mitocondri " +
      "danneggiati nelle cellule), è uno dei composti più discussi nel mondo della longevità e del recupero " +
      "muscolare legato all'età, anche se resta poco conosciuto fuori da quell'ambito.",
  },
  {
    id: "nmn", name: "NMN (Nicotinamide Mononucleotide)", icon: "🧬",
    dose: "250-500 mg/die", timing: "Al mattino, a stomaco vuoto",
    body: "Precursore del NAD+, una molecola centrale nella produzione di energia cellulare che diminuisce " +
      "naturalmente con l'età. L'integrazione con NMN (o il suo parente NR, Nicotinamide Riboside) è uno dei " +
      "temi più caldi nella ricerca sulla longevità, ma gli studi solidi su esseri umani sono ancora limitati " +
      "rispetto all'entusiasmo mediatico: promettente, ma da considerare sperimentale.",
  },
  {
    id: "glicina", name: "Glicina", icon: "💤",
    dose: "3 g/die", timing: "30-60 minuti prima di dormire",
    body: "Amminoacido semplice ed economico, tra i meno \"di moda\" ma con alcune delle evidenze più solide " +
      "sul miglioramento soggettivo della qualità del sonno profondo, probabilmente tramite un lieve " +
      "abbassamento della temperatura corporea centrale. Spesso trascurato rispetto a melatonina o magnesio, " +
      "merita più attenzione di quanta ne riceva di solito.",
  },
  {
    id: "berberina", name: "Berberina", icon: "🌼",
    dose: "500 mg, 2-3 volte al giorno con i pasti principali", timing: "Con i pasti più ricchi di carboidrati",
    body: "Composto vegetale studiato per il suo effetto sulla sensibilità insulinica e sulla gestione della " +
      "glicemia post-prandiale, con alcuni lavori che la paragonano (con cautela) a farmaci di prima linea per " +
      "il controllo glicemico. Molto meno nota di creatina o proteine ma potenzialmente rilevante per chi " +
      "gestisce composizione corporea e salute metabolica insieme; può interagire con altri farmaci, quindi " +
      "va usata con attenzione se già in terapia.",
  },
  {
    id: "astaxantina", name: "Astaxantina", icon: "🦐",
    dose: "4-12 mg/die", timing: "Con un pasto contenente grassi",
    body: "Carotenoide antiossidante estratto da alghe e presente nel salmone selvatico, studiato per la " +
      "protezione dallo stress ossidativo indotto dall'esercizio intenso e per un possibile supporto alla " +
      "salute della pelle e degli occhi. Resta un integratore di nicchia rispetto ai classici da palestra, ma " +
      "con un profilo interessante per chi si allena molto e pensa anche al recupero a lungo termine, non solo " +
      "alla prestazione immediata.",
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

/* Prodotti confezionati plausibili per simulare una scansione con codice a
   barre: ogni scansione arricchisce il catalogo condiviso, come farebbe un
   database crowdsourced tipo MyFitnessPal. */
const SCAN_POOL = [
  { base: "Yogurt Bianco Intero", kcal: 66, p: 3.5, c: 4.7, f: 3.6 },
  { base: "Fette Biscottate Integrali", kcal: 400, p: 10, c: 72, f: 8 },
  { base: "Barretta Proteica", kcal: 380, p: 30, c: 35, f: 12 },
  { base: "Hummus di Ceci", kcal: 166, p: 8, c: 14, f: 9.6 },
  { base: "Gallette di Riso Integrale", kcal: 387, p: 8, c: 82, f: 3 },
  { base: "Formaggio Spalmabile Light", kcal: 155, p: 11, c: 4, f: 11 },
  { base: "Cracker Integrali", kcal: 421, p: 10, c: 68, f: 12 },
  { base: "Latte Parzialmente Scremato", kcal: 46, p: 3.3, c: 4.8, f: 1.5 },
];

function NutritionTabs({
  accent, accentSoft, accentText, target, mealsBySlot, foods, mealGuide, substitutions,
  onAddFood, onOpenScanner, onOpenPhoto, onAddCustomFood, onCopyYesterday, onShoppingList,
  onGenerateSimilar, targetOn, targetOff, onSetTargetOn, onSetTargetOff,
  isTrainingDay, onToggleTrainingDay, waterTarget, onSetWaterTarget, fullAccess, onUpgrade,
  userPlan, gender, waterMl, digestValue, onDigestChange,
}) {
  const [tab, setTab] = useState("diary");        // diary è il default
  const [openSlot, setOpenSlot] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [grams, setGrams] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [manualMacros, setManualMacros] = useState({ kcal: "", p: "", c: "", f: "" });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods.slice(0, 10);
    return foods.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, foods]);

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

  /* Scansione codice a barre simulata: pesca un prodotto plausibile e lo
     aggiunge subito al catalogo condiviso, pronto per le ricerche future. */
  const handleScan = (slotId) => {
    const base = SCAN_POOL[Math.floor(Math.random() * SCAN_POOL.length)];
    const food = { name: `${base.base} (scansionato)`, kcal: base.kcal, p: base.p, c: base.c, f: base.f };
    onAddCustomFood && onAddCustomFood(food);
    setSelected(food); setQuery(food.name); setDropOpen(false);
    onOpenScanner && onOpenScanner(slotId);
  };

  /* Foto del piatto: stima AI plausibile, aggiunta anch'essa al catalogo. */
  const handlePhotoAdd = (slotId) => {
    const food = { name: "Piatto fotografato (stima AI)", kcal: 420, p: 28, c: 45, f: 14 };
    onAddCustomFood && onAddCustomFood(food);
    setSelected(food); setQuery(food.name); setDropOpen(false);
    onOpenPhoto && onOpenPhoto(slotId);
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
    onAddCustomFood && onAddCustomFood(food);
    setSelected(food); setManualAddOpen(false); setDropOpen(false);
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {[["diary", "Diario Libero"], ["targets", "I Miei Target"], ["plan", "Dieta Tipo"], ["subs", "Sostituzioni"]].map(([id, lab]) => {
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
                      {items.map((i, k) => (
                        <div key={`${i.name}-${k}`} className="inner flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="text-sm truncate" style={{ color: "var(--ink)" }}>{i.name}</span>
                          <span className="meta font-data text-xs shrink-0">{i.grams} g · {i.kcal} kcal</span>
                        </div>
                      ))}
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
                        {dropOpen && !selected && (
                          <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl overflow-hidden"
                               style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)",
                                        boxShadow: "0 16px 40px rgba(0,0,0,0.16)", maxHeight: 288, overflowY: "auto" }}>
                            {filtered.map((f) => (
                              <button key={f.name}
                                onMouseDown={() => { setSelected(f); setQuery(f.name); setDropOpen(false); }}
                                className="search-strong w-full text-left px-4 py-3"
                                style={{ borderBottom: "1px solid var(--line)" }}>
                                {f.name}
                              </button>
                            ))}
                            {filtered.length === 0 && !manualAddOpen && (
                              <div className="px-4 py-3">
                                <p className="meta text-sm mb-2">Nessun risultato per "{query}".</p>
                                <button onMouseDown={() => setManualAddOpen(true)}
                                  className="text-sm rounded-full px-3.5 py-2"
                                  style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
                                  ➕ Aggiungi "{query}" al catalogo
                                </button>
                              </div>
                            )}
                            {manualAddOpen && (
                              <div className="p-4">
                                <p className="label mb-2">Nuovo alimento (valori per 100 g a crudo)</p>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                  {[["kcal", "Kcal"], ["p", "Proteine g"], ["c", "Carbo g"], ["f", "Grassi g"]].map(([k, lab]) => (
                                    <input key={k} type="number" min="0" value={manualMacros[k]}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onChange={(e) => setManualMacros((m) => ({ ...m, [k]: e.target.value }))}
                                      placeholder={lab} className="input px-3 py-2.5 text-sm" aria-label={lab} />
                                  ))}
                                </div>
                                <button onMouseDown={saveManualFood}
                                  className="w-full rounded-full px-4 py-2.5 text-sm"
                                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
                                  Salva nel catalogo e usa
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mb-3">
                        <input type="number" min="1" inputMode="numeric" value={grams}
                          onChange={(e) => setGrams(e.target.value)} placeholder="Grammi (a crudo)"
                          className="input flex-1 min-w-0 px-4 py-3 font-data text-sm"
                          aria-label="Grammi a crudo" />
                        <button onClick={() => handleScan(slot.id)} aria-label="Codice a barre"
                          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform active:scale-95"
                          style={{ backgroundColor: "#111111" }}>
                          <Barcode size={19} style={{ color: accent }} />
                        </button>
                        <button onClick={() => handlePhotoAdd(slot.id)} aria-label="Fotografa il piatto"
                          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform active:scale-95"
                          style={{ backgroundColor: "#111111" }}>
                          <Camera size={19} style={{ color: accent }} />
                        </button>
                      </div>

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
                        <button onClick={() => { if (preview) { onAddFood(slot.id, preview); reset(); setOpenSlot(null); } }}
                          disabled={!preview}
                          className="flex-1 rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40"
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

        <MicronutrientGrid mealsBySlot={mealsBySlot} userPlan={userPlan} gender={gender} onUpgrade={onUpgrade} accent={accent} waterMl={waterMl} />

        {!fullAccess && <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
          text="Registrare cosa mangi è il primo passo. Il secondo è sapere se sta davvero funzionando: fatti aiutare da un professionista del settore che legge il tuo diario e aggiusta il piano per te." />}

        {/* ultima cosa del Diario Libero: check-in digestivo, facoltativo */}
        <div className="card mt-4">
          <p className="label mb-1">Ultima cosa</p>
          <EmojiRating label="Digestione / Gonfiore" icon="🤢" emojis={DIGEST_EMOJIS}
            value={digestValue} onChange={onDigestChange} />
        </div>
        </div>
      )}

      {/* ---------------- I MIEI TARGET ---------------- */}
      {tab === "targets" && (
        <NutritionTargetsPanel accent={accent} accentSoft={accentSoft} accentText={accentText}
          targetOn={targetOn} targetOff={targetOff} onSetTargetOn={onSetTargetOn} onSetTargetOff={onSetTargetOff}
          isTrainingDay={isTrainingDay} onToggleTrainingDay={onToggleTrainingDay}
          waterTarget={waterTarget} onSetWaterTarget={onSetWaterTarget}
          isPro={fullAccess} onUpgrade={onUpgrade} />
      )}

      {/* ---------------- DIETA TIPO ---------------- */}
      {tab === "plan" && (
        <div className="spring-in">
          {!fullAccess ? (
            <LockedPanel onUpgrade={onUpgrade} accent={accent}
              text="La dieta su misura è parte del Full Coaching: fatti aiutare da un professionista del settore che la scrive sui tuoi macro reali." />
          ) : (
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
          )}
        </div>
      )}

      {/* ---------------- SOSTITUZIONI + AI (solo Full Coaching) ---------------- */}
      {tab === "subs" && (
        <div className="spring-in">
          {!fullAccess ? (
            <LockedPanel onUpgrade={onUpgrade} accent={accent}
              text="Le sostituzioni intelligenti e il generatore AI sono parte del Full Coaching: fatti aiutare da un professionista del settore che verifica che ogni scambio rispetti davvero i tuoi macro." />
          ) : (
            <SubsPanel substitutions={substitutions} accent={accent} accentSoft={accentSoft}
                       accentText={accentText} onGenerateSimilar={onGenerateSimilar} />
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
        <button onClick={onUpgrade} className="rounded-full px-5 py-2.5 text-sm shrink-0 transition-transform active:scale-95"
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

function SubsPanel({ substitutions, accent, accentSoft, accentText, onGenerateSimilar }) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    if (source.trim().length < 3) { setErr("Scrivi il nome di un alimento."); return; }
    setErr(""); setLoading(true); setResults(null);
    try { setResults((await onGenerateSimilar(source.trim())) || []); }
    catch { setErr("Non sono riuscito a generare le alternative. Riprova."); }
    finally { setLoading(false); }
  };

  return (
    <div className="spring-in">
      <div className="card mb-5">
        <p className="label mb-1">Intelligenza artificiale</p>
        <p className="h1 mb-1">Genera alimento simile</p>
        <p className="body mb-4">
          Scrivi cosa ti manca o non ti va: ti propongo alternative con lo stesso profilo
          nutrizionale e la grammatura già corretta per pareggiare i macro.
        </p>

        <div className="flex gap-2 mb-3">
          <input type="text" value={source}
            onChange={(e) => { setSource(e.target.value); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
            placeholder="es. 150 g di petto di pollo"
            className="input flex-1 min-w-0 px-4 py-3 text-sm" aria-label="Alimento da sostituire" />
          <button onClick={run} disabled={loading}
            className="shrink-0 px-4 rounded-xl flex items-center gap-2 text-sm transition-transform active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
            <Sparkles size={15} style={{ color: accent }} />
            Genera
          </button>
        </div>

        {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}

        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 62 }} />)}
          </div>
        )}

        {results && !loading && (
          <div className="space-y-2">
            {results.length === 0 && <p className="body">Nessuna alternativa sensata per questo alimento.</p>}
            {results.map((r) => (
              <div key={r.name} className="inner px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 500 }}>{r.name}</span>
                  <span className="font-data text-xs shrink-0" style={{ color: accentText, fontWeight: 700 }}>{r.grams} g</span>
                </div>
                <div className="flex gap-3 mt-1.5">
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.kcal.base, fontWeight: 700 }}>{r.kcal} kcal</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.p.base, fontWeight: 700 }}>P {r.p}</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.c.base, fontWeight: 700 }}>C {r.c}</span>
                  <span className="font-data text-xs" style={{ color: MACRO_COLORS.f.base, fontWeight: 700 }}>G {r.f}</span>
                </div>
                {r.note && <p className="meta mt-1.5 leading-relaxed text-xs">{r.note}</p>}
              </div>
            ))}
            <p className="meta mt-2 leading-relaxed" style={{ fontSize: "0.68rem" }}>
              Le alternative pareggiano i macro, non i micronutrienti: se un alimento è nel piano per
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
      {/* toggle di test: simula un giorno ON o OFF per vedere il target cambiare da solo */}
      <div className="card mb-4">
        <p className="label mb-1">Oggi</p>
        <div className="flex items-center justify-between gap-3">
          <p className="h1" style={{ margin: 0 }}>
            {isTrainingDay ? "🏋️ Giorno ON — Allenamento" : "🧘 Giorno OFF — Riposo"}
          </p>
          <button onClick={onToggleTrainingDay}
                  className="shrink-0 rounded-full px-3.5 py-2 text-xs"
                  style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 700 }}>
            Simula {isTrainingDay ? "OFF" : "ON"}
          </button>
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
            className="shrink-0 rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98]"
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
            className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98]"
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
            className="w-full rounded-full px-4 py-3 text-sm transition-transform active:scale-[0.98] disabled:opacity-40"
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

function SupplementsPanel({ accent, accentSoft, accentText, isPro, isPaid, isTrainingDay, onUpgrade, onCoachSync }) {
  return isPro
    ? <SupplementsPlanLocked accent={accent} accentSoft={accentSoft} accentText={accentText} onCoachSync={onCoachSync} />
    : <SupplementsFreeDiary accent={accent} accentSoft={accentSoft} accentText={accentText} isPaid={isPaid} isTrainingDay={isTrainingDay} onUpgrade={onUpgrade} onCoachSync={onCoachSync} />;
}

function SupplementsFreeDiary({ accent, accentSoft, accentText, isPaid, isTrainingDay, onUpgrade, onCoachSync }) {
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
     una lista più lunga non guadagna più punti di chi ne ha una più corta. */
  const allEntries = Object.values(entries).flat();
  const totalEntries = allEntries.length;
  const takenEntries = allEntries.filter((e) => e.taken).length;
  const allDone = totalEntries > 0 && takenEntries === totalEntries;

  return (
    <div className="spring-in">
      {/* stato di completamento: XP solo se si spunta tutto il protocollo di oggi */}
      <div className="card mb-4">
        <p className="label mb-1">Il tuo protocollo libero</p>
        <p className="h1 mb-1">Costruiscilo tu, momento per momento</p>
        <p className="body mb-4">
          Aggiungi i tuoi integratori qui sotto, per ogni momento della giornata. Gli XP si sbloccano solo
          completando <b>tutto</b> quello che hai programmato per oggi, così chi costruisce una lista più
          lunga non guadagna più punti di chi ne ha una più corta.
        </p>
        <div className="inner px-4 py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
            {takenEntries} / {totalEntries} completati oggi
          </span>
          <span style={{ color: allDone ? accentText : "var(--ink-2)", fontWeight: 700 }}>
            {totalEntries === 0 ? "Aggiungi il tuo primo integratore" : allDone ? "+50 XP sbloccati" : "+50 XP se completi tutto"}
          </span>
        </div>
      </div>

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

      {isPaid ? (
        <SupplementWikiBrowser accent={accent} />
      ) : (
        <LockedPanel onUpgrade={onUpgrade} accent={accent}
          text="La Wiki Integratori è disponibile dagli abbonamenti a pagamento, a partire da 5€/mese: fatti aiutare da un professionista del settore a capire cosa vale davvero la pena assumere." />
      )}

      <UpsellFooter accent={accent} accentSoft={accentSoft} accentText={accentText} onUpgrade={onUpgrade}
        text="Sai quali integratori scegliere, con quali dosi e in che momento assumerli? Fatti aiutare da un professionista del settore che ti scrive un protocollo su misura anche su questo: vedi gli abbonamenti per iniziare." />
    </div>
  );
}

/* Wiki integratori condivisa: cercabile, usata sia dal profilo FREE che PRO,
   così ci si può informare in entrambi i piani allo stesso modo. */
function SupplementWikiBrowser({ accent }) {
  const [openWiki, setOpenWiki] = useState(null);
  const [wikiQuery, setWikiQuery] = useState("");
  const filteredWiki = SUPP_WIKI.filter((w) => w.name.toLowerCase().includes(wikiQuery.trim().toLowerCase()));

  return (
    <div className="card">
      <p className="label mb-1">Wiki integratori</p>
      <p className="h1 mb-3">Cosa sappiamo davvero</p>
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
        {filteredWiki.map((w) => {
          const on = openWiki === w.id;
          return (
            <button key={w.id} onClick={() => setOpenWiki(on ? null : w.id)}
              className="rounded-full px-3.5 py-2 text-sm flex items-center gap-1.5 transition-all duration-300"
              style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                        : { backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <span aria-hidden="true" style={{ filter: "saturate(0.7) brightness(1.15)" }}>{w.icon}</span>{w.name}
            </button>
          );
        })}
      </div>

      {SUPP_WIKI.filter((w) => w.id === openWiki).map((w) => (
        <article key={w.id} className="inner spring-in p-4 mt-4">
          <p className="h2 flex items-center gap-2 mb-2">
            <span aria-hidden="true" style={{ filter: "saturate(0.65) contrast(0.92)" }}>{w.icon}</span>{w.name}
          </p>
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
          <p className="body">{w.body}</p>
        </article>
      ))}
    </div>
  );
}

function SupplementsPlanLocked({ accent, accentSoft, accentText, onCoachSync }) {
  const [checked, setChecked] = useState({});
  const toggle = (momentId, i) => {
    const key = `${momentId}-${i}`;
    setChecked((c) => ({ ...c, [key]: !c[key] }));
    onCoachSync && onCoachSync({ type: "supplement", momentId, i });
  };
  const totalItems = SUPP_MOMENTS.reduce((n, m) => n + SUPP_PLAN_PRO[m.id].length, 0);
  const doneItems = Object.values(checked).filter(Boolean).length;
  const allDone = totalItems > 0 && doneItems === totalItems;
  const xpEarned = allDone ? 50 : 0;

  return (
    <div className="spring-in">
      <div className="card mb-5">
        <p className="label mb-1">Piano scritto dal coach</p>
        <p className="h1 mb-1">Il tuo protocollo di integrazione</p>
        <p className="body mb-4">
          Scritto sui tuoi dati dal tuo coach: dosi e timing non sono modificabili da qui. Spunta ogni
          voce quando l'assumi: gli XP si sbloccano solo completando <b>tutto</b> il protocollo del giorno,
          così chi ha più integratori prescritti non guadagna più punti di chi ne ha meno.
        </p>
        <div className="inner px-4 py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>
            {doneItems} / {totalItems} completate oggi
          </span>
          <span className="font-data text-sm" style={{ color: allDone ? accentText : "var(--ink-2)", fontWeight: 700 }}>
            {allDone ? `+${xpEarned} XP sbloccati` : `+50 XP se completi tutto`}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {SUPP_MOMENTS.map((m) => (
          <div key={m.id} className="card">
            <p className="h2 flex items-center gap-2.5 mb-3">
              <span className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 30, height: 30, backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
                <span style={{ fontSize: "0.95rem", lineHeight: 1, filter: "saturate(0.65) contrast(0.92)" }} aria-hidden="true">{m.icon}</span>
              </span>
              <span>{m.label}</span>
            </p>
            <div className="space-y-1.5">
              {SUPP_PLAN_PRO[m.id].map((it, i) => {
                const key = `${m.id}-${i}`;
                const done = !!checked[key];
                return (
                  <button key={key} onClick={() => toggle(m.id, i)}
                    className="inner w-full flex items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]">
                    {done ? <CheckCircle2 size={18} style={{ color: accentText }} className="shrink-0" />
                          : <span className="shrink-0 rounded-full" style={{ width: 17, height: 17, border: "1.5px solid var(--ink-2)" }} />}
                    <span className="min-w-0 flex-1">
                      <span className="text-sm block truncate" style={{ color: "var(--ink)", fontWeight: 500,
                              textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
                        {it.name} · {it.dose}
                      </span>
                      <span className="meta block text-xs mt-0.5">{it.note}</span>
                    </span>
                    <Lock size={12} style={{ color: "var(--ink-2)" }} className="shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <SupplementWikiBrowser accent={accent} />
      </div>
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
];

/* Database per categoria macro (valori generici per 100 g), usato dal generatore
   di alternative: sostituisce sempre entro la stessa categoria (proteica ↔
   proteica, carboidrato ↔ carboidrato, lipidica ↔ lipidica). */
/* Database alimenti "da crudo", organizzato per categoria macro, con macros
   reali per 100g: base italiana pronta per la ricerca nel generatore di
   alternative e nel diario. */
const PROTEIN_FOODS = [
  { name: "Petto di Pollo", kcal: 110, p: 23, c: 0, f: 2 },
  { name: "Fesa di Tacchino", kcal: 104, p: 24, c: 0, f: 1 },
  { name: "Merluzzo", kcal: 82, p: 18, c: 0, f: 0.7 },
  { name: "Orata", kcal: 121, p: 20, c: 0, f: 4.5 },
  { name: "Uova Intere", kcal: 143, p: 13, c: 1, f: 10 },
  { name: "Albume d'Uovo", kcal: 52, p: 11, c: 0.7, f: 0.2 },
  { name: "Salmone Fresco", kcal: 185, p: 20, c: 0, f: 12 },
  { name: "Yogurt Greco 0%", kcal: 57, p: 10, c: 4, f: 0 },
  { name: "Bresaola", kcal: 151, p: 32, c: 0.4, f: 2.6 },
  { name: "Tonno al Naturale", kcal: 116, p: 26, c: 0, f: 1 },
  { name: "Manzo Magro (scottona)", kcal: 137, p: 21, c: 0, f: 5.5 },
  { name: "Lonza di Maiale", kcal: 143, p: 21, c: 0, f: 6 },
  { name: "Fiocchi di Latte", kcal: 98, p: 11, c: 3.4, f: 4.3 },
  { name: "Ceci Secchi", kcal: 364, p: 19, c: 61, f: 6 },
  { name: "Lenticchie Secche", kcal: 352, p: 24, c: 60, f: 1 },
  { name: "Tofu", kcal: 76, p: 8, c: 1.9, f: 4.8 },
];

const CARB_FOODS = [
  { name: "Riso Basmati", kcal: 350, p: 8, c: 78, f: 1 },
  { name: "Pasta", kcal: 353, p: 12, c: 71, f: 1.5 },
  { name: "Patate", kcal: 77, p: 2, c: 17, f: 0.1 },
  { name: "Pane Integrale", kcal: 247, p: 13, c: 41, f: 3.4 },
  { name: "Pane Comune", kcal: 289, p: 8, c: 59, f: 1 },
  { name: "Avena in Fiocchi", kcal: 370, p: 13, c: 60, f: 7 },
  { name: "Quinoa", kcal: 368, p: 14, c: 64, f: 6 },
  { name: "Farro", kcal: 335, p: 15, c: 67, f: 2.5 },
  { name: "Cous Cous", kcal: 376, p: 13, c: 77, f: 1 },
  { name: "Banana", kcal: 89, p: 1, c: 23, f: 0 },
  { name: "Piselli", kcal: 81, p: 5, c: 14, f: 0.4 },
  { name: "Mais Dolce", kcal: 86, p: 3.2, c: 19, f: 1.2 },
];

const FAT_FOODS = [
  { name: "Olio Extravergine d'Oliva", kcal: 899, p: 0, c: 0, f: 100 },
  { name: "Mandorle", kcal: 603, p: 22, c: 4, f: 55 },
  { name: "Burro d'Arachidi", kcal: 588, p: 25, c: 20, f: 50 },
  { name: "Avocado", kcal: 160, p: 2, c: 9, f: 15 },
  { name: "Noci", kcal: 654, p: 15, c: 14, f: 65 },
  { name: "Noci di Macadamia", kcal: 718, p: 8, c: 14, f: 76 },
  { name: "Semi di Chia", kcal: 486, p: 17, c: 42, f: 31 },
  { name: "Semi di Lino", kcal: 534, p: 18, c: 29, f: 42 },
  { name: "Burro", kcal: 717, p: 0.9, c: 0.1, f: 81 },
  { name: "Cocco Essiccato", kcal: 660, p: 7, c: 24, f: 65 },
];

const ALL_FOODS_DB = [...PROTEIN_FOODS, ...CARB_FOODS, ...FAT_FOODS];

/* Vista organizzata per categoria, pronta per una futura UI a schede nella
   ricerca alimenti (Carboidrati / Proteine / Grassi). */
const FOOD_DB = { Carboidrati: CARB_FOODS, Proteine: PROTEIN_FOODS, Grassi: FAT_FOODS };


/* Categoria dominante di un alimento in base a quale macro pesa di più in kcal. */
function categorizeMacro(food) {
  const pk = food.p * 4, ck = food.c * 4, fk = food.f * 9;
  if (pk >= ck && pk >= fk) return "p";
  if (ck >= pk && ck >= fk) return "c";
  return "f";
}

function findFoodInText(text) {
  const t = text.toLowerCase();
  let best = null, bestLen = 0;
  for (const f of ALL_FOODS_DB) {
    const nameLower = f.name.toLowerCase();
    if (t.includes(nameLower) && nameLower.length > bestLen) { best = f; bestLen = nameLower.length; }
  }
  return best;
}

function guessCategoryFromKeywords(text) {
  const t = text.toLowerCase();
  if (/pollo|tacchino|pesce|merluzzo|salmone|tonno|uov|carne|manzo|maiale|yogurt|bresaola|protein/.test(t)) return "p";
  if (/riso|pasta|pane|patat|cereal|avena|farro|quinoa|banana|carboidrat/.test(t)) return "c";
  if (/olio|burro|mandorl|noci|avocado|frutta secca|grass/.test(t)) return "f";
  return null;
}

function parseGrams(text) {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i) || text.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return 100;
  return Math.max(1, parseFloat(m[1].replace(",", ".")));
}

/* Genera alternative sempre entro la stessa categoria macro dell'alimento
   richiesto (proteica→proteica, carbo→carbo, lipidica→lipidica), pareggiando
   la grammatura sulla quota del macro dominante. */
function generateSimilarFood(sourceText) {
  const grams = parseGrams(sourceText);
  const matched = findFoodInText(sourceText);
  const category = matched ? categorizeMacro(matched) : (guessCategoryFromKeywords(sourceText) || "p");

  const pool = category === "p" ? PROTEIN_FOODS : category === "c" ? CARB_FOODS : FAT_FOODS;
  const refFood = matched || pool[0];
  const alternatives = pool.filter((f) => f.name !== refFood.name).slice(0, 3);

  const dominantKey = category;
  const refDominantGrams = (refFood[dominantKey] * grams) / 100;

  return alternatives.map((alt) => {
    const altPer100Dominant = alt[dominantKey];
    const altGrams = altPer100Dominant > 0
      ? Math.max(5, Math.round((refDominantGrams / altPer100Dominant) * 100 / 5) * 5)
      : 100;
    const scale = altGrams / 100;
    const note = category === "p"
      ? `Stessa quota proteica (~${Math.round(refDominantGrams)} g), macro secondari leggermente diversi.`
      : category === "c"
      ? `Stessa quota di carboidrati (~${Math.round(refDominantGrams)} g), fibre e indice glicemico diversi.`
      : `Stessa quota di grassi (~${Math.round(refDominantGrams)} g), profilo di grassi (saturi/insaturi) diverso.`;
    return {
      name: alt.name, grams: altGrams,
      kcal: Math.round(alt.kcal * scale), p: Math.round(alt.p * scale),
      c: Math.round(alt.c * scale), f: Math.round(alt.f * scale), note,
    };
  });
}

const GUIDE = MEAL_SLOTS.map((_, i) => ({
  items: [{ name: F[i % F.length].name, grams: 80 + i * 10, kcal: 200 + i * 20 }],
  tot: { kcal: 300 + i * 30, p: 20 + i, c: 30 + i * 2, f: 8 },
}));

const SUBS = [
  { group: "Fonti di carboidrati", base: "70 g riso basmati", eq: ["70 g pasta", "280 g patate", "90 g pane integrale"] },
  { group: "Fonti proteiche magre", base: "150 g petto di pollo", eq: ["150 g tacchino", "3 uova intere", "180 g merluzzo"] },
  { group: "Fonti di grassi", base: "10 g olio EVO", eq: ["15 g mandorle", "15 g burro d'arachidi", "30 g avocado"] },
];

/* Wrapper di compatibilità per proposeReschedule: usa la nuova mappa
   anatomica (Adduttori, Gran Dorsale/Trapezio separati) della Matrice dei
   Volumi, appiattendo diretti + sinergici in un'unica lista. */
const MUSCLES_OF = (n) => {
  const { primary, secondary } = muscleMapFor(n);
  return [...primary, ...secondary];
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
  profileOverride,         // { name, nickname } dalla sessione reale, sostituisce i valori di preview
  supabase: supabaseProp,  // se passato insieme a userId, sostituisce scheda/target finti con quelli reali assegnati dal coach
  userId,
} = {}) {
  // Controlled/uncontrolled ibrido: se App.jsx passa le prop, questo componente
  // segue lo stato condiviso (tema/genere/piano); altrimenti resta autonomo
  // per continuare a funzionare come preview isolata (npm run dev su questo file).
  const isControlled = genderProp !== undefined;
  const [dark, setDark] = useState(darkProp ?? false);
  const [gender, setGender] = useState(genderProp ?? "M");
  const [planTier, setPlanTier] = useState(
    planProp === "full_coaching" ? "PRO" : planProp === "performance_pack" ? "BASE" : planProp === "free" ? "FREE" : "FREE"
  );
  useEffect(() => { if (darkProp !== undefined) setDark(darkProp); }, [darkProp]);
  useEffect(() => { if (genderProp !== undefined) setGender(genderProp); }, [genderProp]);
  useEffect(() => {
    if (planProp === undefined) return;
    setPlanTier(planProp === "full_coaching" ? "PRO" : planProp === "performance_pack" ? "BASE" : "FREE");
  }, [planProp]);
  const [meals, setMeals] = useState(
    MEAL_SLOTS.reduce((a, s) => ({ ...a, [s.id]: s.id === "colazione"
      ? [{ name: "Avena in Fiocchi", grams: 60, kcal: 222, p: 8, c: 36, f: 4 }] : [] }), {})
  );
  const [sets, setSets] = useState({});
  const [sleep, setSleep] = useState({ start: "23:30", end: "07:00", hours: 7.5 });
  const [steps, setSteps] = useState("6400");
  const [water, setWater] = useState(1500);
  const [autoSteps, setAutoSteps] = useState(false);
  const [isTrainingDay, setIsTrainingDay] = useState(true);
  const [targetOn, setTargetOn] = useState({ kcal: 3000, p: 200, c: 380, f: 75 });   // giorno ON (allenamento)
  const [targetOff, setTargetOff] = useState({ kcal: 2550, p: 200, c: 230, f: 85 }); // giorno OFF (riposo)
  const target = isTrainingDay ? targetOn : targetOff; // il target attivo "oggi" si sceglie da solo

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

  // Scheda assegnata dal coach per oggi (workout_logs, is_read_only=true). Se non
  // c'è nulla, resta l'array vuoto: niente esercizi finti mostrati a un utente reale.
  const [assignedExercises, setAssignedExercises] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!supabaseProp || !userId) return;
    const today = new Date().toISOString().slice(0, 10);
    fetchAssignedWorkouts(supabaseProp, userId, today, today)
      .then(async (rows) => {
        const withHistory = await Promise.all(rows.map(async (r) => ({
          id: r.id,               // id reale della riga workout_logs, serve per salvare il log dopo
          name: r.exercise_name,
          sets: r.sets_count ?? 3,
          reps: "—",               // lo schema non registra un range di ripetizioni target, solo quelle svolte
          rirTarget: "—",          // idem per l'RIR target: lo schema registra solo l'RIR realmente svolto
          technique: r.intensity_technique || "",
          rests: Array.from({ length: r.sets_count ?? 3 }, () => 120),
          history: await fetchExerciseHistory(supabaseProp, userId, r.exercise_name),
          splitLabel: r.split_label,
        })));
        setAssignedExercises(withHistory);
      })
      .catch((err) => { console.error("PERFORM: errore lettura workout_logs assegnati", err); setAssignedExercises([]); });
  }, [supabaseProp, userId]);
  const [rhr, setRhr] = useState("58");
  const [hrv, setHrv] = useState("62");
  const [remSleep, setRemSleep] = useState("1.5");
  const [stressLevel, setStressLevel] = useState("");
  const [caffeineMg, setCaffeineMg] = useState("");
  const [caffeineTime, setCaffeineTime] = useState("");
  const [fullHistory] = useState(() => ({
    sleep: simulateSeries(101, 49, 5.5, 8.4, 1),
    steps: simulateSeries(202, 49, 4200, 13200, 0),
    hrv: simulateSeries(303, 49, 36, 74, 0),
    rhr: simulateSeries(404, 49, 52, 79, 0),
  }));
  const [waterTarget, setWaterTarget] = useState(4000);

  /* Simula la sincronizzazione in tempo reale con il pannello del coach (in
     produzione: ogni evento viene scritto sull'oggetto di stato collegato a
     Supabase, cosicché il coach possa leggere e calibrare dieta/allenamento/
     integrazione sui progressi reali dell'atleta). Ogni evento aggiorna anche
     "l'ultima registrazione": se passano più di 24 ore senza che arrivi
     nessun evento, lo streak si azzera. */
  const [coachFeed, setCoachFeed] = useState([]);
  const [lastActivityDate, setLastActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const pushCoachSync = (evt) => {
    setCoachFeed((f) => [...f.slice(-99), { ...evt, at: new Date().toISOString() }]);
    setLastActivityDate(new Date().toISOString().slice(0, 10));

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
    setLastActivityDate(d.toISOString().slice(0, 10));
  };
  const resetActivityToday = () => setLastActivityDate(new Date().toISOString().slice(0, 10));

  /* Catalogo alimenti che cresce nel tempo: ogni scansione o inserimento
     manuale lo arricchisce, come un database collettivo stile MyFitnessPal. */
  const [customFoods, setCustomFoods] = useState([]);
  const addCustomFood = (food) =>
    setCustomFoods((cf) => (cf.some((f) => f.name.toLowerCase() === food.name.toLowerCase()) ? cf : [...cf, food]));
  const allFoods = useMemo(() => [...F, ...customFoods], [customFoods]);

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
  // In modalità reale: scheda assegnata dal coach per oggi (vuota se non ancora
  // assegnata nulla — niente dati finti mostrati a un cliente vero). In preview
  // isolata (nessun supabase/userId passati): la scheda dimostrativa di sempre.
  const exercises = isRealMode ? (assignedExercises ?? []) : demoExercises;

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

  // Idem per il weekPlan: in modalità reale mostra solo la scheda di oggi (lo
  // schema attuale assegna esercizi per data singola, non un piano settimanale
  // strutturato) — collegare l'intera settimana è un passo successivo.
  const weekPlan = isRealMode
    ? [exercises.length ? { label: exercises[0]?.splitLabel || "Scheda di oggi", exercises } : null, null, null, null, null, null, null]
    : [
        { label: "Upper A — Spinta", exercises: demoExercises }, null,
        { label: "Upper B", exercises: [{ name: "Trazioni" }] }, null,
        { label: "Lower B", exercises: [{ name: "Stacco rumeno" }] }, null, null,
      ];

  const generateSimilar = (sourceText) =>
    new Promise((res) => setTimeout(() => res(generateSimilarFood(sourceText)), 900));

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
        .h1{font-size:1.45rem;font-weight:700;letter-spacing:-0.01em}
        .h1{background-image:linear-gradient(100deg, var(--title-a), var(--title-b), var(--title-c), var(--title-b), var(--title-a));
          background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;
          animation:performGlow 5s ease-in-out infinite;display:inline-block}
        @media (prefers-reduced-motion: reduce){.h1{animation:none}}
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
        @keyframes chart3dSheen{0%{left:-60%}100%{left:160%}}
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
          day={{ weekday: 0, weekNumber: 3, isTraining: isTrainingDay, sessionLabel: "Upper A — Spinta", dayNumber: 15, mesociclo: 2, mesocicloWeeks: 4 }}
          target={target} consumed={consumed}
          targetOn={targetOn} targetOff={targetOff}
          onSetTargetOn={(patch) => setTargetOn((t) => ({ ...t, ...patch }))}
          onSetTargetOff={(patch) => setTargetOff((t) => ({ ...t, ...patch }))}
          isTrainingDay={isTrainingDay} onToggleTrainingDay={() => setIsTrainingDay((v) => !v)}
          streak={computeStreak("2026-07-19", 12, lastActivityDate)} level={4} xp={1840} xpInLevel={340} xpNeeded={590}
          mealsBySlot={meals} foods={allFoods} mealGuide={GUIDE} substitutions={SUBS}
          exercises={exercises} setsFor={setsFor} onSetField={onSetField}
          sleep={sleep} steps={steps} water={water} waterTarget={waterTarget} autoSteps={autoSteps}
          onSetWaterTarget={setWaterTarget}
          rhr={rhr} hrv={hrv}
          fullHistory={fullHistory}
          weekPlan={weekPlan} musclesOf={MUSCLES_OF} missedDayIdx={-1}
          access={{ nutrition: true, recovery: true, pro: planTier === "PRO", paid: planTier === "BASE" || planTier === "PRO" }}
          userPlan={planTier === "FREE" ? "free" : planTier === "BASE" ? "performance_pack" : "full_coaching"}
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
          remSleep={remSleep} onSetRemSleep={setRemSleep}
          stressLevel={stressLevel} onSetStressLevel={setStressLevel}
          caffeineMg={caffeineMg} onSetCaffeineMg={setCaffeineMg}
          caffeineTime={caffeineTime} onSetCaffeineTime={setCaffeineTime}
          onCoachSync={pushCoachSync} lastCoachSync={coachFeed[coachFeed.length - 1]} coachSyncCount={coachFeed.length}
          coachFeed={coachFeed}
          onSimulateInactivity={simulateInactivity} onResetActivityToday={resetActivityToday}
          onAddFood={(slot, item) => setMeals((m) => ({ ...m, [slot]: [...m[slot], item] }))}
          onOpenScanner={() => {}} onOpenPhoto={() => {}} onAddCustomFood={addCustomFood}
          onCopyYesterday={() => {}} onShoppingList={() => {}}
          onGenerateSimilar={generateSimilar}
          onApplyReschedule={() => {}} onDismissReschedule={() => {}}
          onUpgrade={() => {}}
        />
      </main>
    </div>
  );
}
