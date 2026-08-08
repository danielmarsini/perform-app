/* ============================================================================
   PERFORM · 11_OnboardingFlow.jsx — SELEZIONE PIANO + ANAMNESI OBBLIGATORIA
   Evidence-Based Method by D. Marsini

   Si inserisce tra la verifica OTP e la Home (SPECIFICA_FUNZIONALE.md § 1, 5):
   dopo la registrazione, finché profiles.onboarding_completed è false,
   App.jsx monta questo componente al posto di AppShell.

     1. Piano  → le 5 card ufficiali (STRIPE_PLANS/PlanCard, già costruite in
        08_ClientProfileView.jsx: nessuna copy duplicata). La scelta scrive
        subito profiles.plan — non c'è ancora un vero checkout Stripe (vedi
        TODO in SettingsDrawer), quindi qui il piano si attiva senza addebito
        reale, esattamente come fa già SettingsDrawer.onChangePlan.
     2. Anamnesi → SOLO se il piano scelto è a coaching (scheda/training/full):
        le stesse 56 domande del pannello coach (ANAM_QUESTIONS/AnamAreaSection,
        esportate da 09_CoachDashboard.jsx), compilate stavolta dall'atleta
        stesso invece che simulate, salvate su anamnesis_responses via
        saveAnamnesis — la stessa funzione che il coach usa per leggerle.
        La domanda "photos" (__foto) è esclusa: quella riga nel pannello coach
        è dichiaratamente un placeholder demo ("3/3 caricate"), non va
        mostrata a un atleta reale come se fosse già stato fatto un upload.

   Free e Performance Pack non richiedono anamnesi (sono piani autogestiti,
   nessun coach li assegna): dopo la scelta si entra subito in Home.
   ========================================================================== */

import React, { useState } from "react";
import { Loader2 } from "lucide-react";

import { DesignSystem } from "./04_AppShell.jsx";
import { STRIPE_PLANS, translations, GradientText, PlanCard } from "./08_ClientProfileView.jsx";
import { GlobalStyle as CoachGlobalStyle, ANAM_AREAS, ANAM_QUESTIONS, AnamAreaSection } from "./09_CoachDashboard.jsx";
import { saveAnamnesis } from "../lib/coachingData.js";

// UI id (quello di STRIPE_PLANS, condiviso con SettingsDrawer) -> valore reale
// accettato dal check constraint di profiles.plan (SCHEMA_v14).
const UI_TO_DB_PLAN = {
  free: "free",
  performance: "performance_pack",
  scheda: "scheda_personalizzata",
  training: "training",
  full: "full",
};

const COACHING_PLAN_IDS = new Set(["scheda", "training", "full"]);
const DB_TO_UI_PLAN = { scheda_personalizzata: "scheda", training: "training", full: "full" };

const ANAM_FILLABLE = ANAM_QUESTIONS.filter((q) => q.t !== "photos");
const ANAM_REQUIRED = ANAM_FILLABLE.filter((q) => q.req);

// `initialPlan` è il valore già presente su profiles.plan quando questo
// componente monta. Il default DB per un profilo nuovo è 'free', quindi non
// basta da solo a dire "il piano è già stato scelto qui" — MA se vale uno dei
// 3 piani a coaching, può essere arrivato SOLO da choosePlan() qui sotto (non
// esiste altra via lato client che lo scriva): significa che l'utente ha già
// superato lo step "plan" e si è interrotto durante l'anamnesi (refresh,
// connessione caduta). In quel caso si riparte direttamente da lì, invece di
// fargli rifare la scelta e perdere quello che aveva già iniziato a scrivere.
export default function OnboardingFlow({ supabase, userId, gender = "M", dark = true, lang = "it", accent, initialPlan, onComplete }) {
  const resumedPlanId = DB_TO_UI_PLAN[initialPlan];
  const [step, setStep] = useState(resumedPlanId ? "anamnesi" : "plan"); // 'plan' | 'anamnesi'
  const [chosenPlan, setChosenPlan] = useState(
    resumedPlanId ? { id: resumedPlanId, dbValue: initialPlan } : null
  ); // { id, dbValue } — id STRIPE_PLANS, dbValue colonna reale
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});

  const t = translations[lang] || translations.it;
  const setField = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));

  const choosePlan = async (plan) => {
    setError("");
    setBusy(true);
    const dbValue = UI_TO_DB_PLAN[plan.id];
    try {
      const { error: planError } = await supabase.from("profiles").update({ plan: dbValue }).eq("id", userId);
      if (planError) throw planError;

      if (COACHING_PLAN_IDS.has(plan.id)) {
        setChosenPlan({ id: plan.id, dbValue });
        setStep("anamnesi");
      } else {
        const { error: doneError } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
        if (doneError) throw doneError;
        onComplete({ plan: dbValue });
      }
    } catch (e) {
      console.error("PERFORM: errore salvataggio piano scelto", e);
      setError("Non sono riuscito a salvare il piano scelto. Controlla la connessione e riprova.");
    } finally {
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
      <main className="max-w-2xl mx-auto px-4 py-10 pb-24">
        <div className="text-center mb-8">
          <GradientText gender={gender} style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
            {t.plan.chooseTitle}
          </GradientText>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Puoi sempre cambiare piano più avanti dalle Impostazioni. Se scegli uno dei piani
            seguiti da un coach, subito dopo ti chiedo di compilare la tua anamnesi.
          </p>
        </div>

        {error && (
          <p className="text-xs mb-4 rounded-lg px-3 py-2 text-center" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
            {error}
          </p>
        )}

        {STRIPE_PLANS.map((plan) => (
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
            onChangePlan={busy ? () => {} : choosePlan}
          />
        ))}

        {busy && (
          <p className="flex items-center justify-center gap-2 text-xs mt-2" style={{ color: "var(--ink-2)" }}>
            <Loader2 size={13} className="animate-spin" /> Un attimo…
          </p>
        )}
      </main>
    </div>
  );
}
