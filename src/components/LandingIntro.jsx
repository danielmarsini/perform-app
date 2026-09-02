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
     5. Risultati reali (foto prima/dopo — vedi TransformationBackdrop sotto)
     6. Invito all'azione

   FOTO: nessun dato finto qui dentro. Il ritratto del coach e le coppie
   prima/dopo puntano a file in /public/landing/ (vedi LEGGIMI.txt lì
   dentro) — finché quei file non esistono, compare un placeholder discreto
   (mai una foto finta spacciata per reale). Quando ci sono, NON sono
   riquadri piccoli isolati: riempiono l'intera slide come sfondo, con Ken
   Burns continuo (vedi KenBurnsPhoto) — è quello che dà il senso di
   "pienezza"/"vividezza" richiesto. Bastano i file con il nome giusto per
   farli comparire, zero modifiche al codice.
   ========================================================================== */

import React, { useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useReducedMotion, animate } from "framer-motion";
import { Dumbbell, Salad, Moon, ChevronRight, ShieldCheck, Camera, Sparkles } from "lucide-react";
import { DesignSystem, LiveBackground } from "./04_AppShell.jsx";
import { GradientText } from "./08_ClientProfileView.jsx";

/* Bio breve del coach mostrata nella slide "professionista vero" — testo
   volutamente incentrato sul METODO (evidence-based, programmazione reale
   sui tuoi progressi) invece che su credenziali specifiche inventate: se
   vuoi aggiungere titoli/anni di esperienza/certificazioni puntuali,
   modifica questa costante. */
const COACH_NAME = "Daniel Marsini";
const COACH_BIO = "Preparatore evidence-based. Ogni scheda nasce dai tuoi dati reali — non da un modello standard, copiato e incollato per tutti.";

/* ----------------------------------------------------------------------
   Le foto vere non sono più riquadri piccoli isolati in mezzo al testo:
   riempiono tutta la slide come sfondo, con uno zoom lentissimo continuo
   (Ken Burns) + un pan leggero — è quello che dà "pienezza"/"vividezza"
   invece di sembrare un'icona buttata lì. overflow:hidden sul contenitore
   evita che lo zoom sconfini oltre i bordi della slide. */
function KenBurnsPhoto({ file, reduce, focal = "center" }) {
  return (
    <motion.img
      src={`/landing/${file}`} alt=""
      initial={{ scale: 1.08, x: 0, y: 0 }}
      animate={reduce ? {} : { scale: [1.08, 1.2, 1.08], x: [0, -12, 0], y: [0, 10, 0] }}
      transition={reduce ? {} : { duration: 17, repeat: Infinity, ease: "easeInOut" }}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: focal, display: "block" }}
    />
  );
}

/* Verifica se un file esiste in /landing/ SENZA mai mostrarlo se manca —
   stessa filosofia di "mai una foto finta", solo spostata a monte: qui si
   decide se attivare la modalità sfondo pieno o restare sul placeholder
   discreto, invece di scoprirlo dentro un <img> isolato dentro la slide. */
function usePhotoStatus(file) {
  const [status, setStatus] = useState("loading");
  React.useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setStatus("ok"); };
    img.onerror = () => { if (!cancelled) setStatus("error"); };
    img.src = `/landing/${file}`;
    return () => { cancelled = true; };
  }, [file]);
  return status;
}

/* Sfondo pieno della slide "professionista vero": la foto del coach
   riempie tutta la slide con Ken Burns, uno scrim scuro la rende
   leggibile, nome+bio diventano una didascalia in basso — non più un
   ritratto piccolo isolato in mezzo al testo. */
function CoachBackdrop({ reduce }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <KenBurnsPhoto file="coach-portrait.jpg" reduce={reduce} focal="center 20%" />
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(8,6,2,0.4) 0%, rgba(8,6,2,0.35) 40%, rgba(8,6,2,0.55) 70%, rgba(6,5,2,0.92) 100%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "15%", padding: "0 1.75rem", textAlign: "left" }}>
        <p style={{ fontSize: "1rem", fontWeight: 800, color: "#FAFAFA" }}>{COACH_NAME}</p>
        <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.72)", marginTop: 3, lineHeight: 1.45, maxWidth: 320 }}>
          {COACH_BIO}
        </p>
      </div>
    </div>
  );
}

/* Placeholder discreto quando la foto non c'è ancora (mai una foto finta
   spacciata per reale): solo un'icona, niente riquadro pieno — usato sia
   per il coach sia per le trasformazioni quando nessuna coppia è pronta. */
function PhotoComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ padding: "2.5rem 0" }}>
      <div style={{ width: 64, height: 64, borderRadius: "999px", border: "1px dashed rgba(255,255,255,0.22)",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Camera size={20} style={{ color: "rgba(255,255,255,0.4)" }} />
      </div>
      <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.4)" }}>{label}</span>
    </div>
  );
}

/* Sfondo pieno della slide "risultati reali": coppia prima/dopo divisa in
   due metà verticali, ciascuna con Ken Burns indipendente. Se più coppie
   sono disponibili (transformation-2-*, transformation-3-*…) ruotano da
   sole ogni 5 secondi con una dissolvenza incrociata — è quello che dà il
   senso di "sfondo vivo" invece di una foto ferma, non serve toccare il
   codice: bastano i file con il nome giusto. */
function TransformationBackdrop({ pairs, reduce }) {
  const [i, setI] = useState(0);
  React.useEffect(() => {
    if (reduce || pairs.length < 2) return undefined;
    const id = setInterval(() => setI((prev) => (prev + 1) % pairs.length), 5000);
    return () => clearInterval(id);
  }, [pairs.length, reduce]);
  const n = pairs[i % pairs.length];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <AnimatePresence mode="sync">
        <motion.div key={n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 1 }} style={{ position: "absolute", inset: 0, display: "flex" }}>
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <KenBurnsPhoto file={`transformation-${n}-before.jpg`} reduce={reduce} focal="center 25%" />
            <span className="landing-tag" style={{ position: "absolute", top: "14%", left: 14,
              color: "rgba(255,255,255,0.9)", backgroundColor: "rgba(0,0,0,0.45)", padding: "2px 10px", borderRadius: 999 }}>
              Prima
            </span>
          </div>
          <div style={{ width: 1, backgroundColor: "rgba(217,179,106,0.35)" }} />
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <KenBurnsPhoto file={`transformation-${n}-after.jpg`} reduce={reduce} focal="center 25%" />
            <span className="landing-tag" style={{ position: "absolute", top: "14%", right: 14,
              color: "#1a1408", backgroundColor: "#D9B36A", padding: "2px 10px", borderRadius: 999 }}>
              Dopo
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(8,6,2,0.5) 0%, rgba(8,6,2,0.45) 45%, rgba(8,6,2,0.5) 60%, rgba(6,5,2,0.88) 100%)" }} />
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
  const coachStatus = usePhotoStatus("coach-portrait.jpg");
  const pairStatuses = [1, 2, 3].map((n) => ({
    n,
    before: usePhotoStatus(`transformation-${n}-before.jpg`),
    after: usePhotoStatus(`transformation-${n}-after.jpg`),
  }));
  const okPairs = pairStatuses.filter((p) => p.before === "ok" && p.after === "ok").map((p) => p.n);

  return [
    {
      kicker: "Il problema, in una frase",
      title: "Un'app per allenarti. Un'altra per la dieta. Un'altra ancora per il sonno.",
      body: "Dati sparsi che nessuno mette davvero insieme. Nemmeno tu.",
      visual: (
        <div style={{ position: "relative", width: "100%", height: 140 }}>
          <FloatingChip icon={Dumbbell} style={{ left: "18%", top: 4 }} delay={0.05} reduce={reduce} />
          <FloatingChip icon={Salad} style={{ right: "14%", top: 26 }} delay={0.18} reduce={reduce} />
          <FloatingChip icon={Moon} style={{ left: "42%", bottom: 0 }} delay={0.3} reduce={reduce} />
        </div>
      ),
    },
    {
      kicker: "Perché PERFORM è diverso",
      title: "Non un'altra app per contare numeri.",
      body: "Allenamento, alimentazione, recupero e integrazione letti come un solo corpo — non quattro tracker scollegati che non si parlano.",
      visual: (
        <div className="flex items-center justify-center gap-5" style={{ width: "100%", height: 140 }}>
          <MiniRing pct={88} label="Allenamento" color="#C5A059" delay={0.05} reduce={reduce} />
          <MiniRing pct={94} label="Alimentazione" color="#D9B36A" delay={0.2} reduce={reduce} />
          <MiniRing pct={76} label="Recupero" color="#8C6E33" delay={0.35} reduce={reduce} />
        </div>
      ),
    },
    {
      kicker: "Non un algoritmo con la tua faccia",
      title: "Dietro ogni numero, un professionista vero.",
      body: "Fisiologia, biomeccanica, i tuoi progressi reali — letti da chi se ne occupa per mestiere. Non una scheda fotocopiata.",
      bg: coachStatus === "ok" ? <CoachBackdrop reduce={reduce} /> : null,
      visual: coachStatus === "ok" ? null : (
        <div className="flex flex-col items-center gap-3" style={{ width: "100%" }}>
          <PhotoComingSoon label="Foto in arrivo" />
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
      body: "Gratis, senza pubblicità e senza funzioni finte bloccate per farti pagare. Solo il metodo — lo applichi tu.",
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
      kicker: "Non promesse. Persone.",
      title: "I risultati parlano da soli.",
      body: "Percorsi reali, un check alla volta.",
      bg: okPairs.length > 0 ? <TransformationBackdrop pairs={okPairs} reduce={reduce} /> : null,
      visual: okPairs.length > 0 ? null : <PhotoComingSoon label="Trasformazioni in arrivo" />,
    },
    {
      kicker: "Pronto?",
      title: "Il tuo percorso comincia ora.",
      body: "Account gratuito, zero carta di credito. Inizia a monitorarti come chi fa sul serio.",
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
  // Leggera rotazione mentre si trascina — come una carta che si solleva
  // dal mazzo — per rendere lo swipe più dinamico e "fisico". Motion value
  // indipendente da quella dei variants (mai sullo stesso "x", per lo
  // stesso motivo spiegato sopra per bgShift): niente conflitti fra il
  // gesto live e la transizione di ingresso/uscita della slide.
  const rotateZ = useMotionValue(0);
  // Un rilascio a fine trascinamento cade spesso nella metà sinistra dello
  // schermo (dita che si muovono verso sinistra per far avanzare) — la
  // stessa zona che onTap userebbe per tornare indietro. Senza questo
  // guard, un vero swipe avanti veniva subito annullato da un onTap
  // fantasma sullo stesso rilascio: il gesto avanzava e retrocedeva nello
  // stesso istante. onDragEnd marca il gesto come "già gestito" e onTap lo
  // ignora una volta sola.
  const justDraggedRef = useRef(false);

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
      {/* Tipografia dedicata a questa sola schermata (il "biglietto da
          visita"): un serif editoriale al posto del solito sans-bold in
          maiuscolo da landing generata — quello che distingue un lavoro di
          design curato da un template. Sfondo: oltre ai blob dorati di
          LiveBackground (condivisi con tutta l'app), una vignetta che
          scurisce i bordi verso un nero caldo e una sottile "lama" dorata
          che attraversa lo schermo in loop — più movimento, più profondità,
          senza mai coprire il testo. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,400&display=swap');
        .landing-kicker {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-weight: 400;
          font-size: 0.85rem;
          color: rgba(217,179,106,0.75);
          letter-spacing: 0.01em;
        }
        .landing-title { font-family: 'Fraunces', Georgia, serif; }
        .landing-tag { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 0.62rem; font-weight: 500; }
        .landing-vignette {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(ellipse at 50% 38%, transparent 30%, rgba(4,3,1,0.6) 100%);
        }
        .landing-gold-sweep {
          position: fixed; inset: -20%; z-index: 0; pointer-events: none; opacity: 0.4;
          background: linear-gradient(115deg, transparent 42%, rgba(197,160,89,0.16) 48%, rgba(243,229,171,0.2) 50%, rgba(197,160,89,0.16) 52%, transparent 58%);
          background-size: 220% 220%;
          animation: landingGoldSweep 10s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        @keyframes landingGoldSweep {
          0%   { background-position: 10% 0%; }
          50%  { background-position: 90% 100%; }
          100% { background-position: 10% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-gold-sweep { animation: none; }
        }
      `}</style>
      <motion.div style={{ x: reduce ? 0 : bgShift }}>
        <LiveBackground gender={gender} dark={dark} />
      </motion.div>
      <div className="landing-gold-sweep" aria-hidden="true" />
      <div className="landing-vignette" aria-hidden="true" />

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
              onDrag={(e, info) => {
                dragX.set(info.offset.x);
                rotateZ.set(Math.max(-8, Math.min(8, info.offset.x / 18)));
              }}
              onDragEnd={(e, info) => {
                dragX.set(0);
                animate(rotateZ, 0, { type: "spring", stiffness: 280, damping: 22 });
                if (Math.abs(info.offset.x) > 4) justDraggedRef.current = true;
                if (info.offset.x < -70 || info.velocity.x < -400) go(1);
                else if (info.offset.x > 70 || info.velocity.x > 400) go(-1);
              }}
              onTap={(e) => {
                if (justDraggedRef.current) { justDraggedRef.current = false; return; }
                const x = e.clientX ?? (e.changedTouches && e.changedTouches[0]?.clientX) ?? window.innerWidth;
                go(x < window.innerWidth * 0.32 ? -1 : 1);
              }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
              style={{ maxWidth: 480, margin: "0 auto", cursor: "pointer", rotate: reduce ? 0 : rotateZ, overflow: "hidden" }}>
              {s.bg}
              <div style={{ position: "relative", zIndex: 1, width: "100%" }} className="flex flex-col items-center">
                {s.visual && <div className="mb-7" style={{ width: "100%" }}>{s.visual}</div>}
                <p className="landing-kicker mb-2.5">
                  {s.kicker}
                </p>
                <GradientText gender={gender} className="landing-title" style={{ fontSize: "1.7rem", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2, display: "block" }}>
                  {s.title}
                </GradientText>
                <p className="mt-3.5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.62)", maxWidth: 340 }}>
                  {s.body}
                </p>
                {index === 0 && (
                  <motion.div className="flex items-center justify-center gap-1.5 mt-8" aria-hidden="true"
                    initial={{ opacity: 0 }} animate={{ opacity: reduce ? 0.5 : 1 }} transition={{ delay: 0.5, duration: 0.5 }}>
                    <motion.span
                      animate={reduce ? {} : { x: [6, -6, 6] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      style={{ width: 26, height: 2, borderRadius: 999, background: "linear-gradient(90deg, transparent, #C5A059)" }} />
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: "0.68rem", color: "rgba(255,255,255,0.4)" }}>
                      scorri
                    </span>
                  </motion.div>
                )}
              </div>
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
