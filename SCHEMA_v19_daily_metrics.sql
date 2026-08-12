-- =====================================================================
-- PERFORM — Schema v19 (nuova tabella): daily_metrics
-- Script idempotente.
-- =====================================================================

-- Sonno e passi inseriti manualmente dal cliente, un giorno = una riga.
-- hrv_ms/rhr_bpm esistono già come colonne anche se per ora bloccate lato UI
-- ("funzionalità disponibile a breve" — nessuna via gratuita per leggerle da
-- Apple Watch/Android senza un aggregatore terzo a pagamento, mai attivato):
-- quando quella integrazione arriverà, la colonna è già pronta, non serve
-- un'altra migrazione.
-- Distinta da `checkins` (il check settimanale del lunedì: peso,
-- circonferenze) perché ha cadenza e scopo diversi — un giorno di sonno/passi
-- non è un check-in fisico.
create table if not exists public.daily_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  date         date not null,
  sleep_start  time,
  sleep_end    time,
  sleep_hours  numeric(4,2),
  steps        integer,
  hrv_ms       numeric(6,2),
  rhr_bpm      numeric(5,2),
  updated_at   timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_daily_metrics_user_date on public.daily_metrics(user_id, date);

alter table public.daily_metrics enable row level security;
alter table public.daily_metrics force row level security;

drop policy if exists "daily_metrics_select" on public.daily_metrics;
create policy "daily_metrics_select" on public.daily_metrics for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "daily_metrics_insert" on public.daily_metrics;
create policy "daily_metrics_insert" on public.daily_metrics for insert
  with check ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "daily_metrics_update" on public.daily_metrics;
create policy "daily_metrics_update" on public.daily_metrics for update
  using ( user_id = auth.uid() or public.is_coach() )
  with check ( user_id = auth.uid() or public.is_coach() );

grant select, insert, update on public.daily_metrics to authenticated;
