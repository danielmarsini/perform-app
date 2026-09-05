-- =====================================================================
-- PERFORM — Schema v93: integrazione Whoop (Digital Twin, dati biometrici
-- reali al posto dei placeholder "58"/"62" e dei due input manuali bloccati
-- "RHR e HRV in arrivo" in 05_HomeDashboard.jsx).
-- Script idempotente.
-- =====================================================================
--
-- daily_metrics.hrv_ms/rhr_bpm ESISTONO GIÀ (SCHEMA_v19) — questa migrazione
-- NON tocca quella tabella, aggiunge solo ciò che serve per riempirle con
-- dati veri via OAuth2 Whoop: dove tenere i token e un flag di stato
-- leggibile dal client (mai i token stessi, mai un secret lato client).
--
-- whoop_tokens: RLS abilitata SENZA policy per `authenticated` — accesso
-- SOLO dal service role (le Edge Function whoop-oauth-callback/whoop-sync),
-- mai leggibile/scrivibile direttamente dal client, anche autenticato come
-- proprietario. Stesso principio già in uso per i secret Stripe: un
-- access/refresh token OAuth non è mai un dato che il browser deve vedere.
create table if not exists public.whoop_tokens (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  whoop_user_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.whoop_tokens enable row level security;
alter table public.whoop_tokens force row level security;
-- Nessuna policy per authenticated: default-deny, solo service role passa.

-- Stato "connesso"/ultimo sync: safe da esporre al proprietario del profilo
-- (nessun segreto), serve solo per mostrare lo stato reale in Impostazioni
-- invece di dover interrogare whoop_tokens (che il client non può leggere).
alter table public.profiles add column if not exists whoop_connected boolean not null default false;
alter table public.profiles add column if not exists whoop_last_sync timestamptz;
