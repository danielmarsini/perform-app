/* ============================================================================
   CrewView.jsx — "streak solitaria" a piccoli gruppi (3-6 persone), montato
   come secondo tab di 07_ClassificaView.jsx accanto alla classifica globale.
   ----------------------------------------------------------------------------
   Punto centrale: la stessa identica definizione di "giornata completa" già
   usata per lo streak individuale (isDayComplete, coachingData.js) osservata
   ora anche dai propri compagni di crew — una responsabilità reciproca
   leggera, con tolleranza per un giorno storto isolato (vedi
   CREW_DAY_MAX_MISSING in coachingData.js) così un singolo membro non fa
   crollare lo streak di tutti alla prima disattenzione.

   Nessun nuovo tab nella bottom nav: la Classifica è già la schermata
   "community" dell'app, la Crew ci vive dentro come secondo pillow — stesso
   principio già seguito per il pannello Referral (spostato in Hub Utenti
   invece di un nuovo punto di ingresso, task #108).
   ========================================================================== */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Users, Copy, Check, LogOut, Flame, Send, Loader2 } from "lucide-react";
import {
  fetchMyCrew, createCrew, joinCrewByCode, leaveCrew,
  computeCrewWeeklyActivity, computeCrewStreak,
  fetchCrewMessages, sendCrewMessage, freshRealtimeChannel,
} from "../lib/coachingData.js";
import { haptic } from "../lib/haptics.js";

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in fuso locale, non UTC
}

function CrewChat({ supabase, crewId, meId, members, accent }) {
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const nameById = new Map(members.map((m) => [m.userId, m.nickname]));

  useEffect(() => {
    let cancelled = false;
    fetchCrewMessages(supabase, crewId)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch((err) => { console.error("PERFORM: errore lettura chat crew", err); if (!cancelled) setMessages([]); });
    return () => { cancelled = true; };
  }, [supabase, crewId]);

  useEffect(() => {
    const ch = freshRealtimeChannel(supabase, `perform-crew-${crewId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_messages", filter: `crew_id=eq.${crewId}` },
        ({ new: m }) => setMessages((all) => ((all ?? []).some((x) => x.id === m.id) ? all : [...(all ?? []), m])))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [supabase, crewId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const saved = await sendCrewMessage(supabase, crewId, meId, body);
      setMessages((all) => ((all ?? []).some((x) => x.id === saved.id) ? all : [...(all ?? []), saved]));
      setDraft("");
    } catch (err) {
      console.error("PERFORM: errore invio messaggio crew", err);
    } finally {
      setSending(false);
    }
  };

  if (messages === null) return <p className="meta">Carico la chat…</p>;

  return (
    <div className="card">
      <p className="label mb-3">💬 Chat di crew</p>
      <div ref={scrollRef} className="space-y-2 mb-3" style={{ maxHeight: 220, overflowY: "auto" }}>
        {messages.length === 0 && (
          <p className="meta text-center" style={{ fontSize: "0.72rem" }}>Nessun messaggio ancora — rompi il ghiaccio.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className="flex" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div className="rounded-2xl px-3 py-2" style={{ maxWidth: "78%", backgroundColor: mine ? "rgba(0,0,0,0.62)" : "var(--surface-2)", border: mine ? "none" : "1px solid var(--line)" }}>
                {!mine && (
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, color: accent, marginBottom: 2 }}>
                    {nameById.get(m.sender_id) || "Atleta"}
                  </p>
                )}
                <p className="text-sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: mine ? "#FFFFFF" : "var(--ink)" }}>
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Scrivi alla crew…" className="input flex-1 px-3 py-2 text-sm" aria-label="Scrivi alla crew" />
        <button onClick={send} disabled={!draft.trim() || sending} aria-label="Invia"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
          style={{ backgroundColor: accent }}>
          {sending ? <Loader2 size={14} className="animate-spin" style={{ color: "#111111" }} /> : <Send size={14} style={{ color: "#111111" }} />}
        </button>
      </div>
    </div>
  );
}

export default function CrewView({ supabase, meId, gender }) {
  const accent = gender === "female" ? "#E5C1CD" : "#D4AF37";
  const [crew, setCrew] = useState(undefined); // undefined = non ancora caricato, null = nessuna crew
  const [weekly, setWeekly] = useState(null);
  const [crewStreak, setCrewStreak] = useState(0);
  const [error, setError] = useState("");
  const [crewName, setCrewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    if (!supabase || !meId) return;
    fetchMyCrew(supabase, meId)
      .then((c) => setCrew(c))
      .catch((err) => {
        console.error("PERFORM: errore lettura crew", err);
        setError("Non sono riuscito a caricare la tua crew.");
        setCrew(null);
      });
  }, [supabase, meId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!crew) { setWeekly(null); setCrewStreak(0); return undefined; }
    let cancelled = false;
    computeCrewWeeklyActivity(supabase, crew.members.map((m) => m.userId))
      .then((map) => {
        if (cancelled) return;
        setWeekly(map);
        setCrewStreak(computeCrewStreak(map, todayISO()).streak);
      })
      .catch((err) => console.error("PERFORM: errore calcolo attività crew", err));
    return () => { cancelled = true; };
  }, [supabase, crew]);

  const doCreate = async () => {
    setBusy(true); setError("");
    try {
      await createCrew(supabase, meId, crewName);
      setCrewName("");
      haptic("confirm");
      load();
    } catch (err) {
      console.error("PERFORM: errore creazione crew", err);
      setError(err.message || "Non sono riuscito a creare la crew — riprova.");
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy(true); setError("");
    try {
      await joinCrewByCode(supabase, meId, joinCode);
      setJoinCode("");
      haptic("confirm");
      load();
    } catch (err) {
      console.error("PERFORM: errore ingresso crew", err);
      setError(err.message || "Non sono riuscito a unirti a questa crew — riprova.");
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    if (!crew || busy) return;
    setBusy(true);
    try {
      await leaveCrew(supabase, meId, crew.id);
      haptic("confirm");
      setCrew(null);
    } catch (err) {
      console.error("PERFORM: errore uscita crew", err);
      setError("Non sono riuscito a farti uscire dalla crew — riprova.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!crew) return;
    try {
      await navigator.clipboard.writeText(crew.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("PERFORM: errore copia codice crew", err);
    }
  };

  if (crew === undefined) {
    return <p className="meta text-center mt-6">Carico la tua crew…</p>;
  }

  if (!crew) {
    return (
      <div className="card mb-4">
        <p className="label mb-1">👥 Crea la tua crew</p>
        <p className="meta mb-3" style={{ fontSize: "0.72rem" }}>
          Da 3 a 6 persone, uno streak condiviso: la costanza del gruppo conta più di quella del singolo — un
          giorno storto tuo non rompe tutto, ma la crew se ne accorge se smetti davvero di farti vedere.
        </p>
        {error && <p className="text-xs mb-3" style={{ color: "#DC2626" }}>{error}</p>}
        <div className="flex gap-2 mb-4">
          <input value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="Nome della crew"
            className="input flex-1 px-3 py-2 text-sm" aria-label="Nome della crew" />
          <button onClick={doCreate} disabled={busy} className="btn-3d px-4 py-2 text-sm rounded-full disabled:opacity-50 shrink-0"
            style={{ backgroundColor: accent, color: "#111111", fontWeight: 700 }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Crea"}
          </button>
        </div>
        <p className="meta mb-2" style={{ fontSize: "0.68rem" }}>Oppure, se hai già un codice invito:</p>
        <div className="flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="CODICE"
            maxLength={6} className="input flex-1 px-3 py-2 text-sm" style={{ letterSpacing: "0.1em" }} aria-label="Codice invito" />
          <button onClick={doJoin} disabled={busy || !joinCode.trim()} className="px-4 py-2 text-sm rounded-full disabled:opacity-50 shrink-0"
            style={{ border: `1.5px solid ${accent}`, color: accent, fontWeight: 700, background: "none" }}>
            Unisciti
          </button>
        </div>
      </div>
    );
  }

  const sortedMembers = [...crew.members].sort(
    (a, b) => (weekly?.get(b.userId)?.completeCount ?? 0) - (weekly?.get(a.userId)?.completeCount ?? 0)
  );

  return (
    <div>
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} /> {crew.name}
          </p>
          <button onClick={doLeave} disabled={busy} className="flex items-center gap-1 text-xs shrink-0" style={{ color: "var(--ink-2)", background: "none" }}>
            <LogOut size={12} /> Esci
          </button>
        </div>
        {error && <p className="text-xs mb-2" style={{ color: "#DC2626" }}>{error}</p>}
        <div className="flex items-center gap-2 mb-3">
          <Flame size={18} style={{ color: accent }} />
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--ink)" }}>{crewStreak}</span>
          <span className="meta" style={{ fontSize: "0.72rem" }}>giorni di streak di gruppo</span>
        </div>
        <button onClick={copyInvite} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {crew.inviteCode} · invita compagni ({crew.members.length}/6)
        </button>
      </div>

      <div className="card mb-4">
        <p className="label mb-3">Questa settimana</p>
        {sortedMembers.map((m) => {
          const w = weekly?.get(m.userId);
          const flags = w?.dayFlags ?? Array(7).fill(false);
          return (
            <div key={m.userId} className="flex items-center gap-3 mb-2.5">
              <span className="text-xs truncate" style={{ color: "var(--ink)", width: 96, flexShrink: 0 }}>
                {m.nickname}{m.userId === meId ? " (tu)" : ""}
              </span>
              <div className="flex gap-1 flex-1">
                {flags.map((done, i) => (
                  <span key={i} className="rounded-full" style={{
                    width: 16, height: 16, display: "inline-block",
                    backgroundColor: done ? accent : "var(--surface-2)",
                    border: done ? "none" : "1px solid var(--line)",
                  }} />
                ))}
              </div>
              <span className="text-xs shrink-0" style={{ color: "var(--ink-2)", minWidth: 28, textAlign: "right" }}>{w?.completeCount ?? 0}/7</span>
            </div>
          );
        })}
      </div>

      <CrewChat supabase={supabase} crewId={crew.id} meId={meId} members={crew.members} accent={accent} />
    </div>
  );
}
