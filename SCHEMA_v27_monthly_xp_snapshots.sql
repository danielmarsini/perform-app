-- =====================================================================
-- PERFORM — Schema v27 (nuova tabella): monthly_xp_snapshots
-- Script idempotente.
-- =====================================================================

-- Uno snapshot per utente per mese = il suo profiles.xp_total (cumulativo,
-- da sempre) misurato all'inizio di quel mese. La classifica mensile non è
-- altro che la DIFFERENZA fra due snapshot consecutivi (o fra lo snapshot
-- di inizio mese e l'xp_total attuale, per il mese in corso) — mai un
-- secondo "contatore XP mensile" tenuto a parte, che potrebbe disallinearsi
-- dal totale reale. Scritto una volta al mese dalla Edge Function
-- monthly-xp-snapshot (cron il 1° di ogni mese).
create table if not exists public.monthly_xp_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  month                 text not null, -- 'YYYY-MM', sempre il 1° del mese in UTC
  xp_total_at_snapshot  integer not null,
  created_at            timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists idx_monthly_xp_snapshots_month on public.monthly_xp_snapshots(month);

alter table public.monthly_xp_snapshots enable row level security;
alter table public.monthly_xp_snapshots force row level security;

-- Sola lettura per tutti gli utenti loggati (serve per la classifica
-- globale, che chiunque può vedere): la scrittura è solo della Edge
-- Function via service_role, che bypassa RLS — nessuna policy insert qui.
drop policy if exists "monthly_xp_snapshots_select" on public.monthly_xp_snapshots;
create policy "monthly_xp_snapshots_select" on public.monthly_xp_snapshots for select
  using ( true );

grant select on public.monthly_xp_snapshots to authenticated;
