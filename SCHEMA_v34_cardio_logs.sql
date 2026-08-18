-- =====================================================================
-- PERFORM — Schema v34: registro attività cardio (sezione "Cardio")
-- Script idempotente.
-- =====================================================================

-- Un'attività cardio registrata manualmente dal cliente (corsa, camminata,
-- bici, nuoto...) — stile "diario Strava" semplificato: nessun collegamento
-- GPS/device in questa prima versione, solo tipo/durata/distanza inseriti
-- a mano, come già sonno e passi in daily_metrics. Fa parte del Diario
-- Libero, disponibile a tutti i piani (Free incluso), non solo Premium.
create table if not exists public.cardio_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  date          date not null,
  activity_type text not null,
  duration_min  integer not null check (duration_min > 0),
  distance_km   numeric,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cardio_logs_user_date on public.cardio_logs(user_id, date desc);

alter table public.cardio_logs enable row level security;
alter table public.cardio_logs force row level security;

drop policy if exists "cardio_logs_select" on public.cardio_logs;
create policy "cardio_logs_select" on public.cardio_logs for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "cardio_logs_insert" on public.cardio_logs;
create policy "cardio_logs_insert" on public.cardio_logs for insert
  with check ( user_id = auth.uid() );

drop policy if exists "cardio_logs_delete" on public.cardio_logs;
create policy "cardio_logs_delete" on public.cardio_logs for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.cardio_logs to authenticated;
