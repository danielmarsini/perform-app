import React, { useState, useMemo, useEffect, useCallback, createContext, useContext } from "react";
import {
  Users, Search, ChevronRight, ChevronDown, ChevronUp, Eye, EyeOff, Lock,
  AlertTriangle, Dumbbell, Salad, Pill, Copy, MessageCircle, Plus,
  Trash2, ArrowLeft, ShieldCheck, CalendarDays, Wallet, Server,
} from "lucide-react";

/* ============================================================================
   COACH DASHBOARD — PERFORM (Evidence-Based Method by D. Marsini)
   File isolato con dati simulati locali, per anteprima leggera.

   ATTENZIONE — NOTA DI FEDELTÀ AL BRAND (leggi prima di integrare):
   Il monolite "BioPerformanceLab (4).jsx" allegato NON contiene l'header con
   la saetta oro SVG, il wordmark "P E R F O R M" con keyframe performGlow e
   la firma corsiva "Evidence-Based Method by D. Marsini". Quell'header vive
   in AuthView.jsx / 04_AppShell.jsx, file non presenti in questo upload.
   Per non fabbricare valori di brand (regola che tu stesso hai imposto),
   l'header qui sotto è ESTRATTO VERBATIM dal monolite allegato — il logo
   quadrato nero con icona Activity dorata e il wordmark "BIOPERFORMANCE LAB"
   con caption "Coach Daniel Marsini" (vedi riga 8549-8562 dell'originale).
   Appena mi incolli AuthView.jsx o 04_AppShell.jsx sostituisco l'header con
   quello reale, 1:1, senza approssimazioni.
   ========================================================================= */

/* --------------------------- DESIGN TOKEN REALI --------------------------- */
/* Estratti verbatim dal blocco <style> del monolite (righe 8170-8350).      */
export const GlobalStyle = () => (
  <style>{`
    /* DIRETTIVA TIPOGRAFICA ASSOLUTA: nessun font esterno caricato (via
       @import o @font-face). Solo i font nativi di sistema — lo stesso
       stack che usano Apple, Instagram e TikTok sulle rispettive piattaforme
       — per uniformarsi ad AuthView e HomeDashboard. Niente più Monospace
       (IBM Plex Mono) né serif (Marcellus): rimossi entrambi, non solo
       "nascosti". */
    .coach-root {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --surface: #FFFFFF; --surface-2: #FCFCFD; --ink: #1A1A1A; --ink-soft: #A1A1AA; --ink-tertiary: #6C757D;
      --line: rgba(17,17,17,0.05); --line-strong: #F1F3F5; --card-shadow: 0 8px 30px rgba(0,0,0,0.02);
      --page-bg: #F8F9FA; --pill-off-bg: #FFFFFF;
      background-color: var(--page-bg); min-height: 100vh; transition: background-color 0.25s ease;
    }
    /* MODALITÀ ONYX — vero tema scuro attivabile dal toggle in cima, non solo
       decorativo: tutte le superfici (card, input, bordi, testo secondario)
       passano da variabili CSS, quindi si aggiornano ovunque insieme. Sfondo
       esatto richiesto #09090B, coerente con NewsTipsView.jsx. */
    .coach-root.dark {
      --surface: #18181B; --surface-2: #0F0F11; --ink: #F4F4F5; --ink-soft: #71717A; --ink-tertiary: #A1A1AA;
      --line: rgba(255,255,255,0.08); --line-strong: #27272A; --card-shadow: 0 8px 30px rgba(0,0,0,0.35);
      --page-bg: #09090B; --pill-off-bg: #18181B;
    }
    .coach-root.dark .c-ghost:hover { background-color: #27272A; }
    .coach-root.dark .t-input:focus { border-color: #C5A059; }
    /* Le 3 card del Fatturato (MRR/Annuale/Transazioni): vetro satinato che
       deve scurirsi davvero in Onyx, non restare bianco con testo che sparisce. */
    .coach-root { --glass-bg: rgba(255,255,255,0.6); --glass-border: rgba(255,255,255,0.8); }
    .coach-root.dark { --glass-bg: rgba(24,24,27,0.55); --glass-border: rgba(255,255,255,0.1); }
    /* Titoli grandi: bold geometrico, tracking stretto, effetto "vivo
       cangiante" — valori reali già approvati in ClientProfileView.jsx:
       Oro Lucido Vivo per profili maschili, Rosa Cipria per femminili. */
    .font-display { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-weight: 700; letter-spacing: -0.01em; }
    .c-heading { color: var(--ink); font-weight: 700; letter-spacing: -0.01em; }
    @keyframes titleShimmer { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
    .gradient-title-m, .gradient-title-f {
      font-weight: 700; letter-spacing: -0.01em; background-size: 200% auto;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: titleShimmer 4.5s ease-in-out infinite; will-change: background-position;
    }
    .gradient-title-m { background-image: linear-gradient(90deg, #D4AF37, #F3E5AB, #AA7C11, #D4AF37); }
    .gradient-title-f { background-image: linear-gradient(90deg, #E5C1CD, #F4E0E6, #C896A6, #E5C1CD); }
    @media (prefers-reduced-motion: reduce) { .gradient-title-m, .gradient-title-f { animation: none; } }
    /* Ogni riga, log e numero: snello e serrato, mai grassetto pesante —
       la tabellarità (transazioni, log accessi, storico check) deve
       leggersi ariosa, non un muro di grassetto. I titoli restano bold
       sopra; qui parliamo di corpo dati, non di intestazioni. */
    .font-data { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-weight: 400; letter-spacing: -0.01em; }
    /* Testi secondari, anamnesi, legende dei grafici: leggero e arioso,
       colore grigio satinato del brand, tracking leggermente APERTO. */
    .c-muted { color: var(--ink-soft); font-weight: 400; letter-spacing: 0.02em; }
    .c-label { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.02em; color: #A1A1AA; font-weight: 500; }
    .c-card { background-color: var(--surface); border: 1px solid var(--line); box-shadow: var(--card-shadow); border-radius: 1rem; padding: 1.5rem; }
    .c-btn { background-color: #111111; color: #FFFFFF; border-radius: 0.6rem; }
    .c-btn:hover:not(:disabled) { opacity: 0.85; }
    .c-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .c-ghost { border: 1px solid var(--line); color: var(--ink-soft); background-color: var(--surface); border-radius: 0.6rem; }
    .c-ghost:hover { background-color: #F8F9FA; }
    .t-input { background-color: var(--surface); border: 1px solid var(--line); color: var(--ink); transition: border-color 0.2s ease; border-radius: 0.6rem; }
    .t-input::placeholder { color: #ADB5BD; }
    .t-input:focus { border-color: #C5A059; outline: none; }
    .t-inner { background-color: var(--surface-2); border: 1px solid var(--line); border-radius: 0.85rem; }
    @keyframes springIn { 0% { opacity: 0; transform: translateY(10px) scale(0.985); } 55% { opacity: 1; transform: translateY(-2px) scale(1.004); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    .spring-in { animation: springIn 0.34s cubic-bezier(0.22, 1.2, 0.36, 1) both; }
    @keyframes alertPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.35); } 50% { box-shadow: 0 0 0 6px rgba(220,38,38,0); } }
    .alert-pulse { animation: alertPulse 1.8s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { .spring-in, .alert-pulse { animation: none !important; } }
    /* Swipe-to-scroll per i grafici su schermi stretti: scorrono in
       orizzontale col dito, senza la barra di scroll a vista. */
    .scroll-x-clean { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; }
    .scroll-x-clean::-webkit-scrollbar { display: none; }
  `}</style>
);

/* ------------------------------ WHATSAPP GATEWAY --------------------------- */
/* Numero reale del coach, estratto dal monolite: COACH_WHATSAPP (riga 673). */
const COACH_WHATSAPP = "393792089279";
function waLink(client, text) {
  return `https://wa.me/${COACH_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/* --------------------------- LIBRERIA ESERCIZI (subset) --------------------
   Sottoinsieme reale della EXERCISE_LIBRARY del monolite (righe 190-330),
   sufficiente a risolvere direct/indirect per il calcolo volumi.
   NOTA: "Dorso" è stato sostituito su tua richiesta esplicita con "Trapezio"
   e "Dorsali" (distretti distinti), più l'aggiunta di "Adduttori". Questi due
   nuovi esercizi (Scrollate, Adductor machine) non erano nel monolite: li ho
   aggiunti per dare un valore di volume non-zero ai due nuovi distretti.   */
const MUSCLES = ["Petto", "Trapezio", "Dorsali", "Deltoide Ant", "Deltoide Lat", "Deltoide Post", "Bicipiti", "Tricipiti", "Quadricipiti", "Femorali", "Adduttori", "Glutei", "Polpacci", "Addominali"];

const EXERCISE_LIB = {
  "Panca piana bilanciere": { direct: ["Petto"], indirect: ["Tricipiti", "Deltoide Ant"] },
  "Lento avanti manubri": { direct: ["Deltoide Ant"], indirect: ["Deltoide Lat", "Tricipiti"] },
  "Croci ai cavi": { direct: ["Petto"], indirect: ["Deltoide Ant"] },
  "French press EZ": { direct: ["Tricipiti"], indirect: [] },
  "Alzate laterali": { direct: ["Deltoide Lat"], indirect: [] },
  "Lat machine": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post"] },
  "Rematore bilanciere": { direct: ["Dorsali"], indirect: ["Bicipiti", "Deltoide Post", "Trapezio"] },
  "Face pull ai cavi": { direct: ["Deltoide Post"], indirect: ["Dorsali", "Trapezio"] },
  "Scrollate con bilanciere": { direct: ["Trapezio"], indirect: [] },
  "Curl bilanciere": { direct: ["Bicipiti"], indirect: [] },
  "Squat bilanciere": { direct: ["Quadricipiti"], indirect: ["Glutei"] },
  "Leg extension": { direct: ["Quadricipiti"], indirect: [] },
  "Stacco rumeno bilanciere": { direct: ["Femorali"], indirect: ["Glutei"] },
  "Hip thrust bilanciere": { direct: ["Glutei"], indirect: ["Femorali"] },
  "Leg curl sdraiato": { direct: ["Femorali"], indirect: [] },
  "Adductor machine": { direct: ["Adduttori"], indirect: [] },
  "Calf in piedi": { direct: ["Polpacci"], indirect: [] },
  "Crunch ai cavi": { direct: ["Addominali"], indirect: [] },
  "Plank": { direct: ["Addominali"], indirect: [] },
};
const EX_NAMES = Object.keys(EXERCISE_LIB);

// EXERCISE_LIB usa nomi brevi per il grafico volumi (Petto, Dorsali, Deltoide
// Ant/Lat/Post, Addominali...); MUSCLE_TARGETS (coachingData.js) è il check
// constraint reale di workout_logs.muscle_target, con nomi estesi diversi in
// 4 casi su 14. Serve solo per risolvere il distretto degli esercizi di
// libreria (custom === false) al momento del salvataggio reale — i custom lo
// chiedono a parte, con il select aggiunto in WeekWorkoutEditor qui sotto.
const EXERCISE_LIB_MUSCLE_TO_DB = {
  "Petto": "Pettorali",
  "Dorsali": "Gran Dorsale",
  "Deltoide Ant": "Deltoide Anteriore",
  "Deltoide Lat": "Deltoide Laterale",
  "Deltoide Post": "Deltoide Posteriore",
  "Addominali": "Addome",
  // Gli altri 8 nomi coincidono già: Trapezio, Bicipiti, Tricipiti,
  // Quadricipiti, Femorali, Adduttori, Glutei, Polpacci.
};
function resolveMuscleTarget(exerciseName) {
  const libMuscle = EXERCISE_LIB[exerciseName]?.direct?.[0];
  if (!libMuscle) return null;
  return EXERCISE_LIB_MUSCLE_TO_DB[libMuscle] || libMuscle;
}

/* ------------------------------- STATO CLIENTI ------------------------------
   Sottoinsieme reale di CLIENTS (righe 1298-1316), con l'aggiunta di due
   campi NUOVI non presenti nel monolite (password in chiaro simulata e
   check serale con Grado dolore 1-5): li introduco per soddisfare la
   richiesta del Password Viewer e del Cruscotto Allarmi & Dolori.         */
function computeStatus(client) {
  const { adherence, lastCheck } = client;
  if (adherence == null) return "green";
  if (adherence < 70 || lastCheck.stress >= 8) return "red";
  if (adherence < 85 || lastCheck.stress >= 6 || lastCheck.sleep <= 5) return "yellow";
  return "green";
}
const STATUS_META = {
  green: { label: "Ottimo", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  yellow: { label: "Attenzione", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  red: { label: "Rischio abbandono", pill: "bg-red-50 text-red-700 border-red-200" },
};

/* Campi anamnesi aggiunti (age, heightCm, bodyFatPct, activity, foodLikes):
   non presenti nel monolite in questa forma sintetica — li introduco per
   alimentare il motore di Generazione Predittiva Totale (TDEE + macros). */
import {
  fetchClientRoster, fetchAnamnesis, saveAnamnesis, activateClient,
  MUSCLE_TARGETS, fetchWeekWorkout, saveWeekWorkout, cloneWeekWorkout,
  assignNutritionTarget, saveWeekSupplements, computeTrainingCompliance,
} from "../lib/coachingData.js";

// Contesto condiviso: elenco clienti (reale o demo) + accesso a Supabase per
// i pannelli innestati (Anamnesi, Editor) senza dover passare supabase/coachId
// come prop attraverso ogni livello di componenti.
const CoachDataContext = createContext({ clients: [], supabase: null, coachId: null, isRealMode: false, reloadRoster: () => {} });

const DEMO_CLIENTS = [
  { id: 1, demoId: "marco", name: "Marco Bianchi", gender: "M", goal: "ipertrofia", calories: 2900, adherence: 94, streak: 17, xp: 3450, plan: "full", status: "active",
    age: 29, birthDate: "1997-04-12", heightCm: 180, bodyFatPct: 14, activity: "attivo", foodLikes: ["Petto di pollo", "Riso Basmati", "Mandorle"], foodDislikes: [],
    email: "marco.bianchi@icloud.com", password: "Marco-7734", lastCheck: { weight: 80.7, sleep: 7, stress: 4, energy: 8, hunger: 5 },
    weightHistory: [79.7, 80.0, 80.2, 80.5], waistCm: 82, billingStatus: "active", prs: { squat: 110, panca: 90, stacco: 140 },
    evening: { energia: 8, digestione: 9, sonno: 8, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.95, alimentazione: 0.88, recupero: 0.9 } },
  { id: 2, name: "Giulia Ferraro", gender: "F", goal: "ricomposizione", calories: 1850, adherence: 88, streak: 23, xp: 4820, plan: "full", status: "active",
    age: 26, birthDate: "2000-04-12", heightCm: 165, bodyFatPct: 24, activity: "moderato", foodLikes: ["Fesa di tacchino", "Avena in fiocchi", "Salmone fresco"], foodDislikes: ["Fiocchi di latte light"],
    email: "giulia.ferraro@icloud.com", password: "Giulia-2210", lastCheck: { weight: 61.2, sleep: 8, stress: 3, energy: 8, hunger: 6 },
    weightHistory: [62.2, 62.0, 61.7, 61.5], waistCm: 70, billingStatus: "active", prs: { squat: 65, panca: 40, stacco: 85 },
    evening: { energia: 7, digestione: 8, sonno: 8, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.9, alimentazione: 0.93, recupero: 0.85 } },
  { id: 3, name: "Luca Esposito", gender: "M", goal: "ipertrofia", calories: 3100, adherence: 76, streak: 4, xp: 1290, plan: "training", status: "active",
    age: 34, birthDate: "1992-04-12", heightCm: 176, bodyFatPct: 19, activity: "leggero", foodLikes: ["Riso Basmati", "Petto di pollo", "Olio EVO"], foodDislikes: ["Salmone fresco"],
    email: "luca.esposito@icloud.com", password: "Luca-5591", lastCheck: { weight: 84.3, sleep: 5, stress: 6, energy: 5, hunger: 4 },
    weightHistory: [83.3, 83.5, 83.8, 84.0], waistCm: 88, billingStatus: "active", prs: { squat: 120, panca: 85, stacco: 150 },
    evening: { energia: 4, digestione: 5, sonno: 4, doloreGrado: 3, doloreNota: "Fastidio alla spalla destra nel lento avanti" },
    rings: { allenamento: 0.6, alimentazione: 0.55, recupero: 0.4 } },
  { id: 4, demoId: "sara", name: "Sara Conti", gender: "F", goal: "ricomposizione", calories: 1700, adherence: 96, streak: 31, xp: 6100, plan: "full", status: "active",
    age: 27, birthDate: "1999-04-12", heightCm: 162, bodyFatPct: 20, activity: "attivo", foodLikes: ["Albume d'uovo", "Gallette di riso", "Fiocchi di latte light"], foodDislikes: ["Mandorle"],
    email: "sara.conti@icloud.com", password: "Sara-4402", lastCheck: { weight: 58.9, sleep: 8, stress: 2, energy: 9, hunger: 5 },
    weightHistory: [59.9, 59.6, 59.4, 59.1], waistCm: 66, billingStatus: "active", prs: { squat: 60, panca: 35, stacco: 80 },
    evening: { energia: 9, digestione: 9, sonno: 9, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.97, alimentazione: 0.95, recupero: 0.93 } },
  { id: 5, name: "Andrea Ricci", gender: "M", goal: "ipertrofia", calories: 3300, adherence: 62, streak: 0, xp: 210, plan: "scheda", status: "active",
    age: 38, birthDate: "1988-04-12", heightCm: 183, bodyFatPct: 23, activity: "sedentario", foodLikes: ["Riso Basmati", "Salmone fresco", "Mandorle"], foodDislikes: [],
    email: "andrea.ricci@icloud.com", password: "Andrea-8817", lastCheck: { weight: 91.5, sleep: 5, stress: 8, energy: 4, hunger: 3 },
    weightHistory: [90.5, 90.8, 91.0, 91.2], waistCm: 96, billingStatus: "active", prs: { squat: 130, panca: 100, stacco: 160 },
    evening: { energia: 3, digestione: 4, sonno: 3, doloreGrado: 4, doloreNota: "Fitta lombare durante lo stacco, ridotto carico" },
    rings: { allenamento: 0.35, alimentazione: 0.4, recupero: 0.3 } },
  { id: 6, name: "Elena Moretti", gender: "F", goal: "ricomposizione", calories: 1900, adherence: 91, streak: 12, xp: 2680, plan: "full", status: "active",
    age: 31, birthDate: "1995-04-12", heightCm: 168, bodyFatPct: 22, activity: "moderato", foodLikes: ["Petto di pollo", "Avena in fiocchi", "Olio EVO"], foodDislikes: ["Albume d'uovo"],
    email: "elena.moretti@icloud.com", password: "Elena-1123", lastCheck: { weight: 63.4, sleep: 7, stress: 4, energy: 7, hunger: 7 },
    weightHistory: [64.4, 64.2, 63.9, 63.6], waistCm: 74, billingStatus: "active", prs: { squat: 70, panca: 42, stacco: 90 },
    evening: { energia: 7, digestione: 6, sonno: 7, doloreGrado: 1, doloreNota: "" },
    rings: { allenamento: 0.88, alimentazione: 0.8, recupero: 0.82 } },
  { id: 16, demoId: "giulia2", name: "Giulia Ferrari", gender: "F", goal: "ricomposizione", calories: 1700, adherence: 0, streak: 0, xp: 0, plan: "full", status: "pending_approval",
    age: 24, birthDate: "2002-04-12", heightCm: 170, bodyFatPct: 26, activity: "leggero", foodLikes: ["Fesa di tacchino", "Riso Basmati"], foodDislikes: [],
    email: "giulia.ferrari@icloud.com", password: "Giulia-9034", lastCheck: { weight: 64.0, sleep: 7, stress: 5, energy: 6, hunger: 5 },
    weightHistory: [65.0, 64.8, 64.5, 64.2], waistCm: 76, billingStatus: "pending", prs: { squat: 40, panca: 25, stacco: 55 },
    evening: { energia: 6, digestione: 6, sonno: 7, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0, alimentazione: 0, recupero: 0 } },
  { id: 17, name: "Paolo Serra", gender: "M", goal: "ipertrofia", calories: 2600, adherence: 0, streak: 0, xp: 0, plan: "full", status: "new",
    age: 22, birthDate: "2004-04-12", heightCm: 175, bodyFatPct: 17, activity: "moderato", foodLikes: ["Petto di pollo", "Riso Basmati"], foodDislikes: [],
    email: "paolo.serra@icloud.com", password: "Paolo-6650", lastCheck: { weight: 79.0, sleep: 6, stress: 5, energy: 6, hunger: 6 },
    weightHistory: [78.0, 78.2, 78.5, 78.8], waistCm: 84, billingStatus: "pending", prs: { squat: 80, panca: 60, stacco: 100 },
    evening: { energia: 6, digestione: 6, sonno: 6, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0, alimentazione: 0, recupero: 0 } },
  { id: 18, name: "Alessio Fontana", gender: "M", goal: "ipertrofia", calories: 3200, adherence: 58, streak: 0, xp: 640, plan: "full", status: "requires_renewal",
    age: 41, birthDate: "1985-04-12", heightCm: 179, bodyFatPct: 25, activity: "sedentario", foodLikes: ["Riso Basmati", "Petto di pollo"], foodDislikes: ["Fiocchi di latte light"],
    email: "alessio.fontana@icloud.com", password: "Alessio-3390", lastCheck: { weight: 88.7, sleep: 4, stress: 9, energy: 3, hunger: 4 },
    weightHistory: [87.7, 88.0, 88.2, 88.5], waistCm: 98, billingStatus: "payment_failed", prs: { squat: 100, panca: 80, stacco: 130 },
    evening: { energia: 3, digestione: 4, sonno: 3, doloreGrado: 5, doloreNota: "Dolore acuto ginocchio destro durante lo squat, ha interrotto la seduta" },
    rings: { allenamento: 0.2, alimentazione: 0.3, recupero: 0.25 } },
];

const DEPTS = [
  { id: "active", label: "Attivi", dot: "🟢" },
  { id: "pending", label: "In attesa", dot: "🟡" },
  { id: "expired", label: "Scaduti", dot: "🔴" },
];
/* Billing Shield: il pagamento fallito sposta l'account nel reparto Scaduti
   in automatico — nessuna azione manuale del coach. NOTA IMPORTANTE: qui
   simulo solo la LETTURA del risultato (billingStatus) e la conseguenza sul
   reparto. Il dialogo vero con Stripe Billing (webhook su pagamento fallito,
   retry, dunning) va implementato server-side via Supabase Edge Function —
   non può vivere in questo file React lato client, né deve mai vedere la
   secret key di Stripe. Allo stesso modo, la schermata "a specchio" che si
   blocca sul telefono dell'atleta appartiene ad AuthView.jsx/AppShell, non
   a questo pannello Coach: qui il coach vede solo l'effetto (reparto rosso). */
function deptOf(c) {
  if (c.clientStatus) {
    if (c.clientStatus === "active") return "active";
    if (c.clientStatus === "paused") return "expired";
    return "pending";
  }
  if (c.billingStatus === "payment_failed") return "expired";
  if (c.status === "pending_approval" || c.status === "new" || c.status === "requires_renewal") return "pending";
  return computeStatus(c) === "red" && c.adherence < 65 ? "expired" : "active";
}

/* ============================================================================
   ANAMNESI — 56 domande REALI estratte verbatim dal monolite (righe 7387-
   7462, costante ANAM_QUESTIONS), raggruppate nelle 9 aree originali. Non
   ho toccato una virgola: stessi id (k), stessi testi (q), stessi tipi (t),
   stessi vincoli min/max/opts. Le RISPOSTE invece non esistono nel monolite
   per questi 9 profili demo — le simulo con simulateAnamnesis() qui sotto,
   coerenti con i dati anagrafici che già avevi (peso, altezza, età, goal).
   NOTA SU EMAIL: il monolite non contiene la schermata di registrazione
   (AuthView.jsx non è in questo upload), quindi non ho un campo email reale
   da estrarre. Ho aggiunto "nome.cognome@icloud.com" come placeholder
   plausibile: se mi mandi AuthView.jsx o l'elenco esatto dei campi di
   registrazione (email, password, eventuali altri) sostituisco con quelli
   veri e tolgo il placeholder. */
export const ANAM_AREAS = {
  a1: "1 · Dati anagrafici e personali",
  a2: "2 · Dati fisici e composizione",
  a3: "3 · Anamnesi medica e salute confidenziale",
  a4: "4 · Sonno e recupero",
  a5: "5 · Stress, psicologia e motivazione",
  a6: "6 · Storia ed esperienza di allenamento",
  a7: "7 · Alimentazione e abitudini nutrizionali",
  a8: "8 · Integrazione",
  a9: "9 · Obiettivi e aspettative",
};

export const ANAM_QUESTIONS = [
  /* 1 · Dati anagrafici e personali */
  { area: "a1", n: 1,  k: "nome",         q: "Nome e cognome", t: "text", req: true },
  { area: "a1", n: 2,  k: "nascita",      q: "Data di nascita", t: "date", req: true },
  { area: "a1", n: 3,  k: "nickname",     q: "Nickname per la classifica (visibile agli altri atleti al posto del tuo nome)", t: "text", req: true, ph: "es. IronWolf, Sara_Fit, K90" },
  { area: "a1", n: 3.1, k: "citta",       q: "Città di residenza", t: "text", ph: "es. Bologna" },
  { area: "a1", n: 4,  k: "telefono",     q: "Numero di telefono per i contatti diretti", t: "text", ph: "+39 …" },
  { area: "a1", n: 5,  k: "professione",  q: "Professione svolta", t: "text", ph: "es. Impiegata, infermiere, studente" },
  { area: "a1", n: 6,  k: "oreSeduto",    q: "Quante ore al giorno passi seduta/o?", t: "number", min: 0, max: 16, step: 0.5 },
  { area: "a1", n: 7,  k: "oreMovimento", q: "Quante ore al giorno passi in movimento?", t: "number", min: 0, max: 16, step: 0.5 },

  /* 2 · Dati fisici e composizione */
  { area: "a2", n: 8,  k: "peso",         q: "Peso attuale (kg), rilevato a digiuno", t: "number", min: 30, max: 300, step: 0.1, req: true },
  { area: "a2", n: 9,  k: "altezza",      q: "Altezza (cm)", t: "number", min: 120, max: 230, req: true },
  { area: "a2", n: 10, k: "circonferenze",q: "Circonferenze note (vita, fianchi, braccio, coscia)", t: "area", ph: "es. Vita 78 · Fianchi 98 · Braccio 30" },
  { area: "a2", n: 11, k: "plico",        q: "Dati di plicometria o DEXA, se disponibili", t: "area", ph: "es. Plico addome 22 mm · DEXA 28% massa grassa (03/2026)" },
  { area: "a2", n: 12, k: "__foto",       q: "Foto del check iniziale: Frontale, Laterale, Posteriore", t: "photos" },

  /* 3 · Anamnesi medica e salute confidenziale */
  { area: "a3", n: 13, k: "patologie",    q: "Patologie diagnosticate (tiroide, diabete, ipertensione, altro)", t: "area" },
  { area: "a3", n: 14, k: "interventi",   q: "Interventi chirurgici subiti e quando", t: "area" },
  { area: "a3", n: 15, k: "infortuni",    q: "Infortuni passati o in corso", t: "area", ph: "es. Distorsione caviglia dx 2024" },
  { area: "a3", n: 16, k: "dolori",       q: "Dolori o limitazioni articolari attuali", t: "area", ph: "es. Fastidio alla spalla nel lento avanti" },
  { area: "a3", n: 17, k: "analisi",      q: "Analisi del sangue recenti: valori fuori range", t: "area", ph: "es. Ferritina bassa, vitamina D 22 ng/ml" },
  { area: "a3", n: 18, k: "farmaci",      q: "Farmaci assunti abitualmente e dosaggio", t: "area" },
  { area: "a3", n: 19, k: "allergie",     q: "Allergie o intolleranze accertate", t: "area", ph: "es. Lattosio, nichel, nessuna" },

  /* 4 · Sonno e recupero */
  { area: "a4", n: 20, k: "oreSonno",     q: "Ore medie di sonno per notte", t: "number", min: 0, max: 14, step: 0.5, req: true },
  { area: "a4", n: 21, k: "qualitaSonno", q: "Qualità percepita del sonno", t: "scale" },
  { area: "a4", n: 22, k: "orariSonno",   q: "Orario tipico in cui vai a dormire e in cui ti svegli", t: "text", ph: "es. 23:30 · 07:00" },
  { area: "a4", n: 23, k: "schermiSera",  q: "Usi schermi nell'ultima ora prima di dormire?", t: "select", opts: ["sì, sempre", "a volte", "quasi mai"] },

  /* 5 · Stress, psicologia e motivazione */
  { area: "a5", n: 24, k: "stress",       q: "Livello di stress percepito nella vita quotidiana", t: "scale" },
  { area: "a5", n: 25, k: "fontiStress",  q: "Da cosa deriva principalmente il tuo stress?", t: "area", ph: "es. Turni di lavoro, studio, famiglia" },
  { area: "a5", n: 26, k: "motivazione",  q: "Cosa ti spinge davvero a iniziare questo percorso?", t: "area" },
  { area: "a5", n: 27, k: "tentativi",    q: "Percorsi o diete già tentati e perché non hanno funzionato", t: "area" },

  /* 6 · Storia ed esperienza di allenamento */
  { area: "a6", n: 28, k: "anniAllenamento", q: "Da quanti anni ti alleni con i pesi?", t: "number", min: 0, max: 50, step: 0.5 },
  { area: "a6", n: 29, k: "livello",      q: "Come definisci il tuo livello attuale?", t: "select", opts: ["principiante", "intermedio", "avanzato", "expert"] },
  { area: "a6", n: 30, k: "sessioni",     q: "Quante sessioni settimanali puoi garantire con certezza?", t: "number", min: 1, max: 7, req: true },
  { area: "a6", n: 31, k: "durataSess",   q: "Quanti minuti hai a disposizione per sessione?", t: "number", min: 20, max: 180, step: 5 },
  { area: "a6", n: 32, k: "attrezzatura", q: "Dove ti alleni e con quale attrezzatura?", t: "area", ph: "es. Palestra completa / home gym con manubri fino a 20 kg" },
  { area: "a6", n: 33, k: "eserciziForti",q: "Esercizi in cui sei più forte, con i carichi usati", t: "area", ph: "es. Squat 70 kg × 5 · Panca 40 kg × 8" },
  { area: "a6", n: 34, k: "eserciziNo",   q: "Esercizi che non puoi o non riesci a eseguire", t: "area" },
  { area: "a6", n: 35, k: "eserciziSi",   q: "Esercizi che ami di più e che ti motivano", t: "area" },
  { area: "a6", n: 36, k: "cardio",       q: "Attività cardio o sport praticati attualmente", t: "area", ph: "es. Corsa 2× a settimana, padel la domenica" },
  { area: "a6", n: 37, k: "passi",        q: "Passi medi giornalieri (se li monitori)", t: "number", min: 0, max: 40000, step: 500 },
  { area: "a6", n: 38, k: "tecniche",     q: "Conosci e hai già usato tecniche di intensità?", t: "area", ph: "es. Rest-Pause, stripping, dropset" },
  { area: "a6", n: 39, k: "orarioAllen",  q: "In quale fascia oraria ti alleni di solito?", t: "select", opts: ["mattina presto", "mattina", "pausa pranzo", "pomeriggio", "sera", "variabile"] },

  /* 7 · Alimentazione e abitudini nutrizionali */
  { area: "a7", n: 40, k: "numPasti",     q: "Quanti pasti fai attualmente in una giornata?", t: "number", min: 1, max: 8 },
  { area: "a7", n: 41, k: "orariPasti",   q: "A che ora consumi i pasti principali?", t: "text", ph: "es. 7:30 · 13:00 · 20:00" },
  { area: "a7", n: 42, k: "regime",       q: "Segui un regime alimentare particolare?", t: "select", opts: ["onnivoro", "vegetariano", "vegano", "altro"] },
  { area: "a7", n: 43, k: "cibiSi",       q: "Alimenti che ami e vorresti mantenere nel piano", t: "area" },
  { area: "a7", n: 44, k: "cibiNo",       q: "Alimenti che non tolleri o non vuoi vedere nel piano", t: "area" },
  { area: "a7", n: 45, k: "acqua",        q: "Litri d'acqua bevuti mediamente al giorno", t: "number", min: 0, max: 8, step: 0.25 },
  { area: "a7", n: 46, k: "alcol",        q: "Consumo di alcolici: frequenza e quantità", t: "text", ph: "es. 2 birre nel weekend" },
  { area: "a7", n: 47, k: "fuoriCasa",    q: "Quante volte a settimana mangi fuori casa?", t: "number", min: 0, max: 21 },
  { area: "a7", n: 48, k: "fameNervosa",  q: "Ti capitano episodi di fame nervosa o abbuffate? Quando?", t: "area", ph: "es. La sera davanti alla TV, nei giorni di stress" },

  /* 8 · Integrazione */
  { area: "a8", n: 49, k: "integratori",  q: "Integratori attualmente in uso, con dosaggi", t: "area", ph: "es. Creatina 5 g, vitamina D 2000 UI" },
  { area: "a8", n: 50, k: "integrPassati",q: "Integratori usati in passato e risultati percepiti", t: "area" },
  { area: "a8", n: 51, k: "caffeina",     q: "Quanti caffè o fonti di caffeina assumi al giorno?", t: "text", ph: "es. 3 caffè + 1 pre-workout" },
  { area: "a8", n: 52, k: "disponibIntegr", q: "Sei disponibile a integrare se necessario?", t: "select", opts: ["sì, senza problemi", "solo se indispensabile", "preferirei di no"] },

  /* 9 · Obiettivi e aspettative */
  { area: "a9", n: 53, k: "obiettivoPrinc", q: "Qual è il tuo obiettivo principale?", t: "select", opts: ["dimagrimento", "ricomposizione corporea", "ipertrofia", "forza", "salute e benessere", "preparazione atletica"] },
  { area: "a9", n: 54, k: "kgTarget",     q: "Quanti chili vuoi raggiungere entro 2 mesi? (peso target)", t: "number", min: 30, max: 300, step: 0.5, req: true },
  { area: "a9", n: 55, k: "obiettivo",    q: "Obiettivo a lungo termine ed eventuale data-evento", t: "text", req: true, ph: "es. Raggiungere 60 kg entro 2 mesi, matrimonio a settembre" },
  { area: "a9", n: 56, k: "aspettative",  q: "Cosa ti aspetti da me come coach?", t: "area" },
];

/* Simula le risposte (non presenti nel monolite per questi profili demo)
   incrociando i dati anagrafici che già avevi sul cliente: peso, altezza,
   età, obiettivo, gender. Dove non c'è un dato reale da agganciare, uso un
   valore plausibile ma generico — è un placeholder di anteprima, non un
   dato clinico: nella vera app questi campi arrivano dal form di anamnesi
   compilato dall'atleta. */
function simulateAnamnesis(client) {
  const goalMap = { ipertrofia: "ipertrofia", ricomposizione: "ricomposizione corporea" };
  return {
    nome: client.name, nascita: client.birthDate, nickname: client.name.split(" ")[0] + Math.floor(client.id * 7),
    citta: "Acquasparta (TR)", telefono: "+39 333 " + String(1000000 + client.id * 12345).slice(0, 7),
    professione: client.activity === "sedentario" ? "Impiegato/a ufficio" : "Libero professionista",
    oreSeduto: client.activity === "sedentario" ? 9 : client.activity === "leggero" ? 7 : 5,
    oreMovimento: client.activity === "attivo" ? 3 : client.activity === "moderato" ? 2 : 1,
    peso: client.lastCheck.weight, altezza: client.heightCm,
    circonferenze: "", plico: `${client.bodyFatPct}% massa grassa stimata (bioimpedenza)`, __foto: "",
    patologie: "", interventi: "", infortuni: client.evening.doloreGrado > 0 ? client.evening.doloreNota : "",
    dolori: client.evening.doloreGrado > 0 ? `Grado ${client.evening.doloreGrado}/5 · ${client.evening.doloreNota}` : "",
    analisi: "", farmaci: "", allergie: "",
    oreSonno: client.lastCheck.sleep, qualitaSonno: Math.max(1, Math.min(10, client.lastCheck.sleep)), orariSonno: "23:30 · 07:00", schermiSera: "a volte",
    stress: client.lastCheck.stress, fontiStress: "Lavoro e gestione del tempo", motivazione: "Migliorare energia e composizione corporea",
    tentativi: "", anniAllenamento: client.age > 30 ? 5 : 2, livello: client.age > 30 ? "intermedio" : "principiante",
    sessioni: client.plan === "training" ? 4 : 5, durataSess: 75, attrezzatura: "Palestra completa",
    eserciziForti: "", eserciziNo: "", eserciziSi: "", cardio: "", passi: 7000, tecniche: "",
    orarioAllen: "sera",
    numPasti: 6, orariPasti: "7:30 · 13:00 · 16:00 · 20:00", regime: "onnivoro",
    cibiSi: (client.foodLikes || []).join(", "), cibiNo: (client.foodDislikes || []).join(", ") || "Nessuna", acqua: 2.5, alcol: "Occasionale, weekend",
    fuoriCasa: 2, fameNervosa: "",
    integratori: "", integrPassati: "", caffeina: "2 caffè", disponibIntegr: "sì, senza problemi",
    obiettivoPrinc: goalMap[client.goal] || client.goal, kgTarget: Math.round(client.lastCheck.weight * (client.goal === "ipertrofia" ? 1.04 : 0.94)),
    obiettivo: `${client.goal === "ipertrofia" ? "Aumentare massa magra" : "Ricomposizione corporea"} nel medio termine`, aspettative: "Metodo chiaro, costanza, riscontri misurabili",
  };
}

/* ------------------------------ VOLUME BAR CHART ---------------------------
   Estratto verbatim dal monolite (righe 473-506): serie dirette 100% vs
   indirette 50% sui sinergici, con soglia visiva a 10 serie.              */
function fmtSets(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","); }
function computeVolume(dayList) {
  const vol = {}; MUSCLES.forEach((m) => (vol[m] = { direct: 0, indirect: 0 }));
  dayList.filter(Boolean).forEach((day) => {
    (day.exercises || []).forEach((ex) => {
      const lib = EXERCISE_LIB[ex.name];
      if (!lib) return;
      const sets = Number(ex.sets) || 0;
      lib.direct.forEach((m) => { vol[m].direct += sets; });
      lib.indirect.forEach((m) => { vol[m].indirect += sets * 0.5; });
    });
  });
  return vol;
}
function VolumeBarChart({ volume }) {
  const rows = MUSCLES.map((m) => ({ m, d: volume[m].direct, i: volume[m].indirect, tot: volume[m].direct + volume[m].indirect }));
  const maxV = Math.max(20, ...rows.map((r) => r.tot));
  const W = 520, LABEL = 118, VAL = 44, ROWH = 24, PADT = 10;
  const BARW = W - LABEL - VAL - 8;
  const H = PADT * 2 + rows.length * ROWH;
  const xThresh = LABEL + (10 / maxV) * BARW;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Serie settimanali per gruppo muscolare, volume diretto e indiretto">
      <line x1={xThresh} x2={xThresh} y1={PADT - 4} y2={H - PADT + 4} stroke="var(--ink-tertiary)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={xThresh + 4} y={PADT + 2} fontSize="8.5" fill="var(--ink-tertiary)" fontFamily='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'>10 serie</text>
      {rows.map((r, idx) => {
        const y = PADT + idx * ROWH;
        const dW = (r.d / maxV) * BARW, iW = (r.i / maxV) * BARW;
        const low = r.tot < 10 && r.tot > 0;
        return (
          <g key={r.m}>
            <text x={LABEL - 6} y={y + ROWH / 2 + 3.5} textAnchor="end" fontSize="10" fill={low ? "#92400E" : "var(--ink)"} fontFamily='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'>{r.m}</text>
            <rect x={LABEL} y={y + 5} width={BARW} height={ROWH - 10} rx="2" fill="#F8F9FA" />
            {r.d > 0 && <rect x={LABEL} y={y + 5} width={dW} height={ROWH - 10} rx="2" fill="var(--ink)" />}
            {r.i > 0 && <rect x={LABEL + dW} y={y + 5} width={iW} height={ROWH - 10} fill="#C5A059" />}
            <text x={LABEL + dW + iW + 5} y={y + ROWH / 2 + 3.5} fontSize="10" fontWeight="600" fill={low ? "#92400E" : "var(--ink)"} fontFamily='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'>{fmtSets(r.tot)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------ TIMELINE 8 SETTIMANE (nuovo) ---------------------
   Struttura NON presente nel monolite: la introduco per soddisfare la
   richiesta esplicita "controllo totale su 8 settimane" di allenamento,
   dieta a pasti liberi e integratori, con blocco clonabile in un clic.  */
const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/* Tecniche d'intensità pianificate [A1]: elenco esatto richiesto — se in
   futuro vuoi aggiungere Cluster Set / Myo-reps (comparse in un'altra chat
   su 05_HomeDashboard.jsx) basta un'aggiunta a questo array, nessun'altra
   modifica necessaria. */
const INTENSITY_TECHNIQUES = ["Nessuna", "Drop-set", "Rest-Pause", "Stripping", "Super-set"];

/* Timing dell'integrazione: 4 momenti biologici (non più 9 fasce libere),
   per allinearsi al Master Prompt nutrizionale — HRV al mattino, cortisolo
   la sera, finestra anabolica intorno all'allenamento. Il coach può ancora
   aggiungere sezioni personalizzate col pulsante "+ Nuova sezione". */
const DEFAULT_SUPP_SECTIONS = [
  "Mattina",
  "Pranzo",
  "Pre/Post-Workout",
  "Sera · Pre-nanna",
];

let uidCounter = 1;
const uid = () => `x${uidCounter++}`;

/* Matematica dei macros: 1 g Proteine = 4 kcal, 1 g Carbo = 4 kcal,
   1 g Grassi = 9 kcal. Formula unica condivisa da editor coach e diario
   atleta: qualunque form leggo da qui, mai calcoli duplicati altrove. */
function kcalFromMacros(p, c, f) {
  return Math.round((Number(p) || 0) * 4 + (Number(c) || 0) * 4 + (Number(f) || 0) * 9);
}

function makeDefaultDay(kind) {
  if (kind === "rest") return null;
  const pool = { push: ["Panca piana bilanciere", "Lento avanti manubri", "French press EZ", "Alzate laterali"],
    pull: ["Lat machine", "Rematore bilanciere", "Face pull ai cavi", "Scrollate con bilanciere", "Curl bilanciere"],
    legs: ["Squat bilanciere", "Stacco rumeno bilanciere", "Leg extension", "Adductor machine", "Leg curl sdraiato", "Calf in piedi", "Crunch ai cavi"] }[kind];
  return {
    label: kind === "push" ? "Spinta · Petto/Spalle/Tricipiti" : kind === "pull" ? "Trazione · Dorsali/Trapezio/Bicipiti" : "Gambe · Quad/Femorali/Adduttori/Glutei",
    exercises: pool.map((name) => ({ id: uid(), name, custom: false, sets: 3, reps: "8-10", rest: 120, technique: "Nessuna" })),
  };
}

/* Un profilo macro ON/OFF: grammi impostati a mano, kcal SEMPRE derivate
   dalla formula — mai un valore digitato a parte, così il bilancio
   matematico non può mai disallinearsi dai grammi reali. */
function makeMacroProfile(kcalTarget, pPct, cPct, fPct) {
  const p = Math.round((kcalTarget * pPct) / 4);
  const c = Math.round((kcalTarget * cPct) / 4);
  const f = Math.round((kcalTarget * fPct) / 9);
  return { p, c, f };
}

/* Macro di un singolo alimento nel piatto: se l'alimento è scelto dal
   database (foodKey) uso i suoi valori reali per 100 g; se è un alimento
   "personalizzato" scritto a mano, uso i valori per 100 g che il coach
   inserisce lui stesso. In entrambi i casi il calcolo è live, mai statico. */
function foodPer100(item) {
  if (item.foodKey) {
    const f = foodByName(item.foodKey);
    return { kcal: f.kcal, p: f.p, c: f.c, f: f.f };
  }
  return { kcal: kcalFromMacros(item.customP100, item.customC100, item.customF100), p: Number(item.customP100) || 0, c: Number(item.customC100) || 0, f: Number(item.customF100) || 0 };
}
function itemMacros(item) {
  const per100 = foodPer100(item);
  const factor = (Number(item.grams) || 0) / 100;
  const p = per100.p * factor, c = per100.c * factor, f = per100.f * factor;
  return { p, c, f, kcal: kcalFromMacros(p, c, f) };
}
function mealMacros(meal) {
  return (meal.items || []).reduce((acc, it) => {
    const m = itemMacros(it);
    return { p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f, kcal: acc.kcal + m.kcal };
  }, { p: 0, c: 0, f: 0, kcal: 0 });
}
/* Stima della leucina per pasto: la letteratura (Norton & Layman) non
   riporta un contenuto di leucina per ogni singolo alimento nel FOOD_DB —
   uso l'euristica comunemente citata in nutrizione sportiva "~8,5% della
   proteina totale è leucina" per fonti animali complete, coerente col
   Master Prompt nutrizionale. È una STIMA dichiarata, non un valore
   analitico da laboratorio: utile per segnalare se un pasto è sotto soglia,
   non per un referto clinico. Soglia mTOR riconosciuta: ~2.5 g/pasto. */
const LEUCINE_RATIO = 0.085;
const LEUCINE_THRESHOLD_G = 2.5;
function estimateMealLeucine(meal) {
  return mealMacros(meal).p * LEUCINE_RATIO;
}
function dayMacros(meals) {
  return (meals || []).reduce((acc, meal) => {
    const m = mealMacros(meal);
    return { p: acc.p + m.p, c: acc.c + m.c, f: acc.f + m.f, kcal: acc.kcal + m.kcal };
  }, { p: 0, c: 0, f: 0, kcal: 0 });
}

/* Struttura libera "giorni-orari con nomi alimenti e quantità": non più 6
   caselle fisse, ma pasti che il coach crea/rinomina/orario a piacere,
   ciascuno con i suoi alimenti in grammi. Genero solo un punto di partenza
   plausibile (4 pasti tipici con orario) calibrato sul target ON/OFF e sui
   gusti del cliente, usando lo stesso database alimentare reale già in uso
   nella Generazione Predittiva — il coach lo rifinisce liberamente dopo. */
const MEAL_TEMPLATE = [
  { name: "Colazione", time: "07:00", share: 0.20, category: "breakfast" },
  { name: "Pranzo", time: "13:00", share: 0.35, category: "lunch_dinner" },
  { name: "Merenda", time: "17:00", share: 0.15, category: "snack" },
  { name: "Cena", time: "20:00", share: 0.30, category: "lunch_dinner" },
];

/* Abbinamenti curati (non più "miglior match algoritmico" isolato per ogni
   ruolo, che produceva sempre la STESSA coppia proteina+carbo sia a pranzo
   che a cena): ogni combo è un piatto vero — proteina, carboidrato, grasso
   e (per pranzo/cena) verdura — scelto per stare bene insieme, non solo per
   centrare i numeri. Pranzo e cena pescano da combo diversi apposta, per
   varietà. Tutti gli alimenti citati sono nel FOOD_DB qui sopra. */
const COMBO_TEMPLATES = {
  breakfast: [
    { protein: "Albume d'uovo", carb: "Avena in fiocchi", fat: "Mandorle" },
    { protein: "Yogurt Bianco Intero", carb: "Banana", fat: "Semi di chia" },
    { protein: "Skyr", carb: "Mirtilli", fat: "Noci" },
    { protein: "Ricotta vaccina", carb: "Fette Biscottate Integrali", fat: "Burro d'arachidi" },
    { protein: "Uovo intero", carb: "Pane integrale", fat: "Avocado" },
    { protein: "Fiocchi di latte light", carb: "Gallette di riso", fat: "Mandorle" },
    { protein: "Yogurt Greco 0%", carb: "Miele", fat: "Semi di lino" },
    { protein: "Kefir", carb: "Fette Biscottate Integrali", fat: "Noci" },
  ],
  lunch_dinner: [
    { protein: "Petto di pollo", carb: "Riso Basmati", fat: "Olio EVO", veggie: "Broccoli" },
    { protein: "Salmone fresco", carb: "Patate dolci", fat: "Olio EVO", veggie: "Spinaci" },
    { protein: "Fesa di tacchino", carb: "Quinoa cotta", fat: "Olio EVO", veggie: "Zucchine" },
    { protein: "Manzo magro (fesa)", carb: "Patate", fat: "Olio EVO", veggie: "Insalata mista" },
    { protein: "Merluzzo/Nasello", carb: "Riso integrale cotto", fat: "Olio EVO", veggie: "Pomodori" },
    { protein: "Tonno al naturale", carb: "Pasta integrale", fat: "Olio EVO", veggie: "Peperoni" },
    { protein: "Tofu", carb: "Cous cous cotto", fat: "Olio EVO", veggie: "Carote" },
    { protein: "Gamberetti", carb: "Farro perlato cotto", fat: "Olio EVO", veggie: "Cetrioli" },
    { protein: "Vitello magro", carb: "Orzo perlato cotto", fat: "Olio EVO", veggie: "Melanzane" },
    { protein: "Lonza di maiale", carb: "Pane comune", fat: "Olio EVO", veggie: "Cavolfiore" },
    { protein: "Seitan", carb: "Mais dolce", fat: "Olio EVO", veggie: "Funghi champignon" },
    { protein: "Tempeh", carb: "Fagioli cannellini cotti", fat: "Olio EVO", veggie: "Insalata mista" },
    { protein: "Orata/Branzino", carb: "Ceci cotti", fat: "Olio EVO", veggie: "Zucchine" },
    { protein: "Sgombro", carb: "Farro perlato cotto", fat: "Olio EVO", veggie: "Rucola" },
    { protein: "Bresaola", carb: "Pane di segale", fat: "Olio EVO", veggie: "Finocchi" },
    { protein: "Vongole", carb: "Pasta integrale", fat: "Olio EVO", veggie: "Pomodori" },
    { protein: "Fave cotte", carb: "Piadina integrale", fat: "Olio EVO", veggie: "Cipolle" },
  ],
  snack: [
    { protein: "Yogurt Bianco Intero", carb: "Mirtilli", fat: "Semi di chia" },
    { protein: "Skyr", carb: "Fragole", fat: "Noci" },
    { protein: "Fiocchi di latte light", carb: "Ananas", fat: "Mandorle" },
    { protein: "Hummus di Ceci", carb: "Cracker Integrali", fat: "Mandorle" },
    { protein: "Edamame", carb: "Mela", fat: "Noci" },
    { protein: "Barretta Proteica", carb: "Banana", fat: "Burro d'arachidi" },
    { protein: "Yogurt Greco 0%", carb: "Kiwi", fat: "Semi di zucca" },
    { protein: "Ricotta vaccina", carb: "Pesche", fat: "Pistacchi" },
  ],
};

/* Sceglie il combo migliore: esclude quelli con un'intolleranza, preferisce
   quelli che contengono un gusto dichiarato, e ruota per indice (Pranzo e
   Cena hanno indici diversi nel MEAL_TEMPLATE) così non si ripete mai la
   stessa accoppiata due volte nello stesso giorno. */
function pickCombo(client, category, seedIndex, deficientMicros) {
  const excluded = new Set(client?.foodDislikes || []);
  const combos = COMBO_TEMPLATES[category] || [];
  const roles = (c) => [c.protein, c.carb, c.fat, c.veggie].filter(Boolean);
  const valid = combos.filter((c) => !roles(c).some((name) => excluded.has(name)));
  if (valid.length === 0) return null;
  const likes = new Set(client?.foodLikes || []);
  const liked = valid.filter((c) => roles(c).some((name) => likes.has(name)));
  let pool = liked.length ? liked : valid;
  // Master Prompt nutrizionale punto 6: se il cliente ha carenze rilevate,
  // preferisco un combo che contenga già un alimento denso in quel fattore
  // (es. patate dolci per il Potassio) tra quelli tollerati/graditi.
  if (deficientMicros && deficientMicros.length) {
    const richNames = new Set(deficientMicros.flatMap((k) => MICRO_RICH_FOODS[k] || []));
    const boosted = pool.filter((c) => roles(c).some((name) => richNames.has(name)));
    if (boosted.length) pool = boosted;
  }
  return pool[seedIndex % pool.length];
}

/* Selezione alimenti "su misura": preferisce i gusti dichiarati dal cliente
   ma esclude SEMPRE le intolleranze (anamnesi, campo cibiNo/foodDislikes),
   anche nei fallback — un cibo non tollerato non deve mai comparire, nemmeno
   come scelta di ripiego. Condivisa da tutti i generatori di pasti.
   `category` filtra per pasto (breakfast/lunch_dinner/snack) tramite i tag:
   è questo che impedisce abbinamenti assurdi come pollo a colazione o avena
   a cena — il pollo non ha il tag "breakfast", quindi a colazione non può
   nemmeno essere considerato, gusti o non gusti.
   Usata come fallback quando pickCombo non trova nulla di compatibile.    */
function pickMacroFoodsForClient(client, category) {
  const excluded = new Set(client?.foodDislikes || []);
  const inCategory = (f) => !category || (f.tags || []).includes(category);
  const candidates = FOOD_DB.filter((f) => !excluded.has(f.name) && inCategory(f));
  const fallbackCandidates = FOOD_DB.filter((f) => !excluded.has(f.name)); // se la categoria è troppo stretta, meglio un alimento sbagliato di categoria che uno vietato
  const likes = (client?.foodLikes || []).map(foodByName).filter((f) => !excluded.has(f.name) && inCategory(f));
  const pool = likes.length ? likes : candidates.length ? candidates : fallbackCandidates;
  const base = candidates.length ? candidates : fallbackCandidates;
  const byRole = (test) => pool.find(test) || base.find(test) || fallbackCandidates.find(test);
  const mainProtein = byRole((f) => f.p >= f.c && f.p >= f.f * 0.4) || fallbackCandidates[0];
  const mainCarb = byRole((f) => f.c > f.p) || fallbackCandidates[0];
  const mainFat = byRole((f) => f.f > f.p && f.f > f.c) || fallbackCandidates[0];
  const veggie = FOOD_DB.find((f) => f.veggie && !excluded.has(f.name)) || null;
  return { mainProtein, mainCarb, mainFat, veggie, excluded: [...excluded] };
}

/* Contorno di verdura fisso (150 g) per i pasti principali: non serve a
   colmare i macro (le verdure hanno troppo poche kcal per essere una fonte
   di carbo/proteina calcolabile a grammi target), serve a rendere il piatto
   vero, completo e piacevole invece di "proteina + carbo" nudi e crudi. Le
   sue macro comunque entrano nel calcolo live, come ogni altro alimento. */
const VEGGIE_PORTION_G = 150;

/* Solutore esatto a 3 incognite (grammi di proteina/carbo/grasso) per
   colpire ESATTAMENTE il target di macro del pasto, invece della vecchia
   divisione proporzionale (che ignorava i macro "di contorno" di ogni
   alimento, es. il grasso nel salmone, e quindi sforava). Risolve il
   sistema lineare 3x3 con la regola di Cramer:
     gP·(Pp/100) + gC·(Cp/100) + gF·(Fp/100) = targetP
     gP·(Pc/100) + gC·(Cc/100) + gF·(Fc/100) = targetC
     gP·(Pf/100) + gC·(Cf/100) + gF·(Ff/100) = targetF
   Poi arrotonda per DIFETTO (Math.floor): dato che ogni coefficiente è ≥ 0,
   ridurre un grammo non può mai far salire un macro — quindi il risultato
   finale è matematicamente garantito ≤ target su tutte e 3 le dimensioni,
   mai sopra di un grammo. Il prezzo è restare quasi sempre 1-3 g sotto per
   arrotondamento: è la scelta corretta per "senza sforare", non un difetto.
   Se il sistema è degenere (determinante ~0, alimenti troppo simili) o dà
   grammi negativi (combinazione fisicamente impossibile), ripiega sulla
   vecchia divisione proporzionale, sempre con lo stesso floor protettivo. */
function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function solveMealGrams(targetP, targetC, targetF, proteinFood, carbFood, fatFood) {
  const M = [
    [proteinFood.p / 100, carbFood.p / 100, fatFood.p / 100],
    [proteinFood.c / 100, carbFood.c / 100, fatFood.c / 100],
    [proteinFood.f / 100, carbFood.f / 100, fatFood.f / 100],
  ];
  const D = det3(M);
  if (Math.abs(D) < 1e-6) return null;
  const target = [targetP, targetC, targetF];
  const withCol = (col) => M.map((row, i) => row.map((v, j) => (j === col ? target[i] : v)));
  const gP = det3(withCol(0)) / D;
  const gC = det3(withCol(1)) / D;
  const gF = det3(withCol(2)) / D;
  if (gP < 0 || gC < 0 || gF < 0 || !isFinite(gP) || !isFinite(gC) || !isFinite(gF)) return null;
  return { proteinGrams: Math.floor(gP), carbGrams: Math.floor(gC), fatGrams: Math.floor(gF) };
}

function makeMealSplit(profile, client, deficientMicros) {
  return MEAL_TEMPLATE.map((t, templateIdx) => {
    const combo = pickCombo(client, t.category, templateIdx, deficientMicros);
    const fallback = pickMacroFoodsForClient(client, t.category);
    const proteinFood = combo ? foodByName(combo.protein) : fallback.mainProtein;
    const carbFood = combo ? foodByName(combo.carb) : fallback.mainCarb;
    const fatFood = combo ? foodByName(combo.fat) : fallback.mainFat;
    const veggieFood = (combo && combo.veggie) ? foodByName(combo.veggie) : fallback.veggie;

    let mP = profile.p * t.share, mC = profile.c * t.share, mF = profile.f * t.share;
    const addVeggie = t.category === "lunch_dinner" && veggieFood;

    // Il contorno di verdura contribuisce ai macro: lo sottraggo PRIMA di
    // risolvere il sistema, così proteina+carbo+grasso completano solo la
    // parte restante e il totale del pasto non sfora comunque.
    if (addVeggie) {
      const vk = (n) => (Number(veggieFood[n]) || 0) * (VEGGIE_PORTION_G / 100);
      mP = Math.max(0, mP - vk("p")); mC = Math.max(0, mC - vk("c")); mF = Math.max(0, mF - vk("f"));
    }

    let solved = solveMealGrams(mP, mC, mF, proteinFood, carbFood, fatFood);
    if (!solved) {
      // Fallback: divisione proporzionale (approssimata), sempre con floor protettivo
      solved = {
        proteinGrams: Math.floor((mP / proteinFood.p) * 100) || 0,
        carbGrams: Math.floor((mC / carbFood.c) * 100) || 0,
        fatGrams: mF > 2 ? Math.floor((mF / fatFood.f) * 100) : 0,
      };
    }
    return {
      id: uid(), name: t.name, time: t.time,
      items: [
        solved.proteinGrams > 0 && { id: uid(), foodKey: proteinFood.name, customName: "", customP100: 0, customC100: 0, customF100: 0, grams: solved.proteinGrams },
        solved.carbGrams > 0 && { id: uid(), foodKey: carbFood.name, customName: "", customP100: 0, customC100: 0, customF100: 0, grams: solved.carbGrams },
        solved.fatGrams > 0 && { id: uid(), foodKey: fatFood.name, customName: "", customP100: 0, customC100: 0, customF100: 0, grams: solved.fatGrams },
        addVeggie && { id: uid(), foodKey: veggieFood.name, customName: "", customP100: 0, customC100: 0, customF100: 0, grams: VEGGIE_PORTION_G },
      ].filter(Boolean),
    };
  });
}

/* offset: numero di settimane rispetto a OGGI (0 = settimana corrente).
   Le settimane passate (offset < 0) nascono già "confirmed" perché sono
   storico già accaduto; quelle presenti/future nascono da compilare. */
function makeDefaultWeek(client, offset = 0, quickTargetOverride = null) {
  const pattern = [makeDefaultDay("push"), makeDefaultDay("pull"), makeDefaultDay("legs"), null, makeDefaultDay("push"), makeDefaultDay("pull"), null];
  // Se esiste un target impostato "al volo" dal Registro Check Lunedì per la
  // settimana corrente (offset 0), ha priorità sul calcolo di default: è lo
  // stesso identico numero che il coach vede e regola da quella tab.
  const onProfile = (offset === 0 && quickTargetOverride?.ON) || makeMacroProfile(client.calories, 0.28, 0.47, 0.25);
  const offProfile = (offset === 0 && quickTargetOverride?.OFF) || makeMacroProfile(Math.round(client.calories * 0.9), 0.3, 0.35, 0.35);
  const isPast = offset < 0;
  return {
    workout: pattern,
    diet: {
      ON: { target: onProfile, meals: makeMealSplit(onProfile, client) },
      OFF: { target: offProfile, meals: makeMealSplit(offProfile, client) },
    },
    supplements: DEFAULT_SUPP_SECTIONS.map((title) => ({ id: uid(), title, items: [] })),
    confirmed: { workout: isPast, diet: isPast, supplements: isPast },
  };
}
function deepCloneWeek(week) {
  const cloneMeals = (meals) => meals.map((m) => ({ ...m, id: uid(), items: (m.items || []).map((it) => ({ ...it, id: uid() })) }));
  return {
    workout: week.workout.map((d) => (d ? { ...d, exercises: d.exercises.map((e) => ({ ...e, id: uid() })) } : null)),
    diet: {
      ON: { target: { ...week.diet.ON.target }, meals: cloneMeals(week.diet.ON.meals) },
      OFF: { target: { ...week.diet.OFF.target }, meals: cloneMeals(week.diet.OFF.meals) },
    },
    supplements: week.supplements.map((sec) => ({ ...sec, id: uid(), items: sec.items.map((it) => ({ ...it, id: uid() })) })),
    confirmed: { workout: false, diet: false, supplements: false }, // la settimana clonata va sempre rivista prima di confermarla
  };
}

/* ------------------------- CALENDARIO SETTIMANE (nuovo) --------------------
   Sostituisce l'8 settimane fisse con una timeline ancorata a OGGI:
   S+1..S+12 in avanti (limite richiesto), storico illimitato all'indietro,
   generato pigramente quando l'atleta/coach naviga. */
// Data in formato YYYY-MM-DD LOCALE, mai da toISOString() — che converte
// sempre in UTC e sposta la data di un giorno indietro per chiunque sia in un
// fuso positivo (Italia inclusa) nelle ore vicine alla mezzanotte locale.
// mondayOf/addWeeksToDate qui sotto lavorano già correttamente in locale
// (setDate/setHours), il bug era solo nella conversione a stringa finale.
function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addWeeksToDate(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}
function weekKeyForOffset(offset) {
  const monday = addWeeksToDate(mondayOf(new Date()), offset);
  return toLocalISODate(monday);
}
function weekRangeLabel(offset) {
  const start = addWeeksToDate(mondayOf(new Date()), offset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)}`;
}
const MAX_FORWARD_WEEKS = 12;

/* Reparto colore del pallino settimana:
   giallo  = settimana passata (storico, sempre navigabile)
   verde   = settimana presente/futura con tutte le sezioni richieste dal
             piano confermate (Full Coaching: allenamento+dieta+integratori;
             Solo Allenamento/Scheda: solo allenamento)
   rosso   = settimana presente/futura ancora da completare per l'atleta   */
function weekDeptColor(offset, week, planTier) {
  if (offset < 0) return "yellow";
  const required = planTier === "full" ? ["workout", "diet", "supplements"] : ["workout"];
  return required.every((k) => week.confirmed[k]) ? "green" : "red";
}

/* ==========================================================================
   GENERAZIONE PREDITTIVA TOTALE — "L'AI calcola tutto"
   Motore deterministico evidence-based (Mifflin-St Jeor + moltiplicatori
   di attività standard + target di macro per obiettivo), NON una chiamata
   a un modello linguistico. Coerente con la regola di progetto "il Claude
   API non va mai chiamato direttamente dal client in produzione": qui non
   simulo affatto una chiamata AI, uso la stessa matematica evidence-based
   che già guida il resto del metodo (TDEE reale, non un numero a caso).
   Se in futuro vuoi che sia davvero un modello a generare i pasti (varietà,
   linguaggio naturale nelle note), va proxato via Supabase Edge Function
   esattamente come il PerformAIChat di NewsTipsView.jsx.
   ========================================================================== */

/* Database alimentare — versione più ricca finora, in 4 fasce di attendibilità:
   1) i 10 alimenti base già approvati in chat precedenti su questo progetto
      (FOOD_DB del monolite/HomeDashboard) — invariati, stesso nome e valori.
   2) gli 8 prodotti confezionati REALI dello SCAN_POOL di 05_HomeDashboard.jsx
      (quello che simula la scansione con codice a barre che "allarga il
      database man mano che i clienti inseriscono gli alimenti") — presi
      verbatim da quella chat, non inventati qui.
   3-4) ~50 alimenti generici molto comuni (cereali, tuberi, carne, pesce,
      proteine vegetali, legumi, latticini, uova, frutta, verdura, semi e
      grassi) con valori nutrizionali standard ampiamente noti (tipo tabelle
      USDA/CREA per 100 g di parte edibile) — non sono dati di brand o
      proprietari, sono fatti nutrizionali di dominio pubblico. Segnati
      `std:true` per trasparenza: se preferisci i valori esatti del tuo
      database Supabase reale, basta che me li mandi e sostituisco questi.
   Ogni alimento ha `tags` che dicono in quali pasti ha senso comparire:
   "breakfast" (colazione), "lunch_dinner" (pranzo/cena), "snack" (spuntino).
   È questo — non il caso — a impedire abbinamenti assurdi tipo pollo+avena:
   il generatore pesca SEMPRE dal sottoinsieme di alimenti taggati per quel
   pasto, mai dall'intero database. */
const FOOD_DB = [
  // ---- 1) Base reale (10) ----
  { name: "Riso Basmati", kcal: 350, c: 78, p: 8, f: 1, tags: ["lunch_dinner"] },
  { name: "Avena in fiocchi", kcal: 370, c: 60, p: 13, f: 7, tags: ["breakfast"] },
  { name: "Gallette di riso", kcal: 380, c: 82, p: 8, f: 1, tags: ["breakfast", "snack"] },
  { name: "Petto di pollo", kcal: 110, c: 0, p: 23, f: 1, tags: ["lunch_dinner"] },
  { name: "Fesa di tacchino", kcal: 105, c: 0, p: 24, f: 1, tags: ["lunch_dinner"] },
  { name: "Albume d'uovo", kcal: 50, c: 0, p: 11, f: 0, tags: ["breakfast", "lunch_dinner"] },
  { name: "Salmone fresco", kcal: 200, c: 0, p: 20, f: 13, tags: ["lunch_dinner"] },
  { name: "Olio EVO", kcal: 900, c: 0, p: 0, f: 100, tags: ["breakfast", "lunch_dinner", "snack"] },
  { name: "Mandorle", kcal: 600, c: 10, p: 20, f: 50, tags: ["breakfast", "snack"] },
  { name: "Fiocchi di latte light", kcal: 80, c: 3, p: 12, f: 2, tags: ["breakfast", "snack"] },
  // ---- 2) Scansionati reali (8, da SCAN_POOL) ----
  { name: "Yogurt Bianco Intero", kcal: 66, c: 4.7, p: 3.5, f: 3.6, tags: ["breakfast", "snack"] },
  { name: "Fette Biscottate Integrali", kcal: 400, c: 72, p: 10, f: 8, tags: ["breakfast"] },
  { name: "Barretta Proteica", kcal: 380, c: 35, p: 30, f: 12, tags: ["snack"] },
  { name: "Hummus di Ceci", kcal: 166, c: 14, p: 8, f: 9.6, tags: ["snack", "lunch_dinner"] },
  { name: "Gallette di Riso Integrale", kcal: 387, c: 82, p: 8, f: 3, tags: ["snack"] },
  { name: "Formaggio Spalmabile Light", kcal: 155, c: 4, p: 11, f: 11, tags: ["breakfast", "snack"] },
  { name: "Cracker Integrali", kcal: 421, c: 68, p: 10, f: 12, tags: ["snack"] },
  { name: "Latte Parzialmente Scremato", kcal: 46, c: 4.8, p: 3.3, f: 1.5, tags: ["breakfast"] },
  // ---- 3) Generici standard, per varietà e abbinamenti sensati ----
  { name: "Pasta integrale", kcal: 348, c: 68, p: 13, f: 2.5, tags: ["lunch_dinner"], std: true },
  { name: "Pane integrale", kcal: 250, c: 46, p: 9, f: 3, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Patate", kcal: 77, c: 17, p: 2, f: 0.1, tags: ["lunch_dinner"], std: true },
  { name: "Ceci cotti", kcal: 164, c: 27, p: 9, f: 2.6, tags: ["lunch_dinner"], std: true },
  { name: "Lenticchie cotte", kcal: 116, c: 20, p: 9, f: 0.4, tags: ["lunch_dinner"], std: true },
  { name: "Tonno al naturale", kcal: 116, c: 0, p: 26, f: 1, tags: ["lunch_dinner", "snack"], std: true },
  { name: "Uovo intero", kcal: 143, c: 1, p: 13, f: 10, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Parmigiano Reggiano", kcal: 392, c: 0, p: 33, f: 28, tags: ["lunch_dinner"], std: true },
  { name: "Ricotta vaccina", kcal: 146, c: 3, p: 8.8, f: 10, tags: ["breakfast", "snack"], std: true },
  { name: "Avocado", kcal: 160, c: 9, p: 2, f: 15, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Banana", kcal: 89, c: 23, p: 1.1, f: 0.3, tags: ["breakfast", "snack"], std: true },
  { name: "Mela", kcal: 52, c: 14, p: 0.3, f: 0.2, tags: ["snack"], std: true },
  { name: "Broccoli", kcal: 34, c: 7, p: 2.8, f: 0.4, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Zucchine", kcal: 17, c: 3.1, p: 1.2, f: 0.3, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Spinaci", kcal: 23, c: 3.6, p: 2.9, f: 0.4, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Pomodori", kcal: 18, c: 3.9, p: 0.9, f: 0.2, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Burro d'arachidi", kcal: 588, c: 20, p: 25, f: 50, tags: ["breakfast", "snack"], std: true },
  { name: "Noci", kcal: 654, c: 14, p: 15, f: 65, tags: ["snack"], std: true },

  // ---- 4) Ampliamento massimo (standard, dominio pubblico) ----
  // Cereali e tuberi
  { name: "Farro perlato cotto", kcal: 121, c: 26, p: 5, f: 0.8, tags: ["lunch_dinner"], std: true },
  { name: "Orzo perlato cotto", kcal: 123, c: 28, p: 2.3, f: 0.4, tags: ["lunch_dinner"], std: true },
  { name: "Quinoa cotta", kcal: 120, c: 21, p: 4.4, f: 1.9, tags: ["lunch_dinner"], std: true },
  { name: "Cous cous cotto", kcal: 112, c: 23, p: 3.8, f: 0.2, tags: ["lunch_dinner"], std: true },
  { name: "Riso integrale cotto", kcal: 111, c: 23, p: 2.6, f: 0.9, tags: ["lunch_dinner"], std: true },
  { name: "Pane comune", kcal: 275, c: 56, p: 8, f: 1, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Patate dolci", kcal: 86, c: 20, p: 1.6, f: 0.1, tags: ["lunch_dinner"], std: true },
  { name: "Mais dolce", kcal: 86, c: 19, p: 3.2, f: 1.2, tags: ["lunch_dinner"], std: true, veggie: true },
  // Carne e pesce
  { name: "Manzo magro (fesa)", kcal: 133, c: 0, p: 21, f: 5, tags: ["lunch_dinner"], std: true },
  { name: "Vitello magro", kcal: 107, c: 0, p: 21, f: 2.5, tags: ["lunch_dinner"], std: true },
  { name: "Lonza di maiale", kcal: 143, c: 0, p: 22, f: 6, tags: ["lunch_dinner"], std: true },
  { name: "Merluzzo/Nasello", kcal: 82, c: 0, p: 18, f: 0.7, tags: ["lunch_dinner"], std: true },
  { name: "Orata/Branzino", kcal: 100, c: 0, p: 20, f: 2, tags: ["lunch_dinner"], std: true },
  { name: "Gamberetti", kcal: 71, c: 0.9, p: 17, f: 0.5, tags: ["lunch_dinner"], std: true },
  // Proteine vegetali (colmano il limite del vegano segnalato in chat precedente)
  { name: "Tofu", kcal: 76, c: 1.9, p: 8, f: 4.8, tags: ["lunch_dinner", "snack"], std: true },
  { name: "Tempeh", kcal: 193, c: 9.4, p: 19, f: 11, tags: ["lunch_dinner"], std: true },
  { name: "Seitan", kcal: 370, c: 14, p: 75, f: 1.9, tags: ["lunch_dinner"], std: true },
  { name: "Edamame", kcal: 121, c: 9.9, p: 11, f: 5, tags: ["snack", "lunch_dinner"], std: true },
  // Legumi
  { name: "Fagioli borlotti cotti", kcal: 127, c: 20, p: 8.7, f: 0.5, tags: ["lunch_dinner"], std: true },
  { name: "Fagioli cannellini cotti", kcal: 130, c: 20, p: 9, f: 0.5, tags: ["lunch_dinner"], std: true },
  { name: "Piselli cotti", kcal: 81, c: 14, p: 5.4, f: 0.4, tags: ["lunch_dinner"], std: true, veggie: true },
  // Latticini e uova
  { name: "Skyr", kcal: 63, c: 4, p: 11, f: 0.2, tags: ["breakfast", "snack"], std: true },
  { name: "Kefir", kcal: 41, c: 4.5, p: 3.4, f: 1, tags: ["breakfast", "snack"], std: true },
  { name: "Mozzarella", kcal: 253, c: 0.8, p: 18.7, f: 19.5, tags: ["lunch_dinner"], std: true },
  { name: "Burro", kcal: 717, c: 0.1, p: 0.9, f: 81, tags: ["breakfast"], std: true },
  // Frutta
  { name: "Arancia", kcal: 47, c: 12, p: 0.9, f: 0.1, tags: ["snack"], std: true },
  { name: "Kiwi", kcal: 61, c: 15, p: 1.1, f: 0.5, tags: ["snack"], std: true },
  { name: "Fragole", kcal: 32, c: 7.7, p: 0.7, f: 0.3, tags: ["snack"], std: true },
  { name: "Ananas", kcal: 50, c: 13, p: 0.5, f: 0.1, tags: ["snack"], std: true },
  { name: "Mirtilli", kcal: 57, c: 14, p: 0.7, f: 0.3, tags: ["snack"], std: true },
  { name: "Uva", kcal: 69, c: 18, p: 0.6, f: 0.2, tags: ["snack"], std: true },
  // Verdura
  { name: "Carote", kcal: 41, c: 10, p: 0.9, f: 0.2, tags: ["lunch_dinner", "snack"], std: true, veggie: true },
  { name: "Peperoni", kcal: 31, c: 6, p: 1, f: 0.3, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Melanzane", kcal: 25, c: 6, p: 1, f: 0.2, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Cavolfiore", kcal: 25, c: 5, p: 1.9, f: 0.3, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Funghi champignon", kcal: 22, c: 3.3, p: 3.1, f: 0.3, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Insalata mista", kcal: 15, c: 2.9, p: 1.4, f: 0.2, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Cetrioli", kcal: 15, c: 3.6, p: 0.7, f: 0.1, tags: ["lunch_dinner"], std: true, veggie: true },
  // Grassi e semi
  { name: "Semi di chia", kcal: 486, c: 42, p: 17, f: 31, tags: ["breakfast", "snack"], std: true },
  { name: "Semi di lino", kcal: 534, c: 29, p: 18, f: 42, tags: ["breakfast", "snack"], std: true },
  { name: "Anacardi", kcal: 553, c: 30, p: 18, f: 44, tags: ["snack"], std: true },
  { name: "Nocciole", kcal: 628, c: 17, p: 15, f: 61, tags: ["snack"], std: true },
  // ---- 5) Seconda ondata di ampliamento ----
  { name: "Prosciutto crudo magro", kcal: 159, c: 0, p: 28, f: 5, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Prosciutto cotto magro", kcal: 109, c: 1, p: 18, f: 3, tags: ["breakfast", "lunch_dinner"], std: true },
  { name: "Bresaola", kcal: 151, c: 0.4, p: 32, f: 2.6, tags: ["lunch_dinner", "snack"], std: true },
  { name: "Sgombro", kcal: 190, c: 0, p: 19, f: 12, tags: ["lunch_dinner"], std: true },
  { name: "Tonno fresco", kcal: 130, c: 0, p: 25, f: 3, tags: ["lunch_dinner"], std: true },
  { name: "Vongole", kcal: 72, c: 2.6, p: 12, f: 1, tags: ["lunch_dinner"], std: true },
  { name: "Fave cotte", kcal: 88, c: 13, p: 7.5, f: 0.6, tags: ["lunch_dinner"], std: true },
  { name: "Yogurt Greco 0%", kcal: 59, c: 3.6, p: 10, f: 0.4, tags: ["breakfast", "snack"], std: true },
  { name: "Latte di soia", kcal: 33, c: 1.8, p: 3.3, f: 1.8, tags: ["breakfast"], std: true },
  { name: "Latte di mandorla", kcal: 24, c: 2.6, p: 0.4, f: 1.1, tags: ["breakfast"], std: true },
  { name: "Cavolo cappuccio", kcal: 25, c: 5.8, p: 1.3, f: 0.1, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Rucola", kcal: 25, c: 2.1, p: 2.6, f: 0.7, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Sedano", kcal: 16, c: 3, p: 0.7, f: 0.2, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Finocchi", kcal: 31, c: 7.3, p: 1.2, f: 0.2, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Cipolle", kcal: 26, c: 6.1, p: 1, f: 0.1, tags: ["lunch_dinner"], std: true, veggie: true },
  { name: "Pesche", kcal: 39, c: 9.5, p: 0.9, f: 0.3, tags: ["snack"], std: true },
  { name: "Pere", kcal: 57, c: 15, p: 0.4, f: 0.1, tags: ["snack"], std: true },
  { name: "Cocco fresco", kcal: 354, c: 15, p: 3.3, f: 33, tags: ["snack"], std: true },
  { name: "Semi di girasole", kcal: 584, c: 20, p: 21, f: 51, tags: ["snack"], std: true },
  { name: "Semi di zucca", kcal: 559, c: 15, p: 30, f: 49, tags: ["snack"], std: true },
  { name: "Pistacchi", kcal: 562, c: 28, p: 21, f: 45, tags: ["snack"], std: true },
  { name: "Miele", kcal: 304, c: 82, p: 0.3, f: 0, tags: ["breakfast"], std: true },
  { name: "Piadina integrale", kcal: 280, c: 45, p: 8, f: 8, tags: ["lunch_dinner"], std: true },
  { name: "Grissini", kcal: 431, c: 68, p: 11, f: 12, tags: ["snack"], std: true },
  { name: "Pane di segale", kcal: 259, c: 48, p: 8, f: 2, tags: ["breakfast", "lunch_dinner"], std: true },
];
const foodByName = (name) => FOOD_DB.find((f) => f.name === name) || FOOD_DB[0];

/* ==========================================================================
   MICRONUTRIENTI — Sodio, Potassio, Ferro, Calcio, Magnesio per 100 g.
   Valori di riferimento standard (tabelle nutrizionali generiche tipo
   USDA/CREA), non dati proprietari — stessa provenienza dichiarata già
   usata per kcal/macros. Copre tutti i 100 alimenti del FOOD_DB. na=sodio
   mg, k=potassio mg, fe=ferro mg, ca=calcio mg, mg=magnesio mg (per 100 g). */
const MICRO_PER_100G = {
  "Riso Basmati": { na: 1, k: 95, fe: 0.8, ca: 10, mg: 25 },
  "Avena in fiocchi": { na: 2, k: 430, fe: 4.7, ca: 55, mg: 145 },
  "Gallette di riso": { na: 10, k: 110, fe: 1.2, ca: 8, mg: 45 },
  "Petto di pollo": { na: 65, k: 320, fe: 0.7, ca: 12, mg: 27 },
  "Fesa di tacchino": { na: 55, k: 300, fe: 0.8, ca: 10, mg: 24 },
  "Albume d'uovo": { na: 166, k: 163, fe: 0.1, ca: 7, mg: 11 },
  "Salmone fresco": { na: 60, k: 380, fe: 0.5, ca: 12, mg: 27 },
  "Olio EVO": { na: 0, k: 1, fe: 0.6, ca: 1, mg: 0 },
  "Mandorle": { na: 1, k: 730, fe: 3.7, ca: 264, mg: 270 },
  "Fiocchi di latte light": { na: 350, k: 90, fe: 0.1, ca: 90, mg: 8 },
  "Yogurt Bianco Intero": { na: 46, k: 155, fe: 0.1, ca: 121, mg: 12 },
  "Fette Biscottate Integrali": { na: 400, k: 210, fe: 2.5, ca: 30, mg: 60 },
  "Barretta Proteica": { na: 250, k: 180, fe: 2, ca: 100, mg: 40 },
  "Hummus di Ceci": { na: 380, k: 230, fe: 1.6, ca: 45, mg: 35 },
  "Gallette di Riso Integrale": { na: 6, k: 120, fe: 1.5, ca: 10, mg: 50 },
  "Formaggio Spalmabile Light": { na: 320, k: 90, fe: 0.1, ca: 110, mg: 8 },
  "Cracker Integrali": { na: 620, k: 200, fe: 2.2, ca: 30, mg: 55 },
  "Latte Parzialmente Scremato": { na: 44, k: 150, fe: 0.05, ca: 120, mg: 11 },
  "Pasta integrale": { na: 3, k: 150, fe: 1.5, ca: 20, mg: 55 },
  "Pane integrale": { na: 450, k: 230, fe: 2.5, ca: 40, mg: 65 },
  "Patate": { na: 6, k: 420, fe: 0.8, ca: 10, mg: 23 },
  "Ceci cotti": { na: 240, k: 290, fe: 2.9, ca: 49, mg: 48 },
  "Lenticchie cotte": { na: 2, k: 370, fe: 3.3, ca: 19, mg: 36 },
  "Tonno al naturale": { na: 250, k: 260, fe: 1, ca: 10, mg: 30 },
  "Uovo intero": { na: 140, k: 138, fe: 1.8, ca: 56, mg: 12 },
  "Parmigiano Reggiano": { na: 650, k: 100, fe: 0.8, ca: 1160, mg: 44 },
  "Ricotta vaccina": { na: 84, k: 105, fe: 0.4, ca: 295, mg: 11 },
  "Avocado": { na: 7, k: 485, fe: 0.6, ca: 12, mg: 29 },
  "Banana": { na: 1, k: 358, fe: 0.3, ca: 5, mg: 27 },
  "Mela": { na: 1, k: 107, fe: 0.1, ca: 6, mg: 5 },
  "Broccoli": { na: 33, k: 316, fe: 0.7, ca: 47, mg: 21 },
  "Zucchine": { na: 8, k: 261, fe: 0.4, ca: 16, mg: 18 },
  "Spinaci": { na: 79, k: 558, fe: 2.7, ca: 99, mg: 79 },
  "Pomodori": { na: 5, k: 237, fe: 0.3, ca: 10, mg: 11 },
  "Burro d'arachidi": { na: 17, k: 649, fe: 1.9, ca: 43, mg: 168 },
  "Noci": { na: 2, k: 441, fe: 2.9, ca: 98, mg: 158 },
  "Farro perlato cotto": { na: 3, k: 130, fe: 1.3, ca: 15, mg: 32 },
  "Orzo perlato cotto": { na: 3, k: 93, fe: 1.3, ca: 11, mg: 22 },
  "Quinoa cotta": { na: 7, k: 172, fe: 1.5, ca: 17, mg: 64 },
  "Cous cous cotto": { na: 6, k: 58, fe: 0.4, ca: 8, mg: 8 },
  "Riso integrale cotto": { na: 4, k: 86, fe: 0.4, ca: 4, mg: 39 },
  "Pane comune": { na: 490, k: 100, fe: 1.5, ca: 30, mg: 25 },
  "Patate dolci": { na: 55, k: 337, fe: 0.6, ca: 30, mg: 25 },
  "Mais dolce": { na: 15, k: 270, fe: 0.5, ca: 2, mg: 37 },
  "Manzo magro (fesa)": { na: 55, k: 340, fe: 2.1, ca: 5, mg: 21 },
  "Vitello magro": { na: 65, k: 330, fe: 1, ca: 8, mg: 22 },
  "Lonza di maiale": { na: 55, k: 360, fe: 0.9, ca: 6, mg: 22 },
  "Merluzzo/Nasello": { na: 70, k: 300, fe: 0.3, ca: 15, mg: 24 },
  "Orata/Branzino": { na: 65, k: 330, fe: 0.4, ca: 15, mg: 28 },
  "Gamberetti": { na: 300, k: 260, fe: 0.5, ca: 60, mg: 30 },
  "Tofu": { na: 7, k: 121, fe: 1.6, ca: 350, mg: 30 },
  "Tempeh": { na: 9, k: 412, fe: 2.7, ca: 111, mg: 81 },
  "Seitan": { na: 20, k: 60, fe: 5, ca: 20, mg: 20 },
  "Edamame": { na: 6, k: 436, fe: 2.3, ca: 63, mg: 64 },
  "Fagioli borlotti cotti": { na: 2, k: 340, fe: 2.2, ca: 40, mg: 42 },
  "Fagioli cannellini cotti": { na: 2, k: 340, fe: 2.5, ca: 55, mg: 43 },
  "Piselli cotti": { na: 3, k: 244, fe: 1.5, ca: 25, mg: 33 },
  "Skyr": { na: 45, k: 130, fe: 0.05, ca: 110, mg: 10 },
  "Kefir": { na: 40, k: 145, fe: 0.05, ca: 120, mg: 12 },
  "Mozzarella": { na: 300, k: 95, fe: 0.4, ca: 515, mg: 20 },
  "Burro": { na: 11, k: 24, fe: 0.02, ca: 24, mg: 2 },
  "Arancia": { na: 0, k: 181, fe: 0.1, ca: 40, mg: 10 },
  "Kiwi": { na: 3, k: 312, fe: 0.3, ca: 34, mg: 17 },
  "Fragole": { na: 1, k: 153, fe: 0.4, ca: 16, mg: 13 },
  "Ananas": { na: 1, k: 109, fe: 0.3, ca: 13, mg: 12 },
  "Mirtilli": { na: 1, k: 77, fe: 0.3, ca: 6, mg: 6 },
  "Uva": { na: 2, k: 191, fe: 0.4, ca: 10, mg: 7 },
  "Carote": { na: 69, k: 320, fe: 0.3, ca: 33, mg: 12 },
  "Peperoni": { na: 3, k: 211, fe: 0.4, ca: 10, mg: 12 },
  "Melanzane": { na: 2, k: 229, fe: 0.2, ca: 9, mg: 14 },
  "Cavolfiore": { na: 30, k: 300, fe: 0.4, ca: 22, mg: 15 },
  "Funghi champignon": { na: 5, k: 318, fe: 0.5, ca: 3, mg: 9 },
  "Insalata mista": { na: 28, k: 194, fe: 0.9, ca: 36, mg: 13 },
  "Cetrioli": { na: 2, k: 147, fe: 0.3, ca: 16, mg: 13 },
  "Semi di chia": { na: 16, k: 407, fe: 7.7, ca: 631, mg: 335 },
  "Semi di lino": { na: 30, k: 813, fe: 5.7, ca: 255, mg: 392 },
  "Anacardi": { na: 12, k: 565, fe: 6.7, ca: 37, mg: 292 },
  "Nocciole": { na: 0, k: 680, fe: 4.7, ca: 114, mg: 163 },
  "Prosciutto crudo magro": { na: 1500, k: 300, fe: 1.4, ca: 12, mg: 20 },
  "Prosciutto cotto magro": { na: 900, k: 300, fe: 0.7, ca: 6, mg: 15 },
  "Bresaola": { na: 1500, k: 330, fe: 3, ca: 10, mg: 24 },
  "Sgombro": { na: 90, k: 314, fe: 1.6, ca: 12, mg: 76 },
  "Tonno fresco": { na: 40, k: 350, fe: 0.9, ca: 8, mg: 30 },
  "Vongole": { na: 600, k: 314, fe: 13.9, ca: 60, mg: 33 },
  "Fave cotte": { na: 3, k: 330, fe: 1.5, ca: 27, mg: 40 },
  "Yogurt Greco 0%": { na: 36, k: 141, fe: 0.05, ca: 110, mg: 11 },
  "Latte di soia": { na: 51, k: 118, fe: 0.6, ca: 120, mg: 18 },
  "Latte di mandorla": { na: 40, k: 40, fe: 0.3, ca: 120, mg: 6 },
  "Cavolo cappuccio": { na: 18, k: 170, fe: 0.5, ca: 40, mg: 12 },
  "Rucola": { na: 27, k: 369, fe: 1.5, ca: 160, mg: 47 },
  "Sedano": { na: 80, k: 260, fe: 0.2, ca: 40, mg: 11 },
  "Finocchi": { na: 52, k: 414, fe: 0.7, ca: 49, mg: 17 },
  "Cipolle": { na: 4, k: 146, fe: 0.2, ca: 23, mg: 10 },
  "Pesche": { na: 0, k: 190, fe: 0.3, ca: 6, mg: 9 },
  "Pere": { na: 1, k: 116, fe: 0.2, ca: 9, mg: 7 },
  "Cocco fresco": { na: 20, k: 356, fe: 2.4, ca: 14, mg: 32 },
  "Semi di girasole": { na: 9, k: 645, fe: 5.3, ca: 78, mg: 325 },
  "Semi di zucca": { na: 7, k: 809, fe: 8.8, ca: 46, mg: 592 },
  "Pistacchi": { na: 1, k: 1025, fe: 3.9, ca: 105, mg: 121 },
  "Miele": { na: 4, k: 52, fe: 0.4, ca: 6, mg: 2 },
  "Piadina integrale": { na: 500, k: 150, fe: 2, ca: 40, mg: 35 },
  "Grissini": { na: 700, k: 150, fe: 2.5, ca: 30, mg: 30 },
  "Pane di segale": { na: 500, k: 200, fe: 2, ca: 30, mg: 40 },
};
const microFor = (name) => MICRO_PER_100G[name] || { na: 0, k: 0, fe: 0, ca: 0, mg: 0 };

function itemMicros(item) {
  const micro = item.foodKey ? microFor(item.foodKey) : { na: 0, k: 0, fe: 0, ca: 0, mg: 0 };
  const factor = (Number(item.grams) || 0) / 100;
  return { na: micro.na * factor, k: micro.k * factor, fe: micro.fe * factor, ca: micro.ca * factor, mg: micro.mg * factor };
}
function mealMicros(meal) {
  return (meal.items || []).reduce((acc, it) => {
    const m = itemMicros(it);
    return { na: acc.na + m.na, k: acc.k + m.k, fe: acc.fe + m.fe, ca: acc.ca + m.ca, mg: acc.mg + m.mg };
  }, { na: 0, k: 0, fe: 0, ca: 0, mg: 0 });
}
function dayMicros(meals) {
  return (meals || []).reduce((acc, meal) => {
    const m = mealMicros(meal);
    return { na: acc.na + m.na, k: acc.k + m.k, fe: acc.fe + m.fe, ca: acc.ca + m.ca, mg: acc.mg + m.mg };
  }, { na: 0, k: 0, fe: 0, ca: 0, mg: 0 });
}

/* Target giornalieri di riferimento (LARN/EFSA/RDA — standard, non
   proprietari). Ferro e Magnesio dipendono dal genere per la vera
   fisiologia (fabbisogno di ferro nelle donne in età fertile quasi doppio
   rispetto agli uomini): trattarli come un unico numero per tutti sarebbe
   clinicamente sbagliato, non solo una semplificazione. */
function microTargets(client) {
  const female = client.gender === "F";
  return {
    na: { limit: 2300, label: "Sodio", unit: "mg", mode: "limit" }, // qui il rischio è l'ECCESSO, non la carenza — vedi nota nel pannello
    k: { limit: 3500, label: "Potassio", unit: "mg", mode: "rda" },
    fe: { limit: female ? 18 : 8, label: "Ferro", unit: "mg", mode: "rda" },
    ca: { limit: 1000, label: "Calcio", unit: "mg", mode: "rda" },
    mg: { limit: female ? 310 : 400, label: "Magnesio", unit: "mg", mode: "rda" },
  };
}

/* Alimenti "densi" per ciascun micronutriente, usati dal generatore dieta
   per compensare le carenze rilevate (vedi Master Prompt nutrizionale). */
const MICRO_RICH_FOODS = {
  k: ["Patate dolci", "Patate", "Banana", "Spinaci", "Avocado", "Finocchi"],
  fe: ["Manzo magro (fesa)", "Spinaci", "Lenticchie cotte", "Ceci cotti", "Vongole", "Seitan"],
  ca: ["Fiocchi di latte light", "Yogurt Greco 0%", "Parmigiano Reggiano", "Ricotta vaccina", "Mozzarella", "Tofu"],
  mg: ["Mandorle", "Semi di chia", "Semi di zucca", "Noci", "Anacardi", "Sgombro"],
};



/* NOTA ARCHITETTURALE — il collegamento vero con la Home dei clienti.
   Questo file è isolato con dati locali (per la stessa ragione di sempre:
   anteprima leggera, un file alla volta). Non posso letteralmente importare
   05_HomeDashboard.jsx qui dentro. Il ponte reale che avevi già progettato
   nella chat sullo schema SQL è la tabella Supabase `global_food_database`:
   sia il diario del cliente (scanner/inserimento manuale) sia questo
   FOOD_DB dovrebbero leggere/scrivere la STESSA tabella invece di avere due
   array locali che possono disallinearsi. In produzione: il client scrive
   una riga in `global_food_database` quando scansiona un prodotto nuovo,
   il coach la legge qui con una query invece che da questo array hardcoded.
   In questa anteprima ho fatto il possibile: ho incorporato gli 8 alimenti
   REALI che il tuo scanner in 05_HomeDashboard.jsx già genera (SCAN_POOL),
   così il contenuto è già coerente — manca solo il collegamento a runtime,
   che è un lavoro di backend (Supabase), non di questo componente React. */

/* ============================================================================
   MASTER PROMPT DI SISTEMA — BLINDATI NEL CODICE
   Due system prompt distinti, uno per dominio clinico, che condizionano le
   due AI del progetto. Sono costanti, non modificabili da chi usa l'app —
   esattamente il senso di "blindato nel codice".
   TRASPARENZA ARCHITETTURALE (nota unica, valida per entrambi): questo file
   è isolato senza client Supabase/Claude configurato. Il Master Prompt qui
   sotto è il testo ESATTO che una vera Edge Function invierebbe a Claude —
   la funzione `callPerformAI()` qui sotto mostra la chiamata reale (commentata,
   pronta all'uso) e NON viene eseguita in questa anteprima. Quello che genera
   davvero i piani a schermo resta il motore deterministico già esistente
   (TDEE Mifflin-St Jeor, solutore macro esatto, combo curati, Mesociclo con
   esclusioni per dolore) — che ora applica esplicitamente le regole cliniche
   elencate nel Master Prompt, così il comportamento è coerente sia che tu
   stia usando il motore locale sia che in futuro tu lo sostituisca con la
   vera chiamata Claude via Edge Function. */
const NUTRITION_MASTER_PROMPT = `Sei un'autorità mondiale in biochimica, nutrizione sportiva d'élite ed endocrinologia applicata. Il tuo compito è generare la Dieta a 6 Pasti (Giorno ON/OFF) per un cliente di coaching e consigliare al coach come farla evolvere nel tempo, seguendo queste regole non negoziabili:

1. Analizza rigorosamente la Cartella Anamnesi a 56 domande del soggetto (allergie, intolleranze, gusti dichiarati, regime alimentare, patologie, storico alimentare) prima di scegliere un solo alimento.
2. Seleziona ESCLUSIVAMENTE alimenti tollerati e preferiti dal soggetto. Un alimento in foodDislikes/cibiNo non compare mai, nemmeno come fallback.
3. Calcola i grammi come numeri applicabili reali (multipli di 5 g quando possibile) e fai quadrare macro e calorie ai target impostati con la formula 4-4-9 kcal (Proteine 4, Carboidrati 4, Grassi 9) — mai un'approssimazione che sfori il target.
4. Distribuisci le fonti proteiche per colpire la soglia di leucina ottimale a pasto (~8.5% della quota proteica animale, soglia di stimolazione mTOR riconosciuta in letteratura, Norton & Layman) — non limitarti a colpire i grammi di proteina totale, verifica che ogni pasto principale abbia una fonte proteica sufficientemente concentrata da superare quella soglia.
5. Dividi l'integrazione in 4 momenti biologici — Mattina, Pranzo, Pre/Post-Workout, Sera/Pre-nanna — per ottimizzare l'HRV e ridurre il cortisolo, non in una lista piatta senza logica circadiana.
6. Leggi le 5 barre di Analisi Micronutrienti del soggetto (Sodio, Potassio, Ferro, Calcio, Magnesio) e, per ogni carenza rilevata, seleziona automaticamente alimenti densi in quel fattore tra quelli tollerati (es. patate dolci o patate per il Potassio, mandorle o semi di zucca nel pasto Sera/Pre-nanna per il Magnesio, manzo magro o lenticchie per il Ferro, fiocchi di latte o yogurt greco per il Calcio) — senza mai violare macro, calorie o gusti già fissati ai punti precedenti. Il Sodio è l'unica eccezione: qui il rischio è l'ECCESSO (cibi processati + bustine da 1g), quindi in caso di sforamento riduci le fonti più sodiche, non aumentarle.
7. Monitora la costanza di peso e circonferenza addominale nel tempo insieme all'aderenza dichiarata ai macros: quando rilevi uno stallo, NON proporre sempre e solo un taglio calorico. Scegli tra quattro leve in base a quanto deficit l'atleta ha già accumulato rispetto al suo TDEE stimato — Refeed di carboidrati mirato (1-2 giorni, per la leptina) se il deficit è moderato; Diet Break a calorie di mantenimento (7-10 giorni) se il deficit è già profondo, prima di tagliare oltre; innalzamento del NEAT (passi quotidiani) se il deficit è ancora leggero ma l'attività spontanea è sotto la baseline attesa; solo come ultima opzione un taglio calorico ad hoc. Motiva sempre la scelta con il numero, non a sensazione.

Rispondi solo con il piano strutturato (pasti, alimenti, grammi, note) e — quando richiesto — con la strategia di sblocco stallo motivata, mai con considerazioni generiche non richieste.`;

const TRAINING_MASTER_PROMPT = `Sei un luminare in chinesiologia, biomeccanica e metodologia dell'allenamento per Bodybuilding, Powerlifting, Fitness e recupero infortuni. Il tuo compito è generare il Mesociclo a 12 settimane per un cliente di coaching e consigliare al coach come farlo evolvere nel tempo, seguendo queste regole non negoziabili:

1. Analizza i check del lunedì (foto comparative, variazione di peso e circonferenza addominale nel tempo) e lo storico di dolori articolari su scala 1-10 prima di scegliere un solo esercizio.
2. Seleziona gli esercizi in base alle curve di carico idonee alla struttura del soggetto (leve, mobilità, storico infortuni) — mai un esercizio a rischio per la zona dolente segnalata, qualunque sia il livello dichiarato.
3. Applica la mappa dei volumi settimanali sui 14 distretti separati (Petto, Trapezio, Dorsali, Deltoide Anteriore, Deltoide Laterale, Deltoide Posteriore, Bicipiti, Tricipiti, Quadricipiti, Femorali, Adduttori, Glutei, Polpacci, Addominali), calcolando Serie Dirette (100%) e Serie Sinergiche/Indirette (50%) per ogni gruppo muscolare coinvolto, con l'obiettivo dichiarato di massimizzare l'estetica evitando infortuni — non solo la forza grezza.
4. Integra tempi di recupero e tecniche d'intensità (Rest-Pause, Drop-set, Stripping, Super-set) calibrate sul livello dell'atleta — mai tecniche avanzate su un principiante, mai un piano piatto senza intensità su un atleta avanzato.
5. Sorveglia l'HRV nel tempo insieme allo stress percepito: quando l'HRV crolla rispetto alla media recente E lo stress è alto, segnala al coach un Deload mirato del Sistema Nervoso Centrale (riduzione di volume e/o intensità per una settimana) PRIMA che l'atleta arrivi al sovrallenamento conclamato — non dopo.
6. Mostra sempre una bozza modificabile dal coach prima di qualunque applicazione definitiva — non sovrascrivere mai la settimana senza approvazione esplicita.

Rispondi solo con il piano strutturato (giorni, esercizi, serie, tecniche, note) e — quando richiesto — con l'allerta di deload motivata dal dato, mai con considerazioni generiche non richieste.`;

/* Chiamata reale che l'Edge Function Supabase dovrebbe eseguire verso Claude,
   iniettando il Master Prompt come system prompt. Commentata di proposito:
   in questo file isolato non esiste un client per invocarla davvero. */
async function callPerformAI(kind, payload) {
  // const systemPrompt = kind === "nutrition" ? NUTRITION_MASTER_PROMPT : TRAINING_MASTER_PROMPT;
  // const { data, error } = await supabase.functions.invoke('generate-plan', {
  //   body: { system: systemPrompt, kind, payload },
  // });
  // // La Edge Function, lato server, chiama poi:
  // //   fetch("https://api.anthropic.com/v1/messages", { headers: {"x-api-key": ...}, body: JSON.stringify({
  // //     model: "claude-sonnet-4-6", max_tokens: 2000,
  // //     system: systemPrompt,
  // //     messages: [{ role: "user", content: JSON.stringify(payload) }],
  // //   })});
  // return data;
  throw new Error("callPerformAI non è collegato in questa anteprima isolata — il motore deterministico locale genera già il piano rispettando le stesse regole del Master Prompt.");
}

const ACTIVITY_MULT = { sedentario: 1.2, leggero: 1.375, moderato: 1.55, attivo: 1.725, "molto attivo": 1.9 };

/* Le 4 direzioni pianificate: ognuna imposta % di surplus/deficit sul TDEE
   e un target proteico in g/kg evidence-based (range ISSN/ACSM). */
const PREDICTIVE_GOALS = [
  { id: "massa_pulita", label: "Massa Pulita", kcalPct: 0.10, proteinPerKg: 1.9, fatPct: 0.25 },
  { id: "definizione_estrema", label: "Definizione Estrema", kcalPct: -0.25, proteinPerKg: 2.4, fatPct: 0.25 },
  { id: "ricomposizione", label: "Ricomposizione Corporea", kcalPct: -0.05, proteinPerKg: 2.2, fatPct: 0.27 },
  { id: "recomp_gara", label: "Recomp Gara", kcalPct: -0.20, proteinPerKg: 2.4, fatPct: 0.22 },
];

/* TDEE con Mifflin-St Jeor (formula reale, non inventata) + moltiplicatore
   di attività NEAT/lifestyle dichiarato in anamnesi. */
function computeTDEE(client) {
  const w = client.lastCheck.weight, h = client.heightCm, age = client.age;
  const bmr = client.gender === "F" ? 10 * w + 6.25 * h - 5 * age - 161 : 10 * w + 6.25 * h - 5 * age + 5;
  const mult = ACTIVITY_MULT[client.activity] || 1.375;
  return Math.round(bmr * mult);
}

/* Deriva un target OFF plausibile da un target ON appena calcolato via TDEE:
   stessa % di riduzione kcal e stesso ribilanciamento macro già usati nel
   default della timeline (makeDefaultWeek), per coerenza tra i due motori. */
function deriveOffTarget(onKcal) {
  return makeMacroProfile(Math.round(onKcal * 0.9), 0.3, 0.35, 0.35);
}

/* ⚡ GENERA DIETA TIPO CON PERFORM AI — generatore unico, condizionato dal
   NUTRITION_MASTER_PROMPT qui sopra. Sostituisce i due generatori separati
   che avevo prima (Generazione Predittiva + Genera Pasti su Misura): stessa
   AI, due modalità di calcolo del target, così non hai due pulsanti che
   fanno quasi la stessa cosa.
   Modalità "TDEE": calcola un target nuovo dall'obiettivo (Mifflin-St Jeor).
   Modalità "Target attuale": rispetta i grammi già impostati per questa
   settimana, senza toccarli. In entrambe: alimenti filtrati per pasto e per
   gusti/intolleranze (pickCombo + pickMacroFoodsForClient), grammi esatti
   (solveMealGrams, mai sopra il target), e verifica soglia leucina per
   pasto — il Master Prompt lo richiede esplicitamente al punto 4. */
function PerformAIDietGenerator({ client, targetON, targetOFF, onApply }) {
  const [mode, setMode] = useState("tdee");
  const [goalId, setGoalId] = useState(PREDICTIVE_GOALS[0].id);
  const [preview, setPreview] = useState(null);
  const { excluded } = pickMacroFoodsForClient(client);
  const micro = useMemo(() => buildMicronutrientProfile(client), [client]);
  const targets = microTargets(client);
  const deficientMicros = useMemo(() => {
    const map = { k: micro.potassiumMg, fe: micro.ironMg, ca: micro.calciumMg, mg: micro.magnesiumMg };
    return Object.keys(map).filter((key) => map[key] / targets[key].limit < 0.9);
  }, [micro, targets]);

  const generate = () => {
    let newTargetON, newTargetOFF, tdeeInfo = null;
    if (mode === "tdee") {
      const goal = PREDICTIVE_GOALS.find((g) => g.id === goalId) || PREDICTIVE_GOALS[0];
      const tdee = computeTDEE(client);
      const kcalTarget = Math.round(tdee * (1 + goal.kcalPct));
      const p = Math.round(client.lastCheck.weight * goal.proteinPerKg);
      const f = Math.round((kcalTarget * goal.fatPct) / 9);
      const c = Math.max(0, Math.round((kcalTarget - (p * 4 + f * 9)) / 4));
      newTargetON = { p, c, f };
      newTargetOFF = deriveOffTarget(kcalTarget);
      tdeeInfo = { tdee, kcalTarget, goalLabel: goal.label };
    } else {
      newTargetON = targetON;
      newTargetOFF = targetOFF;
    }
    const mealsON = makeMealSplit(newTargetON, client, deficientMicros);
    const mealsOFF = makeMealSplit(newTargetOFF, client, deficientMicros);
    setPreview({ targetON: newTargetON, targetOFF: newTargetOFF, mealsON, mealsOFF, tdeeInfo });
  };
  const approve = () => { onApply(preview.targetON, preview.mealsON, preview.targetOFF, preview.mealsOFF); setPreview(null); };

  return (
    <div className="c-card mb-5" style={{ border: "1.5px solid #C5A059" }}>
      <h3 className="c-heading font-display font-bold flex items-center gap-2 mb-1">⚡ GENERA DIETA TIPO CON PERFORM AI</h3>
      <p className="c-muted text-xs mb-2">
        Condizionata dal Master Prompt nutrizionale: legge anamnesi ({client.heightCm} cm · {client.lastCheck.weight} kg · {client.bodyFatPct}% BF · {client.activity}),
        seleziona solo alimenti tollerati{client.foodLikes?.length ? ` (preferiti: ${client.foodLikes.join(", ")})` : ""}, esclude sempre{" "}
        {excluded.length ? excluded.join(", ") : "nessuna intolleranza dichiarata"}, e verifica la soglia di leucina per pasto.
      </p>
      {deficientMicros.length > 0 && (
        <p className="font-data text-[11px] mb-3 px-2.5 py-1.5 rounded-md inline-block" style={{ backgroundColor: "#FFFBEB", color: "#92400E" }}>
          Carenze rilevate dall'Analisi Micronutrienti: {deficientMicros.map((k) => targets[k].label).join(", ")} — il generatore privilegerà alimenti densi in questi fattori.
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <button onClick={() => setMode("tdee")} className="rounded-lg px-3 py-2 text-xs font-data uppercase"
          style={mode === "tdee" ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
          🎯 Nuovo target da obiettivo (TDEE)
        </button>
        <button onClick={() => setMode("existing")} className="rounded-lg px-3 py-2 text-xs font-data uppercase"
          style={mode === "existing" ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
          ✅ Rispetta target già impostato
        </button>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        {mode === "tdee" && (
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="t-input flex-1 min-w-[220px] text-sm rounded-lg px-3 py-2.5">
            {PREDICTIVE_GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        )}
        <button onClick={generate} className="c-btn px-5 py-2.5 rounded-lg text-sm font-medium flex-1 min-w-[160px]">Genera ON + OFF</button>
      </div>

      {preview && (
        <div className="spring-in">
          {preview.tdeeInfo && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[["TDEE", `${preview.tdeeInfo.tdee} kcal`], ["Target ON", `${kcalFromMacros(preview.targetON.p, preview.targetON.c, preview.targetON.f)} kcal`], ["Obiettivo", preview.tdeeInfo.goalLabel]].map(([k, v]) => (
                <div key={k} className="t-inner px-2.5 py-2 text-center">
                  <p className="c-label mb-0.5">{k}</p>
                  <p className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{v}</p>
                </div>
              ))}
            </div>
          )}
          {["ON", "OFF"].map((prof) => {
            const meals = prof === "ON" ? preview.mealsON : preview.mealsOFF;
            const target = prof === "ON" ? preview.targetON : preview.targetOFF;
            const totals = dayMacros(meals);
            const targetKcal = kcalFromMacros(target.p, target.c, target.f);
            return (
              <div key={prof} className="t-inner px-3 py-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{prof === "ON" ? "🏋️ Giorno ON" : "🧘 Giorno OFF"}</p>
                  <span className="font-data text-xs font-bold" style={{ color: Math.abs(totals.kcal - targetKcal) <= 30 ? "#10B981" : "#F0A020" }}>{Math.round(totals.kcal)} / {targetKcal} kcal</span>
                </div>
                <div className="space-y-1">
                  {meals.map((m) => {
                    const mm = mealMacros(m);
                    const leucine = estimateMealLeucine(m);
                    const belowThreshold = leucine < LEUCINE_THRESHOLD_G && mm.p > 5;
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                        <span style={{ color: "var(--ink)" }}>{m.name} <span className="font-data" style={{ color: "var(--ink-soft)" }}>{m.time}</span></span>
                        <span className="font-data" style={{ color: "var(--ink-tertiary)" }}>{m.items.map((it) => `${it.foodKey} ${it.grams}g`).join(" · ")} · {Math.round(mm.kcal)} kcal</span>
                        <span className="font-data text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: belowThreshold ? "#FFFBEB" : "#ECFDF5", color: belowThreshold ? "#92400E" : "#047857" }}>
                          {belowThreshold ? `⚠ Leucina ~${leucine.toFixed(1)}g (< soglia 2.5g)` : `✓ Leucina ~${leucine.toFixed(1)}g`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button onClick={approve} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium mt-2">✅ Approva e sostituisci pasti ON + OFF</button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- HEADER ----------------------------------
   Rimosso su tua richiesta: nome app e logo li porta già l'AppShell che
   ospiterà questa schermata. Lascio solo una barra di contesto sottile
   (badge ruolo + nome coach), senza alcun elemento di brand — così non
   duplichiamo il wordmark quando la incastri dentro 04_AppShell.jsx.       */
function CoachContextBar({ isDark, onToggleDark }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <p className="font-data uppercase" style={{ color: "var(--ink-soft)", fontSize: "0.62rem", letterSpacing: "0.18em" }}>
        Pannello amministrativo · Coach Daniel Marsini
      </p>
      <div className="flex items-center gap-2">
        <button onClick={onToggleDark} className="font-data text-[10px] uppercase px-3 py-1.5 rounded-full flex items-center gap-1.5"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", letterSpacing: "0.1em" }}>
          {isDark ? "☀️ Light" : "🌑 Onyx"}
        </button>
        <span className="font-data text-[10px] uppercase px-3 py-1.5 rounded-full" style={{ backgroundColor: "#111111", color: "#C5A059", letterSpacing: "0.14em" }}>
          <ShieldCheck size={11} className="inline mr-1" style={{ verticalAlign: "-2px" }} />
          Accesso Coach
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- PASSWORD VIEWER ---------------------------- */
/* onRegenerate opzionale: quando presente mostra anche un tasto per
   rigenerare una nuova password provvisoria — è la stessa logica di "risolvi
   il problema di accesso" che avevi in mente, ma non permette di digitare
   una password libera: Supabase salva solo l'hash, quindi in produzione
   "cambiare la password" significa sempre generarne una nuova provvisoria
   via supabase.auth.admin.updateUserById(...), non scriverne una a mano. */
function PasswordViewer({ password, onRegenerate }) {
  const [show, setShow] = useState(false);
  return (
    <div className="t-inner px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="c-label mb-1">Credenziali attuali</p>
        <p className="font-data text-sm truncate" style={{ color: "var(--ink)", fontWeight: 600 }}>
          {show ? (password || "—") : "••••••••••"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRegenerate && (
          <button onClick={onRegenerate} className="c-ghost px-2.5 h-9 rounded-full flex items-center gap-1 text-[11px] font-medium" title="Genera una nuova password provvisoria">
            🔄 Rigenera
          </button>
        )}
        <button onClick={() => setShow((v) => !v)} className="c-ghost w-9 h-9 rounded-full flex items-center justify-center" aria-label={show ? "Nascondi password" : "Mostra password"}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- CATALOGO CLIENTI --------------------------- */
function ClientRow({ client, onOpen }) {
  const status = computeStatus(client);
  const grado = client.evening.doloreGrado;
  const critical = grado >= 4;
  const warning = grado === 3;
  const ringColor = critical ? "#DC2626" : warning ? "#F0A020" : status === "red" ? "#DC2626" : status === "yellow" ? "#F0A020" : "#10B981";
  return (
    <div className={`c-card ${critical ? "alert-pulse" : ""}`} style={critical ? { border: "1.5px solid #FECACA", backgroundColor: "#FEF2F2" } : warning ? { border: "1.5px solid #FDE68A", backgroundColor: "#FFFBEB" } : {}}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, backgroundColor: ringColor, boxShadow: `0 0 0 4px ${ringColor}1A` }} />
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <p className="truncate" style={{ color: (critical || warning) ? "#27272A" : "var(--ink)", fontSize: "1rem", fontWeight: 500 }}>{client.name}</p>
          <p className="font-data mt-0.5 truncate" style={{ color: (critical || warning) ? "#3F3F46" : "var(--ink-soft)", fontSize: "0.68rem", letterSpacing: "0.04em" }}>
            {client.plan === "full" ? "Full Coaching" : client.plan === "training" ? "Solo Allenamento" : "Scheda Personalizzata"} · aderenza {client.adherence != null ? `${client.adherence}%` : "n/d"}
          </p>
        </button>
        {(critical || warning) && (
          <a href={waLink(client, `Ciao ${client.name.split(" ")[0]}, ho visto il dolore Grado ${grado} che hai segnalato ieri sera. Modifico subito il piano: dimmi come sta adesso.`)}
            target="_blank" rel="noreferrer"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#25D366" }} aria-label="Apri WhatsApp">
            <MessageCircle size={16} color="#FFFFFF" />
          </a>
        )}
        <button onClick={onOpen} className="c-ghost shrink-0 w-9 h-9 rounded-full flex items-center justify-center" aria-label="Apri profilo">
          <ChevronRight size={15} />
        </button>
      </div>
      {grado > 0 && (
        <p className="text-xs mt-2.5 pl-5" style={{ color: critical ? "#B91C1C" : warning ? "#92400E" : "var(--ink-tertiary)" }}>
          Dolore Grado {grado}/5 · «{client.evening.doloreNota}»
        </p>
      )}
      {client.billingStatus === "payment_failed" && (
        <p className="font-data text-[11px] mt-2.5 pl-5 font-semibold" style={{ color: "#B91C1C" }}>
          💳 Pagamento fallito · Billing Shield ha spostato l'account su Scaduti
        </p>
      )}
    </div>
  );
}

/* ------------------------------- CRUSCOTTO ALLARMI -------------------------- */
function ComplianceRing({ label, value }) {
  // value === null → niente da misurare (es. nessun esercizio assegnato
  // questa settimana): stato neutro esplicito, non uno 0% rosso allarmante.
  const isNeutral = value == null;
  const pct = isNeutral ? null : Math.round(value * 100);
  const color = isNeutral ? "#ADB5BD" : value >= 0.75 ? "#10B981" : value >= 0.5 ? "#F0A020" : "#DC2626";
  const R = 22, C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={R} fill="none" stroke="#E9ECEF" strokeWidth="5" />
        {isNeutral
          ? <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeDasharray="4 5" strokeOpacity="0.6" />
          : <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeDasharray={C} strokeDashoffset={C * (1 - value)} strokeLinecap="round" />}
      </svg>
      <span className="font-data text-xs font-bold" style={{ color, marginTop: -40 }}>{isNeutral ? "n/d" : `${pct}%`}</span>
      <span className="c-label mt-6">{label}</span>
    </div>
  );
}
/* Cruscotto Allarmi: ora vive fisso in cima all'Hub Atleti (non più una tab
   a sé), quindi ho tolto la sezione "tutti gli altri atleti" — il catalogo
   subito sotto mostra già ogni cliente, ripeterlo qui sarebbe ridondante.
   Cliccare un atleta segnalato apre direttamente il suo profilo sulla tab
   Bioritmi & Grafici, dove il dolore è documentato per esteso. */
function AlarmsDashboard({ onOpen }) {
  const { clients: CLIENTS } = useContext(CoachDataContext);
  // Solo i clienti presi in gestione (clientStatus === "active") finiscono nel
  // cruscotto — un iscritto che ha solo scelto un piano non è ancora seguito
  // da nessuno. I DEMO_CLIENTS non hanno clientStatus impostato: per loro il
  // filtro passa tutti, così l'anteprima isolata resta quella di sempre.
  const managed = CLIENTS.filter((c) => c.clientStatus == null || c.clientStatus === "active");
  const flagged = managed.filter((c) => c.evening.doloreGrado >= 3 || computeStatus(c) === "red").sort((a, b) => b.evening.doloreGrado - a.evening.doloreGrado);
  if (flagged.length === 0) {
    return (
      <div className="c-card mb-5">
        <h3 className="c-heading font-display font-bold flex items-center gap-2 mb-1">
          <AlertTriangle size={17} style={{ color: "#C5A059" }} />
          Cruscotto Allarmi &amp; Dolori
        </h3>
        <p className="c-muted text-sm">Nessun allarme attivo: tutti gli atleti sotto Grado 3.</p>
      </div>
    );
  }
  return (
    <div className="c-card mb-5">
      <h3 className="c-heading font-display font-bold flex items-center gap-2 mb-1">
        <AlertTriangle size={17} style={{ color: "#C5A059" }} />
        Cruscotto Allarmi &amp; Dolori
      </h3>
      <p className="c-muted font-data text-xs mb-4">
        Grado dolore 3-4-5 illumina la riga di Giallo/Rosso e attiva il gateway WhatsApp. Clicca un atleta per aprire il profilo.
      </p>
      <div className="space-y-3">
        {flagged.map((c) => {
          const critical = c.evening.doloreGrado >= 4;
          return (
            <div key={c.id} className={critical ? "alert-pulse" : ""} style={{ borderRadius: "0.85rem", border: `1.5px solid ${critical ? "#FECACA" : "#FDE68A"}`, backgroundColor: critical ? "#FEF2F2" : "#FFFBEB", padding: "1rem 1.25rem" }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <button onClick={() => onOpen?.(c.id)} className="text-left">
                  <p style={{ color: "#27272A", fontWeight: 600 }}>{c.name}</p>
                  <p className="font-data text-xs" style={{ color: critical ? "#B91C1C" : "#92400E" }}>Grado dolore {c.evening.doloreGrado}/5 · «{c.evening.doloreNota}»</p>
                </button>
                <a href={waLink(c, `Ciao ${c.name.split(" ")[0]}, ricalibro subito il piano dopo il dolore che mi hai segnalato. Dammi 5 minuti di aggiornamento.`)} target="_blank" rel="noreferrer"
                  className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full" style={{ backgroundColor: "#25D366", color: "#FFFFFF" }}>
                  <MessageCircle size={14} /> WhatsApp
                </a>
              </div>
              <div className="flex gap-5 flex-wrap">
                <ComplianceRing label="Allenamento" value={c.rings.allenamento} />
                <ComplianceRing label="Alimentazione" value={c.rings.alimentazione} />
                <ComplianceRing label="Recupero" value={c.rings.recupero} />
                <div className="flex gap-3 items-center">
                  {[["Energia", c.evening.energia], ["Digestione", c.evening.digestione], ["Sonno", c.evening.sonno]].map(([k, v]) => (
                    <div key={k} className="t-inner px-3 py-2 text-center" style={{ minWidth: 64 }}>
                      <p className="c-label mb-0.5">{k}</p>
                      <p className="font-data text-sm font-bold" style={{ color: v >= 7 ? "#10B981" : v >= 5 ? "#F0A020" : "#DC2626" }}>{v}/10</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- WHITELIST -------------------------------- */
/* Logica adattata dal modulo whitelist del monolite (righe 3754-3763,
   4014-4073): due toggle indipendenti Bypass Stripe / Bypass Anamnesi.    */
function WhitelistPanel() {
  const [wl, setWl] = useState({ email: "", name: "", bypassPay: true, bypassAnam: false, plan: "full" });
  const [created, setCreated] = useState([]);

  const generate = () => {
    if (!wl.email.includes("@") || wl.name.trim().length < 3) return;
    const password = `${wl.name.trim().split(" ")[0]}-${Math.floor(1000 + Math.random() * 9000)}`;
    setCreated((list) => [{ ...wl, password, createdAt: new Date().toLocaleString("it-IT") }, ...list]);
    setWl({ email: "", name: "", bypassPay: true, bypassAnam: false, plan: "full" });
  };

  return (
    <div className="c-card">
      <h3 className="c-heading font-display font-bold flex items-center gap-2 mb-1">
        <Lock size={17} style={{ color: "#C5A059" }} />
        🔐 Gestione Whitelist
      </h3>
      <p className="c-muted font-data text-xs mb-5">
        Accesso diretto per collaboratori o amici storici · pre-crea il profilo su Supabase con i bypass scelti
      </p>

      <label className="block mb-3">
        <span className="c-label block mb-1.5">Email del collaboratore</span>
        <input type="email" value={wl.email} onChange={(e) => setWl({ ...wl, email: e.target.value })}
          placeholder="nome@email.it" className="t-input w-full text-sm rounded-xl px-4 py-3" />
      </label>
      <label className="block mb-4">
        <span className="c-label block mb-1.5">Nome e cognome</span>
        <input type="text" value={wl.name} onChange={(e) => setWl({ ...wl, name: e.target.value })}
          placeholder="Nome Cognome" className="t-input w-full text-sm rounded-xl px-4 py-3" />
      </label>

      {[
        ["bypassPay", "Bypass pagamento Stripe", "Salta la schermata dei piani: l'account risulta già pagato"],
        ["bypassAnam", "Bypass anamnesi", "Salta le 56 domande: il profilo passa direttamente su active"],
      ].map(([k, lab, desc]) => (
        <div key={k} className="t-inner px-4 py-3.5 mb-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>{lab}</p>
            <p className="c-muted text-xs mt-0.5 leading-relaxed">{desc}</p>
          </div>
          <button onClick={() => setWl({ ...wl, [k]: !wl[k] })} className="relative rounded-full transition-all duration-300 shrink-0"
            style={{ width: 48, height: 28, backgroundColor: wl[k] ? "#C5A059" : "#E4E4E7" }} aria-label={lab}>
            <span className="absolute rounded-full transition-all duration-300" style={{ width: 22, height: 22, top: 3, left: wl[k] ? 23 : 3, backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" }} />
          </button>
        </div>
      ))}

      <label className="block mb-4">
        <span className="c-label block mb-1.5">Piano assegnato</span>
        <select value={wl.plan} onChange={(e) => setWl({ ...wl, plan: e.target.value })} className="t-input w-full text-sm rounded-xl px-4 py-3">
          <option value="full">Full Coaching 360°</option>
          <option value="training">Solo Allenamento</option>
          <option value="scheda">Scheda Personalizzata</option>
        </select>
      </label>

      <button onClick={generate} className="c-btn w-full rounded-full px-4 py-3.5 text-sm font-medium">
        Genera accesso diretto
      </button>

      {created.length > 0 && (
        <div className="mt-5">
          <p className="c-label mb-2">Accessi generati in questa sessione</p>
          {created.map((a) => (
            <div key={a.email + a.createdAt} className="t-inner px-4 py-3 mb-1.5">
              <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 500 }}>{a.name}</p>
              <p className="font-data text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{a.email} · password {a.password}</p>
              <p className="font-data text-[10px] mt-1" style={{ color: "#10B981" }}>
                {a.bypassAnam ? "Attivo subito" : a.bypassPay ? "Pagamento saltato · anamnesi da compilare" : "Percorso standard"} · {a.createdAt}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="c-muted text-xs mt-4 leading-relaxed">
        Gli accessi diretti restano tracciati: ogni bypass registra chi l'ha concesso e quando. Serve per la contabilità, non per il controllo.
      </p>
    </div>
  );
}

/* Interruttore "sezione confermata per l'atleta": guida il colore del
   pallino S1/S2/... nella timeline (verde solo se tutto il richiesto dal
   piano è confermato). */
/* ---------------------- HUB RETE: CONTROLLO ACCESSI GLOBALE -----------------
   Ultimo ingresso simulato (nessun log reale in questo file isolato): più lo
   streak/aderenza sono alti, più il login è recente — in produzione questo
   campo arriva da Supabase Auth (`last_sign_in_at`), non da questa euristica. */
function buildLastLogin(client) {
  if (client.status === "new") return null; // non ha mai effettuato il primo accesso
  const now = new Date("2026-08-04T19:04:00");
  const hoursAgo = client.streak > 20 ? 2 : client.streak > 5 ? 18 : client.adherence > 80 ? 30 : client.status === "pending_approval" ? 96 : 240;
  return new Date(now.getTime() - hoursAgo * 3600 * 1000);
}
function fmtLastLogin(d) {
  if (!d) return "Mai effettuato il login";
  const now = new Date("2026-08-04T19:04:00");
  const hours = Math.round((now - d) / 3600000);
  if (hours < 24) return `${hours} h fa`;
  return `${Math.round(hours / 24)} giorni fa`;
}

const COACHING_PLAN_OPTIONS = [
  { value: "scheda_personalizzata", label: "Scheda Personalizzata (8-12 sett.)" },
  { value: "training", label: "Solo Allenamento Coaching" },
  { value: "full", label: "Full Coaching Supremo" },
];

// Selettore condiviso da "Prendi in gestione" (AccessControlTable) e "Cambia
// abbonamento" (ClientDetail): stesse 3 opzioni, stesso aspetto, ovunque il
// coach assegni o cambi il piano di un cliente reale.
function CoachingPlanPicker({ onPick, busy, onCancel }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 flex-wrap">
        {COACHING_PLAN_OPTIONS.map((opt) => (
          <button key={opt.value} type="button" onClick={() => onPick(opt.value)} disabled={busy}
            className="c-ghost px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50">
            {opt.label}
          </button>
        ))}
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy} className="text-xs self-start" style={{ color: "var(--ink-soft)" }}>
          Annulla
        </button>
      )}
    </div>
  );
}

function AccessControlTable({ passwordOverrides, onRegenerate }) {
  const { clients: CLIENTS, supabase, isRealMode, reloadRoster } = useContext(CoachDataContext);
  const rows = [...CLIENTS].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const [pickingId, setPickingId] = useState(null); // id del cliente per cui è aperto il selettore piano
  const [activatingId, setActivatingId] = useState(null);

  const activate = async (c, plan) => {
    setActivatingId(c.id);
    try {
      await activateClient(supabase, c.id, plan);
      setPickingId(null);
      reloadRoster?.();
    } catch (err) {
      console.error("PERFORM: errore attivazione cliente", err);
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="c-card">
      <h3 className="c-heading font-display font-bold mb-1">🔐 Controllo Accessi — Tutti gli utenti</h3>
      <p className="c-muted text-xs mb-4">
        Ordine alfabetico, TUTTI gli iscritti (non solo gli attivi). Visualizza o rigenera la password direttamente da qui per risolvere un problema di accesso.
      </p>
      <div className="space-y-2">
        {rows.map((c) => {
          const login = buildLastLogin(c);
          const password = passwordOverrides?.[c.id] || c.password;
          return (
            <div key={c.id} className="t-inner px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center">
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 600 }}>{c.name}</p>
                <p className="font-data text-xs truncate" style={{ color: "var(--ink-soft)" }}>{c.email}</p>
              </div>
              <p className="font-data text-xs" style={{ color: "var(--ink-tertiary)" }}>Ultimo ingresso: {fmtLastLogin(login)}</p>
              <PasswordViewer password={password} onRegenerate={() => onRegenerate(c.id, c.name)} />
              {isRealMode && c.clientStatus === "registered" && (
                pickingId === c.id ? (
                  <CoachingPlanPicker onPick={(plan) => activate(c, plan)} busy={activatingId === c.id} onCancel={() => setPickingId(null)} />
                ) : (
                  <button onClick={() => setPickingId(c.id)} className="c-btn px-3 py-2 rounded-lg text-xs font-medium">
                    Prendi in gestione
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ConfirmToggle({ label, checked, onToggle }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-data uppercase mb-4"
      style={checked ? { backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" } : { backgroundColor: "#F8F9FA", border: "1px solid #E9ECEF", color: "var(--ink-tertiary)" }}>
      <span>{checked ? "✅" : "⬜"}</span> {label} {checked ? "confermata per l'atleta" : "da confermare"}
    </button>
  );
}

/* ==========================================================================
   MESOCICLO AI CREATOR — "⚡ Genera Mesociclo con PERFORM AI"
   Anche qui: motore deterministico (stessa logica di trasparenza della
   Generazione Predittiva Totale in Dieta), NON una chiamata a Claude vera.
   Legge: anamnesi (età, infortuni/dolore, livello), il volume della
   settimana corrente (per individuare le carenze muscolari sotto le 10
   serie) e il PR di forza registrato (squat/panca/stacco — qui simulato,
   nella vera app arriva dai diari dell'atleta in Home). Se vuoi che sia
   davvero un LLM a scrivere le note tecniche riga per riga, va proxato via
   Supabase Edge Function come il resto dell'AI del progetto.             */
const MESOCICLO_POOLS = {
  push: ["Panca piana bilanciere", "Lento avanti manubri", "Croci ai cavi", "French press EZ", "Alzate laterali"],
  pull: ["Lat machine", "Rematore bilanciere", "Face pull ai cavi", "Scrollate con bilanciere", "Curl bilanciere"],
  legs: ["Squat bilanciere", "Stacco rumeno bilanciere", "Leg extension", "Adductor machine", "Leg curl sdraiato", "Hip thrust bilanciere", "Calf in piedi", "Plank"],
};
const MESOCICLO_SPLITS = {
  3: [null, "full1", null, "full2", null, "full3", null],
  4: ["upper1", "lower1", null, "upper2", "lower2", null, null],
  5: ["push", "pull", "legs", null, "push", "pull", null],
};

/* Legge dolore/infortuni ed esclude gli esercizi a rischio per quella zona.
   Incrocia DUE scale ora esistenti nel dashboard: il Grado infortunio 1-5
   (evening.doloreGrado, quello che accende il Cruscotto Allarmi) e il nuovo
   dolore soggettivo 1-10 del Check Settimanali (checkHistory più recente) —
   le porto sulla stessa scala (Grado×2) e prendo la severità più alta delle
   due, così un dolore segnalato nel check di lunedì ma non ancora "Grado"
   non passa inosservato. Regola semplificata di buon senso clinico, da
   rifinire caso per caso: non sostituisce una valutazione fisioterapica reale. */
function excludedExercises(client, checkHistory) {
  const latestCheck = checkHistory && checkHistory.length ? [...checkHistory].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  const severity = Math.max(client.evening.doloreGrado * 2, latestCheck?.dolori || 0);
  const text = (severity >= 6 ? client.evening.doloreNota : "").toLowerCase();
  const excl = new Set();
  if (text.includes("spalla")) excl.add("Lento avanti manubri");
  if (text.includes("lombare") || text.includes("schiena")) { excl.add("Stacco rumeno bilanciere"); excl.add("Squat bilanciere"); }
  if (text.includes("ginocchio")) { excl.add("Squat bilanciere"); excl.add("Leg extension"); }
  return excl;
}
/* Muscoli sotto le 10 serie/settimana nel piano attuale: priorità nel nuovo mesociclo. */
function muscleDeficiencies(currentWorkout) {
  const vol = computeVolume(currentWorkout);
  return MUSCLES.map((m) => ({ m, tot: vol[m].direct + vol[m].indirect })).filter((r) => r.tot < 10).sort((a, b) => a.tot - b.tot).map((r) => r.m);
}
function pickExercises(pool, excl, deficiencies, count) {
  const available = pool.filter((n) => !excl.has(n));
  const prioritized = [...available].sort((a, b) => {
    const aScore = (EXERCISE_LIB[a]?.direct || []).some((m) => deficiencies.includes(m)) ? -1 : 0;
    const bScore = (EXERCISE_LIB[b]?.direct || []).some((m) => deficiencies.includes(m)) ? -1 : 0;
    return aScore - bScore;
  });
  return prioritized.slice(0, count);
}
function techniqueForSlot(livello, idx, total) {
  if (livello === "principiante") return "Nessuna";
  const isLast = idx === total - 1;
  if (!isLast) return "Nessuna";
  if (livello === "intermedio") return "Rest-Pause";
  return idx % 2 === 0 ? "Drop-set" : "Stripping";
}
function buildMesocicloDay(kind, excl, deficiencies, livello) {
  if (kind === "push" || kind === "upper1") {
    const names = pickExercises(MESOCICLO_POOLS.push.concat(kind === "upper1" ? MESOCICLO_POOLS.pull.slice(0, 2) : []), excl, deficiencies, kind === "upper1" ? 5 : 4);
    return { label: kind === "upper1" ? "Upper A · Petto/Dorsali/Spalle" : "Spinta · Petto/Spalle/Tricipiti", names };
  }
  if (kind === "pull" || kind === "upper2") {
    const names = pickExercises(MESOCICLO_POOLS.pull.concat(kind === "upper2" ? MESOCICLO_POOLS.push.slice(0, 2) : []), excl, deficiencies, kind === "upper2" ? 5 : 4);
    return { label: kind === "upper2" ? "Upper B · Dorsali/Petto/Braccia" : "Trazione · Dorsali/Trapezio/Bicipiti", names };
  }
  if (kind === "legs" || kind === "lower1" || kind === "lower2") {
    const names = pickExercises(MESOCICLO_POOLS.legs, excl, deficiencies, 5);
    return { label: "Gambe · Quad/Femorali/Adduttori/Glutei", names };
  }
  // full body: un esercizio a testa da ciascun pool
  const names = [
    ...pickExercises(MESOCICLO_POOLS.push, excl, deficiencies, 2),
    ...pickExercises(MESOCICLO_POOLS.pull, excl, deficiencies, 2),
    ...pickExercises(MESOCICLO_POOLS.legs, excl, deficiencies, 2),
  ];
  return { label: "Full Body · Corpo intero", names };
}
function generateMesociclo(client, splitDays, livello, currentWorkout, checkHistory) {
  const excl = excludedExercises(client, checkHistory);
  const deficiencies = muscleDeficiencies(currentWorkout);
  const pattern = MESOCICLO_SPLITS[splitDays];
  const workout = pattern.map((kind) => {
    if (!kind) return null;
    const { label, names } = buildMesocicloDay(kind, excl, deficiencies, livello);
    return {
      label,
      exercises: names.map((name, i) => ({
        id: uid(), name, custom: false, sets: livello === "principiante" ? 3 : 4, reps: "8-12", rest: 90,
        technique: techniqueForSlot(livello, i, names.length),
      })),
    };
  });
  return { workout, excl: [...excl], deficiencies };
}

function MesocicloGenerator({ client, currentWorkout, onApprove }) {
  const [splitDays, setSplitDays] = useState(client.plan === "training" ? 3 : 4);
  const [livello, setLivello] = useState(simulateAnamnesis(client).livello);
  const [result, setResult] = useState(null);
  const checkHistory = useMemo(() => buildCheckHistory(client), [client]);
  const badge = predictiveBadge(client, checkHistory);

  const generate = () => setResult(generateMesociclo(client, splitDays, livello, currentWorkout, checkHistory));
  const approve = () => { onApprove(result.workout); setResult(null); };

  return (
    <div className="c-card mb-5" style={{ border: "1.5px solid #C5A059" }}>
      <h3 className="c-heading font-display font-bold mb-1">⚡ GENERA MESOCICLO CON PERFORM AI</h3>
      <p className="c-muted text-xs mb-2">
        Condizionata dal Master Prompt biomeccanico: legge cartella clinica ({client.age} anni · livello {livello} · {client.evening.doloreGrado >= 3 ? `dolore attivo: ${client.evening.doloreNota}` : "nessun dolore attivo"}),
        i check del lunedì (peso {checkHistory[checkHistory.length - 1].weight} kg, addome {checkHistory[checkHistory.length - 1].waistCm} cm) e i PR registrati (Squat {client.prs.squat} kg · Panca {client.prs.panca} kg · Stacco {client.prs.stacco} kg) per calibrare volumi e tecniche sulle carenze muscolari della settimana corrente.
      </p>
      {badge && (
        <p className="font-data text-[11px] mb-3 px-2.5 py-1.5 rounded-md inline-block" style={{ backgroundColor: badge.type === "recomp" ? "#ECFDF5" : "#FFF7ED", color: badge.type === "recomp" ? "#047857" : "#C2410C" }}>
          {badge.label} — {badge.detail}
        </p>
      )}
      <div className="flex gap-2 flex-wrap mb-4">
        <select value={splitDays} onChange={(e) => setSplitDays(Number(e.target.value))} className="t-input text-sm rounded-lg px-3 py-2.5">
          <option value={3}>3 giorni · Full Body</option>
          <option value={4}>4 giorni · Upper/Lower</option>
          <option value={5}>5 giorni · Push/Pull/Legs</option>
        </select>
        <select value={livello} onChange={(e) => setLivello(e.target.value)} className="t-input text-sm rounded-lg px-3 py-2.5">
          {["principiante", "intermedio", "avanzato", "expert"].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={generate} className="c-btn px-5 py-2.5 rounded-lg text-sm font-medium flex-1 min-w-[160px]">Genera</button>
      </div>

      {result && (
        <div className="spring-in">
          {result.deficiencies.length > 0 && (
            <p className="font-data text-[11px] mb-2" style={{ color: "#92400E" }}>Carenze rilevate (sotto 10 serie/sett.): {result.deficiencies.join(", ")} — priorità nel piano</p>
          )}
          {result.excl.length > 0 && (
            <p className="font-data text-[11px] mb-3" style={{ color: "#B91C1C" }}>Esclusi per il dolore segnalato: {result.excl.join(", ")}</p>
          )}
          <div className="space-y-1.5 mb-4">
            {result.workout.map((day, i) => (
              <div key={i} className="t-inner px-3 py-2">
                <p className="text-sm mb-1" style={{ color: "var(--ink)", fontWeight: 500 }}>{WEEK_DAYS[i]} · {day ? day.label : "Riposo"}</p>
                {day && (
                  <p className="font-data text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                    {day.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}${e.technique !== "Nessuna" ? ` (${e.technique})` : ""}`).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button onClick={approve} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">✅ Approva e sostituisci la settimana</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ TIMELINE EDITOR -----------------------------
   [A1] Allenamento Libero + Intensità: esercizio a testo libero se assente
   dal menu, Tempi di Recupero per esercizio, e le 4 Tecniche d'Intensità
   pianificate (Drop-set, Rest-Pause, Stripping, Super-set).               */
function WeekWorkoutEditor({ week, onChange, client }) {
  const [selDay, setSelDay] = useState(0);
  const day = week.workout[selDay];
  const setDay = (updater) => onChange({ ...week, workout: week.workout.map((d, i) => (i === selDay ? updater(d) : d)) });
  const toggleRest = () => setDay((d) => (d ? null : { label: "Nuova sessione", exercises: [] }));
  const updateEx = (i, field, value) => setDay((d) => ({
    ...d,
    exercises: d.exercises.map((e, j) => (j === i ? { ...e, [field]: field === "sets" ? Math.max(1, Math.min(8, Number(value) || 1)) : field === "rest" ? Math.max(0, Number(value) || 0) : value } : e)),
  }));
  const toggleCustom = (i) => setDay((d) => ({
    ...d,
    exercises: d.exercises.map((e, j) => (j === i ? { ...e, custom: !e.custom, name: e.custom ? EX_NAMES[0] : "" } : e)),
  }));
  const removeEx = (i) => setDay((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }));
  const addEx = () => setDay((d) => ({ ...d, exercises: [...d.exercises, { id: uid(), name: EX_NAMES[0], custom: false, sets: 3, reps: "8-10", rest: 120, technique: "Nessuna" }] }));
  const volume = useMemo(() => computeVolume(week.workout), [week.workout]);
  const unmapped = useMemo(() => {
    const names = new Set();
    week.workout.filter(Boolean).forEach((d) => d.exercises.forEach((e) => { if (e.custom && e.name.trim() && !EXERCISE_LIB[e.name]) names.add(e.name.trim()); }));
    return [...names];
  }, [week.workout]);

  return (
    <div>
      <ConfirmToggle label="Allenamento" checked={week.confirmed.workout} onToggle={() => onChange({ ...week, confirmed: { ...week.confirmed, workout: !week.confirmed.workout } })} />
      <MesocicloGenerator client={client} currentWorkout={week.workout} onApprove={(workout) => onChange({ ...week, workout, confirmed: { ...week.confirmed, workout: true } })} />
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {WEEK_DAYS.map((label, i) => (
          <button key={i} onClick={() => setSelDay(i)} className="rounded-lg px-3 py-2 text-xs font-data uppercase"
            style={selDay === i ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
            {label}{!week.workout[i] && " · riposo"}
          </button>
        ))}
      </div>

      {!day ? (
        <button onClick={toggleRest} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium mb-5">Trasforma in giorno di allenamento</button>
      ) : (
        <div className="c-card mb-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <input value={day.label} onChange={(e) => setDay((d) => ({ ...d, label: e.target.value }))} className="t-input flex-1 text-sm rounded-lg px-3 py-2" />
            <button onClick={toggleRest} className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">Riposo</button>
          </div>
          <div className="space-y-2.5 mb-3">
            {day.exercises.map((ex, i) => (
              <div key={ex.id} className="t-inner px-3 py-3">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {ex.custom ? (
                    <input value={ex.name} onChange={(e) => updateEx(i, "name", e.target.value)} placeholder="Scrivi il nome dell'esercizio…"
                      className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[180px]" autoFocus />
                  ) : (
                    <select value={ex.name} onChange={(e) => updateEx(i, "name", e.target.value)} className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[180px]">
                      {EX_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                  <button onClick={() => toggleCustom(i)} className="c-ghost px-2.5 py-1.5 rounded-md text-[11px] font-data uppercase shrink-0" title="Esercizio personalizzato">
                    {ex.custom ? "↩ Libreria" : "✏️ Libero"}
                  </button>
                  <button onClick={() => removeEx(i)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-center">
                    <span className="c-label block mb-1">Serie</span>
                    <input type="number" value={ex.sets} onChange={(e) => updateEx(i, "sets", e.target.value)} className="t-input w-14 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="text-center">
                    <span className="c-label block mb-1">Reps</span>
                    <input type="text" value={ex.reps} onChange={(e) => updateEx(i, "reps", e.target.value)} className="t-input w-20 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="text-center">
                    <span className="c-label block mb-1">Recupero (s)</span>
                    <input type="number" step="15" value={ex.rest} onChange={(e) => updateEx(i, "rest", e.target.value)} className="t-input w-20 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="flex-1 min-w-[160px]">
                    <span className="c-label block mb-1">Tecnica d'intensità</span>
                    <select value={ex.technique} onChange={(e) => updateEx(i, "technique", e.target.value)} className="t-input w-full text-sm rounded-md px-2 py-1.5">
                      {INTENSITY_TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  {ex.custom && (
                    <label className="flex-1 min-w-[160px]">
                      <span className="c-label block mb-1">Distretto muscolare</span>
                      <select value={ex.muscleTarget || ""} onChange={(e) => updateEx(i, "muscleTarget", e.target.value)} className="t-input w-full text-sm rounded-md px-2 py-1.5">
                        <option value="">— scegli —</option>
                        {MUSCLE_TARGETS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={addEx} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1"><Plus size={13} /> Esercizio</button>
        </div>
      )}

      <div className="c-card">
        <p className="c-label mb-3">Volume settimanale per gruppo muscolare · Serie Dirette 100% / Indirette 50%</p>
        <VolumeBarChart volume={volume} />
        {unmapped.length > 0 && (
          <p className="font-data text-[10px] mt-3" style={{ color: "#92400E" }}>
            {unmapped.length === 1 ? "Esercizio personalizzato escluso" : "Esercizi personalizzati esclusi"} dal grafico volumi (nome non in libreria): {unmapped.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

/* Dieta ON/OFF con matematica reale dei macros: le kcal non si scrivono
   mai a mano, si calcolano sempre da P/C/G con la formula 4/4/9. Cambiare
   un grammo di carbo ricalcola il totale nello stesso istante.           */
function FoodItemRow({ item, onUpdate, onRemove }) {
  const isCustom = !item.foodKey;
  const m = itemMacros(item);
  return (
    <div className="t-inner px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <select
          value={item.foodKey || "__custom__"}
          onChange={(e) => onUpdate({ ...item, foodKey: e.target.value === "__custom__" ? null : e.target.value })}
          className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[160px]">
          {FOOD_DB.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          <option value="__custom__">✏️ Alimento personalizzato…</option>
        </select>
        <label className="text-center">
          <span className="c-label block mb-1">Grammi</span>
          <input type="number" min={0} value={item.grams} onChange={(e) => onUpdate({ ...item, grams: Math.max(0, Number(e.target.value) || 0) })} className="t-input w-20 text-sm rounded-md px-2 py-1.5 font-data text-center" />
        </label>
        <button onClick={onRemove} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi alimento"><Trash2 size={13} /></button>
      </div>
      {isCustom && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <input value={item.customName} onChange={(e) => onUpdate({ ...item, customName: e.target.value })} placeholder="Nome alimento" className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[140px]" />
          {[["customP100", "P /100g"], ["customC100", "C /100g"], ["customF100", "G /100g"]].map(([k, lab]) => (
            <label key={k} className="text-center">
              <span className="c-label block mb-1">{lab}</span>
              <input type="number" min={0} value={item[k]} onChange={(e) => onUpdate({ ...item, [k]: Math.max(0, Number(e.target.value) || 0) })} className="t-input w-16 text-sm rounded-md px-2 py-1 font-data text-center" />
            </label>
          ))}
        </div>
      )}
      <p className="font-data text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {Math.round(m.p)}g P · {Math.round(m.c)}g C · {Math.round(m.f)}g G · {Math.round(m.kcal)} kcal
      </p>
    </div>
  );
}

function MealCard({ meal, onChange, onRemove }) {
  const mm = mealMacros(meal);
  const leucine = estimateMealLeucine(meal);
  const belowThreshold = leucine < LEUCINE_THRESHOLD_G && mm.p > 5;
  const updField = (k, v) => onChange({ ...meal, [k]: v });
  const updItem = (ii, next) => onChange({ ...meal, items: meal.items.map((it, j) => (j === ii ? next : it)) });
  const removeItem = (ii) => onChange({ ...meal, items: meal.items.filter((_, j) => j !== ii) });
  const addItem = () => onChange({ ...meal, items: [...meal.items, { id: uid(), foodKey: FOOD_DB[0].name, customName: "", customP100: 0, customC100: 0, customF100: 0, grams: 100 }] });

  return (
    <div className="c-card">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={meal.name} onChange={(e) => updField("name", e.target.value)} className="t-input flex-1 min-w-[140px] text-sm font-medium rounded-lg px-3 py-2" placeholder="Nome pasto" />
        <input type="time" value={meal.time} onChange={(e) => updField("time", e.target.value)} className="t-input text-sm rounded-lg px-3 py-2 font-data" style={{ width: 110 }} />
        <span className="font-data text-xs font-bold ml-auto" style={{ color: "var(--ink)" }}>{Math.round(mm.kcal)} kcal</span>
        <button onClick={onRemove} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi pasto"><Trash2 size={13} /></button>
      </div>
      {mm.p > 5 && (
        <p className="font-data text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mb-2" style={{ backgroundColor: belowThreshold ? "#FFFBEB" : "#ECFDF5", color: belowThreshold ? "#92400E" : "#047857" }}>
          {belowThreshold ? `⚠ Leucina ~${leucine.toFixed(1)}g (stima 8.5% quota proteica, sotto soglia mTOR 2.5g)` : `✓ Leucina ~${leucine.toFixed(1)}g — soglia mTOR raggiunta`}
        </p>
      )}
      <div className="space-y-2 mb-2.5">
        {meal.items.map((it, ii) => <FoodItemRow key={it.id} item={it} onUpdate={(next) => updItem(ii, next)} onRemove={() => removeItem(ii)} />)}
        {meal.items.length === 0 && <p className="c-muted text-xs px-1">Nessun alimento in questo pasto.</p>}
      </div>
      <button onClick={addItem} className="c-ghost px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"><Plus size={12} /> Alimento</button>
    </div>
  );
}

/* Dieta ON/OFF a pasti liberi: niente più caselle fisse a 6 pasti — il
   coach crea, rinomina e orario ogni pasto e ci mette dentro alimenti reali
   con la quantità in grammi. Macro e calorie si calcolano SEMPRE in live
   dalla formula 4/4/9 sui grammi effettivi, e vengono confrontate in tempo
   reale col target impostato da obiettivo+anamnesi (sezione sopra, oppure
   dalla Generazione Predittiva) — mai due numeri scollegati. */
function WeekDietEditor({ week, onChange, client }) {
  const { supabase, isRealMode, coachId } = useContext(CoachDataContext);
  const [profile, setProfile] = useState("ON");
  const current = week.diet[profile];

  // Scrive i target ON/OFF su nutrition_targets: stessa tabella che
  // fetchBothNutritionTargets legge lato Home cliente. A differenza
  // dell'allenamento, qui non c'è (ancora) un fetch reale in lettura per
  // quest'editor — week.diet resta lo stato locale di sempre, "Salva
  // modifiche" si limita a spingere su Supabase i due target correnti.
  const [dietSaving, setDietSaving] = useState(false);
  const [dietError, setDietError] = useState("");
  const [dietSaved, setDietSaved] = useState(false);
  const saveDiet = async () => {
    if (!isRealMode) return;
    setDietSaving(true);
    setDietError("");
    try {
      await Promise.all(["ON", "OFF"].map((p) => {
        const t = week.diet[p].target;
        return assignNutritionTarget(supabase, {
          coachId, clientId: client.id, dayType: p.toLowerCase(),
          kcal: kcalFromMacros(t.p, t.c, t.f), protein: t.p, carbs: t.c, fat: t.f,
        });
      }));
      setDietSaved(true);
      setTimeout(() => setDietSaved(false), 2500);
    } catch (err) {
      console.error("PERFORM: errore salvataggio nutrition_targets", err);
      setDietError(err.message || "Non sono riuscito a salvare la dieta.");
    } finally {
      setDietSaving(false);
    }
  };

  const updTarget = (k, v) => {
    const target = { ...current.target, [k]: Math.max(0, Number(v) || 0) };
    onChange({ ...week, diet: { ...week.diet, [profile]: { ...current, target } } });
  };
  /* Editing bidirezionale: cambiare le kcal ridistribuisce i grammi P/C/G
     mantenendo le stesse PROPORZIONI caloriche attuali (es. se ora il target
     è 30% proteine / 45% carbo / 25% grassi sul totale kcal, quel mix resta
     uguale quando cambi solo il numero di kcal). Se il target attuale è a
     zero kcal (caso limite), uso una ripartizione di default 30/45/25. */
  const updTargetKcal = (newKcalRaw) => {
    const newKcal = Math.max(0, Number(newKcalRaw) || 0);
    const curKcal = kcalFromMacros(current.target.p, current.target.c, current.target.f);
    const ratios = curKcal > 0
      ? { p: (current.target.p * 4) / curKcal, c: (current.target.c * 4) / curKcal, f: (current.target.f * 9) / curKcal }
      : { p: 0.30, c: 0.45, f: 0.25 };
    const target = {
      p: Math.round((newKcal * ratios.p) / 4),
      c: Math.round((newKcal * ratios.c) / 4),
      f: Math.round((newKcal * ratios.f) / 9),
    };
    onChange({ ...week, diet: { ...week.diet, [profile]: { ...current, target } } });
  };
  const updMeal = (i, nextMeal) => {
    const meals = current.meals.map((m, j) => (j === i ? nextMeal : m));
    onChange({ ...week, diet: { ...week.diet, [profile]: { ...current, meals } } });
  };
  const removeMeal = (i) => onChange({ ...week, diet: { ...week.diet, [profile]: { ...current, meals: current.meals.filter((_, j) => j !== i) } } });
  const addMeal = () => onChange({ ...week, diet: { ...week.diet, [profile]: { ...current, meals: [...current.meals, { id: uid(), name: "Nuovo pasto", time: "12:00", items: [] }] } } });
  const applyAI = (targetON, mealsON, targetOFF, mealsOFF) => {
    onChange({
      ...week,
      diet: { ON: { target: targetON, meals: mealsON }, OFF: { target: targetOFF, meals: mealsOFF } },
      confirmed: { ...week.confirmed, diet: true },
    });
  };

  const targetKcal = kcalFromMacros(current.target.p, current.target.c, current.target.f);
  const totals = dayMacros(current.meals);
  const remaining = { p: current.target.p - totals.p, c: current.target.c - totals.c, f: current.target.f - totals.f, kcal: targetKcal - totals.kcal };

  return (
    <div>
      <ConfirmToggle label="Dieta" checked={week.confirmed.diet} onToggle={() => onChange({ ...week, confirmed: { ...week.confirmed, diet: !week.confirmed.diet } })} />

      <PerformAIDietGenerator client={client} targetON={week.diet.ON.target} targetOFF={week.diet.OFF.target} onApply={applyAI} />

      {/* Selettore satinato Giorno ON / Giorno OFF: qui si programma nel tempo
          — ogni settimana della timeline ha il suo target e i suoi pasti
          separati per giorno ON e giorno OFF. */}
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <button onClick={() => setProfile("ON")} className="rounded-xl px-4 py-3.5 text-sm font-medium flex items-center justify-center gap-2"
          style={profile === "ON"
            ? { background: "linear-gradient(135deg, #1A1A1A, #3A3A3A)", color: "#FFFFFF", boxShadow: "0 6px 18px rgba(0,0,0,0.18)" }
            : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
          🏋️ Giorno ON <span className="font-data text-xs opacity-70">(Allenamento)</span>
        </button>
        <button onClick={() => setProfile("OFF")} className="rounded-xl px-4 py-3.5 text-sm font-medium flex items-center justify-center gap-2"
          style={profile === "OFF"
            ? { background: "linear-gradient(135deg, #8C6E33, #C5A059)", color: "#FFFFFF", boxShadow: "0 6px 18px rgba(197,160,89,0.28)" }
            : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
          🧘 Giorno OFF <span className="font-data text-xs opacity-70">(Riposo)</span>
        </button>
      </div>

      <div className="c-card mb-5">
        <div className="flex items-center justify-between mb-1">
          <p className="c-label">Target giornaliero · {profile === "ON" ? "Allenamento" : "Riposo"}</p>
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} value={targetKcal} onChange={(e) => updTargetKcal(e.target.value)}
              className="t-input w-24 text-right text-lg font-bold font-data rounded-md px-2 py-1" style={{ color: "var(--ink)" }} />
            <span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>kcal</span>
          </div>
        </div>
        <p className="c-muted text-xs mb-3">
          Doppio senso: cambi i grammi qui sotto → le kcal si ricalcolano da soli (1 g Proteine = 4 kcal · 1 g Carbo = 4 kcal · 1 g Grassi = 9 kcal).
          Cambi le kcal qui sopra → i grammi si riproporzionano da soli mantenendo lo stesso mix P/C/G attuale.
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {[["p", "Proteine (g)"], ["c", "Carboidrati (g)"], ["f", "Grassi (g)"]].map(([k, lab]) => (
            <label key={k} className="text-center">
              <span className="c-label block mb-1">{lab}</span>
              <input type="number" value={current.target[k]} onChange={(e) => updTarget(k, e.target.value)} className="t-input w-full text-sm rounded-md px-2 py-2 font-data text-center" />
            </label>
          ))}
        </div>
      </div>

      {/* Contatore live: scala dal target man mano che il coach compila i pasti. */}
      <div className="c-card mb-5">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="c-label">Consumato finora (live)</p>
          <span className="font-data text-sm font-bold" style={{ color: Math.abs(remaining.kcal) <= 30 ? "#10B981" : remaining.kcal < 0 ? "#DC2626" : "#F0A020" }}>
            {Math.round(totals.kcal)} / {targetKcal} kcal
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[["p", "Proteine", totals.p, remaining.p], ["c", "Carboidrati", totals.c, remaining.c], ["f", "Grassi", totals.f, remaining.f]].map(([k, lab, used, rem]) => (
            <div key={k} className="t-inner px-2.5 py-2 text-center">
              <p className="c-label mb-0.5">{lab}</p>
              <p className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{Math.round(used)}g</p>
              <p className="font-data text-[10px]" style={{ color: rem < 0 ? "#DC2626" : "var(--ink-soft)" }}>{rem >= 0 ? `restano ${Math.round(rem)}g` : `${Math.round(Math.abs(rem))}g oltre`}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-3">
        {current.meals.map((m, i) => <MealCard key={m.id} meal={m} onChange={(next) => updMeal(i, next)} onRemove={() => removeMeal(i)} />)}
      </div>
      <button onClick={addMeal} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 mb-5">
        <Plus size={14} /> Nuovo pasto (nome, orario, alimenti)
      </button>

      {isRealMode && (
        <div className="c-card mb-5">
          {dietError && (
            <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
              {dietError}
            </p>
          )}
          <button onClick={saveDiet} disabled={dietSaving} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">
            {dietSaving ? "Salvataggio…" : "Salva modifiche"}
          </button>
          {dietSaved && (
            <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mt-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
              ✓ Dieta salvata
            </p>
          )}
        </div>
      )}

      <LiveMicronutrientGrid meals={current.meals} client={client} />
      <RecoveryDashboard client={client} />
    </div>
  );
}

/* Timing dell'integrazione: sezioni per momento della giornata, ognuna
   con titolo modificabile (anche personalizzato) e la propria lista di
   integratori con dose. */
function WeekSuppsEditor({ week, onChange, client }) {
  const { supabase, isRealMode, coachId } = useContext(CoachDataContext);
  const updTitle = (si, v) => onChange({ ...week, supplements: week.supplements.map((s, j) => (j === si ? { ...s, title: v } : s)) });
  const removeSection = (si) => onChange({ ...week, supplements: week.supplements.filter((_, j) => j !== si) });
  const addSection = () => onChange({ ...week, supplements: [...week.supplements, { id: uid(), title: "Nuova sezione", items: [] }] });

  const updItem = (si, ii, k, v) => onChange({
    ...week,
    supplements: week.supplements.map((s, j) => (j !== si ? s : { ...s, items: s.items.map((it, k2) => (k2 === ii ? { ...it, [k]: v } : it)) })),
  });
  const removeItem = (si, ii) => onChange({ ...week, supplements: week.supplements.map((s, j) => (j !== si ? s : { ...s, items: s.items.filter((_, k2) => k2 !== ii) })) });
  const addItem = (si) => onChange({ ...week, supplements: week.supplements.map((s, j) => (j !== si ? s : { ...s, items: [...s.items, { id: uid(), name: "", dose: "" }] })) });

  // Sostituisce l'intero protocollo del cliente (delete + insert, vedi nota
  // in saveWeekSupplements): niente storico da preservare qui, a differenza
  // dell'allenamento.
  const [suppSaving, setSuppSaving] = useState(false);
  const [suppError, setSuppError] = useState("");
  const [suppSaved, setSuppSaved] = useState(false);
  const saveSupplements = async () => {
    if (!isRealMode) return;
    setSuppSaving(true);
    setSuppError("");
    try {
      await saveWeekSupplements(supabase, coachId, client.id, week.supplements);
      setSuppSaved(true);
      setTimeout(() => setSuppSaved(false), 2500);
    } catch (err) {
      console.error("PERFORM: errore salvataggio prescribed_supplements", err);
      setSuppError(err.message || "Non sono riuscito a salvare il protocollo.");
    } finally {
      setSuppSaving(false);
    }
  };

  return (
    <div>
      <ConfirmToggle label="Integratori" checked={week.confirmed.supplements} onToggle={() => onChange({ ...week, confirmed: { ...week.confirmed, supplements: !week.confirmed.supplements } })} />
      <div className="space-y-3">
      {week.supplements.map((sec, si) => (
        <div key={sec.id} className="c-card">
          <div className="flex items-center gap-2 mb-3">
            <input value={sec.title} onChange={(e) => updTitle(si, e.target.value)} className="t-input flex-1 text-sm font-medium rounded-lg px-3 py-2" />
            <button onClick={() => removeSection(si)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi sezione"><Trash2 size={13} /></button>
          </div>
          <div className="space-y-2 mb-2.5">
            {sec.items.map((it, ii) => (
              <div key={it.id} className="t-inner px-3 py-2.5 flex items-center gap-2 flex-wrap">
                <input value={it.name} onChange={(e) => updItem(si, ii, "name", e.target.value)} placeholder="Nome integratore" className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[160px]" />
                <input value={it.dose} onChange={(e) => updItem(si, ii, "dose", e.target.value)} placeholder="Dose" className="t-input w-28 text-sm rounded-md px-2 py-1.5" />
                <button onClick={() => removeItem(si, ii)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi"><Trash2 size={13} /></button>
              </div>
            ))}
            {sec.items.length === 0 && <p className="c-muted text-xs px-1">Nessun integratore in questa fascia oraria.</p>}
          </div>
          <button onClick={() => addItem(si)} className="c-ghost px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"><Plus size={12} /> Integratore</button>
        </div>
      ))}
      <button onClick={addSection} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-center gap-2">
        <Plus size={14} /> Nuova sezione (mattina, spuntino, pre/intra/post-workout…)
      </button>
      </div>

      {isRealMode && (
        <div className="c-card mt-5">
          {suppError && (
            <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
              {suppError}
            </p>
          )}
          <button onClick={saveSupplements} disabled={suppSaving} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">
            {suppSaving ? "Salvataggio…" : "Salva modifiche"}
          </button>
          {suppSaved && (
            <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mt-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
              ✓ Protocollo salvato
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* Timeline ancorata a oggi: offset 0 = settimana corrente, +1..+12 in avanti
   (limite richiesto), storico all'indietro senza limite — si genera pigro
   ogni volta che il coach naviga in una settimana mai vista prima. */
/* Co-Pilota AI: legge in un colpo solo anamnesi (dolori/livello), check
   settimanali (trend peso/addome, badge predittivo) e bioritmi (sonno
   medio), produce una considerazione clinica sintetica e propone UNA
   correzione azionabile in un clic — non un testo statico, scrive davvero
   nello stesso `quickTargets` condiviso con l'editor sottostante e col
   Registro Check. Motore deterministico, stesso principio di trasparenza
   degli altri "AI" del progetto: regole esplicite, non un LLM. */
/* Strategia di sblocco per uno stallo: non è sempre "taglia ancora" — dipende
   da quanto deficit ha già accumulato l'atleta rispetto al suo TDEE. Deficit
   profondo → Diet Break a mantenimento (recupera ormoni/aderenza prima di
   tagliare oltre). Deficit medio → Refeed di carboidrati mirato (rialza la
   leptina, rompe lo stallo senza uscire dal percorso). Deficit leggero →
   il classico taglio calorico ad hoc regge ancora. */
function pickStallStrategy(client, quickTargets, bio) {
  const tdee = computeTDEE(client);
  const stored = quickTargets?.[client.id]?.ON;
  const onTarget = stored || makeMacroProfile(client.calories, 0.28, 0.47, 0.25);
  const onKcal = kcalFromMacros(onTarget.p, onTarget.c, onTarget.f);
  const deficitPct = Math.max(0, (tdee - onKcal) / tdee);
  const baseSteps = { sedentario: 4000, leggero: 6000, moderato: 8000, attivo: 10000, "molto attivo": 12000 }[client.activity] || 7000;
  const avgSteps = bio ? average(bio.slice(-3).map((b) => b.passi)) : baseSteps;
  const lowNeat = avgSteps < baseSteps * 0.85;
  if (deficitPct > 0.25) {
    return { type: "diet_break", label: "Diet Break a mantenimento", tdee, onKcal,
      detail: `Deficit già profondo (~${Math.round(deficitPct * 100)}% sotto TDEE stimato di ${tdee} kcal) — un altro taglio ora rischia solo di peggiorare aderenza e ormoni. Porta 7-10 giorni a mantenimento prima di riprendere.` };
  }
  if (deficitPct > 0.12) {
    return { type: "refeed", label: "Refeed di carboidrati (1-2 giorni)", tdee, onKcal,
      detail: `Deficit moderato (~${Math.round(deficitPct * 100)}%) — prova un refeed di carboidrati per 1-2 giorni (rialzo leptina) prima di tagliare ancora: spesso sblocca lo stallo senza uscire dal percorso.` };
  }
  if (lowNeat) {
    return { type: "neat", label: "Aumento NEAT (+2000 passi/die)", tdee, onKcal,
      detail: `Deficit ancora leggero e passi medi (~${Math.round(avgSteps)}) sotto la baseline attesa per il suo livello di attività — prima di tagliare ancora le kcal, alza il NEAT: stesso deficit energetico, meno stress su fame e aderenza.` };
  }
  return { type: "cut", label: "Taglio calorico ad hoc (−150 Kcal)", tdee, onKcal,
    detail: `Deficit ancora leggero (~${Math.round(deficitPct * 100)}%) rispetto al TDEE stimato di ${tdee} kcal, passi nella norma — un taglio classico da 150 kcal è la mossa più semplice ed efficace qui.` };
}

function AICoPilot({ client, quickTargets, setQuickTargets }) {
  const checkHistory = useMemo(() => buildCheckHistory(client), [client]);
  const bio = useMemo(() => buildBioHistory(client), [client]);
  const badge = predictiveBadge(client, checkHistory);
  const avgSleep = average(bio.map((b) => b.sonno));
  const anam = useMemo(() => simulateAnamnesis(client), [client]);
  const [applied, setApplied] = useState(null);

  const lowSleep = avgSleep < 6;
  const hasPain = client.evening.doloreGrado >= 3;

  /* Deload CNS: crollo HRV (ultimo valore vs media delle settimane precedenti)
     insieme a stress percepito alto — è la combinazione che la letteratura
     associa a rischio di sovrallenamento, non l'una o l'altra da sola. */
  const hrvValues = bio.map((b) => b.hrv);
  const latestHrv = hrvValues[hrvValues.length - 1];
  const avgHrvPrior = average(hrvValues.slice(0, -1));
  const hrvDropPct = avgHrvPrior > 0 ? (avgHrvPrior - latestHrv) / avgHrvPrior : 0;
  const needsDeload = hrvDropPct > 0.15 && client.lastCheck.stress >= 7;

  const stallStrategy = badge?.type === "stall" ? pickStallStrategy(client, quickTargets, bio) : null;

  const considerations = [];
  if (needsDeload) considerations.push(`⚠ HRV in calo del ${Math.round(hrvDropPct * 100)}% rispetto alla media recente, stress ${client.lastCheck.stress}/10 — segnale di sovrallenamento del SNC in arrivo: valuta uno scarico di volume/intensità la settimana prossima, prima che il calo diventi un infortunio o un crollo di performance.`);
  if (stallStrategy) considerations.push(`Stallo peso/addome da 14 giorni con aderenza ${client.adherence != null ? `${client.adherence}%` : "n/d"} — non è un problema di costanza. Strategia consigliata: ${stallStrategy.label}. ${stallStrategy.detail}`);
  if (badge?.type === "recomp") considerations.push(`Recomp in corso: addome in calo, peso stabile — il piano attuale sta funzionando, non toccarlo.`);
  if (lowSleep) considerations.push(`Sonno medio ${avgSleep.toFixed(1)}h nelle ultime 8 settimane — sotto le 7h il recupero è compromesso indipendentemente da dieta e allenamento.`);
  if (hasPain) considerations.push(`Dolore Grado ${client.evening.doloreGrado}/5 attivo (${client.evening.doloreNota}) — il Mesociclo AI Creator lo esclude già dagli esercizi a rischio.`);
  if (anam.livello === "principiante" && client.plan !== "training") considerations.push(`Livello anamnesi "principiante": verifica che il volume settimanale non sia tarato su un atleta intermedio.`);
  if (considerations.length === 0) considerations.push("Nessuna criticità incrociata rilevata: dati coerenti tra anamnesi, check e bioritmi.");

  const applyStrategy = () => {
    if (!stallStrategy) return;
    const adjust = (profile) => {
      const stored = quickTargets?.[client.id]?.[profile];
      const target = stored || (profile === "ON" ? makeMacroProfile(client.calories, 0.28, 0.47, 0.25) : makeMacroProfile(Math.round(client.calories * 0.9), 0.3, 0.35, 0.35));
      const kcal = kcalFromMacros(target.p, target.c, target.f);
      const ratios = kcal > 0 ? { p: (target.p * 4) / kcal, c: (target.c * 4) / kcal, f: (target.f * 9) / kcal } : { p: 0.3, c: 0.45, f: 0.25 };
      let newP = target.p, newC = target.c, newF = target.f;
      if (stallStrategy.type === "cut") {
        const newKcal = Math.max(0, kcal - 150);
        newP = Math.round((newKcal * ratios.p) / 4); newC = Math.round((newKcal * ratios.c) / 4); newF = Math.round((newKcal * ratios.f) / 9);
      } else if (stallStrategy.type === "refeed" && profile === "ON") {
        newC = Math.round(target.c * 1.35); // rialzo carbo mirato, non tutto il resto
      } else if (stallStrategy.type === "diet_break") {
        const maintenance = profile === "ON" ? stallStrategy.tdee : Math.round(stallStrategy.tdee * 0.92);
        newP = Math.round((maintenance * ratios.p) / 4); newC = Math.round((maintenance * ratios.c) / 4); newF = Math.round((maintenance * ratios.f) / 9);
      }
      return { p: newP, c: newC, f: newF };
    };
    setQuickTargets((qt) => ({ ...qt, [client.id]: { ON: adjust("ON"), OFF: adjust("OFF") } }));
    setApplied(stallStrategy.label);
  };

  return (
    <div className="c-card mb-5" style={{ border: "1.5px solid #C5A059" }}>
      <p className="c-heading font-display font-bold mb-1">🤖 Co-Pilota AI</p>
      <p className="c-muted text-xs mb-3">Incrocia anamnesi, check settimanali e bioritmi prima di ogni modifica al piano.</p>
      <ul className="space-y-1.5 mb-3">
        {considerations.map((c, i) => (
          <li key={i} className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}>{c}</li>
        ))}
      </ul>
      {stallStrategy && stallStrategy.type !== "neat" && !applied && (
        <button onClick={applyStrategy} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">
          Applica: {stallStrategy.label} (settimana corrente)
        </button>
      )}
      {applied && (
        <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
          ✅ {applied} applicato — visibile subito nell'editor sotto e nel Registro Check
        </p>
      )}
    </div>
  );
}

function ClientTimeline({ client, quickTargets, setQuickTargets }) {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const myQuickTarget = quickTargets?.[client.id];
  const [weeksByOffset, setWeeksByOffset] = useState(() => ({ 0: makeDefaultWeek(client, 0, myQuickTarget) }));
  const [selOffset, setSelOffset] = useState(0);
  const [windowStart, setWindowStart] = useState(-2); // la striscia visibile mostra 7 pallini a partire da qui
  const [section, setSection] = useState("allenamento");
  const [cloned, setCloned] = useState(false);

  const ensureWeek = (offset) => setWeeksByOffset((m) => (m[offset] ? m : { ...m, [offset]: makeDefaultWeek(client, offset, offset === 0 ? myQuickTarget : null) }));
  const goTo = (offset) => { ensureWeek(offset); setSelOffset(offset); };
  const week = weeksByOffset[selOffset] || makeDefaultWeek(client, selOffset, selOffset === 0 ? myQuickTarget : null);

  // Ogni modifica alla settimana corrente (offset 0) sincronizza anche il
  // target ON/OFF "al volo" condiviso col Registro Check Lunedì, così le due
  // viste restano coerenti: il coach può regolare le kcal da lì o da qui,
  // è lo stesso identico numero.
  // NOTA: da qui in giù setWeek governa SOLO dieta/integratori/confirmed —
  // restano il finto useState locale di prima, come richiesto. La parte
  // workout reale vive nel blocco subito sotto, separata apposta.
  const setWeek = (updater) => setWeeksByOffset((m) => {
    const nextWeek = updater(m[selOffset]);
    if (selOffset === 0 && setQuickTargets) {
      setQuickTargets((qt) => ({ ...qt, [client.id]: { ON: nextWeek.diet.ON.target, OFF: nextWeek.diet.OFF.target } }));
    }
    return { ...m, [selOffset]: nextWeek };
  });

  // --- ALLENAMENTO REALE ------------------------------------------------
  // Unica sotto-sezione che parla con Supabase: legge/scrive solo
  // workout_logs tramite coachingData.js. makeDefaultWeek/deepCloneWeek
  // continuano a girare sopra per dieta e integratori (week.workout che
  // producono viene semplicemente ignorato quando isRealMode è true, sotto).
  const weekStartISO = weekKeyForOffset(selOffset);
  const [realWorkout, setRealWorkout] = useState(null); // null = non ancora caricato per questa settimana
  const [workoutLoading, setWorkoutLoading] = useState(isRealMode);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  const [workoutError, setWorkoutError] = useState("");
  const [workoutSaved, setWorkoutSaved] = useState(false);

  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    setRealWorkout(null);
    setWorkoutLoading(true);
    setWorkoutError("");
    setWorkoutSaved(false);
    fetchWeekWorkout(supabase, client.id, weekStartISO, (name) => !EXERCISE_LIB[name])
      .then((data) => { if (!cancelled) setRealWorkout(data); })
      .catch((err) => {
        console.error("PERFORM: errore caricamento allenamento reale", err);
        if (!cancelled) setWorkoutError("Non sono riuscito a caricare l'allenamento di questa settimana.");
      })
      .finally(() => { if (!cancelled) setWorkoutLoading(false); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id, weekStartISO]);

  const workoutForEditor = isRealMode ? realWorkout : week.workout;
  const workoutEditorWeek = { ...week, workout: workoutForEditor ?? Array(7).fill(null) };
  const handleWorkoutEditorChange = (nextWeek) => {
    if (isRealMode) {
      setRealWorkout(nextWeek.workout);
      setWorkoutSaved(false);
      setWeek((w) => ({ ...w, confirmed: { ...w.confirmed, workout: nextWeek.confirmed.workout } }));
    } else {
      setWeek((w) => ({ ...w, workout: nextWeek.workout, confirmed: { ...w.confirmed, workout: nextWeek.confirmed.workout } }));
    }
  };

  const saveWorkout = async () => {
    if (!isRealMode || !realWorkout) return;
    setWorkoutBusy(true);
    setWorkoutError("");
    try {
      // I nomi in libreria (custom === false) prendono il distretto da
      // EXERCISE_LIB (mappato ai nomi reali del DB): il coach non deve
      // sceglierlo a mano per quelli, solo per gli esercizi liberi.
      const resolved = realWorkout.map((day) => day && {
        ...day,
        exercises: day.exercises.map((ex) => ({
          ...ex,
          muscleTarget: ex.custom ? ex.muscleTarget : resolveMuscleTarget(ex.name),
        })),
      });
      await saveWeekWorkout(supabase, client.id, weekStartISO, resolved);
      setRealWorkout(resolved);
      setWorkoutSaved(true);
      setTimeout(() => setWorkoutSaved(false), 2500);
    } catch (err) {
      console.error("PERFORM: errore salvataggio allenamento reale", err);
      setWorkoutError(err.message || "Non sono riuscito a salvare l'allenamento.");
    } finally {
      setWorkoutBusy(false);
    }
  };

  const cloneToNext = async () => {
    if (selOffset >= MAX_FORWARD_WEEKS) return;
    const nextOffset = selOffset + 1;
    // Dieta/integratori: clone locale invariato, come prima.
    setWeeksByOffset((m) => ({ ...m, [nextOffset]: deepCloneWeek(m[selOffset]) }));
    if (isRealMode) {
      setWorkoutBusy(true);
      setWorkoutError("");
      try {
        await cloneWeekWorkout(supabase, client.id, weekStartISO, weekKeyForOffset(nextOffset));
      } catch (err) {
        console.error("PERFORM: errore clonazione allenamento reale", err);
        setWorkoutError(err.message || "Non sono riuscito a clonare l'allenamento della settimana.");
      } finally {
        setWorkoutBusy(false);
      }
    }
    setSelOffset(nextOffset);
    if (nextOffset > windowStart + 6) setWindowStart(nextOffset - 6);
    setCloned(true);
    setTimeout(() => setCloned(false), 2200);
  };
  const shiftWindow = (dir) => setWindowStart((w) => w + dir * 7);
  const backToToday = () => { setWindowStart(-2); goTo(0); };

  const pills = Array.from({ length: 7 }, (_, i) => windowStart + i);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={() => shiftWindow(-1)} className="c-ghost w-8 h-8 rounded-full flex items-center justify-center shrink-0" aria-label="Settimane precedenti">‹</button>
          <div className="flex gap-1.5 flex-wrap">
            {pills.map((offset) => {
              const wk = weeksByOffset[offset] || makeDefaultWeek(client, offset);
              const color = weekDeptColor(offset, wk, client.plan);
              const dot = color === "yellow" ? "#F0A020" : color === "green" ? "#10B981" : "#DC2626";
              const on = selOffset === offset;
              return (
                <button key={offset} onClick={() => goTo(offset)} className="relative w-11 h-11 rounded-full font-data text-[11px] font-bold flex flex-col items-center justify-center leading-none"
                  style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}
                  title={weekRangeLabel(offset)}>
                  <span className="absolute top-1 right-1 rounded-full" style={{ width: 6, height: 6, backgroundColor: dot }} />
                  {offset === 0 ? "OGGI" : offset > 0 ? `S+${offset}` : `S${offset}`}
                </button>
              );
            })}
          </div>
          <button onClick={() => shiftWindow(1)} className="c-ghost w-8 h-8 rounded-full flex items-center justify-center shrink-0" aria-label="Settimane successive">›</button>
        </div>
        <button onClick={backToToday} className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">Torna a oggi</button>
      </div>
      <p className="c-muted font-data text-[11px] mb-4">
        {weekRangeLabel(selOffset)} · 🟢 completa per il piano {client.plan === "full" ? "Full Coaching" : "Solo Allenamento"} · 🔴 da fare · 🟡 storico
      </p>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="c-label">Settimana selezionata: {selOffset === 0 ? "corrente" : selOffset > 0 ? `+${selOffset} da oggi` : `${Math.abs(selOffset)} fa (storico)`}</p>
        <button onClick={cloneToNext} disabled={selOffset >= MAX_FORWARD_WEEKS || workoutBusy} className="c-btn px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
          <Copy size={14} /> Clona Settimana → {selOffset + 1 === 0 ? "OGGI" : `S+${selOffset + 1}`}
        </button>
      </div>
      {cloned && (
        <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mb-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
          Settimana clonata · rifinisci solo le variazioni
        </p>
      )}

      <div className="grid grid-cols-3 gap-1.5 mb-5">
        {[["allenamento", "Allenamento", Dumbbell], ["dieta", "Dieta", Salad], ["integratori", "Integratori", Pill]].map(([id, lab, Ico]) => {
          const on = section === id;
          return (
            <button key={id} onClick={() => setSection(id)} className="rounded-xl px-2 py-3 flex flex-col items-center gap-1.5"
              style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
              <Ico size={17} strokeWidth={on ? 2 : 1.6} style={{ color: on ? "#C5A059" : "var(--ink-soft)" }} />
              <span className="font-data text-[11px] uppercase" style={{ fontWeight: on ? 600 : 400 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {section === "allenamento" && (
        isRealMode && workoutLoading ? (
          <p className="c-muted text-sm px-1">Caricamento allenamento…</p>
        ) : isRealMode && !realWorkout ? (
          <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
            {workoutError || "Impossibile caricare l'allenamento di questa settimana."}
          </p>
        ) : (
          <>
            <WeekWorkoutEditor week={workoutEditorWeek} onChange={handleWorkoutEditorChange} client={client} />
            {isRealMode && (
              <div className="c-card mt-3">
                {workoutError && (
                  <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
                    {workoutError}
                  </p>
                )}
                <button onClick={saveWorkout} disabled={workoutBusy} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">
                  {workoutBusy ? "Salvataggio…" : "Salva modifiche"}
                </button>
                {workoutSaved && (
                  <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mt-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
                    ✓ Allenamento salvato
                  </p>
                )}
              </div>
            )}
          </>
        )
      )}
      {section === "dieta" && <WeekDietEditor week={week} onChange={(w) => setWeek(() => w)} client={client} />}
      {section === "integratori" && <WeekSuppsEditor week={week} onChange={(w) => setWeek(() => w)} client={client} />}
    </div>
  );
}

/* ------------------------------- ANAMNESI (56) ------------------------------ */
function AnamField({ q, value, onChange }) {
  const common = "t-input w-full text-sm rounded-md px-2.5 py-2";
  if (q.t === "area") return <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={q.ph} rows={2} className={common} />;
  if (q.t === "select") return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={common}>
      <option value="">—</option>
      {q.opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  if (q.t === "scale") return <input type="number" min={1} max={10} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className={common + " font-data"} placeholder="1-10" />;
  if (q.t === "date") return <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className={common + " font-data"} />;
  if (q.t === "number") return <input type="number" min={q.min} max={q.max} step={q.step || 1} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={common + " font-data"} />;
  if (q.t === "photos") return <p className="c-muted text-xs px-1 py-2">📷 3/3 foto caricate al check iniziale (demo)</p>;
  return <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={q.ph} className={common} />;
}

export function AnamAreaSection({ areaId, label, questions, answers, onChange, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const filled = questions.filter((q) => q.t !== "photos" && String(answers[q.k] ?? "").trim() !== "").length;
  return (
    <div className="c-card">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3">
        <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{label}</span>
        <span className="flex items-center gap-2">
          <span className="font-data text-[11px]" style={{ color: "var(--ink-soft)" }}>{filled}/{questions.length}</span>
          {open ? <ChevronUp size={16} style={{ color: "var(--ink-soft)" }} /> : <ChevronDown size={16} style={{ color: "var(--ink-soft)" }} />}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {questions.map((q) => (
            <div key={q.k}>
              <label className="c-label block mb-1">{q.n}. {q.q}{q.req && <span style={{ color: "#DC2626" }}> *</span>}</label>
              <AnamField q={q} value={answers[q.k]} onChange={(v) => onChange(q.k, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnamnesisPanel({ client }) {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const [answers, setAnswers] = useState(() => (isRealMode ? (client._anamnesisAnswers ?? {}) : simulateAnamnesis(client)));
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | 'error'

  const setField = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  // Autosalvataggio reale: 900ms dopo l'ultima modifica, scrive tutte le
  // risposte su anamnesis_responses. Debounced per non scrivere a ogni
  // singolo carattere digitato.
  useEffect(() => {
    if (!isRealMode) return undefined;
    setSaveState("saving");
    const t = setTimeout(() => {
      saveAnamnesis(supabase, client.id, answers)
        .then(() => setSaveState("saved"))
        .catch((err) => { console.error("PERFORM: errore salvataggio anamnesi", err); setSaveState("error"); });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, isRealMode, client.id]);

  const totalFilled = ANAM_QUESTIONS.filter((q) => q.t !== "photos" && String(answers[q.k] ?? "").trim() !== "").length;
  const pct = Math.round((totalFilled / (ANAM_QUESTIONS.length - 1)) * 100); // -1: __foto non conta come domanda testuale

  return (
    <div className="space-y-3">
      <div className="c-card">
        <div className="flex items-center justify-between mb-1">
          <p className="c-heading font-display font-bold">Anagrafica di registrazione</p>
          <span className="font-data text-xs font-bold" style={{ color: pct >= 90 ? "#10B981" : pct >= 50 ? "#F0A020" : "#DC2626" }}>{pct}% anamnesi compilata</span>
        </div>
        <p className="c-muted text-xs mb-4">
          Email e password vengono dalla registrazione (la password si visualizza/modifica dal Hub Rete → Controllo Accessi); il resto (data di nascita, telefono, città, peso, altezza…) viene autocompilato dalle 56 domande di anamnesi qui sotto.
        </p>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Email</p>
            <p className="font-data text-sm truncate" style={{ color: "var(--ink)" }}>{client.email}</p>
          </div>
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Data di nascita</p>
            <p className="font-data text-sm" style={{ color: "var(--ink)" }}>{answers.nascita} · {client.age} anni</p>
          </div>
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Telefono</p>
            <p className="font-data text-sm" style={{ color: "var(--ink)" }}>{answers.telefono}</p>
          </div>
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Città</p>
            <p className="font-data text-sm" style={{ color: "var(--ink)" }}>{answers.citta}</p>
          </div>
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Peso attuale</p>
            <p className="font-data text-sm" style={{ color: "var(--ink)" }}>{answers.peso} kg</p>
          </div>
          <div className="t-inner px-3 py-2.5">
            <p className="c-label mb-0.5">Altezza</p>
            <p className="font-data text-sm" style={{ color: "var(--ink)" }}>{answers.altezza} cm</p>
          </div>
        </div>
      </div>

      {Object.entries(ANAM_AREAS).map(([areaId, label]) => (
        <AnamAreaSection key={areaId} areaId={areaId} label={label} questions={ANAM_QUESTIONS.filter((q) => q.area === areaId)}
          answers={answers} onChange={setField} defaultOpen={areaId === "a1"} />
      ))}

      {isRealMode ? (
        <p className="c-muted text-xs px-1 leading-relaxed">
          {saveState === "saving" && "Salvataggio in corso…"}
          {saveState === "saved" && "✓ Risposte salvate."}
          {saveState === "error" && "Errore nel salvataggio — riprova o controlla la connessione."}
          {!saveState && "Le risposte del cliente, quando le compila, appaiono qui automaticamente."}
        </p>
      ) : (
        <p className="c-muted text-xs px-1 leading-relaxed">
          Queste risposte sono simulate per l'anteprima (il monolite non contiene ancora i dati reali compilati dagli atleti). Appena mi mandi le risposte vere o il modulo di registrazione, le sostituisco 1:1 — struttura e chiavi restano identiche.
        </p>
      )}
    </div>
  );
}

/* ------------------------------- SCHEDA CLIENTE ----------------------------- */
/* ==========================================================================
   🏆 GAMIFICATION LATO COACH — "Segnala Obiettivo Raggiunto"
   Due azioni reali eseguite insieme al click:
   1) Accredita +500 XP sul profilo dell'atleta.
   2) Pubblica un post automatico in bacheca Avvisi Team.

   TRASPARENZA SULL'ARCHITETTURA — leggi prima di integrare:
   Questo file è isolato con dati locali (stesso motivo di sempre: anteprima
   leggera, un file alla volta, nessun client Supabase configurato qui
   dentro). Quello che il pulsante fa VERAMENTE in questa preview:
   aggiorna lo stato React condiviso (xpBonuses, teamPosts) così l'XP e il
   post compaiono a schermo all'istante — non è finto, è la stessa
   interazione UI che avrà in produzione. Quello che NON può fare da qui:
   scrivere davvero su Supabase, perché non c'è un client Supabase importato
   in questo componente isolato.
   Le due chiamate reali che la produzione deve eseguire (stessi nomi di
   tabella/RPC già usati nelle chat precedenti su questo progetto):

     // 1) XP — meglio un RPC atomico che un update letto-poi-scritto,
     //    per evitare race condition se il coach segna due obiettivi
     //    quasi in contemporanea:
     await supabase.rpc('increment_client_xp', {
       p_client_id: client.id,
       p_amount: 500,
     });
     // fallback se l'RPC non esiste ancora:
     // await supabase.from('client_profiles')
     //   .update({ xp: currentXp + 500 })
     //   .eq('id', client.id);

     // 2) Post in bacheca — tabella reale già in uso in NewsTipsView.jsx:
     //    coach_news_tips, categoria "team" (Avvisi Team), sola scrittura
     //    coach, visual_kind "trophy" (icona Trophy già mappata lì).
     await supabase.from('coach_news_tips').insert({
       category: 'team',
       visual_kind: 'trophy',
       title: `${client.name} ha raggiunto l'obiettivo!`,
       body: goalText,
       author: 'coach',
       created_at: new Date().toISOString(),
     });

   Quando questo file smette di essere un'anteprima isolata e viene montato
   dentro l'app vera con un client Supabase in contesto, queste due chiamate
   sostituiscono semplicemente i due `set...` qui sotto — la UI non cambia.
   ========================================================================== */
function GoalAchievedPanel({ client, xpBonuses, setXpBonuses, teamPosts, setTeamPosts }) {
  const [goalText, setGoalText] = useState("");
  const [justPosted, setJustPosted] = useState(false);
  const bonus = xpBonuses?.[client.id] || 0;
  const totalXp = client.xp + bonus;
  const myPosts = (teamPosts || []).filter((p) => p.clientId === client.id);

  const segnalaObiettivo = () => {
    const text = goalText.trim() || "Obiettivo di mesociclo raggiunto";
    // 1) Accredito +500 XP — in produzione: supabase.rpc('increment_client_xp', ...)
    setXpBonuses((prev) => ({ ...prev, [client.id]: (prev[client.id] || 0) + 500 }));
    // 2) Pubblico il post in Avvisi Team — in produzione: supabase.from('coach_news_tips').insert(...)
    setTeamPosts((prev) => [
      { id: uid(), clientId: client.id, title: `${client.name} ha raggiunto l'obiettivo! 🏆`, body: text, createdAt: new Date().toISOString() },
      ...(prev || []),
    ]);
    setGoalText("");
    setJustPosted(true);
    setTimeout(() => setJustPosted(false), 2600);
  };

  return (
    <div className="c-card" style={{ border: "1.5px solid #C5A059" }}>
      <div className="flex items-center justify-between mb-1">
        <p className="c-heading font-display font-bold">🏆 Gamification</p>
        <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{totalXp.toLocaleString("it-IT")} XP</p>
      </div>
      <p className="c-muted text-xs mb-4">
        {bonus > 0 ? `Base ${client.xp.toLocaleString("it-IT")} + ${bonus.toLocaleString("it-IT")} da obiettivi segnalati in questa sessione.` : "Nessun bonus obiettivo ancora segnalato in questa sessione."}
      </p>
      <label className="block mb-3">
        <span className="c-label block mb-1.5">Descrizione obiettivo (facoltativa, va nel post)</span>
        <input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="es. Primo squat a corpo libero da 100 kg"
          className="t-input w-full text-sm rounded-lg px-3 py-2.5" />
      </label>
      <button onClick={segnalaObiettivo} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">
        🏆 Segnala Obiettivo Raggiunto
      </button>
      {justPosted && (
        <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mt-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
          ✅ +500 XP accreditati · post pubblicato in Avvisi Team
        </p>
      )}

      {myPosts.length > 0 && (
        <div className="mt-4">
          <p className="c-label mb-2">Post pubblicati in Avvisi Team (questa sessione)</p>
          <div className="space-y-1.5">
            {myPosts.map((p) => (
              <div key={p.id} className="rounded-xl px-3 py-2.5 flex items-start gap-2.5" style={{ backgroundColor: "rgba(63,122,94,0.08)", border: "1px solid rgba(63,122,94,0.28)" }}>
                <span style={{ fontSize: "1.1rem" }}>🏆</span>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{p.title}</p>
                  <p className="c-muted text-xs mt-0.5">{p.body}</p>
                  <p className="font-data text-[10px] mt-1" style={{ color: "#3F7A5E" }}>📢 Avvisi Team</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientDetail({ client, onBack, quickTargets, setQuickTargets, xpBonuses, setXpBonuses, teamPosts, setTeamPosts, initialTab = "anamnesi" }) {
  const { supabase, isRealMode, reloadRoster } = useContext(CoachDataContext);
  const status = computeStatus(client);
  const meta = STATUS_META[status];
  const [tab, setTab] = useState(initialTab);
  const titleClass = client.gender === "F" ? "gradient-title-f" : "gradient-title-m";

  // "Cambia abbonamento": a differenza di "Prendi in gestione" (solo per
  // clientStatus === "registered"), qui il selettore è sempre disponibile —
  // il coach può correggere/aggiornare il piano di un cliente già attivo in
  // qualsiasi momento, non solo alla prima presa in carico.
  const [changingPlan, setChangingPlan] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const changePlan = async (plan) => {
    setPlanBusy(true);
    try {
      await activateClient(supabase, client.id, plan);
      setChangingPlan(false);
      reloadRoster?.();
    } catch (err) {
      console.error("PERFORM: errore cambio abbonamento", err);
    } finally {
      setPlanBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="c-ghost flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md">
          <ArrowLeft size={15} /> Torna al catalogo
        </button>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${meta.pill}`}>{meta.label}</span>
      </div>

      <div className="c-card mb-5">
        <p className={`font-display text-xl ${titleClass}`}>{client.name}</p>
        <p className="c-muted font-data text-xs uppercase mt-1">{client.goal} · {client.calories} kcal · streak {client.streak} giorni · aderenza {client.adherence != null ? `${client.adherence}%` : "n/d"}</p>
        {isRealMode && (
          <div className="mt-3">
            {changingPlan ? (
              <CoachingPlanPicker onPick={changePlan} busy={planBusy} onCancel={() => setChangingPlan(false)} />
            ) : (
              <button onClick={() => setChangingPlan(true)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium">
                Cambia abbonamento
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {[["anamnesi", "Anamnesi", ChevronDown], ["check", "Check Settimanali", CalendarDays], ["bioritmi", "Bioritmi & Grafici", AlertTriangle], ["editor", "Editor & AI", Dumbbell]].map(([id, lab, Ico]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} className="rounded-2xl px-2 py-3.5 flex flex-col items-center gap-1.5"
              style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
              <Ico size={18} strokeWidth={on ? 2 : 1.6} style={{ color: on ? "#C5A059" : "var(--ink-soft)" }} />
              <span className="font-data text-xs uppercase text-center" style={{ fontWeight: on ? 600 : 400, lineHeight: 1.1 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {tab === "anamnesi" && <AnamnesisPanel client={client} />}

      {tab === "check" && (
        <div className="space-y-4">
          <GoalAchievedPanel client={client} xpBonuses={xpBonuses} setXpBonuses={setXpBonuses} teamPosts={teamPosts} setTeamPosts={setTeamPosts} />
          <CheckDetail client={client} quickTargets={quickTargets} setQuickTargets={setQuickTargets} onSwitchToEditor={() => setTab("editor")} />
        </div>
      )}

      {tab === "bioritmi" && <BioritmiGrafici client={client} />}

      {tab === "editor" && (
        <div>
          <AICoPilot client={client} quickTargets={quickTargets} setQuickTargets={setQuickTargets} />
          <ClientTimeline client={client} quickTargets={quickTargets} setQuickTargets={setQuickTargets} />
        </div>
      )}
    </div>
  );
}

/* --------------------------- 📅 REGISTRO CHECK LUNEDÌ -----------------------
   Tab di primo livello (non più dentro la cartella del singolo atleta):
   qui il coach seleziona un atleta e vede la plancia comparativa completa.
   NOTA IMPORTANTE (resta valida): il pop-up bloccante sul telefono la
   domenica sera è lato ATLETA (AuthView.jsx/05_HomeDashboard.jsx). Qui il
   coach legge il risultato già raccolto.
   "DATABASE CHE REGISTRA TUTTO": in questa anteprima è lo stato locale del
   componente (useState), per lo stesso motivo di sempre — file isolato,
   dati simulati. La persistenza vera è la tabella Supabase `weekly_checks`
   già nello schema SQL (peso, circonferenze, foto, timestamp per ogni
   check): questo componente ne è la vista, non un database a sé — quando lo
   colleghi a Supabase, useState diventa una query/subscription e il resto
   del codice non cambia. */
function average(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

/* Ricostruisce 9 check settimanali (8 passati + oggi) a partire dai dati che
   il cliente aveva già (weightHistory a 4 settimane + lastCheck di oggi),
   estendendo la stessa progressione media altre 4 settimane indietro nel
   tempo, con la vita che segue la stessa direzione del peso. È un punto di
   partenza plausibile per il grafico, non un dato reale — appena colleghi
   Supabase questa funzione non serve più, arriva tutto dalla tabella. */
/* Fasi del ciclo, in rotazione plausibile per lo storico simulato (solo
   dimostrativo — nella vera app la sceglie l'atleta ogni lunedì). */
const CYCLE_PHASES = ["Mestruale", "Follicolare", "Ovulazione", "Luteale"];

/* Bioritmi (sonno, passi, HRV): storico simulato a 8 punti settimanali,
   ancorato ai dati reali che il cliente aveva già (ore di sonno, livello di
   attività per il baseline passi, anello di recupero per il baseline HRV),
   con un'oscillazione deterministica (seno) invece di numeri casuali — così
   il grafico è stabile tra un render e l'altro. */
function buildBioHistory(client) {
  const weeks = 8;
  const todayMonday = mondayOf(new Date());
  const baseSteps = { sedentario: 4000, leggero: 6000, moderato: 8000, attivo: 10000, "molto attivo": 12000 }[client.activity] || 7000;
  const baseHRV = Math.round(40 + client.rings.recupero * 50);
  return Array.from({ length: weeks }, (_, i) => {
    const offset = i - (weeks - 1);
    const wave = Math.sin(i * 0.9);
    return {
      date: addWeeksToDate(todayMonday, offset).toISOString().slice(0, 10),
      sonno: Math.max(3, Math.round((client.lastCheck.sleep + wave * 0.6) * 10) / 10),
      passi: Math.max(1000, Math.round(baseSteps + wave * 800)),
      hrv: Math.max(20, Math.round(baseHRV + wave * 4)),
    };
  });
}

/* ===================== 🧪 ANALISI MICRONUTRIENTI (simulata) ==================
   Nessun diario alimentare reale collegato a questo file isolato (vive in
   05_HomeDashboard.jsx): la media settimanale qui è una stima plausibile
   ancorata al piano ON/OFF di default del cliente e al suo profilo — utile
   per vedere il funzionamento del pannello, non un dato clinico da referto.
   In produzione questi numeri arrivano da un aggregato settimanale sui
   pasti realmente registrati dall'atleta (stessa tabella del diario). */
function buildMicronutrientProfile(client) {
  const onProfile = makeMacroProfile(client.calories, 0.28, 0.47, 0.25);
  const weekMeals = makeMealSplit(onProfile, client);
  const totals = dayMicros(weekMeals);
  // Piccola oscillazione settimanale deterministica, stesso principio di buildBioHistory
  const wave = Math.sin(client.id * 1.3);
  return {
    sodiumMg: Math.round(totals.na * (1 + wave * 0.08)),
    potassiumMg: Math.round(totals.k * (1 + wave * 0.06)),
    ironMg: Math.round(totals.fe * (1 + wave * 0.05) * 10) / 10,
    calciumMg: Math.round(totals.ca * (1 + wave * 0.07)),
    magnesiumMg: Math.round(totals.mg * (1 + wave * 0.06)),
  };
}

/* Sonno REM: stima come % del sonno totale (letteratura: ~20-25% del sonno
   in un adulto sano); Stress e Caffeina: dati che nella vera app inserisce
   l'atleta nel diario — qui simulati da campi già esistenti (lastCheck.stress,
   attività) per coerenza col resto del profilo. */
function buildRecoveryInputs(client) {
  const remHours = Math.round(client.lastCheck.sleep * 0.225 * 10) / 10;
  const caffeineMg = { sedentario: 80, leggero: 120, moderato: 160, attivo: 220, "molto attivo": 260 }[client.activity] || 120;
  return { remHours, stressLevel: client.lastCheck.stress, caffeineMg };
}

/* Emivita della caffeina ~5 ore (farmacocinetica riconosciuta). Stimo il
   residuo in circolo all'ora di andare a letto assumendo l'ultima dose alle
   16:00 (ipotesi dichiarata, non un dato reale) — sopra i 50 mg residui la
   letteratura sul sonno segnala interferenza su addormentamento e fase REM. */
const CAFFEINE_HALF_LIFE_H = 5;
const CAFFEINE_RESIDUAL_ALERT_MG = 50;
const ASSUMED_LAST_DOSE_HOUR = 16;
const ASSUMED_BEDTIME_HOUR = 23;
function caffeineResidualAtBedtime(caffeineMg) {
  const hours = ASSUMED_BEDTIME_HOUR - ASSUMED_LAST_DOSE_HOUR;
  return caffeineMg * Math.pow(0.5, hours / CAFFEINE_HALF_LIFE_H);
}

function MicroBar({ label, value, unit, limit, mode }) {
  const pct = Math.min(150, Math.round((value / limit) * 100));
  const isExcess = mode === "limit";
  const bad = isExcess ? pct > 100 : pct < 70;
  const warn = isExcess ? pct > 85 && pct <= 100 : pct >= 70 && pct < 90;
  const color = bad ? "#DC2626" : warn ? "#F0A020" : "#10B981";
  return (
    <div className="t-inner px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="c-label">{label}</span>
        <span className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{Math.round(value)}{unit} <span style={{ color: "var(--ink)", opacity: 0.65 }}>/ {limit}{unit}</span></span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: "var(--line-strong)" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", backgroundColor: color, borderRadius: 999 }} />
      </div>
      {bad && <p className="font-data text-[10px] mt-1" style={{ color }}>{isExcess ? "Oltre il limite consigliato" : "Sotto la soglia RDA — carenza"}</p>}
    </div>
  );
}

/* Griglia micronutrienti LIVE: a differenza della vecchia versione (media
   settimanale simulata), questa legge `dayMicros(current.meals)` — cioè i
   grammi e gli alimenti REALMENTE inseriti in quel Giorno ON/OFF in questo
   momento. Ogni modifica a un alimento o ai suoi grammi ricalcola le 5
   barre all'istante, perché è lo stesso identico stato React dei pasti. */
function LiveMicronutrientGrid({ meals, client }) {
  const totals = dayMicros(meals);
  const targets = microTargets(client);
  return (
    <div className="c-card mb-5">
      <p className="c-heading font-display font-bold mb-1">🧪 Analisi Micronutrienti — questo menu</p>
      <p className="c-muted text-xs mb-4">
        Calcolato in diretta dai cibi inseriti sopra, non da una stima settimanale. Il Sodio è mostrato come rischio da ECCESSO (sale da cibi + bustine da 1g), non da carenza.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <MicroBar label="Sodio (cibi + bustine 1g)" value={totals.na} unit="mg" limit={targets.na.limit} mode="limit" />
        <MicroBar label="Potassio" value={totals.k} unit="mg" limit={targets.k.limit} mode="rda" />
        <MicroBar label="Ferro" value={totals.fe} unit="mg" limit={targets.fe.limit} mode="rda" />
        <MicroBar label="Calcio" value={totals.ca} unit="mg" limit={targets.ca.limit} mode="rda" />
        <MicroBar label="Magnesio" value={totals.mg} unit="mg" limit={targets.mg.limit} mode="rda" />
      </div>
    </div>
  );
}

/* Cruscotto Recupero Neurale: REM/Stress/Caffeina NON derivano dai pasti (non
   sono nutrienti), restano un dato dichiarato dall'atleta — simulato qui per
   coerenza col resto del profilo, non calcolato dal menu come i micronutrienti
   sopra. Vive subito sotto la Dieta per il colpo d'occhio nutrizione↔recupero
   richiesto, ma la fonte dei due pannelli resta diversa e va detta chiara. */
function RecoveryDashboard({ client }) {
  const recovery = useMemo(() => buildRecoveryInputs(client), [client]);
  const residual = caffeineResidualAtBedtime(recovery.caffeineMg);
  const highResidual = residual > CAFFEINE_RESIDUAL_ALERT_MG;
  return (
    <div className="c-card mb-5">
      <p className="c-heading font-display font-bold mb-1">🧠 Cruscotto Recupero Neurale</p>
      <p className="c-muted text-xs mb-4">Sonno REM, stress percepito e caffeina — dati dichiarati dall'atleta, non estratti dal menu qui sopra.</p>
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <div className="t-inner px-3 py-2.5 text-center">
          <p className="c-label mb-1">Sonno REM</p>
          <p className="font-data text-lg font-bold" style={{ color: "var(--ink)" }}>{recovery.remHours}h</p>
          <p className="c-muted text-[10px] mt-0.5">~22-25% del sonno totale</p>
        </div>
        <div className="t-inner px-3 py-2.5 text-center">
          <p className="c-label mb-1">Stress percepito</p>
          <p className="font-data text-lg font-bold" style={{ color: recovery.stressLevel >= 7 ? "#DC2626" : recovery.stressLevel >= 4 ? "#F0A020" : "#10B981" }}>{recovery.stressLevel}/10</p>
        </div>
        <div className="t-inner px-3 py-2.5 text-center">
          <p className="c-label mb-1">Caffeina</p>
          <p className="font-data text-lg font-bold" style={{ color: "var(--ink)" }}>{recovery.caffeineMg} mg</p>
          <p className="c-muted text-[10px] mt-0.5">stimata /giorno</p>
        </div>
      </div>
      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: highResidual ? "#FFFBEB" : "#ECFDF5", border: `1.5px solid ${highResidual ? "#FDE68A" : "#A7F3D0"}` }}>
        <p className="font-data text-xs font-bold" style={{ color: highResidual ? "#92400E" : "#047857" }}>
          {highResidual ? "⚠️" : "✓"} Emivita caffeina (~5h): ~{Math.round(residual)}mg ancora in circolo stimati a letto (ipotesi ultima dose ore {ASSUMED_LAST_DOSE_HOUR}:00, nanna ore {ASSUMED_BEDTIME_HOUR}:00)
        </p>
        {highResidual && <p className="c-muted text-xs mt-1">Sopra i 50mg residui la letteratura segnala interferenza su addormentamento e fase REM — valuta di anticipare l'ultima dose.</p>}
      </div>
    </div>
  );
}



function BioritmiGrafici({ client }) {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const bio = useMemo(() => buildBioHistory(client), [client]);
  const fmtWeek = (p) => { const d = new Date(p.date); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

  // Cerchio Allenamento reale: STESSA formula di Home cliente (05_HomeDashboard.jsx),
  // mai calcolata due volte — vedi computeTrainingCompliance in coachingData.js.
  // ComplianceRing vuole un valore 0-1 (non 0-100): conversione fatta solo qui,
  // al confine, il resto del calcolo resta identico in entrambi i posti.
  const [trainCompliance, setTrainCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeTrainingCompliance(supabase, client.id)
      .then((r) => { if (!cancelled) setTrainCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Allenamento", err);
        if (!cancelled) setTrainCompliance({ status: "neutral", pct: null, completionPct: null, progression: "neutral" });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);
  const trainRingValue = isRealMode
    ? (trainCompliance?.pct != null ? trainCompliance.pct / 100 : null)
    : client.rings.allenamento;

  return (
    <div className="space-y-4">
      {client.evening.doloreGrado > 0 && (
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: client.evening.doloreGrado >= 4 ? "#FEF2F2" : "#FFFBEB", border: `1.5px solid ${client.evening.doloreGrado >= 4 ? "#FECACA" : "#FDE68A"}` }}>
          <p className="font-data text-xs font-bold uppercase" style={{ color: client.evening.doloreGrado >= 4 ? "#B91C1C" : "#92400E" }}>Dolore Grado {client.evening.doloreGrado}/5</p>
          <p className="text-sm mt-1" style={{ color: "#27272A" }}>«{client.evening.doloreNota}»</p>
          <a href={waLink(client, `Ciao ${client.name.split(" ")[0]}, parliamo del dolore che mi hai segnalato?`)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full mt-2" style={{ backgroundColor: "#25D366", color: "#FFFFFF" }}>
            <MessageCircle size={13} /> Scrivi su WhatsApp
          </a>
        </div>
      )}

      <div className="c-card">
        <p className="c-label mb-3">Compliance diari</p>
        <div className="grid grid-cols-3 gap-3">
          <ComplianceRing label="Allenamento" value={trainRingValue} />
          <ComplianceRing label="Alimentazione" value={client.rings.alimentazione} />
          <ComplianceRing label="Recupero" value={client.rings.recupero} />
        </div>
      </div>

      <div className="c-card">
        <p className="c-label mb-3">Sonno (ore/notte)</p>
        <LineChart points={bio} xLabel={fmtWeek} series={[{ key: "sonno", label: "Ore di sonno", color: "#2563EB" }]} />
      </div>
      <div className="c-card">
        <p className="c-label mb-3">Passi giornalieri (media settimanale)</p>
        <LineChart points={bio} xLabel={fmtWeek} series={[{ key: "passi", label: "Passi", color: "#10B981" }]} />
      </div>
      <div className="c-card">
        <p className="c-label mb-3">HRV (ms, variabilità cardiaca)</p>
        <LineChart points={bio} xLabel={fmtWeek} series={[{ key: "hrv", label: "HRV", color: client.gender === "F" ? "#E5C1CD" : "#C5A059" }]} />
      </div>
    </div>
  );
}

function buildCheckHistory(client) {
  const known = [...client.weightHistory, client.lastCheck.weight]; // settimana -4 → oggi (5 valori)
  const step = known.length > 1 ? (known[known.length - 1] - known[0]) / (known.length - 1) : 0;
  const extendedBack = Array.from({ length: 4 }, (_, i) => known[0] - step * (4 - i)); // settimana -8..-5
  const weights = [...extendedBack, ...known]; // 9 valori, indice 0 = settimana -8, ultimo = oggi
  const direction = client.goal === "ricomposizione" ? -1 : 1; // stesso criterio di weightHistory
  const todayMonday = mondayOf(new Date());
  return weights.map((w, i) => {
    const offset = i - (weights.length - 1); // 0 = oggi, negativo = passato
    const waist = client.waistCm - direction * 0.2 * offset; // nel passato: più alta se sta dimagrendo, più bassa se sta crescendo
    return {
      id: uid(),
      date: addWeeksToDate(todayMonday, offset).toISOString().slice(0, 10),
      weight: Math.round(w * 10) / 10,
      waistCm: Math.round(waist * 10) / 10,
      hasPhotos: true,
      // "Quello che i dati da soli non dicono" — simulate riusando i campi
      // che il cliente aveva già (evening.digestione/sonno sono già 1-10;
      // il dolore generico 1-10 lo derivo dal Grado infortunio 1-5 esistente,
      // che è un concetto diverso e resta invariato altrove nel dashboard).
      dolori: Math.min(10, client.evening.doloreGrado * 2),
      stress: client.lastCheck.stress,
      digestione: client.evening.digestione,
      sonno: client.evening.sonno,
      cyclePhase: client.gender === "F" ? CYCLE_PHASES[Math.abs(offset) % CYCLE_PHASES.length] : null,
    };
  });
}

/* Grafico lineare 2D generico multi-serie, stile Apple Salute: ogni serie è
   normalizzata sul proprio min/max (assi Y indipendenti, perché kg/cm/ore
   di sonno/passi/€ hanno scale troppo diverse per stare sovrapposte sulla
   stessa scala). Riusato per Check Settimanali (peso/addome), Bioritmi
   (sonno/passi/HRV) e Hub Finanziario (fatturato mensile) — un solo
   componente invece di quattro grafici quasi identici. */
function LineChart({ points, series, xLabel }) {
  const W = 560, H = 190, PAD = 30;
  const n = points.length;
  const x = (i) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2));
  const scales = series.map((s) => {
    const vals = points.map((p) => Number(p[s.key]) || 0);
    const min = Math.min(...vals), span = Math.max(0.5, Math.max(...vals) - min);
    return { min, span };
  });
  const yFor = (s, i, sc) => H - PAD - ((Number(points[i][s.key]) - sc.min) / sc.span) * (H - PAD * 2);
  return (
    <div>
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 font-data text-[11px]" style={{ color: s.color }}>
            <span style={{ width: 10, height: 3, backgroundColor: s.color, display: "inline-block", borderRadius: 2 }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="scroll-x-clean">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 480 }} role="img" aria-label={series.map((s) => s.label).join(" e ")}>
          {series.map((s, si) => {
            const sc = scales[si];
            const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${yFor(s, i, sc)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke={s.color} strokeWidth="2" />
                {points.map((p, i) => (
                  <circle key={i} cx={x(i)} cy={yFor(s, i, sc)} r={i === n - 1 ? 4 : 2.5} fill={s.color} />
                ))}
              </g>
            );
          })}
          {points.map((p, i) => (i === 0 || i === n - 1 || i % 2 === 0) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="var(--ink-tertiary)" fontFamily='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'>{xLabel(p, i)}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* Logica di avviso predittivo. Confronto a 14 giorni = 2 check settimanali
   indietro rispetto a oggi (gli atleti fanno check ogni lunedì).
   - RECOMP IN CORSO (verde): addome sceso in modo apprezzabile, peso stabile
     → sta ricomponendo (perde grasso, non massa/acqua).
   - STALLO (arancione): sia peso che addome fermi da 14 gg CON aderenza
     alta → non è un problema di costanza, serve un aggiustamento reale.
   Soglie: "stabile" = variazione entro ±0.3; "sceso" = oltre -0.4. */
function predictiveBadge(client, history) {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length < 3) return null;
  const today = sorted[0], twoWeeksAgo = sorted[2];
  const dWeight = today.weight - twoWeeksAgo.weight;
  const dWaist = today.waistCm - twoWeeksAgo.waistCm;
  const weightStable = Math.abs(dWeight) <= 0.3;
  const waistDown = dWaist <= -0.4;
  const bothStalled = Math.abs(dWeight) <= 0.3 && Math.abs(dWaist) <= 0.3;
  if (waistDown && weightStable) {
    return { type: "recomp", label: "🟢 RECOMP IN CORSO", detail: `Addome ${dWaist.toFixed(1)} cm, peso stabile (${dWeight >= 0 ? "+" : ""}${dWeight.toFixed(1)} kg) in 14 giorni` };
  }
  if (bothStalled && client.adherence >= 85) {
    return { type: "stall", label: "🟠 Base stallo · Valuta taglio 150 Kcal", detail: `Peso e addome fermi da 14 giorni con aderenza ${client.adherence != null ? `${client.adherence}%` : "n/d"} — non è un problema di costanza` };
  }
  return null;
}

/* Contorno di verdura fisso, foto Fronte/Lato/Retro a sinistra (check di
   circa un mese fa, offset -4 settimane) e a destra (oggi). Placeholder
   onesto come sempre: nessuna foto reale caricata in questa anteprima. */
function PhotoCompareBoard({ history }) {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = sorted[0];
  const monthAgo = sorted[Math.min(4, sorted.length - 1)];
  const angles = ["Fronte", "Lato", "Retro"];
  return (
    <div className="c-card">
      <p className="c-label mb-3">Plancia comparativa foto — Check Storico ({monthAgo.date}) vs Oggi ({today.date})</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-data text-[11px] uppercase mb-2 text-center" style={{ color: "var(--ink-soft)" }}>Mese scorso</p>
          <div className="grid grid-cols-3 gap-1.5">
            {angles.map((a) => (
              <div key={a} className="t-inner flex items-center justify-center py-6" style={{ borderStyle: "dashed" }}>
                <p className="c-muted text-[10px] text-center">📷<br />{a}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="font-data text-[11px] uppercase mb-2 text-center" style={{ color: "var(--ink)", fontWeight: 600 }}>Oggi</p>
          <div className="grid grid-cols-3 gap-1.5">
            {angles.map((a) => (
              <div key={a} className="t-inner flex items-center justify-center py-6" style={{ borderStyle: "dashed", borderColor: "#C5A059" }}>
                <p className="c-muted text-[10px] text-center">📷<br />{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="c-muted text-[10px] mt-3">Le foto reali arrivano da Supabase Storage — qui non esistono ancora upload, quindi mostro il posto dove compariranno invece di inventarle.</p>
    </div>
  );
}

/* Aggiornamento istantaneo di dieta ON/OFF direttamente da qui: regola le
   kcal della settimana CORRENTE (offset 0) a scatti di 150 (la stessa
   soglia del badge di stallo). Scrive nello stesso store condiviso
   `quickTargets` che legge/scrive anche la Timeline dell'atleta (vedi
   ClientTimeline) — è lo stesso identico numero in entrambe le viste,
   non due copie che possono disallinearsi. */
function QuickDietEditPanel({ client, quickTargets, setQuickTargets, onOpenTimeline }) {
  const stored = quickTargets?.[client.id];
  const onDefault = makeMacroProfile(client.calories, 0.28, 0.47, 0.25);
  const offDefault = makeMacroProfile(Math.round(client.calories * 0.9), 0.3, 0.35, 0.35);
  const current = { ON: stored?.ON || onDefault, OFF: stored?.OFF || offDefault };

  const adjustKcal = (profile, deltaKcal) => {
    const target = current[profile];
    const kcal = kcalFromMacros(target.p, target.c, target.f);
    const ratios = kcal > 0 ? { p: (target.p * 4) / kcal, c: (target.c * 4) / kcal, f: (target.f * 9) / kcal } : { p: 0.3, c: 0.45, f: 0.25 };
    const newKcal = Math.max(0, kcal + deltaKcal);
    const nextTarget = { p: Math.round((newKcal * ratios.p) / 4), c: Math.round((newKcal * ratios.c) / 4), f: Math.round((newKcal * ratios.f) / 9) };
    setQuickTargets((qt) => ({ ...qt, [client.id]: { ...current, [profile]: nextTarget } }));
  };

  return (
    <div className="c-card" style={{ border: "1.5px solid #C5A059" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="c-heading font-display font-bold">🔧 Aggiorna al volo — settimana corrente</p>
        <button onClick={onOpenTimeline} className="c-ghost px-3 py-1.5 rounded-lg text-xs font-medium">Apri Timeline completa</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {["ON", "OFF"].map((profile) => {
          const kcal = kcalFromMacros(current[profile].p, current[profile].c, current[profile].f);
          return (
            <div key={profile} className="t-inner px-3 py-3 text-center">
              <p className="c-label mb-1">{profile === "ON" ? "🏋️ Giorno ON" : "🧘 Giorno OFF"}</p>
              <p className="font-data text-lg font-bold mb-2" style={{ color: "var(--ink)" }}>{kcal} kcal</p>
              <div className="flex items-center justify-center gap-1.5">
                <button onClick={() => adjustKcal(profile, -150)} className="c-ghost w-8 h-8 rounded-full text-sm font-bold">−150</button>
                <button onClick={() => adjustKcal(profile, 150)} className="c-ghost w-8 h-8 rounded-full text-sm font-bold">+150</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="c-muted text-[10px] mt-3">Modifica qui o nella Timeline: è lo stesso target, si aggiorna in entrambi i posti.</p>
    </div>
  );
}

function CheckDetail({ client, quickTargets, setQuickTargets, onSwitchToEditor }) {
  const [history, setHistory] = useState(() => buildCheckHistory(client));
  const [form, setForm] = useState({
    weight: client.lastCheck.weight, waistCm: client.waistCm,
    dolori: 0, stress: client.lastCheck.stress, digestione: client.evening.digestione, sonno: client.evening.sonno,
    cyclePhase: client.gender === "F" ? CYCLE_PHASES[0] : null,
  });
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted[0], previous = sorted[1];
  const avg5 = average(history.slice(-5).map((h) => h.weight));
  const delta = previous ? latest.weight - previous.weight : 0;
  const badge = predictiveBadge(client, history);

  const registerCheck = () => {
    const w = Number(form.weight), waist = Number(form.waistCm);
    if (!w || w <= 0) return;
    const nextMonday = addWeeksToDate(mondayOf(new Date()), 1);
    setHistory((h) => [...h, {
      id: uid(), date: nextMonday.toISOString().slice(0, 10), weight: w, waistCm: waist || client.waistCm, hasPhotos: true,
      dolori: Number(form.dolori) || 0, stress: Number(form.stress) || 0, digestione: Number(form.digestione) || 0, sonno: Number(form.sonno) || 0,
      cyclePhase: client.gender === "F" ? form.cyclePhase : null,
    }]);
  };

  return (
    <div className="space-y-4">
      <div className="c-card">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="c-heading font-display font-bold">{client.name}</h3>
          {badge && (
            <span className="font-data text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ backgroundColor: badge.type === "recomp" ? "#ECFDF5" : "#FFF7ED", color: badge.type === "recomp" ? "#047857" : "#C2410C", border: `1px solid ${badge.type === "recomp" ? "#A7F3D0" : "#FED7AA"}` }}>
              {badge.label}
            </span>
          )}
        </div>
        {badge && <p className="c-muted text-xs mb-3">{badge.detail}</p>}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">Ultimo check</p>
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{latest.weight} kg</p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">vs prec.</p>
            <p className="font-data text-sm font-bold" style={{ color: delta <= 0 ? "#10B981" : "#F0A020" }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} kg</p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">Media 5w</p>
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{avg5.toFixed(1)} kg</p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">Vita</p>
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{latest.waistCm} cm</p>
          </div>
        </div>
        <LineChart points={history} xLabel={(p) => { const d = new Date(p.date); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; }}
          series={[{ key: "weight", label: "Peso (kg)", color: "#2563EB" }, { key: "waistCm", label: "Addome (cm)", color: client.gender === "F" ? "#E5C1CD" : "#C5A059" }]} />
      </div>

      <PhotoCompareBoard history={history} />

      <div className="c-card">
        <p className="c-heading font-display font-bold mb-1">Quello che i dati da soli non dicono</p>
        <p className="c-muted text-xs mb-4">
          Aderenza a macros e allenamento non si chiede più qui: è già deducibile dal diario alimentare e dagli allenamenti registrati durante la settimana. Questo è solo ciò che nessun log automatico può misurare.
        </p>
        <div className={`grid ${client.gender === "F" ? "grid-cols-5" : "grid-cols-4"} gap-2.5`}>
          {[["Dolori / fastidi", latest.dolori], ["Stress percepito", latest.stress], ["Digestione", latest.digestione], ["Qualità del sonno", latest.sonno]].map(([lab, v]) => (
            <div key={lab} className="t-inner px-2.5 py-2.5 text-center">
              <p className="c-label mb-1">{lab}</p>
              <p className="font-data text-lg font-bold" style={{ color: v >= 7 ? "#DC2626" : v >= 4 ? "#F0A020" : "#10B981" }}>{v}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>/10</span></p>
            </div>
          ))}
          {client.gender === "F" && (
            <div className="t-inner px-2.5 py-2.5 text-center">
              <p className="c-label mb-1">Fase del ciclo</p>
              <p className="font-data text-sm font-bold" style={{ color: "#E5C1CD" }}>{latest.cyclePhase}</p>
            </div>
          )}
        </div>
      </div>

      <QuickDietEditPanel client={client} quickTargets={quickTargets} setQuickTargets={setQuickTargets} onOpenTimeline={onSwitchToEditor} />

      <div className="c-card">
        <p className="c-label mb-3">Registra un nuovo check (per conto dell'atleta)</p>
        <div className="flex gap-2.5 flex-wrap mb-3">
          <label className="flex-1 min-w-[120px]">
            <span className="c-label block mb-1">Peso (kg)</span>
            <input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="t-input w-full text-sm rounded-md px-2 py-2 font-data text-center" />
          </label>
          <label className="flex-1 min-w-[120px]">
            <span className="c-label block mb-1">Vita (cm)</span>
            <input type="number" step="0.5" value={form.waistCm} onChange={(e) => setForm({ ...form, waistCm: e.target.value })} className="t-input w-full text-sm rounded-md px-2 py-2 font-data text-center" />
          </label>
        </div>
        <p className="c-label mb-2">Quello che i dati da soli non dicono</p>
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {[["dolori", "Dolori / fastidi (1-10)"], ["stress", "Stress percepito (1-10)"], ["digestione", "Digestione (1-10)"], ["sonno", "Qualità del sonno (1-10)"]].map(([k, lab]) => (
            <label key={k}>
              <span className="c-label block mb-1">{lab}</span>
              <input type="number" min={0} max={10} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} className="t-input w-full text-sm rounded-md px-2 py-2 font-data text-center" />
            </label>
          ))}
        </div>
        {client.gender === "F" && (
          <label className="block mb-3">
            <span className="c-label block mb-1">Fase del ciclo (facoltativo)</span>
            <select value={form.cyclePhase} onChange={(e) => setForm({ ...form, cyclePhase: e.target.value })} className="t-input w-full text-sm rounded-md px-3 py-2">
              {CYCLE_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <button onClick={registerCheck} className="c-btn w-full rounded-lg px-4 py-3 text-sm font-medium">Registra check di lunedì prossimo</button>
      </div>

      <div className="c-card">
        <p className="c-label mb-3">Storico completo ({history.length} check)</p>
        <div className="space-y-1.5">
          {sorted.map((h, i) => {
            const prev = sorted[i + 1];
            const d = prev ? h.weight - prev.weight : 0;
            return (
              <div key={h.id} className="t-inner px-3 py-2 flex items-center justify-between gap-2">
                <span className="font-data text-xs" style={{ color: "var(--ink-soft)" }}>{h.date}</span>
                <span className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{h.weight} kg</span>
                <span className="font-data text-xs" style={{ color: d <= 0 ? "#10B981" : "#F0A020" }}>{prev ? `${d > 0 ? "+" : ""}${d.toFixed(1)}` : "—"}</span>
                <span className="font-data text-xs" style={{ color: "var(--ink-tertiary)" }}>{h.waistCm} cm</span>
                <span className="text-xs" title="Foto disponibili">{h.hasPhotos ? "📷" : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- CATALOGO ---------------------------------- */
function RosterView({ onOpen }) {
  const { clients: CLIENTS } = useContext(CoachDataContext);
  const [dept, setDept] = useState("active");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = CLIENTS.filter((c) => deptOf(c) === dept && (q === "" || c.name.toLowerCase().includes(q))).sort((a, b) => b.evening.doloreGrado - a.evening.doloreGrado || a.name.localeCompare(b.name, "it"));

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {DEPTS.map((d) => {
          const n = CLIENTS.filter((c) => deptOf(c) === d.id).length;
          const on = dept === d.id;
          return (
            <button key={d.id} onClick={() => setDept(d.id)} className="rounded-lg px-3 py-3 text-center"
              style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
              <span className="block text-sm">{d.dot}</span>
              <span className="block font-data text-[11px] uppercase mt-1">{d.label}</span>
              <span className="block font-display text-lg font-bold mt-0.5" style={{ color: on ? "#C5A059" : "var(--ink)" }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-tertiary)" }} />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome…"
          className="w-full text-sm rounded-lg pl-10 pr-3.5 py-2.5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line-strong)", color: "var(--ink)" }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((c) => <ClientRow key={c.id} client={c} onOpen={() => onOpen(c.id)} />)}
        {list.length === 0 && <p className="c-muted text-sm py-8 md:col-span-2 text-center">Nessun cliente in questo reparto</p>}
      </div>
    </div>
  );
}

/* ==========================================================================
   💰 BLOCCO AMMINISTRATIVO E CONTABILE — MRR, proiezione annua, storico
   transazioni Stripe.
   Listino reale definitivo (da 07_ClientProfile.jsx, revisione 2, la più
   recente sul progetto): FREE €0, Performance Pack €5/mese, Scheda
   Personalizzata €40 una tantum, Solo Allenamento Coaching €50/mese, Full
   Coaching Supremo €60/mese. Non ho inventato questi prezzi: sono lo stesso
   listino a 5 piani già approvato in quella chat — coincide esattamente coi
   "5€, 50€, 60€" che hai citato tu.
   TRASPARENZA: nessun client Stripe è collegato a questo file isolato. Gli
   ID transazione (`ch_sim_...`, `in_sim_...`) sono simulati e marcati come
   tali — NON sono ID Stripe reali, non usarli con il tuo commercialista.
   In produzione questa tabella legge dalla tabella Supabase `subscriptions`
   (già nello schema SQL del progetto) via un webhook Stripe che scrive ogni
   evento payment_intent.succeeded / invoice.paid / charge.failed. */
const PLAN_PRICING = {
  free: { label: "FREE", price: 0, billing: "none" },
  performance: { label: "Performance Pack", price: 5, billing: "recurring" },
  scheda: { label: "Scheda Personalizzata", price: 40, billing: "one_time" },
  training: { label: "Solo Allenamento Coaching", price: 50, billing: "recurring" },
  full: { label: "Full Coaching Supremo", price: 60, billing: "recurring" },
};

/* MRR: somma dei piani ricorrenti (mai le Schede una tantum, per
   definizione di Monthly Recurring Revenue) dei clienti attivi con
   pagamento in regola — un pagamento fallito non genera MRR, coerente col
   Billing Shield che sposta l'account su Scaduti. */
function computeMRR(CLIENTS) {
  return CLIENTS.filter((c) => deptOf(c) === "active" && c.billingStatus === "active")
    .reduce((sum, c) => {
      const plan = PLAN_PRICING[c.plan];
      return plan && plan.billing === "recurring" ? sum + plan.price : sum;
    }, 0);
}

/* Storico transazioni simulato: una riga per cliente con un pagamento
   plausibile negli ultimi 30 giorni, coerente con lo stato reale del suo
   billingStatus/status già presente nei dati. Ordinato dal più recente. */
function buildTransactions(CLIENTS) {
  const now = new Date("2026-08-04T19:04:00");
  const txs = [];
  let dayOffset = 0;
  CLIENTS.forEach((c) => {
    const plan = PLAN_PRICING[c.plan];
    if (!plan || plan.price === 0) return; // FREE non genera transazioni
    const ts = new Date(now); ts.setDate(ts.getDate() - dayOffset); dayOffset += 2;
    let stripeStatus = "paid";
    if (c.billingStatus === "payment_failed") stripeStatus = "failed";
    else if (c.status === "pending_approval") stripeStatus = "processing";
    else if (c.status === "new") return; // non ha ancora completato un primo pagamento
    const prefix = plan.billing === "one_time" ? "ch_sim_" : "in_sim_";
    txs.push({
      id: uid(),
      clientId: c.id,
      clientName: c.name,
      email: c.email,
      planLabel: `${plan.label} €${plan.price}${plan.billing === "one_time" ? " una tantum" : "/mese"}`,
      amount: plan.price,
      stripeStatus,
      stripeId: prefix + Math.abs(c.id * 918273 + dayOffset).toString(16),
      timestamp: ts.toISOString(),
    });
  });
  return txs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

const STRIPE_STATUS_META = {
  paid: { label: "🟢 PAGATO", bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
  processing: { label: "🟡 IN ELABORAZIONE", bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" },
  failed: { label: "🔴 FALLITO", bg: "#FEF2F2", border: "#FECACA", color: "#B91C1C" },
};

function MonetaryWidgets({ mrr, transactions, isDark }) {
  const annual = mrr * 12;
  const txCount = transactions.length;
  const glass = { backdropFilter: "blur(14px)", backgroundColor: "var(--glass-bg)", border: "1px solid var(--glass-border)", boxShadow: "0 8px 30px rgba(0,0,0,0.04)" };
  const cards = [
    { icon: "💰", label: "MRR · Fatturato Ricorrente Mensile", value: `€ ${mrr.toLocaleString("it-IT")}`, sub: "/ mese" },
    { icon: "📈", label: "Fatturato Annuale Stimato", value: `€ ${annual.toLocaleString("it-IT")}`, sub: "proiezione × 12" },
    { icon: "🧾", label: "Transazioni Mese Corrente", value: txCount, sub: "ultimi 30 giorni" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl px-5 py-4" style={glass}>
          <p className="c-label mb-2">{c.icon} {c.label}</p>
          {/* In Onyx: bianco nitido + shimmer oro (dashboard del coach, profilo
              maschile) sui numeri. In Light: nero ossidiana alto contrasto. */}
          <p className={`font-display text-2xl font-bold ${isDark ? "gradient-title-m" : ""}`} style={isDark ? undefined : { color: "#18181B" }}>{c.value}</p>
          <p className="c-muted text-xs mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function TransactionLedger({ transactions }) {
  return (
    <div className="c-card">
      <h3 className="c-heading font-display font-bold mb-1">🧾 Storico Transazioni & Hub Fiscale</h3>
      <p className="c-muted text-xs mb-4">
        Ordine cronologico decrescente · gli ID transazione qui sono simulati (`ch_sim_…`/`in_sim_…`), non veri ID Stripe — in produzione arrivano dal webhook Stripe nella tabella <code>subscriptions</code>.
      </p>
      <div className="space-y-1.5">
        {transactions.map((t) => {
          const meta = STRIPE_STATUS_META[t.stripeStatus];
          const d = new Date(t.timestamp);
          const dateLabel = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} - ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          return (
            <div key={t.id} className="t-inner px-4 py-3 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <span className="font-data text-xs" style={{ color: "var(--ink-soft)" }}>{dateLabel}</span>
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 600 }}>{t.clientName}</p>
                <p className="font-data text-[11px] truncate" style={{ color: "var(--ink-soft)" }}>{t.email}</p>
              </div>
              <span className="text-xs" style={{ color: "var(--ink-tertiary)" }}>{t.planLabel}</span>
              <span className="font-data text-xs font-bold px-2.5 py-1 rounded-full text-center w-fit" style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>{meta.label}</span>
              <span className="font-data text-[11px] truncate" style={{ color: "var(--ink-soft)" }} title="ID transazione (simulato)">{t.stripeId}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Andamento fatturato negli ultimi mesi: qui NON ho uno storico reale (nessun
   webhook Stripe collegato a questo file isolato), quindi genero una curva
   di crescita plausibile che termina esattamente sull'MRR di oggi — utile
   per vedere la FORMA del grafico, non per leggere i valori passati come
   dato reale. In produzione questi punti arrivano da un aggregato mensile
   sulla tabella Supabase `subscriptions`/`payments`, non da questa funzione. */
function buildRevenueHistory(mrr) {
  const months = ["Mar", "Apr", "Mag", "Giu", "Lug", "Ago"];
  const growth = [0.62, 0.71, 0.78, 0.85, 0.93, 1];
  return months.map((m, i) => ({ month: m, revenue: Math.round(mrr * growth[i]) }));
}

function FinanceModule({ isDark }) {
  const { clients: CLIENTS } = useContext(CoachDataContext);
  const mrr = useMemo(() => computeMRR(CLIENTS), [CLIENTS]);
  const transactions = useMemo(() => buildTransactions(CLIENTS), [CLIENTS]);
  const revenueHistory = useMemo(() => buildRevenueHistory(mrr), [mrr]);
  return (
    <div>
      <MonetaryWidgets mrr={mrr} transactions={transactions} isDark={isDark} />
      <div className="c-card mb-5">
        <p className="c-label mb-1">Andamento fatturato mensile</p>
        <p className="c-muted text-xs mb-3">Curva illustrativa fino all'MRR di oggi — lo storico reale arriva dal webhook Stripe, non ancora collegato in questa anteprima.</p>
        <LineChart points={revenueHistory} xLabel={(p) => p.month} series={[{ key: "revenue", label: "Fatturato (€)", color: "#C5A059" }]} />
      </div>
      <TransactionLedger transactions={transactions} />
    </div>
  );
}

/* ----------------------------------- ROOT ------------------------------------
   Ristrutturazione radicale in 3 Macro-Aree, come richiesto: Hub Atleti
   (catalogo + allarmi in cima + profilo a 4 sotto-tab), Hub Finanziario
   (widget + grafico fatturato + transazioni), Hub Rete (whitelist +
   controllo accessi globale). Nessun doppio banner: un solo CoachContextBar
   in cima, condiviso da tutti e tre gli hub. */
const TABS = [
  { id: "atleti", label: "Hub Atleti", icon: Users },
  { id: "finanziario", label: "Hub Finanziario", icon: Wallet },
  { id: "rete", label: "Hub Rete & Accessi", icon: Server },
];

export default function CoachDashboard({ supabase, coachId } = {}) {
  const isRealMode = Boolean(supabase && coachId);
  const [realClients, setRealClients] = useState(null); // null = non ancora caricato

  // Estratta come funzione richiamabile (non solo effetto al mount): serve ad
  // AccessControlTable per ricaricare il roster subito dopo aver attivato un
  // cliente da "registered" ad "active", senza aspettare un refresh manuale
  // della pagina. Esposta ai pannelli innestati via CoachDataContext.
  const reloadRoster = useCallback(() => {
    if (!isRealMode) return;
    fetchClientRoster(supabase)
      .then(setRealClients)
      .catch((err) => { console.error("PERFORM: errore caricamento roster clienti", err); setRealClients([]); });
  }, [isRealMode, supabase]);

  useEffect(() => {
    reloadRoster();
  }, [reloadRoster]);

  const clients = isRealMode ? (realClients ?? []) : DEMO_CLIENTS;

  const [tab, setTab] = useState("atleti");
  const [selectedId, setSelectedId] = useState(null);
  const [clientInitialTab, setClientInitialTab] = useState("anamnesi");
  const client = clients.find((c) => c.id === selectedId);
  // Store condiviso tra Registro Check, Co-Pilota AI e Timeline dell'atleta
  // per il target ON/OFF della settimana corrente — vedi nota in ClientTimeline.
  const [quickTargets, setQuickTargets] = useState({});
  // Cliccare un atleta segnalato nel Cruscotto Allarmi apre il suo profilo
  // direttamente sulla tab Bioritmi & Grafici, dove il dolore è documentato.
  const openClientAlert = (id) => { setClientInitialTab("bioritmi"); setSelectedId(id); };
  // Gamification lato coach: bonus XP e post Avvisi Team di questa sessione
  // (vedi nota completa in GoalAchievedPanel sul collegamento Supabase reale).
  const [xpBonuses, setXpBonuses] = useState({});
  const [teamPosts, setTeamPosts] = useState([]);
  // Hub Rete → Controllo Accessi: password rigenerate in questa sessione
  // (vedi nota in PasswordViewer: in produzione è sempre una rigenerazione
  // via supabase.auth.admin, mai una password libera scritta a mano).
  const [passwordOverrides, setPasswordOverrides] = useState({});
  const regeneratePassword = (clientId, name) => {
    const newPass = `${name.split(" ")[0]}-${Math.floor(1000 + Math.random() * 9000)}`;
    setPasswordOverrides((prev) => ({ ...prev, [clientId]: newPass }));
  };
  // Modalità Onyx: tema scuro reale e attivabile, non solo decorativo — vedi
  // le variabili CSS in GlobalStyle (.coach-root.dark) per cosa cambia.
  const [isDark, setIsDark] = useState(false);

  return (
    <CoachDataContext.Provider value={{ clients, supabase, coachId, isRealMode, reloadRoster }}>
      <div className={`coach-root${isDark ? " dark" : ""}`}>
        <GlobalStyle />
        <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <CoachContextBar isDark={isDark} onToggleDark={() => setIsDark((v) => !v)} />
          {selectedId != null ? (
            <ClientDetail client={client} onBack={() => { setSelectedId(null); setClientInitialTab("anamnesi"); }} quickTargets={quickTargets} setQuickTargets={setQuickTargets} xpBonuses={xpBonuses} setXpBonuses={setXpBonuses} teamPosts={teamPosts} setTeamPosts={setTeamPosts} initialTab={clientInitialTab} />
          ) : (
            <>
              <div className="flex gap-1.5 mb-6">
                {TABS.map((t) => {
                  const on = tab === t.id;
                  const Ico = t.icon;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 rounded-xl px-3 py-3 flex items-center justify-center gap-2"
                      style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                      <Ico size={16} style={{ color: on ? "#C5A059" : "var(--ink-soft)" }} />
                      <span className="font-data text-xs uppercase" style={{ letterSpacing: "0.06em", fontWeight: on ? 600 : 400 }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {tab === "atleti" && (
                <div>
                  <AlarmsDashboard onOpen={openClientAlert} />
                  <RosterView onOpen={setSelectedId} />
                </div>
              )}

              {tab === "finanziario" && <FinanceModule isDark={isDark} />}

              {tab === "rete" && (
                <div className="space-y-5">
                  <WhitelistPanel />
                  <AccessControlTable passwordOverrides={passwordOverrides} onRegenerate={regeneratePassword} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </CoachDataContext.Provider>
  );
}
