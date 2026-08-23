import React, { useEffect, useMemo, useState, Suspense, lazy } from "react";

import { supabase, makeAuth, AuthScreen } from "./components/03_AuthView.jsx";
import { AppShell, COACH_EMAIL, accentFor, SplashScreen } from "./components/04_AppShell.jsx";
import HomeScreen from "./components/05_HomeDashboard.jsx";
import { NewsTipsView, NewsTipsViewStyles } from "./components/06_NewsTipsView.jsx";
import ProfileScreen, { SettingsDrawer } from "./components/08_ClientProfileView.jsx";
import OnboardingFlow from "./components/11_OnboardingFlow.jsx";
import { subscribeToPush } from "./lib/pushNotifications.js";
import AddToHomeScreenBanner from "./components/AddToHomeScreenBanner.jsx";

// Caricati solo quando servono davvero (React.lazy → chunk separato), non
// nel bundle iniziale: sono schermate secondarie (CoachDashboard esiste solo
// per l'account del coach) — ogni cliente che apre l'app non dovrebbe dover
// scaricare quel codice solo per vedere la Home. NewsTipsView/ProfileScreen
// restano eager: le loro esportazioni SettingsDrawer/NewsTipsViewStyles sono
// montate sempre, a prescindere dalla tab attiva, quindi il loro modulo
// verrebbe comunque scaricato subito — lazy-caricarle non risparmierebbe nulla.
const ClassificaView = lazy(() => import("./components/07_ClassificaView.jsx"));
// NOTA: per CoachDashboard questo lazy() è corretto ma oggi NON produce
// ancora un chunk separato — 11_OnboardingFlow.jsx importa staticamente
// (GlobalStyle, ANAM_AREAS, ANAM_QUESTIONS, AnamAreaSection) dallo STESSO
// file 09_CoachDashboard.jsx, quindi Vite deve comunque includerlo nel
// bundle principale. La soluzione pulita è spostare quei 4 export condivisi
// in un file a parte — file da 3000+ righe con parecchio codice intrecciato
// in mezzo, un refactor che merita il suo giro dedicato invece di farlo di
// fretta a fine sessione. Il lazy() resta comunque innocuo nel frattempo.
const CoachDashboard = lazy(() => import("./components/09_CoachDashboard.jsx"));

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

// Fallback per lo Suspense di ClassificaView/CoachDashboard (caricate solo
// al primo accesso a quella tab, vedi lazy() sopra): un pulse discreto sullo
// sfondo giusto del tema, MAI un flash bianco con la scritta "Caricamento…"
// al centro — è la stessa categoria di schermata di caricamento invadente
// già tolta altrove nell'app su richiesta esplicita.
function ScreenFallback({ dark, minHeight = "50vh" }) {
  return (
    <div style={{ minHeight, display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: dark ? "#09090B" : "#FFFFFF" }}>
      <div className="app-loading-pulse" style={{ width: 40, height: 40, borderRadius: "50%",
             border: `2.5px solid ${dark ? "rgba(250,250,250,0.15)" : "rgba(17,17,17,0.1)"}`,
             borderTopColor: dark ? "#FAFAFA" : "#111111" }} />
    </div>
  );
}

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
  // Tema: Onyx (nero) è l'UNICO tema dell'app, per tutti — la modalità
  // chiara è stata rimossa definitivamente (scelta esplicita del brand, non
  // più un toggle nelle Impostazioni). Non più uno stato: una costante.
  const dark = true;
  // I popup montati via Portal (src/components/Portal.jsx) escono dall'albero
  // React e finiscono come figli diretti di <body> — se il tema (classe
  // app-root + data-theme, da cui vengono lette --surface/--line/--ink...)
  // è applicato solo su un <div> annidato dentro l'app, un popup portalato
  // non lo eredita più e appare trasparente (il bug delle Impostazioni "di
  // lato"). Applicandolo anche su <html>, che è SEMPRE un antenato reale di
  // qualunque contenuto — portalato o no — il problema sparisce alla radice,
  // invece di dover ricordarsi di avvolgere ogni singolo popup a mano.
  useEffect(() => {
    document.documentElement.classList.add("app-root");
    document.documentElement.dataset.theme = "dark";
  }, []);
  const [gender, setGender] = useState("M");           // 'M' | 'F' — da profiles.gender
  const [lang, setLang] = useState("it");               // 'it' | 'en' | 'es' | 'fr'
  const [userPlan, setUserPlan] = useState("free");      // 'free' | 'performance_pack' | 'full_coaching'
  // BUG PRESO: su mobile (specie PWA), cambiare app per pochi secondi e
  // tornare indietro spesso fa sì che il sistema operativo scarichi dalla
  // memoria la pagina in background — al ritorno il browser la ricarica da
  // zero, e senza persistenza si ripartiva sempre dalla Home anche se prima
  // si era su un'altra schermata (Alimentazione, Classifica...). Non è un
  // bug eliminabile del tutto (è il sistema operativo a decidere quando
  // scaricare una pagina in background per risparmiare memoria, JS non può
  // impedirlo), ma si può far ripartire l'app dall'ultima schermata aperta
  // invece che sempre dalla Home — localStorage sopravvive al reload.
  const [tab, setTab] = useState(() => localStorage.getItem("perform_last_tab") || "home");
  useEffect(() => { localStorage.setItem("perform_last_tab", tab); }, [tab]);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      // Copre OGNI via di uscita dalla sessione (non solo il pulsante Esci
      // nelle Impostazioni: scadenza token, sign-out da un'altra scheda...):
      // senza reset, il prossimo login su questa stessa scheda del browser
      // (App.jsx non si smonta mai tra un logout e un login) ripresentava
      // l'ultima tab/pannello aperti invece della Home pulita.
      if (!newSession) {
        setSettingsOpen(false); setTab("home");
        // Stesso identico motivo del reset di tab qui sopra, ma per lo
        // screen interno di HomeDashboard (05_HomeDashboard.jsx): quello è
        // persistito in localStorage per sopravvivere a un reload mentre
        // l'app è in background (vedi lì), ma sopravviverebbe ANCHE a un
        // logout — il prossimo account che fa login sullo stesso browser
        // atterrerebbe sull'ultima sotto-schermata dell'account precedente
        // invece che sulla Home. Va ripulito qui, l'unico posto che copre
        // davvero ogni via di uscita dalla sessione.
        localStorage.removeItem("perform_last_screen");
      }
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
    // Se si torna da un pagamento Stripe (?checkout=success), il webhook che
    // scrive profiles.plan potrebbe non aver ancora fatto in tempo rispetto
    // al redirect del browser: ripeto la lettura per qualche secondo prima
    // di arrendermi, invece di rimandare subito l'atleta alla scelta del
    // piano che ha appena pagato (vedi resumedPlanId in OnboardingFlow, che
    // salta dritto all'anamnesi non appena profiles.plan è un piano coaching).
    const justPaid = new URLSearchParams(window.location.search).get("checkout") === "success";
    const loadProfile = (attempt = 0) => {
      supabase
        .from("profiles")
        .select("gender, plan, onboarding_completed, nickname, full_name, micro_addon")
        .eq("id", session.user.id)
        .single()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error("PERFORM: errore caricamento profilo", error);
            setProfileLoading(false);
            return;
          }
          if (justPaid && data.plan === "free" && attempt < 6) {
            setTimeout(() => { if (!cancelled) loadProfile(attempt + 1); }, 1500);
            return;
          }
          if (justPaid) {
            const url = new URL(window.location.href);
            url.searchParams.delete("checkout");
            window.history.replaceState({}, "", url);
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
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [session]);

  const accent = accentFor(gender, dark);
  const isCoach = (session?.user?.email || "").trim().toLowerCase() === COACH_EMAIL;

  const stripePlanId =
    userPlan === "full_coaching" ? "full" : userPlan === "performance_pack" ? "performance" : "free";

  if (authLoading) {
    return <SplashScreen dark={dark} />;
  }

  if (!session) {
    return (
      <AuthScreen
        auth={auth}
        dark={dark}
        onAuthenticated={({ user, isNew }) => {
          setSession({ user });
          // Richiesta automatica su richiesta esplicita del coach: niente
          // toggle da scovare nelle Impostazioni, il permesso del browser
          // (l'unico vero "sì" possibile — nessun sito può attivarle da solo
          // in silenzio) parte subito dopo la registrazione. Se il
          // dispositivo/browser non supporta le push (es. iPhone non ancora
          // aggiunto a Home, richiesto da Apple) fallisce silenziosamente:
          // resta comunque attivabile a mano dal Profilo in un secondo momento.
          if (isNew) subscribeToPush(supabase, user.id).catch(() => {});
        }}
      />
    );
  }

  if (profileLoading) {
    return <SplashScreen dark={dark} />;
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

      <AddToHomeScreenBanner accent={accent} dark={dark} />

      <Suspense fallback={<ScreenFallback dark={dark} />}>
      <AppShell
        gender={gender}
        dark={dark}
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
              isOwner={isCoach}
              microAddon={!!profile?.micro_addon}
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
              planOverride={isCoach ? "full_coaching" : userPlan}
            />
          ),
          // CoachDashboard non ha ancora una prop surface: resta un'isola
          // autonoma finché non viene fatto il refactor dedicato (vedi nota
          // in cima al file). ClassificaView ora riceve supabase/meId/gender
          // per la classifica globale reale.
          ranking: <ClassificaView supabase={supabase} meId={session.user.id} genderOverride={gender} dark={dark} />,
          profile: (
            <ProfileScreen
              gender={gender}
              dark={dark}
              lang={lang}
              onChangeLang={setLang}
              userPlan={userPlan}
              onOpenSettings={() => setSettingsOpen(true)}
              ownerEmail={COACH_EMAIL}
              supabase={supabase}
              userId={session.user.id}
              profileOverride={{
                name: session.user.user_metadata?.full_name || "Atleta",
                nickname: session.user.user_metadata?.nickname || session.user.email?.split("@")[0],
                email: session.user.email,
              }}
            />
          ),
          // Il toggle "Assegna scheda/target" (CoachAssignPanel) \u00e8 stato
          // rimosso: era ridondante con l'editor gi\u00e0 raggiungibile cliccando
          // il nome di un cliente dentro il Pannello Coach (ClientDetail \u2192
          // tab "editor"), due percorsi per la stessa azione.
          coach: isCoach ? <CoachDashboard supabase={supabase} coachId={session.user.id} dark={dark} /> : null,
        }}
      />
      </Suspense>

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
          supabase={supabase}
          userId={session.user.id}
          onOpenBillingPortal={async () => {
            try {
              const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
                body: { origin: window.location.origin },
              });
              if (error || !data?.url) throw error || new Error("URL del portale non disponibile");
              window.location.href = data.url;
            } catch (err) {
              console.error("PERFORM: errore apertura Billing Portal", err);
            }
          }}
          onChangePlan={(id) => {
            // A questo punto arriva solo la scelta del piano gratuito: i
            // piani a pagamento passano da startStripeCheckout (redirect a
            // Stripe) e non chiamano mai questa funzione — vedi
            // 08_ClientProfileView.jsx.
            const mapped = id === "full" ? "full_coaching" : id === "performance" ? "performance_pack" : "free";
            setUserPlan(mapped);
            supabase.from("profiles").update({ plan: "free" }).eq("id", session.user.id)
              .then(({ error }) => { if (error) console.error("PERFORM: errore salvataggio piano gratuito", error); });
          }}
          onDeleteAccount={() => {
            // TODO produzione: cancellazione account reale (Supabase Auth admin
            // + cascata su profiles/checkins/... secondo le policy GDPR).
          }}
          onLogout={async () => {
            // Il reset di tab/settingsOpen (BUG PRESO: restavano quelli di
            // prima del logout, riportando l'utente su Impostazioni invece
            // che sulla Home al prossimo login) vive centralizzato in
            // onAuthStateChange qui sopra — copre questo pulsante e ogni
            // altra via di uscita dalla sessione allo stesso modo.
            await supabase.auth.signOut();
          }}
        />
      </div>
    </>
  );
}
