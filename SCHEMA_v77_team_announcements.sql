-- PERFORM — SCHEMA_v77_team_announcements.sql
-- ============================================================================
-- "Avvisi Team": il coach pubblica annunci (aggiornamenti dell'app, nuove
-- funzionalità, cosa fare per approfittarne) visibili a TUTTI i clienti.
-- Broadcast semplice, non per-cliente: un'unica tabella, tutti gli utenti
-- autenticati la leggono, solo il coach scrive.
--
-- Lettura "non letto" (per il pallino rosso, vedi SCHEMA_v78): niente
-- tabella di join per-utente/per-annuncio — un singolo timestamp su
-- profiles (last_seen_announcements_at) basta, dato che gli annunci sono un
-- feed unico condiviso, non messaggi diretti. Un annuncio è "nuovo" per un
-- utente se created_at > il suo last_seen_announcements_at. La colonna sfrutta
-- la policy UPDATE già esistente su profiles (ogni utente aggiorna solo la
-- propria riga), nessuna policy nuova necessaria.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.team_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists team_announcements_created_idx
  on public.team_announcements (created_at desc);

alter table public.team_announcements enable row level security;

-- Tutti gli utenti autenticati leggono il feed (broadcast, non privato).
drop policy if exists "team_announcements_select" on public.team_announcements;
create policy "team_announcements_select" on public.team_announcements for select
  to authenticated using ( true );

-- Solo il coach pubblica/modifica/cancella.
drop policy if exists "team_announcements_insert" on public.team_announcements;
create policy "team_announcements_insert" on public.team_announcements for insert
  with check ( public.is_coach() );

drop policy if exists "team_announcements_update" on public.team_announcements;
create policy "team_announcements_update" on public.team_announcements for update
  using ( public.is_coach() ) with check ( public.is_coach() );

drop policy if exists "team_announcements_delete" on public.team_announcements;
create policy "team_announcements_delete" on public.team_announcements for delete
  using ( public.is_coach() );

grant select, insert, update, delete on public.team_announcements to authenticated;

alter table public.profiles add column if not exists last_seen_announcements_at timestamptz;
