import React, { useEffect, useMemo, useState } from "react";

import { supabase, makeAuth, AuthScreen } from "./components/03_AuthView.jsx";
import { AppShell, COACH_EMAIL, accentFor } from "./components/04_AppShell.jsx";
import HomeScreen from "./components/05_HomeDashboard.jsx";
import { NewsTipsView, NewsTipsViewStyles } from "./components/06_NewsTipsView.jsx";
import ClassificaView from "./components/07_ClassificaView.jsx";
import ProfileScreen, { SettingsDrawer } from "./components/08_ClientProfileView.jsx";
import CoachDashboard from "./components/09_CoachDashboard.jsx";
import CoachAssignPanel from "./components/10_CoachAssignPanel.jsx";

/* ============================================================================
   APP.JSX — punto di innesto reale dei 7 moduli PERFORM
   ----------------------------------------------------------------------------
   Qui vive lo STATO CONDIVISO tra le schermate: sessione Supabase, tema
   (Onyx/Light), genere (oro/rosa), lingua, piano di abbonamento e tab attiva.
   Ogni view riceve queste informazioni come prop invece di gestirle da sola:
   è questo il collegamento che mancava e che causava l'effetto "slide
   scollegate" — ogni file, in isolamento, aveva i propri toggle locali.

   PRODUZIONE — TODO espliciti:
   - `profileRow` va sostituito con una vera fetch da Supabase
     (`select gender, plan, nickname, full_name from profiles where id = session.user.id`)
     eseguita in un useEffect dopo il login. Qui è simulata perché la tabella
     `profiles` esiste già nello schema v11 ma il fetch non è ancora cablato.
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

  // --- Stato condiviso tra TUTTE le schermate ---------------------------------
  const [dark, setDark] = useState(false);
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

  // TODO produzione: quando `session` cambia, fetch della riga `profiles` reale
  // (gender, nickname, plan, lingua preferita) e settare gender/userPlan/lang
  // di conseguenza invece di lasciare i default "M"/"free"/"it". Es.:
  //
  // useEffect(() => {
  //   if (!session) return;
  //   supabase.from("profiles").select("gender, plan, lang, nickname, full_name")
  //     .eq("id", session.user.id).single().then(({ data }) => {
  //       if (data) { setGender(data.gender ?? "M"); setUserPlan(data.plan ?? "free"); setLang(data.lang ?? "it"); }
  //     });
  // }, [session]);

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
          // ClassificaView e CoachDashboard non hanno ancora una prop surface:
          // restano isole autonome finché non viene fatto il refactor dedicato
          // (vedi nota in cima al file).
          ranking: <ClassificaView />,
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
                <CoachDashboard />
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
