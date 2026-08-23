/* ============================================================================
   ChatThread.jsx — conversazione coach <-> cliente, condivisa fra
   08_ClientProfileView.jsx (lato cliente) e 09_CoachDashboard.jsx (lato
   coach): stessa UI, stessa tabella (chat_messages, SCHEMA_v48), solo
   clientId/meId cambiano a seconda di chi la monta. Realtime (stesso
   principio già in uso in 06_NewsTipsView.jsx per coach_news_tips): un nuovo
   messaggio, da entrambi i lati, compare subito senza dover ricaricare.

   Allegati (SCHEMA_v50): foto, video, vocali e file generici come su
   WhatsApp — bucket privato "chat-attachments", URL sempre firmato al
   momento della lettura (mai un link pubblico permanente), stesso
   principio già in uso per i video-check tecnica in TechniqueVideoPanel.
   ========================================================================== */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Camera, Mic, Square, X, FileText, Loader2 } from "lucide-react";
import { fetchChatMessages, sendChatMessage, markChatMessagesRead, uploadChatAttachment, getChatAttachmentUrl, freshRealtimeChannel } from "../lib/coachingData.js";
import { haptic } from "../lib/haptics.js";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB — messaggi rapidi, non i video tecnica (150 MB a sé)

function kindForFile(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export default function ChatThread({ supabase, clientId, meId, accent, emptyText }) {
  const [messages, setMessages] = useState(null); // null = non ancora caricato
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [urls, setUrls] = useState({}); // message.id -> signed URL dell'allegato
  const scrollRef = useRef(null);

  // Allegato pronto da inviare (non ancora caricato su Supabase): scelto da
  // file input o appena registrato come vocale.
  const [pendingFile, setPendingFile] = useState(null); // File | Blob
  const [pendingKind, setPendingKind] = useState(null); // 'image' | 'video' | 'audio' | 'file'
  const [pendingName, setPendingName] = useState("");
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Registrazione vocale via MediaRecorder (API nativa del browser, nessuna
  // libreria esterna necessaria) — stesso principio "niente asset esterni"
  // già seguito altrove nel progetto.
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

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
    const ch = freshRealtimeChannel(supabase, `perform-chat-${clientId}`)
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

  // URL firmati per gli allegati già arrivati — risolti una volta per lotto
  // di messaggi caricato, mai un URL pubblico permanente (stesso principio
  // di TechniqueVideoPanel).
  useEffect(() => {
    const withAttachment = (messages ?? []).filter((m) => m.attachment_path && !urls[m.id]);
    if (withAttachment.length === 0) return;
    let cancelled = false;
    Promise.all(withAttachment.map(async (m) => [m.id, await getChatAttachmentUrl(supabase, m.attachment_path)]))
      .then((pairs) => { if (!cancelled) setUrls((u) => ({ ...u, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, messages]);

  const clearPending = () => {
    setPendingFile(null); setPendingKind(null); setPendingName(""); setAttachError("");
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl(null);
  };

  const pickFile = (file, forcedKind) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { setAttachError("File troppo pesante (oltre 50 MB)."); return; }
    setAttachError("");
    setPendingFile(file);
    setPendingKind(forcedKind || kindForFile(file));
    setPendingName(file.name || "");
    setPendingPreviewUrl(file.type?.startsWith("image/") ? URL.createObjectURL(file) : null);
    setAttachMenuOpen(false);
  };

  const startRecording = async () => {
    setAttachError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        pickFile(blob, "audio");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("PERFORM: errore accesso microfono", err);
      setAttachError("Non riesco ad accedere al microfono — controlla i permessi del browser.");
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    clearInterval(recordTimerRef.current);
  };
  useEffect(() => () => clearInterval(recordTimerRef.current), []);

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pendingFile) || sending) return;
    setSending(true);
    try {
      let attachment = null;
      if (pendingFile) {
        const path = await uploadChatAttachment(supabase, clientId, pendingFile, pendingKind);
        attachment = { path, type: pendingKind, name: pendingName || null };
      }
      const saved = await sendChatMessage(supabase, clientId, meId, body || null, attachment);
      setMessages((all) => ((all ?? []).some((x) => x.id === saved.id) ? all : [...(all ?? []), saved]));
      setDraft("");
      clearPending();
      haptic("confirm");
    } catch (err) {
      console.error("PERFORM: errore invio messaggio", err);
      setAttachError("Non sono riuscito a inviare — controlla la connessione e riprova.");
    } finally {
      setSending(false);
    }
  };

  if (messages === null) {
    return <p className="meta">Carico la conversazione…</p>;
  }

  const renderAttachment = (m) => {
    if (!m.attachment_path) return null;
    const url = urls[m.id];
    if (!url) {
      return (
        <div className="rounded-xl flex items-center justify-center mb-1.5" style={{ height: 90, width: 160, backgroundColor: "rgba(0,0,0,0.12)" }}>
          <Loader2 size={16} className="animate-spin" style={{ color: "inherit", opacity: 0.7 }} />
        </div>
      );
    }
    if (m.attachment_type === "image") {
      return <img src={url} alt="" className="rounded-xl mb-1.5" style={{ maxWidth: "100%", maxHeight: 260, display: "block" }} />;
    }
    if (m.attachment_type === "video") {
      return <video controls src={url} className="rounded-xl mb-1.5" style={{ maxWidth: "100%", maxHeight: 260, backgroundColor: "#000" }} />;
    }
    if (m.attachment_type === "audio") {
      return <audio controls src={url} className="mb-1.5" style={{ maxWidth: "100%", height: 36 }} />;
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2.5 py-2 mb-1.5"
         style={{ backgroundColor: "rgba(0,0,0,0.12)" }}>
        <FileText size={15} className="shrink-0" />
        <span className="text-xs truncate" style={{ textDecoration: "underline" }}>{m.attachment_name || "File allegato"}</span>
      </a>
    );
  };

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
                {renderAttachment(m)}
                {m.body && <p className="text-sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</p>}
                <p className="mt-1" style={{ fontSize: "0.6rem", opacity: 0.7 }}>
                  {new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {attachError && <p className="text-xs mb-1.5" style={{ color: "#DC2626" }}>{attachError}</p>}

      {pendingFile && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {pendingPreviewUrl ? (
            <img src={pendingPreviewUrl} alt="" className="rounded-md shrink-0" style={{ width: 36, height: 36, objectFit: "cover" }} />
          ) : (
            <span className="shrink-0 flex items-center justify-center rounded-md" style={{ width: 36, height: 36, backgroundColor: "var(--surface)" }}>
              {pendingKind === "audio" ? <Mic size={15} /> : pendingKind === "video" ? <Camera size={15} /> : <FileText size={15} />}
            </span>
          )}
          <span className="flex-1 text-xs truncate" style={{ color: "var(--ink)" }}>
            {pendingKind === "audio" ? "Messaggio vocale" : pendingName || "Allegato"}
          </span>
          <button onClick={clearPending} aria-label="Rimuovi allegato" className="shrink-0" style={{ color: "var(--ink-2)" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
          <span className="rounded-full animate-pulse" style={{ width: 8, height: 8, backgroundColor: "#DC2626" }} />
          <span className="flex-1 text-xs font-medium" style={{ color: "#DC2626" }}>
            Registrazione… {String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:{String(recordSeconds % 60).padStart(2, "0")}
          </span>
          <button onClick={stopRecording} aria-label="Ferma registrazione" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#DC2626" }}>
            <Square size={11} style={{ color: "#FFFFFF" }} fill="#FFFFFF" />
          </button>
        </div>
      )}

      {attachMenuOpen && (
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => photoInputRef.current?.click()} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
            style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}>
            <Camera size={13} /> Foto/Video
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
            style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}>
            <Paperclip size={13} /> File
          </button>
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] || null)} />
      <input ref={fileInputRef} type="file" className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] || null, "file")} />

      <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <button onClick={() => setAttachMenuOpen((v) => !v)} aria-label="Allega" disabled={recording}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>
          <Paperclip size={15} />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={recording}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Scrivi un messaggio…" className="input flex-1 px-4 py-2.5 text-sm" aria-label="Scrivi un messaggio" />
        {!draft.trim() && !pendingFile ? (
          <button onClick={recording ? stopRecording : startRecording} aria-label={recording ? "Ferma registrazione" : "Registra un vocale"}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90"
            style={{ backgroundColor: recording ? "#DC2626" : accent }}>
            {recording ? <Square size={14} style={{ color: "#FFFFFF" }} fill="#FFFFFF" /> : <Mic size={16} style={{ color: "#FFFFFF" }} />}
          </button>
        ) : (
          <button onClick={send} disabled={(!draft.trim() && !pendingFile) || sending} aria-label="Invia"
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-transform active:scale-90"
            style={{ backgroundColor: accent }}>
            {sending ? <Loader2 size={15} className="animate-spin" style={{ color: "#FFFFFF" }} /> : <Send size={16} style={{ color: "#FFFFFF" }} />}
          </button>
        )}
      </div>
    </div>
  );
}
