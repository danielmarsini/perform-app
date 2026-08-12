import React, { useEffect, useMemo, useState } from "react";

import { supabase, makeAuth, AuthScreen } from "./components/03_AuthView.jsx";
import { AppShell, COACH_EMAIL, accentFor } from "./components/04_AppShell.jsx";
import HomeScreen from "./components/05_HomeDashboard.jsx";
import { NewsTipsView, NewsTipsViewStyles } from "./components/06_NewsTipsView.jsx";
import ClassificaView from "./components/07_ClassificaView.jsx";
import ProfileScreen, { SettingsDrawer } from "./components/08_ClientProfileView.jsx";
import CoachDashboard from "./components/09_CoachDashboard.jsx";
import CoachAssignPanel from "./components/10_CoachAssignPanel.jsx";
import OnboardingFlow from "./components/11_OnboardingFlow.jsx";

/* ============================================================================
   APP.JSX — punto di innesto reale dei 7 moduli PERFORM
   ----------------------------------------------------------------------------
   Qui vive lo STATO CONDIVISO tra le schermate: sessione Supabase, tema
   (Onyx/Light), genere (oro/rosa), lingua, piano di abbonamento e tab attiva.
   Ogni view riceve queste informazioni come prop invece di gestirle da sola:
   è questo il collegamento che mancava e che causava l'effetto "slide
   scollegate" — ogni file, in isolamento, aveva i propri toggle locali.

   PRODUZIONE — TODO espliciti:
   - La riga `profiles` (gender, plan, onboarding_completed) viene ora
     recuperata davvero con una fetch in useEffect dopo il login — vedi sotto.
     `lang` resta invece stato locale: non è ancora una colonna in profiles.
   - Finché `profiles.onboarding_completed` è false, si monta OnboardingFlow
     (11) al posto della Home: selezione piano, e se il piano scelto è a
     coaching (scheda/training/full) anche l'anamnesi obbligatoria. Richiede
     la colonna aggiunta in SCHEMA_v16_onboarding.sql — se non è ancora stata
     eseguita su Supabase, ogni utente resta bloccato in OnboardingFlow.
   - La chiave Anthropic in NewsTipsView (`aiEndpoint`) va spostata dietro
     l'Edge Function proxy (già annotato nel file 06 stesso).
   - ClassificaView (07) e CoachDashboard (09) sono montati "as-is": non hanno
     ancora una prop surface per ricevere dati condivisi (vedi nota in fondo
     a questo file). Funzionano e sono raggiungibili dalla navigazione, ma
     restano isole a sé — è il prossimo passo di integrazione, non un bug di
     oggi.
   ========================================================================== */

const SEED_NEWS_TIPS = {
  news: [],
  tips: [],
  team: [],
};

export default function App() {
  const auth = useMemo(() => makeAuth(supabase), []);

  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);       // riga profiles reale, null finché non caricata
  const [profileLoading, setProfileLoading] = useState(true);

  // --- Stato condiviso tra TUTTE le schermate ---------------------------------
  const [dark, setDark] = useState(true);
  const [gender, setGender] = useState("M");           // 'M' | 'F' — da profiles.gender
  const [lang, setLang] = useState("it");               // 'it' | 'en' | 'es' | 'fr'
  const [userPlan, setUserPlan] = useState("free");      // 'free' | 'performance_pack' | 'full_coaching'
  const [tab, setTab] = useState("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachView, setCoachView] = useState("dashboard"); // 'dashboard' | 'assign'
  const [notifications, setNotifications] = useState({
    meals: true, steps: true, sleep: true, motivation: true,
  });

  // --- Bootstrap sessione Supabase --------------------------------------------
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ? { user: data.session.user } : null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ? { user: newSession.user } : null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch della riga `profiles` reale (gender, plan, onboarding_completed):
  // serve sia per allineare tema/piano allo stato salvato, sia per sapere se
  // mostrare OnboardingFlow invece della Home (vedi sotto). `lang` non è
  // ancora una colonna reale nello schema — resta lo stato locale "it" finché
  // non viene aggiunta, coerente con quanto già annotato in SettingsDrawer.
  useEffect(() => {
    if (!session) { setProfile(null); setProfileLoading(false); return undefined; }
    let cancelled = false;
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("gender, plan, onboarding_completed, nickname, full_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("PERFORM: errore caricamento profilo", error);
          setProfileLoading(false);
          return;
        }
        // NB: profiles.gender è 'male'/'female' nel DB, l'app usa 'M'/'F'.
        // profiles.plan usa 'full' (check constraint SCHEMA_v14), il resto
        // dell'app (05_HomeDashboard, gating AI) confronta 'full_coaching':
        // stessa normalizzazione già applicata in SettingsDrawer.onChangePlan.
        setGender(data.gender === "female" ? "F" : "M");
        setUserPlan(data.plan === "full" ? "full_coaching" : data.plan || "free");
        setProfile(data);
        setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [session]);

  const accent = accentFor(gender, dark);
  const isCoach = (session?.user?.email || "").trim().toLowerCase() === COACH_EMAIL;

  const stripePlanId =
    userPlan === "full_coaching" ? "full" : userPlan === "performance_pack" ? "performance" : "free";

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                     backgroundColor: "#09090B", color: "#FAFAFA", fontFamily: "system-ui" }}>
        Caricamento…
      </div>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        auth={auth}
        dark={dark}
        onAuthenticated={({ user }) => setSession({ user })}
      />
    );
  }

  if (profileLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                     backgroundColor: dark ? "#09090B" : "#FFFFFF", color: dark ? "#FAFAFA" : "#111111", fontFamily: "system-ui" }}>
        Caricamento…
      </div>
    );
  }

  // Gate di onboarding (SPECIFICA_FUNZIONALE.md § 1, 5): dopo la registrazione,
  // finché il profilo non ha completato selezione piano (+ anamnesi se piano
  // a coaching), niente Home. Il coach non passa mai da qui: non ha un piano
  // da scegliere, la sua riga `profiles` non va mai considerata "in attesa".
  if (!isCoach && profile && !profile.onboarding_completed) {
    return (
      <OnboardingFlow
        supabase={supabase}
        userId={session.user.id}
        gender={gender}
        dark={dark}
        lang={lang}
        accent={accent}
        initialPlan={profile.plan}
        onComplete={({ plan }) => {
          setUserPlan(plan === "full" ? "full_coaching" : plan);
          setProfile((p) => ({ ...(p ?? {}), plan, onboarding_completed: true }));
        }}
      />
    );
  }

  return (
    <>
      {/* CSS scoped del modulo News/Tips: va montata una sola volta a livello App */}
      <NewsTipsViewStyles />

      <AppShell
        gender={gender}
        dark={dark}
        onToggleDark={setDark}
        userLabel={session.user.user_metadata?.full_name || session.user.email}
        userEmail={session.user.email || ""}
        tab={tab}
        onTabChange={setTab}
        onOpenSettings={() => setSettingsOpen(true)}
        screens={{
          home: (
            <HomeScreen
              gender={gender}
              dark={dark}
              planTier={userPlan}
              supabase={supabase}
              userId={session.user.id}
              profileOverride={{
                name: session.user.user_metadata?.full_name || "Atleta",
                nickname: session.user.user_metadata?.nickname || session.user.email?.split("@")[0],
              }}
            />
          ),
          news: (
            <NewsTipsView
              meId={session.user.id}
              supabase={supabase}
              seeds={SEED_NEWS_TIPS}
              genderOverride={gender}
              planOverride={userPlan}
            />
          ),
          // CoachDashboard non ha ancora una prop surface: resta un'isola
          // autonoma finché non viene fatto il refactor dedicato (vedi nota
          // in cima al file). ClassificaView ora riceve supabase/meId/gender
          // per la classifica globale reale.
          ranking: <ClassificaView supabase={supabase} meId={session.user.id} genderOverride={gender} />,
          profile: (
            <ProfileScreen
              gender={gender}
              dark={dark}
              lang={lang}
              onChangeLang={setLang}
              userPlan={userPlan}
              onOpenSettings={() => setSettingsOpen(true)}
              ownerEmail={COACH_EMAIL}
              profileOverride={{
                name: session.user.user_metadata?.full_name || "Atleta",
                nickname: session.user.user_metadata?.nickname || session.user.email?.split("@")[0],
                email: session.user.email,
              }}
            />
          ),
          coach: isCoach ? (
            <div>
              {/* Selettore aggiunto in App.jsx: non fa parte di 09_CoachDashboard.jsx.
                  Fondere questo toggle nell'estetica gi\u00e0 rifinita del Coach Panel
                  \u00e8 un lavoro di styling successivo, non di collegamento dati. */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => setCoachView("dashboard")}
                  style={{
                    padding: "0.5rem 1rem", borderRadius: 999, border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: "0.85rem",
                    background: coachView === "dashboard" ? accent : "transparent",
                    color: coachView === "dashboard" ? "#111" : "var(--ink, inherit)",
                  }}
                >
                  Pannello Coach
                </button>
                <button
                  onClick={() => setCoachView("assign")}
                  style={{
                    padding: "0.5rem 1rem", borderRadius: 999, border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: "0.85rem",
                    background: coachView === "assign" ? accent : "transparent",
                    color: coachView === "assign" ? "#111" : "var(--ink, inherit)",
                  }}
                >
                  Assegna scheda/target
                </button>
              </div>
              {coachView === "dashboard" ? (
                <CoachDashboard supabase={supabase} coachId={session.user.id} />
              ) : (
                <CoachAssignPanel supabase={supabase} coachId={session.user.id} accent={accent} />
              )}
            </div>
          ) : null,
        }}
      />

      {/* Impostazioni globali: UNA sola istanza per tutta l'app, aperta
          dall'icona ingranaggio nell'header (AppHeader) o dalla card
          Impostazioni nel Profilo — mai duplicata per-schermata.
          Il wrapper .app-root con data-theme è OBBLIGATORIO: SettingsDrawer
          non definisce da sé le variabili CSS del tema (--surface, --line,
          --ink...), le eredita da un antenato con questa classe. Senza,
          il pannello appare trasparente — bug corretto qui. */}
      <div className="app-root" data-theme={dark ? "dark" : "light"}>
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          dark={dark}
          onToggleDark={() => setDark((v) => !v)}
          accent={accent}
          accentText={accent}
          gender={gender}
          lang={lang}
          onChangeLang={setLang}
          currentPlan={stripePlanId}
          planRenewsOn="2026-09-01"
          accountEmail={session.user.email || ""}
          notifications={notifications}
          onToggleNotification={(k) => setNotifications((n) => ({ ...n, [k]: !n[k] }))}
          onOpenBillingPortal={() => {
            // TODO produzione: redirect verso la Customer Portal Session di Stripe
            // creata da una Edge Function server-side (mai la secret key sul client).
          }}
          onChangePlan={(id) => {
            const mapped = id === "full" ? "full_coaching" : id === "performance" ? "performance_pack" : "free";
            setUserPlan(mapped);
            // TODO produzione: qui va la vera chiamata di checkout Stripe, non
            // solo l'aggiornamento dello stato locale.
          }}
          onDeleteAccount={() => {
            // TODO produzione: cancellazione account reale (Supabase Auth admin
            // + cascata su profiles/checkins/... secondo le policy GDPR).
          }}
          onLogout={async () => {
            await supabase.auth.signOut();
            setSession(null);
          }}
        />
      </div>
    </>
  );
}
