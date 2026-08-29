import React, { useState, useMemo, useEffect, useCallback, useRef, createContext, useContext } from "react";
import {
  Users, Search, ChevronRight, ChevronDown, ChevronUp,
  Dumbbell, Salad, BedDouble, Pill, Copy, MessageCircle, Plus,
  Trash2, ArrowLeft, Wallet, Server, X, ShieldCheck, Check,
  BarChart3, FileText, AlertTriangle, GripVertical, Sparkles,
} from "lucide-react";
import Portal from "./Portal.jsx";
import SwipeHandle from "./SwipeHandle.jsx";
import { useSwipeDownClose } from "../lib/useSwipeGesture.js";
import { useDragReorder, moveItem } from "../lib/useDragReorder.js";
import { VolumeBar, SUPP_WIKI, SUPP_MOMENTS, matchSuppMoment } from "./05_HomeDashboard.jsx";
// Spostati in un file a sé (AnamnesisShared.jsx) insieme ad AnamAreaSection/
// ANAM_AREAS/ANAM_QUESTIONS: 11_OnboardingFlow.jsx li importava PRIMA
// direttamente da qui, un import statico che costringeva Vite a includere
// tutto questo file (5000+ righe, lazy-caricato apposta solo per il coach)
// nel bundle iniziale di ogni utente, coach o meno — vedi commento in testa
// ad AnamnesisShared.jsx per il dettaglio.
import { GlobalStyle, ANAM_AREAS, ANAM_QUESTIONS, AnamAreaSection } from "./AnamnesisShared.jsx";

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


/* ------------------------------ WHATSAPP GATEWAY --------------------------- */
/* Numero reale del coach, estratto dal monolite: COACH_WHATSAPP (riga 673). */
const COACH_WHATSAPP = "393792089279";
function waLink(client, text) {
  return `https://wa.me/${COACH_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/* Libreria esercizi: MUSCLES/EXERCISE_LIB_MUSCLE_TO_DB/DB_MUSCLE_TO_CHART/
   resolveMuscleTarget/computeVolume spostati in coachingData.js (SCHEMA_v39)
   così la Home del cliente calcola il volume con la STESSA identica logica
   — prima erano due sistemi scollegati, un cliente vedeva un volume diverso
   da quello che il coach aveva davvero impostato. La libreria esercizi ora è
   collettiva e reale (tabella exercise_library), non più solo questi ~19
   di default: EX_NAMES viene dallo state exerciseLib sotto, caricato al
   mount del pannello coach e aggiornato ad ogni nuovo esercizio custom
   salvato con i suoi muscoli target — mai più ridigitarli per un altro
   cliente con lo stesso esercizio. */

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
  assignNutritionTarget, fetchBothNutritionTargets, applyNutritionProgramToDateRange, fetchNutritionProgramsRange,
  saveWeekDiet, saveWeekSupplements, computeTrainingCompliance,
  computeRecoveryCompliance, computeNutritionCompliance,
  computeBatchTrainingCompliance, computeBatchRecoveryCompliance, computeBatchNutritionCompliance,
  notifyClientPlanChange, fetchClientPauses,
  renameClient, adminResetPassword, adminDeleteAccount,
  fetchCheckins, getCheckinPhotoUrl, fetchPrescribedSupplements, fetchDailyMetricsRange,
  fetchWorkoutTemplates, saveWorkoutTemplate, deleteWorkoutTemplate, applyWorkoutSplitToDateRange, fetchWorkoutProgrammedDates,
  xpToLevelInfo, whitelistClient, clearWhitelist, unmanageClient,
  MUSCLES, DEFAULT_EXERCISE_LIB, DB_MUSCLE_TO_CHART, EXERCISE_LIB_MUSCLE_TO_DB, resolveMuscleTarget,
  fetchExerciseLibrary, saveExerciseGuide, computeVolume,
  updateExerciseLibraryEntry, deleteExerciseFromLibrary,
  fetchAssignedWorkouts, fetchExerciseRecords, dayNutritionScore,
  detectPersistentPain, sendChatMessage,
  fetchReferrals, REAL_COACHING_PLANS_DB, awardXpBonus, askCoachAssistant, generateWorkoutWeekDraft,
  generateNutritionWeekDraft, generateSupplementsPlanDraft,
} from "../lib/coachingData.js";

// Contesto condiviso: elenco clienti (reale o demo) + accesso a Supabase per
// i pannelli innestati (Anamnesi, Editor) senza dover passare supabase/coachId
// come prop attraverso ogni livello di componenti.
const CoachDataContext = createContext({ clients: [], supabase: null, coachId: null, isRealMode: false, reloadRoster: () => {}, exerciseLib: DEFAULT_EXERCISE_LIB, reloadExerciseLib: () => {} });

const DEMO_CLIENTS = [
  { id: 1, demoId: "marco", name: "Marco Bianchi", gender: "M", goal: "ipertrofia", calories: 2900, adherence: 94, streak: 17, xp: 3450, plan: "full", status: "active",
    age: 29, birthDate: "1997-04-12", heightCm: 180, bodyFatPct: 14, activity: "attivo", foodLikes: ["Petto di pollo", "Riso Basmati", "Mandorle"], foodDislikes: [],
    email: "marco.bianchi@icloud.com", lastCheck: { weight: 80.7, sleep: 7, stress: 4, energy: 8, hunger: 5 },
    weightHistory: [79.7, 80.0, 80.2, 80.5], waistCm: 82, billingStatus: "active", prs: { squat: 110, panca: 90, stacco: 140 },
    evening: { energia: 8, digestione: 9, sonno: 8, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.95, alimentazione: 0.88, recupero: 0.9 } },
  { id: 2, name: "Giulia Ferraro", gender: "F", goal: "ricomposizione", calories: 1850, adherence: 88, streak: 23, xp: 4820, plan: "full", status: "active",
    age: 26, birthDate: "2000-04-12", heightCm: 165, bodyFatPct: 24, activity: "moderato", foodLikes: ["Fesa di tacchino", "Avena in fiocchi", "Salmone fresco"], foodDislikes: ["Fiocchi di latte light"],
    email: "giulia.ferraro@icloud.com", lastCheck: { weight: 61.2, sleep: 8, stress: 3, energy: 8, hunger: 6 },
    weightHistory: [62.2, 62.0, 61.7, 61.5], waistCm: 70, billingStatus: "active", prs: { squat: 65, panca: 40, stacco: 85 },
    evening: { energia: 7, digestione: 8, sonno: 8, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.9, alimentazione: 0.93, recupero: 0.85 } },
  { id: 3, name: "Luca Esposito", gender: "M", goal: "ipertrofia", calories: 3100, adherence: 76, streak: 4, xp: 1290, plan: "training", status: "active",
    age: 34, birthDate: "1992-04-12", heightCm: 176, bodyFatPct: 19, activity: "leggero", foodLikes: ["Riso Basmati", "Petto di pollo", "Olio EVO"], foodDislikes: ["Salmone fresco"],
    email: "luca.esposito@icloud.com", lastCheck: { weight: 84.3, sleep: 5, stress: 6, energy: 5, hunger: 4 },
    weightHistory: [83.3, 83.5, 83.8, 84.0], waistCm: 88, billingStatus: "active", prs: { squat: 120, panca: 85, stacco: 150 },
    evening: { energia: 4, digestione: 5, sonno: 4, doloreGrado: 3, doloreNota: "Fastidio alla spalla destra nel lento avanti" },
    rings: { allenamento: 0.6, alimentazione: 0.55, recupero: 0.4 } },
  { id: 4, demoId: "sara", name: "Sara Conti", gender: "F", goal: "ricomposizione", calories: 1700, adherence: 96, streak: 31, xp: 6100, plan: "full", status: "active",
    age: 27, birthDate: "1999-04-12", heightCm: 162, bodyFatPct: 20, activity: "attivo", foodLikes: ["Albume d'uovo", "Gallette di riso", "Fiocchi di latte light"], foodDislikes: ["Mandorle"],
    email: "sara.conti@icloud.com", lastCheck: { weight: 58.9, sleep: 8, stress: 2, energy: 9, hunger: 5 },
    weightHistory: [59.9, 59.6, 59.4, 59.1], waistCm: 66, billingStatus: "active", prs: { squat: 60, panca: 35, stacco: 80 },
    evening: { energia: 9, digestione: 9, sonno: 9, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0.97, alimentazione: 0.95, recupero: 0.93 } },
  { id: 5, name: "Andrea Ricci", gender: "M", goal: "ipertrofia", calories: 3300, adherence: 62, streak: 0, xp: 210, plan: "scheda", status: "active",
    age: 38, birthDate: "1988-04-12", heightCm: 183, bodyFatPct: 23, activity: "sedentario", foodLikes: ["Riso Basmati", "Salmone fresco", "Mandorle"], foodDislikes: [],
    email: "andrea.ricci@icloud.com", lastCheck: { weight: 91.5, sleep: 5, stress: 8, energy: 4, hunger: 3 },
    weightHistory: [90.5, 90.8, 91.0, 91.2], waistCm: 96, billingStatus: "active", prs: { squat: 130, panca: 100, stacco: 160 },
    evening: { energia: 3, digestione: 4, sonno: 3, doloreGrado: 4, doloreNota: "Fitta lombare durante lo stacco, ridotto carico" },
    rings: { allenamento: 0.35, alimentazione: 0.4, recupero: 0.3 } },
  { id: 6, name: "Elena Moretti", gender: "F", goal: "ricomposizione", calories: 1900, adherence: 91, streak: 12, xp: 2680, plan: "full", status: "active",
    age: 31, birthDate: "1995-04-12", heightCm: 168, bodyFatPct: 22, activity: "moderato", foodLikes: ["Petto di pollo", "Avena in fiocchi", "Olio EVO"], foodDislikes: ["Albume d'uovo"],
    email: "elena.moretti@icloud.com", lastCheck: { weight: 63.4, sleep: 7, stress: 4, energy: 7, hunger: 7 },
    weightHistory: [64.4, 64.2, 63.9, 63.6], waistCm: 74, billingStatus: "active", prs: { squat: 70, panca: 42, stacco: 90 },
    evening: { energia: 7, digestione: 6, sonno: 7, doloreGrado: 1, doloreNota: "" },
    rings: { allenamento: 0.88, alimentazione: 0.8, recupero: 0.82 } },
  { id: 16, demoId: "giulia2", name: "Giulia Ferrari", gender: "F", goal: "ricomposizione", calories: 1700, adherence: 0, streak: 0, xp: 0, plan: "full", status: "pending_approval",
    age: 24, birthDate: "2002-04-12", heightCm: 170, bodyFatPct: 26, activity: "leggero", foodLikes: ["Fesa di tacchino", "Riso Basmati"], foodDislikes: [],
    email: "giulia.ferrari@icloud.com", lastCheck: { weight: 64.0, sleep: 7, stress: 5, energy: 6, hunger: 5 },
    weightHistory: [65.0, 64.8, 64.5, 64.2], waistCm: 76, billingStatus: "pending", prs: { squat: 40, panca: 25, stacco: 55 },
    evening: { energia: 6, digestione: 6, sonno: 7, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0, alimentazione: 0, recupero: 0 } },
  { id: 17, name: "Paolo Serra", gender: "M", goal: "ipertrofia", calories: 2600, adherence: 0, streak: 0, xp: 0, plan: "full", status: "new",
    age: 22, birthDate: "2004-04-12", heightCm: 175, bodyFatPct: 17, activity: "moderato", foodLikes: ["Petto di pollo", "Riso Basmati"], foodDislikes: [],
    email: "paolo.serra@icloud.com", lastCheck: { weight: 79.0, sleep: 6, stress: 5, energy: 6, hunger: 6 },
    weightHistory: [78.0, 78.2, 78.5, 78.8], waistCm: 84, billingStatus: "pending", prs: { squat: 80, panca: 60, stacco: 100 },
    evening: { energia: 6, digestione: 6, sonno: 6, doloreGrado: 0, doloreNota: "" },
    rings: { allenamento: 0, alimentazione: 0, recupero: 0 } },
  { id: 18, name: "Alessio Fontana", gender: "M", goal: "ipertrofia", calories: 3200, adherence: 58, streak: 0, xp: 640, plan: "full", status: "requires_renewal",
    age: 41, birthDate: "1985-04-12", heightCm: 179, bodyFatPct: 25, activity: "sedentario", foodLikes: ["Riso Basmati", "Petto di pollo"], foodDislikes: ["Fiocchi di latte light"],
    email: "alessio.fontana@icloud.com", lastCheck: { weight: 88.7, sleep: 4, stress: 9, energy: 3, hunger: 4 },
    weightHistory: [87.7, 88.0, 88.2, 88.5], waistCm: 98, billingStatus: "payment_failed", prs: { squat: 100, panca: 80, stacco: 130 },
    evening: { energia: 3, digestione: 4, sonno: 3, doloreGrado: 5, doloreNota: "Dolore acuto ginocchio destro durante lo squat, ha interrotto la seduta" },
    rings: { allenamento: 0.2, alimentazione: 0.3, recupero: 0.25 } },
];

const DEPTS = [
  { id: "active", label: "Attivi", dot: "🟢" },
  { id: "pending", label: "In attesa", dot: "🟡" },
  { id: "expired", label: "Scaduti", dot: "🔴" },
];
// I 3 reparti sono SOLO per rapporti di coaching reale (chi ha pagato
// scheda/training/full) — non per chiunque sia semplicemente registrato con
// piano Free o Premium: quelli vivono solo in Hub Utenti,
// mai qui. BUG PRESO: prima ogni riga con un profiles.role reale (cioè
// SEMPRE, per qualunque account vero) finiva in "In attesa" perché
// clientStatus non era mai null grazie al fallback "registered" di
// fetchClientRoster — anche i semplici iscritti Free affollavano la coda
// che dovrebbe contenere solo chi aspetta la presa in gestione dopo un
// pagamento vero. Il webhook Stripe (customer.subscription.deleted) scrive
// ora client_status='expired' quando un abbonamento coaching non si
// rinnova, invece di tornare silenziosamente 'registered' — è quello il
// segnale per "Scaduti", non billingStatus (mai popolato per i dati reali).
// "scheda" = id demo, aggiunto solo qui sopra al dominio reale condiviso
// (REAL_COACHING_PLANS_DB in coachingData.js) — usato SOLO quando isRealMode
// è false, mai un valore reale di profiles.plan.
const REAL_COACHING_PLANS = new Set([...REAL_COACHING_PLANS_DB, "scheda"]);
// BUG PRESO: "Attivi" si basava solo su client_status === "active", ma lo
// stripe-webhook scrive quel valore nell'ISTANTE in cui il pagamento arriva
// (vedi supabase/functions/stripe-webhook/index.ts) — molto prima che il
// coach abbia costruito qualunque cosa. Un cliente appena pagante finiva
// subito tra gli "Attivi" (nessuna modifica da fare) invece che tra "In
// attesa" (aspetta la scheda). "Attivi" ora richiede davvero che non manchi
// nulla da assegnare: la scheda per tutti i piani coaching, più
// alimentazione e integrazione per Full Coaching specificamente.
function deptOf(c) {
  if (c.clientStatus === "expired" || c.clientStatus === "paused") return "expired";
  if (c.billingStatus === "payment_failed") return "expired"; // solo dati demo, mai popolato dal roster reale
  if (c.status === "pending_approval" || c.status === "new" || c.status === "requires_renewal") return "pending"; // solo dati demo
  if (!REAL_COACHING_PLANS.has(c.plan)) return null; // Free/Premium: non fa parte di questo roster

  const missingWorkout = !c.hasWorkoutAssigned;
  const missingFullCoachingSetup = c.plan === "full" && (!c.hasNutritionAssigned || !c.hasSupplementsAssigned);
  if (missingWorkout || missingFullCoachingSetup) return "pending"; // ha pagato, aspetta ancora che il coach gli costruisca qualcosa
  return "active"; // tutto assegnato, in regola
}


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
   computeVolume ora vive in coachingData.js (SCHEMA_v39) — stessa identica
   funzione usata anche dalla Home del cliente, mai due calcoli diversi.
   Riusa lo stesso identico componente VolumeBar del lato cliente
   (05_HomeDashboard.jsx) — richiesta esplicita: "voglio identico a lato
   cliente visivamente colori scritte e graficamente". Prima questo file
   disegnava un istogramma SVG bianco/liste a parte, visivamente scollegato
   dalla pillola oro/rosa che il cliente vede davvero. */
function VolumeBarChart({ volume, gender }) {
  const accent = gender === "F" ? "#E5C1CD" : "#C5A059";
  const involved = MUSCLES.filter((m) => volume[m].direct + volume[m].indirect > 0);
  if (involved.length === 0) return <p className="c-muted text-sm">Nessun esercizio ancora inserito questa settimana.</p>;
  return (
    <div className="space-y-2.5">
      {involved.map((m) => <VolumeBar key={m} muscle={m} direct={volume[m].direct} indirect={volume[m].indirect} accent={accent} />)}
    </div>
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

// RIR target prescritto dal coach per un esercizio (workout_logs.rir_target,
// SCHEMA_v21): testo libero, non un enum reale — "0" sostituisce la vecchia
// voce "A cedimento" (RIR 0 = a cedimento, terminologia standard invece di un
// testo libero a sé). Distinto dall'RIR realmente svolto dal cliente.
const RIR_TARGET_OPTIONS = ["0", "1", "2", "3", "4"];

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

// Converte i pasti dell'editor (foodKey/customName + grams, vivi contro
// FOOD_DB) in una SNAPSHOT già calcolata da salvare su diet_plans — il
// cliente legge kcal/macro già pronti dal server, che non ha FOOD_DB: senza
// questa conversione "Salva modifiche" scriverebbe un riferimento che
// lato cliente non si potrebbe più risolvere.
function snapshotMeals(meals) {
  return (meals || []).map((m) => {
    const tot = mealMacros(m);
    return {
      name: m.name,
      time: m.time,
      items: (m.items || []).map((it) => ({
        name: it.foodKey || it.customName || "Alimento",
        grams: Math.round(Number(it.grams) || 0),
        kcal: Math.round(itemMacros(it).kcal),
      })),
      tot: { kcal: Math.round(tot.kcal), p: Math.round(tot.p), c: Math.round(tot.c), f: Math.round(tot.f) },
    };
  });
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

/* ---------------------------------------------------------------------------
   GENERAZIONE AUTOMATICA PRIMO PIANO — da 3 risposte anamnesi (sessioni
   settimanali, livello, obiettivo principale) a una prima scheda allenamento
   completa, usando SOLO esercizi già presenti in DEFAULT_EXERCISE_LIB (così
   il gruppo muscolare si risolve sempre, nessun esercizio "libero" da
   configurare a mano). È un PUNTO DI PARTENZA da rifinire, mai salvato da
   solo: carica la settimana nell'editor (setRealWorkout), il coach la
   rivede/modifica e la salva lui con il pulsante "Salva" già esistente —
   mai un dato scritto su Supabase senza un'azione esplicita del coach.
   ------------------------------------------------------------------------- */
const STARTER_EXERCISE_POOLS = {
  "Full Body": ["Squat bilanciere", "Panca piana bilanciere", "Rematore bilanciere", "Hip thrust bilanciere", "Alzate laterali", "Plank"],
  "Upper": ["Panca piana bilanciere", "Rematore bilanciere", "Lento avanti manubri", "Lat machine", "Curl bilanciere", "French press EZ"],
  "Lower": ["Squat bilanciere", "Stacco rumeno bilanciere", "Leg extension", "Leg curl sdraiato", "Calf in piedi"],
  "Push": ["Panca piana bilanciere", "Lento avanti manubri", "Croci ai cavi", "Alzate laterali", "French press EZ"],
  "Pull": ["Lat machine", "Rematore bilanciere", "Face pull ai cavi", "Scrollate con bilanciere", "Curl bilanciere"],
  "Legs": ["Squat bilanciere", "Stacco rumeno bilanciere", "Leg extension", "Leg curl sdraiato", "Hip thrust bilanciere", "Calf in piedi"],
};
// Etichette dei giorni di allenamento per frequenza settimanale (1-6 sessioni;
// oltre 6 resta comunque un massimo pratico di 6, la 7ª giornata è sempre
// riposo — un atleta neo-arrivato non ha bisogno di zero giorni di recupero).
const STARTER_SPLIT_BY_FREQUENCY = {
  1: ["Full Body"],
  2: ["Full Body", "Full Body"],
  3: ["Full Body", "Full Body", "Full Body"],
  4: ["Upper", "Lower", "Upper", "Lower"],
  5: ["Push", "Pull", "Legs", "Upper", "Lower"],
  6: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
};
// Indici Lun(0)→Dom(6) in cui piazzare le sessioni, distanziate per lasciare
// recupero tra una e l'altra invece di ammassarle a inizio settimana.
const STARTER_WEEKDAY_SLOTS = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
};
function starterSetsRepsFor(level, goal) {
  if (goal === "forza") return { sets: 5, reps: "4-6", rir: "2", rest: 180 };
  if (level === "principiante") return { sets: 3, reps: "10-12", rir: "3", rest: 90 };
  if (level === "avanzato" || level === "expert") return { sets: 4, reps: "6-10", rir: "1", rest: 150 };
  return { sets: 4, reps: "8-12", rir: "2", rest: 120 }; // intermedio, o livello non specificato
}
function generateStarterWeek({ sessions, level, goal, exerciseLib }) {
  const freq = Math.min(6, Math.max(1, Number(sessions) || 3));
  const labels = STARTER_SPLIT_BY_FREQUENCY[freq] || STARTER_SPLIT_BY_FREQUENCY[3];
  const slots = STARTER_WEEKDAY_SLOTS[freq] || STARTER_WEEKDAY_SLOTS[3];
  const { sets, reps, rir, rest } = starterSetsRepsFor(level, goal);
  const week = Array(7).fill(null);
  const labelCounts = {};
  labels.forEach((label, i) => {
    const totalOfLabel = labels.filter((l) => l === label).length;
    labelCounts[label] = (labelCounts[label] || 0) + 1;
    const dayLabel = totalOfLabel > 1 ? `${label} ${String.fromCharCode(64 + labelCounts[label])}` : label;
    const pool = STARTER_EXERCISE_POOLS[label] || STARTER_EXERCISE_POOLS["Full Body"];
    week[slots[i]] = {
      label: dayLabel,
      exercises: pool.map((name) => ({
        name, muscleTarget: resolveMuscleTarget(name, exerciseLib), synergists: [],
        sets, reps, rest, rirTarget: rir, technique: "Nessuna",
      })),
    };
  });
  return week;
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
function toLocalISODate(date = new Date()) {
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
// Data reale (GG/MM) del lunedì di una settimana, per i pallini del
// calendario coach — sostituisce l'etichetta astratta "S+1/S-2" con una
// data vera, così il calendario mostra sempre giorni/mesi reali invece di
// un offset da contare a mente.
function pillDateLabel(offset) {
  const monday = addWeeksToDate(mondayOf(new Date()), offset);
  return `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;
}
// Da una data scelta con un vero calendario (input date) all'offset
// settimana che il resto del componente già usa — per "vai a una data"
// senza dover ricostruire tutta la navigazione a offset esistente.
function offsetForDateISO(dateISO) {
  const target = mondayOf(new Date(`${dateISO}T00:00:00`));
  const todayMonday = mondayOf(new Date());
  return Math.round((target - todayMonday) / (7 * 86400000));
}
function weekRangeLabel(offset) {
  const start = addWeeksToDate(mondayOf(new Date()), offset);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)}`;
}
const MAX_FORWARD_WEEKS = 12;

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
3. Applica la mappa dei volumi settimanali sui 15 distretti separati (Petto, Trapezio, Dorsali, Lombari, Deltoide Anteriore, Deltoide Laterale, Deltoide Posteriore, Bicipiti, Tricipiti, Quadricipiti, Femorali, Adduttori, Glutei, Polpacci, Addominali), calcolando Serie Dirette (100%) e Serie Sinergiche/Indirette (50%) per ogni gruppo muscolare coinvolto, con l'obiettivo dichiarato di massimizzare l'estetica evitando infortuni — non solo la forza grezza.
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

/* ------------------------------- PASSWORD VIEWER ---------------------------- */
/* ------------------------------- CATALOGO CLIENTI --------------------------- */
// I 3 cerchi di compliance (STESSA formula di Home cliente/Bioritmi — mai
// calcolata due volte) accanto al nome: scorrendo l'elenco il coach vede
// subito chi sta andando bene/male senza aprire ogni scheda una per una.
// BUG PRESO (perf): prima ogni card cliente in Hub Atleti calcolava questi 3
// pallini per conto proprio (3 query Supabase indipendenti per riga) —
// con 20-30 clienti a coaching reale, 60-90+ query solo per disegnare dei
// pallini. RosterView ora calcola l'aderenza di TUTTO il roster in un colpo
// solo (computeBatch*Compliance, poche query totali) e passa qui il
// risultato già pronto per quel cliente: questo componente non fa più
// nessuna chiamata a Supabase.
function ClientComplianceBadges({ pcts }) {
  if (!pcts) return null;

  const badge = (Icon, pct, label) => {
    const color = pct == null ? "var(--ink-tertiary)" : pct >= 80 ? "#047857" : pct >= 60 ? "#92400E" : "#B91C1C";
    const bg = pct == null ? "var(--surface-2)" : pct >= 80 ? "#D1FAE5" : pct >= 60 ? "#FEF3C7" : "#FEE2E2";
    return (
      <span key={label} title={label} className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5" style={{ backgroundColor: bg, color }}>
        <Icon size={9} />
        <span className="font-data" style={{ fontSize: "0.58rem", fontWeight: 700 }}>{pct != null ? `${pct}%` : "—"}</span>
      </span>
    );
  };

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {badge(Dumbbell, pcts.train, "Allenamento")}
      {badge(Salad, pcts.nutri, "Alimentazione")}
      {badge(BedDouble, pcts.recovery, "Recupero")}
    </div>
  );
}

function ClientRow({ client, onOpen, compliance }) {
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
            {/* BUG PRESO: il "resto" cadeva su "Scheda Personalizzata" per
                QUALUNQUE piano diverso da full/training — Free e Premium
                inclusi, se mai finivano qui per un client_status scritto
                male altrove (vedi whitelistClient in coachingData.js). Le
                3 etichette sono ora esplicite una per una: qualunque altro
                valore di client.plan (non dovrebbe più capitare, questa
                card è solo per i 3 piani di coaching reale) mostra il nome
                del piano invece di indovinare "Scheda Personalizzata". */}
            {client.plan === "full" ? "Full Coaching"
              : client.plan === "training" ? "Solo Allenamento"
              : client.plan === "scheda_personalizzata" ? "Scheda Personalizzata"
              : WHITELIST_PLAN_LABELS[client.plan] || client.plan}
          </p>
          <ClientComplianceBadges pcts={compliance} />
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
function ComplianceRing({ label, value, onClick, active }) {
  // value === null → niente da misurare (es. nessun esercizio assegnato
  // questa settimana): stato neutro esplicito, non uno 0% rosso allarmante.
  const isNeutral = value == null;
  const pct = isNeutral ? null : Math.round(value * 100);
  const color = isNeutral ? "#ADB5BD" : value >= 0.75 ? "#10B981" : value >= 0.5 ? "#F0A020" : "#DC2626";
  const R = 22, C = 2 * Math.PI * R;
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper type={onClick ? "button" : undefined} onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl py-1"
      style={onClick ? { backgroundColor: active ? "var(--surface-2)" : "transparent", cursor: "pointer" } : undefined}>
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={R} fill="none" stroke="#E9ECEF" strokeWidth="5" />
        {isNeutral
          ? <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeDasharray="4 5" strokeOpacity="0.6" />
          : <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeDasharray={C} strokeDashoffset={C * (1 - value)} strokeLinecap="round" />}
      </svg>
      <span className="font-data text-xs font-bold" style={{ color, marginTop: -40 }}>{isNeutral ? "n/d" : `${pct}%`}</span>
      <span className="c-label mt-6">{label}</span>
    </Wrapper>
  );
}
/* --------------------------------- WHITELIST -------------------------------- */
/* BUG PRESO: questo pannello era completamente finto — "Genera accesso
   diretto" scriveva solo in stato locale React (setCreated), mai su
   Supabase; nessun account veniva davvero creato, nessun bypass davvero
   applicato, nonostante il testo dicesse esplicitamente "restano
   tracciati". Sostituito dal flusso reale: la whitelist (bypass Stripe +
   bypass anamnesi, scadenza a mesi esatti, SCHEMA_v37) si attiva da
   Controllo Accessi cliccando sul cliente già registrato — vedi
   ClientWhitelistPanel/whitelistClient (coachingData.js). Questo pannello
   ora è solo un rimando, non serve più duplicare la UI. */
/* Interruttore "sezione confermata per l'atleta": guida il colore del
   pallino S1/S2/... nella timeline (verde solo se tutto il richiesto dal
   piano è confermato). */
/* ---------------------------- HUB UTENTI ------------------------------------
   L'ultimo accesso è un dato reale (profiles.last_activity, SCHEMA_v51),
   non più una euristica simulata — vedi AccessControlTable più sotto e
   touchLastActivity in App.jsx. */
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

// Azioni admin reali (Edge Function, service role): rinomina, reset
// password, elimina account. Sostituisce il vecchio "Rigenera" finto — quel
// pulsante generava una stringa casuale solo in stato locale React, non
// toccava mai auth.users, il coach pensava di aver risolto un accesso
// bloccato e in realtà no.
function AccountActions({ client, onRenamed }) {
  const { supabase, reloadRoster } = useContext(CoachDataContext);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(client.name);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const saveRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === client.name) { setEditing(false); return; }
    setBusy(true);
    setError("");
    try {
      await renameClient(supabase, client.id, { fullName: trimmed });
      setEditing(false);
      onRenamed?.();
      reloadRoster?.();
    } catch (err) {
      console.error("PERFORM: errore rinomina cliente", err);
      setError("Non sono riuscito a salvare il nuovo nome.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    setError("");
    setNewPassword(null);
    try {
      const pwd = await adminResetPassword(supabase, client.id);
      setNewPassword(pwd);
    } catch (err) {
      console.error("PERFORM: errore reset password", err);
      setError("Non sono riuscito a reimpostare la password.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError("");
    try {
      await adminDeleteAccount(supabase, client.id);
      reloadRoster?.();
    } catch (err) {
      console.error("PERFORM: errore eliminazione account", err);
      setError("Non sono riuscito a eliminare l'account.");
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }}
          className="t-input px-2.5 py-2 rounded-lg text-xs flex-1 min-w-0" autoFocus />
        <button onClick={saveRename} disabled={busy} className="c-btn px-2.5 py-2 rounded-lg text-xs">✓</button>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs" style={{ color: "#DC2626", fontWeight: 600 }}>Eliminare per sempre {client.name}?</p>
        <div className="flex gap-1.5">
          <button onClick={deleteAccount} disabled={busy} className="px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}>
            {busy ? "…" : "Conferma"}
          </button>
          <button onClick={() => setConfirmDelete(false)} disabled={busy} className="c-ghost px-2.5 py-1.5 rounded-lg text-xs">Annulla</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => { setNameDraft(client.name); setEditing(true); }} className="c-ghost px-2.5 py-1.5 rounded-lg text-[11px] font-medium">
          ✏️ Rinomina
        </button>
        <button onClick={resetPassword} disabled={busy} className="c-ghost px-2.5 py-1.5 rounded-lg text-[11px] font-medium">
          🔑 Reset password
        </button>
        <button onClick={() => setConfirmDelete(true)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ color: "#DC2626" }}>
          🗑 Elimina
        </button>
      </div>
      {newPassword && (
        <p className="font-data text-xs px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
          Nuova password: <strong>{newPassword}</strong> — comunicala ora, non sarà più visibile dopo.
        </p>
      )}
      {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}

/* Bottone copia-negli-appunti generico: usato per email/nome reale nel
   dettaglio cliente — "dammi la possibilità di copiare la mail e nome vero"
   per poter riconoscere/whitelistare persone che il coach conosce. */
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("PERFORM: errore copia negli appunti", err);
    }
  };
  return (
    <button onClick={doCopy} disabled={!value} title={`Copia ${label}`}
            className="inline-flex items-center gap-1 disabled:opacity-40" style={{ color: "var(--ink-tertiary)" }}>
      {copied ? <Check size={12} style={{ color: "#10B981" }} /> : <Copy size={12} />}
    </button>
  );
}

const WHITELIST_PLAN_LABELS = {
  free: "Free", performance_pack: "Premium", scheda_personalizzata: "Scheda Personalizzata",
  training: "Coaching Allenamento", full: "Full Coaching",
};

/* Whitelist: attiva un piano a tempo senza passare da Stripe né da
   anamnesi obbligatoria — persone che il coach conosce di persona (vedi
   whitelistClient/coachingData.js, SCHEMA_v37). La scadenza è calcolata a
   mesi esatti dalla data di attivazione, non un'approssimazione a giorni. */
function ClientWhitelistPanel({ client, onChanged }) {
  const { supabase, reloadRoster } = useContext(CoachDataContext);
  const [plan, setPlan] = useState("full");
  const [months, setMonths] = useState(3);
  const [skipAnamnesis, setSkipAnamnesis] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isActive = client.whitelistedUntil && new Date(client.whitelistedUntil) > new Date();
  const requiresAnamnesis = REAL_COACHING_PLANS.has(plan); // scheda_personalizzata/training/full — non performance_pack

  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      await whitelistClient(supabase, client.id, plan, months, requiresAnamnesis ? skipAnamnesis : true);
      reloadRoster?.();
      onChanged?.();
    } catch (err) {
      console.error("PERFORM: errore attivazione whitelist", err);
      setError(err.message || "Non sono riuscito ad attivare la whitelist.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await clearWhitelist(supabase, client.id);
      reloadRoster?.();
      onChanged?.();
    } catch (err) {
      console.error("PERFORM: errore rimozione whitelist", err);
      setError("Non sono riuscito a rimuovere la whitelist.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="t-inner px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck size={15} style={{ color: "#C5A059" }} />
        <p className="c-label" style={{ margin: 0 }}>Whitelist — bypass Stripe e anamnesi</p>
      </div>
      {isActive ? (
        <>
          <p className="text-sm mb-3" style={{ color: "var(--ink)" }}>
            Attiva fino al <strong>{new Date(client.whitelistedUntil).toLocaleDateString("it-IT")}</strong> —
            piano {WHITELIST_PLAN_LABELS[client.plan] || client.plan}.
          </p>
          <button onClick={remove} disabled={busy} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium">
            {busy ? "…" : "Rimuovi whitelist"}
          </button>
        </>
      ) : (
        <>
          <p className="c-muted text-xs mb-3">
            Per persone che conosci di persona: accesso pieno senza pagamento reale, con scadenza precisa.
          </p>
          <div className="flex flex-wrap items-end gap-2.5 mb-3">
            <label className="flex-1 min-w-[160px]">
              <span className="c-label block mb-1">Piano</span>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="t-input w-full text-sm rounded-md px-2.5 py-2">
                {Object.entries(WHITELIST_PLAN_LABELS).filter(([id]) => id !== "free").map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="w-24">
              <span className="c-label block mb-1">Mesi</span>
              <input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className="t-input w-full text-sm rounded-md px-2.5 py-2 font-data text-center" />
            </label>
            <button onClick={activate} disabled={busy} className="c-btn px-3.5 py-2 rounded-lg text-xs font-medium">
              {busy ? "…" : "Attiva whitelist"}
            </button>
          </div>
          {requiresAnamnesis && (
            <label className="flex items-center gap-2 mb-1 cursor-pointer">
              <input type="checkbox" checked={skipAnamnesis} onChange={(e) => setSkipAnamnesis(e.target.checked)} className="w-4 h-4" />
              <span className="text-xs" style={{ color: "var(--ink-2)" }}>
                Salta anche l'anamnesi {skipAnamnesis ? "" : "— dovrà compilarla al primo accesso"}
              </span>
            </label>
          )}
        </>
      )}
      {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}

/* Dettaglio cliente da Controllo Accessi: nickname/livello XP/piano/date +
   whitelist — "se clicco su di esso fa vedere le loro impostazioni". */
function ClientAccessDetailModal({ client, onClose }) {
  const { supabase, reloadRoster } = useContext(CoachDataContext);
  const level = xpToLevelInfo(client.xp || 0);
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  const [picking, setPicking] = useState(false);
  const [activating, setActivating] = useState(false);

  const activate = async (plan) => {
    setActivating(true);
    try {
      await activateClient(supabase, client.id, plan);
      setPicking(false);
      reloadRoster?.();
    } catch (err) {
      console.error("PERFORM: errore attivazione cliente", err);
    } finally {
      setActivating(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{ backgroundColor: "rgba(9,9,11,0.65)", backdropFilter: "blur(6px)" }} onClick={onClose}>
        <div className="spring-in c-card w-full overflow-y-auto" style={{ maxWidth: 440, maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef}>
            <SwipeHandle />
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <p className="c-heading font-display font-bold truncate">{client.fullName || client.name}</p>
                <p className="c-muted text-xs">Dettaglio accesso</p>
              </div>
              <button onClick={onClose} aria-label="Chiudi" className="c-ghost w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="t-inner px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="c-label mb-0.5">Nome reale (registrazione)</p>
                <p className="text-sm truncate" style={{ color: "var(--ink)" }}>{client.fullName || "—"}</p>
              </div>
              <CopyButton value={client.fullName} label="nome" />
            </div>
            <div className="t-inner px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="c-label mb-0.5">Email</p>
                <p className="font-data text-sm truncate" style={{ color: "var(--ink)" }}>{client.email || "—"}</p>
              </div>
              <CopyButton value={client.email} label="email" />
            </div>
            <div className="t-inner px-3.5 py-2.5">
              <p className="c-label mb-0.5">Nickname</p>
              <p className="text-sm" style={{ color: "var(--ink)" }}>{client.nickname || "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="t-inner px-3.5 py-2.5">
                <p className="c-label mb-0.5">Livello</p>
                <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{level.title}</p>
              </div>
              <div className="t-inner px-3.5 py-2.5">
                <p className="c-label mb-0.5">XP totali</p>
                <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{client.xp}</p>
              </div>
              <div className="t-inner px-3.5 py-2.5">
                <p className="c-label mb-0.5">Piano attuale</p>
                <p className="text-sm" style={{ color: "var(--ink)" }}>{WHITELIST_PLAN_LABELS[client.plan] || client.plan}</p>
              </div>
              <div className="t-inner px-3.5 py-2.5">
                <p className="c-label mb-0.5">Iscritto il</p>
                <p className="text-sm" style={{ color: "var(--ink)" }}>{client.createdAt ? new Date(client.createdAt).toLocaleDateString("it-IT") : "—"}</p>
              </div>
              <div className="t-inner px-3.5 py-2.5 col-span-2">
                <p className="c-label mb-0.5">Ultimo accesso</p>
                <p className="text-sm" style={{ color: "var(--ink)" }}>{client.lastActivity ? new Date(client.lastActivity).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Mai registrato"}</p>
              </div>
            </div>
          </div>

          {client.clientStatus === "registered" && (
            <div className="t-inner px-3.5 py-3 mb-4">
              <p className="c-label mb-2">Prendi in gestione</p>
              {picking ? (
                <CoachingPlanPicker onPick={activate} busy={activating} onCancel={() => setPicking(false)} />
              ) : (
                <button onClick={() => setPicking(true)} className="c-btn px-3 py-2 rounded-lg text-xs font-medium">
                  Assegna un piano a coaching
                </button>
              )}
            </div>
          )}

          <div className="t-inner px-3.5 py-3 mb-4">
            <p className="c-label mb-2">Account</p>
            <AccountActions client={client} onRenamed={onClose} />
          </div>

          <ClientWhitelistPanel client={client} onChanged={onClose} />
        </div>
      </div>
    </Portal>
  );
}

/* HUB UTENTI — elenco semplice: solo nome (reale, di registrazione) ed
   email, ordinato per ultimo accesso (più recente prima). Rinomina, reset
   password, whitelist e copia dati vivono tutti nel dettaglio (click sulla
   riga) — non più duplicati qui, richiesta esplicita: "voglio solo un
   elenco di nomi degli utenti e le loro mail". last_activity è un dato
   reale (profiles.last_activity, SCHEMA_v51), scritto una volta a sessione
   da ogni utente che apre l'app (touchLastActivity in App.jsx) — mai una
   euristica finta come il vecchio buildLastLogin. */
function AccessControlTable() {
  const { clients: CLIENTS, isRealMode } = useContext(CoachDataContext);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = [...CLIENTS]
    .filter((c) => q === "" || c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.fullName || "").toLowerCase().includes(q))
    .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
  const [detailClient, setDetailClient] = useState(null); // riga cliccata → apre ClientAccessDetailModal

  return (
    <div className="c-card">
      <h3 className="c-heading font-display font-bold mb-1">👥 Hub Utenti</h3>
      <p className="c-muted text-xs mb-4">
        Ordinato per ultimo accesso (più recente prima), TUTTI gli iscritti. Clicca un utente per rinominare,
        copiare i dati, dare la whitelist o gestire l'account.
      </p>
      <ReferralsPanel />
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-tertiary)" }} />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome o email…"
          className="t-input w-full text-sm rounded-lg pl-10 pr-3.5 py-2.5" />
      </div>
      <div className="space-y-2">
        {rows.map((c) => {
          const whitelistActive = c.whitelistedUntil && new Date(c.whitelistedUntil) > new Date();
          return (
            <button key={c.id} onClick={() => isRealMode && setDetailClient(c)} disabled={!isRealMode}
              title={isRealMode ? "Apri dettaglio accesso" : undefined}
              className="w-full flex items-center justify-between gap-3 t-inner px-4 py-3 text-left disabled:cursor-default">
              <div className="min-w-0">
                <p className="text-sm truncate flex items-center gap-1.5" style={{ color: "var(--ink)", fontWeight: 600 }}>
                  {c.fullName || c.name}
                  {whitelistActive && <span title="Whitelist attiva" style={{ fontSize: "0.85rem" }}>🛡️</span>}
                </p>
                <p className="font-data text-xs truncate" style={{ color: "var(--ink-soft)" }}>{c.email}</p>
              </div>
              <p className="font-data text-[10px] shrink-0 text-right" style={{ color: "var(--ink-tertiary)" }}>
                {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString("it-IT") : "Mai registrato"}
              </p>
            </button>
          );
        })}
        {rows.length === 0 && <p className="c-muted text-sm py-6 text-center">Nessun risultato per questa ricerca</p>}
      </div>
      {detailClient && (
        <ClientAccessDetailModal
          client={rows.find((r) => r.id === detailClient.id) || detailClient}
          onClose={() => setDetailClient(null)}
        />
      )}
    </div>
  );
}


/* ------------------------------ TIMELINE EDITOR -----------------------------
   [A1] Allenamento Libero + Intensità: esercizio a testo libero se assente
   dal menu, Tempi di Recupero per esercizio, e le 4 Tecniche d'Intensità
   pianificate (Drop-set, Rest-Pause, Stripping, Super-set).               */
function WeekWorkoutEditor({ week, onChange, client }) {
  const { supabase, coachId, isRealMode, exerciseLib, reloadExerciseLib } = useContext(CoachDataContext);
  // EX_NAMES ora viene dalla libreria collettiva reale (SCHEMA_v39), non più
  // una lista fissa di ~19 esercizi — cresce da sola ogni volta che un
  // esercizio custom viene salvato in libreria. Ordinata alfabeticamente:
  // resta così solo per gli usi "un nome qualunque valido" (EX_NAMES[0] come
  // esercizio di default), il menu a tendina vero usa EX_NAMES_BY_MUSCLE.
  const EX_NAMES = useMemo(() => Object.keys(exerciseLib).sort((a, b) => a.localeCompare(b, "it")), [exerciseLib]);
  // Richiesta esplicita: la lista esercizi va ordinata per gruppo muscolare
  // principale coinvolto, non alfabetica — un elenco di 100+ esercizi
  // alfabetici mescola petto/schiena/gambe senza nessun criterio utile
  // mentre si costruisce una scheda. Raggruppa per exerciseLib[name].direct[0]
  // (il muscolo diretto, stesso campo scritto da saveExerciseToLib/
  // "Salva in libreria"), nell'ordine di MUSCLES (coachingData.js — lo
  // stesso ordine già usato dal grafico Volume settimanale), alfabetico
  // dentro ogni gruppo. Un esercizio senza muscolo assegnato (non dovrebbe
  // succedere per righe scritte da questa stessa app, ma un dato importato
  // a mano potrebbe non averlo) finisce in "Altro" invece di sparire.
  const EX_NAMES_BY_MUSCLE = useMemo(() => {
    const groups = new Map(MUSCLES.map((m) => [m, []]));
    groups.set("Altro", []);
    Object.keys(exerciseLib).forEach((name) => {
      const muscle = exerciseLib[name]?.direct?.[0];
      const key = muscle && groups.has(muscle) ? muscle : "Altro";
      groups.get(key).push(name);
    });
    groups.forEach((arr) => arr.sort((a, b) => a.localeCompare(b, "it")));
    return [...groups.entries()].filter(([, arr]) => arr.length > 0);
  }, [exerciseLib]);
  const [selDay, setSelDay] = useState(0);
  const day = week.workout[selDay];
  const setDay = (updater) => onChange({ ...week, workout: week.workout.map((d, i) => (i === selDay ? updater(d) : d)) });
  const toggleRest = () => setDay((d) => (d ? null : { label: "Nuova sessione", warmup: "", stretching: "", exercises: [] }));
  // Drag-to-reorder (stesso hook/pattern di DayEditor in 05_HomeDashboard.jsx,
  // vedi useDragReorder.js): l'ordine dell'array locale È l'ordine mostrato,
  // saveWeekWorkout scrive quell'ordine in workout_logs.sort_order al salvataggio
  // — mai un riordino solo visivo che si perde al prossimo caricamento.
  const reorderEx = (fromIdx, toIdx) => setDay((d) => ({ ...d, exercises: moveItem(d.exercises, fromIdx, toIdx) }));
  const reorder = useDragReorder({ length: day?.exercises?.length ?? 0, onReorder: reorderEx });
  const updateEx = (i, field, value) => setDay((d) => ({
    ...d,
    exercises: d.exercises.map((e, j) => (j === i ? {
      ...e,
      [field]: field === "sets" ? Math.max(1, Math.min(8, Number(value) || 1))
        : field === "rest" ? Math.max(0, Number(value) || 0)
        : field === "durationMin" ? Math.max(1, Number(value) || 1)
        : value,
    } : e)),
  }));
  // BUG PRESO (stesso identico difetto già preso sul campo Kcal in
  // WeekDietEditor): "Serie" e "Recupero" applicavano Math.max/min a OGNI
  // tasto premuto — un numero temporaneamente fuori range durante la
  // digitazione (o anche solo lo stesso valore ricalcolato) faceva
  // "correggere" il campo a metà digitazione, che su mobile sembra
  // rifiutare alcune cifre. Ora una bozza di testo locale assorbe la
  // digitazione per entrambi i campi; il vincolo (1-8 serie, recupero ≥0)
  // si applica solo al blur, tramite updateEx come già faceva.
  const [fieldDrafts, setFieldDrafts] = useState({}); // `${exId}-${field}` -> stringa in corso di modifica
  const draftKey = (exId, field) => `${exId}-${field}`;
  const commitDraft = (i, exId, field) => {
    const key = draftKey(exId, field);
    if (key in fieldDrafts) updateEx(i, field, fieldDrafts[key]);
    setFieldDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
  };
  // Applica più campi insieme in un colpo solo (serve per il cambio
  // esercizio: azzerare muscleTarget/synergists SOLO quando l'identità
  // dell'esercizio cambia davvero, così i valori mostrati — con fallback
  // alla libreria condivisa più sotto — non restano quelli del precedente).
  const setExFields = (i, patch) => setDay((d) => ({
    ...d,
    exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)),
  }));
  const toggleCustom = (i) => {
    const exId = day?.exercises?.[i]?.id;
    if (exId) clearExDrafts(exId);
    setDay((d) => ({
      ...d,
      exercises: d.exercises.map((e, j) => (j === i ? { ...e, custom: !e.custom, name: e.custom ? EX_NAMES[0] : "", muscleTarget: undefined, synergists: undefined } : e)),
    }));
  };
  const removeEx = (i) => setDay((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }));
  // Serie/Reps/Recupero partono VUOTI (mai un numero prestabilito da
  // cancellare prima di scrivere il proprio) — richiesta esplicita. RIR
  // target parte a "0": il coach lavora quasi sempre a cedimento, gli altri
  // valori (1-4, in buffer) li imposta lui a mano sui pochi esercizi dove
  // servono — meglio un default sbagliato raro che doverlo scegliere ogni
  // volta. Tecnica resta "Nessuna" (invariato).
  const addEx = () => setDay((d) => ({ ...d, exercises: [...d.exercises, { id: uid(), name: EX_NAMES[0], custom: false, kind: "strength", sets: "", reps: "", rest: "", rirTarget: "0", technique: "Nessuna" }] }));
  // Cardio (SCHEMA_v84): il coach lo aggiunge sempre a mano, mai l'AI — solo
  // nome libero + minuti, nessuna serie/carico da monitorare. Stesso array
  // "exercises" degli esercizi di forza (appare come una voce in più nella
  // stessa lista, nell'ordine in cui il coach la trascina), distinto solo da
  // kind: "cardio".
  const addCardio = () => setDay((d) => ({ ...d, exercises: [...d.exercises, { id: uid(), kind: "cardio", name: "", durationMin: 15 }] }));

  // Elimina l'intera giornata (tutti gli esercizi, non solo uno): conferma
  // in due tocchi invece di un window.confirm nativo — è distruttivo (nessun
  // annulla) ma un solo click accidentale non deve bastare a cancellarla.
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(false);
  const deleteDayRef = useRef(null);
  const deleteDay = () => {
    if (!confirmDeleteDay) {
      setConfirmDeleteDay(true);
      deleteDayRef.current = setTimeout(() => setConfirmDeleteDay(false), 3000);
      return;
    }
    clearTimeout(deleteDayRef.current);
    setConfirmDeleteDay(false);
    setDay(() => null);
  };
  useEffect(() => { setConfirmDeleteDay(false); }, [selDay]);

  // Copia la giornata corrente su altri giorni della settimana — utile per
  // le frequenze alte (stesso allenamento ripetuto 2-3 volte a settimana):
  // esercizi clonati con id nuovi (stesso principio di deepCloneWeek più
  // sotto), mai gli stessi riferimenti condivisi fra giorni diversi.
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);
  const toggleCopyTarget = (i) => setCopyTargets((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]));
  const applyCopyDay = () => {
    if (!day || copyTargets.length === 0) return;
    onChange({
      ...week,
      workout: week.workout.map((d, i) => (copyTargets.includes(i)
        ? { label: day.label, warmup: day.warmup || "", stretching: day.stretching || "", exercises: day.exercises.map((e) => ({ ...e, id: uid() })) }
        : d)),
    });
    setCopyPickerOpen(false);
    setCopyTargets([]);
  };
  const volume = useMemo(() => computeVolume(week.workout, exerciseLib), [week.workout, exerciseLib]);
  const [savedToLib, setSavedToLib] = useState({}); // { exId: true } — feedback visivo dopo "Salva in libreria"
  const [saveLibError, setSaveLibError] = useState({}); // { exId: messaggio } — errore reale, mai un "salvato" finto
  // Guida biomeccanica per esercizio (SCHEMA_v61): bozza locale per
  // esercizio, {exId: {howTo, avoid, videoUrl}} — scritta insieme ai
  // muscoli target nello stesso "Salva in libreria", mai più indovinata
  // lato cliente da un matching sul nome (la causa della guida sbagliata
  // sugli esercizi inseriti manualmente).
  const [guideDrafts, setGuideDrafts] = useState({});
  const updateGuideDraft = (exId, field, value) =>
    setGuideDrafts((d) => ({ ...d, [exId]: { ...d[exId], [field]: value } }));
  // Richiesta esplicita: molti esercizi (dip, chin-up, squat, affondi, stacco
  // rumeno, hip thrust...) sfiniscono DUE gruppi muscolari entrambi al 100%,
  // non uno diretto + sinergici al 50% — computeVolume() già itera OGNI
  // elemento di "direct" al 100% (nessuna modifica lì necessaria), qui basta
  // dare al coach un secondo select opzionale invece del solo "ex.muscleTarget"
  // singolo (che resta il campo scritto su workout_logs, un solo valore per
  // constraint — questo secondo target esiste solo per comporre "direct" al
  // salvataggio in libreria, non tocca ex.muscleTarget).
  const [secondMuscleDrafts, setSecondMuscleDrafts] = useState({}); // {exId: nome muscolo DB o ""}
  // Ripulisce tutte le bozze/lo stato di feedback legati a un esercizio —
  // usata quando l'IDENTITÀ dell'esercizio in una riga cambia (nome diverso
  // scelto dal menu, o passaggio libreria/libero): senza questo, valori del
  // vecchio esercizio (2° distretto, bozza guida, "✓ Salvato") restavano
  // visibili addosso al nuovo esercizio appena scelto.
  const clearExDrafts = (exId) => {
    setSecondMuscleDrafts((d) => { if (!(exId in d)) return d; const next = { ...d }; delete next[exId]; return next; });
    setGuideDrafts((d) => { if (!(exId in d)) return d; const next = { ...d }; delete next[exId]; return next; });
    setSavedToLib((s) => { if (!(exId in s)) return s; const next = { ...s }; delete next[exId]; return next; });
  };
  const handleNameChange = (i, exId, value) => {
    clearExDrafts(exId);
    setExFields(i, { name: value, muscleTarget: undefined, synergists: undefined });
  };
  // BUG PRESO: prima non c'era nessun try/catch — saveExerciseGuide non
  // rilanciava mai un errore reale (solo console.error), quindi questa
  // funzione marcava SEMPRE "✓ Salvato in libreria" anche quando la
  // scrittura falliva davvero (RLS, colonne mancanti). L'esercizio spariva
  // dalla libreria condivisa al prossimo caricamento senza che il coach
  // avesse modo di saperlo. Ora un fallimento reale mostra un errore
  // visibile invece di un falso successo.
  // "eff" (valori effettivi mostrati in UI, vedi il render della riga più
  // sotto): per un esercizio scelto da libreria, ex.muscleTarget/synergists
  // restano intoccati finché il coach non li modifica davvero — l'UI mostra
  // già il valore corrente della libreria come fallback, quindi qui si
  // salvano SEMPRE i valori effettivi (mai solo il campo ex nudo, altrimenti
  // un esercizio di libreria non ancora toccato non avrebbe nulla da
  // salvare).
  const saveExerciseToLib = async (ex, eff) => {
    if (!isRealMode || !ex.name?.trim() || !eff.muscleTarget) return;
    setSaveLibError((s) => ({ ...s, [ex.id]: "" }));
    const direct = [DB_MUSCLE_TO_CHART[eff.muscleTarget] || eff.muscleTarget];
    if (eff.secondMuscle) direct.push(DB_MUSCLE_TO_CHART[eff.secondMuscle] || eff.secondMuscle);
    const indirect = (eff.synergists || []).map((m) => DB_MUSCLE_TO_CHART[m] || m);
    try {
      await saveExerciseGuide(supabase, ex.name.trim(), direct, indirect,
        { howTo: eff.howTo, avoid: eff.avoid, videoUrl: eff.videoUrl }, coachId);
      reloadExerciseLib();
      setSavedToLib((s) => ({ ...s, [ex.id]: true }));
    } catch (err) {
      console.error("PERFORM: errore salvataggio esercizio in libreria", err);
      setSaveLibError((s) => ({ ...s, [ex.id]: err?.message || "Non sono riuscito a salvare l'esercizio in libreria." }));
    }
  };
  // Un esercizio custom SENZA distretto scelto è l'unico caso davvero escluso
  // dal grafico volumi ora — con un distretto impostato (+ eventuali
  // sinergici) contribuisce come qualunque esercizio di libreria.
  const unmapped = useMemo(() => {
    const names = new Set();
    week.workout.filter(Boolean).forEach((d) => d.exercises.forEach((e) => { if (e.custom && e.name.trim() && !e.muscleTarget) names.add(e.name.trim()); }));
    return [...names];
  }, [week.workout]);

  return (
    <div>
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
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <input value={day.label} onChange={(e) => setDay((d) => ({ ...d, label: e.target.value }))} className="t-input flex-1 min-w-[140px] text-sm rounded-lg px-3 py-2" />
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => { setCopyPickerOpen((v) => !v); setCopyTargets([]); }}
                className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">
                Copia su…
              </button>
              <button onClick={toggleRest} className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">Riposo</button>
              <button onClick={deleteDay}
                className="px-3 py-2 rounded-lg text-xs font-data uppercase transition-colors"
                style={confirmDeleteDay ? { backgroundColor: "#DC2626", color: "#FFFFFF" } : { backgroundColor: "transparent", border: "1px solid #FCA5A5", color: "#DC2626" }}>
                {confirmDeleteDay ? "Conferma?" : "Elimina giornata"}
              </button>
            </div>
          </div>

          {/* Copia questa giornata (esercizi inclusi) su altri giorni della
              settimana — pensato per le frequenze alte, stesso allenamento
              ripetuto 2-3 volte a settimana senza doverlo ricostruire a mano
              ogni volta. */}
          {copyPickerOpen && (
            <div className="t-inner px-3 py-3 mb-3">
              <p className="c-label mb-2">Copia "{day.label}" su:</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {WEEK_DAYS.map((label, i) => {
                  if (i === selDay) return null;
                  const on = copyTargets.includes(i);
                  return (
                    <button key={i} type="button" onClick={() => toggleCopyTarget(i)}
                      className="rounded-lg px-3 py-2 text-xs font-data uppercase transition-colors"
                      style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                      {label}{!week.workout[i] && " · riposo"}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={applyCopyDay} disabled={copyTargets.length === 0}
                  className="c-btn px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  Copia su {copyTargets.length || ""} {copyTargets.length === 1 ? "giorno" : "giorni"}
                </button>
                <button onClick={() => { setCopyPickerOpen(false); setCopyTargets([]); }} className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">
                  Annulla
                </button>
              </div>
              <p className="c-muted text-[10px] mt-2">
                Sovrascrive gli esercizi già presenti nei giorni selezionati — non li somma.
              </p>
            </div>
          )}

          {/* Riscaldamento & Mobilità (prima della sessione) e Stretching
              (a fine sessione, subito sotto la lista esercizi): testo libero
              per giorno, mai serie/carichi da monitorare — solo da leggere.
              "Genera bozza con AI" li scrive sempre in base agli esercizi
              assegnati quel giorno; il coach può comunque scriverli/
              modificarli qui a mano in qualunque momento. */}
          <label className="block mb-3">
            <span className="c-label block mb-1">🔥 Riscaldamento & Mobilità (prima della sessione)</span>
            <textarea value={day.warmup || ""} rows={2} onChange={(e) => setDay((d) => ({ ...d, warmup: e.target.value }))}
              placeholder="Es. Cyclette leggera 5', Rotazioni di spalle 2x15, Hip circles 2x10 per lato…"
              className="t-input w-full text-sm rounded-md px-2.5 py-2" />
          </label>

          <div className="space-y-2.5 mb-3">
            {day.exercises.map((ex, i) => {
              // Valori effettivi mostrati/salvati per questa riga: per un
              // esercizio scelto da libreria (custom === false) partono dalla
              // libreria condivisa finché il coach non li tocca — non sono mai
              // "vuoti e da rifare" come prima, un esercizio già in libreria
              // mostra subito cosa c'è già scritto, pronto da correggere.
              const libEntry = exerciseLib[(ex.name || "").trim()];
              const libDirect0 = libEntry?.direct?.[0] ? (EXERCISE_LIB_MUSCLE_TO_DB[libEntry.direct[0]] || libEntry.direct[0]) : "";
              const libDirect1 = libEntry?.direct?.[1] ? (EXERCISE_LIB_MUSCLE_TO_DB[libEntry.direct[1]] || libEntry.direct[1]) : "";
              const libIndirect = (libEntry?.indirect || []).map((m) => EXERCISE_LIB_MUSCLE_TO_DB[m] || m);
              const effMuscleTarget = ex.muscleTarget ?? libDirect0;
              const effSecondMuscle = secondMuscleDrafts[ex.id] ?? libDirect1;
              const effSynergists = ex.synergists ?? libIndirect;
              const effHowTo = guideDrafts[ex.id]?.howTo ?? ex.howTo ?? libEntry?.howTo ?? "";
              const effAvoid = guideDrafts[ex.id]?.avoid ?? ex.avoid ?? libEntry?.avoid ?? "";
              const effVideoUrl = guideDrafts[ex.id]?.videoUrl ?? ex.videoUrl ?? libEntry?.videoUrl ?? "";
              return ex.kind === "cardio" ? (
                <div key={ex.id} ref={reorder.setRowRef(i)} style={{ ...reorder.rowStyle(i) }} className="t-inner px-3 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span {...reorder.handleProps(i)} aria-label="Trascina per riordinare" className="shrink-0" style={{ ...reorder.handleProps(i).style, color: "var(--ink-tertiary)" }}>
                      <GripVertical size={15} />
                    </span>
                    <span className="shrink-0" aria-hidden="true">🏃</span>
                    <input value={ex.name} onChange={(e) => updateEx(i, "name", e.target.value)} placeholder="Es. Tapis roulant, Bike, Vogatore…"
                      className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[160px]" />
                    <label className="text-center shrink-0">
                      <span className="c-label block mb-1">Minuti</span>
                      <input type="number" min={1} value={fieldDrafts[draftKey(ex.id, "durationMin")] ?? ex.durationMin}
                        onFocus={() => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "durationMin")]: String(ex.durationMin) }))}
                        onChange={(e) => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "durationMin")]: e.target.value }))}
                        onBlur={() => commitDraft(i, ex.id, "durationMin")}
                        className="t-input w-16 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                    </label>
                    <button onClick={() => removeEx(i)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi"><Trash2 size={13} /></button>
                  </div>
                </div>
              ) : (
              <div key={ex.id} ref={reorder.setRowRef(i)} style={{ ...reorder.rowStyle(i) }} className="t-inner px-3 py-3">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span {...reorder.handleProps(i)} aria-label="Trascina per riordinare" className="shrink-0" style={{ ...reorder.handleProps(i).style, color: "var(--ink-tertiary)" }}>
                    <GripVertical size={15} />
                  </span>
                  {ex.custom ? (
                    // BUG PRESO: autoFocus qui scattava per OGNI esercizio "libero" della
                    // giornata a ogni apertura dell'editor (non solo per uno appena
                    // aggiunto) — il browser porta automaticamente in vista l'ultimo
                    // elemento che riceve il focus, quindi l'editor si apriva già
                    // scrollato in fondo, sull'ultimo esercizio. Via l'autofocus: si apre
                    // in cima, il cursore va dove lo mette il coach.
                    <input value={ex.name} onChange={(e) => updateEx(i, "name", e.target.value)} placeholder="Scrivi il nome dell'esercizio…"
                      className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[180px]" />
                  ) : (
                    <select value={ex.name} onChange={(e) => handleNameChange(i, ex.id, e.target.value)} className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[180px]">
                      {EX_NAMES_BY_MUSCLE.map(([muscle, names]) => (
                        <optgroup key={muscle} label={muscle}>
                          {names.map((n) => <option key={n} value={n}>{n}</option>)}
                        </optgroup>
                      ))}
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
                    <input type="number" value={fieldDrafts[draftKey(ex.id, "sets")] ?? ex.sets}
                      onFocus={() => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "sets")]: String(ex.sets) }))}
                      onChange={(e) => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "sets")]: e.target.value }))}
                      onBlur={() => commitDraft(i, ex.id, "sets")}
                      className="t-input w-14 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="text-center">
                    <span className="c-label block mb-1">Reps</span>
                    <input type="text" value={ex.reps} onChange={(e) => updateEx(i, "reps", e.target.value)} className="t-input w-20 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="text-center">
                    <span className="c-label block mb-1">Recupero (s)</span>
                    <input type="number" step="15" value={fieldDrafts[draftKey(ex.id, "rest")] ?? ex.rest}
                      onFocus={() => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "rest")]: String(ex.rest) }))}
                      onChange={(e) => setFieldDrafts((d) => ({ ...d, [draftKey(ex.id, "rest")]: e.target.value }))}
                      onBlur={() => commitDraft(i, ex.id, "rest")}
                      className="t-input w-20 text-sm rounded-md px-2 py-1.5 font-data text-center" />
                  </label>
                  <label className="text-center">
                    <span className="c-label block mb-1">RIR target</span>
                    <select value={ex.rirTarget || ""} onChange={(e) => updateEx(i, "rirTarget", e.target.value)} className="t-input w-24 text-sm rounded-md px-2 py-1.5">
                      <option value="">—</option>
                      {RIR_TARGET_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="flex-1 min-w-[160px]">
                    <span className="c-label block mb-1">Tecnica d'intensità</span>
                    <select value={ex.technique} onChange={(e) => updateEx(i, "technique", e.target.value)} className="t-input w-full text-sm rounded-md px-2 py-1.5">
                      {INTENSITY_TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  {/* Distretto muscolare/sinergici/guida esercizio: SEMPRE
                      visibili, non solo per gli esercizi "liberi" come prima
                      — un esercizio scelto da libreria parte già coi valori
                      correnti della libreria condivisa (eff*, vedi sopra),
                      modificabili qui stesso senza dover riscrivere tutto da
                      capo. Toccare questi campi modifica solo questa riga:
                      per farlo valere per l'esercizio in libreria (tutti i
                      clienti futuri) va premuto "Aggiorna esercizio" sotto. */}
                  <label className="flex-1 min-w-[160px]">
                    <span className="c-label block mb-1">Distretto muscolare (diretto)</span>
                    <select value={effMuscleTarget}
                      onChange={(e) => {
                        setExFields(i, { muscleTarget: e.target.value });
                        if (e.target.value === effSecondMuscle) setSecondMuscleDrafts((d) => ({ ...d, [ex.id]: "" }));
                      }}
                      className="t-input w-full text-sm rounded-md px-2 py-1.5">
                      <option value="">— scegli —</option>
                      {MUSCLE_TARGETS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  {effMuscleTarget && (
                    <label className="flex-1 min-w-[160px]">
                      <span className="c-label block mb-1">2° distretto al 100% (opzionale)</span>
                      <select value={effSecondMuscle}
                        onChange={(e) => setSecondMuscleDrafts((d) => ({ ...d, [ex.id]: e.target.value }))}
                        className="t-input w-full text-sm rounded-md px-2 py-1.5">
                        <option value="">— nessuno —</option>
                        {MUSCLE_TARGETS.filter((m) => m !== effMuscleTarget).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  )}
                  {effMuscleTarget && (
                    <div className="w-full">
                      {effSecondMuscle && (
                        <p className="c-muted text-[11px] mb-1.5">
                          Salvato in libreria con {effMuscleTarget} + {effSecondMuscle} entrambi al 100% — 1 serie vale come 1 serie allenante per ciascuno dei due.
                        </p>
                      )}
                      <span className="c-label block mb-1">Muscoli sinergici (indiretto, opzionale)</span>
                      <div className="flex flex-wrap gap-1.5">
                        {MUSCLE_TARGETS.filter((m) => m !== effMuscleTarget && m !== effSecondMuscle).map((m) => {
                          const active = effSynergists.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                const next = active ? effSynergists.filter((x) => x !== m) : [...effSynergists, m];
                                setExFields(i, { synergists: next });
                              }}
                              // BUG PRESO: text-white fisso su bg-[var(--ink)] — --ink è scuro in
                              // tema chiaro ma CHIARO in tema scuro (vedi DesignSystem, File 4), quindi
                              // in dark mode diventava testo bianco su sfondo quasi bianco, illeggibile
                              // dopo il click. var(--page) è sempre il colore che contrasta con --ink
                              // in entrambi i temi, per costruzione (è la coppia sfondo/testo base
                              // dell'intero design system).
                              className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${active ? "bg-[var(--ink)] border-[var(--ink)]" : "c-ghost border-[var(--line)]"}`}
                              style={active ? { color: "var(--page)" } : undefined}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>

                      {/* Guida biomeccanica (SCHEMA_v61): opzionale, ma se
                          compilata sostituisce per SEMPRE (per tutti i
                          clienti) quella indovinata lato app sul nome
                          dell'esercizio — è quello il motivo per cui un
                          esercizio inserito a mano oggi mostra una guida
                          sbagliata. */}
                      <div className="w-full mt-3 space-y-2">
                        <label className="block">
                          <span className="c-label block mb-1">Come si esegue (opzionale)</span>
                          <textarea value={effHowTo} rows={2}
                            onChange={(e) => updateGuideDraft(ex.id, "howTo", e.target.value)}
                            placeholder="Setup, esecuzione, respirazione..."
                            className="t-input w-full text-sm rounded-md px-2 py-1.5" />
                        </label>
                        <label className="block">
                          <span className="c-label block mb-1">Cosa evitare (opzionale)</span>
                          <textarea value={effAvoid} rows={2}
                            onChange={(e) => updateGuideDraft(ex.id, "avoid", e.target.value)}
                            placeholder="Errori tecnici comuni da correggere..."
                            className="t-input w-full text-sm rounded-md px-2 py-1.5" />
                        </label>
                        <label className="block">
                          <span className="c-label block mb-1">Link video esecuzione (opzionale)</span>
                          <input type="url" value={effVideoUrl}
                            onChange={(e) => updateGuideDraft(ex.id, "videoUrl", e.target.value)}
                            placeholder="https://..."
                            className="t-input w-full text-sm rounded-md px-2 py-1.5" />
                        </label>
                      </div>

                      <button type="button"
                              onClick={() => saveExerciseToLib(ex, { muscleTarget: effMuscleTarget, secondMuscle: effSecondMuscle, synergists: effSynergists, howTo: effHowTo, avoid: effAvoid, videoUrl: effVideoUrl })}
                              className="c-ghost px-2.5 py-1.5 rounded-md text-[11px] font-data uppercase mt-2 flex items-center gap-1">
                        {savedToLib[ex.id] ? "✓ Salvato" : libEntry ? "🔄 Aggiorna esercizio" : "💾 Salva in libreria"}
                      </button>
                      {saveLibError[ex.id] ? (
                        <p className="text-[10px] mt-1" style={{ color: "#B91C1C" }}>{saveLibError[ex.id]}</p>
                      ) : (
                        <p className="c-muted text-[10px] mt-1">
                          {libEntry
                            ? "Aggiorna la libreria condivisa: la modifica vale subito per ogni cliente a cui assegni questo esercizio."
                            : "Salvalo dopo aver scelto i muscoli: la prossima volta compare già nel menu, per qualunque cliente — mai più da riscrivere."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          <label className="block mb-3">
            <span className="c-label block mb-1">🧘 Stretching (a fine sessione)</span>
            <textarea value={day.stretching || ""} rows={2} onChange={(e) => setDay((d) => ({ ...d, stretching: e.target.value }))}
              placeholder="Es. Stretching pettorali 2x30 sec, Stretching quadricipiti 2x30 sec per lato…"
              className="t-input w-full text-sm rounded-md px-2.5 py-2" />
          </label>

          <div className="flex items-center gap-2">
            <button onClick={addEx} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1"><Plus size={13} /> Esercizio</button>
            <button onClick={addCardio} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">🏃 Cardio</button>
          </div>
        </div>
      )}

      <div className="c-card">
        <p className="c-label mb-1">Matrice dei Volumi</p>
        <h3 className="c-heading font-display font-bold mb-1" style={{ fontSize: "1.15rem" }}>Stimolo settimanale reale</h3>
        <p className="c-muted text-xs mb-4">Serie dirette al 100% (barra piena) · serie sui distretti sinergici al 50% (barra chiara).</p>
        <VolumeBarChart volume={volume} gender={client.gender} />
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

  // Scrive i target ON/OFF su nutrition_targets (fetchBothNutritionTargets
  // legge lato Home cliente) E i pasti stessi su diet_plans (snapshotMeals →
  // saveWeekDiet, fetchDietPlan legge lato Home cliente per il tab "Dieta
  // Tipo"). week.diet resta lo stato locale di sempre per quest'editor —
  // "Salva modifiche" spinge entrambe le tabelle su Supabase in un colpo solo.
  const [dietSaving, setDietSaving] = useState(false);
  const [dietError, setDietError] = useState("");
  const [dietSaved, setDietSaved] = useState(false);
  const [genNutritionOpen, setGenNutritionOpen] = useState(false);
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
      await saveWeekDiet(supabase, coachId, client.id, {
        on: snapshotMeals(week.diet.ON.meals),
        off: snapshotMeals(week.diet.OFF.meals),
      });
      setDietSaved(true);
      setTimeout(() => setDietSaved(false), 2500);
      notifyClientPlanChange(supabase, client.id, {
        title: "Il tuo coach ha aggiornato la dieta",
        body: "Controlla i nuovi target nella tua scheda alimentazione.",
      });
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
  const targetKcal = kcalFromMacros(current.target.p, current.target.c, current.target.f);
  const totals = dayMacros(current.meals);
  const remaining = { p: current.target.p - totals.p, c: current.target.c - totals.c, f: current.target.f - totals.f, kcal: targetKcal - totals.kcal };

  // BUG PRESO (mobile): il campo Kcal mostrava value={targetKcal}, un valore
  // DERIVATO da p/c/f e ricalcolato a ogni render. Digitare in questo campo
  // ridistribuiva p/c/f con arrotondamento (Math.round) e il nuovo targetKcal
  // che ne usciva (kcalFromMacros dei grammi arrotondati) quasi mai coincideva
  // col numero appena scritto — il campo "correggeva" ogni singola cifra
  // digitata, che su mobile appare come selezione/cancellazione automatica.
  // Fix: una bozza di testo locale, sincronizzata dal valore derivato solo
  // quando il campo NON ha il focus (cambio giorno ON/OFF, modifica dei
  // grammi, generazione AI) — mentre si scrive, il campo mostra esattamente
  // ciò che l'utente digita, e la ridistribuzione scatta solo al blur.
  const [kcalFocused, setKcalFocused] = useState(false);
  const [kcalDraft, setKcalDraft] = useState(String(targetKcal));
  useEffect(() => { if (!kcalFocused) setKcalDraft(String(targetKcal)); }, [targetKcal, kcalFocused]);

  return (
    <div>
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
            <input type="number" min={0} value={kcalDraft}
              onFocus={() => setKcalFocused(true)}
              onChange={(e) => setKcalDraft(e.target.value)}
              onBlur={() => { setKcalFocused(false); updTargetKcal(kcalDraft); }}
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
      <div className="grid grid-cols-2 gap-2 mb-5">
        <button onClick={addMeal} className="c-btn rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-center gap-2">
          <Plus size={14} /> Nuovo pasto
        </button>
        <button onClick={() => setGenNutritionOpen(true)} className="c-ghost rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-center gap-1.5">
          <Sparkles size={14} style={{ color: "#C5A059" }} /> Genera pasti con AI
        </button>
      </div>
      {genNutritionOpen && (
        <GenerateAINutritionModal client={client} week={week}
          onClose={() => setGenNutritionOpen(false)}
          onConfirm={(result) => {
            const withIds = (profile) => (profile ? {
              meals: profile.meals.map((m) => ({ ...m, id: uid(), items: m.items.map((it) => ({ ...it, id: uid() })) })),
            } : null);
            const nextOn = withIds(result.ON);
            const nextOff = withIds(result.OFF);
            onChange({
              ...week,
              diet: {
                ON: nextOn ? { ...week.diet.ON, meals: nextOn.meals } : week.diet.ON,
                OFF: nextOff ? { ...week.diet.OFF, meals: nextOff.meals } : week.diet.OFF,
              },
            });
            setGenNutritionOpen(false);
          }} />
      )}

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
// BUG PRESO: prima ogni sezione aveva un titolo libero ("Nuova sezione",
// rinominabile a mano) salvato PARI PARI come prescribed_supplements.moment
// — fetchPrescribedSupplements riordina i momenti alfabeticamente lato
// cliente, quindi "Pre-Workout" scritto liberamente non combaciava mai col
// vero ordine cronologico (mattina→pre workout→post workout→sera) e finiva
// in coda. Ora le sezioni standard usano l'id fisso di SUPP_MOMENTS (stesso
// identificatore che il cliente legge per riordinare correttamente): il
// titolo mostrato resta quello leggibile, ma è l'id a essere salvato.
function WeekSuppsEditor({ supplements, onChange, client }) {
  const { supabase, isRealMode, coachId } = useContext(CoachDataContext);
  const usedMomentIds = new Set(supplements.map((s) => s.id_ref).filter(Boolean));
  const availableMoments = SUPP_MOMENTS.filter((m) => !usedMomentIds.has(m.id));
  const removeSection = (si) => onChange(supplements.filter((_, j) => j !== si));
  const renameSection = (si, title) => onChange(supplements.map((s, j) => (j !== si ? s : { ...s, title })));
  const addSection = (moment) => onChange([...supplements, moment
    ? { id: uid(), id_ref: moment.id, title: moment.label, items: [] }
    : { id: uid(), id_ref: null, title: "Altro momento", items: [] }]);

  const updItem = (si, ii, k, v) => onChange(supplements.map((s, j) => (j !== si ? s : { ...s, items: s.items.map((it, k2) => (k2 === ii ? { ...it, [k]: v } : it)) })));
  const removeItem = (si, ii) => onChange(supplements.map((s, j) => (j !== si ? s : { ...s, items: s.items.filter((_, k2) => k2 !== ii) })));
  const addItem = (si) => onChange(supplements.map((s, j) => (j !== si ? s : { ...s, items: [...s.items, { id: uid(), name: "", dose: "", dayType: "all" }] })));

  // Sostituisce l'intero protocollo del cliente (delete + insert, vedi nota
  // in saveWeekSupplements): niente storico da preservare qui, a differenza
  // dell'allenamento.
  const [suppSaving, setSuppSaving] = useState(false);
  const [suppError, setSuppError] = useState("");
  const [suppSaved, setSuppSaved] = useState(false);
  const [genSuppsOpen, setGenSuppsOpen] = useState(false);
  const saveSupplements = async () => {
    if (!isRealMode) return;
    setSuppSaving(true);
    setSuppError("");
    try {
      await saveWeekSupplements(supabase, coachId, client.id, supplements);
      setSuppSaved(true);
      setTimeout(() => setSuppSaved(false), 2500);
      notifyClientPlanChange(supabase, client.id, {
        title: "Il tuo coach ha aggiornato gli integratori",
        body: "Controlla il nuovo protocollo nella tua scheda.",
      });
    } catch (err) {
      console.error("PERFORM: errore salvataggio prescribed_supplements", err);
      setSuppError(err.message || "Non sono riuscito a salvare il protocollo.");
    } finally {
      setSuppSaving(false);
    }
  };

  return (
    <div>
      {/* Il toggle "Integratori da confermare" è stato tolto — richiesta
          esplicita: resta solo "Salva modifiche" qui sotto, che scrive
          davvero su Supabase e avvisa il cliente. */}
      <datalist id="supp-wiki-names">
        {SUPP_WIKI.map((s) => <option key={s.id} value={s.name} />)}
      </datalist>
      <div className="space-y-3">
      {supplements.map((sec, si) => (
        <div key={sec.id} className="c-card">
          <div className="flex items-center gap-2 mb-3">
            <input value={sec.title} onChange={(e) => renameSection(si, e.target.value)}
              placeholder="Nome momento" aria-label="Rinomina momento della giornata"
              className="t-input text-sm font-medium flex-1 px-2 py-1.5 rounded-md" style={{ color: "var(--ink)" }} />
            <button onClick={() => removeSection(si)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi sezione"><Trash2 size={13} /></button>
          </div>
          <div className="space-y-2 mb-2.5">
            {sec.items.map((it, ii) => (
              <div key={it.id} className="t-inner px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <input value={it.name} onChange={(e) => {
                    updItem(si, ii, "name", e.target.value);
                    // Nome riconosciuto nella lista: precompila la dose
                    // standard, il coach non deve più ricordarla a memoria —
                    // resta comunque modificabile subito dopo.
                    const known = SUPP_WIKI.find((s) => s.name.toLowerCase() === e.target.value.toLowerCase());
                    if (known && !it.dose) updItem(si, ii, "dose", known.dose.split(",")[0].split("(")[0].trim());
                  }} list="supp-wiki-names" placeholder="Nome integratore" className="t-input text-sm rounded-md px-2 py-1.5 flex-1 min-w-[160px]" />
                  <input value={it.dose} onChange={(e) => updItem(si, ii, "dose", e.target.value)} placeholder="Dose" className="t-input w-32 text-sm rounded-md px-2 py-1.5" />
                  <button onClick={() => removeItem(si, ii)} className="c-ghost w-8 h-8 rounded-md flex items-center justify-center shrink-0" aria-label="Rimuovi"><Trash2 size={13} /></button>
                </div>
                {/* Stessa logica ON/OFF già usata per l'alimentazione: quale
                    giorno reale del cliente questo integratore vale — deciso
                    da weekPlan[oggi] lato cliente, non da un calendario a parte. */}
                <div className="flex gap-1.5">
                  {[["all", "Ogni giorno"], ["on", "Solo ON"], ["off", "Solo OFF"]].map(([id, lab]) => (
                    <button key={id} type="button" onClick={() => updItem(si, ii, "dayType", id)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-data uppercase"
                      style={(it.dayType || "all") === id
                        ? { backgroundColor: "#111111", color: "#FFFFFF" }
                        : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {sec.items.length === 0 && <p className="c-muted text-xs px-1">Nessun integratore in questa fascia oraria.</p>}
          </div>
          <button onClick={() => addItem(si)} className="c-ghost px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"><Plus size={12} /> Integratore</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {availableMoments.map((m) => (
          <button key={m.id} onClick={() => addSection(m)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
            <Plus size={12} /> {m.icon} {m.label}
          </button>
        ))}
        <button onClick={() => addSection(null)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
          <Plus size={12} /> Altro momento
        </button>
        <button onClick={() => setGenSuppsOpen(true)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
          <Sparkles size={12} style={{ color: "#C5A059" }} /> Genera con AI
        </button>
      </div>
      </div>
      {genSuppsOpen && (
        <GenerateAISupplementsModal client={client} hasExisting={supplements.some((s) => s.items.length > 0)}
          onClose={() => setGenSuppsOpen(false)}
          onConfirm={(sections) => { onChange(sections); setGenSuppsOpen(false); }} />
      )}

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
function ClientTimeline({ client, quickTargets, setQuickTargets }) {
  const { supabase, isRealMode, exerciseLib, coachId, clients: CLIENTS, reloadExerciseLib } = useContext(CoachDataContext);
  const myQuickTarget = quickTargets?.[client.id];
  const [weeksByOffset, setWeeksByOffset] = useState(() => ({ 0: makeDefaultWeek(client, 0, myQuickTarget) }));
  const [selOffset, setSelOffset] = useState(0);
  const [section, setSection] = useState("allenamento");
  const [cloned, setCloned] = useState(false);

  // Richiesta esplicita: chi ha solo "Coaching Allenamento" o "Scheda
  // Personalizzata" (piani training-only, senza dieta/integratori inclusi
  // nel servizio) non deve vedere il coach modificare alimentazione o
  // integrazione nell'editor — quella parte resta libero arbitrio del
  // cliente (si imposta macro/integratori da sé lato suo). "full" (Full
  // Coaching Supremo) include tutto e mantiene le 3 sezioni.
  const trainingOnlyPlan = client.plan === "training" || client.plan === "scheda_personalizzata";
  useEffect(() => {
    if (trainingOnlyPlan && section !== "allenamento") setSection("allenamento");
  }, [trainingOnlyPlan, client.id, section]);

  // Template di allenamento riutilizzabili (SCHEMA_v59): salvare la settimana
  // corrente con un nome, e applicarla in un click a uno o più altri
  // clienti (azioni bulk) — a differenza di "Clona Settimana", che resta
  // solo tra settimane dello stesso cliente.
  const [templates, setTemplates] = useState([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [mesocicloCalendarOpen, setMesocicloCalendarOpen] = useState(false);
  const [nutritionCalendarOpen, setNutritionCalendarOpen] = useState(false);
  const loadTemplates = useCallback(() => {
    if (!isRealMode) return;
    fetchWorkoutTemplates(supabase).then(setTemplates).catch((err) => console.error("PERFORM: errore caricamento template", err));
  }, [isRealMode, supabase]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Richiesta esplicita: poter correggere un esercizio già salvato in
  // libreria (nome sbagliato/dimenticato, muscoli da rivedere) o eliminare
  // un doppione — senza che "Salva in libreria" (che fa un upsert per NOME,
  // vedi saveExerciseToLib più sotto in WeekWorkoutEditor) lasci la vecchia
  // voce sbagliata orfana a fianco di quella corretta.
  const [libraryManagerOpen, setLibraryManagerOpen] = useState(false);

  // Bozza AI di settimana di allenamento (Edge Function generate-workout-week,
  // GenerateAIWorkoutModal) — a differenza di "Genera prima scheda" (motore
  // deterministico, solo su settimana vuota), funziona in qualunque momento
  // per rifinire/rinnovare una scheda già esistente.
  const [genAIWorkoutOpen, setGenAIWorkoutOpen] = useState(false);

  // Generazione automatica primo piano (SCHEMA n/a, solo lato client): letta
  // una volta sola l'anamnesi del cliente, per proporre un punto di partenza
  // quando non ha ancora nessuna scheda assegnata — mai per sovrascrivere
  // una scheda già esistente.
  const [anamnesis, setAnamnesis] = useState(null);
  const [genPlanOpen, setGenPlanOpen] = useState(false);
  useEffect(() => {
    if (!isRealMode) return;
    fetchAnamnesis(supabase, client.id).then(setAnamnesis).catch((err) => console.error("PERFORM: errore lettura anamnesi per generazione piano", err));
  }, [isRealMode, supabase, client.id]);

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

  // Autosave (richiesta esplicita): uscire un attimo dall'app mentre si
  // modifica la scheda (per controllare notifiche altrove) e rientrare non
  // deve più far perdere le modifiche non ancora salvate col pulsante
  // esplicito — vedi autosaveTimerRef più sotto. skipNextAutosaveRef evita
  // che il primissimo popolamento di realWorkout (dati appena letti dal DB
  // al mount o al cambio settimana/cliente, non ancora una modifica del
  // coach) faccia scattare un autosalvataggio spurio.
  const skipNextAutosaveRef = useRef(true);
  const autosaveTimerRef = useRef(null);
  const [autosavedAt, setAutosavedAt] = useState(null);
  // BUG PRESO ("modifico le serie, dopo 2s torna come prima"): sia il
  // salvataggio manuale sia l'autosalvataggio fanno save->refetch->
  // setRealWorkout(fresh) — un giro di rete. Se il coach modifica un ALTRO
  // campo (o lo stesso) MENTRE quel giro è in corso, il "fresh" che arriva
  // dopo riflette lo stato di PRIMA della nuova modifica: sovrascrivendolo
  // sempre, la modifica nuova spariva silenziosamente finché non si
  // ripeteva più volte (a volte "vinceva" solo per fortuna di tempismo).
  // realWorkoutRef tiene traccia dello stato PIÙ RECENTE in ogni momento:
  // se al ritorno del refetch non coincide più con l'istantanea salvata,
  // vuol dire che nel frattempo è arrivata una modifica più nuova — quella
  // ha già il proprio ciclo di autosalvataggio in coda, quindi si ignora il
  // "fresh" ormai superato invece di lasciarlo vincere.
  const realWorkoutRef = useRef(realWorkout);
  useEffect(() => { realWorkoutRef.current = realWorkout; }, [realWorkout]);

  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    skipNextAutosaveRef.current = true;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setRealWorkout(null);
    setWorkoutLoading(true);
    setWorkoutError("");
    setWorkoutSaved(false);
    setAutosavedAt(null);
    fetchWeekWorkout(supabase, client.id, weekStartISO, (name) => !exerciseLib[name])
      .then((data) => { if (!cancelled) setRealWorkout(data); })
      .catch((err) => {
        console.error("PERFORM: errore caricamento allenamento reale", err);
        // Il dettaglio tecnico (err.message) resta visibile in coda al
        // messaggio invece di sparire solo nella console — un coach non ha
        // gli strumenti sviluppatore aperti, e senza questo dettaglio un
        // bug come "colonna mancante dopo una migrazione non ancora
        // eseguita" è impossibile da segnalare con precisione.
        if (!cancelled) setWorkoutError(`Non sono riuscito a caricare l'allenamento di questa settimana.${err?.message ? ` (${err.message})` : ""}`);
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

  // resolveDays: stesso passaggio "i nomi in libreria prendono il distretto
  // dalla libreria collettiva" usato sia dal salvataggio manuale sia
  // dall'autosalvataggio — un'unica versione, mai due percorsi che
  // potrebbero disallinearsi.
  const resolveDays = (days) => days.map((day) => day && {
    ...day,
    exercises: day.exercises.map((ex) => (ex.kind === "cardio" ? ex : {
      ...ex,
      muscleTarget: ex.custom ? ex.muscleTarget : resolveMuscleTarget(ex.name, exerciseLib),
      synergists: ex.custom ? ex.synergists : [],
    })),
  });

  const saveWorkout = async () => {
    if (!isRealMode || !realWorkout) return;
    setWorkoutBusy(true);
    setWorkoutError("");
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    const snapshot = realWorkout; // vedi realWorkoutRef sopra: confrontato dopo il refetch
    try {
      const resolved = resolveDays(realWorkout);
      await saveWeekWorkout(supabase, client.id, weekStartISO, resolved, coachId);
      // BUG PRESO: prima si faceva setRealWorkout(resolved), cioè si teneva in
      // stato locale la STESSA copia appena inviata al salvataggio — inclusi
      // gli id finti (uid() lato client) di ogni esercizio appena aggiunto con
      // "+ Esercizio". saveWeekWorkout non restituisce l'id reale assegnato da
      // Supabase all'insert, quindi quell'esercizio restava con un id che non
      // corrispondeva a NESSUNA riga nel database. Al salvataggio SUCCESSIVO
      // (anche solo per un rinomina o un cambio serie altrove nella stessa
      // giornata), quell'id finto non risultava tra gli existingIds letti dal
      // DB: la riga vera veniva cancellata (con CASCADE su workout_sets, le
      // serie già registrate dall'atleta per quell'esercizio) e ricreata da
      // capo con un nuovo id — da qui l'ordine che sembrava "resettarsi" o
      // sganciarsi da quanto visto nell'editor. Rileggendo sempre lo stato
      // vero dal DB dopo ogni salvataggio, l'editor ha SEMPRE gli id reali e
      // l'ordine mostrato è garantito identico a quello che il cliente vede.
      const fresh = await fetchWeekWorkout(supabase, client.id, weekStartISO, (name) => !exerciseLib[name]);
      // Applica il refetch solo se nel frattempo non è arrivata una modifica
      // più recente — altrimenti la ignoriamo (quella modifica ha già
      // innescato il proprio ciclo di autosalvataggio, che la persisterà).
      if (realWorkoutRef.current === snapshot) {
        skipNextAutosaveRef.current = true; // il refetch qui sopra rientra come "dato appena caricato", non una modifica nuova del coach
        setRealWorkout(fresh);
      }
      setWorkoutSaved(true);
      setTimeout(() => setWorkoutSaved(false), 2500);
      notifyClientPlanChange(supabase, client.id, {
        title: "Il tuo coach ha modificato l'allenamento",
        body: "Controlla la scheda: potrebbero esserci esercizi nuovi o cambiati.",
      });
    } catch (err) {
      console.error("PERFORM: errore salvataggio allenamento reale", err);
      setWorkoutError(err.message || "Non sono riuscito a salvare l'allenamento.");
    } finally {
      setWorkoutBusy(false);
    }
  };

  // Autosave vero e proprio (richiesta esplicita, §"non salva quello che ho
  // scritto se esco un attimo dall'app"): 2.5s dopo l'ultima modifica scrive
  // silenziosamente su Supabase, SENZA il toast "✓ Allenamento salvato" e
  // SENZA notificare il cliente ad ogni battitura (notifyClientPlanChange
  // resta riservato al salvataggio esplicito) — serve solo a non perdere
  // lavoro, non a sostituire il pulsante "Salva modifiche" come conferma
  // intenzionale. Se il coach clicca "Salva" prima che scatti, il timer
  // viene cancellato (vedi saveWorkout sopra) per non scrivere due volte.
  useEffect(() => {
    if (!isRealMode || !realWorkout) return undefined;
    if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return undefined; }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const snapshot = realWorkout; // vedi realWorkoutRef sopra: confrontato dopo il refetch
    autosaveTimerRef.current = setTimeout(() => {
      const resolved = resolveDays(snapshot);
      saveWeekWorkout(supabase, client.id, weekStartISO, resolved, coachId)
        // STESSO motivo del refetch in saveWorkout qui sopra: un esercizio
        // appena aggiunto ha ancora un id finto (uid() locale) finché non si
        // rilegge lo stato vero dal DB. Senza questo refetch, l'autosave
        // successivo tratterebbe quell'id finto come "non più esistente" e
        // cancellerebbe/ricreerebbe la riga reale ad ogni ciclo — la stessa
        // causa già trovata e corretta per il salvataggio manuale.
        .then(() => fetchWeekWorkout(supabase, client.id, weekStartISO, (name) => !exerciseLib[name]))
        .then((fresh) => {
          // Stessa guardia del salvataggio manuale: se nel frattempo è
          // arrivata una modifica più recente, questo "fresh" è già
          // superato — non sovrascriverla, la modifica nuova ha già il
          // proprio ciclo di autosalvataggio in coda.
          if (realWorkoutRef.current === snapshot) {
            skipNextAutosaveRef.current = true; // il refetch è "dato appena caricato", non una nuova modifica
            setRealWorkout(fresh);
          }
          setAutosavedAt(Date.now());
        })
        .catch((err) => console.error("PERFORM: errore autosalvataggio allenamento", err));
    }, 2500);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realWorkout]);

  // --- INTEGRATORI REALI --------------------------------------------------
  // BUG PRESO: l'editor partiva SEMPRE da makeDefaultWeek (sezioni finte
  // vuote), mai da quanto davvero salvato in prescribed_supplements — il
  // salvataggio scriveva su Supabase correttamente, ma riaprendo il
  // cliente (nuova sessione, o solo cambiando atleta e tornando indietro)
  // l'editor mostrava di nuovo il finto default, come se non avesse mai
  // salvato nulla. Non è un concetto per-settimana (prescribed_supplements
  // non ha una data): un solo fetch al mount, non per ogni offset.
  const [realSupplements, setRealSupplements] = useState(null); // null = non ancora caricato
  const [suppsLoading, setSuppsLoading] = useState(isRealMode);
  const [suppsError, setSuppsError] = useState("");
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    setSuppsLoading(true);
    fetchPrescribedSupplements(supabase, client.id)
      .then((rows) => {
        if (cancelled) return;
        const byMoment = new Map();
        rows.forEach((r) => {
          if (!byMoment.has(r.moment)) byMoment.set(r.moment, []);
          byMoment.get(r.moment).push(r);
        });
        const canonicalOrder = SUPP_MOMENTS.map((m) => m.id);
        const sections = [...byMoment.entries()]
          .map(([moment, items]) => {
            const known = matchSuppMoment(moment);
            return {
              id: uid(),
              id_ref: known ? known.id : null,
              title: known ? known.label : moment,
              items: items.map((it) => ({ id: it.id, name: it.name, dose: it.dose || "", dayType: it.day_type || "all" })),
            };
          })
          // Stesso ordine canonico che vedrà il cliente (mattina→pomeriggio→
          // pre-wo→post-wo→sera): prima l'editor mostrava i momenti
          // nell'ordine di lettura dal DB (alfabetico), diverso da quello
          // che l'atleta vede davvero — confuso da modificare alla cieca.
          .sort((a, b) => {
            const ia = canonicalOrder.indexOf(a.id_ref ?? ""), ib = canonicalOrder.indexOf(b.id_ref ?? "");
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
        setRealSupplements(sections);
      })
      .catch((err) => {
        console.error("PERFORM: errore lettura protocollo integratori reale", err);
        if (!cancelled) { setSuppsError("Non sono riuscito a caricare il protocollo di questo cliente."); setRealSupplements([]); }
      })
      .finally(() => { if (!cancelled) setSuppsLoading(false); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);

  const supplementsForEditor = isRealMode ? (realSupplements ?? []) : week.supplements;
  const handleSupplementsChange = (nextSupplements) => {
    if (isRealMode) setRealSupplements(nextSupplements);
    else setWeek((w) => ({ ...w, supplements: nextSupplements }));
  };

  // --- DIETA (kcal/macro ON-OFF) REALE ------------------------------------
  // STESSO identico bug preso sopra per gli integratori: WeekDietEditor
  // partiva sempre da makeDefaultWeek. Il salvataggio (assignNutritionTarget)
  // scriveva davvero su nutrition_targets, ma riaprendo il cliente l'editor
  // mostrava di nuovo il target calcolato di default — sembrava che il
  // salvataggio non avesse mai avuto effetto. Non è per-settimana
  // (nutrition_targets non ha un concetto di settimana, solo effective_from):
  // un solo fetch al mount, i pasti (meals) restano locali come prima —
  // nessuna tabella li persiste ancora, è un gap distinto da questo.
  const [realDietTargets, setRealDietTargets] = useState(null); // null = non ancora caricato
  const [dietTargetsLoading, setDietTargetsLoading] = useState(isRealMode);
  useEffect(() => {
    if (!isRealMode) return undefined;
    let cancelled = false;
    setDietTargetsLoading(true);
    fetchBothNutritionTargets(supabase, client.id)
      .then(({ targetOn, targetOff }) => { if (!cancelled) setRealDietTargets({ ON: targetOn, OFF: targetOff }); })
      .catch((err) => { console.error("PERFORM: errore lettura nutrition_targets reali", err); if (!cancelled) setRealDietTargets({ ON: null, OFF: null }); })
      .finally(() => { if (!cancelled) setDietTargetsLoading(false); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);

  // week.diet resta la fonte per i pasti (meals, ancora locali); il target
  // ON/OFF viene sovrascritto con quello reale appena caricato, se esiste
  // già un'assegnazione salvata — altrimenti resta il calcolo di default
  // (un cliente mai assegnato prima deve comunque vedere un punto di
  // partenza sensato, non zero).
  const weekForEditor = (isRealMode && realDietTargets)
    ? {
        ...week,
        diet: {
          ON: { ...week.diet.ON, target: realDietTargets.ON ? { p: realDietTargets.ON.p, c: realDietTargets.ON.c, f: realDietTargets.ON.f } : week.diet.ON.target },
          OFF: { ...week.diet.OFF, target: realDietTargets.OFF ? { p: realDietTargets.OFF.p, c: realDietTargets.OFF.c, f: realDietTargets.OFF.f } : week.diet.OFF.target },
        },
      }
    : week;
  const handleDietChange = (nextWeek) => {
    setWeek(() => nextWeek);
    // La modifica in editor deve riflettersi subito anche nel target "reale"
    // tenuto qui — altrimenti il prossimo giro di weekForEditor la
    // sovrascriverebbe di nuovo con l'ultimo valore fetchato, cancellando
    // la modifica appena fatta prima ancora che l'utente prema Salva.
    if (isRealMode) {
      setRealDietTargets((prev) => ({
        ON: { ...(prev?.ON || {}), ...nextWeek.diet.ON.target },
        OFF: { ...(prev?.OFF || {}), ...nextWeek.diet.OFF.target },
      }));
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
        await cloneWeekWorkout(supabase, client.id, weekStartISO, weekKeyForOffset(nextOffset), coachId);
      } catch (err) {
        console.error("PERFORM: errore clonazione allenamento reale", err);
        setWorkoutError(err.message || "Non sono riuscito a clonare l'allenamento della settimana.");
      } finally {
        setWorkoutBusy(false);
      }
    }
    setSelOffset(nextOffset);
    setCloned(true);
    setTimeout(() => setCloned(false), 2200);
  };

  // Riorganizzato: prima la scelta di COSA editare (allenamento/dieta/
  // integratori), poi — solo per allenamento e dieta, che si programmano
  // davvero nel lungo periodo — la gestione settimane (pillole date,
  // mesociclo, clona settimana). Gli integratori restano un protocollo
  // per la settimana corrente, niente timeline sotto.
  const showWeekManager = section === "allenamento" || section === "dieta";
  const sectionTabs = trainingOnlyPlan
    ? [["allenamento", "Allenamento", Dumbbell]]
    : [["allenamento", "Allenamento", Dumbbell], ["dieta", "Alimentazione", Salad], ["integratori", "Integratori", Pill]];

  return (
    <div>
      {/* Con un solo piano allenamento-only (trainingOnlyPlan) sectionTabs ha
          una sola voce, sempre attiva: una fila di tab tutta nera, larga
          quanto lo schermo, che non fa niente al tocco (non c'è una seconda
          scheda su cui passare) — solo ingombro visivo che lascia intuire
          scelte che non esistono per questo cliente. La mostriamo solo
          quando c'è davvero più di una sezione tra cui scegliere. */}
      {sectionTabs.length > 1 && (
      <div className="grid gap-1.5 mb-5" style={{ gridTemplateColumns: `repeat(${sectionTabs.length}, 1fr)` }}>
        {sectionTabs.map(([id, lab, Ico]) => {
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
      )}

      {showWeekManager && (
      <>
      {/* Vecchia striscia di 7 "pallini" settimana (una per volta, avanti/
          indietro di 7 giorni) rimossa: col Calendario mesociclo qui sotto
          si programma già un intero intervallo in un colpo, e per saltare a
          una settimana precisa basta il vero calendario nativo (input date)
          — scorrere pallini uno a uno per trovarla era solo ingombro. */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <input type="date" aria-label="Vai a una data specifica"
          onChange={(e) => {
            if (!e.target.value) return;
            goTo(offsetForDateISO(e.target.value));
            e.target.value = "";
          }}
          className="c-ghost px-2.5 py-2 rounded-lg text-xs font-data" style={{ colorScheme: "auto" }} />
        <button onClick={() => goTo(0)} className="c-ghost px-3 py-2 rounded-lg text-xs font-data uppercase">Torna a oggi</button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="c-label">Settimana selezionata: {weekRangeLabel(selOffset)} ({selOffset === 0 ? "corrente" : selOffset > 0 ? `+${selOffset} da oggi` : `${Math.abs(selOffset)} fa, storico`})</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* "Clona Settimana" restava l'unico modo di programmare
              l'allenamento/l'alimentazione nel tempo: avanzare di 7 giorni
              alla volta, clonando, mai preciso su un intervallo. Per
              allenamento e alimentazione è sostituito dal Calendario
              mesociclo qui sotto (stesso principio di "Applica split" ma
              sulla bozza corrente, non su uno split salvato) — resta
              invariato solo per gli integratori. */}
          {!((section === "allenamento" || section === "dieta") && isRealMode) && (
            <button onClick={cloneToNext} disabled={selOffset >= MAX_FORWARD_WEEKS || workoutBusy} className="c-btn px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
              <Copy size={14} /> Clona Settimana → {selOffset + 1 === 0 ? "OGGI" : pillDateLabel(selOffset + 1)}
            </button>
          )}
          {section === "allenamento" && isRealMode && (
            <>
              <button onClick={() => setMesocicloCalendarOpen(true)} disabled={!realWorkout || realWorkout.every((d) => !d)}
                className="c-btn px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
                📅 Calendario mesociclo
              </button>
              <button onClick={() => setSaveTemplateOpen(true)} disabled={!realWorkout || realWorkout.every((d) => !d)}
                className="c-ghost px-3.5 py-2.5 rounded-lg text-sm font-medium">
                💾 Salva come split
              </button>
              <button onClick={() => setApplyTemplateOpen(true)} disabled={templates.length === 0}
                className="c-ghost px-3.5 py-2.5 rounded-lg text-sm font-medium">
                📚 Libreria split
              </button>
              <button onClick={() => setLibraryManagerOpen(true)}
                className="c-ghost px-3.5 py-2.5 rounded-lg text-sm font-medium">
                📚 Libreria esercizi
              </button>
              {realWorkout && realWorkout.every((d) => !d) && anamnesis?.sessioni && (
                <button onClick={() => setGenPlanOpen(true)} className="c-btn px-3.5 py-2.5 rounded-lg text-sm font-medium">
                  🪄 Genera prima scheda da anamnesi
                </button>
              )}
              <button onClick={() => setGenAIWorkoutOpen(true)} className="c-ghost px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-1.5">
                <Sparkles size={14} style={{ color: "#C5A059" }} /> Genera bozza con AI
              </button>
            </>
          )}
          {section === "dieta" && isRealMode && (
            <button onClick={() => setNutritionCalendarOpen(true)}
              className="c-btn px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
              📅 Calendario mesociclo
            </button>
          )}
        </div>
      </div>
      {cloned && (
        <p className="spring-in font-data text-xs font-semibold px-3 py-1.5 rounded-md inline-block mb-3" style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857" }}>
          Settimana clonata · rifinisci solo le variazioni
        </p>
      )}
      </>
      )}

      {saveTemplateOpen && (
        <SaveTemplateModal days={realWorkout} coachId={coachId} supabase={supabase}
          onClose={() => setSaveTemplateOpen(false)} onSaved={() => { setSaveTemplateOpen(false); loadTemplates(); }} />
      )}
      {applyTemplateOpen && (
        <ApplyTemplateModal templates={templates} clients={CLIENTS} currentClientId={client.id}
          coachId={coachId} supabase={supabase}
          onClose={() => setApplyTemplateOpen(false)} onDeleted={loadTemplates} />
      )}
      {mesocicloCalendarOpen && (
        <MesocicloCalendarModal days={resolveDays(realWorkout || [])} clientId={client.id} clientName={client.name}
          coachId={coachId} supabase={supabase}
          onClose={() => setMesocicloCalendarOpen(false)}
          onApplied={() => {
            fetchWeekWorkout(supabase, client.id, weekStartISO, (name) => !exerciseLib[name])
              .then(setRealWorkout)
              .catch((err) => console.error("PERFORM: errore ricarica allenamento dopo calendario mesociclo", err));
          }} />
      )}
      {nutritionCalendarOpen && (
        <NutritionMesocicloCalendarModal clientId={client.id} clientName={client.name}
          coachId={coachId} supabase={supabase}
          targetOn={weekForEditor.diet.ON.target} targetOff={weekForEditor.diet.OFF.target}
          onClose={() => setNutritionCalendarOpen(false)}
          onApplied={() => {
            fetchBothNutritionTargets(supabase, client.id)
              .then(({ targetOn, targetOff }) => setRealDietTargets({ ON: targetOn, OFF: targetOff }))
              .catch((err) => console.error("PERFORM: errore ricarica alimentazione dopo calendario mesociclo", err));
          }} />
      )}
      {libraryManagerOpen && (
        <ExerciseLibraryManagerModal supabase={supabase} coachId={coachId}
          exerciseLib={exerciseLib} groupedNames={EX_NAMES_BY_MUSCLE}
          onClose={() => setLibraryManagerOpen(false)} onChanged={reloadExerciseLib} />
      )}
      {genPlanOpen && (
        <GenerateStarterPlanModal anamnesis={anamnesis} exerciseLib={exerciseLib}
          onClose={() => setGenPlanOpen(false)}
          onConfirm={(generated) => { setRealWorkout(generated); setWorkoutSaved(false); setGenPlanOpen(false); }} />
      )}
      {genAIWorkoutOpen && (
        <GenerateAIWorkoutModal client={client} anamnesis={anamnesis} hasExisting={!!realWorkout && !realWorkout.every((d) => !d)}
          onClose={() => setGenAIWorkoutOpen(false)}
          onConfirm={(days) => {
            // Nessun id nella risposta dell'AI (ogni esercizio è "nuovo" per
            // saveWeekWorkout, stesso principio di cloneWeekWorkout): uid()
            // locale, mai un id reale finché il coach non preme "Salva".
            // BUG PRESO: senza "custom" esplicito, ogni esercizio finiva nel
            // <select> a vocabolario chiuso della libreria — se il nome
            // scritto/trascritto dall'AI (fedele al PDF del coach, spesso
            // fuori dalla libreria curata dell'app) non coincideva ESATTAMENTE
            // con un'opzione, il browser mostrava semplicemente la PRIMA voce
            // del menu per ogni riga ("Chest press" ovunque) e al salvataggio
            // resolveDays azzerava muscleTarget a null per quei nomi
            // sconosciuti alla libreria. Solo i nomi che combaciano ESATTAMENTE
            // con una voce di libreria restano nel select; tutti gli altri
            // diventano "esercizio libero" (testo libero), mantenendo nome e
            // muscleTarget/synergists così come li ha scritti l'AI.
            // L'AI scrive la guida (come si esegue/cosa evitare) SOLO alla
            // prima occorrenza di ogni nome esercizio nella settimana (per
            // non sprecare token ripetendo lo stesso paragrafo su ogni
            // giorno in cui compare) — qui la propaghiamo su TUTTE le
            // occorrenze dello stesso nome, così ex.howTo/ex.avoid (letti
            // dal textarea guida più sotto, guideDrafts[ex.id] ?? ex.howTo)
            // la mostrano ovunque compaia, pronta per "Salva in libreria":
            // il coach la rivede e la salva lui stesso, mai in automatico.
            const guideByName = new Map();
            days.forEach((d) => d && d.exercises.forEach((e) => {
              if (e.kind !== "cardio" && (e.howTo || e.avoid) && !guideByName.has(e.name)) {
                guideByName.set(e.name, { howTo: e.howTo || "", avoid: e.avoid || "" });
              }
            }));
            const withIds = days.map((d) => d && {
              ...d,
              exercises: d.exercises.map((e) => (e.kind === "cardio"
                ? { ...e, id: uid() }
                : { ...e, id: uid(), custom: !exerciseLib[e.name], ...(guideByName.get(e.name) || {}) })),
            });
            setRealWorkout(withIds);
            setWorkoutSaved(false);
            setGenAIWorkoutOpen(false);
          }} />
      )}

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
                {!workoutSaved && autosavedAt && (
                  <p className="c-muted text-[11px] mt-2">
                    Bozza salvata automaticamente — puoi uscire dall'app senza perdere le modifiche.
                  </p>
                )}
              </div>
            )}
          </>
        )
      )}
      {section === "dieta" && <WeekDietEditor week={weekForEditor} onChange={handleDietChange} client={client} />}
      {section === "integratori" && (
        isRealMode && suppsLoading ? (
          <p className="c-muted text-sm px-1">Caricamento protocollo…</p>
        ) : (
          <>
            {suppsError && (
              <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
                {suppsError}
              </p>
            )}
            <WeekSuppsEditor supplements={supplementsForEditor} onChange={handleSupplementsChange} client={client} />
          </>
        )
      )}
    </div>
  );
}

/* Salva la settimana di allenamento correntemente aperta come template
   riutilizzabile (SCHEMA_v59) — `days` è già la stessa forma risolta
   (muscleTarget/synergists inclusi) che saveWeekWorkout scrive su Supabase. */
function SaveTemplateModal({ days, coachId, supabase, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Dai un nome allo split."); return; }
    setBusy(true);
    setErr("");
    try {
      await saveWorkoutTemplate(supabase, coachId, trimmed, days);
      onSaved();
    } catch (e) {
      console.error("PERFORM: errore salvataggio split", e);
      setErr("Non sono riuscito a salvare lo split.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-sm">
          <p className="c-heading font-display font-bold mb-3">Salva come split</p>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder='Es. "Push Pull Legs - Base"' className="c-ghost w-full px-3 py-2.5 rounded-lg text-sm mb-3" />
          {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
            <button onClick={save} disabled={busy} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
              {busy ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// Quanti giorni avanti si può spingere il giorno di fine — stesso limite di
// "Clona Settimana" (12 settimane), qui espresso in giorni dato che la
// selezione è ora a data precisa, non più a settimana intera.
const MAX_APPLY_SPLIT_DAYS_AHEAD = MAX_FORWARD_WEEKS * 7;

/* Applica uno split a uno o più clienti insieme (azioni bulk), su un
   intervallo di date PRECISE — giorno di inizio e giorno di fine scelti dal
   coach come una prenotazione volo/hotel, non più settimane intere da
   clonare una per una. Il click su uno split ne mostra anche un'anteprima
   (giorni + nomi esercizi, senza serie/rep) per un colpo d'occhio. */
function ApplyTemplateModal({ templates, clients, currentClientId, coachId, supabase, onClose, onDeleted }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [selectedIds, setSelectedIds] = useState(() => new Set([currentClientId]));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, failed, dayCount }
  const [err, setErr] = useState("");

  const today = toLocalISODate(new Date());
  const maxDate = toLocalISODate(new Date(Date.now() + MAX_APPLY_SPLIT_DAYS_AHEAD * 86400000));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const dayCount = Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000) + 1;

  const toggleClient = (id) => setSelectedIds((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template || selectedIds.size === 0 || dayCount < 1) return;
    setBusy(true);
    setErr("");
    try {
      const outcome = await applyWorkoutSplitToDateRange(supabase, template.days, [...selectedIds], startDate, endDate, coachId);
      setResult(outcome);
    } catch (e) {
      console.error("PERFORM: errore applicazione split", e);
      setErr(e?.message || "Non sono riuscito ad applicare lo split.");
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (id) => {
    if (!window.confirm("Eliminare questo split? L'azione non si può annullare.")) return;
    try {
      await deleteWorkoutTemplate(supabase, id);
      onDeleted();
      if (templateId === id) setTemplateId("");
    } catch (e) {
      console.error("PERFORM: errore eliminazione split", e);
    }
  };

  const previewTemplate = templates.find((t) => t.id === templateId);

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1">Applica split</p>
          <p className="c-muted text-xs mb-3">
            Vale dal giorno di inizio al giorno di fine, compresi — come una prenotazione: scegli le due date e i giorni in mezzo si sistemano da soli, senza clonare settimana per settimana.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex-1">
              <span className="c-label block mb-1">Dal giorno</span>
              <input type="date" value={startDate} min={today} max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (v > endDate) setEndDate(v);
                }}
                className="t-input w-full text-sm rounded-md px-2.5 py-2" />
            </label>
            <label className="flex-1">
              <span className="c-label block mb-1">Al giorno</span>
              <input type="date" value={endDate} min={startDate} max={maxDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="t-input w-full text-sm rounded-md px-2.5 py-2" />
            </label>
          </div>
          <p className="c-muted text-[11px] mb-4">
            {dayCount > 0 ? `${dayCount} ${dayCount === 1 ? "giorno" : "giorni"}` : "intervallo non valido"} — lo split si ripete secondo il giorno della settimana (lunedì dello split → ogni lunedì del periodo, e così via).
          </p>

          <p className="c-label mb-2">Split{previewTemplate ? " — tocca di nuovo per chiudere l'anteprima" : ""}</p>
          <div className="space-y-1.5 mb-4">
            {templates.map((t) => (
              <div key={t.id}>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTemplateId((cur) => (cur === t.id ? "" : t.id))}
                    className="flex-1 text-left px-3 py-2.5 rounded-lg text-sm"
                    style={templateId === t.id ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                    {t.name}
                  </button>
                  <button onClick={() => removeTemplate(t.id)} aria-label={`Elimina split ${t.name}`}
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ border: "1px solid var(--line-strong)" }}>
                    <Trash2 size={14} style={{ color: "#DC2626" }} />
                  </button>
                </div>
                {templateId === t.id && (
                  <div className="mt-1.5 px-3 py-2.5 rounded-lg text-xs space-y-1" style={{ backgroundColor: "var(--surface-2)" }}>
                    {t.days.map((day, i) => (
                      <p key={i}>
                        <span className="font-data uppercase font-semibold">{WEEK_DAYS[i]}</span>
                        {" · "}
                        {day
                          ? <span className="c-muted">{day.exercises.map((e) => e.name).join(", ") || "(nessun esercizio)"}</span>
                          : <span className="c-muted">riposo</span>}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="c-label mb-2">Clienti ({selectedIds.size} selezionati)</p>
          <div className="space-y-1 mb-4" style={{ maxHeight: 220, overflowY: "auto" }}>
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer" style={{ backgroundColor: selectedIds.has(c.id) ? "var(--pill-off-bg)" : "transparent" }}>
                <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleClient(c.id)} />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
          </div>

          {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}
          {result && (
            <p className="text-xs mb-3 font-semibold" style={{ color: result.failed.length ? "#F0A020" : "#047857" }}>
              Applicato a {result.ok.length} client{result.ok.length === 1 ? "e" : "i"} per {result.dayCount} {result.dayCount === 1 ? "giorno" : "giorni"}{result.failed.length ? `, fallito per ${result.failed.length}` : ""}.
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Chiudi</button>
            <button onClick={apply} disabled={busy || !templateId || selectedIds.size === 0 || dayCount < 1}
              className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
              {busy ? "Applico…" : `Applica a ${selectedIds.size}`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* Griglia mensile condivisa dai due Calendario mesociclo (allenamento e
   alimentazione), richiesta esplicita: stesso stile/colori ovunque anche se
   il "coperto" (verde) ha una fonte diversa nei due casi (workout_logs vs
   nutrition_programs, decisa dal chiamante via isCovered). Verde = giorno
   già programmato, blu = giorno passato mai programmato, rosso = giorno
   futuro/oggi ancora da programmare. Puramente presentazionale. */
function MesocicloGrid({ monthCursor, onShiftMonth, todayISO, isCovered, selStart, selEnd, onDayClick }) {
  const monthLabel = monthCursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const gridCells = useMemo(() => {
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunedì=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(toLocalISODate(new Date(y, m, d)));
    return cells;
  }, [monthCursor]);
  const inSelection = (dateISO) => selStart && dateISO >= selStart && dateISO <= (selEnd || selStart);
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onShiftMonth(-1)} className="c-ghost w-8 h-8 rounded-full flex items-center justify-center">‹</button>
        <p className="c-label capitalize">{monthLabel}</p>
        <button onClick={() => onShiftMonth(1)} className="c-ghost w-8 h-8 rounded-full flex items-center justify-center">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["L", "M", "M", "G", "V", "S", "D"].map((lab, i) => (
          <p key={i} className="c-muted text-center text-[10px] font-semibold">{lab}</p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-3">
        {gridCells.map((dateISO, i) => {
          if (!dateISO) return <div key={i} />;
          const covered = isCovered(dateISO);
          const isPast = dateISO < todayISO;
          const bg = covered ? "#10B981" : isPast ? "#3B82F6" : "#EF4444";
          const selected = inSelection(dateISO);
          return (
            <button key={i} onClick={() => onDayClick(dateISO)}
              className="aspect-square rounded-md flex items-center justify-center text-[11px] font-data font-semibold"
              style={{
                backgroundColor: bg, color: "#FFFFFF",
                outline: selected ? "2px solid #111111" : dateISO === todayISO ? "2px solid #C5A059" : "none",
                outlineOffset: -2,
              }}>
              {Number(dateISO.slice(-2))}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="flex items-center gap-1 text-[11px] c-muted"><span className="rounded-full inline-block" style={{ width: 8, height: 8, backgroundColor: "#10B981" }} /> programmato</span>
        <span className="flex items-center gap-1 text-[11px] c-muted"><span className="rounded-full inline-block" style={{ width: 8, height: 8, backgroundColor: "#3B82F6" }} /> passato</span>
        <span className="flex items-center gap-1 text-[11px] c-muted"><span className="rounded-full inline-block" style={{ width: 8, height: 8, backgroundColor: "#EF4444" }} /> da programmare</span>
      </div>
    </>
  );
}

/* Calendario mesociclo: applica la settimana ATTUALMENTE aperta
   nell'editor (bozza corrente, non necessariamente ancora salvata con
   "Salva") a un intervallo di date preciso per questo cliente — sostituisce
   "Clona Settimana" per l'allenamento. Stessa griglia colorata mensile di
   Alimentazione (MesocicloGrid, richiesta esplicita: stesso stile), verde
   qui = esiste già almeno un esercizio assegnato quel giorno
   (fetchWorkoutProgrammedDates) — più due input data espliciti "Dal
   giorno"/"Al giorno" sincronizzati con la griglia, così la selezione
   dell'intervallo resta sempre inequivocabile anche con un solo tocco.
   Stessa applyWorkoutSplitToDateRange già usata da "Libreria split": qui la
   sorgente è la bozza corrente invece di uno split salvato. */
function MesocicloCalendarModal({ days, clientId, clientName, coachId, supabase, onClose, onApplied }) {
  const todayISO = toLocalISODate();
  const maxDateISO = toLocalISODate(new Date(Date.now() + MAX_APPLY_SPLIT_DAYS_AHEAD * 86400000));
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [programmedDates, setProgrammedDates] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [selStart, setSelStart] = useState(todayISO);
  const [selEnd, setSelEnd] = useState(todayISO);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, failed, dayCount }
  const [err, setErr] = useState("");

  const loadProgrammed = useCallback(() => {
    setLoading(true);
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const fromISO = toLocalISODate(new Date(y, m, 1));
    const toISO = toLocalISODate(new Date(y, m + 1, 0));
    fetchWorkoutProgrammedDates(supabase, clientId, fromISO, toISO)
      .then(setProgrammedDates)
      .catch((err) => console.error("PERFORM: errore lettura giorni allenamento programmati", err))
      .finally(() => setLoading(false));
  }, [supabase, clientId, monthCursor]);
  useEffect(() => { loadProgrammed(); }, [loadProgrammed]);

  // A differenza della griglia Alimentazione (parte "vuota", nessun default
  // sensato per le calorie), qui selStart/selEnd restano sempre validi
  // (default "solo oggi"): un tap ridefinisce l'estremo più vicino alla
  // data toccata, così un solo tocco sposta subito l'intervallo invece di
  // dover sempre toccarne due.
  const handleDayClick = (dateISO) => {
    setResult(null);
    if (dateISO < selStart) { setSelStart(dateISO); }
    else if (dateISO > selEnd) { setSelEnd(dateISO); }
    else { setSelStart(dateISO); setSelEnd(dateISO); }
  };

  const dayCount = Math.round((new Date(`${selEnd}T00:00:00`) - new Date(`${selStart}T00:00:00`)) / 86400000) + 1;

  const apply = async () => {
    if (dayCount < 1) return;
    setBusy(true);
    setErr("");
    try {
      const outcome = await applyWorkoutSplitToDateRange(supabase, days, [clientId], selStart, selEnd, coachId);
      setResult(outcome);
      if (outcome.failed.length === 0) { loadProgrammed(); onApplied(); }
    } catch (e) {
      console.error("PERFORM: errore applicazione calendario mesociclo", e);
      setErr(e?.message || "Non sono riuscito a programmare l'allenamento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1">📅 Calendario mesociclo</p>
          <p className="c-muted text-xs mb-3">
            Programma questa scheda per {clientName} dal giorno di inizio al giorno di fine, compresi — come una prenotazione: i giorni in mezzo si sistemano da soli secondo il giorno della settimana (lunedì di questa scheda → ogni lunedì del periodo, e così via). Tocca due giorni sulla griglia o scrivi le date qui sotto.
          </p>

          <MesocicloGrid monthCursor={monthCursor} onShiftMonth={(d) => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + d, 1))}
            todayISO={todayISO} isCovered={(dateISO) => programmedDates.has(dateISO)}
            selStart={selStart} selEnd={selEnd} onDayClick={handleDayClick} />
          {loading && <p className="c-muted text-[11px] mb-2">Carico programmazione…</p>}

          <div className="flex items-center gap-2 mb-2">
            <label className="flex-1">
              <span className="c-label block mb-1">Dal giorno</span>
              <input type="date" value={selStart} max={maxDateISO}
                onChange={(e) => { const v = e.target.value; setSelStart(v); if (v > selEnd) setSelEnd(v); setResult(null); }}
                className="t-input w-full text-sm rounded-md px-2.5 py-2" />
            </label>
            <label className="flex-1">
              <span className="c-label block mb-1">Al giorno</span>
              <input type="date" value={selEnd} min={selStart} max={maxDateISO}
                onChange={(e) => { setSelEnd(e.target.value); setResult(null); }}
                className="t-input w-full text-sm rounded-md px-2.5 py-2" />
            </label>
          </div>
          <p className="c-muted text-[11px] mb-4">
            {dayCount > 0 ? `${dayCount} ${dayCount === 1 ? "giorno" : "giorni"}` : "intervallo non valido"}. Puoi programmare anche mesocicli futuri in anticipo, o riaprire e rivedere un intervallo passato.
          </p>

          {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}
          {result && (
            <p className="text-xs mb-3 font-semibold" style={{ color: result.failed.length ? "#DC2626" : "#047857" }}>
              {result.failed.length
                ? "Non sono riuscito a programmare l'allenamento per l'intervallo scelto."
                : `Programmato per ${result.dayCount} ${result.dayCount === 1 ? "giorno" : "giorni"}.`}
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Chiudi</button>
            <button onClick={apply} disabled={busy || dayCount < 1}
              className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
              {busy ? "Programmo…" : "Programma"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* Alimentazione: stesso principio di "Calendario mesociclo" per l'allenamento,
   stessa griglia colorata (MesocicloGrid) — verde = giorno già programmato
   (SCHEMA_v86, nutrition_programs), blu = giorno passato mai programmato,
   rosso = giorno futuro/oggi ancora senza programmazione. BUG PRESO
   (segnalato): con la sola griglia a tap, chi toccava un solo giorno e
   premeva subito "Programma" senza rendersi conto che serviva un secondo
   tocco per il giorno di fine programmava un giorno alla volta credendo di
   dover ripetere l'operazione ogni giorno — ora due input data espliciti
   "Dal giorno"/"Al giorno", sincronizzati con la griglia, rendono sempre
   visibile l'intervallo davvero selezionato. Applica sempre la bozza ON/OFF
   corrente dell'editor (targetOn/targetOff, non ancora necessariamente
   salvata). A differenza di nutrition_targets (log a tempo indeterminato),
   qui la programmazione termina davvero a end_date — vedi
   fetchBothNutritionTargets in coachingData.js, che controlla prima
   nutrition_programs e solo poi ripiega sul vecchio sistema. */
function NutritionMesocicloCalendarModal({ clientId, clientName, coachId, supabase, targetOn, targetOff, onClose, onApplied }) {
  const todayISO = toLocalISODate();
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const loadPrograms = useCallback(() => {
    setLoading(true);
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const fromISO = toLocalISODate(new Date(y, m, 1));
    const toISO = toLocalISODate(new Date(y, m + 1, 0));
    fetchNutritionProgramsRange(supabase, clientId, fromISO, toISO)
      .then(setPrograms)
      .catch((err) => console.error("PERFORM: errore lettura programmazione alimentazione", err))
      .finally(() => setLoading(false));
  }, [supabase, clientId, monthCursor]);
  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const isCovered = (dateISO) => programs.some((p) => p.start_date <= dateISO && p.end_date >= dateISO);

  const handleDayClick = (dateISO) => {
    setResult(null);
    if (!selStart || selEnd) {
      setSelStart(dateISO);
      setSelEnd(null);
    } else if (dateISO < selStart) {
      setSelStart(dateISO);
    } else {
      setSelEnd(dateISO);
    }
  };

  const dayCount = selStart
    ? Math.round((new Date(`${selEnd || selStart}T00:00:00`) - new Date(`${selStart}T00:00:00`)) / 86400000) + 1
    : 0;

  const kcalOn = targetOn ? kcalFromMacros(targetOn.p, targetOn.c, targetOn.f) : 0;
  const kcalOff = targetOff ? kcalFromMacros(targetOff.p, targetOff.c, targetOff.f) : 0;
  const hasTargets = kcalOn > 0 && kcalOff > 0;

  const apply = async () => {
    if (!selStart || !hasTargets) return;
    const startDate = selStart;
    const endDate = selEnd || selStart;
    setBusy(true);
    setErr("");
    try {
      await applyNutritionProgramToDateRange(supabase, clientId, startDate, endDate,
        { kcal: kcalOn, p: targetOn.p, c: targetOn.c, f: targetOn.f },
        { kcal: kcalOff, p: targetOff.p, c: targetOff.c, f: targetOff.f },
        coachId);
      setResult({ dayCount });
      setSelStart(null);
      setSelEnd(null);
      loadPrograms();
      onApplied();
    } catch (e) {
      console.error("PERFORM: errore programmazione alimentazione", e);
      setErr(e?.message || "Non sono riuscito a programmare l'alimentazione.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1">📅 Calendario mesociclo</p>
          <p className="c-muted text-xs mb-3">
            Programma le calorie ON/OFF correnti per {clientName} su un intervallo preciso: tocca due giorni sulla griglia o scrivi le date qui sotto. Superata la data di fine la programmazione termina davvero, a differenza del vecchio sistema.
          </p>

          {!hasTargets && (
            <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
              Imposta prima le macro ON e OFF qui sotto: senza target non c'è nulla da programmare.
            </p>
          )}

          <MesocicloGrid monthCursor={monthCursor} onShiftMonth={(d) => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + d, 1))}
            todayISO={todayISO} isCovered={isCovered}
            selStart={selStart} selEnd={selEnd} onDayClick={handleDayClick} />
          {loading && <p className="c-muted text-[11px] mb-2">Carico programmazione…</p>}

          <div className="flex items-center gap-2 mb-2">
            <label className="flex-1">
              <span className="c-label block mb-1">Dal giorno</span>
              <input type="date" value={selStart || ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setSelStart(v);
                  if (v && selEnd && v > selEnd) setSelEnd(v);
                  setResult(null);
                }}
                className="t-input w-full text-sm rounded-md px-2.5 py-2" />
            </label>
            <label className="flex-1">
              <span className="c-label block mb-1">Al giorno</span>
              <input type="date" value={selEnd || selStart || ""} min={selStart || undefined} disabled={!selStart}
                onChange={(e) => { setSelEnd(e.target.value || null); setResult(null); }}
                className="t-input w-full text-sm rounded-md px-2.5 py-2 disabled:opacity-50" />
            </label>
          </div>

          <p className="c-muted text-[11px] mb-4">
            {selStart
              ? `${selStart}${selEnd ? ` → ${selEnd}` : ""} · ${dayCount} ${dayCount === 1 ? "giorno" : "giorni"}`
              : "Tocca un giorno sulla griglia o scrivi la data di inizio."}
          </p>

          {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}
          {result && (
            <p className="text-xs mb-3 font-semibold" style={{ color: "#047857" }}>
              Programmato per {result.dayCount} {result.dayCount === 1 ? "giorno" : "giorni"}.
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Chiudi</button>
            <button onClick={apply} disabled={busy || !selStart || !hasTargets}
              className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
              {busy ? "Programmo…" : "Programma"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* Libreria esercizi: TUTTI gli esercizi del catalogo (i ~20 di base +
   quelli personalizzati salvati nel tempo), raggruppati per muscolo nello
   stesso ordine del menu a tendina dell'editor (EX_NAMES_BY_MUSCLE, passato
   dal chiamante) — non più solo i personalizzati come "Correggi libreria"
   prima. Da qui si corregge muscoli/guida di QUALUNQUE esercizio (upsert
   per nome, come "Salva in libreria" nella riga), si aggiungono esercizi
   nuovi, e si rinomina/elimina un esercizio personalizzato — i ~20 di base
   restano fissi nel codice (DEFAULT_EXERCISE_LIB): si possono correggere ma
   non rinominare/eliminare, altrimenti ricomparirebbero comunque uguali al
   prossimo caricamento. Nessun fetch proprio: usa exerciseLib/groupedNames
   già caricati dal chiamante, sempre in sync con l'editor. */
function ExerciseLibraryManagerModal({ supabase, coachId, exerciseLib, groupedNames, onClose, onChanged }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // {name, direct, indirect, howTo, avoid, videoUrl, isCustom, isNew}

  const isCustomName = (name) => !(name in DEFAULT_EXERCISE_LIB);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groupedNames;
    return groupedNames
      .map(([muscle, names]) => [muscle, names.filter((n) => n.toLowerCase().includes(q))])
      .filter(([, names]) => names.length > 0);
  }, [groupedNames, query]);

  const openEntry = (name) => {
    const e = exerciseLib[name] || {};
    setEditing({
      name, direct: e.direct || [], indirect: e.indirect || [],
      howTo: e.howTo || "", avoid: e.avoid || "", videoUrl: e.videoUrl || "",
      isCustom: isCustomName(name), isNew: false,
    });
  };
  const openNew = () => setEditing({ name: "", direct: [], indirect: [], howTo: "", avoid: "", videoUrl: "", isCustom: true, isNew: true });

  const handleSaved = () => { onChanged(); setEditing(null); };
  const handleDeleted = () => { onChanged(); setEditing(null); };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={editing ? undefined : onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          {editing ? (
            <ExerciseLibraryEditForm supabase={supabase} coachId={coachId} entry={editing}
              onBack={() => setEditing(null)} onSaved={handleSaved} onDeleted={handleDeleted} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="c-heading font-display font-bold">Libreria esercizi</p>
                <button onClick={onClose} aria-label="Chiudi" className="p-1"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
              </div>
              <p className="c-muted text-xs mb-3">
                Tutti gli esercizi del catalogo, per gruppo muscolare — tocca per correggere muscoli/guida, rinominare o eliminare.
              </p>
              <button onClick={openNew} className="c-btn w-full px-4 py-2.5 rounded-lg text-sm font-medium mb-3">+ Nuovo esercizio</button>
              <div className="relative mb-3">
                <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--ink-tertiary)" }} />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca per nome…" className="c-ghost w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" />
              </div>
              {filteredGroups.length === 0 ? (
                <p className="c-muted text-sm">Nessun risultato.</p>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {filteredGroups.map(([muscle, names]) => (
                    <div key={muscle} className="mb-2.5">
                      <p className="c-label mb-1">{muscle}</p>
                      <div className="space-y-1.5">
                        {names.map((n) => (
                          <button key={n} onClick={() => openEntry(n)}
                            className="w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 t-inner">
                            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{n}</span>
                            {!isCustomName(n) && <span className="c-muted text-[10px] shrink-0">base</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={onClose} className="c-ghost w-full px-4 py-2.5 rounded-lg text-sm font-medium mt-3">Chiudi</button>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

function ExerciseLibraryEditForm({ supabase, coachId, entry, onBack, onSaved, onDeleted }) {
  const [name, setName] = useState(entry.name);
  const [muscleTarget, setMuscleTarget] = useState(EXERCISE_LIB_MUSCLE_TO_DB[entry.direct[0]] || entry.direct[0] || "");
  // Richiesta esplicita: molti esercizi (dip, chin-up, squat, affondi, stacco
  // rumeno, hip thrust...) sfiniscono DUE gruppi muscolari entrambi al 100%
  // per la stessa serie, non uno diretto + sinergici al 50% — direct è già
  // un array in DB (computeVolume itera OGNI elemento al 100%), qui basta
  // un secondo select opzionale invece del solo primo.
  const [muscleTarget2, setMuscleTarget2] = useState(
    entry.direct[1] ? (EXERCISE_LIB_MUSCLE_TO_DB[entry.direct[1]] || entry.direct[1]) : ""
  );
  const [synergists, setSynergists] = useState((entry.indirect || []).map((m) => EXERCISE_LIB_MUSCLE_TO_DB[m] || m));
  const [howTo, setHowTo] = useState(entry.howTo || "");
  const [avoid, setAvoid] = useState(entry.avoid || "");
  const [videoUrl, setVideoUrl] = useState(entry.videoUrl || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteRef = useRef(null);
  useEffect(() => () => clearTimeout(deleteRef.current), []);
  // Un esercizio di base (DEFAULT_EXERCISE_LIB, fisso nel codice) non ha una
  // riga propria da rinominare/eliminare — ricomparirebbe comunque identico
  // al prossimo caricamento. Si può solo correggerne muscoli/guida (upsert
  // per nome, stesso meccanismo di "Salva in libreria").
  const canRenameOrDelete = entry.isCustom && !entry.isNew;

  const toggleSynergist = (m) => setSynergists((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Il nome non può essere vuoto."); return; }
    if (!muscleTarget) { setErr("Scegli il distretto muscolare diretto."); return; }
    setBusy(true);
    setErr("");
    const direct = [DB_MUSCLE_TO_CHART[muscleTarget] || muscleTarget];
    if (muscleTarget2) direct.push(DB_MUSCLE_TO_CHART[muscleTarget2] || muscleTarget2);
    const indirect = synergists.map((m) => DB_MUSCLE_TO_CHART[m] || m);
    try {
      if (canRenameOrDelete && trimmed !== entry.name) {
        // Vera rinomina di una riga già presente in DB.
        await updateExerciseLibraryEntry(supabase, entry.name, { name: trimmed, direct, indirect, howTo, avoid, videoUrl });
      } else {
        // Nome invariato (o esercizio nuovo/di base senza ancora una riga
        // propria): upsert per nome, mai un doppione — stesso meccanismo di
        // "Salva in libreria" nella riga dell'editor.
        await saveExerciseGuide(supabase, trimmed, direct, indirect, { howTo, avoid, videoUrl }, coachId);
      }
      onSaved();
    } catch (e) {
      console.error("PERFORM: errore correzione esercizio in libreria", e);
      setErr(e?.message || "Non sono riuscito a salvare le modifiche.");
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      deleteRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    clearTimeout(deleteRef.current);
    setBusy(true);
    setErr("");
    try {
      await deleteExerciseFromLibrary(supabase, entry.name);
      onDeleted();
    } catch (e) {
      console.error("PERFORM: errore eliminazione esercizio da libreria", e);
      setErr(e?.message || "Non sono riuscito a eliminare l'esercizio.");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} aria-label="Indietro" className="p-1"><ArrowLeft size={18} style={{ color: "var(--ink-2)" }} /></button>
        <p className="c-heading font-display font-bold">{entry.isNew ? "Nuovo esercizio" : "Correggi esercizio"}</p>
      </div>
      <label className="block mb-3">
        <span className="c-label block mb-1">Nome</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!entry.isNew && !canRenameOrDelete}
          className="t-input w-full text-sm rounded-md px-2.5 py-2 disabled:opacity-60" />
        {!entry.isNew && !canRenameOrDelete && (
          <p className="c-muted text-[11px] mt-1">Fa parte del catalogo base dell'app — nome non modificabile, solo muscoli e guida.</p>
        )}
      </label>
      <label className="block mb-3">
        <span className="c-label block mb-1">Distretto muscolare (diretto, 100%)</span>
        <select value={muscleTarget}
          onChange={(e) => {
            setMuscleTarget(e.target.value);
            if (e.target.value === muscleTarget2) setMuscleTarget2("");
          }}
          className="t-input w-full text-sm rounded-md px-2.5 py-2">
          <option value="">— scegli —</option>
          {MUSCLE_TARGETS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {muscleTarget && (
        <label className="block mb-3">
          <span className="c-label block mb-1">2° distretto al 100% (opzionale)</span>
          <select value={muscleTarget2} onChange={(e) => setMuscleTarget2(e.target.value)} className="t-input w-full text-sm rounded-md px-2.5 py-2">
            <option value="">— nessuno —</option>
            {MUSCLE_TARGETS.filter((m) => m !== muscleTarget).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <p className="c-muted text-[11px] mt-1">
            Per esercizi che sfiniscono due gruppi muscolari insieme (dip, chin-up, squat, affondi, stacco rumeno, hip thrust...): entrambi contano al 100% per la stessa serie, non al 50%.
          </p>
        </label>
      )}
      {muscleTarget && (
        <div className="mb-3">
          <span className="c-label block mb-1">Muscoli sinergici (indiretto, opzionale)</span>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_TARGETS.filter((m) => m !== muscleTarget && m !== muscleTarget2).map((m) => {
              const active = synergists.includes(m);
              return (
                <button key={m} type="button" onClick={() => toggleSynergist(m)}
                  className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${active ? "bg-[var(--ink)] border-[var(--ink)]" : "c-ghost border-[var(--line)]"}`}
                  style={active ? { color: "var(--page)" } : undefined}>
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="block mb-3">
        <span className="c-label block mb-1">Come si esegue (opzionale)</span>
        <textarea value={howTo} rows={2} onChange={(e) => setHowTo(e.target.value)}
          placeholder="Setup, esecuzione, respirazione..." className="t-input w-full text-sm rounded-md px-2.5 py-2" />
      </label>
      <label className="block mb-3">
        <span className="c-label block mb-1">Cosa evitare (opzionale)</span>
        <textarea value={avoid} rows={2} onChange={(e) => setAvoid(e.target.value)}
          placeholder="Errori tecnici comuni da correggere..." className="t-input w-full text-sm rounded-md px-2.5 py-2" />
      </label>
      <label className="block mb-4">
        <span className="c-label block mb-1">Link video esecuzione (opzionale)</span>
        <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://..." className="t-input w-full text-sm rounded-md px-2.5 py-2" />
      </label>
      {err && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{err}</p>}
      <div className="flex gap-2 mb-2">
        <button onClick={onBack} disabled={busy} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
        <button onClick={save} disabled={busy} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
          {busy ? "Salvo…" : entry.isNew ? "Aggiungi" : "Salva modifiche"}
        </button>
      </div>
      {canRenameOrDelete && (
        <button onClick={requestDelete} disabled={busy}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ border: confirmDelete ? "1px solid #DC2626" : "1px solid var(--line-strong)", color: confirmDelete ? "#DC2626" : "var(--ink-2)" }}>
          {confirmDelete ? "Tocca di nuovo per confermare — elimina per sempre" : "🗑 Elimina questo esercizio dalla libreria"}
        </button>
      )}
    </>
  );
}

/* Anteprima + conferma della scheda generata da anamnesi — carica solo
   nell'editor (setRealWorkout nel chiamante), il coach deve comunque
   premere "Salva" per scriverla su Supabase: mai un piano assegnato senza
   revisione. */
function GenerateStarterPlanModal({ anamnesis, exerciseLib, onClose, onConfirm }) {
  const sessions = Number(anamnesis?.sessioni) || 3;
  const level = anamnesis?.livello || null;
  const goal = anamnesis?.obiettivoPrinc || null;
  const week = useMemo(() => generateStarterWeek({ sessions, level, goal, exerciseLib }), [sessions, level, goal, exerciseLib]);
  const trainingDays = week.filter(Boolean);

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1">Genera prima scheda</p>
          <p className="c-muted text-xs mb-4">
            Da anamnesi: {sessions} sessioni/settimana{level ? ` · livello ${level}` : ""}{goal ? ` · obiettivo ${goal}` : ""}.
            Punto di partenza da rifinire — non viene salvato finché non premi "Salva" nell'editor.
          </p>
          <div className="space-y-2 mb-4">
            {trainingDays.map((day, i) => (
              <div key={i} className="t-inner px-3 py-2.5">
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>{day.label}</p>
                <p className="c-muted text-xs">{day.exercises.map((e) => e.name).join(" · ")}</p>
                {(day.warmup || day.stretching) && (
                  <p className="c-muted text-[10px] mt-1">🔥 Riscaldamento + 🧘 Stretching inclusi — rivedibili nell'editor</p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
            <button onClick={() => onConfirm(week)} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
              Carica nell'editor
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// Bozza AI di settimana di allenamento (Edge Function generate-workout-week):
// a differenza di GenerateStarterPlanModal (motore deterministico, solo per
// la primissima scheda mai assegnata), questa chiama Claude e funziona in
// qualunque momento — anche per rifinire/rinnovare una scheda già esistente.
// Stesso principio "bozza modificabile, mai salvata da sola" del resto
// dell'editor: onConfirm carica solo lo stato locale, il coach preme
// "Salva" come per qualunque altra modifica manuale.
// Legge un File come base64 puro (senza il prefisso "data:...;base64,"),
// come richiesto dal blocco "document" dell'API Claude — stesso pattern
// già in uso altrove nell'app per gli allegati (conversione lato client,
// mai un upload a uno storage intermedio per un file che serve solo per
// questa singola chiamata).
// Sotto il limite di 32MB richiesta di Claude per i documenti e con margine
// per l'overhead base64 (~33%) sul body JSON inviato all'Edge Function —
// un PDF scansionato/fotografato dal telefono può superarlo facilmente.
const MAX_PDF_UPLOAD_BYTES = 15 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function GenerateAIWorkoutModal({ client, anamnesis, hasExisting, onClose, onConfirm }) {
  const { supabase } = useContext(CoachDataContext);
  // "generate" = da zero sui dati anamnesi/cliente (comportamento originale).
  // "import" = il coach ha già scritto la scheda a mano o in un PDF: l'AI la
  // trascrive nel formato dell'editor invece di progettarla lei stessa.
  const [mode, setMode] = useState("generate");
  const [notes, setNotes] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null); // { days } una volta generata

  const canGenerate = mode === "generate" || sourceText.trim() || pdfFile;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      let result;
      if (mode === "import") {
        // Un PDF scansionato/fotografato dal telefono può facilmente superare
        // il limite di payload dell'Edge Function — se succede, senza questo
        // controllo il coach non riceve un errore chiaro ma una bozza "a
        // caso" (vedi guardia lato server più sotto). Meglio bloccare qui,
        // prima della lenta conversione base64, con un messaggio azionabile.
        if (pdfFile && pdfFile.size > MAX_PDF_UPLOAD_BYTES) {
          setError(`Il PDF è troppo grande (${(pdfFile.size / 1024 / 1024).toFixed(1)} MB, limite ${MAX_PDF_UPLOAD_BYTES / 1024 / 1024} MB) — comprimilo o dividilo in due parti e riprova.`);
          setLoading(false);
          return;
        }
        const sourcePdfBase64 = pdfFile ? await readFileAsBase64(pdfFile) : undefined;
        result = await generateWorkoutWeekDraft(supabase, { mode: "import", sourceText: sourceText.trim(), sourcePdfBase64, notes });
      } else {
        const clientContext = {
          nome: client.fullName || client.name,
          obiettivo: client.goal || anamnesis?.obiettivoPrinc || null,
          livello: anamnesis?.livello || null,
          sessioniSettimanali: Number(anamnesis?.sessioni) || null,
          doloreSegnalato: client.evening?.doloreGrado > 0
            ? { grado: client.evening.doloreGrado, nota: client.evening.doloreNota || null } : null,
          prs: client.prs || null,
          piano: client.plan,
        };
        result = await generateWorkoutWeekDraft(supabase, { mode: "generate", clientContext, notes });
      }
      setDraft(result);
    } catch (e) {
      console.error("PERFORM: errore generazione bozza AI allenamento", e);
      let friendly = "Non sono riuscito a generare una bozza. Riprova tra poco.";
      try {
        const body = await e?.context?.json?.();
        if (body?.error) friendly = body.error;
      } catch { /* mantieni il messaggio generico */ }
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const trainingDays = (draft?.days || []).filter(Boolean);

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1 flex items-center gap-2">
            <Sparkles size={16} style={{ color: "#C5A059" }} /> Genera bozza con AI
          </p>
          <p className="c-muted text-xs mb-4">
            {mode === "generate"
              ? `Basata su obiettivo, livello e dolori/infortuni segnalati per ${client.fullName || client.name}.`
              : "L'AI trascrive fedelmente la scheda che hai già scritto — non ne inventa una nuova."}
            {hasExisting ? " Sostituirà la scheda di questa settimana finché non premi \"Salva\"." : ""}
          </p>

          {!draft && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setMode("generate")} className="rounded-lg px-3 py-2 text-xs font-medium"
                  style={mode === "generate" ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                  Genera da anamnesi
                </button>
                <button onClick={() => setMode("import")} className="rounded-lg px-3 py-2 text-xs font-medium"
                  style={mode === "import" ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
                  Incolla o carica scheda
                </button>
              </div>

              {mode === "import" && (
                <>
                  <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={5}
                    placeholder="Incolla qui la scheda scritta a mano (esercizi, serie, ripetizioni, recupero)…"
                    className="w-full rounded-lg px-3 py-2.5 text-sm mb-2" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)" }} />
                  <label className="c-ghost w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium mb-3 cursor-pointer">
                    <FileText size={14} /> {pdfFile ? pdfFile.name : "…oppure carica un PDF"}
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                  </label>
                </>
              )}

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={mode === "import" ? 2 : 3}
                placeholder={mode === "import"
                  ? "Note facoltative (es. \"il giorno 3 è nuovo, aggiungilo tu con lo stesso stile\")…"
                  : "Note facoltative per l'AI (es. priorità su un distretto, attrezzatura disponibile, preferenze)…"}
                className="w-full rounded-lg px-3 py-2.5 text-sm mb-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)" }} />
              {error && (
                <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>{error}</p>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} disabled={loading} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
                <button onClick={generate} disabled={loading || !canGenerate} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  {loading ? "Genero…" : "Genera"}
                </button>
              </div>
            </>
          )}

          {draft && (
            <>
              <div className="space-y-2 mb-4">
                {trainingDays.map((day, i) => (
                  <div key={i} className="t-inner px-3 py-2.5">
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>{day.label}</p>
                    <p className="c-muted text-xs">{day.exercises.map((e) => e.name).join(" · ")}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDraft(null)} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Rigenera</button>
                <button onClick={() => onConfirm(draft.days)} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  Carica nell'editor
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

// Bozza AI di pasti (WeekDietEditor, editor alimentazione): riempie i pasti
// per raggiungere il target macro che il coach ha GIÀ impostato — mai
// tocca il target stesso, solo i pasti. FOOD_DB (module-level, ~100 voci)
// è il vocabolario alimenti consentito, passato all'Edge Function nel
// corpo della richiesta.
function GenerateAINutritionModal({ client, week, onClose, onConfirm }) {
  const { supabase } = useContext(CoachDataContext);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null); // { ON, OFF }

  const hasTargetOn = kcalFromMacros(week.diet.ON.target.p, week.diet.ON.target.c, week.diet.ON.target.f) > 0;
  const hasTargetOff = kcalFromMacros(week.diet.OFF.target.p, week.diet.OFF.target.c, week.diet.OFF.target.f) > 0;
  const canGenerate = hasTargetOn || hasTargetOff;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const clientContext = {
        nome: client.fullName || client.name,
        cibiPreferiti: client.foodLikes || [],
        cibiNonGraditi: client.foodDislikes || [],
        targetOn: hasTargetOn ? week.diet.ON.target : null,
        targetOff: hasTargetOff ? week.diet.OFF.target : null,
      };
      const result = await generateNutritionWeekDraft(supabase, { clientContext, notes, foodDb: FOOD_DB });
      setDraft(result);
    } catch (e) {
      console.error("PERFORM: errore generazione bozza AI alimentazione", e);
      let friendly = "Non sono riuscito a generare una bozza. Riprova tra poco.";
      try {
        const body = await e?.context?.json?.();
        if (body?.error) friendly = body.error;
      } catch { /* mantieni il messaggio generico */ }
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1 flex items-center gap-2">
            <Sparkles size={16} style={{ color: "#C5A059" }} /> Genera pasti con AI
          </p>
          <p className="c-muted text-xs mb-4">
            Riempie i pasti per raggiungere il target macro già impostato (giorno ON e/o OFF), rispettando gusti e cibi non graditi.
          </p>
          {!canGenerate && (
            <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(240,160,32,0.12)", color: "#92400E", fontWeight: 500 }}>
              Imposta prima almeno un target (kcal/macro) qui sopra — serve un numero da raggiungere.
            </p>
          )}

          {!draft && (
            <>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder='Note facoltative (es. "più carboidrati la sera", "pochi latticini")…'
                className="w-full rounded-lg px-3 py-2.5 text-sm mb-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)" }} />
              {error && (
                <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>{error}</p>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} disabled={loading} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
                <button onClick={generate} disabled={loading || !canGenerate} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  {loading ? "Genero…" : "Genera"}
                </button>
              </div>
            </>
          )}

          {draft && (
            <>
              <div className="space-y-3 mb-4">
                {["ON", "OFF"].filter((p) => draft[p]).map((p) => (
                  <div key={p}>
                    <p className="c-label mb-1.5">{p === "ON" ? "🏋️ Giorno ON" : "🧘 Giorno OFF"}</p>
                    <div className="space-y-1.5">
                      {draft[p].meals.map((m, i) => (
                        <div key={i} className="t-inner px-3 py-2.5">
                          <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--ink)" }}>{m.name} <span className="c-muted font-normal">· {m.time}</span></p>
                          <p className="c-muted text-xs">{m.items.map((it) => it.foodKey || it.customName).join(" · ")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDraft(null)} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Rigenera</button>
                <button onClick={() => onConfirm(draft)} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  Carica nell'editor
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

// Bozza AI di protocollo integrazione (WeekSuppsEditor): il coach dà
// un'istruzione libera, l'AI sceglie integratori/dosi/momenti in autonomia
// nel vocabolario di SUPP_MOMENTS — SUPP_WIKI (05_HomeDashboard.jsx) è la
// base di riferimento passata all'Edge Function per dosi/timing tipici.
function GenerateAISupplementsModal({ client, hasExisting, onClose, onConfirm }) {
  const { supabase } = useContext(CoachDataContext);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null); // { sections }

  const generate = async () => {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const clientContext = { nome: client.fullName || client.name, obiettivo: client.goal || null, piano: client.plan };
      const result = await generateSupplementsPlanDraft(supabase, { instruction, clientContext, suppWiki: SUPP_WIKI });
      setDraft(result);
    } catch (e) {
      console.error("PERFORM: errore generazione protocollo AI integrazione", e);
      let friendly = "Non sono riuscito a generare un protocollo. Riprova tra poco.";
      try {
        const body = await e?.context?.json?.();
        if (body?.error) friendly = body.error;
      } catch { /* mantieni il messaggio generico */ }
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    const sections = draft.sections.map((sec) => {
      const moment = SUPP_MOMENTS.find((m) => m.id === sec.id_ref);
      return { id: uid(), id_ref: sec.id_ref, title: moment?.label || sec.id_ref, items: sec.items.map((it) => ({ id: uid(), ...it })) };
    });
    onConfirm(sections);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="c-card w-full max-w-md" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <p className="c-heading font-display font-bold mb-1 flex items-center gap-2">
            <Sparkles size={16} style={{ color: "#C5A059" }} /> Genera integrazione con AI
          </p>
          <p className="c-muted text-xs mb-4">
            Scrivi un'istruzione breve, l'AI sceglie integratori/dosi e li distribuisce nei momenti giusti della giornata.
            {hasExisting ? " Sostituirà il protocollo attuale finché non premi \"Salva\"." : ""}
          </p>

          {!draft && (
            <>
              <input value={instruction} onChange={(e) => setInstruction(e.target.value)}
                placeholder="Es. base per principianti, obiettivo massa"
                className="w-full rounded-lg px-3 py-2.5 text-sm mb-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)" }} />
              {error && (
                <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>{error}</p>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} disabled={loading} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Annulla</button>
                <button onClick={generate} disabled={loading || !instruction.trim()} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  {loading ? "Genero…" : "Genera"}
                </button>
              </div>
            </>
          )}

          {draft && (
            <>
              <div className="space-y-2 mb-4">
                {draft.sections.map((sec, i) => (
                  <div key={i} className="t-inner px-3 py-2.5">
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>{SUPP_MOMENTS.find((m) => m.id === sec.id_ref)?.label || sec.id_ref}</p>
                    <p className="c-muted text-xs">{sec.items.map((it) => `${it.name} (${it.dose})`).join(" · ")}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDraft(null)} className="c-ghost flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">Rigenera</button>
                <button onClick={confirm} className="c-btn flex-1 px-4 py-2.5 rounded-lg text-sm font-medium">
                  Carica nell'editor
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

// Overlay a schermo intero per l'anamnesi (estratto da ClientDetail per la
// stessa ragione di ClientAccessDetailModal poco sopra): X sempre nell'header
// fisso (mai dentro l'area che scrolla), PIÙ uno swipe-down come via di
// fuga alternativa — mai una sola strada per chiudere un pannello pieno di
// campi di testo, dove la tastiera del telefono può nascondere l'header
// (BUG PRESO, segnalato: "sul telefono non riesco a chiuderla").
function AnamnesisFullscreen({ client, onClose }) {
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);
  return (
    <Portal>
      <div className="c-fullscreen-modal z-50 flex flex-col" style={{ backgroundColor: "var(--surface)" }}>
        <div ref={headerRef} className="shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <SwipeHandle />
          <div className="flex items-center justify-between gap-3 px-4 pb-4">
            <div className="min-w-0">
              <p className="c-heading font-display font-bold truncate">Anamnesi · {client.name}</p>
              <p className="c-muted text-xs">Letta al primo contatto e rivista periodicamente, non ogni giorno</p>
            </div>
            <button onClick={onClose} aria-label="Chiudi" className="c-ghost w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl md:max-w-3xl mx-auto w-full">
          <AnamnesisPanel client={client} />
        </div>
      </div>
    </Portal>
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
          Email e password vengono dalla registrazione (la password si rigenera dal dettaglio utente in Hub Utenti); il resto (data di nascita, telefono, città, peso, altezza…) viene autocompilato dalle 56 domande di anamnesi qui sotto.
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

/* Vacanze e riposi forzati richiesti dal cliente (pause_periods), col
   motivo per i riposi forzati — il coach le vede qui per capire il perché
   di un buco nel programma e reagire (modificare il piano, dare supporto),
   invece di scoprirlo solo da un'aderenza calata senza contesto. */
function ClientPausesCard({ client }) {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const [pauses, setPauses] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    fetchClientPauses(supabase, client.id)
      .then((rows) => { if (!cancelled) setPauses(rows); })
      .catch((err) => { console.error("PERFORM: errore lettura pause cliente", err); if (!cancelled) setPauses([]); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);

  if (!isRealMode || !pauses || pauses.length === 0) return null;

  return (
    <div className="c-card">
      <p className="c-heading font-display font-bold mb-3">🏖️ Vacanze e riposi forzati</p>
      <div className="space-y-2">
        {pauses.map((p) => (
          <div key={p.id} className="inner px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                {p.type === "vacation" ? "Vacanza" : "Riposo forzato"}
              </span>
              <span className="c-muted font-data text-xs">
                {p.start_date}{p.end_date !== p.start_date ? ` → ${p.end_date}` : ""}
              </span>
            </div>
            {p.reason && <p className="c-muted text-xs mt-1">Motivo: {p.reason}</p>}
            {p.note && <p className="c-muted text-xs mt-0.5">"{p.note}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientDetail({ client, onBack, quickTargets, setQuickTargets, initialTab = "dati" }) {
  const { supabase, coachId, isRealMode, reloadRoster } = useContext(CoachDataContext);
  const status = computeStatus(client);
  const meta = STATUS_META[status];
  const [tab, setTab] = useState(initialTab);
  // Anamnesi non è più un tab tra gli altri: si legge la prima volta che si
  // conosce il cliente e poi solo saltuariamente per ristrutturare i
  // programmi futuri, non ogni giorno come dati/editor — resta quindi
  // un pulsante che apre il pannello a schermo intero solo quando serve.
  // Chat non vive più qui: il coach ha una sola inbox con tutte le
  // conversazioni (tab Chat del proprio account, App.jsx), non una copia
  // per ogni scheda cliente in Hub Atleti.
  const [showAnamnesis, setShowAnamnesis] = useState(false);
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

  // "Smetti di gestire" (richiesto esplicitamente): serve per gli account di
  // test che il coach ha creato per provare l'app e ora vuole togliere dalla
  // gestione attiva senza eliminarli — restano l'account, torna solo il
  // piano a uno autogestito (free/premium) e il cliente esce dal reparto
  // Attivi. Scegliere il piano di destinazione È già la conferma (stessa
  // convenzione di CoachingPlanPicker sopra): niente doppio tap aggiuntivo.
  const [unmanaging, setUnmanaging] = useState(false);
  const [unmanageBusy, setUnmanageBusy] = useState(false);
  const [unmanageError, setUnmanageError] = useState("");
  const doUnmanage = async (targetPlan) => {
    setUnmanageBusy(true);
    setUnmanageError("");
    try {
      await unmanageClient(supabase, client.id, targetPlan);
      await reloadRoster?.(); // atteso: il roster fresco deve essere pronto PRIMA di tornare al catalogo
      onBack(); // il cliente non è più nel reparto corrente: torna al catalogo
    } catch (err) {
      console.error("PERFORM: errore nello smettere di gestire il cliente", err);
      setUnmanageError(err?.message || "Non sono riuscito a completare l'operazione. Riprova.");
      setUnmanageBusy(false);
    }
  };

  // BUG PRESO: awardXpBonus esisteva già in coachingData.js e xp_bonuses è
  // già sommata da computeRealXpAndStreak — mancava solo il pulsante per
  // usarla. "Bonus XP manuale" per riconoscere un traguardo (obiettivo di
  // mesociclo raggiunto, costanza fuori dal comune) senza dover falsificare
  // lo storico di allenamento/alimentazione per farlo salire.
  const [awardingXp, setAwardingXp] = useState(false);
  const [xpAmount, setXpAmount] = useState("");
  const [xpReason, setXpReason] = useState("");
  const [xpBusy, setXpBusy] = useState(false);
  const [xpError, setXpError] = useState("");
  const [xpJustAwarded, setXpJustAwarded] = useState(false);
  const doAwardXp = async () => {
    const amount = Math.round(Number(xpAmount));
    if (!amount || amount <= 0) { setXpError("Inserisci un numero di XP maggiore di zero."); return; }
    setXpBusy(true);
    setXpError("");
    try {
      await awardXpBonus(supabase, { userId: client.id, coachId, amount, reason: xpReason.trim() || null });
      setAwardingXp(false);
      setXpAmount("");
      setXpReason("");
      setXpJustAwarded(true);
      setTimeout(() => setXpJustAwarded(false), 3000);
    } catch (err) {
      console.error("PERFORM: errore assegnazione bonus XP", err);
      setXpError("Non sono riuscito a salvare il bonus. Riprova.");
    } finally {
      setXpBusy(false);
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-display text-xl ${titleClass}`}>{client.name}</p>
            {/* BUG PRESO: "streak N giorni" restava fisso al plurale anche
                con N=1 ("streak 1 giorni") — un cliente appena preso in
                gestione ha quasi sempre streak 1 nei primi giorni. */}
            <p className="c-muted font-data text-xs uppercase mt-1">{client.goal} · {client.calories} kcal · streak {client.streak} {client.streak === 1 ? "giorno" : "giorni"} · aderenza {client.adherence != null ? `${client.adherence}%` : "n/d"}</p>
          </div>
          <button onClick={() => setShowAnamnesis(true)} className="c-ghost shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium">
            <FileText size={14} /> Anamnesi
          </button>
        </div>
        {isRealMode && (
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {changingPlan ? (
              <CoachingPlanPicker onPick={changePlan} busy={planBusy} onCancel={() => setChangingPlan(false)} />
            ) : (
              <button onClick={() => setChangingPlan(true)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium">
                Cambia abbonamento
              </button>
            )}
            {client.clientStatus === "active" && (
              unmanaging ? (
                <div className="flex flex-col gap-1.5">
                  <p className="c-muted text-xs">Torna a un piano autogestito:</p>
                  <p className="c-muted text-xs" style={{ fontSize: "0.65rem" }}>Non annulla un eventuale abbonamento Stripe reale — solo per account senza pagamento vero (test/whitelist).</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button type="button" onClick={() => doUnmanage("free")} disabled={unmanageBusy}
                      className="c-ghost px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50">Free</button>
                    <button type="button" onClick={() => doUnmanage("performance_pack")} disabled={unmanageBusy}
                      className="c-ghost px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50">Premium</button>
                  </div>
                  {unmanageError && <p className="text-xs" style={{ color: "#DC2626" }}>{unmanageError}</p>}
                  <button type="button" onClick={() => setUnmanaging(false)} disabled={unmanageBusy} className="text-xs self-start" style={{ color: "var(--ink-soft)" }}>
                    Annulla
                  </button>
                </div>
              ) : (
                <button onClick={() => setUnmanaging(true)} className="px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ border: "1px solid #FCA5A5", color: "#DC2626" }}>
                  Smetti di gestire
                </button>
              )
            )}
            {awardingXp ? (
              <div className="flex flex-col gap-1.5 w-full">
                <p className="c-muted text-xs">Bonus XP manuale (es. "Obiettivo di mesociclo raggiunto"):</p>
                <div className="flex gap-1.5 flex-wrap">
                  <input type="number" min="1" value={xpAmount} onChange={(e) => setXpAmount(e.target.value)}
                    placeholder="XP" className="t-input w-20 text-xs rounded-lg px-2.5 py-2" />
                  <input type="text" value={xpReason} onChange={(e) => setXpReason(e.target.value)}
                    placeholder="Motivo (facoltativo)" className="t-input flex-1 min-w-[140px] text-xs rounded-lg px-2.5 py-2" />
                </div>
                <div className="flex gap-2 items-center">
                  <button type="button" onClick={doAwardXp} disabled={xpBusy} className="c-btn px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50">
                    {xpBusy ? "…" : "Assegna"}
                  </button>
                  <button type="button" onClick={() => { setAwardingXp(false); setXpError(""); }} disabled={xpBusy} className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Annulla
                  </button>
                </div>
                {xpError && <p className="text-xs" style={{ color: "#DC2626" }}>{xpError}</p>}
              </div>
            ) : (
              <button onClick={() => setAwardingXp(true)} className="c-ghost px-3 py-2 rounded-lg text-xs font-medium">
                Assegna XP bonus
              </button>
            )}
            {xpJustAwarded && <span className="text-xs font-medium" style={{ color: "#047857" }}>✓ Bonus assegnato</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-5">
        {[["dati", "Dati", BarChart3], ["editor", "Editor", Dumbbell]].map(([id, lab, Ico]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} className="relative rounded-2xl px-2 py-3.5 flex flex-col items-center gap-1.5"
              style={on ? { backgroundColor: "#111111", color: "#FFFFFF" } : { backgroundColor: "var(--pill-off-bg)", border: "1px solid var(--line-strong)", color: "var(--ink-tertiary)" }}>
              <Ico size={18} strokeWidth={on ? 2 : 1.6} style={{ color: on ? "#C5A059" : "var(--ink-soft)" }} />
              <span className="font-data text-xs uppercase text-center" style={{ fontWeight: on ? 600 : 400, lineHeight: 1.1 }}>{lab}</span>
            </button>
          );
        })}
      </div>

      {tab === "dati" && (
        <div className="space-y-4">
          <BioritmiGrafici client={client} />
          <ClientPausesCard client={client} />
          <CheckDetail client={client} />
        </div>
      )}

      {tab === "editor" && (
        <div>
          <ClientTimeline client={client} quickTargets={quickTargets} setQuickTargets={setQuickTargets} />
        </div>
      )}

      {showAnamnesis && (
        <AnamnesisFullscreen client={client} onClose={() => setShowAnamnesis(false)} />
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
  // Piccola oscillazione settimanale deterministica (seno, stabile tra un render e l'altro)
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
  // Quale cerchio è "aperto" (nessuno, o uno solo alla volta): al click si
  // espande sotto il dettaglio corrispondente invece di tenere grafici e
  // liste sempre visibili — molto più compatto per uso quotidiano.
  const [openRing, setOpenRing] = useState(null); // null | "allenamento" | "alimentazione" | "recupero"
  const toggleRing = (key) => setOpenRing((cur) => (cur === key ? null : key));

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

  // Cerchio Recupero reale: STESSA formula di Home cliente — vedi
  // computeRecoveryCompliance in coachingData.js.
  const [recoveryCompliance, setRecoveryCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeRecoveryCompliance(supabase, client.id)
      .then((r) => { if (!cancelled) setRecoveryCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Recupero", err);
        if (!cancelled) setRecoveryCompliance({ status: "neutral", pct: null, sleepAvg: null, stepsAvg: null, trackedDays: 0, windowDays: 0 });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);
  const recoveryRingValue = isRealMode
    ? (recoveryCompliance?.pct != null ? recoveryCompliance.pct / 100 : null)
    : client.rings.recupero;

  // Cerchio Alimentazione reale: STESSA formula di Home cliente — vedi
  // computeNutritionCompliance in coachingData.js.
  const [nutritionCompliance, setNutritionCompliance] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeNutritionCompliance(supabase, client.id)
      .then((r) => { if (!cancelled) setNutritionCompliance(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo cerchio Alimentazione", err);
        if (!cancelled) setNutritionCompliance({ status: "neutral", pct: null, daysScored: 0 });
      });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);
  const nutritionRingValue = isRealMode
    ? (nutritionCompliance?.pct != null ? nutritionCompliance.pct / 100 : null)
    : client.rings.alimentazione;

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
        <p className="c-label mb-3">Compliance diari · tocca un cerchio per il dettaglio</p>
        <div className="grid grid-cols-3 gap-3">
          <ComplianceRing label="Allenamento" value={trainRingValue} onClick={() => toggleRing("allenamento")} active={openRing === "allenamento"} />
          <ComplianceRing label="Alimentazione" value={nutritionRingValue} onClick={() => toggleRing("alimentazione")} active={openRing === "alimentazione"} />
          <ComplianceRing label="Recupero" value={recoveryRingValue} onClick={() => toggleRing("recupero")} active={openRing === "recupero"} />
        </div>
      </div>

      {openRing === "allenamento" && (
        isRealMode ? <ClientDayLog client={client} mode="training" /> : <div className="c-card"><p className="c-muted text-sm">Elenco allenamenti disponibile in modalità reale.</p></div>
      )}

      {openRing === "alimentazione" && (
        isRealMode ? <ClientDayLog client={client} mode="nutrition" /> : <div className="c-card"><p className="c-muted text-sm">Elenco alimentazione disponibile in modalità reale.</p></div>
      )}

      {openRing === "recupero" && (
        <div className="c-card">
          <p className="c-heading font-display font-bold mb-1">Recupero — ultimi giorni reali</p>
          <p className="c-muted text-xs mb-3">Sonno e passi medi registrati dall'atleta, stessa finestra usata per il cerchio (max 7 giorni, mai prima dell'iscrizione, oggi escluso).</p>
          {!isRealMode || recoveryCompliance?.trackedDays === 0 || recoveryCompliance?.sleepAvg == null ? (
            <p className="c-muted text-sm">{isRealMode ? "Nessun dato di sonno/passi registrato in questa finestra." : "Disponibile in modalità reale."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="t-inner px-3 py-3 text-center">
                <p className="c-label mb-1">Sonno medio</p>
                <p className="font-data text-xl font-bold" style={{ color: "var(--ink)" }}>{recoveryCompliance.sleepAvg}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}> h/notte</span></p>
              </div>
              <div className="t-inner px-3 py-3 text-center">
                <p className="c-label mb-1">Passi medi</p>
                <p className="font-data text-xl font-bold" style={{ color: "var(--ink)" }}>{recoveryCompliance.stepsAvg.toLocaleString("it-IT")}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}> /giorno</span></p>
              </div>
            </div>
          )}
        </div>
      )}
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
    const thigh = (client.prs?.squat ? client.waistCm * 0.7 : client.waistCm * 0.68) - direction * 0.08 * offset;
    const arm = client.waistCm * 0.44 - direction * 0.05 * offset;
    return {
      id: uid(),
      date: addWeeksToDate(todayMonday, offset).toISOString().slice(0, 10),
      weight: Math.round(w * 10) / 10,
      waistCm: Math.round(waist * 10) / 10,
      thighCm: Math.round(thigh * 10) / 10,
      armCm: Math.round(arm * 10) / 10,
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
  // Ogni serie ignora i punti dove il valore è null/undefined (una misura
  // non registrata in quel check, es. circonferenze facoltative) invece di
  // trattarli come 0 — altrimenti un check senza quella misura disegnava un
  // finto tuffo a zero, leggibile come un crollo reale che non è mai successo.
  const seriesPoints = series.map((s) => points.map((p, i) => ({ i, v: p[s.key] })).filter((p) => p.v != null && p.v !== ""));
  const scales = series.map((s, si) => {
    const vals = seriesPoints[si].map((p) => Number(p.v));
    if (vals.length === 0) return { min: 0, span: 1 };
    const min = Math.min(...vals), span = Math.max(0.5, Math.max(...vals) - min);
    return { min, span };
  });
  const yFor = (v, sc) => H - PAD - ((Number(v) - sc.min) / sc.span) * (H - PAD * 2);
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
            const pts = seriesPoints[si];
            if (pts.length === 0) return null;
            const path = pts.map((p, j) => `${j === 0 ? "M" : "L"} ${x(p.i)} ${yFor(p.v, sc)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke={s.color} strokeWidth="2" />
                {pts.map((p) => (
                  <circle key={p.i} cx={x(p.i)} cy={yFor(p.v, sc)} r={p.i === n - 1 ? 4 : 2.5} fill={s.color} />
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
  // Peso/vita ora facoltativi nel check: senza guardia qui, un check "solo
  // sensazioni" (peso/vita null) veniva letto come 0 nella sottrazione e
  // poteva far scattare un badge di ricomposizione/stallo del tutto falso.
  if (today.weight == null || twoWeeksAgo.weight == null || today.waistCm == null || twoWeeksAgo.waistCm == null) return null;
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

/* Slot singolo foto (silhouette vuota se il check non ha quella foto). */
function PhotoCompareSlot({ shot, angle, fieldKey, accentBorder }) {
  const url = shot?.[fieldKey];
  return (
    <div className="t-inner overflow-hidden flex items-center justify-center" style={{ aspectRatio: "3/4", borderStyle: url ? "solid" : "dashed", borderColor: url ? "var(--line)" : accentBorder }}>
      {url ? <img src={url} alt={angle} className="w-full h-full object-cover" />
           : <p className="c-muted text-[10px] text-center">📷<br />{angle}</p>}
    </div>
  );
}

/* Confronto Check Storico vs Oggi: foto reali da Supabase Storage
   (checkin-photos, v36) tramite URL firmati, silhouette vuota per gli
   angoli senza foto — mai un'immagine inventata. */
function PhotoCompareBoard({ history }) {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = sorted[0];
  // Confronto col check con foto più vecchio disponibile fra gli ultimi 5,
  // non semplicemente "5 posizioni fa": in modalità reale i check con foto
  // sono sparsi, un indice fisso spesso cadrebbe su un check senza foto.
  const withPhotos = sorted.filter((h) => h.hasPhotos);
  const monthAgo = withPhotos.length > 1 ? withPhotos[withPhotos.length - 1] : sorted[Math.min(4, sorted.length - 1)];
  const angles = [["Fronte", "photoFront"], ["Lato", "photoSide"], ["Retro", "photoBack"]];
  return (
    <div className="c-card">
      <p className="c-label mb-3">Plancia comparativa foto — Check Storico ({monthAgo.date}) vs Oggi ({today.date})</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-data text-[11px] uppercase mb-2 text-center" style={{ color: "var(--ink-soft)" }}>Check storico</p>
          <div className="grid grid-cols-3 gap-1.5">
            {angles.map(([a, k]) => <PhotoCompareSlot key={a} shot={monthAgo} angle={a} fieldKey={k} accentBorder="var(--line)" />)}
          </div>
        </div>
        <div>
          <p className="font-data text-[11px] uppercase mb-2 text-center" style={{ color: "var(--ink)", fontWeight: 600 }}>Oggi</p>
          <div className="grid grid-cols-3 gap-1.5">
            {angles.map(([a, k]) => <PhotoCompareSlot key={a} shot={today} angle={a} fieldKey={k} accentBorder="#C5A059" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Elenco giorni (allenamento + alimentazione) del cliente, dato reale da
   Supabase — mai simulato. Riusa le stesse funzioni/punteggi già validati
   altrove nel progetto invece di duplicare la logica:
   - fetchAssignedWorkouts: stesso fetch usato lato cliente per la scheda,
     qui letto in sola lettura per l'elenco giorni.
   - fetchExerciseRecords: storico reale per esercizio, usato per capire se
     il carico di un giorno è più alto della sessione precedente dello
     stesso esercizio (progressione), stesso principio di
     computeTrainingCompliance ma esposto giorno per giorno invece che come
     unico punteggio aggregato.
   - dayNutritionScore: stesso punteggio kcal/macro-vs-target già usato dal
     cerchio Alimentazione, qui per singolo giorno invece che come media.
   Integratori: la tabella prescribed_supplements è il protocollo ASSEGNATO
   (sempre reale), ma non esiste da nessuna parte uno storico di "preso
   davvero il giorno X" — non è mai stato tracciato, quindi non compare
   nell'elenco giorno per giorno (mai un dato inventato): si mostra solo il
   protocollo attuale come riferimento. */
const CLIENT_DAY_LOG_DAYS = 14;
function ClientDayLog({ client, mode }) {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const [days, setDays] = useState(null); // null = caricamento
  const [supplements, setSupplements] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isRealMode) { setDays([]); return undefined; }
    let cancelled = false;
    setError("");
    const todayISO = toLocalISODate();
    const fromDate = new Date(`${todayISO}T00:00:00`);
    fromDate.setDate(fromDate.getDate() - (CLIENT_DAY_LOG_DAYS - 1));
    const fromISO = toLocalISODate(fromDate);

    Promise.all([
      fetchAssignedWorkouts(supabase, client.id, fromISO, todayISO),
      fetchExerciseRecords(supabase, client.id),
      supabase.from("nutrition_logs").select("date, kcal, protein, carbs, fat").eq("user_id", client.id).gte("date", fromISO).lte("date", todayISO),
      supabase.from("nutrition_targets").select("day_type, kcal, protein, carbs, fat, effective_from").eq("user_id", client.id).lte("effective_from", todayISO).order("effective_from", { ascending: true }),
      fetchPrescribedSupplements(supabase, client.id),
    ]).then(([workoutRows, exerciseRecords, nutritionResp, targetsResp, supplementRows]) => {
      if (cancelled) return;
      if (nutritionResp.error) throw nutritionResp.error;
      if (targetsResp.error) throw targetsResp.error;
      const nutritionLogs = nutritionResp.data ?? [];
      const targets = targetsResp.data ?? [];
      setSupplements(supplementRows ?? []);

      const historyByExercise = new Map();
      exerciseRecords.forEach((ex) => historyByExercise.set(ex.name, ex.sessions)); // già ordinate per data crescente

      const byDate = new Map();
      workoutRows.forEach((r) => {
        if (!byDate.has(r.date)) byDate.set(r.date, []);
        byDate.get(r.date).push(r);
      });

      const targetFor = (dateISO, dayType) => {
        const rows = targets.filter((t) => t.day_type === dayType && t.effective_from <= dateISO);
        if (rows.length === 0) return null;
        const latest = rows[rows.length - 1]; // già ordinati ascending per effective_from
        return { kcal: Number(latest.kcal), p: Number(latest.protein), c: Number(latest.carbs), f: Number(latest.fat) };
      };

      const list = [];
      for (let i = 0; i < CLIENT_DAY_LOG_DAYS; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const dateISO = toLocalISODate(d);
        const exercises = byDate.get(dateISO);
        let workout = null;
        if (exercises && exercises.length > 0) {
          const done = exercises.filter((e) => e.status === "done").length;
          const withProgress = exercises.map((e) => {
            if (e.status !== "done" || !e.load_kg) return { ...e, progressed: null };
            const history = historyByExercise.get(e.exercise_name) || [];
            const prior = [...history].filter((s) => s.date < dateISO).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
            return { ...e, progressed: prior ? Number(e.load_kg) > prior.kg : null };
          });
          workout = { total: exercises.length, done, exercises: withProgress };
        }
        const dayType = exercises && exercises.length > 0 ? "on" : "off";
        const target = targetFor(dateISO, dayType);
        const dayLogs = nutritionLogs.filter((l) => l.date === dateISO);
        let nutrition = null;
        if (dayLogs.length > 0 || target) {
          const totals = dayLogs.reduce((a, l) => ({
            kcal: a.kcal + Number(l.kcal), p: a.p + Number(l.protein), c: a.c + Number(l.carbs), f: a.f + Number(l.fat),
          }), { kcal: 0, p: 0, c: 0, f: 0 });
          nutrition = { logged: dayLogs.length > 0, totals, target, score: dayLogs.length > 0 ? dayNutritionScore(totals, target) : null };
        }
        list.push({ date: dateISO, workout, nutrition });
      }
      setDays(list.reverse()); // più recente prima
    }).catch((err) => {
      if (cancelled) return;
      console.error("PERFORM: errore caricamento elenco giorni cliente", err);
      setError("Non sono riuscito a caricare lo storico dei giorni.");
      setDays([]);
    });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, client.id]);

  if (!isRealMode) return null; // solo dati reali, niente da mostrare in anteprima demo

  const fmtDate = (dateISO) => {
    const d = new Date(`${dateISO}T00:00:00`);
    return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
  };

  const showWorkout = mode !== "nutrition";
  const showNutrition = mode !== "training";

  return (
    <div className="c-card">
      <p className="c-heading font-display font-bold mb-1">
        {mode === "training" ? "Allenamento" : mode === "nutrition" ? "Alimentazione" : "Elenco giorni"} — ultimi {CLIENT_DAY_LOG_DAYS}
      </p>
      <p className="c-muted text-xs mb-3">
        {mode === "training" && "Esercizi svolti e progressione sul carico rispetto alla sessione precedente, dato reale registrato dal cliente."}
        {mode === "nutrition" && "Calorie e macro registrati rispetto al target assegnato per quel giorno, dato reale registrato dal cliente."}
        {!mode && "Allenamento (esercizi svolti e progressione sul carico) e alimentazione (kcal/macro rispetto al target assegnato), dato reale registrato dal cliente."}
      </p>
      {showNutrition && supplements.length > 0 && (
        <p className="font-data text-[11px] mb-3 px-2.5 py-1.5 rounded-md inline-block" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-tertiary)" }}>
          Integratori assegnati: {supplements.map((s) => s.name).join(", ")} — nessuno storico di assunzione giornaliera disponibile
        </p>
      )}
      {error && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{error}</p>}
      {days === null ? (
        <p className="c-muted text-sm">Caricamento…</p>
      ) : days.length === 0 ? (
        <p className="c-muted text-sm">Nessun dato ancora registrato in questo intervallo.</p>
      ) : (
        <div className="space-y-2">
          {days.map((day) => (
            <div key={day.date} className="t-inner px-3 py-2.5">
              <p className="font-data text-xs font-bold mb-1.5" style={{ color: "var(--ink)" }}>{fmtDate(day.date)}</p>
              <div className="flex flex-col gap-1">
                {showWorkout && (day.workout ? (
                  <div className="flex items-start gap-1.5 text-xs">
                    <Dumbbell size={13} className="shrink-0 mt-0.5" style={{ color: "var(--ink-soft)" }} />
                    <span style={{ color: "var(--ink)" }}>
                      {day.workout.done}/{day.workout.total} esercizi svolti
                      {day.workout.exercises.some((e) => e.progressed === true) && (
                        <span style={{ color: "#10B981", fontWeight: 600 }}> · progressione ↑ su {day.workout.exercises.filter((e) => e.progressed === true).map((e) => e.exercise_name).join(", ")}</span>
                      )}
                      {day.workout.exercises.some((e) => e.progressed === false) && (
                        <span style={{ color: "#F0A020", fontWeight: 600 }}> · calo su {day.workout.exercises.filter((e) => e.progressed === false).map((e) => e.exercise_name).join(", ")}</span>
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-tertiary)" }}>
                    <Dumbbell size={13} className="shrink-0" /> Nessun allenamento assegnato
                  </div>
                ))}
                {showNutrition && (day.nutrition ? (
                  <div className="flex items-start gap-1.5 text-xs">
                    <Salad size={13} className="shrink-0 mt-0.5" style={{ color: "var(--ink-soft)" }} />
                    {day.nutrition.logged ? (
                      <span style={{ color: "var(--ink)" }}>
                        {Math.round(day.nutrition.totals.kcal)} kcal
                        {day.nutrition.target && ` / ${day.nutrition.target.kcal} target`}
                        {day.nutrition.score != null && (
                          <span style={{ color: day.nutrition.score >= 80 ? "#10B981" : day.nutrition.score >= 50 ? "#F0A020" : "#DC2626", fontWeight: 600 }}> · {day.nutrition.score}% rispettato</span>
                        )}
                        <span className="c-muted"> · P {Math.round(day.nutrition.totals.p)}g · C {Math.round(day.nutrition.totals.c)}g · F {Math.round(day.nutrition.totals.f)}g</span>
                      </span>
                    ) : (
                      <span style={{ color: "#DC2626" }}>Nessuna registrazione alimentare</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-tertiary)" }}>
                    <Salad size={13} className="shrink-0" /> Nessun target assegnato
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckDetail({ client }) {
  const { supabase, isRealMode, coachId } = useContext(CoachDataContext);
  // BUG PRESO: in modalità reale client.evening/client.waistCm non esistono
  // (fetchClientRoster non li produce, sono campi solo del roster demo) —
  // l'inizializzatore di useState leggeva client.evening.digestione e andava
  // in crash SEMPRE che un coach aprisse "Check Settimanali" su un cliente
  // vero. Sostituito con dati reali da checkins (coachingData.js), con lo
  // stesso gate di REAL_COACHING_PLANS usato per "In Attesa": Free/Premium
  // restano privati, mai mostrati qui — solo chi paga un piano di coaching
  // reale finisce nel Registro Check del coach.
  const isPaidCoaching = REAL_COACHING_PLANS.has(client.plan);
  const [realHistory, setRealHistory] = useState(null); // null = non ancora caricato
  const [demoHistory] = useState(() => (isRealMode ? [] : buildCheckHistory(client)));

  const loadReal = useCallback(() => {
    if (!isRealMode || !isPaidCoaching) return;
    fetchCheckins(supabase, client.id)
      .then(async (rows) => {
        const mapped = await Promise.all(rows.map(async (c) => ({
          id: c.date, date: c.date,
          weight: c.weight != null ? Number(c.weight) : null,
          waistCm: c.waist != null ? Number(c.waist) : null,
          thighCm: c.thigh != null ? Number(c.thigh) : null,
          armCm: c.arm != null ? Number(c.arm) : null,
          hasPhotos: c.has_photos,
          photoFront: c.has_photos ? await getCheckinPhotoUrl(supabase, c.photo_front_url) : null,
          photoSide: c.has_photos ? await getCheckinPhotoUrl(supabase, c.photo_side_url) : null,
          photoBack: c.has_photos ? await getCheckinPhotoUrl(supabase, c.photo_back_url) : null,
          dolori: c.pain, stress: c.stress, digestione: c.digestion, sonno: c.sleep_quality,
          cyclePhase: c.cycle_phase,
        })));
        // BUG PRESO: filtrava via ogni check senza peso — utile finché il
        // peso era obbligatorio, ma ora che il check settimanale lo lascia
        // facoltativo (contano soprattutto le sensazioni) un check "solo
        // sensazioni/foto" spariva del tutto dal Registro Check del coach,
        // foto comprese. Restano tutti i check reali; i pannelli sotto
        // gestiscono già il peso assente con "—" invece di un numero finto.
        setRealHistory(mapped);
      })
      .catch((err) => { console.error("PERFORM: errore caricamento check reali (coach)", err); setRealHistory([]); });
  }, [isRealMode, isPaidCoaching, supabase, client.id]);
  useEffect(() => { loadReal(); }, [loadReal]);

  // Digestione/motivazione/fatica percepita — SCHEMA_v57, daily_metrics: a
  // differenza del check settimanale (una riga al lunedì) qui è l'atleta
  // stesso a compilarle ogni giorno (Alimentazione/fine allenamento), quindi
  // arrivano da una tabella e una cadenza diverse — grafico separato, non
  // mischiato per data con quello sopra basato su checkins. Stesso gate di
  // privacy del resto di questo pannello (solo piani a coaching reale).
  const [dailyWellness, setDailyWellness] = useState(null); // null = non ancora caricato
  useEffect(() => {
    if (!isRealMode || !isPaidCoaching) return undefined;
    let cancelled = false;
    const todayISO = toLocalISODate();
    const fromDate = new Date(`${todayISO}T00:00:00`);
    fromDate.setDate(fromDate.getDate() - 59);
    fetchDailyMetricsRange(supabase, client.id, toLocalISODate(fromDate), todayISO)
      .then((rows) => {
        if (cancelled) return;
        setDailyWellness(rows
          .filter((r) => r.digestion != null || r.motivation != null || r.fatigue != null)
          .map((r) => ({ date: r.date, digestione: r.digestion, motivazione: r.motivation, fatica: r.fatigue })));
      })
      .catch((err) => { console.error("PERFORM: errore lettura valutazioni giornaliere (coach)", err); if (!cancelled) setDailyWellness([]); });
    return () => { cancelled = true; };
  }, [isRealMode, isPaidCoaching, supabase, client.id]);

  const history = isRealMode ? (realHistory ?? []) : demoHistory;
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted[0], previous = sorted[1];
  // Peso facoltativo nel check: media e delta si calcolano solo sui check
  // che hanno davvero un peso, altrimenti un check "solo sensazioni"
  // conterebbe come 0 kg e falserebbe entrambi i numeri.
  const weighedHistory = history.filter((h) => h.weight != null);
  const avg5 = weighedHistory.length ? average(weighedHistory.slice(-5).map((h) => h.weight)) : null;
  const delta = (previous && latest.weight != null && previous.weight != null) ? latest.weight - previous.weight : null;
  const badge = latest ? predictiveBadge(client, history) : null;

  // Dovere di cura (§09): dolore alto per più check consecutivi segnalato
  // subito, con un testo pronto che il coach può modificare prima di
  // inviarlo — mai un messaggio che parte da solo senza revisione, mai un
  // segnale che il coach deve notare da solo scorrendo lo storico. Gli hook
  // vanno chiamati sempre, prima di ogni return anticipato qui sotto.
  const painAlert = detectPersistentPain(sorted);
  const [painMsgDraft, setPainMsgDraft] = useState("");
  const [painMsgSending, setPainMsgSending] = useState(false);
  const [painMsgSent, setPainMsgSent] = useState(false);
  const [painMsgError, setPainMsgError] = useState("");
  useEffect(() => {
    if (!painAlert) return;
    const firstName = client.name.split(" ")[0];
    setPainMsgDraft(
      `Ciao ${firstName}, ho notato che negli ultimi ${painAlert.consecutiveChecks} check hai segnalato un dolore ` +
      `alto (${painAlert.lastPain}/10). Prima di continuare ad allenare quella zona ti consiglio di valutare un ` +
      `consulto medico — meglio fermarsi un attimo che rischiare di peggiorare. Fammi sapere come va appena puoi.`
    );
    setPainMsgSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painAlert?.consecutiveChecks, painAlert?.lastPain]);

  const sendPainMessage = async () => {
    if (!painMsgDraft.trim()) return;
    setPainMsgSending(true);
    setPainMsgError("");
    try {
      await sendChatMessage(supabase, client.id, coachId, painMsgDraft.trim(), null);
      setPainMsgSent(true);
    } catch (err) {
      console.error("PERFORM: errore invio messaggio dolore persistente", err);
      setPainMsgError("Non sono riuscito a inviare il messaggio — riprova.");
    } finally {
      setPainMsgSending(false);
    }
  };

  if (isRealMode && !isPaidCoaching) {
    return (
      <div className="c-card">
        <p className="c-heading font-display font-bold mb-2">Check privati</p>
        <p className="c-muted text-sm leading-relaxed">
          {client.name} ha il piano Free/Premium: i suoi check restano nei dati personali dell'atleta e non sono
          condivisi automaticamente con te. Passano al Registro Check solo con un piano a coaching reale
          (Scheda Personalizzata, Coaching Allenamento, Full Coaching).
        </p>
      </div>
    );
  }

  if (isRealMode && realHistory === null) {
    return <div className="c-card"><p className="c-muted text-sm">Caricamento check…</p></div>;
  }

  if (isRealMode && history.length === 0) {
    return (
      <div className="c-card">
        <p className="c-muted text-sm">{client.name} non ha ancora registrato nessun check.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {painAlert && (
        <div className="c-card" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div className="flex items-start gap-2.5 mb-2">
            <AlertTriangle size={18} style={{ color: "#B91C1C", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="font-display font-bold text-sm" style={{ color: "#991B1B" }}>
                Dolore alto per {painAlert.consecutiveChecks} check consecutivi
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#B91C1C" }}>
                Ultimo valore registrato: {painAlert.lastPain}/10 — meglio segnalarlo ora che aspettare.
              </p>
            </div>
          </div>
          <textarea value={painMsgDraft} onChange={(e) => { setPainMsgDraft(e.target.value); setPainMsgSent(false); }}
            rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm mb-2"
            style={{ backgroundColor: "#FFFFFF", border: "1px solid #FECACA", color: "#450A0A" }} />
          {painMsgError && <p className="text-xs mb-2" style={{ color: "#B91C1C" }}>{painMsgError}</p>}
          <button onClick={sendPainMessage} disabled={painMsgSending || painMsgSent || !painMsgDraft.trim()}
            className="rounded-full px-4 py-2 text-xs font-bold"
            style={{ backgroundColor: painMsgSent ? "#059669" : "#B91C1C", color: "#FFFFFF", opacity: painMsgSending ? 0.7 : 1 }}>
            {painMsgSent ? "✓ Inviato in chat" : painMsgSending ? "Invio…" : "Invia in chat"}
          </button>
        </div>
      )}
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
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{latest.weight != null ? `${latest.weight} kg` : "—"}</p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">vs prec.</p>
            <p className="font-data text-sm font-bold" style={{ color: delta == null ? "var(--ink-soft)" : delta <= 0 ? "#10B981" : "#F0A020" }}>
              {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`}
            </p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">Media 5w</p>
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{avg5 != null ? `${avg5.toFixed(1)} kg` : "—"}</p>
          </div>
          <div className="t-inner px-3 py-2 text-center">
            <p className="c-label mb-0.5">Vita</p>
            <p className="font-data text-sm font-bold" style={{ color: "var(--ink)" }}>{latest.waistCm != null ? `${latest.waistCm} cm` : "—"}</p>
          </div>
        </div>
        <LineChart points={history} xLabel={(p) => { const d = new Date(p.date); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; }}
          series={[
            { key: "weight", label: "Peso (kg)", color: "#2563EB" },
            { key: "waistCm", label: "Vita (cm)", color: client.gender === "F" ? "#E5C1CD" : "#C5A059" },
            { key: "thighCm", label: "Coscia (cm)", color: "#F0A020" },
            { key: "armCm", label: "Braccio (cm)", color: "#10B981" },
          ]} />
        <p className="c-muted text-[10px] mt-2 mb-4">
          Peso stabile + circonferenze in calo = probabile ricomposizione. Tutto in calo = dimagrimento. Peso e
          circonferenze in salita insieme = bulk — usa questo confronto per tarare le prossime decisioni sul piano.
        </p>
        <p className="c-label mb-3">Storico completo ({history.length} check)</p>
        <div className="space-y-1.5">
          {sorted.map((h, i) => {
            const prev = sorted[i + 1];
            const d = (prev && h.weight != null && prev.weight != null) ? h.weight - prev.weight : null;
            return (
              <div key={h.id} className="t-inner px-3 py-2 flex items-center justify-between gap-2">
                <span className="font-data text-xs" style={{ color: "var(--ink-soft)" }}>{h.date}</span>
                <span className="font-data text-xs font-bold" style={{ color: "var(--ink)" }}>{h.weight != null ? `${h.weight} kg` : "—"}</span>
                <span className="font-data text-xs" style={{ color: d == null ? "var(--ink-tertiary)" : d <= 0 ? "#10B981" : "#F0A020" }}>{d != null ? `${d > 0 ? "+" : ""}${d.toFixed(1)}` : "—"}</span>
                <span className="font-data text-xs" style={{ color: "var(--ink-tertiary)" }}>{h.waistCm != null ? `${h.waistCm} cm` : "—"}</span>
                <span className="text-xs" title="Foto disponibili">{h.hasPhotos ? "📷" : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <PhotoCompareBoard history={history} />

      <div className="c-card">
        <p className="c-heading font-display font-bold mb-1">Quello che i dati da soli non dicono</p>
        <p className="c-muted text-xs mb-4">
          Aderenza a macros e allenamento non si chiede più qui: è già deducibile dal diario alimentare e dagli allenamenti registrati durante la settimana. Questo è solo ciò che nessun log automatico può misurare.
        </p>
        <LineChart points={history} xLabel={(p) => { const d = new Date(p.date); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; }}
          series={[
            { key: "dolori", label: "Dolori/fastidi", color: "#DC2626" },
            { key: "stress", label: "Stress", color: "#F0A020" },
            { key: "digestione", label: "Digestione", color: "#10B981" },
            { key: "sonno", label: "Qualità sonno", color: "#2563EB" },
          ]} />
        {client.gender === "F" && (
          <p className="c-muted text-xs mt-3">Fase del ciclo all'ultimo check: <span style={{ color: "#E5C1CD", fontWeight: 600 }}>{latest.cyclePhase || "—"}</span></p>
        )}
      </div>

      {dailyWellness && dailyWellness.length > 0 && (
        <div className="c-card">
          <p className="c-heading font-display font-bold mb-1">Digestione, motivazione e fatica (giornaliero)</p>
          <p className="c-muted text-xs mb-4">
            Compilate dall'atleta ogni giorno (Alimentazione/fine allenamento), non solo al check del lunedì: usale per
            capire quando serve davvero un refeed o una settimana di deload, non a caso.
          </p>
          <LineChart points={dailyWellness} xLabel={(p) => { const d = new Date(p.date); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; }}
            series={[
              { key: "digestione", label: "Digestione", color: "#10B981" },
              { key: "motivazione", label: "Motivazione", color: "#2563EB" },
              { key: "fatica", label: "Fatica percepita", color: "#DC2626" },
            ]} />
          <p className="c-muted text-[10px] mt-2">Fatica percepita è invertita: 1 = ottima, 10 = pessima (a differenza delle altre due, dove 10 = ottima).</p>
        </div>
      )}
    </div>
  );
}

/* §08 memo "Verso l'élite" — Il business dietro l'app: chi ha invitato chi,
   così il coach sa a chi applicare il premio (whitelist di un mese, dallo
   Hub Rete & Accessi) — mai automatico: un referral non ancora convertito
   in un piano pagante non deve costare un mese gratis da solo. */
function ReferralsPanel() {
  const { supabase, isRealMode } = useContext(CoachDataContext);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isRealMode || !open || rows !== null) return;
    fetchReferrals(supabase)
      .then(setRows)
      .catch((err) => { console.error("PERFORM: errore lettura referral", err); setError("Non sono riuscito a caricare i referral."); setRows([]); });
  }, [isRealMode, open, rows, supabase]);

  if (!isRealMode) return null;

  return (
    <div className="c-card mb-4">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>🎁 Referral</span>
        {open ? <ChevronUp size={16} style={{ color: "var(--ink-tertiary)" }} /> : <ChevronDown size={16} style={{ color: "var(--ink-tertiary)" }} />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {error && <p className="text-xs" style={{ color: "#B91C1C" }}>{error}</p>}
          {rows === null && <p className="c-muted text-xs">Carico…</p>}
          {rows?.length === 0 && <p className="c-muted text-xs">Nessun cliente arrivato tramite invito, per ora.</p>}
          {rows?.map((r) => {
            // Contrassegna chi si è convertito a un piano a pagamento (mai
            // "free" — non ha ancora dato nulla al referral, il premio è
            // ancora prematuro): è il segnale al coach di ANDARE a regalare
            // il mese di premium, non solo "chi ha usato un codice invito".
            const converted = r.plan && r.plan !== "free";
            return (
              <div key={r.id} className="flex items-center justify-between rounded-lg px-3 py-2 gap-2"
                style={{ backgroundColor: "var(--surface)", border: converted ? "1px solid #10B981" : "1px solid var(--line-strong)" }}>
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate" style={{ color: "var(--ink)" }}>{r.name}</span>
                  <span className="block text-xs truncate" style={{ color: "var(--ink-tertiary)" }}>invitato da {r.referrerName} · piano {r.plan}</span>
                </span>
                {converted ? (
                  <span className="shrink-0 text-xs font-bold rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#059669" }}>
                    🎁 Da premiare
                  </span>
                ) : (
                  <span className="shrink-0 c-muted text-xs">ancora Free</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- CATALOGO ---------------------------------- */
function RosterView({ onOpen }) {
  const { clients: CLIENTS, supabase, isRealMode } = useContext(CoachDataContext);
  const [dept, setDept] = useState("active");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = CLIENTS.filter((c) => deptOf(c) === dept && (q === "" || c.name.toLowerCase().includes(q))).sort((a, b) => b.evening.doloreGrado - a.evening.doloreGrado || a.name.localeCompare(b.name, "it"));

  // Aderenza di TUTTO il roster (non solo il reparto attivo) calcolata UNA
  // volta sola con le funzioni batch — vedi nota su ClientComplianceBadges
  // più sopra. rosterIds come dipendenza stringa (non l'array CLIENTS
  // stesso) così l'effetto riparte solo quando l'elenco clienti cambia
  // davvero, non a ogni cambio di reparto o di ricerca.
  const rosterIds = CLIENTS.filter((c) => deptOf(c) !== null).map((c) => c.id).join(",");
  const [complianceByClient, setComplianceByClient] = useState(new Map());
  useEffect(() => {
    if (!isRealMode || !rosterIds) { setComplianceByClient(new Map()); return; }
    let cancelled = false;
    const ids = rosterIds.split(",");
    Promise.all([
      computeBatchTrainingCompliance(supabase, ids).catch(() => new Map()),
      computeBatchNutritionCompliance(supabase, ids).catch(() => new Map()),
      computeBatchRecoveryCompliance(supabase, ids).catch(() => new Map()),
    ]).then(([train, nutri, recovery]) => {
      if (cancelled) return;
      const merged = new Map();
      ids.forEach((id) => {
        merged.set(id, { train: train.get(id)?.pct ?? null, nutri: nutri.get(id)?.pct ?? null, recovery: recovery.get(id)?.pct ?? null });
      });
      setComplianceByClient(merged);
    });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, rosterIds]);

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
        {list.map((c) => <ClientRow key={c.id} client={c} onOpen={() => onOpen(c.id)} compliance={complianceByClient.get(c.id)} />)}
        {list.length === 0 && <p className="c-muted text-sm py-8 md:col-span-2 text-center">Nessun cliente in questo reparto</p>}
      </div>
    </div>
  );
}

/* ==========================================================================
   💰 BLOCCO AMMINISTRATIVO E CONTABILE — MRR, proiezione annua, storico
   transazioni Stripe.
   Listino reale definitivo (da 07_ClientProfile.jsx, revisione 2, la più
   recente sul progetto): FREE €0, Premium €5/mese, Scheda
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
  performance: { label: "Premium", price: 5, billing: "recurring" },
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
  refunded: { label: "↩️ RIMBORSATO", bg: "#F4F4F5", border: "#D4D4D8", color: "#52525B" },
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

function TransactionLedger({ transactions, real }) {
  return (
    <div className="c-card">
      <h3 className="c-heading font-display font-bold mb-1">🧾 Storico Transazioni & Hub Fiscale</h3>
      <p className="c-muted text-xs mb-4">
        {real
          ? "Ordine cronologico decrescente · charge reali letti in diretta da Stripe, ID veri — clicca l'ID per verificarlo sulla Dashboard Stripe."
          : "Ordine cronologico decrescente · gli ID transazione qui sono simulati (`ch_sim_…`/`in_sim_…`), non veri ID Stripe — in produzione arrivano dal webhook Stripe nella tabella subscriptions."}
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
  const { clients: CLIENTS, supabase, isRealMode } = useContext(CoachDataContext);
  const demoMrr = useMemo(() => computeMRR(CLIENTS), [CLIENTS]);
  const demoTransactions = useMemo(() => buildTransactions(CLIENTS), [CLIENTS]);
  const demoRevenueHistory = useMemo(() => buildRevenueHistory(demoMrr), [demoMrr]);

  // BUG PRESO: l'MRR veniva stimato da profiles.plan/client_status — un
  // piano assegnato manualmente dal coach ("Prendi in gestione", whitelist)
  // risultava contato come fatturato vero anche senza un euro incassato
  // davvero (il caso esatto segnalato: 2 account test attivati a mano
  // mostravano 120€/mese). Ora la fonte è sempre Stripe stesso, in tempo
  // reale, via finance-summary (Edge Function coach-only) — mai una copia
  // locale che possa disallinearsi.
  const [real, setReal] = useState(null); // null = non ancora caricato, false = errore
  const [loading, setLoading] = useState(isRealMode);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke("finance-summary", { method: "POST" })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) { console.error("PERFORM: errore finance-summary", error || data?.error); setReal(false); return; }
        setReal(data);
      })
      .catch((err) => { console.error("PERFORM: errore chiamata finance-summary", err); if (!cancelled) setReal(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase]);

  if (isRealMode) {
    if (loading) return <div className="c-card"><p className="c-muted text-sm">Caricamento dati reali da Stripe…</p></div>;
    if (!real) return <div className="c-card"><p className="c-muted text-sm">Non sono riuscito a leggere i dati finanziari da Stripe. Riprova tra poco.</p></div>;
    return (
      <div>
        <MonetaryWidgets mrr={real.mrr} transactions={real.transactions} isDark={isDark} />
        <TransactionLedger real transactions={real.transactions.map((t) => ({
          id: t.id, clientName: t.name || "—", email: t.email || "—",
          planLabel: `€ ${t.amount.toFixed(2)} ${(t.currency || "eur").toUpperCase()}`,
          stripeStatus: t.status === "succeeded" ? "paid" : t.status === "refunded" ? "refunded" : t.status === "failed" ? "failed" : "processing",
          stripeId: t.id, timestamp: t.createdAt,
        }))} />
      </div>
    );
  }

  return (
    <div>
      <MonetaryWidgets mrr={demoMrr} transactions={demoTransactions} isDark={isDark} />
      <div className="c-card mb-5">
        <p className="c-label mb-1">Andamento fatturato mensile</p>
        <p className="c-muted text-xs mb-3">Curva illustrativa fino all'MRR di oggi — anteprima, non collegata a Stripe.</p>
        <LineChart points={demoRevenueHistory} xLabel={(p) => p.month} series={[{ key: "revenue", label: "Fatturato (€)", color: "#C5A059" }]} />
      </div>
      <TransactionLedger transactions={demoTransactions} />
    </div>
  );
}

/* ----------------------------------- ROOT ------------------------------------
   Ristrutturazione radicale in 3 Macro-Aree, come richiesto: Hub Atleti
   (catalogo + profilo a 4 sotto-tab), Hub Finanziario (widget + grafico
   fatturato + transazioni), Hub Utenti — ex "Hub Rete & Accessi" (whitelist
   + elenco utenti). Nessun doppio banner: un solo CoachContextBar in cima,
   condiviso da tutti e tre gli hub. */
const TABS = [
  { id: "atleti", label: "Hub Atleti", icon: Users },
  { id: "finanziario", label: "Hub Finanziario", icon: Wallet },
  { id: "rete", label: "Hub Utenti", icon: Server },
];

/* ============================================================================
   ASSISTENTE AI COACH — pulsante flottante + pannello chat, visibile su
   tutto il pannello coach (qualunque tab, anche dentro ClientDetail): il
   coach chiede in linguaggio naturale ("chi non si allena da una
   settimana?", "riassumimi Mario") e riceve una risposta basata SOLO sul
   roster già caricato (CoachDataContext.clients) — niente query aggiuntive,
   niente dato inventato (Edge Function coach-assistant).
   ========================================================================== */

// Riassunto compatto per l'assistente: stessi campi che il coach guarda già
// ogni giorno in Hub Atleti, non un fetch a sé — reparto calcolato con la
// stessa deptOf usata per le colonne Attivi/In attesa/Scaduti qui sopra.
function buildRosterSummary(clients) {
  return clients
    .filter((c) => REAL_COACHING_PLANS.has(c.plan))
    .map((c) => ({
      nome: c.fullName || c.name,
      reparto: DEPTS.find((d) => d.id === deptOf(c))?.label || null,
      piano: c.plan,
      streakGiorni: c.streak,
      ultimaAttivita: c.lastActivity || null,
      allenamentoPct: c.rings?.allenamento != null ? Math.round(c.rings.allenamento * 100) : null,
      alimentazionePct: c.rings?.alimentazione != null ? Math.round(c.rings.alimentazione * 100) : null,
      recuperoPct: c.rings?.recupero != null ? Math.round(c.rings.recupero * 100) : null,
      ultimoPeso: c.lastCheck?.weight ?? null,
      ultimoCheckData: c.lastCheckDate || null,
      dolore: c.evening?.doloreGrado > 0 ? { grado: c.evening.doloreGrado, nota: c.evening.doloreNota || null } : null,
      billingStatus: c.billingStatus || null,
    }));
}

function CoachAIAssistantPanel({ onClose }) {
  const { supabase, clients } = useContext(CoachDataContext);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const headerRef = useRef(null);
  useSwipeDownClose(headerRef, onClose);

  useEffect(() => {
    threadRef.current?.scrollTo?.({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const EXAMPLES = [
    "Chi non si allena da più di 5 giorni?",
    "Chi ha dolore segnalato negli ultimi check?",
    "Chi è in reparto In attesa da più tempo?",
  ];

  const ask = async (rawQuestion) => {
    const question = (rawQuestion ?? input).trim();
    if (!question || loading || !supabase) return;
    setInput("");
    const priorMessages = messages;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    try {
      const roster = buildRosterSummary(clients);
      const { text } = await askCoachAssistant(supabase, {
        question, history: priorMessages.map((m) => ({ role: m.role, text: m.text })), roster,
      });
      setMessages((m) => [...m, { role: "assistant", text: text || "Non sono riuscito a elaborare una risposta." }]);
    } catch (e) {
      console.error("PERFORM: errore assistente AI coach", e);
      let friendly = "Connessione non disponibile in questo momento. Riprova tra poco.";
      try {
        const body = await e?.context?.json?.();
        if (body?.error) friendly = body.error;
      } catch { /* mantieni il messaggio generico */ }
      setMessages((m) => [...m, { role: "assistant", text: friendly }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
           style={{ backgroundColor: "rgba(9,9,11,0.65)", backdropFilter: "blur(6px)" }} onClick={onClose}>
        <div className="spring-in c-card w-full flex flex-col" style={{ maxWidth: 480, height: "min(78vh, 640px)" }} onClick={(e) => e.stopPropagation()}>
          <div ref={headerRef} className="shrink-0">
            <SwipeHandle />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#111111" }}>
                  <Sparkles size={15} style={{ color: "#C5A059" }} />
                </span>
                <div className="min-w-0">
                  <p className="c-heading font-display font-bold truncate">Assistente PERFORM AI</p>
                  <p className="c-muted text-xs">Chiedi del tuo roster in linguaggio naturale</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Chiudi" className="c-ghost w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto space-y-2.5 py-1">
            {messages.length === 0 && !loading && (
              <div className="space-y-1.5">
                <p className="c-muted text-xs mb-2">Alcuni esempi:</p>
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => ask(ex)} className="t-inner w-full text-left px-3 py-2 text-xs" style={{ color: "var(--ink-2)" }}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="rounded-2xl px-3.5 py-2.5 text-sm" style={{
                  maxWidth: "85%", whiteSpace: "pre-wrap", lineHeight: 1.55,
                  backgroundColor: m.role === "user" ? "#111111" : "var(--surface-2)",
                  color: m.role === "user" ? "#FFFFFF" : "var(--ink)",
                  border: m.role === "user" ? "none" : "1px solid var(--line)",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3.5 py-2.5 text-sm" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                  Sto guardando il roster…
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                   placeholder="Es. chi ha bisogno di attenzione oggi?"
                   className="flex-1 rounded-full px-4 py-2.5 text-sm" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}
                   aria-label="Fai una domanda sul tuo roster" />
            <button onClick={() => ask()} disabled={loading || !input.trim()}
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#111111", opacity: (loading || !input.trim()) ? 0.4 : 1 }}
                    aria-label="Invia domanda">
              <Sparkles size={16} style={{ color: "#C5A059" }} />
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function CoachAIAssistant() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Apri assistente AI"
              className="fixed z-40 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)", right: 18,
                width: 52, height: 52, backgroundColor: "#111111",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}>
        <Sparkles size={20} style={{ color: "#C5A059" }} />
      </button>
      {open && <CoachAIAssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

export default function CoachDashboard({ supabase, coachId, dark = true } = {}) {
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

  // Libreria esercizi collettiva reale (SCHEMA_v39): caricata una volta al
  // mount del pannello, ricaricata dopo ogni esercizio custom appreso —
  // così il menu a tendina (EX_NAMES) si aggiorna subito, senza refresh.
  const [exerciseLib, setExerciseLib] = useState(DEFAULT_EXERCISE_LIB);
  const reloadExerciseLib = useCallback(() => {
    if (!isRealMode) return;
    fetchExerciseLibrary(supabase).then(setExerciseLib)
      .catch((err) => console.error("PERFORM: errore caricamento libreria esercizi", err));
  }, [isRealMode, supabase]);
  useEffect(() => { reloadExerciseLib(); }, [reloadExerciseLib]);

  const clients = isRealMode ? (realClients ?? []) : DEMO_CLIENTS;

  const [tab, setTab] = useState("atleti");
  const [selectedId, setSelectedId] = useState(null);
  const client = clients.find((c) => c.id === selectedId);
  // Store condiviso tra Registro Check, Co-Pilota AI e Timeline dell'atleta
  // per il target ON/OFF della settimana corrente — vedi nota in ClientTimeline.
  const [quickTargets, setQuickTargets] = useState({});
  // Il tema Onyx/Light non è più un toggle locale scollegato: segue lo
  // stesso stato globale del resto dell'app (dark, passato da App.jsx) —
  // prima restava sempre "Light" di default anche quando l'app era in
  // Onyx, il bug del pannello coach bianco fuori posto.
  const isDark = dark;

  return (
    <CoachDataContext.Provider value={{ clients, supabase, coachId, isRealMode, reloadRoster, exerciseLib, reloadExerciseLib }}>
      <div className={`coach-root${isDark ? " dark" : ""}`}>
        <GlobalStyle />
        {/* Solo in modalità reale: in anteprima/demo non c'è una Edge
            Function da chiamare né un roster vero da leggere. */}
        {isRealMode && <CoachAIAssistant />}
        {/* max-w-2xl su mobile: stessa larghezza fissa "da app" delle altre
            schermate (Home/Profilo/Classifica), niente contenuto più largo
            dello schermo che obbliga il browser a permettere zoom/spostamento.
            Più largo solo da tablet in su (md:), dove il coach lavora più
            spesso da desktop e beneficia dello spazio extra per le tabelle. */}
        <main className="max-w-2xl md:max-w-6xl mx-auto px-4 py-8 pb-24" style={{ overflowX: "hidden" }}>
          {selectedId != null ? (
            <ClientDetail client={client} onBack={() => setSelectedId(null)} quickTargets={quickTargets} setQuickTargets={setQuickTargets} />
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
                  <RosterView onOpen={setSelectedId} />
                </div>
              )}

              {tab === "finanziario" && <FinanceModule isDark={isDark} />}

              {tab === "rete" && (
                <div className="space-y-5">
                  <AccessControlTable />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </CoachDataContext.Provider>
  );
}
