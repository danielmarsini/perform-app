/* ============================================================================
   PERFORM · 11_OnboardingFlow.jsx — SELEZIONE PIANO + ANAMNESI OBBLIGATORIA
   Evidence-Based Method by D. Marsini

   Si inserisce tra la verifica OTP e la Home (SPECIFICA_FUNZIONALE.md § 1, 5):
   dopo la registrazione, finché profiles.onboarding_completed è false,
   App.jsx monta questo componente al posto di AppShell.

     1. Piano  → le 5 card ufficiali (STRIPE_PLANS/PlanCard, già costruite in
        08_ClientProfileView.jsx: nessuna copy duplicata). Il piano Free
        scrive subito profiles.plan, nessun pagamento. Gli altri 4 aprono una
        vera Stripe Checkout Session (create-checkout-session) e redirigono
        lì: profiles.plan si scrive SOLO dopo la conferma del webhook lato
        server (supabase/functions/stripe-webhook), mai in ottimistico prima
        del pagamento. Al ritorno da Stripe (App.jsx, redirect su
        ?checkout=success) questo componente rimonta con initialPlan già
        aggiornato e riprende da dove serve (anamnesi per i piani coaching,
        chiusura diretta per Premium).
     2. Anamnesi → SOLO se il piano scelto è a coaching (scheda/training/full):
        le stesse 56 domande del pannello coach (ANAM_QUESTIONS/AnamAreaSection,
        esportate da 09_CoachDashboard.jsx), compilate stavolta dall'atleta
        stesso invece che simulate, salvate su anamnesis_responses via
        saveAnamnesis — la stessa funzione che il coach usa per leggerle.
        La domanda "photos" (__foto) è esclusa: quella riga nel pannello coach
        è dichiaratamente un placeholder demo ("3/3 caricate"), non va
        mostrata a un atleta reale come se fosse già stato fatto un upload.

   Free e Premium non richiedono anamnesi (sono piani autogestiti,
   nessun coach li assegna): dopo la scelta si entra subito in Home.
   ========================================================================== */

import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { DesignSystem, LiveBackground } from "./04_AppShell.jsx";
import { STRIPE_PLANS, translations, GradientText, PlanCard, hasAnnualPricing, withBillingCycle, BillingCycleToggle } from "./08_ClientProfileView.jsx";
// Da AnamnesisShared.jsx (non più da 09_CoachDashboard.jsx): quel file è
// 5000+ righe lazy-caricate solo per il coach — importare anche solo questi
// 4 export da lì costringeva Vite a includerlo comunque nel bundle
// principale per ogni utente, coach o meno (vedi commento in testa ad
// AnamnesisShared.jsx).
import { GlobalStyle as CoachGlobalStyle, ANAM_AREAS, ANAM_QUESTIONS, AnamAreaSection } from "./AnamnesisShared.jsx";
import { saveAnamnesis, resolveReferralCode, recordReferralSignup } from "../lib/coachingData.js";

// UI id (quello di STRIPE_PLANS, condiviso con SettingsDrawer) -> valore reale
// accettato dal check constraint di profiles.plan (SCHEMA_v14).
const UI_TO_DB_PLAN = {
  free: "free",
  performance: "performance_pack",
  scheda: "scheda_personalizzata",
  training: "training",
  full: "full",
};

const DB_TO_UI_PLAN = { scheda_personalizzata: "scheda", training: "training", full: "full" };

const ANAM_FILLABLE = ANAM_QUESTIONS.filter((q) => q.t !== "photos");
const ANAM_REQUIRED = ANAM_FILLABLE.filter((q) => q.req);

// Il mini-tutorial di benvenuto (le 4 slide di presentazione) non vive più
// qui: è stato spostato in LandingIntro.jsx e mostrato PRIMA della
// registrazione (App.jsx), non più come primo step di questo flusso —
// prima di chiedere un account, va costruita l'aspettativa. Questo
// componente parte quindi direttamente dallo step "plan".

// `initialPlan` è il valore già presente su profiles.plan quando questo
// componente monta. Il default DB per un profilo nuovo è 'free', quindi non
// basta da solo a dire "il piano è già stato scelto qui" — MA se vale uno dei
// 3 piani a coaching, può essere arrivato SOLO da choosePlan() qui sotto (non
// esiste altra via lato client che lo scriva): significa che l'utente ha già
// superato lo step "plan" e si è interrotto durante l'anamnesi (refresh,
// connessione caduta). In quel caso si riparte direttamente da lì, invece di
// fargli rifare la scelta e perdere quello che aveva già iniziato a scrivere.
export default function OnboardingFlow({ supabase, userId, gender = "M", dark = true, lang = "it", accent, initialPlan, resumedAddonPlanId, onComplete }) {
  const resumedPlanId = DB_TO_UI_PLAN[initialPlan];
  // Premium è pagato ma non a coaching: tornando da Stripe con
  // initialPlan già confermato dal webhook non va in anamnesi (non richiesta,
  // vedi nota in testa al file), ma l'onboarding va comunque chiuso — lo fa
  // l'effect subito sotto, "step" resta 'plan' solo per il breve istante in
  // cui quell'effect gira (isFinishingPack copre quel caso a schermo).
  // resumedAddonPlanId ha sempre precedenza: un Premium che ha appena
  // comprato l'add-on Scheda Personalizzata ha initialPlan="performance_pack"
  // invariato (non è mai stato "di nuovo" un pagamento Premium) —
  // senza questo controllo lo scorciatoia qui sotto chiuderebbe l'onboarding
  // senza fargli mai compilare l'anamnesi richiesta dall'add-on.
  const isResumedPerformancePack = initialPlan === "performance_pack" && !resumedAddonPlanId;
  // resumedAddonPlanId: chi ha comprato Scheda Personalizzata come add-on
  // sopra Free/Premium (SCHEMA_v68) — initialPlan da solo non lo dice più
  // (profiles.plan resta il piano base, mai riscritto per questo acquisto),
  // ma l'anamnesi va comunque compilata. dbValue: null segnala a onComplete
  // di NON toccare il piano base al termine, solo chiudere l'onboarding.
  const [step, setStep] = useState(resumedPlanId || resumedAddonPlanId ? "anamnesi" : "plan"); // 'plan' | 'anamnesi'
  const [chosenPlan, setChosenPlan] = useState(
    resumedPlanId ? { id: resumedPlanId, dbValue: initialPlan }
      : resumedAddonPlanId ? { id: resumedAddonPlanId, dbValue: null }
      : null
  ); // { id, dbValue } — id STRIPE_PLANS, dbValue colonna reale (null = add-on, non tocca il piano base)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [billingCycle, setBillingCycle] = useState("monthly"); // 'monthly' | 'annual'

  // §08 memo "Verso l'élite" — programma referral: applicato PRIMA di
  // scegliere il piano (indipendente dal piano, funziona sia per Free sia
  // per i piani a pagamento che completano l'onboarding solo dopo il
  // ritorno da Stripe) — un solo update su profiles.referred_by, mai legato
  // al flusso di pagamento.
  const [referralCode, setReferralCode] = useState("");
  const [referralStatus, setReferralStatus] = useState("idle"); // idle | applying | applied | invalid | error
  const applyReferralCode = async () => {
    if (!referralCode.trim()) return;
    setReferralStatus("applying");
    try {
      const referrerId = await resolveReferralCode(supabase, referralCode);
      if (!referrerId || referrerId === userId) { setReferralStatus("invalid"); return; }
      const res = await recordReferralSignup(supabase, referralCode);
      if (!res?.ok) { setReferralStatus("invalid"); return; }
      setReferralStatus("applied");
    } catch (err) {
      console.error("PERFORM: errore applicazione codice invito", err);
      setReferralStatus("error");
    }
  };

  useEffect(() => {
    if (!isResumedPerformancePack) return undefined;
    let cancelled = false;
    supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId)
      .then(({ error: doneError }) => {
        if (cancelled) return;
        if (doneError) { console.error("PERFORM: errore chiusura onboarding Premium", doneError); return; }
        onComplete({ plan: initialPlan });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = translations[lang] || translations.it;
  const setField = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  const choosePlan = async (plan) => {
    setError("");
    setBusy(true);
    const dbValue = UI_TO_DB_PLAN[plan.id];
    try {
      if (plan.billing === "none") {
        // Free: nessun pagamento, si scrive subito e si entra — invariato.
        const { error: planError } = await supabase.from("profiles").update({ plan: dbValue }).eq("id", userId);
        if (planError) throw planError;
        const { error: doneError } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
        if (doneError) throw doneError;
        onComplete({ plan: dbValue });
        return;
      }
      // Piano a pagamento: vero checkout Stripe. profiles.plan si scrive SOLO
      // dopo la conferma del webhook lato server — questo componente non
      // scrive mai un piano a coaching prima che sia stato davvero pagato.
      // Al ritorno da Stripe (App.jsx, redirect su ?checkout=success) questo
      // stesso componente rimonta con initialPlan già aggiornato e
      // resumedPlanId salta dritto qui sotto all'anamnesi.
      const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId: plan.priceId, origin: window.location.origin },
      });
      if (fnError || !data?.url) throw fnError || new Error("URL di pagamento non disponibile");
      window.location.href = data.url;
    } catch (e) {
      console.error("PERFORM: errore avvio pagamento piano", e);
      setError("Non sono riuscito ad avviare il pagamento. Controlla la connessione e riprova.");
      setBusy(false);
    }
  };

  const missingRequired = ANAM_REQUIRED.filter((q) => String(answers[q.k] ?? "").trim() === "");
  const canSubmitAnamnesi = missingRequired.length === 0;
  const filledCount = ANAM_FILLABLE.filter((q) => String(answers[q.k] ?? "").trim() !== "").length;
  const pctFilled = Math.round((filledCount / ANAM_FILLABLE.length) * 100);

  const submitAnamnesi = async () => {
    if (!canSubmitAnamnesi || !chosenPlan) return;
    setError("");
    setBusy(true);
    try {
      await saveAnamnesis(supabase, userId, answers);
      const { error: doneError } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
      if (doneError) throw doneError;
      onComplete({ plan: chosenPlan.dbValue });
    } catch (e) {
      console.error("PERFORM: errore salvataggio anamnesi", e);
      setError("Non sono riuscito a salvare l'anamnesi. Controlla la connessione e riprova.");
    } finally {
      setBusy(false);
    }
  };

  if (isResumedPerformancePack) {
    return (
      <div className="app-root min-h-screen flex items-center justify-center" data-theme={dark ? "dark" : "light"} style={{ backgroundColor: "var(--page)" }}>
        <DesignSystem />
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
          <Loader2 size={15} className="animate-spin" /> Pagamento confermato, un attimo…
        </p>
      </div>
    );
  }

  if (step === "anamnesi") {
    return (
      <div className={`coach-root${dark ? " dark" : ""}`} style={{ minHeight: "100vh" }}>
        <CoachGlobalStyle />
        <main className="max-w-2xl mx-auto px-4 py-10 pb-24">
          <div className="mb-6">
            <span className="c-label">Ultimo passo</span>
            <h1 className="font-display mt-1 mb-2" style={{ fontSize: "1.5rem", color: "var(--ink)" }}>
              Prima di iniziare, raccontami di te
            </h1>
            <p className="c-muted text-sm leading-relaxed">
              56 domande in 9 aree: mi servono per costruirti una scheda e un piano su misura, non
              generici. Puoi tornare a compilarle anche in seguito dal tuo profilo, ma i campi con
              l'asterisco (*) servono subito per partire.
            </p>
          </div>

          <div className="c-card mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="c-heading font-display font-bold">Compilazione anamnesi</p>
              <span className="font-data text-xs font-bold" style={{ color: pctFilled >= 90 ? "#10B981" : pctFilled >= 50 ? "#F0A020" : "var(--ink-soft)" }}>
                {pctFilled}% completata
              </span>
            </div>
            <p className="c-muted text-xs">
              {missingRequired.length === 0
                ? "Tutti i campi obbligatori sono compilati: puoi entrare quando vuoi."
                : `Mancano ${missingRequired.length} campi obbligatori per poter continuare.`}
            </p>
          </div>

          {Object.entries(ANAM_AREAS).map(([areaId, label]) => (
            <AnamAreaSection
              key={areaId}
              areaId={areaId}
              label={label}
              questions={ANAM_FILLABLE.filter((q) => q.area === areaId)}
              answers={answers}
              onChange={setField}
              defaultOpen={areaId === "a1"}
            />
          ))}

          {error && (
            <p className="text-xs mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
              {error}
            </p>
          )}

          <button
            onClick={submitAnamnesi}
            disabled={!canSubmitAnamnesi || busy}
            className="w-full rounded-full px-4 py-3.5 text-sm mt-5 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: accent || "#C5A059", color: "#111111", fontWeight: 700, letterSpacing: "0.06em" }}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? "SALVATAGGIO…" : "ENTRA IN PERFORM"}
          </button>

          <button
            onClick={() => { setStep("plan"); setError(""); }}
            disabled={busy}
            className="w-full text-xs mt-4 py-2"
            style={{ color: "var(--ink-soft)", fontWeight: 500 }}
          >
            Torna alla scelta del piano
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app-root min-h-screen" data-theme={dark ? "dark" : "light"} style={{ backgroundColor: "var(--page)" }}>
      <DesignSystem />
      <LiveBackground gender={gender} dark={dark} />
      <main className="max-w-2xl mx-auto px-4 py-10 pb-24" style={{ position: "relative", zIndex: 1 }}>
        <div className="text-center mb-8">
          <GradientText gender={gender} style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
            {t.plan.chooseTitle}
          </GradientText>
        </div>

        {error && (
          <p className="text-xs mb-4 rounded-lg px-3 py-2 text-center" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
            {error}
          </p>
        )}

        {hasAnnualPricing && (
          <>
            <BillingCycleToggle cycle={billingCycle} onChange={setBillingCycle} accent={accent || "#C5A059"} t={t} />
            {billingCycle === "annual" && (
              <p className="text-xs leading-relaxed mb-4 px-1" style={{ color: "var(--ink-2)" }}>
                {t.plan.annualPitch}
              </p>
            )}
          </>
        )}

        {withBillingCycle(STRIPE_PLANS, billingCycle).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            active={false}
            accent={accent || "#C5A059"}
            accentText={accent || "#C5A059"}
            gender={gender}
            dark={dark}
            t={t}
            isOwner={false}
            signupContext
            onChangePlan={busy ? () => {} : choosePlan}
          />
        ))}

        {busy && (
          <p className="flex items-center justify-center gap-2 text-xs mt-2" style={{ color: "var(--ink-2)" }}>
            <Loader2 size={13} className="animate-spin" /> Un attimo…
          </p>
        )}

        {/* Codice invito e nota "puoi sempre cambiare" in fondo a tutta la
            pagina, sotto ogni card piano: sono informazioni di contorno,
            non devono competere con i piani per l'attenzione di chi arriva
            qui per la prima volta. */}
        <div className="rounded-2xl px-4 py-3.5 mt-6" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--ink-2)", fontWeight: 600 }}>Hai un codice invito? (facoltativo)</p>
          <div className="flex items-center gap-2">
            <input type="text" value={referralCode}
              onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralStatus("idle"); }}
              placeholder="Es. AB3D9F2K" maxLength={8} disabled={referralStatus === "applied"}
              className="input flex-1 px-3 py-2 text-sm font-data" style={{ letterSpacing: "0.06em" }} />
            <button onClick={applyReferralCode} disabled={referralStatus === "applying" || referralStatus === "applied" || !referralCode.trim()}
              className="rounded-full px-4 py-2 text-xs shrink-0"
              style={{ backgroundColor: referralStatus === "applied" ? "#059669" : "var(--ink)", color: "var(--page)", fontWeight: 700, opacity: referralStatus === "applying" ? 0.7 : 1 }}>
              {referralStatus === "applied" ? "✓ Applicato" : referralStatus === "applying" ? "…" : "Applica"}
            </button>
          </div>
          {referralStatus === "invalid" && <p className="text-xs mt-1.5" style={{ color: "#DC2626" }}>Codice non valido — controlla di averlo scritto giusto.</p>}
          {referralStatus === "error" && <p className="text-xs mt-1.5" style={{ color: "#DC2626" }}>Non sono riuscito ad applicarlo — riprova.</p>}
        </div>

        <p className="mt-4 text-xs text-center leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Puoi sempre cambiare piano più avanti dalle Impostazioni. Se scegli uno dei piani
          seguiti da un coach, subito dopo ti chiedo di compilare la tua anamnesi.
        </p>
      </main>
    </div>
  );
}
