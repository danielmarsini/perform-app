import React, { useEffect, useMemo, useState, Suspense, lazy } from "react";
import { ArrowLeft, Lock } from "lucide-react";

import { supabase, makeAuth, AuthScreen } from "./components/03_AuthView.jsx";
import { AppShell, COACH_EMAIL, accentFor, SplashScreen } from "./components/04_AppShell.jsx";
import HomeScreen from "./components/05_HomeDashboard.jsx";
import { NewsTipsView, NewsTipsViewStyles } from "./components/06_NewsTipsView.jsx";
import ProfileScreen, { SettingsDrawer } from "./components/08_ClientProfileView.jsx";
import OnboardingFlow from "./components/11_OnboardingFlow.jsx";
// Lazy: pesa framer-motion (usato solo qui per le transizioni animate) —
// chi ha già un account/sessione valida non deve mai scaricarlo, solo un
// visitatore che non ha ancora visto la presentazione iniziale.
const LandingIntro = lazy(() => import("./components/LandingIntro.jsx"));
import { subscribeToPush } from "./lib/pushNotifications.js";
import AddToHomeScreenBanner from "./components/AddToHomeScreenBanner.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ChatThread from "./components/ChatThread.jsx";
import { touchLastActivity, fetchCoachChatInbox, deleteMyAccount, isRealCoachingPlan, notifyClientPlanChange, notifyCoachNewMessage, countUnreadChatMessages, hasUnseenTeamPost, updateUserLang, updateUnitSystem } from "./lib/coachingData.js";
import { setI18nLanguage } from "./i18n/index.js";

// Anteprima leggibile del messaggio appena inviato, per il push — mai il
// body grezzo se manca (solo un allegato): un push senza testo sembrerebbe
// vuoto/rotto sulla schermata di blocco.
function chatPushPreview(message) {
  if (message.body) return message.body.length > 120 ? `${message.body.slice(0, 117)}…` : message.body;
  const label = { image: "una foto", video: "un video", audio: "un vocale" }[message.attachment_type] || "un file";
  return `Ti ha inviato ${label}`;
}

/* Schermata Chat a schermo intero, dietro il tab di navigazione dedicato —
   include anche il video-check tecnica (invio video esercizi dentro la
   stessa conversazione, non più una sezione a sé nel Profilo). Il
   contenitore fisso (posizione/altezza) lo decide AppShell qui sopra; questo
   componente riempie semplicemente tutto lo spazio che riceve, in colonna:
   intestazione fissa in alto, messaggi che scorrono, input in fondo — mai
   la pagina intera a scorrere. */
function ChatScreen({ supabase, userId, accent, gender }) {
  return (
    <div className="flex flex-col h-full px-4 pt-4">
      <div className="mb-3 shrink-0">
        <p className="text-xs" style={{ color: "var(--ink-2)", fontWeight: 600 }}>Chat privata col coach</p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatThread supabase={supabase} clientId={userId} meId={userId} accent={accent} gender={gender}
          onSent={(msg) => notifyCoachNewMessage(supabase, chatPushPreview(msg))} />
      </div>
    </div>
  );
}

/* Inbox del coach (tab Chat sul proprio account): a differenza
   dell'atleta, il coach non ha "una" conversazione — ne ha una per ogni
   cliente. Elenco stile WhatsApp (ultimo messaggio, orario, badge non
   letti), tap per aprire la chat privata di quel cliente — la stessa
   ChatThread già usata lato atleta, stesso componente, stessi permessi
   RLS (client_id = quel cliente, sender_id = il coach). */
function CoachChatInboxScreen({ supabase, coachId, accent, gender }) {
  const [rows, setRows] = useState(null); // null = non ancora caricato
  const [openClientId, setOpenClientId] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = React.useCallback(() => {
    fetchCoachChatInbox(supabase, coachId)
      .then((data) => { setRows(data); setLoadError(""); })
      .catch((err) => { console.error("PERFORM: errore caricamento inbox chat coach", err); setLoadError("Non sono riuscito a caricare le conversazioni."); setRows([]); });
  }, [supabase, coachId]);
  useEffect(() => { load(); }, [load]);
  // Rete di sicurezza per nuovi messaggi/letture senza un canale realtime
  // dedicato (evita di introdurre un altro punto a rischio di collisione
  // canale, vedi ChatThread) — un refresh periodico basta per un'inbox.
  useEffect(() => {
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const openClient = rows?.find((r) => r.id === openClientId);

  if (openClient) {
    return (
      <div className="flex flex-col h-full px-4 pt-4">
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <button onClick={() => { setOpenClientId(null); load(); }} aria-label="Torna alle conversazioni"
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
            <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
          </button>
          <p className="h2 truncate">{openClient.name}</p>
        </div>
        <div className="flex-1 min-h-0">
          <ChatThread supabase={supabase} clientId={openClient.id} meId={coachId} accent={accent} gender={gender}
            emptyText={`Nessun messaggio ancora con ${openClient.name} — scrivi il primo.`}
            onSent={(msg) => notifyClientPlanChange(supabase, openClient.id, {
              title: "Nuovo messaggio dal tuo coach", body: chatPushPreview(msg), url: "/",
            })} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-4 pt-4">
      <p className="h1 mb-3 shrink-0">Chat</p>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pb-3">
        {loadError && <p className="meta mb-2" style={{ color: "#B91C1C" }}>{loadError}</p>}
        {rows === null ? (
          <p className="meta">Carico le conversazioni…</p>
        ) : rows.length === 0 ? (
          <p className="meta text-center mt-8">Nessun cliente con un piano a coaching reale ancora.</p>
        ) : (
          rows.map((r) => (
            <button key={r.id} onClick={() => setOpenClientId(r.id)}
              className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-transform active:scale-[0.98]"
              style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
              <span className="shrink-0 rounded-full flex items-center justify-center font-data"
                    style={{ width: 42, height: 42, backgroundColor: accent, color: "#FFFFFF", fontWeight: 700, fontSize: "1rem" }}>
                {r.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 600 }}>{r.name}</span>
                  {r.lastMessageAt && (
                    <span className="shrink-0" style={{ fontSize: "0.65rem", color: "var(--ink-2)" }}>
                      {new Date(r.lastMessageAt).toLocaleDateString("it-IT") === new Date().toLocaleDateString("it-IT")
                        ? new Date(r.lastMessageAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
                        : new Date(r.lastMessageAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate" style={{ color: "var(--ink-2)" }}>
                    {r.lastMessage ? `${r.lastMessageMine ? "Tu: " : ""}${r.lastMessage}` : "Nessun messaggio ancora"}
                  </span>
                  {r.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full flex items-center justify-center font-data"
                          style={{ minWidth: 18, height: 18, padding: "0 5px", backgroundColor: "#DC2626", color: "#FFFFFF", fontSize: "0.62rem", fontWeight: 700 }}>
                      {r.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// Caricati solo quando servono davvero (React.lazy → chunk separato), non
// nel bundle iniziale: sono schermate secondarie (CoachDashboard esiste solo
// per l'account del coach) — ogni cliente che apre l'app non dovrebbe dover
// scaricare quel codice solo per vedere la Home. NewsTipsView/ProfileScreen
// restano eager: le loro esportazioni SettingsDrawer/NewsTipsViewStyles sono
// montate sempre, a prescindere dalla tab attiva, quindi il loro modulo
// verrebbe comunque scaricato subito — lazy-caricarle non risparmierebbe nulla.
// Rete di sicurezza per-scheda: con un solo ErrorBoundary globale (main.jsx),
// un crash in UNA scheda (es. Alimentazione dentro Home, o Coach Dashboard)
// smontava l'INTERA app — bug reale già capitato (guessBodyFocusLabel non
// importata). Ogni scheda principale ora ha il suo boundary: un problema
// resta isolato lì, le altre schede (raggiungibili dalla bottom nav, che
// vive fuori da qui in AppShell) restano utilizzabili.
function TabCrashFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6" style={{ minHeight: "60vh", textAlign: "center" }}>
      <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)" }}>Non sono riuscito a caricare questa sezione</p>
      <p style={{ fontSize: "0.85rem", color: "var(--ink-2)", maxWidth: 280, lineHeight: 1.5 }}>
        Prova a passare a un'altra scheda dal menu in basso, o ricarica l'app.
      </p>
      <button onClick={() => window.location.reload()}
        style={{ backgroundColor: "var(--ink)", color: "var(--page)", fontWeight: 600, borderRadius: 999, padding: "10px 22px", border: "none", fontSize: "0.85rem" }}>
        Ricarica
      </button>
    </div>
  );
}

const ClassificaView = lazy(() => import("./components/07_ClassificaView.jsx"));
// AGGIORNAMENTO: il problema descritto qui (11_OnboardingFlow.jsx importava
// staticamente GlobalStyle/ANAM_AREAS/ANAM_QUESTIONS/AnamAreaSection
// direttamente da 09_CoachDashboard.jsx, costringendo Vite a includerlo
// comunque nel bundle principale nonostante il lazy()) è stato risolto:
// quei 4 export ora vivono in AnamnesisShared.jsx, importato sia
// dall'onboarding sia dal coach dashboard. Il lazy() qui sotto produce
// davvero un chunk separato (09_CoachDashboard-*.js nel build), scaricato
// solo da chi apre il pannello coach.
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
// Tab Chat sempre visibile (vedi nota in 04_AppShell.jsx): chi non ha un
// piano a coaching la trova comunque nel menu, non sparisce — qui dentro
// vede il perché e come sbloccarla, invece di essere rimbalzato in
// silenzio su Home come succedeva prima.
// BUG PRESO: chi aveva comprato l'add-on "Scheda Personalizzata" sopra
// Free/Premium (chat col coach per 2 settimane, scheda_addon_chat_until —
// vedi schedaAddonChatActive più sotto) vedeva SEMPRE lo stesso identico
// messaggio generico "inclusa da Scheda Personalizzata in su" appena la
// finestra scadeva — niente che spiegasse che aveva avuto la chat e le era
// scaduta, sembrava un errore o una feature mai posseduta. expiredAddonUntil
// (passata solo quando scheda_addon_chat_until esiste ma è nel passato)
// distingue questo caso da chi la chat non l'ha mai avuta.
function LockedChatScreen({ accent, onUpgrade, expiredAddonUntil }) {
  return (
    <div className="card text-center py-12">
      <span className="inline-flex items-center justify-center rounded-full mb-4"
            style={{ width: 56, height: 56, backgroundColor: accent + "22" }}>
        <Lock size={24} style={{ color: accent }} />
      </span>
      {expiredAddonUntil ? (
        <>
          <p className="h1 mb-2">La tua chat col coach è scaduta</p>
          <p className="body max-w-xs mx-auto mb-6">
            La finestra di 2 settimane della Scheda Personalizzata si è chiusa il{" "}
            {expiredAddonUntil.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}.
            Per riaverla senza limiti di tempo passa a un piano con coaching incluso.
          </p>
        </>
      ) : (
        <>
          <p className="h1 mb-2">Un coach vero, non un algoritmo</p>
          <p className="body max-w-xs mx-auto mb-6">
            Scrivi direttamente a me: correggo la tua tecnica da un video, aggiusto il piano quando qualcosa non torna,
            rispondo ai tuoi dubbi prima che diventino un problema. Inclusa da Scheda Personalizzata in su.
          </p>
        </>
      )}
      <button onClick={onUpgrade} className="rounded-full px-5 py-3 text-sm"
              style={{ backgroundColor: accent, color: "#111111", fontWeight: 600 }}>
        Vedi i piani
      </button>
    </div>
  );
}

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
  // Landing pubblica (LandingIntro, le 4 slide di presentazione): mostrata
  // una volta sola per dispositivo/browser prima del login — non a ogni
  // apertura dell'app, altrimenti diventerebbe fastidiosa per chi ha già
  // un account e semplicemente ha perso la sessione (logout, cache pulita).
  const [seenLanding, setSeenLanding] = useState(() => {
    try { return localStorage.getItem("perform_seen_landing") === "1"; } catch (err) { return false; }
  });

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
  const [unitSystem, setUnitSystem] = useState("metric"); // 'metric' | 'imperial' — da profiles.unit_system
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
  // "piano" quando l'apertura arriva da un CTA di upgrade (onUpgrade sotto):
  // apre il drawer dritto sulla tab abbonamento invece che su "Aspetto",
  // richiesta esplicita dopo che il click su "sblocca" portava a un menu
  // generico invece che alla pagina degli abbonamenti.
  const [settingsInitialTab, setSettingsInitialTab] = useState(undefined);
  const openUpgradeSettings = () => { setSettingsInitialTab("piano"); setSettingsOpen(true); };

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

  // "Ultimo accesso" reale per Hub Utenti (SCHEMA_v51): una scrittura per
  // sessione, non a ogni render — il coach vede quando l'utente ha aperto
  // l'app l'ultima volta, non un dato inventato. Fallisce in silenzio: non è
  // mai bloccante per l'uso dell'app.
  useEffect(() => {
    if (!session?.user?.id) return;
    touchLastActivity(supabase, session.user.id).catch(() => {});
  }, [session?.user?.id]);

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
        .select("gender, plan, onboarding_completed, nickname, full_name, micro_addon, scheda_addon_chat_until, scheda_addon_program_until, lang, unit_system")
        .eq("id", session.user.id)
        .single()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error("PERFORM: errore caricamento profilo", error);
            setProfileLoading(false);
            return;
          }
          // Scheda Personalizzata (SCHEMA_v68) non cambia mai profiles.plan
          // (è un add-on sopra Free/Premium, non una sostituzione): il
          // vecchio segnale "plan è ancora free" da solo non basta più a
          // dire "il webhook non è ancora passato" per questo acquisto —
          // serve controllare anche se l'add-on è comparso.
          if (justPaid && data.plan === "free" && !data.scheda_addon_chat_until && attempt < 6) {
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
          setLang(data.lang || "it");
          setI18nLanguage(data.lang || "it");
          setUnitSystem(data.unit_system || "metric");
          setProfile(data);
          setProfileLoading(false);
        });
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [session]);

  const accent = accentFor(gender, dark);
  const isCoach = (session?.user?.email || "").trim().toLowerCase() === COACH_EMAIL;
  // Add-on Scheda Personalizzata (SCHEMA_v68): concede la chat col coach per
  // 2 settimane a prescindere dal piano base (Free/Premium) — profiles.plan
  // non cambia mai per questo acquisto, quindi va controllato a parte.
  const schedaAddonChatActive = Boolean(profile?.scheda_addon_chat_until) && new Date(profile.scheda_addon_chat_until) > new Date();
  // Il coach vede sempre il tab Chat (la sua inbox con tutti i clienti),
  // a prescindere dal piano sulla SUA riga profiles — non sta "consumando"
  // un coaching, lo sta fornendo.
  const hasCoachChat = isCoach || isRealCoachingPlan(userPlan) || schedaAddonChatActive;

  // Pallino rosso sull'icona Chat: solo lato cliente (il coach ha la sua
  // inbox con i conteggi già visibili lì, non serve un secondo indicatore) e
  // solo se ha davvero una chat attiva col coach. Stesso principio delle
  // altre due checks "non letto" in questo file: controllato all'apertura e
  // ogni cambio tab (copre "il coach mi ha scritto mentre ero altrove"),
  // ChatThread.jsx segna già tutto come letto appena il thread si apre.
  // Cambio lingua: aggiorna subito lo stato locale (UI reattiva) e persiste
  // su profiles.lang (SCHEMA_v82) così la scelta sopravvive al prossimo
  // login — prima restava solo in memoria e tornava sempre a 'it' al reload.
  const changeLang = (l) => {
    setLang(l);
    setI18nLanguage(l);
    if (supabase && session?.user?.id) {
      updateUserLang(supabase, session.user.id, l).catch((err) => console.error("PERFORM: errore salvataggio lingua", err));
    }
  };

  // Stesso pattern di changeLang: stato locale reattivo subito, persistito
  // su profiles.unit_system (SCHEMA_v92) così sopravvive al prossimo login.
  const changeUnitSystem = (u) => {
    setUnitSystem(u);
    if (supabase && session?.user?.id) {
      updateUnitSystem(supabase, session.user.id, u).catch((err) => console.error("PERFORM: errore salvataggio unità di misura", err));
    }
  };

  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  useEffect(() => {
    if (!supabase || !session?.user?.id || isCoach || !hasCoachChat) return;
    // Aprire il tab Chat segna già tutto come letto (ChatThread.jsx) — niente
    // da controllare, il pallino sparisce subito invece di aspettare il
    // prossimo cambio tab per rifare la query.
    if (tab === "chat") { setChatUnreadCount(0); return; }
    let cancelled = false;
    countUnreadChatMessages(supabase, session.user.id, session.user.id)
      .then((n) => { if (!cancelled) setChatUnreadCount(n); })
      .catch((err) => console.error("PERFORM: errore controllo chat non letta", err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, session?.user?.id, isCoach, hasCoachChat, tab]);

  // Pallino rosso sul tab News: solo lato cliente (il coach pubblica gli
  // avvisi, non li "riceve"). Il tab News ha più canali (news/tips/team) e
  // non solo "team", quindi aprire il tab non basta da solo a segnare
  // l'avviso come visto — è NewsTipsView (onTeamSeen) ad azzerarlo davvero
  // quando il cliente apre proprio il canale team. Qui si ricontrolla solo
  // ad ogni cambio tab, per coprire "il coach ha pubblicato mentre ero altrove".
  const [newsHasUnseen, setNewsHasUnseen] = useState(false);
  useEffect(() => {
    if (!supabase || !session?.user?.id || isCoach) return;
    let cancelled = false;
    hasUnseenTeamPost(supabase, session.user.id)
      .then((v) => { if (!cancelled) setNewsHasUnseen(v); })
      .catch((err) => console.error("PERFORM: errore controllo avvisi team non letti", err));
    return () => { cancelled = true; };
  }, [supabase, session?.user?.id, isCoach, tab]);

  const stripePlanId =
    userPlan === "full_coaching" ? "full" : userPlan === "performance_pack" ? "performance" : "free";

  if (authLoading) {
    return <SplashScreen dark={dark} />;
  }

  // Porta d'ingresso pubblica: mostrata una volta sola per dispositivo,
  // PRIMA del login/registrazione — non più come primo step di
  // OnboardingFlow (dopo l'account già creato). Chi ha già una sessione
  // valida (torna con l'app già installata) non la vede mai, nemmeno la
  // prima volta: salta dritto oltre questo blocco.
  if (!session && !seenLanding) {
    return (
      <Suspense fallback={<ScreenFallback dark={dark} minHeight="100vh" />}>
        <LandingIntro
          dark={dark}
          onFinish={() => {
            try { localStorage.setItem("perform_seen_landing", "1"); } catch (err) { /* best-effort */ }
            setSeenLanding(true);
          }}
        />
      </Suspense>
    );
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
        // L'anamnesi va comunque compilata da chi ha appena comprato la
        // Scheda Personalizzata come add-on: initialPlan da solo non lo dice
        // più (profiles.plan resta free/premium, vedi SCHEMA_v68) — il
        // segnale è la presenza dell'add-on stesso, non un cambio di piano.
        resumedAddonPlanId={profile.scheda_addon_program_until ? "scheda" : null}
        onComplete={({ plan }) => {
          // plan null = anamnesi dell'add-on Scheda Personalizzata: il piano
          // base (Free/Premium) non deve cambiare, solo chiudere l'onboarding.
          if (plan == null) {
            setProfile((p) => ({ ...(p ?? {}), onboarding_completed: true }));
            return;
          }
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
        userEmail={session.user.email || ""}
        tab={tab}
        onTabChange={setTab}
        onOpenSettings={() => { setSettingsInitialTab(undefined); setSettingsOpen(true); }}
        chatUnreadCount={chatUnreadCount}
        newsHasUnseen={newsHasUnseen}
        screens={{
          home: (
            <ErrorBoundary fallback={<TabCrashFallback />}>
            <HomeScreen
              gender={gender}
              dark={dark}
              planTier={userPlan}
              isOwner={isCoach}
              microAddon={!!profile?.micro_addon}
              schedaAddonChatUntil={profile?.scheda_addon_chat_until || null}
              unitSystem={unitSystem}
              supabase={supabase}
              userId={session.user.id}
              onUpgrade={openUpgradeSettings}
              onOpenChat={() => setTab("chat")}
              onNavigateTab={(t) => setTab(t)}
              profileOverride={{
                name: profile?.full_name || session.user.user_metadata?.full_name || "Atleta",
                // BUG PRESO: leggeva session.user.user_metadata?.nickname (mai
                // scritto da nessuna parte, l'utente lo imposta nel Profilo che
                // scrive su profiles.nickname) — cadeva quindi sempre sul
                // fallback email-prefix, mai il vero nickname scelto. `profile`
                // qui è già la riga reale di profiles (vedi loadProfile sopra).
                nickname: profile?.nickname || session.user.email?.split("@")[0],
              }}
            />
            </ErrorBoundary>
          ),
          news: (
            <ErrorBoundary fallback={<TabCrashFallback />}>
            <NewsTipsView
              meId={session.user.id}
              supabase={supabase}
              seeds={SEED_NEWS_TIPS}
              genderOverride={gender}
              planOverride={isCoach ? "full_coaching" : userPlan}
              isCoach={isCoach}
              onTeamSeen={() => setNewsHasUnseen(false)}
              lang={lang}
            />
            </ErrorBoundary>
          ),
          // CoachDashboard non ha ancora una prop surface: resta un'isola
          // autonoma finché non viene fatto il refactor dedicato (vedi nota
          // in cima al file). ClassificaView ora riceve supabase/meId/gender
          // per la classifica globale reale.
          ranking: <ErrorBoundary fallback={<TabCrashFallback />}><ClassificaView supabase={supabase} meId={session.user.id} genderOverride={gender} dark={dark} /></ErrorBoundary>,
          profile: (
            <ErrorBoundary fallback={<TabCrashFallback />}>
            <ProfileScreen
              gender={gender}
              dark={dark}
              lang={lang}
              onChangeLang={changeLang}
              userPlan={userPlan}
              onOpenSettings={() => { setSettingsInitialTab(undefined); setSettingsOpen(true); }}
              ownerEmail={COACH_EMAIL}
              supabase={supabase}
              userId={session.user.id}
              profileOverride={{
                name: session.user.user_metadata?.full_name || "Atleta",
                nickname: session.user.user_metadata?.nickname || session.user.email?.split("@")[0],
                email: session.user.email,
              }}
            />
            </ErrorBoundary>
          ),
          // Il toggle "Assegna scheda/target" (CoachAssignPanel) \u00e8 stato
          // rimosso: era ridondante con l'editor gi\u00e0 raggiungibile cliccando
          // il nome di un cliente dentro il Pannello Coach (ClientDetail \u2192
          // tab "editor"), due percorsi per la stessa azione.
          coach: isCoach ? <ErrorBoundary fallback={<TabCrashFallback />}><CoachDashboard supabase={supabase} coachId={session.user.id} dark={dark} /></ErrorBoundary> : null,
          // Il coach non ha "una" conversazione (con se stesso) ma una per
          // ogni cliente: sul suo account il tab Chat è l'inbox di tutte le
          // conversazioni, non la ChatScreen dell'atleta.
          chat: (
            <ErrorBoundary fallback={<TabCrashFallback />}>
              {isCoach
                ? <CoachChatInboxScreen supabase={supabase} coachId={session.user.id} accent={accent} gender={gender} />
                : (hasCoachChat
                    ? <ChatScreen supabase={supabase} userId={session.user.id} accent={accent} gender={gender} />
                    : <LockedChatScreen accent={accent} onUpgrade={openUpgradeSettings}
                        expiredAddonUntil={profile?.scheda_addon_chat_until ? new Date(profile.scheda_addon_chat_until) : null} />)}
            </ErrorBoundary>
          ),
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
          initialTab={settingsInitialTab}
          onClose={() => setSettingsOpen(false)}
          dark={dark}
          accent={accent}
          accentText={accent}
          gender={gender}
          lang={lang}
          onChangeLang={changeLang}
          unitSystem={unitSystem}
          onChangeUnitSystem={changeUnitSystem}
          currentPlan={stripePlanId}
          planRenewsOn="2026-09-01"
          accountEmail={session.user.email || ""}
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
          onDeleteAccount={async () => {
            // Edge Function admin-delete-account (service role, l'unico modo
            // di eliminare un utente da auth.users) — chiamata a corpo vuoto,
            // elimina il chiamante stesso, mai un id passato dal client. Il
            // signOut dopo un delete riuscito è quello che riporta davvero
            // alla schermata di accesso (onAuthStateChange sopra reagisce a
            // session -> null): prima questo handler era un no-op vuoto, il
            // pulsante "Sì, elimina tutto" non faceva letteralmente nulla.
            await deleteMyAccount(supabase);
            await supabase.auth.signOut();
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
