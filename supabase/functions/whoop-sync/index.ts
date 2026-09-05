// PERFORM — Edge Function: whoop-sync
// ============================================================================
// Scarica il recovery reale da Whoop (HRV, RHR) per gli ultimi HISTORY_DAYS
// giorni e lo scrive in daily_metrics.hrv_ms/rhr_bpm — colonne che esistono
// già (SCHEMA_v19, mai toccate finché non arrivava un device reale a
// fornirle). Da qui in poi il Digital Twin (computeOverreachAlert,
// 05_HomeDashboard.jsx) calcola su dati veri invece che sul placeholder
// costante "58"/"62" già corretto separatamente in HomeDashboard.
//
// Chiamata dal client (pulsante "Sincronizza ora" in Impostazioni, e subito
// dopo il primo collegamento OAuth) — mai da un cron: whoop-oauth-callback
// gestisce la connessione, questa funzione gestisce solo l'aggiornamento
// dati per l'utente già connesso e loggato in quel momento.
//
// FONTI (verificate via ricerca web, nessun endpoint/campo indovinato):
// GET https://api.prod.whoop.com/developer/v2/recovery
//   query: start, end, limit (max 25), next_token
//   risposta: { records: [{ created_at, score_state,
//     score: { resting_heart_rate, hrv_rmssd_milli } }], next_token }
// (developer.whoop.com/docs/developing/user-data/recovery/)
//
// LIMITE NOTO (documentato, non nascosto): la data attribuita a ogni
// recovery è created_at troncato al giorno in UTC, non nel fuso orario reale
// dell'atleta — Whoop genera il recovery al risveglio, quindi per la
// stragrande maggioranza dei fusi orari cade comunque nel giorno corretto,
// ma un atleta a ridosso della mezzanotte UTC può vedere un giorno spostato
// di uno. Correggerlo richiederebbe il fuso orario del profilo (non ancora
// raccolto in anamnesi) — miglioria futura, non un dato finto nel frattempo.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHOOP_CLIENT_ID = Deno.env.get("WHOOP_CLIENT_ID")!;
const WHOOP_CLIENT_SECRET = Deno.env.get("WHOOP_CLIENT_SECRET")!;
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_RECOVERY_URL = "https://api.prod.whoop.com/developer/v2/recovery";

const HISTORY_DAYS = 49; // stessa finestra di HISTORY_DAYS in 05_HomeDashboard.jsx
const MAX_PAGES = 6; // fino a 150 record (limit 25 x pagina) — ampio margine per 49 giorni

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Refresh idempotente: un token ancora valido (margine di 2 minuti) non
// viene toccato, evitando una chiamata di rete inutile ad ogni sync.
async function ensureFreshToken(admin, userId, tokenRow) {
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (expiresAt - Date.now() > 2 * 60 * 1000) return tokenRow.access_token;

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`refresh token Whoop fallito (${res.status}): ${body}`);
  }
  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
  await admin.from("whoop_tokens").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenRow.refresh_token, // alcuni provider non ne emettono uno nuovo ad ogni refresh
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const { data: tokenRow, error: tokenError } = await admin.from("whoop_tokens").select("*").eq("user_id", user.id).maybeSingle();
  if (tokenError) return new Response(JSON.stringify({ error: tokenError.message }), { status: 500, headers: CORS_HEADERS });
  if (!tokenRow) return new Response(JSON.stringify({ error: "Whoop non è collegato per questo account." }), { status: 400, headers: CORS_HEADERS });

  try {
    const accessToken = await ensureFreshToken(admin, user.id, tokenRow);

    const start = new Date();
    start.setDate(start.getDate() - HISTORY_DAYS);

    const byDate = new Map(); // dateISO -> { hrv_ms, rhr_bpm } (l'ultimo record scoperto per quel giorno vince)
    let nextToken;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(WHOOP_RECOVERY_URL);
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("limit", "25");
      if (nextToken) url.searchParams.set("next_token", nextToken);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`lettura recovery Whoop fallita (${res.status}): ${body}`);
      }
      const data = await res.json();
      for (const record of data.records || []) {
        // score_state diverso da SCORED = recovery non ancora calcolato
        // (es. "PENDING_SCORE") o non calcolabile ("UNSCORABLE") — mai un
        // numero inventato per un giorno senza uno score reale.
        if (record.score_state !== "SCORED" || !record.score) continue;
        const dateISO = String(record.created_at).slice(0, 10);
        const hrv = record.score.hrv_rmssd_milli != null ? Number(record.score.hrv_rmssd_milli) : null;
        const rhr = record.score.resting_heart_rate != null ? Number(record.score.resting_heart_rate) : null;
        if (hrv == null && rhr == null) continue;
        byDate.set(dateISO, { hrv_ms: hrv, rhr_bpm: rhr });
      }
      nextToken = data.next_token;
      if (!nextToken) break;
    }

    let synced = 0;
    for (const [dateISO, values] of byDate) {
      const patch = { user_id: user.id, date: dateISO, updated_at: new Date().toISOString() };
      if (values.hrv_ms != null) patch.hrv_ms = values.hrv_ms;
      if (values.rhr_bpm != null) patch.rhr_bpm = values.rhr_bpm;
      const { error: upsertError } = await admin.from("daily_metrics").upsert(patch, { onConflict: "user_id,date" });
      if (upsertError) { console.error("PERFORM: errore upsert daily_metrics da Whoop", dateISO, upsertError); continue; }
      synced++;
    }

    await admin.from("profiles").update({ whoop_last_sync: new Date().toISOString() }).eq("id", user.id);

    return new Response(JSON.stringify({ synced, daysFound: byDate.size }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("PERFORM: errore sincronizzazione Whoop", err);
    return new Response(JSON.stringify({ error: err?.message || "Sincronizzazione con Whoop non riuscita." }), { status: 500, headers: CORS_HEADERS });
  }
});
