-- PERFORM — SCHEMA_v59_workout_templates.sql
-- ============================================================================
-- Template di allenamento riutilizzabili: il coach salva una settimana già
-- costruita (Push/Pull/Legs, Upper/Lower, ecc.) con un nome, e la riapplica
-- in un click a QUALUNQUE cliente e QUALUNQUE settimana — a differenza di
-- "Clona Settimana" (già esistente), che clona solo tra settimane dello
-- STESSO cliente.
--
-- `days` ha la stessa identica forma dell'array passato a saveWeekWorkout
-- (coachingData.js): 7 elementi Lun→Dom, ognuno null (riposo) oppure
-- { label, exercises: [{ name, muscleTarget, synergists, sets, reps, rest,
-- rirTarget, technique }] } — già risolto (muscleTarget/synergists
-- compilati) al momento del salvataggio del template, così applicarlo non
-- dipende dalla libreria esercizi di un cliente specifico.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  days jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists workout_templates_coach_idx
  on public.workout_templates (coach_id, created_at desc);

alter table public.workout_templates enable row level security;

drop policy if exists "workout_templates_select" on public.workout_templates;
create policy "workout_templates_select" on public.workout_templates for select
  using ( public.is_coach() );

drop policy if exists "workout_templates_insert" on public.workout_templates;
create policy "workout_templates_insert" on public.workout_templates for insert
  with check ( public.is_coach() and coach_id = auth.uid() );

drop policy if exists "workout_templates_delete" on public.workout_templates;
create policy "workout_templates_delete" on public.workout_templates for delete
  using ( public.is_coach() and coach_id = auth.uid() );

grant select, insert, delete on public.workout_templates to authenticated;
