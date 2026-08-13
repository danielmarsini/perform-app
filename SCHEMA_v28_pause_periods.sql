-- =====================================================================
-- PERFORM — Schema v28 (nuova tabella): pause_periods
-- Script idempotente.
-- =====================================================================

-- Vacanza (2-14 giorni) o riposo forzato singolo (un giorno, motivo
-- obbligatorio) richiesti dal cliente. Nei giorni coperti da un periodo
-- attivo, streak/XP/aderenza NON penalizzano il cliente (vedi
-- isDayComplete/computeRealXpAndStreak in coachingData.js, che leggono
-- questa tabella) — è un riposo sanzionato, non un'assenza. Il coach vede
-- il motivo per dare supporto mirato.
create table if not exists public.pause_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('vacation', 'forced_rest')),
  start_date  date not null,
  end_date    date not null,
  reason      text,
  note        text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_pause_periods_user on public.pause_periods(user_id, start_date desc);

alter table public.pause_periods enable row level security;
alter table public.pause_periods force row level security;

drop policy if exists "pause_periods_select" on public.pause_periods;
create policy "pause_periods_select" on public.pause_periods for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "pause_periods_insert" on public.pause_periods;
create policy "pause_periods_insert" on public.pause_periods for insert
  with check ( user_id = auth.uid() or public.is_coach() );

grant select, insert on public.pause_periods to authenticated;
