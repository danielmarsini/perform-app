/* ============================================================================
   PERFORM · FILE 6 — NewsTipsView.jsx
   Il Multi-Feed Biologico Algoritmico · Coach Daniel Marsini

   Tre canali indipendenti, sola lettura:
     🔬 NEWS          — scoperte scientifiche, fonte PubMed, vita 48h, chat PERFORM AI (Pro)
     💡 TIPS          — pillole pratiche di bio-hacking, vita 48h, chat PERFORM AI (Pro)
     📢 AVVISI TEAM   — bacheca umana del coach: NESSUNA scadenza, nessun countdown,
                        nessuna chat AI (a prescindere dal piano). Firma corsiva del coach.

   Novità di questa rifinitura — BLINDATURA COMMERCIALE DELLA CHAT AI:
     · La chat "💬 Fai una domanda a PERFORM AI su questo studio" ora dipende
       da 'userPlan', letto da Supabase con lo stesso pattern già usato per
       genere e scadenza (useUserPlan, fallback locale).
     · userPlan === "free"  → la chat resta visibile ma sfocata (Glassmorphism),
       input disabilitato, e sopra compare un lucchetto satinato con l'invito
       ad attivare il Premium (€5/mese).
     · userPlan !== "free" (Premium o superiore) → chat interattiva
       identica a prima, nessun blocco.
     · Il blocco si applica SOLO dove la chat esisterebbe comunque (News/Tips):
       sotto Avvisi Team non c'è paywall perché non c'è proprio chat, a
       prescindere dal piano — non ha senso vendere l'accesso a qualcosa che
       il canale non offre a nessuno.

   IMPORTANTE — SICUREZZA DELLA CHAT "PERFORM AI":
   <PerformAIChat> accetta una prop `endpoint`. Qui punta direttamente
   a api.anthropic.com perché è l'unico contesto (l'ambiente artifact di
   Claude.ai) in cui la chiamata funziona senza chiave API. In produzione
   NON va mai chiamato api.anthropic.com dal client: crea una Supabase
   Edge Function (es. "ask-perform-ai") che tiene la ANTHROPIC_API_KEY
   lato server — e lì, server-side, verifica ANCHE il piano dell'utente
   prima di inoltrare la richiesta a Claude. Il blocco lato client qui
   sotto è UX, non sicurezza: un utente Free smaliziato potrebbe in teoria
   chiamare l'endpoint direttamente bypassando l'interfaccia, quindi il
   controllo reale sull'accesso Pro deve vivere nella Edge Function, non
   solo in questo componente.

   Contenuto:
     1. Utilità .............. tempo, canali, scadenza 48h, link PubMed, gradiente di genere
     2. useUserGender / useUserPlan / useNewsFeed .... dati (Supabase con fallback locale)
     3. ChannelTabs / VaultButton / SourceLink / GradientTitle / NewReportBadge / ExpiryCountdown
     4. LikeButton / SaveButton / CoachSignature
     5. FeedCard .............. teaser in feed, testo puro, cliccabile
     6. ArticleReader / PerformAIChat / AIChatPaywall .. lettura profonda + chat con paywall
     7. VaultOverlay .......... la Cassaforte Report Salvati (permanente, fuori scadenza)
     8. FeedColumn ............ scorrimento infinito per canale
     9. NewsTipsView .......... contenitore principale
    10. NewsTipsViewStyles .... CSS del modulo
    11. Anteprima ............. da eliminare in produzione
   ========================================================================== */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Heart, Bookmark, Lock, Newspaper, ArrowLeft } from "lucide-react";
import { useEdgeSwipeBack, useSwipeDownClose } from "../lib/useSwipeGesture.js";
import { fetchSavedTips, saveTip, unsaveTip, freshRealtimeChannel, publishTeamPost, deleteTeamPost, notifyTeamPost, markTeamSeen } from "../lib/coachingData.js";

/* ============================================================================
   1 · UTILITÀ
   ========================================================================== */

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d} g`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export const CHANNELS = {
  news: { id: "news", label: "News", emoji: "🔬" },
  tips: { id: "tips", label: "Tips", emoji: "💡" },
  team: { id: "team", label: "Avvisi Team", emoji: "📢" },
};

/* Canali su cui la chat di approfondimento ha senso: rubriche automatiche
   basate su evidenza, non comunicazioni personali del coach. */
const AI_CHAT_CHANNELS = new Set(["news", "tips"]);

/* Piani con accesso alla chat PERFORM AI: tutto tranne "free". */
export function hasAIAccess(plan) { return plan !== "free"; }

/* Vita massima di un contenuto "temporaneo": 48 ore. Gli Avvisi Team sono
   l'unico canale escluso — restano fissi e storici per costruzione. */
const EXPIRY_MS = 48 * 60 * 60 * 1000;
export function channelExpires(channel) { return channel !== "team"; }

export function msUntilExpiry(publishedAt) {
  return EXPIRY_MS - (Date.now() - new Date(publishedAt).getTime());
}

export function formatCountdown(ms) {
  if (ms <= 0) return "0h 0m";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/* Link reale e verificabile su PubMed. refresh-news-feed salva il PMID vero
   dello studio pubblicato in source_query (es. "38234567") — in quel caso
   punta dritto alla pagina dell'articolo invece che a una ricerca per
   parole chiave, più preciso e mai ambiguo. I seed di anteprima usano
   ancora parole chiave libere (mai un PMID/DOI inventato), quindi si
   riconosce il caso reale con un semplice controllo "è tutto numerico". */
export function pubmedSearchUrl(sourceQuery) {
  if (/^\d+$/.test(String(sourceQuery).trim())) {
    return `https://pubmed.ncbi.nlm.nih.gov/${sourceQuery}/`;
  }
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(sourceQuery)}`;
}

/* Accento dinamico per icone e micro-bordi attivi. */
export function genderAccent(gender) {
  return gender === "F" ? "#E5C1CD" : "#D4AF37";
}

/* Gradiente cangiante per i soli titoli editoriali (card + articolo esteso). */
const TITLE_GRADIENTS = {
  M: "linear-gradient(90deg, #D4AF37 0%, #F3E5AB 35%, #AA7C11 65%, #F3E5AB 85%, #D4AF37 100%)",
  F: "linear-gradient(90deg, #E5C1CD 0%, #F4E0E6 35%, #C896A6 65%, #F4E0E6 85%, #E5C1CD 100%)",
};

function GradientTitle({ tag: Tag = "h2", gender, className = "", style, children }) {
  return (
    <Tag className={`title-gradient ${className}`} style={{ backgroundImage: TITLE_GRADIENTS[gender] || TITLE_GRADIENTS.M, ...style }}>
      {children}
    </Tag>
  );
}

/* ============================================================================
   2 · DATI — GENERE, PIANO, PAGINAZIONE, SCADENZA E REALTIME
   ========================================================================== */

function useUserGender({ supabase, meId, fallback = "M" }) {
  const [gender, setGender] = useState(fallback);
  useEffect(() => {
    if (!supabase) { setGender(fallback); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("client_profiles").select("gender").eq("user_id", meId).single();
      if (alive && data?.gender) setGender(data.gender);
    })();
    return () => { alive = false; };
  }, [supabase, meId, fallback]);
  return gender;
}

/* Il piano determina l'accesso alla chat AI. Fallback deliberatamente
   "free": in assenza di un dato certo, il paywall resta chiuso — è la
   direzione più sicura per un blocco commerciale. */
function useUserPlan({ supabase, meId, fallback = "free" }) {
  const [plan, setPlan] = useState(fallback);
  useEffect(() => {
    if (!supabase) { setPlan(fallback); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("client_profiles").select("plan").eq("user_id", meId).single();
      if (alive && data?.plan) setPlan(data.plan);
    })();
    return () => { alive = false; };
  }, [supabase, meId, fallback]);
  return plan;
}

function useNewsFeed({ supabase, meId, channel, seedPool, pageSize = 3 }) {
  const real = !!supabase;
  const expires = channelExpires(channel);
  const [items, setItems] = useState([]);
  const [likedMine, setLikedMine] = useState({});   // { itemId: true } — pubblico
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // BUG PRESO: toggleLike scrive davvero su tip_likes ma likedMine non
  // veniva mai idratato da un fetch iniziale — dopo un refresh un articolo
  // già "piaciuto" tornava a mostrarsi come non piaciuto, e ri-cliccare
  // "mi piace" tentava un secondo insert (rifiutato in silenzio dal vincolo
  // di unicità) invece di un delete: il "mi piace" restava rotto per
  // sempre su quell'articolo in quella sessione.
  useEffect(() => {
    if (!real) return;
    let alive = true;
    supabase.from("tip_likes").select("tip_id").eq("user_id", meId)
      .then(({ data }) => {
        if (!alive || !data) return;
        setLikedMine((all) => ({ ...all, ...Object.fromEntries(data.map((r) => [r.tip_id, true])) }));
      })
      .catch((err) => console.error("PERFORM: errore lettura tip_likes", err));
    return () => { alive = false; };
  }, [real, supabase, meId]);

  const fetchPage = useCallback(async (start) => {
    if (real) {
      let query = supabase
        .from("coach_news_tips")
        .select("id, channel, eyebrow, title, body, body_extended, source_query, like_count, published_at, photo_before_url, photo_after_url, weight_achieved")
        .eq("channel", channel);
      /* Gli Avvisi Team non hanno finestra di scadenza: nessun filtro temporale. */
      if (expires) query = query.gte("published_at", new Date(Date.now() - EXPIRY_MS).toISOString());
      const { data } = await query.order("published_at", { ascending: false }).range(start, start + pageSize - 1);
      return data || [];
    }
    await new Promise((r) => setTimeout(r, 550)); // simula la latenza di rete in anteprima
    const page = seedPool.slice(start, start + pageSize);
    return expires ? page.filter((it) => msUntilExpiry(it.published_at) > 0) : page;
  }, [real, supabase, channel, seedPool, pageSize, expires]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPage(0).then((page) => {
      if (!alive) return;
      setItems(page);
      setOffset(page.length);
      setHasMore(page.length === pageSize);
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await fetchPage(offset);
    setItems((all) => [...all, ...page]);
    setOffset((o) => o + page.length);
    setHasMore(page.length === pageSize);
    setLoadingMore(false);
  }, [fetchPage, offset, hasMore, loadingMore, pageSize]);

  /* Rimozione automatica: un articolo che supera le 48h sparisce dal feed
     live anche se era già caricato in questa sessione. Non tocca "team". */
  useEffect(() => {
    if (!expires) return;
    const t = setInterval(() => {
      setItems((all) => all.filter((it) => msUntilExpiry(it.published_at) > 0));
    }, 60000);
    return () => clearInterval(t);
  }, [expires]);

  /* Realtime: il server pubblica a intervalli casuali (30 min – 2h) tramite
     un job schedulato; il client si limita ad ascoltare l'INSERT e a far
     comparire il nuovo elemento in cima, da cui scatta il badge "Nuovo Report". */
  useEffect(() => {
    if (!real) return undefined;
    const ch = freshRealtimeChannel(supabase, `perform-feed-${channel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "coach_news_tips", filter: `channel=eq.${channel}` },
        ({ new: t }) => setItems((all) => [t, ...all]))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [real, supabase, channel]);

  /* Like: pubblico, visibile a tutti, alimenta il segnale di raccomandazione. */
  const toggleLike = useCallback(async (itemId) => {
    const mineNow = !!likedMine[itemId];
    setLikedMine((all) => ({ ...all, [itemId]: !mineNow }));
    setItems((all) => all.map((it) => it.id === itemId
      ? { ...it, likeCount: (it.likeCount ?? it.like_count ?? 0) + (mineNow ? -1 : 1) }
      : it));
    if (real) {
      if (mineNow) {
        await supabase.from("tip_likes").delete().eq("tip_id", itemId).eq("user_id", meId);
      } else {
        await supabase.from("tip_likes").insert({ tip_id: itemId, user_id: meId });
        await supabase.from("feed_signals").insert({ user_id: meId, tip_id: itemId, signal: "like" });
      }
    }
  }, [real, supabase, meId, likedMine]);

  // Rimozione locale immediata (coach che elimina un proprio post Avvisi
  // Team): niente realtime DELETE in ascolto, quindi senza questo la card
  // resterebbe visibile sullo stesso schermo finché non si ricarica la tab.
  const removeItem = useCallback((itemId) => {
    setItems((all) => all.filter((it) => it.id !== itemId));
  }, []);

  return { loading, loadingMore, hasMore, items, likedMine, toggleLike, loadMore, removeItem };
}

/* ============================================================================
   3 · TAB, PULSANTE CASSAFORTE, LINK FONTE, BADGE E COUNTDOWN
   ========================================================================== */

function ChannelTabs({ active, onChange, accent }) {
  return (
    <div className="channel-tabs">
      {Object.values(CHANNELS).map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)}
                className={`channel-tab${active === c.id ? " active" : ""}`}
                style={active === c.id ? { "--tab-accent": accent } : undefined}>
          <span aria-hidden="true">{c.emoji}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function VaultButton({ count, onClick }) {
  return (
    <button onClick={onClick} className="vault-button" aria-label="Apri la Cassaforte Report Salvati">
      <Bookmark size={15} />
      <span>{count > 0 ? count : ""}</span>
    </button>
  );
}

/* News è pensata per leggere come una notizia scientifica — verificare la
   fonte primaria ha senso in primo piano. Tips deve leggersi come un
   consiglio pratico, non una citazione accademica: stesso link (mai un
   consiglio senza uno studio reale dietro), ma un richiamo più discreto,
   da nota a piè di pagina invece che da bottone in evidenza. */
function SourceLink({ href, accent, channel }) {
  if (channel === "tips") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="source-link-subtle"
         style={{ "--accent": accent }} onClick={(e) => e.stopPropagation()}>
        Basato su uno studio scientifico reale · vedi la fonte
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="source-link"
       style={{ "--accent": accent }} onClick={(e) => e.stopPropagation()}>
      🔍 Verifica fonte su PubMed
    </a>
  );
}

function NewReportBadge({ accent }) {
  return (
    <span className="new-report-badge" style={{ "--accent": accent }}>
      ⚡ Nuovo Report
    </span>
  );
}

/* Countdown live: ricalcola ogni 30s, non ogni frame — resta "ultrasottile"
   anche nel costo, oltre che nell'estetica. */
function useCountdown(publishedAt) {
  const [remaining, setRemaining] = useState(() => msUntilExpiry(publishedAt));
  useEffect(() => {
    setRemaining(msUntilExpiry(publishedAt));
    const id = setInterval(() => setRemaining(msUntilExpiry(publishedAt)), 30000);
    return () => clearInterval(id);
  }, [publishedAt]);
  return remaining;
}

function ExpiryCountdown({ publishedAt }) {
  const remaining = useCountdown(publishedAt);
  return <span className="expiry-countdown">⏳ Sparisce tra: {formatCountdown(remaining)}</span>;
}

/* ============================================================================
   4 · LIKE (PUBBLICO), SALVA (PRIVATO) E FIRMA
   ========================================================================== */

function LikeButton({ active, count, accent, onToggle }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center gap-1.5 transition-transform active:scale-90"
            aria-pressed={active} aria-label={active ? "Togli mi piace" : "Metti mi piace"}>
      <Heart size={19} style={{ color: active ? accent : "var(--ink-2)" }}
             fill={active ? accent : "none"} strokeWidth={active ? 1.4 : 1.8} />
      <span style={{ fontSize: "0.8rem", fontWeight: active ? 700 : 500, color: active ? accent : "var(--ink-2)" }}>
        {count}
      </span>
    </button>
  );
}

function SaveButton({ active, accent, onToggle }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center transition-transform active:scale-90"
            aria-pressed={active} aria-label={active ? "Rimuovi dalla Cassaforte" : "Salva nella Cassaforte"}>
      <Bookmark size={19} style={{ color: active ? accent : "var(--ink-2)" }}
                fill={active ? accent : "none"} strokeWidth={active ? 1.4 : 1.8} />
    </button>
  );
}

function CoachSignature() {
  return <span className="coach-signature">Coach Daniel Marsini</span>;
}

/* ============================================================================
   5 · SCHEDA IN FEED — TEASER CLICCABILE
   ========================================================================== */

function FeedCard({ item, channel, isLatest, gender, accent, liked, likeCount, saved, onToggleLike, onToggleSave, onOpen, onDelete }) {
  const expires = channelExpires(channel);

  return (
    <article className="news-card spring-in mb-5 px-7 py-8 sm:px-8 sm:py-9" onClick={onOpen} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      {expires ? (
        <div className="mb-4">
          {isLatest && <div className="mb-2"><NewReportBadge accent={accent} /></div>}
          <ExpiryCountdown publishedAt={item.published_at} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-4">
          {item.eyebrow ? (
            <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-2)" }}>
              {item.eyebrow}
            </span>
          ) : <span />}
          <div className="flex items-center gap-2 shrink-0">
            <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--satin-gray)", whiteSpace: "nowrap" }}>
              {timeAgo(item.published_at)}
            </span>
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} aria-label="Elimina avviso"
                      style={{ color: "var(--satin-gray)", lineHeight: 1 }}>
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <GradientTitle tag="h2" gender={gender}
                      style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.32, letterSpacing: "-0.01em", marginBottom: "0.6rem" }}>
        {item.title}
      </GradientTitle>

      <p className="teaser-clamp" style={{ fontSize: "0.96rem", fontWeight: 400, color: "var(--satin-gray)", lineHeight: 1.8 }}>
        {item.body}
      </p>

      {(item.photo_before_url || item.photo_after_url) && (
        <div className="mt-4 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
          {item.photo_before_url && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={item.photo_before_url} alt="Prima" className="w-full h-32 object-cover" />
              <span className="absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5" style={{ fontSize: "0.6rem", fontWeight: 700, backgroundColor: "rgba(9,9,11,0.65)", color: "#FFFFFF" }}>PRIMA</span>
            </div>
          )}
          {item.photo_after_url && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={item.photo_after_url} alt="Dopo" className="w-full h-32 object-cover" />
              <span className="absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5" style={{ fontSize: "0.6rem", fontWeight: 700, backgroundColor: "rgba(9,9,11,0.65)", color: "#FFFFFF" }}>DOPO</span>
            </div>
          )}
        </div>
      )}
      {item.weight_achieved != null && (
        <p className="mt-3 font-data" style={{ fontSize: "0.82rem", fontWeight: 700, color: accent }}>
          🎯 Peso raggiunto: {item.weight_achieved} kg
        </p>
      )}

      <span style={{ display: "inline-block", marginTop: "0.9rem", fontSize: "0.78rem", fontWeight: 600, color: accent }}>
        Approfondisci →
      </span>

      <div className="mt-6 pt-5 flex items-center justify-between" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center gap-5">
          <LikeButton active={liked} count={likeCount} accent={accent} onToggle={onToggleLike} />
          <SaveButton active={saved} accent={accent} onToggle={onToggleSave} />
        </div>
        {channel === "team" && <CoachSignature />}
      </div>
    </article>
  );
}

function CardSkeleton() {
  return <div className="skeleton" style={{ height: 230 }} />;
}

function EndOfFeed() {
  return (
    <div className="text-center py-8">
      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--ink-2)" }}>Sei aggiornato.</p>
    </div>
  );
}

/* ============================================================================
   6 · LETTURA PROFONDA — ESPANSIONE A TUTTO SCHERMO + CHAT PERFORM AI (con paywall)
   ========================================================================== */

/* Identità visiva propria di PERFORM AI — stesso simbolo pulse/battito del
   logo dell'app (public/favicon.svg), oro su nero: anche se sotto gira
   Anthropic, in chat non deve mai sembrare un widget generico "powered by
   Claude", ma un prodotto PERFORM con la sua faccia. */
function PerformAIAvatar({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flexShrink: 0 }} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#111111" />
      <polyline points="118 262 190 262 222 156 290 356 330 262 394 262"
        fill="none" stroke="#C5A059" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PerformAIChat({ item, accent, supabase }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const threadRef = useRef(null);

  useEffect(() => {
    threadRef.current?.scrollTo?.({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const ask = async () => {
    const question = input.trim();
    if (!question || loading || !supabase) return;
    setInput("");
    setError(false);
    const nextMessages = [...messages, { role: "user", text: question }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const context = `Titolo: ${item.title}\nSintesi: ${item.body}\nApprofondimento: ${(item.bodyExtended || []).join(" ")}`;
      // Il system prompt e il controllo del piano vivono SOLO server-side
      // (Edge Function ask-perform-ai) — qui si manda solo il contesto
      // dell'articolo e la cronologia, mai la chiave Anthropic né un
      // system prompt modificabile dal client.
      const { data, error: fnError } = await supabase.functions.invoke("ask-perform-ai", {
        body: {
          context,
          question,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        },
      });
      if (fnError) throw fnError;
      const text = (data?.text || "").trim();
      setMessages((m) => [...m, { role: "assistant", text: text || "Non sono riuscito a elaborare una risposta. Riprova tra poco." }]);
    } catch (e) {
      console.error("PERFORM: errore chat PERFORM AI", e);
      // La Edge Function distingue casi reali (limite mensile raggiunto,
      // domanda troppo lunga) da un errore generico — recupero il messaggio
      // vero dal corpo della risposta invece di mostrare sempre lo stesso
      // "riprova tra poco" anche quando il motivo è chiaro e diverso.
      let friendly = "Connessione non disponibile in questo momento. Riprova tra poco.";
      try {
        const body = await e?.context?.json?.();
        if (body?.error) friendly = body.error;
      } catch { /* mantieni il messaggio generico */ }
      setError(true);
      setMessages((m) => [...m, { role: "assistant", text: friendly }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-chat" onClick={(e) => e.stopPropagation()}>
      <p className="ai-chat-label"><PerformAIAvatar size={16} /> Fai una domanda a PERFORM AI su questo studio</p>

      {messages.length > 0 && (
        <div className="ai-chat-thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={`ai-bubble ${m.role}`} style={m.role === "user" ? { "--accent": accent } : undefined}>
              {m.role === "assistant" && <PerformAIAvatar size={18} />}
              <span>{m.text}</span>
            </div>
          ))}
          {loading && (
            <div className="ai-bubble assistant ai-typing" aria-label="PERFORM AI sta scrivendo">
              <PerformAIAvatar size={18} />
              <span /><span /><span />
            </div>
          )}
        </div>
      )}

      <div className="ai-chat-input-row">
        <input value={input} onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
               placeholder="Es. perché la soglia di leucina non dipende dal peso corporeo?"
               aria-label="Fai una domanda a PERFORM AI" />
        <button onClick={ask} disabled={loading || !input.trim()} style={{ "--accent": accent }} aria-label="Invia domanda">
          Invia
        </button>
      </div>
      {error && <p className="ai-chat-error">Impossibile contattare PERFORM AI in questo momento.</p>}
    </div>
  );
}

/* Paywall: la chat resta visivamente presente (sfocata, non interattiva)
   dietro un lucchetto satinato — non sparisce, si intravede quello che
   si sta perdendo. Coerente con l'estetica Glassmorphism del resto del modulo. */
function AIChatPaywall({ accent }) {
  return (
    <div className="ai-chat-locked" onClick={(e) => e.stopPropagation()}>
      <p className="ai-chat-label" style={{ opacity: 0.5 }}>💬 Fai una domanda a PERFORM AI su questo studio</p>

      <div className="ai-chat-locked-ghost" aria-hidden="true">
        <div className="ai-bubble assistant" style={{ maxWidth: "72%" }}>
          La sintesi proteica muscolare resta elevata per diverse ore dopo l'allenamento…
        </div>
        <div className="ai-bubble user" style={{ "--accent": accent, alignSelf: "flex-end", maxWidth: "58%" }}>
          E se mangio solo due pasti al giorno?
        </div>
        <div className="ai-chat-input-row">
          <input disabled placeholder="Fai una domanda a PERFORM AI…" />
          <button disabled style={{ "--accent": accent }}>Invia</button>
        </div>
      </div>

      <div className="ai-chat-locked-overlay">
        <div className="ai-chat-lock-icon" style={{ "--accent": accent }}>
          <Lock size={20} strokeWidth={1.8} />
        </div>
        <p className="ai-chat-locked-text">
          🔒 Chat Assistente AI bloccata. Passa al <strong>Premium (€5/mese)</strong> per sbloccare l'Intelligenza
          Artificiale, fare domande profonde a PERFORM AI e sviscerare la scienza di ogni studio senza fake news.
        </p>
      </div>
    </div>
  );
}

function ArticleReader({ item, channel, gender, accent, plan, liked, likeCount, saved, onToggleLike, onToggleSave, onClose, supabase, zIndex = 100 }) {
  const showChat = AI_CHAT_CHANNELS.has(channel);
  const expires = channelExpires(channel);
  const aiUnlocked = hasAIAccess(plan);

  const rootRef = useRef(null);
  useSwipeDownClose(rootRef, onClose);
  useEdgeSwipeBack(onClose, true);

  return (
    <div ref={rootRef} className="expand-overlay" style={{ zIndex, paddingTop: "env(safe-area-inset-top)" }}>
      <div className="expand-sheet spring-in">
        <div className="expand-scroll">
          <div className="flex items-center justify-between mb-6">
            <button className="expand-close" onClick={onClose} aria-label="Torna al feed">
              <ArrowLeft size={17} />
            </button>
            {expires ? (
              <ExpiryCountdown publishedAt={item.published_at} />
            ) : (
              <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--satin-gray)" }}>{timeAgo(item.published_at)}</span>
            )}
          </div>

          {item.eyebrow && (
            <span style={{ display: "block", fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, marginBottom: "0.7rem" }}>
              {item.eyebrow}
            </span>
          )}

          <GradientTitle tag="h1" gender={gender}
                          style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.26, letterSpacing: "-0.012em", marginBottom: "1.2rem" }}>
            {item.title}
          </GradientTitle>

          <div className="expand-body">
            {(item.bodyExtended && item.bodyExtended.length ? item.bodyExtended : [item.body]).map((p, i) => (
              <p key={i} style={{ fontSize: "1rem", fontWeight: 400, color: "var(--satin-gray)", lineHeight: 1.85, marginBottom: "1.1rem" }}>
                {p}
              </p>
            ))}
          </div>

          {item.source_query && <SourceLink href={pubmedSearchUrl(item.source_query)} accent={accent} channel={channel} />}

          <div className="mt-8 pt-6 flex items-center justify-between" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="flex items-center gap-5">
              <LikeButton active={liked} count={likeCount} accent={accent} onToggle={onToggleLike} />
              <SaveButton active={saved} accent={accent} onToggle={onToggleSave} />
            </div>
            {channel === "team" && <CoachSignature />}
          </div>

          {showChat && (aiUnlocked
            ? <PerformAIChat item={item} accent={accent} supabase={supabase} />
            : <AIChatPaywall accent={accent} />)}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   7 · CASSAFORTE REPORT SALVATI — permanente, fuori dalla scadenza 48h
   ========================================================================== */

function VaultOverlay({ vault, gender, accent, onOpenItem, onRemove, onClose }) {
  const entries = Object.values(vault).sort((a, b) => b.savedAt - a.savedAt);
  return (
    <div className="expand-overlay" onClick={onClose}>
      <div className="expand-sheet spring-in" onClick={(e) => e.stopPropagation()}>
        <div className="expand-scroll">
          <div className="flex items-center justify-between mb-6">
            <button className="expand-close" onClick={onClose} aria-label="Chiudi la Cassaforte">✕</button>
            <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "var(--ink-2)" }}>{entries.length} salvati</span>
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)", marginBottom: "0.4rem" }}>
            Cassaforte Report Salvati
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--satin-gray)", marginBottom: "1.6rem" }}>
            Una copia salvata resta leggibile per sempre, anche dopo che l'originale è sparito dal feed temporaneo delle 48 ore.
          </p>

          {entries.length === 0 ? (
            <p style={{ color: "var(--satin-gray)", fontSize: "0.92rem" }}>
              Non hai ancora salvato nulla. Tocca il segnalibro su un articolo per metterlo al sicuro qui.
            </p>
          ) : (
            entries.map((entry) => (
              <button key={entry.id} className="vault-row" onClick={() => onOpenItem(entry.id)}>
                <div className="min-w-0 flex-1 text-left">
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-2)" }}>
                    {CHANNELS[entry.channel].emoji} {CHANNELS[entry.channel].label}
                  </span>
                  <GradientTitle tag="p" gender={gender} style={{ fontSize: "1rem", fontWeight: 700, marginTop: "0.3rem" }}>
                    {entry.item.title}
                  </GradientTitle>
                </div>
                <span className="vault-remove" onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }} aria-label="Rimuovi dalla Cassaforte">
                  <Bookmark size={16} fill={accent} style={{ color: accent }} />
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* Form di pubblicazione per il canale Avvisi Team, visibile solo al coach:
   scrive direttamente su coach_news_tips (channel='team', RLS già presente
   da SCHEMA_v35) — niente tabella o modale a sé, solo la scrittura che
   mancava su un canale che esisteva già in lettura. */
function TeamComposer({ supabase }) {
  const [eyebrow, setEyebrow] = useState("Comunicazione ufficiale");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  const publish = () => {
    if (!title.trim() || !body.trim() || posting) return;
    setPosting(true);
    setError(null);
    publishTeamPost(supabase, { eyebrow, title, body })
      .then(() => {
        setTitle(""); setBody("");
        notifyTeamPost(supabase, { title, body });
      })
      .catch((err) => {
        console.error("PERFORM: errore pubblicazione avviso team", err);
        setError("Pubblicazione non riuscita, riprova.");
      })
      .finally(() => setPosting(false));
  };

  return (
    <div className="news-card px-6 py-6 mb-5">
      <p className="mb-3" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--ink)" }}>Pubblica un avviso</p>
      <select value={eyebrow} onChange={(e) => setEyebrow(e.target.value)}
              className="w-full text-sm mb-2 bg-transparent outline-none" style={{ color: "var(--ink-2)" }}>
        <option>Comunicazione ufficiale</option>
        <option>Traguardo atleta</option>
        <option>Traguardo squadra</option>
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo dell'avviso" maxLength={120}
             className="w-full text-sm mb-2 bg-transparent outline-none" style={{ color: "var(--ink)" }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000}
                placeholder="Cosa è cambiato e cosa devono fare i clienti per approfittarne (o come risolvere se riscontrano ancora un problema già corretto)..."
                className="w-full text-sm bg-transparent outline-none resize-none" style={{ color: "var(--ink)" }} />
      {error && <p className="text-xs mt-1" style={{ color: "#E5484D" }}>{error}</p>}
      <button onClick={publish} disabled={!title.trim() || !body.trim() || posting}
              className="w-full mt-2 rounded-full px-4 py-2 text-sm btn-3d"
              style={{ backgroundColor: "#C5A059", color: "#111111", fontWeight: 700, opacity: (!title.trim() || !body.trim() || posting) ? 0.5 : 1 }}>
        {posting ? "Pubblicazione…" : "Pubblica"}
      </button>
    </div>
  );
}

/* ============================================================================
   8 · COLONNA — SCORRIMENTO INFINITO
   ========================================================================== */

function FeedColumn({ channel, feed, gender, accent, vault, onOpen, onToggleSave, onDelete }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) feed.loadMore(); },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed.loadMore]);

  if (feed.loading) {
    return <div className="space-y-5"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  }

  if (feed.items.length === 0) {
    return (
      <div className="news-card px-8 py-12 text-center flex flex-col items-center">
        <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", backgroundColor: "rgba(161,161,170,0.12)", marginBottom: "0.7rem" }}>
          <Newspaper size={19} style={{ color: "var(--satin-gray)" }} />
        </span>
        <p style={{ color: "var(--satin-gray)", fontSize: "0.9rem" }}>Nessun contenuto in questo canale, per ora.</p>
      </div>
    );
  }

  return (
    <div>
      {feed.items.map((item, idx) => (
        <FeedCard
          key={item.id} item={item} channel={channel} isLatest={idx === 0} gender={gender} accent={accent}
          liked={!!feed.likedMine[item.id]} likeCount={item.likeCount ?? item.like_count ?? 0}
          saved={!!vault[item.id]}
          onToggleLike={() => feed.toggleLike(item.id)}
          onToggleSave={() => onToggleSave(item, !!feed.likedMine[item.id])}
          onOpen={() => onOpen(item.id)}
          onDelete={onDelete ? () => onDelete(item.id) : undefined}
        />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {feed.loadingMore && <CardSkeleton />}
      {!feed.hasMore && !feed.loadingMore && <EndOfFeed />}
    </div>
  );
}

/* ============================================================================
   9 · CONTENITORE PRINCIPALE
   ========================================================================== */

export function NewsTipsView({ meId, supabase, seeds, genderOverride, planOverride, isCoach = false, onTeamSeen }) {
  const [active, setActive] = useState("news");
  const [expanded, setExpanded] = useState(null);          // { channel, id } | null
  const [vaultOpen, setVaultOpen] = useState(false);
  const [readingVaultId, setReadingVaultId] = useState(null);
  const [vault, setVault] = useState({});                  // { itemId: { id, channel, savedAt, item } }
  const real = !!supabase;

  // BUG PRESO: la Cassaforte era solo stato React locale, mai scritta su
  // Supabase (SCHEMA_v55) — ogni articolo "salvato" spariva ad ogni riavvio
  // dell'app. Caricata ora al mount in modalità reale; coach_news_tips non
  // cancella mai le righe scadute quindi basta il riferimento (tip_id), il
  // contenuto resta leggibile anche a scadenza passata.
  useEffect(() => {
    if (!real) return;
    let alive = true;
    fetchSavedTips(supabase, meId)
      .then(async (tips) => {
        if (!alive) return;
        const { data: likedRows } = await supabase.from("tip_likes").select("tip_id").eq("user_id", meId).in("tip_id", tips.map((t) => t.id));
        if (!alive) return;
        const likedSet = new Set((likedRows ?? []).map((r) => r.tip_id));
        const next = {};
        tips.forEach((t) => {
          next[t.id] = { id: t.id, channel: t.channel, savedAt: new Date(t.savedAt).getTime(), item: { ...t, likedMine: likedSet.has(t.id), likeCount: t.like_count ?? 0 } };
        });
        setVault(next);
      })
      .catch((err) => console.error("PERFORM: errore caricamento cassaforte", err));
    return () => { alive = false; };
  }, [real, supabase, meId]);

  const fetchedGender = useUserGender({ supabase, meId, fallback: "M" });
  const gender = genderOverride || fetchedGender;
  const accent = genderAccent(gender);

  const fetchedPlan = useUserPlan({ supabase, meId, fallback: "free" });
  const plan = planOverride || fetchedPlan;

  // Azzera il pallino "novità" avvisi team appena il cliente apre quel tab
  // (SCHEMA_v81) — non per il coach, che pubblica ma non "riceve" l'avviso.
  useEffect(() => {
    if (!real || isCoach || active !== "team") return;
    markTeamSeen(supabase, meId)
      .then(() => onTeamSeen?.())
      .catch((err) => console.error("PERFORM: errore visto avvisi team", err));
  }, [real, isCoach, active, supabase, meId, onTeamSeen]);

  const feedNews = useNewsFeed({ supabase, meId, channel: "news", seedPool: seeds.news });
  const feedTips = useNewsFeed({ supabase, meId, channel: "tips", seedPool: seeds.tips });
  const feedTeam = useNewsFeed({ supabase, meId, channel: "team", seedPool: seeds.team });
  const feeds = { news: feedNews, tips: feedTips, team: feedTeam };

  const expandedItem = expanded ? feeds[expanded.channel].items.find((i) => i.id === expanded.id) : null;

  /* Salvare clona l'articolo nella Cassaforte: da quel momento la copia
     non è più soggetta a EXPIRES, qualunque cosa succeda all'originale. */
  const toggleSave = useCallback((item, channel, likedNow) => {
    const alreadySaved = !!vault[item.id];
    setVault((v) => {
      if (v[item.id]) {
        const next = { ...v };
        delete next[item.id];
        return next;
      }
      return {
        ...v,
        [item.id]: {
          id: item.id, channel, savedAt: Date.now(),
          item: { ...item, likedMine: likedNow, likeCount: item.likeCount ?? item.like_count ?? 0 },
        },
      };
    });
    if (real) {
      (alreadySaved ? unsaveTip(supabase, meId, item.id) : saveTip(supabase, meId, item.id))
        .catch((err) => console.error("PERFORM: errore salvataggio cassaforte", err));
    }
  }, [real, supabase, meId, vault]);

  const removeFromVault = useCallback((id) => {
    setVault((v) => {
      const next = { ...v };
      delete next[id];
      return next;
    });
    if (real) unsaveTip(supabase, meId, id).catch((err) => console.error("PERFORM: errore rimozione cassaforte", err));
  }, [real, supabase, meId]);

  const toggleVaultLike = useCallback((id) => {
    let likedNow = false;
    setVault((v) => {
      const entry = v[id];
      if (!entry) return v;
      likedNow = !!entry.item.likedMine;
      return {
        ...v,
        [id]: { ...entry, item: { ...entry.item, likedMine: !likedNow, likeCount: (entry.item.likeCount || 0) + (likedNow ? -1 : 1) } },
      };
    });
    if (!real) return;
    const writeLike = async () => {
      if (likedNow) {
        await supabase.from("tip_likes").delete().eq("tip_id", id).eq("user_id", meId);
      } else {
        await supabase.from("tip_likes").insert({ tip_id: id, user_id: meId });
        await supabase.from("feed_signals").insert({ user_id: meId, tip_id: id, signal: "like" });
      }
    };
    writeLike().catch((err) => console.error("PERFORM: errore like dalla cassaforte", err));
  }, [real, supabase, meId]);

  return (
    <div className="news-tips-root">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0"><ChannelTabs active={active} onChange={setActive} accent={accent} /></div>
        <VaultButton count={Object.keys(vault).length} onClick={() => setVaultOpen(true)} />
      </div>

      <div className="mt-7">
        {Object.keys(CHANNELS).map((ch) => (
          <div key={ch} style={{ display: active === ch ? "block" : "none" }}>
            {ch === "team" && isCoach && real && <TeamComposer supabase={supabase} />}
            <FeedColumn
              channel={ch} feed={feeds[ch]} gender={gender} accent={accent} vault={vault}
              onOpen={(id) => setExpanded({ channel: ch, id })}
              onToggleSave={(item, likedNow) => toggleSave(item, ch, likedNow)}
              onDelete={ch === "team" && isCoach && real
                ? (id) => deleteTeamPost(supabase, id).then(() => feeds.team.removeItem(id)).catch((err) => console.error("PERFORM: errore rimozione avviso team", err))
                : undefined}
            />
          </div>
        ))}
      </div>

      {expandedItem && (
        <ArticleReader
          item={expandedItem} channel={expanded.channel} gender={gender} accent={accent} plan={plan}
          liked={!!feeds[expanded.channel].likedMine[expandedItem.id]}
          likeCount={expandedItem.likeCount ?? expandedItem.like_count ?? 0}
          saved={!!vault[expandedItem.id]}
          onToggleLike={() => feeds[expanded.channel].toggleLike(expandedItem.id)}
          onToggleSave={() => toggleSave(expandedItem, expanded.channel, !!feeds[expanded.channel].likedMine[expandedItem.id])}
          onClose={() => setExpanded(null)}
          supabase={supabase}
        />
      )}

      {vaultOpen && (
        <VaultOverlay
          vault={vault} gender={gender} accent={accent}
          onOpenItem={(id) => setReadingVaultId(id)}
          onRemove={removeFromVault}
          onClose={() => setVaultOpen(false)}
        />
      )}

      {readingVaultId && vault[readingVaultId] && (
        <ArticleReader
          item={vault[readingVaultId].item} channel={vault[readingVaultId].channel} gender={gender} accent={accent} plan={plan}
          liked={!!vault[readingVaultId].item.likedMine}
          likeCount={vault[readingVaultId].item.likeCount ?? 0}
          saved={true}
          onToggleLike={() => toggleVaultLike(readingVaultId)}
          onToggleSave={() => { removeFromVault(readingVaultId); setReadingVaultId(null); }}
          onClose={() => setReadingVaultId(null)}
          supabase={supabase}
          zIndex={110}
        />
      )}
    </div>
  );
}

/* ============================================================================
   10 · CSS SPECIFICO DEL MODULO
   ========================================================================== */

export function NewsTipsViewStyles() {
  return (
    <style>{`
      .news-tips-root, .news-tips-root * {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      .news-tips-root { --satin-gray: #A1A1AA; }

      /* Firma d'autore — unica eccezione voluta al font geometrico, riservata
         agli Avvisi Team. Dichiarata dopo la regola universale: vince per
         ordine di cascata a parità di specificità e !important. */
      .coach-signature {
        font-family: ui-serif, Georgia, "Times New Roman", serif !important;
        font-style: italic;
        font-size: 0.75rem;
        font-weight: 400 !important;
        color: #A1A1AA;
        letter-spacing: 0.01em;
      }

      /* Titolo con gradiente cangiante — ultrasottile, continuo, non aggressivo */
      .title-gradient {
        background-size: 200% auto;
        -webkit-background-clip: text; background-clip: text; color: transparent;
        display: inline-block;
        animation: titleShimmer 9s ease-in-out infinite;
        will-change: background-position;
      }
      @keyframes titleShimmer {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }

      /* Countdown di scadenza — micro-timer ultrasottile */
      .expiry-countdown {
        display: block; font-size: 0.68rem; font-weight: 500;
        color: var(--satin-gray); letter-spacing: 0.02em;
      }

      /* Badge "Nuovo Report" — satinato, temporaneo, sul solo elemento più recente */
      .new-report-badge {
        display: inline-flex; align-items: center; gap: 0.35rem;
        padding: 0.3rem 0.65rem; border-radius: 999px;
        font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
        background: color-mix(in srgb, var(--accent, #D4AF37) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent, #D4AF37) 45%, transparent);
        color: var(--accent, #D4AF37);
      }

      .channel-tabs {
        display: flex; gap: 0.25rem; padding: 0.28rem;
        background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px;
      }
      .channel-tab {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
        padding: 0.62rem 0.5rem; border-radius: 999px; border: none; background: transparent;
        font-size: 0.82rem; font-weight: 600; color: var(--ink-2);
        transition: background 0.2s ease, color 0.2s ease;
      }
      .channel-tab.active { background: var(--ink); color: var(--page); font-weight: 700; }

      .vault-button {
        display: flex; align-items: center; gap: 0.35rem; padding: 0.62rem 0.85rem;
        border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2);
        color: var(--ink-2); font-size: 0.78rem; font-weight: 700; white-space: nowrap;
      }

      /* BUG PRESO: era un vetro semi-trasparente (46% di opacità in Onyx) —
         con lo sfondo vivo dell'app (macchie di luce oro/rosa dietro a
         tutte le schermate) il colore filtrava attraverso la card, che
         sembrava avere lo stesso colore dello sfondo invece di staccarsene.
         Ora quasi piena (94%): resta un velo di vetro (bordo/ombra/blur
         leggeri), ma il distacco dallo sfondo è netto anche a schermo
         acceso. */
      .news-card {
        cursor: pointer;
        background: rgba(255,255,255,0.94);
        backdrop-filter: blur(20px) saturate(140%);
        -webkit-backdrop-filter: blur(20px) saturate(140%);
        border: 1px solid var(--line);
        border-radius: 1.25rem;
        box-shadow: 0 10px 34px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.55);
        transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), border-color 0.25s ease;
      }
      .news-card:hover { transform: translateY(-2px); }
      [data-theme="dark"] .news-card {
        background: rgba(24,24,27,0.94);
        border: 1px solid rgba(255,255,255,0.09);
        box-shadow: 0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
      }

      .teaser-clamp {
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
      }

      .source-link {
        display: inline-flex; align-items: center; gap: 0.4rem;
        margin-top: 1.4rem; padding: 0.62rem 1.1rem;
        border-radius: 999px; border: 1px solid var(--line);
        font-size: 0.76rem; font-weight: 600; letter-spacing: 0.01em;
        color: var(--ink-2); text-decoration: none;
        transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
      }
      .source-link:hover {
        color: var(--accent, var(--ink));
        border-color: var(--accent, var(--line));
        background: color-mix(in srgb, var(--accent, transparent) 8%, transparent);
      }
      .source-link-subtle {
        display: inline-block; margin-top: 1.2rem;
        font-size: 0.7rem; font-weight: 400; font-style: italic;
        color: var(--satin-gray); text-decoration: underline; text-underline-offset: 2px;
        text-decoration-color: color-mix(in srgb, var(--satin-gray) 40%, transparent);
      }
      .source-link-subtle:hover { color: var(--accent, var(--ink)); }

      /* Lettura profonda: prima si apriva sempre in basso come un foglio a
         comparsa (align-items: flex-end) — spostato al centro dello
         schermo, dove si trova davvero il cliente, come ogni altro popup
         dell'app (Portal). */
      /* BUG PRESO: "Approfondisci" apriva un pop-up (card centrata, sfondo
         scurito) — su richiesta esplicita ora è una vera schermata interna a
         piena pagina, come Allenamento/Alimentazione/Recupero, non un
         pop-up sopra al feed. */
      .expand-overlay {
        position: fixed; inset: 0; z-index: 100;
        background: var(--page);
        display: flex; flex-direction: column;
      }
      .expand-sheet {
        width: 100%; height: 100%;
        background: var(--page);
        overflow: hidden; display: flex; flex-direction: column;
      }
      .expand-scroll { overflow-y: auto; padding: 1.2rem 1.5rem 2.4rem; flex: 1; }
      .expand-close {
        width: 40px; height: 40px; border-radius: 999px; border: 1px solid var(--line);
        background: var(--surface-2); color: var(--ink); display: flex; align-items: center; justify-content: center;
      }
      @keyframes sheetIn {
        0%   { opacity: 0; transform: translateY(16px) scale(0.97); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .expand-sheet.spring-in { animation: sheetIn 0.32s cubic-bezier(0.22,1,0.36,1) both; }

      /* Cassaforte — righe elenco */
      .vault-row {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
        padding: 0.95rem 0; border-top: none; border-left: none; border-right: none;
        border-bottom: 1px solid var(--line); background: transparent; text-align: left;
      }
      .vault-row:last-child { border-bottom: none; }
      .vault-remove { flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0.4rem; }

      /* PERFORM AI — chat minimale coordinata (sbloccata) */
      .ai-chat { margin-top: 2rem; padding-top: 1.6rem; border-top: 1px solid var(--line); }
      .ai-chat-label { font-size: 0.82rem; font-weight: 600; color: var(--ink); margin-bottom: 0.9rem; display: flex; align-items: center; gap: 0.5rem; }
      .ai-chat-thread { display: flex; flex-direction: column; gap: 0.6rem; max-height: 260px; overflow-y: auto; margin-bottom: 0.9rem; }
      .ai-bubble { font-size: 0.88rem; line-height: 1.6; padding: 0.7rem 1rem; border-radius: 1rem; max-width: 88%; display: flex; align-items: flex-start; gap: 0.55rem; }
      .ai-bubble.user {
        align-self: flex-end; background: color-mix(in srgb, var(--accent, #D4AF37) 16%, transparent);
        color: var(--ink); border: 1px solid color-mix(in srgb, var(--accent, #D4AF37) 40%, transparent);
      }
      .ai-bubble.assistant { align-self: flex-start; background: var(--surface-2); color: var(--ink); border: 1px solid var(--line); }
      .ai-typing { display: flex; gap: 4px; align-items: center; padding: 0.9rem 1rem; }
      .ai-typing span { width: 5px; height: 5px; border-radius: 999px; background: var(--ink-2); animation: aiTypingBounce 1.1s ease-in-out infinite; }
      .ai-typing span:nth-child(2) { animation-delay: 0.15s; }
      .ai-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes aiTypingBounce { 0%,60%,100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
      .ai-chat-input-row { display: flex; gap: 0.6rem; }
      .ai-chat-input-row input {
        flex: 1; min-width: 0; padding: 0.75rem 1rem; border-radius: 0.9rem;
        border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); font-size: 0.88rem;
      }
      .ai-chat-input-row input::placeholder { color: var(--ink-2); }
      .ai-chat-input-row input:disabled { opacity: 0.6; cursor: not-allowed; }
      .ai-chat-input-row button {
        padding: 0.75rem 1.2rem; border-radius: 0.9rem; border: none;
        background: var(--accent, #D4AF37); color: #111111; font-size: 0.85rem; font-weight: 700;
      }
      .ai-chat-input-row button:disabled { opacity: 0.4; cursor: not-allowed; }
      .ai-chat-error { margin-top: 0.6rem; font-size: 0.76rem; color: var(--ink-2); }

      /* PERFORM AI — paywall Free: chat sfocata dietro un lucchetto satinato */
      .ai-chat-locked { position: relative; margin-top: 2rem; padding-top: 1.6rem; border-top: 1px solid var(--line); }
      .ai-chat-locked-ghost {
        display: flex; flex-direction: column; gap: 0.6rem;
        filter: blur(5px); opacity: 0.55; pointer-events: none; user-select: none;
      }
      .ai-chat-locked-overlay {
        position: absolute; left: 0; right: 0; top: 2.4rem; bottom: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; gap: 0.85rem; padding: 1.6rem 1.5rem;
        background: rgba(255,255,255,0.6);
        backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
        border-radius: 1.1rem; border: 1px solid var(--line);
      }
      [data-theme="dark"] .ai-chat-locked-overlay { background: rgba(24,24,27,0.62); }
      .ai-chat-lock-icon {
        width: 46px; height: 46px; border-radius: 999px;
        display: flex; align-items: center; justify-content: center;
        background: color-mix(in srgb, var(--accent, #D4AF37) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent, #D4AF37) 48%, transparent);
        color: var(--accent, #D4AF37);
      }
      .ai-chat-locked-text { font-size: 0.85rem; line-height: 1.65; color: var(--ink-2); max-width: 380px; }
      .ai-chat-locked-text strong { color: var(--ink); font-weight: 700; }

      @keyframes springIn {
        0%   { opacity: 0; transform: translateY(12px) scale(0.99); }
        55%  { opacity: 1; transform: translateY(-1px) scale(1.002); }
        100% { opacity: 1; transform: none; }
      }
      .spring-in { animation: springIn 0.4s cubic-bezier(0.22,1.2,0.36,1) both; }

      @keyframes skeletonPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      .skeleton { background: var(--surface-2); border-radius: 1.25rem; animation: skeletonPulse 1.3s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .title-gradient, .spring-in, .skeleton, .expand-sheet.spring-in, .ai-typing span { animation: none !important; }
      }
    `}</style>
  );
}

/* ============================================================================
   11 · ANTEPRIMA — da eliminare in produzione
   ========================================================================== */

const NOW = Date.now();
const iso = (minsAgo) => new Date(NOW - minsAgo * 60000).toISOString();

const SEED_NEWS = [
  { id: "n1", channel: "news", like_count: 214,
    title: "La soglia di leucina conta più della “finestra anabolica”",
    body: "Non esiste un minuto magico dopo l'allenamento in cui il pasto “funziona di più”. Quello che conta è raggiungere circa 2,5–3 g di leucina per pasto: è la soglia che attiva in modo pieno la sintesi proteica muscolare.",
    bodyExtended: [
      "Il concetto di “finestra anabolica” di 30-60 minuti nasce da studi degli anni '90 su ipotesi di deplezione acuta del glicogeno, ma le revisioni più recenti mostrano che la sintesi proteica muscolare resta elevata per diverse ore dopo lo stimolo allenante, non in una finestra ristretta.",
      "Ciò che sposta davvero l'ago della bilancia è la quantità di leucina per singolo pasto: sotto la soglia di circa 2,5-3 g, il complesso mTOR non riceve uno stimolo sufficiente per massimizzare la sintesi, indipendentemente da quanto sia “vicino” il pasto all'allenamento.",
    ],
    source_query: "leucine threshold muscle protein synthesis meal distribution", published_at: iso(12) },
  { id: "n2", channel: "news", like_count: 156,
    title: "La fase eccentrica lenta non raddoppia l'ipertrofia",
    body: "Rallentare la discesa a 4-6 secondi aumenta il tempo sotto tensione, ma i dati più recenti mostrano un beneficio marginale rispetto a un tempo controllato di 2-3 secondi, a parità di volume totale.",
    bodyExtended: [
      "Il tempo sotto tensione è stato per anni considerato una leva indipendente per l'ipertrofia, al punto da giustificare tempi eccentrici estremi (6-8 secondi) in molti protocolli amatoriali.",
      "Le meta-analisi più recenti che normalizzano per volume allenante totale mostrano differenze minime tra tempi eccentrici di 2-3 secondi e tempi più lunghi, quando entrambi i gruppi arrivano vicino al cedimento muscolare.",
    ],
    source_query: "eccentric tempo repetition duration hypertrophy meta-analysis", published_at: iso(95) },
  { id: "n3", channel: "news", like_count: 98,
    title: "Vitamina D bassa rallenta il recupero, non solo le ossa",
    body: "Livelli sotto i 30 ng/mL sono associati a tempi di recupero muscolare più lunghi e a un rischio maggiore di infortuni da sovraccarico negli atleti che si allenano indoor.",
    bodyExtended: [
      "La vitamina D non agisce solo sul metabolismo del calcio: i suoi recettori sono presenti anche nel tessuto muscolare scheletrico, dove modulano la sintesi proteica e la risposta infiammatoria post-esercizio.",
      "Negli atleti che si allenano prevalentemente al chiuso, la carenza (sotto i 30 ng/mL) è frequente soprattutto a fine inverno, ed è stata associata a tempi di recupero più lunghi e a un'incidenza maggiore di infortuni da sovraccarico tendineo.",
    ],
    source_query: "vitamin D deficiency muscle recovery athletes", published_at: iso(340) },
  { id: "n4", channel: "news", like_count: 133,
    title: "Il carico di creatina non serve per chi ha tempo",
    body: "5 g al giorno per 3-4 settimane saturano le riserve muscolari con la stessa efficacia di una fase di carico da 20 g/die per 5-7 giorni, semplicemente più lentamente.",
    bodyExtended: [
      "Il protocollo di carico classico (20 g/die suddivisi in 4 dosi, per 5-7 giorni) nasce per saturare rapidamente le riserve intramuscolari di fosfocreatina, utile in vista di una competizione ravvicinata.",
      "Senza urgenza temporale, una dose di mantenimento di 3-5 g al giorno per 3-4 settimane raggiunge la stessa saturazione, con minore ritenzione idrica iniziale.",
    ],
    source_query: "creatine loading protocol saturation muscle", published_at: iso(900) },
  { id: "n5", channel: "news", like_count: 87,
    title: "Il sonno corto alza il cortisolo basale più dello stress da allenamento",
    body: "Dormire meno di 6 ore per più notti consecutive alza i livelli di cortisolo mattutino in modo più marcato di una settimana di sovraccarico allenante.",
    bodyExtended: [
      "Il cortisolo mattutino è un marcatore indiretto ma robusto dello stato di stress sistemico. Studi su privazione di sonno controllata mostrano incrementi significativi già dopo 3-4 notti sotto le 6 ore.",
      "Confrontato con una settimana di sovraccarico allenante pianificato, il deficit di sonno cronico produce un'alterazione ormonale più marcata e meno prevedibile.",
    ],
    source_query: "sleep restriction cortisol athletes recovery", published_at: iso(1600) },
];

const SEED_TIPS = [
  { id: "p1", channel: "tips", like_count: 302,
    title: "Come leggere un'etichetta nutrizionale in 10 secondi",
    body: "Ignora la scritta in copertina. Guarda solo tre numeri per 100 g: le calorie, i grammi di proteine e gli zuccheri aggiunti.",
    bodyExtended: [
      "Le diciture in copertina (“leggero”, “proteico”, “naturale”) non hanno una definizione normativa stringente e servono soprattutto al marketing.",
      "Regola pratica: se le proteine per 100 g valgono meno del 15% delle calorie totali, o gli zuccheri aggiunti superano i 10 g per 100 g, il prodotto probabilmente non è quello che la confezione promette.",
    ], published_at: iso(20) },
  { id: "p2", channel: "tips", like_count: 121,
    title: "Come non fare la presa in panca se ti fanno male i polsi",
    body: "Sui manubri, ruotare leggermente i palmi l'uno verso l'altro nella fase di spinta riduce il momento torcente sul polso senza perdere reclutamento del pettorale.",
    bodyExtended: [
      "Nella presa pronata classica, il polso è esposto a un momento torcente costante durante tutta la spinta, soprattutto nella fase di massimo carico vicino al petto.",
      "Ruotando leggermente i palmi verso l'interno (presa neutra o semi-neutra) l'avambraccio si allinea meglio con la linea di spinta, riducendo lo stress articolare.",
    ], published_at: iso(180) },
  { id: "p3", channel: "tips", like_count: 176,
    title: "Come scegliere le proteine in polvere senza farti fregare dal prezzo",
    body: "Un prodotto più economico al kg può costare di più per grammo di proteina effettiva se la concentrazione è bassa.",
    bodyExtended: [
      "Due prodotti apparentemente simili possono avere concentrazioni proteiche molto diverse: un concentrato al 70% e un isolato al 90% non vanno confrontati a parità di prezzo al kg.",
      "Il calcolo corretto è: prezzo confezione ÷ grammi totali di proteina nella confezione. Questo numero è l'unico che permette un confronto onesto tra due prodotti.",
    ], published_at: iso(520) },
  { id: "p4", channel: "tips", like_count: 88,
    title: "Cosa fare quando prendi caffeina pre-workout",
    body: "Il picco plasmatico della caffeina arriva 45-60 minuti dopo l'assunzione. A 3-6 mg per kg di peso corporeo, il beneficio su forza e percezione dello sforzo è documentato.",
    bodyExtended: [
      "L'assorbimento della caffeina non è istantaneo: il picco di concentrazione plasmatica si osserva tipicamente 45-60 minuti dopo l'ingestione.",
      "A dosi di 3-6 mg per kg di peso corporeo, gli studi mostrano un miglioramento misurabile su forza espressa e percezione dello sforzo. Oltre questa fascia, il rischio principale è ansia e disturbi gastrointestinali.",
    ], published_at: iso(980) },
  { id: "p5", channel: "tips", like_count: 64,
    title: "Come fare la manovra di Valsalva su stacco e squat pesanti",
    body: "Su stacco e squat pesanti, una breve trattenuta del respiro a glottide chiusa aumenta la pressione intra-addominale e stabilizza la colonna.",
    bodyExtended: [
      "Trattenere il respiro a glottide chiusa durante la fase concentrica di un carico massimale aumenta la pressione intra-addominale, che agisce come un vero e proprio cinturone interno per la colonna vertebrale.",
      "È una tecnica efficace e ben documentata, ma va insegnata correttamente e va sconsigliata a chi ha pressione arteriosa non controllata.",
    ], published_at: iso(1900) },
];

const SEED_TEAM = [
  { id: "a1", channel: "team", eyebrow: "Traguardo atleta", like_count: 41,
    title: "Matteo chiude il primo stacco da terra a 180 kg",
    body: "Otto mesi fa il suo massimale era 130 kg. Oggi ha chiuso 180×1 con tecnica pulita e senza cinturone.",
    bodyExtended: [
      "Matteo ha seguito una progressione lineare su base settimanale, con blocchi di scarico programmati ogni 4-5 settimane per evitare l'accumulo di fatica cronica.",
      "Il salto da 130 a 180 kg in otto mesi è arrivato senza mai forzare la tecnica. Complimenti da parte di tutto lo staff — il prossimo target, discusso insieme, è 190 kg entro fine anno.",
    ], published_at: iso(430) },
  { id: "a2", channel: "team", eyebrow: "Comunicazione ufficiale", like_count: 27,
    title: "Sala pesi chiusa sabato 15 agosto per manutenzione impianto",
    body: "Il piano attrezzi sarà chiuso l'intera giornata di sabato 15 agosto per la sanificazione annuale e la ricalibratura delle macchine a carico guidato.",
    bodyExtended: [
      "La manutenzione riguarda in particolare la ricalibratura dei sistemi a carico guidato e la sanificazione profonda di tutte le superfici a contatto.",
      "Riapertura regolare domenica mattina. Gli allenamenti previsti per sabato verranno recuperati di comune accordo con il coach.",
    ], published_at: iso(1200) },
  { id: "a3", channel: "team", eyebrow: "Traguardo atleta", like_count: 55,
    title: "Sara porta la panca piana da 52 a 70 kg in cinque mesi",
    body: "Percorso di forza puro: doppia progressione, nessuna settimana saltata.",
    bodyExtended: [
      "Il protocollo seguito da Sara si è basato su doppia progressione (range 6-8 ripetizioni, incremento di carico solo a cedimento tecnico raggiunto su tutte le serie).",
      "Il prossimo obiettivo, fissato insieme al coach, è 75 kg entro la fine dell'anno.",
    ], published_at: iso(2100) },
  { id: "a4", channel: "team", eyebrow: "Comunicazione ufficiale", like_count: 19,
    title: "Nuovo orario di apertura da lunedì 1 settembre",
    body: "Da settembre la sala apre alle 6:30 invece che alle 7:00, per venire incontro a chi si allena prima del lavoro.",
    bodyExtended: [
      "La richiesta è arrivata da diversi atleti con turni mattutini anticipati: l'apertura alle 6:30 permette una sessione completa prima delle 8:00.",
      "L'orario di chiusura serale resta invariato alle 22:00. Il cambiamento verrà valutato dopo il primo mese in base all'affluenza reale.",
    ], published_at: iso(60 * 24 * 6) },
  { id: "a5", channel: "team", eyebrow: "Traguardo squadra", like_count: 72,
    title: "12 atleti su 14 hanno superato il test FMS di questo trimestre",
    body: "Il Functional Movement Screen trimestrale ha confermato miglioramenti diffusi nella mobilità d'anca e nella stabilità scapolare.",
    bodyExtended: [
      "Il Functional Movement Screen (FMS) trimestrale valuta pattern di movimento fondamentali su una scala che identifica asimmetrie e limitazioni prima che diventino infortuni.",
      "I due atleti risultati sotto soglia sono già stati inseriti in un protocollo correttivo dedicato di 6 settimane, con rivalutazione programmata al termine del blocco.",
    ], published_at: iso(60 * 24 * 21) },
];

export default function NewsTipsViewPreview() {
  const [dark, setDark] = useState(true);
  const [gender, setGender] = useState("M");
  const [plan, setPlan] = useState("free");

  return (
    <div className="app-root min-h-screen" data-theme={dark ? "dark" : "light"}
         style={{ backgroundColor: dark ? "#09090B" : "#FFFFFF", transition: "background-color 0.4s ease" }}>
      <style>{`
        .app-root {
          --page: #FFFFFF; --surface: #FFFFFF; --surface-2: #FCFCFD;
          --line: rgba(17,17,17,0.07); --ink: #111113; --ink-2: #8E8E93;
        }
        .app-root[data-theme="dark"] {
          --page: #09090B; --surface: #18181B; --surface-2: #131316;
          --line: rgba(255,255,255,0.08); --ink: #FAFAFA; --ink-2: #A1A1AA;
        }
      `}</style>
      <NewsTipsViewStyles />

      <div className="fixed top-3 right-3 z-50 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={() => setGender((g) => (g === "M" ? "F" : "M"))} className="text-xs px-3 py-2 rounded-full"
                  style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF",
                           fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
            {gender === "M" ? "Oro" : "Rosa"}
          </button>
          <button onClick={() => setDark((v) => !v)} className="text-xs px-3 py-2 rounded-full"
                  style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF",
                           fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
            {dark ? "Light" : "Onyx"}
          </button>
        </div>
        <button onClick={() => setPlan((p) => (p === "free" ? "performance_pack" : "free"))} className="text-xs px-3 py-2 rounded-full"
                style={{
                  backgroundColor: plan === "free" ? (dark ? "#FAFAFA" : "#111111") : genderAccent(gender),
                  color: plan === "free" ? (dark ? "#09090B" : "#FFFFFF") : "#111111",
                  fontFamily: "system-ui, sans-serif", fontWeight: 700,
                }}>
          {plan === "free" ? "🔒 Piano: Free" : "✓ Premium"}
        </button>
      </div>

      {/* Nessun Header: in produzione questo spazio è occupato dalla cornice di 04_AppShell.jsx */}
      <main className="max-w-xl mx-auto px-4 pt-8 pb-16">
        <NewsTipsView meId="me" supabase={null} genderOverride={gender} planOverride={plan}
                      seeds={{ news: SEED_NEWS, tips: SEED_TIPS, team: SEED_TEAM }} />
      </main>
    </div>
  );
}
