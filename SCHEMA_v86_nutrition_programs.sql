-- =====================================================================
-- PERFORM — Schema v86 (nuova tabella): nutrition_programs
-- Script idempotente.
-- =====================================================================

-- "Calendario mesociclo" per l'alimentazione (editor coach, sezione
-- Alimentazione): a differenza di nutrition_targets (log a tempo
-- indeterminato — l'ultima riga con effective_from <= oggi resta valida per
-- sempre finché non ne arriva una più recente, senza un vero concetto di
-- "fine"), qui il coach programma i target ON/OFF su un intervallo di date
-- PRECISO. Superata end_date la programmazione termina davvero — il target
-- torna "non impostato" invece di restare valido all'infinito. Se nessun
-- programma copre la data richiesta, fetchBothNutritionTargets (coachingData.js)
-- ripiega sul vecchio nutrition_targets, per i clienti impostati prima di
-- questa feature.
create table if not exists public.nutrition_programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  coach_id     uuid references public.profiles(id),
  start_date   date not null,
  end_date     date not null,
  on_kcal      numeric(7,2) not null default 0,
  on_protein   numeric(6,2) not null default 0,
  on_carbs     numeric(6,2) not null default 0,
  on_fat       numeric(6,2) not null default 0,
  off_kcal     numeric(7,2) not null default 0,
  off_protein  numeric(6,2) not null default 0,
  off_carbs    numeric(6,2) not null default 0,
  off_fat      numeric(6,2) not null default 0,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_nutrition_programs_user_dates
  on public.nutrition_programs(user_id, start_date, end_date);

alter table public.nutrition_programs enable row level security;
alter table public.nutrition_programs force row level security;

-- Stesso schema RLS di diet_plans (SCHEMA_v83): il cliente vede la propria
-- programmazione in sola lettura, solo il coach la scrive.
drop policy if exists "nutrition_programs_select" on public.nutrition_programs;
create policy "nutrition_programs_select" on public.nutrition_programs for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "nutrition_programs_insert" on public.nutrition_programs;
create policy "nutrition_programs_insert" on public.nutrition_programs for insert
  with check ( public.is_coach() );

drop policy if exists "nutrition_programs_update" on public.nutrition_programs;
create policy "nutrition_programs_update" on public.nutrition_programs for update
  using ( public.is_coach() )
  with check ( public.is_coach() );

drop policy if exists "nutrition_programs_delete" on public.nutrition_programs;
create policy "nutrition_programs_delete" on public.nutrition_programs for delete
  using ( public.is_coach() );

grant select, insert, update, delete on public.nutrition_programs to authenticated;
