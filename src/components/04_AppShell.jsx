/* ============================================================================
   PERFORM · FILE 4 — APP SHELL
   Evidence-Based Method by D. Marsini

   È il telaio su cui si innestano tutti gli altri moduli. Contiene:
     1. DesignSystem ..... variabili CSS, gerarchia dei grigi, animazioni
     2. BrandMark + AppHeader ... header istituzionale, IDENTICO al blocco
                            approvato in AuthView/Login: stesso componente
                            logo (SVG gradient animato via SMIL), stesso
                            wordmark "PERFORM" cangiante (performGlow),
                            stessa firma del coach.
     3. BottomBar ........ 4 icone fisse, elastiche in stile iPhone,
                            etichetta sans-serif microscopica solo sulla
                            tab attiva
     4. AppShell ......... contenitore che monta header, contenuto, barra
     5. Placeholder / NewsScreen / RankingScreen ... contenuti di raccordo
        per i moduli non ancora innestati (Home e Profilo arrivano da
        HomeDashboard e ClientProfile tramite la prop `screens`)

   TAB DEFINITIVE:
     1. Home         -> screens.home     (HomeDashboard)
     2. News & Tips  -> screens.news     (scheda editoriale indipendente,
                                            sola lettura — nessun social)
     3. Classifica   -> screens.ranking  (Top 10 anonima punti XP)
     4. Profilo      -> screens.profile  (ClientProfile)

   NOTA DI PORTING (dal blocco AuthView incollato):
     Il markup originale è pensato per una card centrata a piena pagina
     (icona grande 68px, testo centrato, firma in absolute top-right sulla
     card). Qui l'header è una barra orizzontale sticky: ho mantenuto
     IDENTICI componente, gradienti, keyframes e valori di stile — ho
     adattato solo il CONTENITORE (icona più piccola in coerenza con
     l'altezza della barra, riga invece di colonna, firma in flex invece
     che absolute). Nessun colore, nessuna curva di animazione è stata
     cambiata rispetto all'originale.

   GERARCHIA DEI COLORI IN ONYX (come stabilito):
     #FAFAFA  testi primari — titoli, valori, nomi
     #A1A1AA  testi secondari — etichette, meta, sottotitoli
     #E4E4E7  corpo dei paragrafi lunghi
   ========================================================================== */

import React, { useState, useEffect, useId } from "react";
import { BarChart3, Newspaper, Trophy, User, Settings, Activity, SlidersHorizontal, ShieldCheck } from "lucide-react";

export const BRAND = {
  gold: "#C5A059",
  goldDeep: "#8C6E33",
  rose: "#D4A5A5",
  roseDeep: "#9D6666",
};

/* Unico varco d'accesso al Coach Panel: solo questa email sblocca il quinto
   pulsante nella barra di navigazione. In produzione il controllo va fatto
   lato Supabase (RLS / ruolo utente), non solo sul client — qui è simulato
   in stato locale solo per il test nell'anteprima isolata. */
export const COACH_EMAIL = "danielmarsini@coach.com";

export const accentFor = (gender, dark) =>
  gender === "F" ? (dark ? BRAND.rose : BRAND.roseDeep) : (dark ? BRAND.gold : BRAND.goldDeep);

/* ---- costanti del blocco AuthView, dichiarate una sola volta a livello di modulo ---- */
const GOLD_GRADIENT_LIGHT = "linear-gradient(100deg, #8C6E33, #D9B36A, #C5A059, #B8924A, #8C6E33)";
const GOLD_GRADIENT_DARK  = "linear-gradient(100deg, #C5A059, #F0DCA0, #8C6E33, #E9CD82, #C5A059)";
const SOFT = "#A1A1AA";

/* ============================================================================
   1 · DESIGN SYSTEM
   Font geometrico lineare a tappeto: system-ui, -apple-system,
   BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif (risolve in San
   Francisco su Apple, Segoe UI su Windows). IBM Plex Mono resta riservato
   ai soli dati numerici (cifre XP, codici atleta).
   ========================================================================== */

export function DesignSystem() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      .app-root {
        --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-family: var(--font-sans);
        -webkit-font-smoothing: antialiased;

        /* superfici */
        --page:      #FFFFFF;
        --surface:   #FFFFFF;
        --surface-2: #FCFCFD;
        --line:      rgba(17,17,17,0.06);
        --shadow:    0 8px 30px rgba(0,0,0,0.02);

        /* gerarchia dei testi */
        --ink:       #1A1A1A;   /* primari */
        --ink-2:     #8E8E93;   /* secondari */
        --ink-3:     #52525B;   /* paragrafi lunghi */

        /* fascia superiore e inferiore */
        --bar:       rgba(255,255,255,0.88);
        --bar-line:  rgba(17,17,17,0.06);
      }

      .app-root[data-theme="dark"] {
        --page:      #09090B;
        --surface:   #18181B;
        --surface-2: #131316;
        --line:      rgba(255,255,255,0.07);
        --shadow:    0 8px 30px rgba(0,0,0,0.38);

        --ink:       #FAFAFA;   /* primari */
        --ink-2:     #A1A1AA;   /* secondari */
        --ink-3:     #E4E4E7;   /* paragrafi lunghi */

        --bar:       rgba(9,9,11,0.88);
        --bar-line:  rgba(255,255,255,0.09);
      }

      /* Sfondo vivo — due macchie di luce morbide (oro/rosa) su fondo
         scuro/chiaro, stile "photo backdrop" da studio (secondo riferimento
         del coach: due bagliori sfumati eleganti, non nastri/scintille del
         primo tentativo). Ogni macchia è un radial-gradient enorme e molto
         sfocato che deriva lentamente di posizione — mai ferma, ma un
         movimento impercettibile, non una luce che lampeggia o scorre. */
      .live-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
      .live-bg-blob {
        position: absolute; width: 70vmax; height: 70vmax; border-radius: 50%;
        filter: blur(60px); will-change: transform;
      }
      .live-bg-blob-1 { top: -10%; right: -20%; animation: liveBgDrift1 26s ease-in-out infinite; }
      .live-bg-blob-2 { bottom: -25%; left: -20%; animation: liveBgDrift2 32s ease-in-out infinite; }
      @keyframes liveBgDrift1 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(-6%, 6%) scale(1.08); }
      }
      @keyframes liveBgDrift2 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(6%, -6%) scale(1.1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .live-bg-blob-1, .live-bg-blob-2 { animation: none; }
      }

      /* --- tipografia ----------------------------------------------------
         Ogni etichetta, label e micro-testo eredita var(--font-sans) da
         .app-root. .font-data resta l'unica eccezione, per le cifre. */
      .font-brand { font-family: var(--font-sans); }
      .font-data  { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .font-nav   { font-family: var(--font-sans); }

      /* Filo di profondità sui titoli grandi — appena percettibile, non un
         drop-shadow vistoso: la differenza fra "scritto" e "inciso". */
      .h1 { color: var(--ink); font-size: 1.45rem; font-weight: 400; letter-spacing: 0.02em; text-shadow: 0 1px 0 rgba(255,255,255,0.4); }
      .app-root[data-theme="dark"] .h1 { text-shadow: 0 1px 1px rgba(0,0,0,0.4); }
      .h2 { color: var(--ink); font-size: 1.12rem; font-weight: 500; letter-spacing: 0.01em; }
      .body { color: var(--ink-3); font-size: 0.9rem; line-height: 1.6; }
      .meta { color: var(--ink-2); font-size: 0.82rem; }
      .label {
        font-family: var(--font-sans);
        color: var(--ink-2);
        font-size: 0.62rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-weight: 500;
      }

      /* --- superfici ---------------------------------------------------- */
      /* Profondità reale invece di un bordo piatto: ombra a due strati
         (contatto stretto + alone ampio) più un filo di luce in cima, lo
         stesso principio che rende "solide" le card iOS/Instagram invece
         che ritagli di carta. Sempre CSS puro: nessuna funzionalità tocca. */
      .card {
        background-color: var(--surface);
        border: 1px solid var(--line);
        box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(17,17,17,0.04), var(--shadow);
        border-radius: 1rem;
        padding: 1.5rem;
      }
      .app-root[data-theme="dark"] .card {
        box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.3), var(--shadow);
      }
      .card-tap { transition: transform 0.2s ease, box-shadow 0.25s ease; }
      .card-tap:active { transform: scale(0.985); }
      .inner {
        background-color: var(--surface-2);
        border: 1px solid var(--line);
        border-radius: 0.85rem;
      }
      .input {
        background-color: var(--surface);
        border: 1px solid var(--line);
        color: var(--ink);
        border-radius: 0.7rem;
        font-size: 0.95rem;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .input::placeholder { color: var(--ink-2); }
      .input:focus { outline: none; border-color: var(--ink-2); box-shadow: 0 0 0 3px rgba(197,160,89,0.16); }

      /* --- bottoni con rilievo reale -------------------------------------
         Un solo posto da cui discendono TUTTI i pulsanti pieni scuri
         dell'app cliente (Invia check, Conferma, Salva, Segnala…): rilievo
         a riposo, si "solleva" leggermente all'hover, si schiaccia davvero
         al tap invece del solo scale() secco che c'era prima. */
      .btn-3d {
        position: relative;
        box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 10px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.12);
        transition: transform 0.14s cubic-bezier(0.22,1,0.36,1), box-shadow 0.14s ease, opacity 0.15s ease;
      }
      .btn-3d:active {
        transform: translateY(1px) scale(0.98);
        box-shadow: 0 1px 2px rgba(0,0,0,0.18) inset;
      }
      @media (hover: hover) {
        .btn-3d:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,0.22) inset, 0 7px 16px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.14); }
      }
      @media (prefers-reduced-motion: reduce) { .btn-3d, .btn-3d:active, .btn-3d:hover { transition: none; transform: none; } }

      /* Campo di ricerca alimenti: nero pieno, mai grigio */
      .search-strong { color: #111111 !important; font-weight: 600; }
      .app-root[data-theme="dark"] .search-strong { color: #FAFAFA !important; }

      /* --- contrasto bidirezionale sui fondi fissi ---------------------- */
      .on-light, .on-light * { color: #111111 !important; }
      .on-dark,  .on-dark  * { color: #FAFAFA !important; }
      .on-dark .meta, .on-dark .label { color: #A1A1AA !important; }
      .on-dark .body { color: #E4E4E7 !important; }

      /* --- blocco AuthView: wordmark PERFORM cangiante -------------------
         Identico all'originale approvato in login: stessa keyframe, stesso
         background-size, stesso timing. */
      @keyframes performGlow {
        0%, 100% { background-position: 0% 50%; }
        50%      { background-position: 100% 50%; }
      }
      .perform-title {
        background-size: 220% auto;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: performGlow 5s ease-in-out infinite;
        display: inline-block;
      }
      .perform-btn {
        background-size: 220% auto;
        animation: performGlow 5s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .perform-title, .perform-btn { animation: none; }
      }

      /* --- movimento ---------------------------------------------------- */
      @keyframes springIn {
        0%   { opacity: 0; transform: translateY(10px) scale(0.985); }
        55%  { opacity: 1; transform: translateY(-2px) scale(1.004); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .spring-in { animation: springIn 0.3s cubic-bezier(0.22, 1.2, 0.36, 1) both; will-change: transform, opacity; }

      @keyframes bubblePop {
        0%   { transform: scale(0.4); opacity: 0.5; }
        70%  { transform: scale(1.25); opacity: 0.16; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      .bubble { animation: bubblePop 0.42s cubic-bezier(0.22, 1.2, 0.36, 1) both; }

      /* Rimbalzo elastico 3D della tab premuta, stile iPhone */
      @keyframes tabBounce3D {
        0%   { transform: perspective(300px) scale(1) translateY(0) rotateX(0deg); }
        35%  { transform: perspective(300px) scale(1.32) translateY(-7px) rotateX(8deg); }
        65%  { transform: perspective(300px) scale(0.94) translateY(1px) rotateX(-3deg); }
        100% { transform: perspective(300px) scale(1) translateY(0) rotateX(0deg); }
      }
      .tab-bounce { animation: tabBounce3D 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

      @keyframes labelIn {
        from { opacity: 0; transform: translateY(-3px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .label-in { animation: labelIn 0.26s ease-out both; }

      @keyframes skeletonPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
      .skeleton { background: var(--surface-2); animation: skeletonPulse 1.3s ease-in-out infinite; border-radius: 0.75rem; }
      .app-root[data-theme="dark"] .skeleton { background: #232327; }

      @media (prefers-reduced-motion: reduce) {
        .spring-in, .bubble, .label-in, .skeleton, .tab-bounce { animation: none !important; }
      }
    `}</style>
  );
}

/* ============================================================================
   2 · BRAND MARK — logo istituzionale
   Componente identico a quello del blocco AuthView incollato: box nero in
   tema chiaro / bianco in tema Onyx, icona con gradiente SVG animato via
   SMIL <animate>, velo lucido diagonale. Unica differenza rispetto
   all'originale: qui viene istanziato più piccolo (size) perché vive
   dentro una barra orizzontale e non in una card centrata a piena pagina.
   ========================================================================== */

function BrandMark({ dark = false, size = 36 }) {
  const uid = useId();
  const gradId = `performIconGrad-${uid}`;
  // il box è nero in tema chiaro e bianco in tema Onyx (per contrasto):
  // scegliamo la sfumatura oro pensata per quello sfondo specifico.
  const boxIsBlack = !dark;
  const stops = boxIsBlack
    ? ["#C5A059", "#F0DCA0", "#8C6E33", "#E9CD82", "#C5A059"]   // oro brillante, leggibile su nero
    : ["#8C6E33", "#D9B36A", "#C5A059", "#B8924A", "#8C6E33"];  // oro profondo, leggibile su bianco
  const sheen = boxIsBlack ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.09)";
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{ width: size, height: size, borderRadius: 10, backgroundColor: boxIsBlack ? "#111111" : "#FFFFFF" }}
    >
      {/* velo lucido — la luce che rende il blocco "vivo", non piatto */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${sheen} 0%, rgba(0,0,0,0) 48%)` }}
      />
      {/* definizione della sfumatura animata, riferita dall'icona sotto */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stops[0]}>
              {!reducedMotion && <animate attributeName="stop-color" values={stops.join(";")} dur="5s" repeatCount="indefinite" />}
            </stop>
            <stop offset="100%" stopColor={stops[2]}>
              {!reducedMotion && <animate attributeName="stop-color" values={stops.join(";")} dur="5s" begin="-1.6s" repeatCount="indefinite" />}
            </stop>
          </linearGradient>
        </defs>
      </svg>
      <Activity
        size={size * 0.46}
        strokeWidth={2.2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        color={`url(#${gradId})`}
        style={{ position: "relative", zIndex: 1 }}
      />
    </div>
  );
}

/* ============================================================================
   3 · HEADER ISTITUZIONALE DEFINITIVO
   Stesso BrandMark, stesso wordmark "PERFORM" cangiante (performGlow +
   GOLD_GRADIENT_LIGHT/DARK), stessa firma del coach — riga orizzontale
   invece di card centrata, per vivere in una sticky bar.
   ========================================================================== */

export function AppHeader({ dark, accent, userLabel, onOpenSettings }) {
  return (
    <header
      className="sticky top-0 z-30"
      style={{
        backgroundColor: dark ? "rgba(9,9,11,0.88)" : "rgba(255,255,255,0.88)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(17,17,17,0.06)"}`,
        // viewport-fit=cover (index.html) fa disegnare la pagina fin sotto la
        // notch/isola dinamica su iPhone: senza questo padding, logo e
        // ingranaggio finivano sotto l'orologio/batteria del sistema invece
        // che sotto. env() torna 0 su schermi senza notch, innocuo ovunque.
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark dark={dark} size={36} />
          <p
            className="font-brand perform-title leading-none truncate"
            style={{
              fontSize: "1.05rem",
              fontWeight: 600,
              letterSpacing: "0.36em",
              paddingLeft: "0.36em",
              backgroundImage: dark ? GOLD_GRADIENT_DARK : GOLD_GRADIENT_LIGHT,
            }}
          >
            PERFORM
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className="uppercase hidden sm:inline truncate"
            style={{ color: SOFT, fontSize: "0.5rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.04em" }}
          >
            Evidence-Based Method by D. Marsini
          </span>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 shrink-0"
              style={{
                border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(17,17,17,0.08)"}`,
                backgroundColor: dark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
              }}
              aria-label="Impostazioni"
            >
              <Settings size={17} strokeWidth={1.6} style={{ color: dark ? "#FAFAFA" : "#111111" }} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ============================================================================
   4 · BOTTOM BAR — 4 pulsanti standard + 1 pulsante protetto (Coach Panel)
   La tab attiva riceve lo STESSO trattamento del logo in header: un
   medaglione nero/bianco (a seconda del tema, come il box del BrandMark)
   con l'icona colorata da un gradiente oro animato via SMIL <animate>, più
   un rilievo 3D (sheen diagonale, ombra esterna, bordo lucido). L'etichetta
   sotto usa la stessa classe `.perform-title` del wordmark "PERFORM", quindi
   lo stesso identico shimmer, non un'imitazione.

   Il quinto pulsante "Coach Panel" NON è mai una delle quattro tab
   standard: viene aggiunto in coda solo se `isCoach` è true. Per un
   atleta Free o Paid, `tabs` ha sempre e solo 4 elementi.
   ========================================================================== */

export const TABS = [
  { id: "home",    icon: BarChart3, label: "Home" },
  { id: "news",    icon: Newspaper, label: "News & Tips" },
  { id: "ranking", icon: Trophy,    label: "Classifica" },
  { id: "profile", icon: User,      label: "Profilo" },
];

export const COACH_TAB = { id: "coach", icon: SlidersHorizontal, label: "Coach Panel" };

/* Stessi stop-color del BrandMark: oro brillante su nero, oro profondo su
   bianco. Fattorizzati qui perché ora servono in due punti (logo + tab). */
function goldStopsFor(boxIsBlack) {
  return boxIsBlack
    ? ["#C5A059", "#F0DCA0", "#8C6E33", "#E9CD82", "#C5A059"]
    : ["#8C6E33", "#D9B36A", "#C5A059", "#B8924A", "#8C6E33"];
}

/* Un singolo pulsante di navigazione. Componente a parte (non una funzione
   inline nel .map) perché ha bisogno di useId per il proprio gradiente SVG:
   gli hook vanno chiamati dentro un vero componente, non in un callback. */
function NavButton({ id, Icon, label, on, dark, accent, idle, burst, onPick, isCoachTab }) {
  const uid = useId();
  const gradId = `navIconGrad-${uid}`;
  const boxIsBlack = !dark;
  const stops = goldStopsFor(boxIsBlack);
  const sheen = boxIsBlack ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.09)";
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bouncing = burst === id;

  return (
    <button
      onClick={() => onPick(id)}
      className="relative flex flex-col items-center justify-center gap-1"
      style={{ paddingTop: 10, paddingBottom: on ? 7 : 16, minHeight: 62 }}
      aria-label={label}
      aria-current={on ? "page" : undefined}
      title={label}
    >
      {bouncing && (
        <span
          className="bubble absolute rounded-full"
          style={{ top: 6, width: 44, height: 44, backgroundColor: accent }}
        />
      )}

      {on ? (
        /* --- medaglione 3D: stesso trattamento del BrandMark in header --- */
        <span
          className={`relative flex items-center justify-center overflow-hidden ${bouncing ? "tab-bounce" : ""}`}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: boxIsBlack ? "#111111" : "#FFFFFF",
            boxShadow: boxIsBlack
              ? "0 5px 14px rgba(0,0,0,0.34), 0 1px 0 rgba(255,255,255,0.06) inset"
              : "0 5px 14px rgba(140,110,51,0.28), 0 1px 0 rgba(255,255,255,0.7) inset",
          }}
        >
          {/* velo lucido diagonale — stesso identico effetto del logo */}
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: `linear-gradient(135deg, ${sheen} 0%, rgba(0,0,0,0) 48%)` }}
          />
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={stops[0]}>
                  {!reducedMotion && (
                    <animate attributeName="stop-color" values={stops.join(";")} dur="5s" repeatCount="indefinite" />
                  )}
                </stop>
                <stop offset="100%" stopColor={stops[2]}>
                  {!reducedMotion && (
                    <animate attributeName="stop-color" values={stops.join(";")} dur="5s" begin="-1.6s" repeatCount="indefinite" />
                  )}
                </stop>
              </linearGradient>
            </defs>
          </svg>
          <Icon size={17} strokeWidth={2.1} color={`url(#${gradId})`} style={{ position: "relative", zIndex: 1 }} />
          {isCoachTab && (
            <ShieldCheck
              size={10}
              strokeWidth={2.6}
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                color: BRAND.goldDeep,
                backgroundColor: boxIsBlack ? "#111111" : "#FFFFFF",
                borderRadius: 999,
              }}
            />
          )}
        </span>
      ) : (
        /* --- stato inattivo: piatto, minimale, nessun rilievo --- */
        <span className="relative flex items-center justify-center" style={{ width: 34, height: 34 }}>
          <Icon size={22} strokeWidth={1.7} style={{ color: idle, transition: "color 0.3s ease" }} />
          {isCoachTab && (
            <ShieldCheck
              size={10}
              strokeWidth={2.4}
              style={{ position: "absolute", top: 2, right: 2, color: idle }}
            />
          )}
        </span>
      )}

      {on && (
        <span
          className="label-in font-nav perform-title uppercase whitespace-nowrap"
          style={{
            fontSize: "0.52rem",
            letterSpacing: "0.13em",
            fontWeight: 700,
            backgroundImage: dark ? GOLD_GRADIENT_DARK : GOLD_GRADIENT_LIGHT,
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

export function BottomBar({ active, onSelect, accent, dark, isCoach = false }) {
  const [burst, setBurst] = useState(null);
  const idle = dark ? "#71717A" : "#A1A1AA";

  const tabs = isCoach ? [...TABS, COACH_TAB] : TABS;

  const pick = (id) => {
    setBurst(id);
    setTimeout(() => setBurst(null), 500);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    onSelect(id);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        backgroundColor: dark ? "rgba(9,9,11,0.88)" : "rgba(255,255,255,0.88)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        borderTop: `1px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(17,17,17,0.06)"}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Navigazione principale"
    >
      {/* grid-template-columns inline: il numero di colonne è dinamico
          (4 o 5), quindi non può essere una classe Tailwind statica */}
      <div
        className="max-w-2xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ id, icon: Icon, label }) => (
          <NavButton
            key={id}
            id={id}
            Icon={Icon}
            label={label}
            on={active === id}
            dark={dark}
            accent={accent}
            idle={idle}
            burst={burst}
            onPick={pick}
            isCoachTab={id === "coach"}
          />
        ))}
      </div>
    </nav>
  );
}

/* ============================================================================
   5 · APP SHELL
   Monta header, contenuto e barra. Home e Profilo arrivano dal chiamante
   tramite `screens` (HomeDashboard, ClientProfile — file a sé). News e
   Classifica hanno un contenuto di raccordo integrato in questo file,
   sostituibile allo stesso modo via `screens.news` / `screens.ranking`.
   ========================================================================== */

/* Sfondo vivo di tutta l'app: due macchie di luce morbide (oro per l'uomo,
   rosa cipria per la donna) su fondo scuro/chiaro, stile "photo backdrop"
   da studio — secondo riferimento fornito dal coach (due bagliori sfumati
   su nero, elegante, non nastri/scintille come il primo tentativo). Fisso
   dietro a tutto il contenuto (z-index:0, le card restano --surface pieno
   sopra e sempre leggibili), non intercetta il tocco (pointer-events:none).
   Mai un'immagine esterna: qui ricreato in puro CSS (radial-gradient +
   blur, animazione di posizione lenta) invece di un asset stock statico. */
function LiveBackground({ gender, dark }) {
  const isFemale = gender === "F";
  const bright = isFemale ? "#F4E0E6" : "#F0DCA0";
  const deep = isFemale ? "#9D6666" : "#8C6E33";
  const op1 = dark ? 0.5 : 0.22;
  const op2 = dark ? 0.4 : 0.16;
  return (
    <div className="live-bg" aria-hidden="true" style={{ backgroundColor: "var(--page)" }}>
      <div className="live-bg-blob live-bg-blob-1"
           style={{ background: `radial-gradient(closest-side, ${bright}, transparent)`, opacity: op1 }} />
      <div className="live-bg-blob live-bg-blob-2"
           style={{ background: `radial-gradient(closest-side, ${deep}, transparent)`, opacity: op2 }} />
    </div>
  );
}

export function AppShell({
  gender = "M",
  dark = false,
  onToggleDark,
  userLabel,
  userEmail = "",        // usata SOLO per determinare l'accesso al Coach Panel
  tab,
  onTabChange,
  onOpenSettings,
  screens = {},          // { home, news, ranking, profile, coach }
}) {
  const accent = accentFor(gender, dark);

  /* Confronto case-insensitive e senza spazi accidentali: unico varco. */
  const isCoach = userEmail.trim().toLowerCase() === COACH_EMAIL;

  /* Il tema segue anche la preferenza di sistema al primo avvio */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia || dark) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.matches && onToggleDark) onToggleDark(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Se un utente non-coach si ritrova su tab "coach" (link diretto, stato
     residuo, manomissione client-side...) lo si riporta su Home invece di
     mostrargli il pannello: la protezione non è solo visiva. */
  useEffect(() => {
    if (tab === "coach" && !isCoach && onTabChange) onTabChange("home");
  }, [tab, isCoach, onTabChange]);

  const fallback = {
    home:    <Placeholder tab="home" />,
    news:    <NewsScreen />,
    ranking: <RankingScreen />,
    profile: <Placeholder tab="profile" />,
    coach:   <CoachPanelPlaceholder />,
  };

  const activeTab = tab === "coach" && !isCoach ? "home" : tab;

  // BUG PRESO: <div key={activeTab}> qui sotto forzava React a SMONTARE e
  // rimontare da zero l'intera schermata a OGNI cambio tab (Home/News/
  // Classifica/Profilo) — anche per una tab già visitata pochi secondi
  // prima. Ogni rimonto rilanciava da capo tutti i fetch Supabase di quella
  // schermata (scheda assegnata, daily_metrics, nutrition_logs...), e per
  // la durata di quei fetch si vedeva il suo stato di caricamento — da qui
  // il "si ricarica ogni volta" e il lampo scuro riportato. Ora ogni tab,
  // una volta visitata, resta montata (solo nascosta con display:none):
  // cambiare tab torna a mostrarla così com'era, senza rifare nulla. Il
  // costo è la piccola animazione di ingresso (spring-in) che prima si
  // rivedeva a ogni switch — non si vede più dalla seconda visita in poi,
  // scambio corretto per una navigazione che non lampeggia.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  useEffect(() => {
    setVisitedTabs((v) => (v.has(activeTab) ? v : new Set(v).add(activeTab)));
  }, [activeTab]);

  // Stessa correzione di HomeDashboard: cambiare tab (Home/News/Classifica/
  // Profilo) non deve lasciare la nuova schermata scrollata dov'era rimasta
  // quella precedente.
  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);

  return (
    <div
      className="app-root min-h-screen"
      data-theme={dark ? "dark" : "light"}
      style={{ backgroundColor: "var(--page)", transition: "background-color 0.4s ease" }}
    >
      <DesignSystem />
      <LiveBackground gender={gender} dark={dark} />

      {/* position:relative + z-index:1: garantisce che tutto il contenuto
          reale stia SEMPRE sopra a .live-bg (position:fixed, z-index:0),
          senza affidarsi alle regole di stacking di default del browser
          per elementi non posizionati (che possono variare). */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <AppHeader
          dark={dark}
          accent={accent}
          userLabel={userLabel}
          onOpenSettings={onOpenSettings}
        />

        <main className="max-w-2xl mx-auto px-4 py-6" style={{ paddingBottom: 108 }}>
          {[...visitedTabs].map((key) => (
            <div key={key} className={key === activeTab ? "spring-in" : undefined}
                 style={{ display: key === activeTab ? "block" : "none", minHeight: "calc(100vh - 230px)" }}>
              {screens[key] ?? fallback[key]}
            </div>
          ))}
        </main>

        <BottomBar active={activeTab} onSelect={onTabChange} accent={accent} dark={dark} isCoach={isCoach} />
      </div>
    </div>
  );
}

/* ============================================================================
   6 · SEGNAPOSTO GENERICO
   Compare dove Home o Profilo non sono ancora innestati (HomeDashboard e
   ClientProfile restano file a sé, per non attivare moduli esterni qui).
   ========================================================================== */

const DESC = {
  home:    ["Home", "Riepilogo del giorno, card Bio-Feed, finestre di allenamento, dieta, integrazione e recupero."],
  profile: ["Profilo", "Foto, nickname, bio, badge anzianità, storico check, peso, circonferenze e PR."],
};

export function Placeholder({ tab }) {
  const [title, text] = DESC[tab] || ["Sezione", "In arrivo."];
  return (
    <div className="card text-center py-12">
      <p className="h1 mb-2">{title}</p>
      <p className="body max-w-xs mx-auto">{text}</p>
      <p className="label mt-5">Modulo in arrivo</p>
    </div>
  );
}

/* ============================================================================
   6bis · COACH PANEL — segnaposto protetto
   Visibile solo se isCoach === true (vedi AppShell). Non è il modulo vero
   e proprio (Whitelist/admin, AI programming assistant, hub ormonale,
   marker ematici, editor protocollo nutrizionale, report mensili,
   scheduling videocall — vedi roadmap) ma il punto di innesto futuro.
   ========================================================================== */

export function CoachPanelPlaceholder() {
  return (
    <div className="card text-center py-12">
      <div
        className="mx-auto mb-4 w-11 h-11 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${BRAND.goldDeep}1A` }}
      >
        <ShieldCheck size={20} strokeWidth={1.8} style={{ color: BRAND.goldDeep }} />
      </div>
      <p className="h1 mb-2">Coach Panel</p>
      <p className="body max-w-xs mx-auto">
        Area riservata al coach: whitelist atleti, assistente AI di programmazione,
        hub ormonale, marker ematici, editor del protocollo nutrizionale, report
        mensili, scheduling videocall.
      </p>
      <p className="label mt-5">Modulo privato in arrivo</p>
    </div>
  );
}

/* ============================================================================
   7 · NEWS & TIPS
   Punto di reindirizzamento per la scheda editoriale indipendente.
   Sola lettura, nessuna interazione sociale: niente feed, commenti o chat.
   ========================================================================== */

const NEWS_PREVIEW = [
  { tag: "Metodo",        title: "Perché il recupero conta quanto lo stimolo",       read: "4 min" },
  { tag: "Nutrizione",    title: "Timing dei carboidrati nelle settimane di carico",  read: "6 min" },
  { tag: "Aggiornamento", title: "Nuove linee guida sull'integrazione di creatina",   read: "3 min" },
];

export function NewsScreen() {
  return (
    <>
      <div className="card mb-4">
        <p className="h2 mb-1">News &amp; Tips</p>
        <p className="body">
          Scheda editoriale indipendente e in sola lettura. Contenuti selezionati dal coach:
          niente feed sociale, niente commenti, niente chat tra atleti.
        </p>
      </div>

      {NEWS_PREVIEW.map((item, i) => (
        <div key={i} className="card card-tap mb-3">
          <p className="label mb-2">{item.tag}</p>
          <p className="h2 mb-1">{item.title}</p>
          <p className="meta">{item.read} di lettura</p>
        </div>
      ))}

      <p className="label text-center mt-4">Modulo editoriale — collegamento in arrivo</p>
    </>
  );
}

/* ============================================================================
   8 · CLASSIFICA
   Top 10 anonima dei punti XP: nessun nome reale, nessuna foto — solo un
   codice atleta, il badge veterano e il punteggio.
   ========================================================================== */

const XP_TOP10 = [
  { rank: 1,  code: "ATL-014", xp: 4820, you: false },
  { rank: 2,  code: "ATL-072", xp: 4615, you: false },
  { rank: 3,  code: "ATL-031", xp: 4390, you: false },
  { rank: 4,  code: "ATL-058", xp: 4102, you: true  },
  { rank: 5,  code: "ATL-009", xp: 3950, you: false },
  { rank: 6,  code: "ATL-047", xp: 3780, you: false },
  { rank: 7,  code: "ATL-023", xp: 3605, you: false },
  { rank: 8,  code: "ATL-066", xp: 3410, you: false },
  { rank: 9,  code: "ATL-011", xp: 3255, you: false },
  { rank: 10, code: "ATL-039", xp: 3080, you: false },
];

export function RankingScreen({ accent = BRAND.goldDeep }) {
  return (
    <>
      <div className="card mb-4">
        <p className="label mb-2">Classifica</p>
        <p className="h1 mb-1">Top 10 · Punti XP</p>
        <p className="meta">Anonima per costruzione: solo codice atleta, nessun nome o foto.</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {XP_TOP10.map((row, i) => (
          <div
            key={row.code}
            className="flex items-center justify-between px-5 py-3"
            style={{
              borderBottom: i < XP_TOP10.length - 1 ? "1px solid var(--line)" : "none",
              backgroundColor: row.you ? `${accent}14` : "transparent",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="font-data" style={{ color: "var(--ink-2)", fontSize: "0.8rem", width: 22 }}>
                {row.rank}
              </span>
              <span className="font-data" style={{ color: "var(--ink)", fontSize: "0.9rem" }}>
                {row.code}
              </span>
              {row.you && (
                <span className="label" style={{ color: accent }}>TU</span>
              )}
            </div>
            <span className="font-data" style={{ color: "var(--ink)", fontSize: "0.9rem", fontWeight: 600 }}>
              {row.xp.toLocaleString("it-IT")} XP
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================================================================
   9 · ANTEPRIMA — da eliminare in produzione
   Serve a vedere il telaio funzionare e a verificare la gerarchia dei grigi.
   Dati simulati in locale: nessun modulo esterno viene attivato.
   ========================================================================== */

export default function ShellPreview() {
  const [dark, setDark] = useState(false);
  const [gender, setGender] = useState("M");
  const [tab, setTab] = useState("home");
  /* Simulazione locale del login, solo per questa anteprima isolata:
     in produzione userEmail arriva dalla sessione Supabase Auth. */
  const [userEmail, setUserEmail] = useState("marco.bianchi@gmail.com");
  const isCoachDemo = userEmail.trim().toLowerCase() === COACH_EMAIL;

  const demoHome = (
    <>
      <div className="card mb-4">
        <p className="label mb-2">Verifica della gerarchia</p>
        <p className="h1 mb-1">Titolo primario</p>
        <p className="meta mb-3">Testo secondario: etichette, meta, sottotitoli</p>
        <p className="body">
          Corpo del paragrafo lungo. In Onyx questo testo usa #E4E4E7, i titoli #FAFAFA e i
          secondari #A1A1AA: tre livelli distinti, così la lettura resta gerarchica invece di
          appiattirsi su un unico bianco.
        </p>
      </div>

      <div className="card mb-4">
        <p className="label mb-3">Contrasto sui fondi fissi</p>
        <div className="on-light rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <p className="text-sm">Avviso su fondo chiaro: testo nero anche in Onyx.</p>
        </div>
        <div className="on-dark rounded-xl px-4 py-3" style={{ backgroundColor: "#111111" }}>
          <p className="text-sm">Blocco su fondo scuro: testo chiaro anche in Light.</p>
        </div>
      </div>

      <div className="card">
        <p className="label mb-2">Campo di ricerca</p>
        <input className="input search-strong w-full px-4 py-3" placeholder="Cerca alimento…" />
        <p className="meta mt-2">Testo nero pieno in Light, #FAFAFA in Onyx.</p>
      </div>
    </>
  );

  return (
    <>
      <div className="fixed top-3 right-3 z-50 flex gap-2">
        <button onClick={() => setDark((v) => !v)} className="text-xs px-3 py-2 rounded-full"
          style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF" }}>
          {dark ? "Light" : "Onyx"}
        </button>
        <button onClick={() => setGender((g) => (g === "M" ? "F" : "M"))} className="text-xs px-3 py-2 rounded-full"
          style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF" }}>
          {gender === "M" ? "Oro" : "Rosa"}
        </button>
        <button
          onClick={() => setUserEmail((e) => (isCoachDemo ? "marco.bianchi@gmail.com" : COACH_EMAIL))}
          className="text-xs px-3 py-2 rounded-full"
          style={{
            backgroundColor: isCoachDemo ? BRAND.goldDeep : (dark ? "#FAFAFA" : "#111111"),
            color: isCoachDemo ? "#FFFFFF" : (dark ? "#09090B" : "#FFFFFF"),
          }}
          title={`Login simulato: ${userEmail}`}
        >
          {isCoachDemo ? "👤 Coach" : "🏃 Atleta"}
        </button>
      </div>

      <AppShell
        gender={gender}
        dark={dark}
        onToggleDark={() => {}}
        userLabel="Marco Bianchi"
        userEmail={userEmail}
        tab={tab}
        onTabChange={setTab}
        onOpenSettings={() => setDark((v) => !v)}
        screens={{ home: demoHome }}
      />
    </>
  );
}
