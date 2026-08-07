import React, { useEffect, useState } from "react";
import {
  fetchClientList,
  assignNutritionTarget,
  assignWorkoutExercise,
  MUSCLE_TARGETS,
} from "../lib/coachingData.js";

/* ============================================================================
   10_CoachAssignPanel.jsx
   ----------------------------------------------------------------------------
   Pannello di assegnazione reale: il coach sceglie un cliente e scrive
   direttamente su nutrition_targets e workout_logs (righe is_read_only=true).
   Volutamente separato da 09_CoachDashboard.jsx: quel file resta intatto,
   questo è il primo pezzo di collegamento dati vero. Fondere questa UI dentro
   l'estetica del Coach Panel esistente è un lavoro di styling successivo.
   ========================================================================== */

export default function CoachAssignPanel({ supabase, coachId, accent = "#D4AF37" }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState(null); // { type: 'ok'|'error', text }

  useEffect(() => {
    let mounted = true;
    fetchClientList(supabase)
      .then((rows) => { if (mounted) { setClients(rows); setLoadingClients(false); } })
      .catch((err) => { if (mounted) { setStatus({ type: "error", text: err.message }); setLoadingClients(false); } });
    return () => { mounted = false; };
  }, [supabase]);

  // --- form target nutrizionali ---
  const [dayType, setDayType] = useState("on");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const submitTarget = async (e) => {
    e.preventDefault();
    if (!clientId) return setStatus({ type: "error", text: "Seleziona un cliente." });
    try {
      await assignNutritionTarget(supabase, {
        coachId, clientId, dayType,
        kcal: Number(kcal), protein: Number(protein), carbs: Number(carbs), fat: Number(fat),
        effectiveFrom,
      });
      setStatus({ type: "ok", text: `Target ${dayType.toUpperCase()} assegnato.` });
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  };

  // --- form assegnazione esercizio ---
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [splitLabel, setSplitLabel] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [muscleTarget, setMuscleTarget] = useState(MUSCLE_TARGETS[0]);
  const [setsCount, setSetsCount] = useState(3);
  const [intensityTechnique, setIntensityTechnique] = useState("");

  const submitExercise = async (e) => {
    e.preventDefault();
    if (!clientId) return setStatus({ type: "error", text: "Seleziona un cliente." });
    if (!exerciseName.trim()) return setStatus({ type: "error", text: "Nome esercizio obbligatorio." });
    try {
      await assignWorkoutExercise(supabase, {
        clientId, date, splitLabel, exerciseName: exerciseName.trim(),
        muscleTarget, setsCount: Number(setsCount), intensityTechnique,
      });
      setStatus({ type: "ok", text: `"${exerciseName}" assegnato per il ${date}.` });
      setExerciseName("");
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  };

  const inputStyle = {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: 10,
    border: "1px solid var(--line, rgba(17,17,17,.12))", fontSize: "0.9rem",
    background: "var(--surface, #fff)", color: "var(--ink, #1A1A1A)",
  };
  const labelStyle = { fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-2, #8E8E93)", marginBottom: 4, display: "block", fontWeight: 600 };
  const cardStyle = { background: "var(--surface, #fff)", border: "1px solid var(--line, rgba(17,17,17,.08))", borderRadius: 16, padding: "1.25rem", marginBottom: "1rem" };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1rem" }}>
      <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.25rem" }}>Assegna scheda e target</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--ink-2, #8E8E93)", marginBottom: "1rem" }}>
        Scrive direttamente su Supabase (nutrition_targets, workout_logs). Il cliente vede questi dati nella sua Home.
      </p>

      <div style={{ ...cardStyle }}>
        <label style={labelStyle}>Cliente</label>
        <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={loadingClients}>
          <option value="">{loadingClients ? "Caricamento…" : "Seleziona un cliente"}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.nickname} — XP {c.xp_total} — streak {c.current_streak}</option>
          ))}
        </select>
      </div>

      {status && (
        <div style={{
          padding: "0.6rem 0.9rem", borderRadius: 10, marginBottom: "1rem", fontSize: "0.85rem",
          background: status.type === "ok" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          color: status.type === "ok" ? "#15803d" : "#b91c1c",
        }}>
          {status.text}
        </div>
      )}

      <form onSubmit={submitTarget} style={cardStyle}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>Target macro/kcal</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.6rem" }}>
          <div>
            <label style={labelStyle}>Giorno</label>
            <select style={inputStyle} value={dayType} onChange={(e) => setDayType(e.target.value)}>
              <option value="on">ON (allenamento)</option>
              <option value="off">OFF (riposo)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Valido dal</label>
            <input style={inputStyle} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.6rem", marginBottom: "0.75rem" }}>
          <div><label style={labelStyle}>Kcal</label><input style={inputStyle} type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} required /></div>
          <div><label style={labelStyle}>Prot (g)</label><input style={inputStyle} type="number" value={protein} onChange={(e) => setProtein(e.target.value)} required /></div>
          <div><label style={labelStyle}>Carbo (g)</label><input style={inputStyle} type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} required /></div>
          <div><label style={labelStyle}>Grassi (g)</label><input style={inputStyle} type="number" value={fat} onChange={(e) => setFat(e.target.value)} required /></div>
        </div>
        <button type="submit" style={{ padding: "0.65rem 1.2rem", borderRadius: 10, border: "none", background: accent, color: "#111", fontWeight: 600, cursor: "pointer" }}>
          Assegna target
        </button>
      </form>

      <form onSubmit={submitExercise} style={cardStyle}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>Assegna esercizio alla scheda</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.6rem" }}>
          <div><label style={labelStyle}>Data</label><input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label style={labelStyle}>Etichetta scheda</label><input style={inputStyle} placeholder="Upper A — Spinta" value={splitLabel} onChange={(e) => setSplitLabel(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: "0.6rem" }}>
          <label style={labelStyle}>Nome esercizio</label>
          <input style={inputStyle} placeholder="Panca piana bilanciere" value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.6rem", marginBottom: "0.6rem" }}>
          <div>
            <label style={labelStyle}>Distretto muscolare</label>
            <select style={inputStyle} value={muscleTarget} onChange={(e) => setMuscleTarget(e.target.value)}>
              {MUSCLE_TARGETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Serie</label><input style={inputStyle} type="number" min="1" value={setsCount} onChange={(e) => setSetsCount(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={labelStyle}>Tecnica di intensità (opzionale)</label>
          <input style={inputStyle} placeholder="Rest-Pause ultima serie" value={intensityTechnique} onChange={(e) => setIntensityTechnique(e.target.value)} />
        </div>
        <button type="submit" style={{ padding: "0.65rem 1.2rem", borderRadius: 10, border: "none", background: accent, color: "#111", fontWeight: 600, cursor: "pointer" }}>
          Assegna esercizio
        </button>
      </form>
    </div>
  );
}
