/* ============================================================================
   LandingIntro.jsx — la "porta d'ingresso" pubblica dell'app.
   ----------------------------------------------------------------------------
   Spostato qui da 11_OnboardingFlow.jsx (dove viveva come AppIntroTutorial,
   mostrato DOPO la registrazione, subito prima della scelta del piano):
   prima di chiedere un account o una carta di credito, va costruita
   l'aspettativa — un visitatore che non si è ancora registrato deve vedere
   perché PERFORM è diverso, non scoprirlo solo dopo aver già creato un
   account. Il flusso ora è Landing → Login/Registrazione (AuthScreen) →
   scelta del piano (OnboardingFlow, che non mostra più questo stesso
   contenuto una seconda volta).

   Nessun dato reale qui dentro: solo presentazione. Gender non è ancora
   noto (nessun account esiste ancora a questo punto) — usa sempre la
   variante Oro Lucido (gender "M"), lo stesso default già in uso in
   App.jsx prima che un profilo sia caricato.
   ========================================================================== */

import React, { useState } from "react";
import { BarChart3, Dumbbell, ShieldCheck, Trophy, ChevronRight } from "lucide-react";
import { DesignSystem, LiveBackground } from "./04_AppShell.jsx";
import { GradientText } from "./08_ClientProfileView.jsx";

const INTRO_SLIDES = [
  {
    icon: BarChart3,
    kicker: "Benvenuto in PERFORM",
    title: "Basta rincorrere i tuoi dati su dieci app diverse.",
    body: "Allenamento, alimentazione, recupero, integrazione, progressi: PERFORM raccoglie tutto in un unico posto, pensato per accompagnarti in ogni fase del tuo percorso — non per farti perdere tempo a incrociare numeri tra un'app e l'altra.",
  },
  {
    icon: Dumbbell,
    kicker: "Ogni dato ha uno scopo",
    title: "Tracciato come un atleta vero.",
    body: "Le variabili che spostano davvero i risultati — allenamento, nutrizione, sonno, recupero — monitorate giorno per giorno, per raggiungere i tuoi obiettivi estetici, di performance e di salute con un metodo, non a intuito.",
  },
  {
    icon: ShieldCheck,
    kicker: "Non da solo, mai",
    title: "Al tuo fianco, professionisti veri.",
    body: "Scheda di allenamento e piano alimentare costruiti su misura da un coach in carne e ossa, aggiornati sui tuoi progressi reali — perché nessun algoritmo sostituisce chi ti conosce e ti segue davvero, check dopo check.",
  },
  {
    icon: Trophy,
    kicker: "Pronto a iniziare",
    title: "Mettiti alla prova.",
    body: "Crea il tuo account gratuito e scegli il percorso più adatto a te: inizia oggi il metodo che stavi aspettando.",
  },
];

export default function LandingIntro({ dark, onFinish }) {
  const gender = "M";
  const [slide, setSlide] = useState(0);
  const last = slide === INTRO_SLIDES.length - 1;
  const s = INTRO_SLIDES[slide];
  const Icon = s.icon;

  return (
    <div className="app-root min-h-screen flex flex-col" data-theme={dark ? "dark" : "light"}
         style={{ backgroundColor: "var(--page)" }}>
      <DesignSystem />
      <LiveBackground gender={gender} dark={dark} />
      <div style={{ position: "relative", zIndex: 1 }} className="min-h-screen flex flex-col">
        {/* BUG PRESO: pt-5 fisso non lascia spazio alla barra di stato su
            iPhone da app installata — il pulsante finiva dietro la batteria,
            impossibile da toccare. Stesso pattern env(safe-area-inset-top)
            già usato altrove (04_AppShell.jsx, 05_HomeDashboard.jsx,
            SettingsDrawer). */}
        <div className="flex justify-end px-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
          <button onClick={onFinish} className="text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
            Salta introduzione
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ maxWidth: 480, margin: "0 auto" }}>
          <div key={slide} className="spring-in">
            <div className="mx-auto mb-6 rounded-full flex items-center justify-center"
                 style={{
                   width: 84, height: 84,
                   background: "linear-gradient(135deg, rgba(197,160,89,0.22), rgba(197,160,89,0.06))",
                   border: "1px solid rgba(197,160,89,0.4)",
                   boxShadow: "0 0 40px rgba(197,160,89,0.25)",
                 }}>
              <Icon size={34} style={{ color: "#C5A059" }} />
            </div>

            <p className="font-data mb-3" style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-2)" }}>
              {s.kicker}
            </p>
            <GradientText gender={gender} style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2, display: "block" }}>
              {s.title}
            </GradientText>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {s.body}
            </p>
          </div>
        </div>

        <div className="px-6 pb-10" style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            {INTRO_SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} aria-label={`Vai alla schermata ${i + 1}`}
                className="rounded-full transition-all duration-300"
                style={{ width: i === slide ? 22 : 7, height: 7,
                         backgroundColor: i === slide ? "#C5A059" : "var(--line)" }} />
            ))}
          </div>
          <button onClick={() => (last ? onFinish() : setSlide((v) => v + 1))}
            className="w-full rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-1.5 btn-3d"
            style={{ backgroundColor: "#C5A059", color: "#111111", fontWeight: 700 }}>
            {last ? "Inizia" : "Avanti"} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
