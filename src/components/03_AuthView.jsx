/* ============================================================================
   PERFORM · AuthView.jsx — INGRESSO PUBBLICO
   Evidence-Based Method by D. Marsini

   Contenuto:
     0. supabase ............ client reale, inizializzato da variabili
                               d'ambiente Vite (VITE_SUPABASE_URL,
                               VITE_SUPABASE_ANON_KEY) — vedi sezione 0 sotto
     1. makeAuth ............ wrapper delle chiamate Supabase Auth reali,
                               nessuna simulazione
     2. BrandMark ........... logo istituzionale originale: icona Activity
                               (lucide-react) su blocco nero/bianco a seconda
                               del tema
     3. Field / Primary / ErrorLine / ConsentRow
                              .. componenti di presentazione STABILI, dichiarati
                               a livello di modulo (non dentro AuthScreen):
                               è il fix strutturale del bug "perdita del focus
                               a ogni lettera digitata" — vedi nota sotto.
     4. AuthScreen .......... login · registrazione (data di nascita con
                               blocco minorenni, 3 consensi ad accordion) ·
                               verifica email a codice OTP reale · recupero e
                               reimpostazione password
     5. LegalConsents ....... versione standalone dei 3 consensi (riutilizzabile
                               per un eventuale ri-consenso a informativa aggiornata)
     6. AuthView ............ contenitore dimostrativo che monta AuthScreen con
                               il client reale (si elimina in produzione, dove
                               è l'app stessa a montare AuthScreen)

   REQUISITI D'AMBIENTE (obbligatori, senza non parte nulla):
   Su Vercel ? Project Settings ? Environment Variables (Production + Preview):
     VITE_SUPABASE_URL       = https://<project-ref>.supabase.co
     VITE_SUPABASE_ANON_KEY  = <anon/public key del progetto Supabase>
   In locale: file .env (mai committato) con le stesse due chiavi.
   Il prefisso VITE_ è obbligatorio: senza, Vite non le espone al bundle
   client-side, e import.meta.env.VITE_SUPABASE_URL risulterebbe undefined.

   Su Supabase, Authentication ? Email Templates deve avere il template di
   conferma registrazione impostato per inviare un CODICE a 6 cifre (non il
   classico magic link), perché supabase.auth.verifyOtp({ type: 'signup' })
   funzioni come previsto in doVerifyOtp qui sotto.

   FIX STRUTTURALE — perdita del focus sugli input:
   Nella versione precedente i componenti Field/ConsentRow/Primary erano
   dichiarati DENTRO il corpo della funzione AuthScreen. Ad ogni pressione di
   tasto, lo stato cambiava, AuthScreen si ri-eseguiva da capo e ricreava una
   funzione Field "nuova" con un'identità diversa dalla precedente: React la
   vedeva come un componente diverso, smontava il vecchio <input> dal DOM e ne
   montava uno nuovo, perdendo il focus e il cursore ad ogni carattere. Ora
   questi componenti sono dichiarati una sola volta, a livello di modulo:
   la loro identità resta stabile tra un render e l'altro, React aggiorna solo
   le props e il DOM dell'input non viene mai ricreato — la digitazione è
   continua e fluida.

   Tipografia: un'unica famiglia sans-serif geometrica nativa (system-ui /
   -apple-system / Segoe UI / Roboto), nessun font esterno caricato.
   Testo descrittivo in grigio satinato #A1A1AA, su bianco e su onyx.

   NOTA: la gestione Whitelist (bypass pagamento/anamnesi) NON vive qui:
   è una funzione amministrativa riservata alla Dashboard Coach privata.

   Tutto pilotato da props: nessuna dipendenza dal resto dell'app, a parte
   il client Supabase reale definito qui sotto.
   ========================================================================== */

import React, { useState, useMemo, useRef, useId } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, Activity,
  Calendar,
} from "lucide-react";

/* ============================================================================
   0 · CLIENT SUPABASE — inizializzazione reale da variabili d'ambiente Vite
   Su Vercel, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY vanno impostate nel
   pannello Environment Variables del progetto (Production + Preview) e
   prefissate con VITE_ perché Vite le esponga al bundle del client.
   ========================================================================== */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "PERFORM · variabili d'ambiente Supabase mancanti: verifica VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GOLD = "#C5A059";
const GOLD_DEEP = "#8C6E33";
const SOFT = "#A1A1AA";

const GOLD_GRADIENT_LIGHT = "linear-gradient(100deg, #8C6E33, #D9B36A, #C5A059, #B8924A, #8C6E33)";
const GOLD_GRADIENT_DARK = "linear-gradient(100deg, #C5A059, #F0DCA0, #8C6E33, #E9CD82, #C5A059)";

const SANS =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/* ============================================================================
   1 · WRAPPER SUPABASE AUTH — nessuna simulazione: chiamate dirette al client.
   ========================================================================== */

export function makeAuth(supabase) {
  return {
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(mapAuthError(error.message));
      return data;
    },

    async signUp(email, password, fullName, gender, birthDate) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, gender, birth_date: birthDate } },
      });
      if (error) throw new Error(mapAuthError(error.message));
      return data;
    },

    async verifySignupOtp(email, token) {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
      if (error) throw new Error(mapAuthError(error.message));
      return data;
    },

    async resendOtp(email) {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw new Error(mapAuthError(error.message));
      return { sent: true };
    },

    async resetPassword(email, redirectTo) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(mapAuthError(error.message));
      return { sent: true };
    },

    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(mapAuthError(error.message));
      return { updated: true };
    },

    async saveConsents(userId, consents) {
      const { error } = await supabase.from("legal_consents").upsert({
        user_id: userId,
        gdpr_data: consents.gdpr,
        medical_waiver: consents.medical,
        community_direct: consents.community,
        birth_date: consents.birthDate || null,
        accepted_at: new Date().toISOString(),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        policy_version: "1.3",
      });
      if (error) throw new Error(error.message);
      return { saved: true };
    },
  };
}

function mapAuthError(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corrette.";
  if (m.includes("email not confirmed")) return "Conferma prima l'email che ti ho inviato.";
  if (m.includes("already registered")) return "Esiste già un account con questa email. Prova ad accedere.";
  if (m.includes("weak") || m.includes("6 characters")) return "La password è troppo debole: usa almeno 8 caratteri.";
  if (m.includes("token") || m.includes("otp") || m.includes("expired")) return "Codice non valido o scaduto. Richiedine uno nuovo.";
  if (m.includes("rate limit")) return "Troppi tentativi. Riprova tra qualche minuto.";
  return "Qualcosa non ha funzionato. Riprova.";
}

function getAge(birthDateStr) {
  const b = new Date(birthDateStr);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

/* ============================================================================
   2 · BRAND MARK
   ========================================================================== */

function BrandMark({ dark = false, size = 68 }) {
  const uid = useId();
  const gradId = `performIconGrad-${uid}`;
  const boxIsBlack = !dark;
  const stops = boxIsBlack
    ? ["#C5A059", "#F0DCA0", "#8C6E33", "#E9CD82", "#C5A059"]
    : ["#8C6E33", "#D9B36A", "#C5A059", "#B8924A", "#8C6E33"];
  const sheen = boxIsBlack ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.09)";
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="mx-auto mb-5 flex items-center justify-center relative overflow-hidden"
      style={{ width: size, height: size, borderRadius: 10, backgroundColor: boxIsBlack ? "#111111" : "#FFFFFF" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${sheen} 0%, rgba(0,0,0,0) 48%)` }}
      />
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
   3 · COMPONENTI DI PRESENTAZIONE STABILI (fix del focus)
   ========================================================================== */

function Field({ id, label, type = "text", value, onChange, placeholder, icon: Icon, toggle, max, showPw, onToggleShowPw, onEnter, theme, inputRef, highlight }) {
  const { ink, soft, surface, line, dark } = theme;
  return (
    <div className="text-left mb-3">
      <label htmlFor={id} className="block mb-1.5 uppercase" style={{ color: soft, fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.1em" }}>
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: soft }} />}
        <input
          id={id}
          ref={inputRef}
          type={toggle ? (showPw ? "text" : "password") : type}
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full text-sm rounded-2xl py-3 outline-none transition-all duration-300"
          style={{
            paddingLeft: Icon ? 42 : 16,
            paddingRight: toggle ? 42 : 16,
            backgroundColor: surface,
            border: `1px solid ${highlight ? "#DC2626" : line}`,
            boxShadow: highlight ? "0 0 0 3px rgba(220,38,38,0.15)" : (dark ? "none" : "0 1px 2px rgba(17,17,17,0.02)"),
            color: ink,
            fontFamily: SANS,
          }}
        />
        {toggle && (
          <button
            type="button"
            onClick={onToggleShowPw}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
            style={{ color: soft }}
            aria-label={showPw ? "Nascondi password" : "Mostra password"}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Primary({ children, onClick, disabled, busy, theme }) {
  const { dark } = theme;
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="perform-btn w-full text-sm px-4 py-3.5 rounded-full transition-transform active:scale-[0.98] disabled:opacity-40"
      style={{
        backgroundImage: dark ? GOLD_GRADIENT_DARK : GOLD_GRADIENT_LIGHT,
        color: "#15110A",
        letterSpacing: "0.14em",
        fontWeight: 600,
      }}
    >
      {busy ? "UN ATTIMO…" : children}
    </button>
  );
}

function ErrorLine({ error }) {
  if (!error) return null;
  return (
    <p className="text-xs mb-3 rounded-lg px-3 py-2 text-left" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
      {error}
    </p>
  );
}

function ConsentRow({ item, checked, expanded, onToggleCheck, onToggleExpand, theme }) {
  const { ink, soft, dark } = theme;
  return (
    <div className="mb-2">
      <div className="flex items-start gap-2">
        <button
          onClick={onToggleCheck}
          type="button"
          className="shrink-0 flex items-center justify-center rounded transition-all duration-200 mt-0.5"
          style={{
            width: 14, height: 14,
            backgroundColor: checked ? (dark ? "#FFFFFF" : "#111111") : "transparent",
            border: checked ? "none" : `1.3px solid ${soft}`,
          }}
          aria-label={item.title}
        >
          {checked && <CheckCircle2 size={10} style={{ color: dark ? "#09090B" : GOLD }} />}
        </button>
        <p className="text-xs leading-snug" style={{ color: soft }}>
          <span style={{ color: ink, fontWeight: 500 }}>{item.title}</span>
          {". "}
          <button
            onClick={onToggleExpand}
            type="button"
            style={{ color: dark ? GOLD : GOLD_DEEP, fontWeight: 600 }}
          >
            {expanded ? "Nascondi dettagli" : "Leggi dettagli"}
          </button>
        </p>
      </div>

      {expanded && (
        <p className="spring-in text-[11px] leading-relaxed mt-1" style={{ color: soft, paddingLeft: 22 }}>
          {item.long}
        </p>
      )}
    </div>
  );
}

/* ============================================================================
   4 · SCHERMATA DI ACCESSO
   ========================================================================== */

const CONSENT_COPY = [
  {
    key: "gdpr",
    title: "Consenso Trattamento Dati Biometrici e GDPR",
    long:
      "Trattamento criptato dei dati biologici sensibili (peso, circonferenze, bio-marker ematici, " +
      "parametri Apple Watch/Android) e foto di check, ai sensi dell'art. 9 del Regolamento UE 2016/679. " +
      "Conservazione su bucket privati accessibili solo a te e a Coach Daniel Marsini, titolare del " +
      "trattamento, con diritto all'oblio totale e cancellazione istantanea e irreversibile dello storico " +
      "dal profilo in qualsiasi momento.",
  },
  {
    key: "medical",
    title: "Esonero Responsabilità Medica e Sana Costituzione",
    long:
      "Dichiarazione esplicita che il software e Coach Daniel Marsini non forniscono terapie mediche o " +
      "diete cliniche: le indicazioni non costituiscono diagnosi né prescrizione. Attestazione di sana e " +
      "robusta costituzione prima di intraprendere sforzi ad alta intensità a RIR 0, con l'impegno a " +
      "consultare un medico in presenza di patologie pregresse.",
  },
  {
    key: "community",
    title: "Clausola Community e Privacy dei Post Social",
    long:
      "Accetto che le foto pubblicate spontaneamente su \u201cathlete network\u201d siano visibili nel feed " +
      "della community (stile direct di Instagram), e posso cancellarle in qualsiasi momento. Restano " +
      "invece rigorosamente segrete, oscurate e visibili SOLTANTO a Coach Daniel: l'intera cartella " +
      "clinica, l'anamnesi e gli esami del sangue.",
  },
];

export function AuthScreen({ auth, dark = false, onAuthenticated, redirectTo = "/update-password", initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("M");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consents, setConsents] = useState({ gdpr: false, medical: false, community: false });
  const [openConsent, setOpenConsent] = useState(null);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [pendingSignup, setPendingSignup] = useState(null);
  const otpRefs = useRef([]);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const pwRef = useRef(null);
  const pw2Ref = useRef(null);
  const birthRef = useRef(null);
  const consentsRef = useRef(null);
  const [highlightTarget, setHighlightTarget] = useState(null);
  const highlightTimeoutRef = useRef(null);

  const goTo = (ref, key) => {
    setHighlightTarget(key);
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref?.current?.focus?.();
    window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightTarget(null), 1800);
  };

  const ink = dark ? "#FFFFFF" : "#111111";
  const soft = SOFT;
  const surface = dark ? "#18181B" : "#FFFFFF";
  const line = dark ? "rgba(255,255,255,0.08)" : "rgba(17,17,17,0.06)";
  const page = dark ? "#09090B" : "#FFFFFF";
  const cardShadow = dark
    ? "0 20px 60px rgba(0,0,0,0.45)"
    : "0 1px 2px rgba(17,17,17,0.03), 0 24px 60px rgba(17,17,17,0.05)";
  const theme = { ink, soft, surface, line, dark, page };

  const allConsentsChecked = consents.gdpr && consents.medical && consents.community;
  const age = birthDate ? getAge(birthDate) : null;
  const isMinor = age !== null && age < 18;

  const pwStrength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  const reset = () => { setError(""); setBusy(false); };

  const doLogin = async () => {
    reset();
    if (!email.includes("@")) return setError("Inserisci un'email valida.");
    if (!password) return setError("Inserisci la password.");
    setBusy(true);
    try {
      const res = await auth.signIn(email.trim().toLowerCase(), password);
      onAuthenticated({ user: res.user, isNew: false });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const doSignUp = async () => {
    reset();
    if (fullName.trim().length < 3) { goTo(nameRef, "name"); return setError("Scrivi nome e cognome."); }
    if (!email.includes("@")) { goTo(emailRef, "email"); return setError("Inserisci un'email valida."); }
    if (password.length < 8) { goTo(pwRef, "pw"); return setError("La password deve avere almeno 8 caratteri."); }
    if (password !== password2) { goTo(pw2Ref, "pw2"); return setError("Le due password non coincidono."); }
    if (!birthDate) { goTo(birthRef, "birth"); return setError("Inserisci la data di nascita."); }
    if (isMinor) { goTo(birthRef, "birth"); return setError("L'accesso è riservato ai maggiori di 18 anni."); }
    if (!allConsentsChecked) { goTo(consentsRef, "consents"); return setError("Devi accettare tutti e tre i punti obbligatori per registrarti."); }
    setBusy(true);
    try {
      const res = await auth.signUp(email.trim().toLowerCase(), password, fullName.trim(), gender, birthDate);
      setPendingSignup({ userId: res.user?.id });
      setOtp(["", "", "", "", "", ""]);
      setMode("otp");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const doVerifyOtp = async () => {
    reset();
    const code = otp.join("");
    if (code.length !== 6) return setError("Inserisci il codice a 6 cifre.");
    setBusy(true);
    try {
      const data = await auth.verifySignupOtp(email.trim().toLowerCase(), code);
      const userId = data.user?.id || pendingSignup?.userId;
      try { await auth.saveConsents(userId, { ...consents, birthDate }); } catch { /* ritentato al primo accesso */ }
      onAuthenticated({ user: data.user || { id: userId, email }, isNew: true, consents });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const doResendOtp = async () => {
    reset();
    setBusy(true);
    try {
      await auth.resendOtp(email.trim().toLowerCase());
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const onOtpChange = (i, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    setError("");
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const onOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "Enter") doVerifyOtp();
  };

  const doRecover = async () => {
    reset();
    if (!email.includes("@")) return setError("Inserisci l'email del tuo account.");
    setBusy(true);
    try {
      await auth.resetPassword(email.trim().toLowerCase(), redirectTo);
      setMode("sent");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const doUpdate = async () => {
    reset();
    if (password.length < 8) return setError("La password deve avere almeno 8 caratteri.");
    if (password !== password2) return setError("Le due password non coincidono.");
    setBusy(true);
    try {
      await auth.updatePassword(password);
      onAuthenticated({ user: { email }, isNew: false, passwordUpdated: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const submitCurrent = () => {
    if (mode === "login") doLogin();
    else if (mode === "signup") doSignUp();
    else if (mode === "otp") doVerifyOtp();
    else if (mode === "recover") doRecover();
    else if (mode === "update") doUpdate();
  };

  const signupLabel = "CREA ACCOUNT";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: page, fontFamily: SANS }}>
      <style>{`
        @keyframes performGlow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
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
      `}</style>
      <div
        className="w-full spring-in rounded-3xl px-7 py-9 sm:px-9 sm:py-10 relative"
        style={{
          maxWidth: mode === "signup" ? 440 : 400,
          backgroundColor: surface,
          border: `1px solid ${line}`,
          boxShadow: cardShadow,
        }}
      >
        <span
          className="absolute uppercase"
          style={{ top: 16, right: 20, color: soft, fontSize: "0.5rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.04em" }}
        >
          Evidence-Based Method by D. Marsini
        </span>

        <div className="text-center">
          <BrandMark dark={dark} />
          <p
            className="text-center mb-9 perform-title"
            style={{
              fontSize: "1.7rem",
              fontWeight: 600,
              letterSpacing: "0.36em",
              lineHeight: 1.25,
              paddingLeft: "0.36em",
              backgroundImage: dark ? GOLD_GRADIENT_DARK : GOLD_GRADIENT_LIGHT,
            }}
          >
            PERFORM
          </p>
        </div>

        {mode === "login" && (
          <>
            <Field id="email" label="Email" type="email" value={email} onChange={setEmail} placeholder="nome@email.it" icon={Mail} onEnter={submitCurrent} theme={theme} />
            <Field id="pw" label="Password" value={password} onChange={setPassword} placeholder="••••••••" icon={Lock} toggle showPw={showPw} onToggleShowPw={() => setShowPw((v) => !v)} onEnter={submitCurrent} theme={theme} />
            <ErrorLine error={error} />
            <Primary onClick={doLogin} busy={busy} theme={theme}>ACCEDI</Primary>

            <div className="text-center">
              <button onClick={() => { setMode("recover"); reset(); }} className="text-xs mt-3.5 mb-7" style={{ color: soft, letterSpacing: "0.02em", fontWeight: 500 }}>
                Password dimenticata?
              </button>

              <p className="text-xs mb-2" style={{ color: soft }}>Non hai ancora un account?</p>
              <button
                onClick={() => { setMode("signup"); reset(); }}
                className="w-full text-sm px-4 py-3 rounded-full"
                style={{ border: `1px solid ${line}`, color: ink, letterSpacing: "0.04em", fontWeight: 600 }}
              >
                Registrati gratis
              </button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <p className="text-base text-center mb-6" style={{ color: ink, fontWeight: 600, letterSpacing: "0.01em" }}>
              Crea il tuo account
            </p>
            <Field id="name" label="Nome e cognome" value={fullName} onChange={setFullName} placeholder="Mario Rossi" onEnter={submitCurrent} theme={theme} inputRef={nameRef} highlight={highlightTarget === "name"} />
            <Field id="email2" label="Email" type="email" value={email} onChange={setEmail} placeholder="nome@email.it" icon={Mail} onEnter={submitCurrent} theme={theme} inputRef={emailRef} highlight={highlightTarget === "email"} />
            <Field id="pw2" label="Password" value={password} onChange={setPassword} placeholder="Almeno 8 caratteri" icon={Lock} toggle showPw={showPw} onToggleShowPw={() => setShowPw((v) => !v)} onEnter={submitCurrent} theme={theme} inputRef={pwRef} highlight={highlightTarget === "pw"} />

            {password.length > 0 && (
              <div className="flex gap-1 mb-3">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="flex-1 rounded-full" style={{
                    height: 3,
                    backgroundColor: i < pwStrength
                      ? (pwStrength <= 1 ? "#DC2626" : pwStrength === 2 ? "#F0A020" : "#16A34A")
                      : line,
                  }} />
                ))}
              </div>
            )}

            <Field id="pw3" label="Conferma password" value={password2} onChange={setPassword2} placeholder="Ripeti la password" icon={Lock} toggle showPw={showPw} onToggleShowPw={() => setShowPw((v) => !v)} onEnter={submitCurrent} theme={theme} inputRef={pw2Ref} highlight={highlightTarget === "pw2"} />

            <Field
              id="birth"
              label="Data di nascita"
              type="date"
              value={birthDate}
              onChange={setBirthDate}
              icon={Calendar}
              max={new Date().toISOString().slice(0, 10)}
              onEnter={submitCurrent}
              theme={theme}
              inputRef={birthRef}
              highlight={highlightTarget === "birth"}
            />
            {isMinor && (
              <p className="text-xs mb-3 rounded-lg px-3 py-2 text-left" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 600 }}>
                L'accesso è riservato ai maggiori di 18 anni.
              </p>
            )}

            <div className="text-left mb-4">
              <p className="mb-1.5 uppercase" style={{ color: soft, fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.1em" }}>
                Sesso biologico
              </p>
              <p className="text-[11px] mb-2 leading-relaxed" style={{ color: soft }}>
                Dato obbligatorio: calibra target idrici, range dei bio-marker e la sezione sul ciclo.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[["M", "Uomo"], ["F", "Donna"]].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setGender(v)}
                    className="rounded-xl px-2 py-2.5 text-xs"
                    style={gender === v
                      ? { backgroundColor: ink, color: page, fontWeight: 600 }
                      : { border: `1px solid ${line}`, color: soft, fontWeight: 500 }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={consentsRef}
              tabIndex={-1}
              className="text-left mb-2 rounded-2xl transition-all duration-300 outline-none"
              style={{
                boxShadow: highlightTarget === "consents" ? "0 0 0 3px rgba(220,38,38,0.15)" : "none",
                padding: highlightTarget === "consents" ? 8 : 0,
              }}
            >
              {CONSENT_COPY.map((item) => (
                <ConsentRow
                  key={item.key}
                  item={item}
                  checked={consents[item.key]}
                  expanded={openConsent === item.key}
                  onToggleCheck={() => { setConsents((c) => ({ ...c, [item.key]: !c[item.key] })); setError(""); }}
                  onToggleExpand={() => setOpenConsent((k) => (k === item.key ? null : item.key))}
                  theme={theme}
                />
              ))}
            </div>

            <ErrorLine error={error} />
            <Primary onClick={doSignUp} busy={busy} theme={theme}>{signupLabel}</Primary>
            <div className="text-center">
              <button onClick={() => { setMode("login"); reset(); }} className="text-xs mt-4" style={{ color: soft, fontWeight: 500 }}>
                Ho già un account
              </button>
            </div>
          </>
        )}

        {mode === "otp" && (
          <div className="text-center">
            <span className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-4" style={{ backgroundColor: dark ? "#FFFFFF" : "#111111" }}>
              <Mail size={22} style={{ color: dark ? "#09090B" : GOLD }} />
            </span>
            <p className="text-base mb-2" style={{ color: ink, fontWeight: 600 }}>Certifica la tua identità</p>
            <p className="text-sm mb-1 leading-relaxed" style={{ color: soft }}>
              Inserisci il codice OTP a 6 cifre inviato al tuo indirizzo email.
            </p>
            <p className="text-xs mb-6" style={{ color: soft }}>
              Inviato a <span style={{ color: ink, fontWeight: 500 }}>{email}</span>
            </p>

            <div className="flex justify-center gap-2.5 mb-5">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  value={d}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onKeyDown={(e) => onOtpKeyDown(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  className="text-center rounded-xl outline-none"
                  style={{
                    width: 44, height: 54, fontSize: "1.3rem", fontWeight: 600,
                    backgroundColor: surface, border: `1px solid ${d ? (dark ? GOLD : GOLD_DEEP) : line}`,
                    color: ink, fontFamily: SANS,
                    boxShadow: dark ? "none" : "0 1px 2px rgba(17,17,17,0.02)",
                  }}
                />
              ))}
            </div>

            <ErrorLine error={error} />
            <Primary onClick={doVerifyOtp} busy={busy} theme={theme}>VERIFICA E ATTIVA</Primary>

            <button onClick={doResendOtp} className="text-xs mt-4" style={{ color: soft, fontWeight: 500 }}>
              Non hai ricevuto il codice? Invialo di nuovo
            </button>
            <br />
            <button onClick={() => { setMode("signup"); reset(); }} className="flex items-center gap-1.5 mx-auto text-xs mt-3" style={{ color: soft, fontWeight: 500 }}>
              <ArrowLeft size={12} /> Torna alla registrazione
            </button>
          </div>
        )}

        {mode === "recover" && (
          <div className="text-center">
            <p className="text-base mb-2" style={{ color: ink, fontWeight: 600 }}>Recupera l'accesso</p>
            <p className="text-sm mb-6" style={{ color: soft }}>
              Inserisci l'email del tuo account: ti invio il link per reimpostare la password.
            </p>
            <Field id="email3" label="Email" type="email" value={email} onChange={setEmail} placeholder="nome@email.it" icon={Mail} onEnter={submitCurrent} theme={theme} />
            <ErrorLine error={error} />
            <Primary onClick={doRecover} busy={busy} theme={theme}>INVIA LINK DI RECUPERO</Primary>
            <button onClick={() => { setMode("login"); reset(); }} className="flex items-center gap-1.5 mx-auto text-xs mt-4" style={{ color: soft, fontWeight: 500 }}>
              <ArrowLeft size={12} /> Torna all'accesso
            </button>
          </div>
        )}

        {mode === "sent" && (
          <div className="text-center">
            <span className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-4" style={{ backgroundColor: dark ? "#FFFFFF" : "#111111" }}>
              <Mail size={22} style={{ color: dark ? "#09090B" : GOLD }} />
            </span>
            <p className="text-base mb-2" style={{ color: ink, fontWeight: 600 }}>Controlla la tua posta</p>
            <p className="text-sm mb-7 leading-relaxed" style={{ color: soft }}>
              Se esiste un account associato a <span style={{ color: ink, fontWeight: 500 }}>{email}</span>, riceverai un link per
              impostare una nuova password. Il link scade dopo un'ora.
            </p>
            <button onClick={() => { setMode("login"); reset(); }} className="text-xs" style={{ color: soft, fontWeight: 500 }}>
              Torna all'accesso
            </button>
          </div>
        )}

        {mode === "update" && (
          <div className="text-center">
            <p className="text-base mb-2" style={{ color: ink, fontWeight: 600 }}>Imposta una nuova password</p>
            <p className="text-sm mb-6" style={{ color: soft }}>Almeno 8 caratteri. Al salvataggio entri direttamente nell'app.</p>
            <Field id="np1" label="Nuova password" value={password} onChange={setPassword} placeholder="••••••••" icon={Lock} toggle showPw={showPw} onToggleShowPw={() => setShowPw((v) => !v)} onEnter={submitCurrent} theme={theme} />
            <Field id="np2" label="Conferma password" value={password2} onChange={setPassword2} placeholder="••••••••" icon={Lock} toggle showPw={showPw} onToggleShowPw={() => setShowPw((v) => !v)} onEnter={submitCurrent} theme={theme} />
            <ErrorLine error={error} />
            <Primary onClick={doUpdate} busy={busy} theme={theme}>SALVA ED ENTRA</Primary>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   5 · CONSENSI LEGALI · VERSIONE STANDALONE
   ========================================================================== */

export function LegalConsents({ dark = false, onAccept, onBack }) {
  const [checked, setChecked] = useState({ gdpr: false, medical: false, community: false });
  const [open, setOpen] = useState(null);

  const ink = dark ? "#FFFFFF" : "#111111";
  const soft = SOFT;
  const surface = dark ? "#18181B" : "#FFFFFF";
  const line = dark ? "rgba(255,255,255,0.08)" : "rgba(17,17,17,0.06)";
  const page = dark ? "#09090B" : "#FFFFFF";
  const theme = { ink, soft, surface, line, dark, page };

  const allChecked = checked.gdpr && checked.medical && checked.community;

  return (
    <div className="min-h-screen px-4 py-10" style={{ backgroundColor: page, fontFamily: SANS }}>
      <style>{`
        @keyframes performGlow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
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
      `}</style>
      <div className="max-w-lg mx-auto spring-in relative">
        <span
          className="absolute uppercase"
          style={{ top: 0, right: 8, color: soft, fontSize: "0.5rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.04em" }}
        >
          Evidence-Based Method by D. Marsini
        </span>

        <BrandMark dark={dark} />
        <p
          className="text-center mb-8 perform-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            letterSpacing: "0.34em",
            paddingLeft: "0.34em",
            backgroundImage: dark ? GOLD_GRADIENT_DARK : GOLD_GRADIENT_LIGHT,
          }}
        >
          PERFORM
        </p>

        <h2 className="text-center mb-2" style={{ color: ink, fontSize: "1.3rem", fontWeight: 700, letterSpacing: "0.01em" }}>
          Prima di iniziare
        </h2>
        <p className="text-sm text-center mb-8 leading-relaxed" style={{ color: soft }}>
          Tre punti da leggere e accettare. Servono a tutelare te e a permettermi di lavorare
          con i tuoi dati in modo trasparente.
        </p>

        <div className="space-y-2.5">
          {CONSENT_COPY.map((item) => (
            <ConsentRow
              key={item.key}
              item={item}
              checked={checked[item.key]}
              expanded={open === item.key}
              onToggleCheck={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
              onToggleExpand={() => setOpen((k) => (k === item.key ? null : item.key))}
              theme={theme}
            />
          ))}
        </div>

        <button
          onClick={() => allChecked && onAccept({ ...checked })}
          disabled={!allChecked}
          className="w-full text-sm px-4 py-4 rounded-full mt-7 transition-transform active:scale-[0.98] disabled:opacity-35"
          style={{
            backgroundColor: dark ? "#FFFFFF" : "#111111",
            color: dark ? "#09090B" : GOLD,
            letterSpacing: "0.14em", fontWeight: 600,
          }}
        >
          {allChecked ? "ACCETTO ED ENTRO" : "ACCETTA I TRE PUNTI PER PROSEGUIRE"}
        </button>

        {onBack && (
          <button onClick={onBack} className="w-full text-xs mt-4 py-2" style={{ color: soft, fontWeight: 500 }}>
            Torna indietro
          </button>
        )}

        <p className="text-[11px] text-center mt-6 leading-relaxed" style={{ color: soft }}>
          Versione 1.3 dell'informativa. Data e ora dell'accettazione vengono registrate
          per obbligo di legge.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   6 · ANTEPRIMA — si elimina in produzione
   ========================================================================== */

export default function AuthView() {
  const [dark, setDark] = useState(false);
  const [log, setLog] = useState(null);

  const auth = useMemo(() => makeAuth(supabase), []);

  return (
    <div
      className="app-root min-h-screen"
      data-theme={dark ? "dark" : "light"}
      style={{ backgroundColor: dark ? "#09090B" : "#FFFFFF", transition: "background-color 0.4s ease" }}
    >
      <style>{`
        .app-root { font-family: ${SANS}; }
        @keyframes springIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.004); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .spring-in { animation: springIn 0.3s cubic-bezier(0.22, 1.2, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) { .spring-in { animation: none !important; } }
      `}</style>

      <div className="fixed top-3 right-3 z-50 flex gap-2">
        <button onClick={() => setDark((v) => !v)} className="text-xs px-3 py-2 rounded-full"
          style={{ backgroundColor: dark ? "#FFFFFF" : "#111111", color: dark ? "#09090B" : "#FFFFFF", fontWeight: 600 }}>
          {dark ? "Light" : "Onyx"}
        </button>
      </div>

      <AuthScreen
        auth={auth}
        dark={dark}
        onAuthenticated={(r) => setLog(r)}
      />

      {log && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full text-sm spring-in"
             style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 500 }}>
          Accesso riuscito: {log.user?.email} {log.isNew ? "· nuovo iscritto" : ""}
        </div>
      )}
    </div>
  );
}