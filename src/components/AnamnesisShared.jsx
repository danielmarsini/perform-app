/* ============================================================================
   AnamnesisShared.jsx — dati e componenti dell'anamnesi condivisi fra il
   pannello coach (09_CoachDashboard.jsx) e l'onboarding cliente
   (11_OnboardingFlow.jsx), estratti in un file a parte.

   PERCHÉ QUESTO FILE ESISTE (ottimizzazione bundle, non solo pulizia):
   09_CoachDashboard.jsx è caricato con React.lazy() in App.jsx apposta per
   non finire nel bundle iniziale di OGNI utente (è 5000+ righe usate solo
   dal coach) — ma prima che questo file esistesse, 11_OnboardingFlow.jsx
   (montato per QUALSIASI nuovo iscritto, anche Free) importava staticamente
   GlobalStyle/ANAM_AREAS/ANAM_QUESTIONS/AnamAreaSection direttamente da
   09_CoachDashboard.jsx: quell'unico import statico costringeva Vite a
   includere comunque l'intero file nel bundle principale, vanificando il
   lazy() (mai un chunk separato prodotto in build). Spostando qui i soli 4
   export davvero condivisi, l'onboarding non tocca più 09_CoachDashboard.jsx
   e il lazy() può finalmente fare il suo lavoro.
   ========================================================================== */
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Camera, Loader2, Paperclip, X } from "lucide-react";
import { formatWeight, parseWeightToKg, formatLength, parseLengthToCm, weightUnitLabel, lengthUnitLabel } from "../lib/units.js";

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
    /* BUG PRESO (segnalato): un overlay a schermo intero con "fixed inset-0"
       e un campo di testo dentro (l'anamnesi, 56 domande) — su mobile, con
       la tastiera aperta, "inset:0" può lasciare l'header con la X di
       chiusura fuori dal viewport visivo reale (bug noto di iOS Safari su
       elementi fixed quando la tastiera ridimensiona il viewport). 100dvh
       (viewport dinamico: si adatta quando la tastiera è aperta) invece di
       100vh fisso — il secondo "height" sovrascrive il primo SOLO nei
       browser che capiscono dvh, altrimenti resta il fallback vh.
       Il fallback vh (non dvh) viene ignorato dai browser che già
       riconoscono dvh, letto solo da quelli più vecchi. */
    .c-fullscreen-modal { position: fixed; inset: 0; height: 100vh; height: 100dvh; }
    .coach-root {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --surface: #FFFFFF; --surface-2: #FCFCFD; --ink: #1A1A1A; --ink-soft: #A1A1AA; --ink-tertiary: #6C757D;
      --line: rgba(17,17,17,0.05); --line-strong: #F1F3F5; --card-shadow: 0 8px 30px rgba(0,0,0,0.02);
      --page-bg: #F8F9FA; --pill-off-bg: #FFFFFF;
      /* BUG PRESO: dipingeva var(--page-bg), un pieno grigio/nero che copriva
         del tutto lo sfondo animato condiviso (LiveBackground in
         04_AppShell.jsx) — il pannello coach sembrava un rettangolo piatto a
         sé, non una schermata dell'app come le altre. Trasparente: lo sfondo
         vivo torna visibile dietro alle card, coerente col resto dell'app. */
      background-color: transparent; min-height: 100vh;
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
       deve scurirsi davvero in Onyx, non restare bianco con testo che sparisce.
       Quasi piene (0.94, non più 0.6/0.55): ora che .coach-root è trasparente
       e lo sfondo vivo si vede dietro, un vetro troppo trasparente le farebbe
       sembrare dello stesso colore dello sfondo. */
    .coach-root { --glass-bg: rgba(255,255,255,0.94); --glass-border: rgba(255,255,255,0.8); }
    .coach-root.dark { --glass-bg: rgba(24,24,27,0.94); --glass-border: rgba(255,255,255,0.1); }
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
    /* Profondità reale invece di un bordo piatto — stesso principio del
       lato cliente (04_AppShell.jsx .card): un filo di luce in cima più
       ombra a due strati, così le card sembrano sollevate dalla pagina. */
    .c-card { background-color: var(--surface); border: 1px solid var(--line); box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, var(--card-shadow); border-radius: 1rem; padding: 1.5rem; }
    .coach-root.dark .c-card { box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, var(--card-shadow); }
    .c-btn {
      background-color: #111111; color: #FFFFFF; border-radius: 0.6rem;
      box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 10px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.12);
      transition: transform 0.14s cubic-bezier(0.22,1,0.36,1), box-shadow 0.14s ease, opacity 0.15s ease;
    }
    .c-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.22) inset, 0 7px 16px rgba(0,0,0,0.2); }
    .c-btn:active:not(:disabled) { transform: translateY(1px) scale(0.98); box-shadow: 0 1px 2px rgba(0,0,0,0.18) inset; }
    .c-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .c-ghost { border: 1px solid var(--line); color: var(--ink-soft); background-color: var(--surface); border-radius: 0.6rem; transition: transform 0.12s ease, background-color 0.15s ease; }
    .c-ghost:hover { background-color: #F8F9FA; }
    .c-ghost:active { transform: scale(0.98); }
    .coach-root.dark .c-ghost:active { background-color: #27272A; }
    .t-input { background-color: var(--surface); border: 1px solid var(--line); color: var(--ink); transition: border-color 0.2s ease, box-shadow 0.15s ease; border-radius: 0.6rem; }
    .t-input::placeholder { color: #ADB5BD; }
    .t-input:focus { box-shadow: 0 0 0 3px rgba(197,160,89,0.16); }
    @media (prefers-reduced-motion: reduce) { .c-btn, .c-btn:hover, .c-btn:active, .c-ghost, .c-ghost:active { transition: none !important; transform: none !important; } }
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
  { area: "a2", n: 8,  k: "peso",         q: "Peso attuale, rilevato a digiuno", t: "number", unit: "weight", min: 30, max: 300, step: 0.1, req: true },
  { area: "a2", n: 9,  k: "altezza",      q: "Altezza", t: "number", unit: "length", min: 120, max: 230, req: true },
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
  { area: "a6", n: 39.1, k: "programmiPassati", q: "Programmi/schede di allenamento passati, se ne hai già seguiti (tuoi o di un altro coach)", t: "files" },

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
  { area: "a7", n: 48.1, k: "dietePassate", q: "Diete passate già seguite, se ne hai (tue o di un altro coach/nutrizionista)", t: "files" },
  { area: "a7", n: 48.2, k: "calorieMacroPassati", q: "Calorie e macro seguiti in passato, se li tracciavi", t: "area", ph: "es. 1800 kcal · 140g proteine, 180g carbo, 55g grassi" },
  { area: "a7", n: 48.3, k: "calorieMacroAttuali", q: "Calorie e macro che segui attualmente, se già li tieni sotto controllo", t: "area", ph: "es. 2000 kcal · 150g proteine, 200g carbo, 60g grassi" },

  /* 8 · Integrazione */
  { area: "a8", n: 49, k: "integratori",  q: "Integratori attualmente in uso, con dosaggi", t: "area", ph: "es. Creatina 5 g, vitamina D 2000 UI" },
  { area: "a8", n: 50, k: "integrPassati",q: "Integratori usati in passato e risultati percepiti", t: "area" },
  { area: "a8", n: 51, k: "caffeina",     q: "Quanti caffè o fonti di caffeina assumi al giorno?", t: "text", ph: "es. 3 caffè + 1 pre-workout" },
  { area: "a8", n: 52, k: "disponibIntegr", q: "Sei disponibile a integrare se necessario?", t: "select", opts: ["sì, senza problemi", "solo se indispensabile", "preferirei di no"] },

  /* 9 · Obiettivi e aspettative */
  { area: "a9", n: 53, k: "obiettivoPrinc", q: "Qual è il tuo obiettivo principale?", t: "select", opts: ["dimagrimento", "ricomposizione corporea", "ipertrofia", "forza", "salute e benessere", "preparazione atletica"] },
  { area: "a9", n: 54, k: "kgTarget",     q: "Quanto peso vuoi raggiungere entro 2 mesi? (peso target)", t: "number", unit: "weight", min: 30, max: 300, step: 0.5, req: true },
  { area: "a9", n: 55, k: "obiettivo",    q: "Obiettivo a lungo termine ed eventuale data-evento", t: "text", req: true, ph: "es. Raggiungere 60 kg entro 2 mesi, matrimonio a settembre" },
  { area: "a9", n: 56, k: "aspettative",  q: "Cosa ti aspetti da me come coach?", t: "area" },
];

/* --------------------------- ALLEGATI ANAMNESI ------------------------------
   BUG PRESO (segnalato da un cliente): il campo "Foto del check iniziale"
   era solo testo statico ("3/3 caricate (demo)") — mai un vero upload, ed
   era per questo escluso esplicitamente dalla vista cliente (onboarding e
   Profilo mostravano solo le domande testuali). Il cliente non aveva
   davvero NESSUN modo di caricare foto del fisico visibili al coach.
   Ora "photos" e il nuovo tipo "files" (programmi/diete passati) sono
   upload reali sul bucket privato "anamnesis-attachments" (SCHEMA_v91),
   stessa RLS di checkin-photos: solo il proprietario scrive, proprietario
   e coach leggono. onUploadFile/getFileUrl sono passati dal chiamante
   (che ha supabase/userId in scope) — se assenti il campo passa in sola
   lettura (usato lato coach, che vede ma non carica al posto del cliente).
   ============================================================================ */
const PHOTO_ANGLES = [
  { key: "front", label: "Frontale" },
  { key: "side", label: "Laterale" },
  { key: "back", label: "Posteriore" },
];

function PhotoSlot({ label, url, onPick, uploading }) {
  const handler = url ? () => window.open(url, "_blank", "noopener,noreferrer") : onPick;
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={handler} disabled={!handler || uploading}
        className="c-ghost rounded-lg overflow-hidden flex items-center justify-center"
        style={{ width: 64, height: 64, opacity: handler ? 1 : 0.5 }}>
        {url
          ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : uploading
            ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--ink-soft)" }} />
            : <Camera size={16} style={{ color: "var(--ink-soft)" }} />}
      </button>
      <span className="c-label" style={{ fontSize: "0.55rem" }}>{label}</span>
    </div>
  );
}

function AnamPhotosField({ value, onChange, onUploadFile, getFileUrl }) {
  const paths = value && typeof value === "object" ? value : {};
  const [urls, setUrls] = useState({});
  const [uploadingKey, setUploadingKey] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getFileUrl) return undefined;
    let cancelled = false;
    Promise.all(PHOTO_ANGLES.map(({ key }) => {
      const p = paths[key];
      if (!p) return Promise.resolve([key, null]);
      return getFileUrl(p).then((url) => [key, url]).catch(() => [key, null]);
    })).then((entries) => { if (!cancelled) setUrls(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.front, paths.side, paths.back]);

  const pick = (angleKey) => {
    if (!onUploadFile) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setError("");
      setUploadingKey(angleKey);
      try {
        const path = await onUploadFile(file, `foto-${angleKey}`);
        onChange({ ...paths, [angleKey]: path });
      } catch (err) {
        console.error("PERFORM: errore upload foto anamnesi", err);
        setError("Caricamento non riuscito, riprova.");
      } finally {
        setUploadingKey(null);
      }
    };
    input.click();
  };

  return (
    <div>
      <div className="flex items-center gap-4 px-1 py-1">
        {PHOTO_ANGLES.map(({ key, label }) => (
          <PhotoSlot key={key} label={label} url={urls[key]} uploading={uploadingKey === key}
            onPick={onUploadFile ? () => pick(key) : undefined} />
        ))}
      </div>
      {error && <p className="text-xs px-1" style={{ color: "#DC2626" }}>{error}</p>}
      {onUploadFile
        ? <p className="c-muted text-[11px] px-1 pt-1">Visibili solo a te e al tuo coach.</p>
        : Object.keys(paths).length === 0 && <p className="c-muted text-xs px-1 py-1">Il cliente non ha ancora caricato foto.</p>}
    </div>
  );
}

function AnamFilesField({ value, onChange, onUploadFile, getFileUrl, tag }) {
  const files = Array.isArray(value) ? value : [];
  const canEdit = !!onUploadFile;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const pick = () => {
    if (!onUploadFile) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setError("");
      setUploading(true);
      try {
        const path = await onUploadFile(file, tag);
        onChange([...files, { path, name: file.name }]);
      } catch (err) {
        console.error("PERFORM: errore upload allegato anamnesi", err);
        setError("Caricamento non riuscito, riprova.");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const remove = (idx) => { if (canEdit) onChange(files.filter((_, i) => i !== idx)); };

  const open = async (path) => {
    if (!getFileUrl) return;
    const url = await getFileUrl(path).catch(() => null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-2">
      {files.length === 0 && !canEdit && <p className="c-muted text-xs px-1 py-2">Il cliente non ha ancora caricato allegati.</p>}
      {files.map((f, idx) => (
        <div key={f.path} className="t-inner flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg">
          <button type="button" onClick={() => open(f.path)} className="flex items-center gap-1.5 text-xs truncate min-w-0" style={{ color: "var(--ink)" }}>
            <Paperclip size={12} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
            <span className="truncate">{f.name}</span>
          </button>
          {canEdit && (
            <button type="button" onClick={() => remove(idx)} aria-label="Rimuovi allegato" className="shrink-0">
              <X size={13} style={{ color: "var(--ink-soft)" }} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button type="button" onClick={pick} disabled={uploading}
          className="c-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          {uploading ? "Caricamento…" : "Allega file (foto o PDF)"}
        </button>
      )}
      {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
    </div>
  );
}

// Un campo conta come "compilato" in modo diverso a seconda del tipo:
// photos/files sono oggetti/array, non stringhe — String({}) o String([])
// darebbero sempre un risultato non vuoto, quindi vanno controllati a parte
// (usato per la % di compilazione ovunque l'anamnesi viene mostrata).
export function isAnamAnswerFilled(q, value) {
  if (q.t === "photos") return !!(value && typeof value === "object" && Object.keys(value).length > 0);
  if (q.t === "files") return Array.isArray(value) && value.length > 0;
  return String(value ?? "").trim() !== "";
}

/* ------------------------------- ANAMNESI (60) ------------------------------ */
// Peso/altezza/peso-target (q.unit "weight"/"length"): la RISPOSTA salvata in
// answers[q.k] resta SEMPRE in kg/cm — la stessa "fonte di verità" usata
// altrove nel dual-unit system (lib/units.js) e letta come tale da chi legge
// l'anamnesi a valle (es. Number(answers?.peso) in 05_HomeDashboard.jsx per
// initialWeightKg/heightCm). Solo qui, al bordo dell'input, si converte da e
// verso l'unità scelta dall'utente — mai una seconda fonte di verità.
function AnamField({ q, value, onChange, onUploadFile, getFileUrl, unitSystem = "metric" }) {
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
  if (q.t === "number" && (q.unit === "weight" || q.unit === "length")) {
    const toDisplay = q.unit === "weight" ? formatWeight : formatLength;
    const toCanonical = q.unit === "weight" ? parseWeightToKg : parseLengthToCm;
    const displayValue = value === "" || value == null ? "" : toDisplay(value, unitSystem) ?? "";
    const displayMin = q.min != null ? toDisplay(q.min, unitSystem) : undefined;
    const displayMax = q.max != null ? toDisplay(q.max, unitSystem) : undefined;
    const displayStep = unitSystem === "imperial" ? (q.unit === "weight" ? 1 : 0.5) : (q.step || 1);
    return (
      <input type="number" min={displayMin} max={displayMax} step={displayStep} value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : toCanonical(raw, unitSystem) ?? "");
        }}
        className={common + " font-data"} />
    );
  }
  if (q.t === "number") return <input type="number" min={q.min} max={q.max} step={q.step || 1} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={common + " font-data"} />;
  if (q.t === "photos") return <AnamPhotosField value={value} onChange={onChange} onUploadFile={onUploadFile} getFileUrl={getFileUrl} />;
  if (q.t === "files") return <AnamFilesField value={value} onChange={onChange} onUploadFile={onUploadFile} getFileUrl={getFileUrl} tag={q.k} />;
  return <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={q.ph} className={common} />;
}

export function AnamAreaSection({ areaId, label, questions, answers, onChange, defaultOpen, onUploadFile, getFileUrl, unitSystem = "metric" }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const filled = questions.filter((q) => isAnamAnswerFilled(q, answers[q.k])).length;
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
              <label className="c-label block mb-1">
                {q.n}. {q.q}
                {q.unit && ` (${q.unit === "weight" ? weightUnitLabel(unitSystem) : lengthUnitLabel(unitSystem)})`}
                {q.req && <span style={{ color: "#DC2626" }}> *</span>}
              </label>
              <AnamField q={q} value={answers[q.k]} onChange={(v) => onChange(q.k, v)} onUploadFile={onUploadFile} getFileUrl={getFileUrl} unitSystem={unitSystem} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

