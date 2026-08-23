-- PERFORM — SCHEMA_v58_streak_freeze.sql
-- ============================================================================
-- "Streak freeze": un giorno che l'atleta marca da solo come "congelato" non
-- rompe lo streak, anche se quel giorno non registra allenamento/dieta/sonno.
-- Disponibile a TUTTI i piani (non un pause_periods concordato col coach,
-- che resta un'altra cosa e resta riservato a chi ha un coach) — massimo 2
-- congelamenti ogni 30 giorni, verificato lato client prima dell'insert.
--
-- Una riga = un giorno congelato, per utente. isDayComplete (coachingData.js,
-- computeRealXpAndStreak) tratta una data qui presente come "completa" allo
-- stesso modo di un giorno di pausa.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.streak_freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists streak_freezes_user_date_idx
  on public.streak_freezes (user_id, date);

alter table public.streak_freezes enable row level security;

drop policy if exists "streak_freezes_select" on public.streak_freezes;
create policy "streak_freezes_select" on public.streak_freezes for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "streak_freezes_insert" on public.streak_freezes;
create policy "streak_freezes_insert" on public.streak_freezes for insert
  with check ( user_id = auth.uid() );

grant select, insert on public.streak_freezes to authenticated;
