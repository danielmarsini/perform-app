-- =====================================================================
-- PERFORM — Schema v23 (nuova tabella): xp_bonuses
-- Script idempotente.
-- =====================================================================

-- Bonus XP manuali assegnati dal coach (es. "Obiettivo di mesociclo
-- raggiunto"). L'XP "di base" (serie svolte, pasti/sonno/passi registrati,
-- streak) si ricalcola SEMPRE dai dati reali (computeRealXpAndStreak in
-- coachingData.js) — questa tabella copre solo il pezzo che non può derivare
-- da un log automatico: un giudizio del coach. Sola INSERT dal coach: un
-- cliente non deve potersi assegnare XP da solo.
create table if not exists public.xp_bonuses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      integer not null,
  reason      text,
  awarded_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_xp_bonuses_user on public.xp_bonuses(user_id);

alter table public.xp_bonuses enable row level security;
alter table public.xp_bonuses force row level security;

drop policy if exists "xp_bonuses_select" on public.xp_bonuses;
create policy "xp_bonuses_select" on public.xp_bonuses for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "xp_bonuses_insert" on public.xp_bonuses;
create policy "xp_bonuses_insert" on public.xp_bonuses for insert
  with check ( public.is_coach() );

grant select, insert on public.xp_bonuses to authenticated;
