/* ============================================================================
   ChatThread.jsx — conversazione coach <-> cliente, condivisa fra
   08_ClientProfileView.jsx (lato cliente) e 09_CoachDashboard.jsx (lato
   coach): stessa UI, stessa tabella (chat_messages, SCHEMA_v48), solo
   clientId/meId cambiano a seconda di chi la monta. Realtime (stesso
   principio già in uso in 06_NewsTipsView.jsx per coach_news_tips): un nuovo
   messaggio, da entrambi i lati, compare subito senza dover ricaricare.
   ========================================================================== */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { fetchChatMessages, sendChatMessage, markChatMessagesRead } from "../lib/coachingData.js";
import { haptic } from "../lib/haptics.js";

export default function ChatThread({ supabase, clientId, meId, accent, emptyText }) {
  const [messages, setMessages] = useState(null); // null = non ancora caricato
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const scrollRef = useRef(null);

  const load = useCallback(() => {
    fetchChatMessages(supabase, clientId)
      .then((rows) => setMessages(rows))
      .catch((err) => {
        console.error("PERFORM: errore lettura chat", err);
        setLoadError("Non sono riuscito a caricare la conversazione.");
        setMessages([]);
      });
  }, [supabase, clientId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`perform-chat-${clientId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `client_id=eq.${clientId}` },
        ({ new: m }) => setMessages((all) => ((all ?? []).some((x) => x.id === m.id) ? all : [...(all ?? []), m])))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [supabase, clientId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Segna come letti i messaggi dell'altra parte appena il thread è aperto —
  // mai i propri (vedi guardia neq(sender_id, readerId) in markChatMessagesRead).
  useEffect(() => {
    if (!messages?.length) return;
    markChatMessagesRead(supabase, clientId, meId).catch((err) => console.error("PERFORM: errore segna chat come letta", err));
  }, [supabase, clientId, meId, messages?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const saved = await sendChatMessage(supabase, clientId, meId, body);
      setMessages((all) => ((all ?? []).some((x) => x.id === saved.id) ? all : [...(all ?? []), saved]));
      haptic("confirm");
    } catch (err) {
      console.error("PERFORM: errore invio messaggio", err);
      setDraft(body); // ridà il testo se il salvataggio è fallito, niente perso
    } finally {
      setSending(false);
    }
  };

  if (messages === null) {
    return <p className="meta">Carico la conversazione…</p>;
  }

  return (
    <div className="flex flex-col" style={{ height: "58vh" }}>
      {loadError && <p className="meta mb-2" style={{ color: "#B91C1C" }}>{loadError}</p>}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 px-1 pb-3">
        {messages.length === 0 && (
          <p className="meta text-center mt-8">{emptyText || "Nessun messaggio ancora — scrivi il primo."}</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className="flex" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-3.5 py-2.5" style={{
                    maxWidth: "78%",
                    backgroundColor: mine ? accent : "var(--surface-2)",
                    color: mine ? "#FFFFFF" : "var(--ink)",
                    border: mine ? "none" : "1px solid var(--line)" }}>
                <p className="text-sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</p>
                <p className="mt-1" style={{ fontSize: "0.6rem", opacity: 0.7 }}>
                  {new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Scrivi un messaggio…" className="input flex-1 px-4 py-2.5 text-sm" aria-label="Scrivi un messaggio" />
        <button onClick={send} disabled={!draft.trim() || sending} aria-label="Invia"
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-transform active:scale-90"
          style={{ backgroundColor: accent }}>
          <Send size={16} style={{ color: "#FFFFFF" }} />
        </button>
      </div>
    </div>
  );
}
