/* ============================================================================
   TechniqueVideoPanel.jsx — Video-check tecnica esecuzione, condiviso fra
   08_ClientProfileView.jsx (role="client": carica un video + legge il
   commento) e 09_CoachDashboard.jsx (role="coach": guarda e commenta).
   Stesso principio di bucket privato/URL firmato di checkin-photos
   (SCHEMA_v36) e stessa struttura a lista di ChatThread.jsx.
   ========================================================================== */

import React, { useState, useEffect, useCallback } from "react";
import { Video, Upload, Loader2, Trash2, MessageSquare } from "lucide-react";
import {
  fetchTechniqueVideos, uploadTechniqueVideo, saveTechniqueVideo,
  getTechniqueVideoUrl, saveTechniqueVideoComment, deleteTechniqueVideo,
} from "../lib/coachingData.js";
import { haptic } from "../lib/haptics.js";

const MAX_BYTES = 150 * 1024 * 1024; // 150 MB — oltre, il caricamento diventa lento/inaffidabile su rete mobile

export default function TechniqueVideoPanel({ supabase, clientId, role, accent }) {
  const isCoachView = role === "coach";
  const [videos, setVideos] = useState(null); // null = non ancora caricato
  const [urls, setUrls] = useState({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({}); // videoId -> testo in scrittura
  const [savingComment, setSavingComment] = useState(null); // videoId in salvataggio

  const load = useCallback(() => {
    fetchTechniqueVideos(supabase, clientId)
      .then(setVideos)
      .catch((err) => { console.error("PERFORM: errore lettura video tecnica", err); setVideos([]); });
  }, [supabase, clientId]);
  useEffect(() => { load(); }, [load]);

  // URL firmati risolti una volta per elenco caricato — mai un URL pubblico
  // permanente, sempre rigenerato alla lettura (validi 1h).
  useEffect(() => {
    if (!videos?.length) return;
    let cancelled = false;
    Promise.all(videos.map(async (v) => [v.id, await getTechniqueVideoUrl(supabase, v.video_path)]))
      .then((pairs) => { if (!cancelled) setUrls(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [supabase, videos]);

  const handleUpload = async () => {
    if (!file || !exerciseName.trim()) return;
    if (file.size > MAX_BYTES) { setUploadError("Video troppo pesante (oltre 150 MB) — prova a registrarne uno più breve."); return; }
    setUploading(true);
    setUploadError("");
    try {
      const path = await uploadTechniqueVideo(supabase, clientId, file);
      const saved = await saveTechniqueVideo(supabase, clientId, exerciseName.trim(), path, note.trim());
      setVideos((all) => [saved, ...(all ?? [])]);
      haptic("confirm");
      setUploadOpen(false); setExerciseName(""); setNote(""); setFile(null);
    } catch (err) {
      console.error("PERFORM: errore caricamento video tecnica", err);
      setUploadError("Non sono riuscito a caricare il video — controlla la connessione e riprova.");
    } finally {
      setUploading(false);
    }
  };

  const submitComment = async (videoId) => {
    const text = (commentDrafts[videoId] || "").trim();
    if (!text) return;
    setSavingComment(videoId);
    try {
      await saveTechniqueVideoComment(supabase, videoId, text);
      setVideos((all) => all.map((v) => (v.id === videoId ? { ...v, coach_comment: text, coach_comment_at: new Date().toISOString() } : v)));
      setCommentDrafts((d) => { const n = { ...d }; delete n[videoId]; return n; });
      haptic("confirm");
    } catch (err) {
      console.error("PERFORM: errore salvataggio commento video tecnica", err);
    } finally {
      setSavingComment(null);
    }
  };

  const removeVideo = async (v) => {
    if (!window.confirm(`Eliminare il video "${v.exercise_name}"?`)) return;
    try {
      await deleteTechniqueVideo(supabase, v.id, v.video_path);
      setVideos((all) => all.filter((x) => x.id !== v.id));
    } catch (err) {
      console.error("PERFORM: errore rimozione video tecnica", err);
    }
  };

  if (videos === null) return <p className="meta">Carico i video…</p>;

  return (
    <div className="space-y-3">
      {!isCoachView && (
        <>
          {!uploadOpen ? (
            <button onClick={() => setUploadOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-full"
              style={{ backgroundColor: accent, color: "#FFFFFF", fontWeight: 600 }}>
              <Upload size={15} style={{ color: "#FFFFFF" }} />
              Carica un video per il coach
            </button>
          ) : (
            <div className="inner p-4">
              <label className="block mb-2.5">
                <span className="label block mb-1.5">Esercizio</span>
                <input type="text" value={exerciseName} onChange={(e) => setExerciseName(e.target.value)}
                  placeholder="es. Squat, Stacco da terra…" className="input w-full px-4 py-2.5 text-sm" />
              </label>
              <label className="block mb-2.5">
                <span className="label block mb-1.5">Cosa vuoi far vedere (facoltativo)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="es. Guarda se le ginocchia cedono verso l'interno" className="input w-full px-4 py-2.5 text-sm" />
              </label>
              <label className="block mb-3">
                <span className="label block mb-1.5">Video (max ~150 MB)</span>
                <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="input w-full px-4 py-2.5 text-sm" />
              </label>
              {uploadError && <p className="text-xs mb-3" style={{ color: "#B91C1C" }}>{uploadError}</p>}
              <div className="flex gap-2">
                <button onClick={handleUpload} disabled={!file || !exerciseName.trim() || uploading}
                  className="flex-1 rounded-full px-4 py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {uploading ? "Carico…" : "Invia al coach"}
                </button>
                <button onClick={() => { setUploadOpen(false); setUploadError(""); }}
                  className="px-4 py-2.5 rounded-full text-sm" style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                  Annulla
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {videos.length === 0 ? (
        <p className="meta">{isCoachView ? "Nessun video caricato da questo cliente." : "Nessun video caricato ancora."}</p>
      ) : (
        videos.map((v) => (
          <div key={v.id} className="inner p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm flex items-center gap-2 min-w-0" style={{ color: "var(--ink)", fontWeight: 700 }}>
                <Video size={14} style={{ color: accent }} className="shrink-0" />
                <span className="truncate">{v.exercise_name}</span>
              </p>
              <span className="flex items-center gap-2 shrink-0">
                <span className="meta" style={{ fontSize: "0.62rem" }}>
                  {new Date(v.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
                {!isCoachView && (
                  <button onClick={() => removeVideo(v)} aria-label="Elimina video" style={{ color: "var(--ink-2)" }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </div>
            {urls[v.id]
              ? <video controls src={urls[v.id]} className="w-full rounded-xl mb-2" style={{ maxHeight: 280, backgroundColor: "#000" }} />
              : <div className="w-full rounded-xl mb-2 flex items-center justify-center" style={{ height: 120, backgroundColor: "var(--surface-2)" }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: "var(--ink-2)" }} />
                </div>}
            {v.note && <p className="meta mb-2" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>💬 {v.note}</p>}

            {v.coach_comment ? (
              <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${accent}14`, border: `1px solid ${accent}40` }}>
                <p className="meta mb-1" style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase" }}>Commento del coach</p>
                <p className="text-sm" style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{v.coach_comment}</p>
              </div>
            ) : isCoachView ? (
              <div className="flex items-center gap-2">
                <input type="text" value={commentDrafts[v.id] || ""} onChange={(e) => setCommentDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(v.id); }}
                  placeholder="Scrivi un commento (es. a 0:12 ginocchia troppo interne)…"
                  className="input flex-1 px-3 py-2 text-sm" aria-label="Scrivi un commento" />
                <button onClick={() => submitComment(v.id)} disabled={!commentDrafts[v.id]?.trim() || savingComment === v.id}
                  aria-label="Invia commento" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: accent }}>
                  <MessageSquare size={14} style={{ color: "#FFFFFF" }} />
                </button>
              </div>
            ) : (
              <p className="meta" style={{ fontSize: "0.72rem" }}>In attesa di revisione del coach.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
