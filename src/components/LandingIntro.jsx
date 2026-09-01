/* ============================================================================
   LandingIntro.jsx — la "porta d'ingresso" pubblica dell'app: il biglietto
   da visita di PERFORM, visto una volta sola prima di qualunque login.
   ----------------------------------------------------------------------------
   Redesign completo (richiesta esplicita): non più 4 slide statiche con un
   fade piatto, ma un vero "mazzo" di schermate collegate fra loro — si
   avanza toccando lo sfondo (come le Storie Instagram) o trascinando come
   si sfoglia un libro, con una transizione di profondità (scala + sfocatura
   + scorrimento) che lega ogni schermata alla successiva invece di
   sostituirla di colpo. Sfondo animato UNICO e persistente sotto tutto il
   mazzo (mai rimontato slide per slide): è quello che dà la sensazione di
   "un tutt'uno" invece di pagine scollegate.

   Contenuto — in ordine, l'arco narrativo richiesto:
     1. Il problema: dati sparsi su dieci app diverse, mai messi a confronto
     2. La soluzione: tutto quello che conta in un unico sistema
     3. Il professionista vero dietro l'app (non un algoritmo)
     4. Anche senza coach: autogestione seria, da atleta vero
     5. Risultati reali (foto prima/dopo — vedi LandingPhoto sotto)
     6. Invito all'azione

   FOTO: nessun dato finto qui dentro. I riquadri prima/dopo e il ritratto
   del coach puntano a file in /public/landing/ (vedi LEGGIMI.txt lì
   dentro) — finché quei file non esistono, compare un placeholder elegante
   (mai una foto finta spacciata per reale). Bastano i file con il nome
   giusto per farli comparire, zero modifiche al codice.
   ========================================================================== */

import React, { useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useReducedMotion } from "framer-motion";
import { Dumbbell, Salad, Moon, ChevronRight, ShieldCheck, Camera, Sparkles } from "lucide-react";
import { DesignSystem, LiveBackground } from "./04_AppShell.jsx";
import { GradientText } from "./08_ClientProfileView.jsx";

/* Bio breve del coach mostrata nella slide "professionista vero" — testo
   volutamente incentrato sul METODO (evidence-based, programmazione reale
   sui tuoi progressi) invece che su credenziali specifiche inventate: se
   vuoi aggiungere titoli/anni di esperienza/certificazioni puntuali,
   modifica questa costante. */
const COACH_NAME = "Daniel Marsini";
const COACH_BIO = "Preparatore e coach evidence-based. Programmazione personalizzata su allenamento, alimentazione e recupero — aggiornata sui tuoi progressi reali, check dopo check.";

/* ----------------------------------------------------------------------
   Foto con fallback elegante: prova a caricare da /landing/<file>, se il
   file non esiste ancora mostra un riquadro placeholder (icona + testo),
   mai una foto finta. Basta aggiungere il file con il nome giusto in
   public/landing/ perché compaia da solo, senza toccare questo codice. */
function LandingPhoto({ file, label, rounded = "1rem" }) {
  const [broken, setBroken] = useState(false);
  const boxStyle = {
    aspectRatio: "3 / 4",
    borderRadius: rounded,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    border: broken ? "1px dashed rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
  if (broken) {
    return (
      <div style={boxStyle}>
        <Camera size={18} style={{ color: "rgba(255,255,255,0.35)" }} />
        <span style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "0 8px", lineHeight: 1.3 }}>
          {label}
        </span>
      </div>
    );
  }
  return (
    <div style={boxStyle}>
      <img src={`/landing/${file}`} alt="" onError={() => setBroken(true)}
           style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

/* Coppia prima/dopo compatta, per la slide "risultati reali". */
function TransformationPair({ n }) {
  return (
    <div className="flex gap-1.5" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <LandingPhoto file={`transformation-${n}-before.jpg`} label="Prima" />
        <span style={{ position: "absolute", top: 6, left: 6, fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.08em",
                       color: "#fff", backgroundColor: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: 999 }}>
          PRIMA
        </span>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <LandingPhoto file={`transformation-${n}-after.jpg`} label="Dopo" />
        <span style={{ position: "absolute", top: 6, left: 6, fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.08em",
                       color: "#111111", backgroundColor: "#C5A059", padding: "2px 6px", borderRadius: 999 }}>
          DOPO
        </span>
      </div>
    </div>
  );
}

/* Anello di compliance in miniatura, autonomo (niente import dal
   05_HomeDashboard.jsx — quel file è enorme e non va caricato solo per
   questa presentazione pre-login): stessa idea visiva dei cerchi veri
   dell'app, così chi si iscrive li riconosce subito appena entra. */
function MiniRing({ pct, label, color, delay, reduce }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={6} />
        <motion.circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={c} transform="rotate(-90 36 36)"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * (pct / 100) }}
          transition={{ duration: reduce ? 0 : 1.15, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{label}</span>
    </div>
  );
}

/* Icona "chip" fluttuante per la slide del problema (dati sparsi). */
function FloatingChip({ icon: Icon, style, delay, reduce }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute", width: 52, height: 52, borderRadius: "1rem",
        backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(6px)", ...style,
      }}>
      <Icon size={20} style={{ color: "rgba(255,255,255,0.55)" }} />
    </motion.div>
  );
}

/* ============================================================================
   Contenuto delle 6 slide — testi + visual dedicato per ciascuna.
   ========================================================================== */
function useSlides(reduce) {
  return [
    {
      kicker: "Il problema",
      title: "Un'app per allenarti. Un'altra per la dieta. Un'altra ancora per il sonno.",
      body: "Dati sparsi, mai messi a confronto — così anche il miglior impegno si perde per strada. Alla fine il quadro completo non lo vede nessuno. Nemmeno tu.",
      visual: (
        <div style={{ position: "relative", width: "100%", height: 140 }}>
          <FloatingChip icon={Dumbbell} style={{ left: "18%", top: 4 }} delay={0.05} reduce={reduce} />
          <FloatingChip icon={Salad} style={{ right: "14%", top: 26 }} delay={0.18} reduce={reduce} />
          <FloatingChip icon={Moon} style={{ left: "42%", bottom: 0 }} delay={0.3} reduce={reduce} />
        </div>
      ),
    },
    {
      kicker: "La soluzione",
      title: "Tutto quello che conta, in un unico posto.",
      body: "Allenamento, alimentazione, recupero, integrazione: un solo sistema che li legge insieme e ti restituisce un quadro vero — per capire cosa funziona davvero, senza perdere tempo a incrociare numeri a mano.",
      visual: (
        <div className="flex items-center justify-center gap-5" style={{ width: "100%", height: 140 }}>
          <MiniRing pct={88} label="Allenamento" color="#C5A059" delay={0.05} reduce={reduce} />
          <MiniRing pct={94} label="Alimentazione" color="#D9B36A" delay={0.2} reduce={reduce} />
          <MiniRing pct={76} label="Recupero" color="#8C6E33" delay={0.35} reduce={reduce} />
        </div>
      ),
    },
    {
      kicker: "Mai da solo, se non vuoi",
      title: "Dietro ogni numero, un professionista vero.",
      body: "Chi sceglie un percorso di coaching ha una scheda e un piano costruiti su misura da chi studia fisiologia, biomeccanica e nutrizione per mestiere — non un algoritmo: una persona che legge i tuoi progressi reali e li aggiorna con te.",
      visual: (
        <div className="flex flex-col items-center gap-3" style={{ width: "100%" }}>
          <div style={{ width: 96 }}>
            <LandingPhoto file="coach-portrait.jpg" label="Foto in arrivo" rounded="999px" />
          </div>
          <div className="text-center" style={{ maxWidth: 280 }}>
            <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#FAFAFA" }}>{COACH_NAME}</p>
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", marginTop: 2, lineHeight: 1.4 }}>{COACH_BIO}</p>
          </div>
        </div>
      ),
    },
    {
      kicker: "Anche senza coach",
      title: "Autogestisciti come un atleta vero.",
      body: "Registrazione gratuita, monitoraggio costante, la tua routine costruita e tracciata in modo sistematico — non un'altra app abbandonata dopo una settimana. Il metodo resta lo stesso: lo applichi tu.",
      visual: (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: 84, height: 84, margin: "0 auto", borderRadius: "1.5rem",
            background: "linear-gradient(135deg, rgba(197,160,89,0.22), rgba(197,160,89,0.06))",
            border: "1px solid rgba(197,160,89,0.4)", boxShadow: "0 0 40px rgba(197,160,89,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <ShieldCheck size={36} style={{ color: "#C5A059" }} />
        </motion.div>
      ),
    },
    {
      kicker: "Risultati reali",
      title: "Non promesse. Persone vere.",
      body: "Percorsi costruiti nel tempo, un check alla volta.",
      visual: (
        <div className="flex flex-col gap-2.5" style={{ width: "100%" }}>
          <div className="flex gap-2.5">
            <TransformationPair n={1} />
            <TransformationPair n={2} />
          </div>
          <div style={{ width: "48%" }}>
            <TransformationPair n={3} />
          </div>
        </div>
      ),
    },
    {
      kicker: "Pronto a iniziare?",
      title: "Il tuo percorso comincia ora.",
      body: "Crea il tuo account gratuito — nessuna carta richiesta per iniziare a monitorare in modo serio quello che fai davvero.",
      visual: (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: 84, height: 84, margin: "0 auto", borderRadius: "999px",
            background: "linear-gradient(135deg, rgba(197,160,89,0.28), rgba(197,160,89,0.08))",
            border: "1px solid rgba(197,160,89,0.45)", boxShadow: "0 0 48px rgba(197,160,89,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <Sparkles size={36} style={{ color: "#C5A059" }} />
        </motion.div>
      ),
    },
  ];
}

const VARIANTS = {
  enter: (dir) => ({ x: dir >= 0 ? 56 : -56, opacity: 0, scale: 0.94, filter: "blur(8px)" }),
  center: { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: (dir) => ({ x: dir >= 0 ? -56 : 56, opacity: 0, scale: 0.94, filter: "blur(8px)" }),
};
const VARIANTS_REDUCED = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function LandingIntro({ dark, onFinish }) {
  const gender = "M";
  const reduce = useReducedMotion();
  const SLIDES = useSlides(reduce);
  const [[index, direction], setPage] = useState([0, 0]);
  const isLast = index === SLIDES.length - 1;
  const dragX = useMotionValue(0);
  // Parallax dello sfondo mentre si trascina: appena percettibile, dà
  // profondità al gesto senza staccarsi dal contenuto in primo piano.
  const bgShift = useTransform(dragX, [-200, 200], [12, -12]);

  const go = (dir) => {
    setPage(([i]) => {
      const next = i + dir;
      if (next < 0) return [i, 0];
      if (next >= SLIDES.length) { onFinish(); return [i, 0]; }
      return [next, dir];
    });
  };

  const s = SLIDES[index];

  return (
    <div className="app-root min-h-screen flex flex-col" data-theme={dark ? "dark" : "light"}
         style={{ backgroundColor: "var(--page)", overflow: "hidden" }}>
      <DesignSystem />
      <motion.div style={{ x: reduce ? 0 : bgShift }}>
        <LiveBackground gender={gender} dark={dark} />
      </motion.div>

      <div style={{ position: "relative", zIndex: 1 }} className="min-h-screen flex flex-col">
        {/* Header: barra di avanzamento a segmenti (stile Storie) + Salta —
            FUORI dall'area trascinabile/toccabile del mazzo, così restano
            sempre raggiungibili qualunque gesto si stia facendo sotto. */}
        <div className="flex items-center gap-1.5 px-5"
             style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.9rem)" }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setPage([i, i > index ? 1 : -1])}
              aria-label={`Vai alla schermata ${i + 1}`}
              style={{ flex: 1, height: 3, borderRadius: 999, border: "none", padding: 0,
                       backgroundColor: i <= index ? "#C5A059" : "rgba(255,255,255,0.15)",
                       transition: "background-color 0.25s ease" }} />
          ))}
          <button onClick={onFinish} className="shrink-0 text-xs ml-2"
            style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600, whiteSpace: "nowrap" }}>
            Salta
          </button>
        </div>

        {/* Mazzo: l'unica area che risponde a tap (avanti/indietro a seconda
            del lato toccato, come le Storie) e a trascinamento orizzontale
            (come si sfoglia un libro) — il testo/CTA fuori da qui restano
            sempre cliccabili senza interferire col gesto. */}
        <div className="flex-1 relative" style={{ overflow: "hidden", touchAction: "pan-y" }}>
          <AnimatePresence custom={direction} initial={false} mode="wait">
            <motion.div
              key={index}
              custom={direction}
              variants={reduce ? VARIANTS_REDUCED : VARIANTS}
              initial="enter" animate="center" exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 32 },
                opacity: { duration: 0.22 }, scale: { duration: 0.3 }, filter: { duration: 0.3 },
              }}
              drag={reduce ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.55}
              onDrag={(e, info) => dragX.set(info.offset.x)}
              onDragEnd={(e, info) => {
                dragX.set(0);
                if (info.offset.x < -70 || info.velocity.x < -400) go(1);
                else if (info.offset.x > 70 || info.velocity.x > 400) go(-1);
              }}
              onTap={(e) => {
                const x = e.clientX ?? (e.changedTouches && e.changedTouches[0]?.clientX) ?? window.innerWidth;
                go(x < window.innerWidth * 0.32 ? -1 : 1);
              }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
              style={{ maxWidth: 480, margin: "0 auto", cursor: "pointer" }}>
              <div className="mb-7" style={{ width: "100%" }}>{s.visual}</div>
              <p className="font-data mb-2.5" style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.14em",
                          textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
                {s.kicker}
              </p>
              <GradientText gender={gender} style={{ fontSize: "1.55rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.22, display: "block" }}>
                {s.title}
              </GradientText>
              <p className="mt-3.5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.62)", maxWidth: 340 }}>
                {s.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: CTA, sempre fuori dall'area trascinabile. */}
        <div className="px-6 pb-8" style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <button onClick={() => go(1)}
            className="w-full rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-1.5 btn-3d"
            style={{ backgroundColor: "#C5A059", color: "#111111", fontWeight: 700 }}>
            {isLast ? "Inizia gratis" : "Avanti"} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
