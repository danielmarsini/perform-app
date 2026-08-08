-- =====================================================================
-- PERFORM — Schema v13 (aggiunta): workout_sets
-- Storico completo di ogni singola serie svolta, non solo l'ultima.
-- Script idempotente.
-- =====================================================================

create table if not exists public.workout_sets (
  id              uuid primary key default gen_random_uuid(),
  workout_log_id  uuid not null references public.workout_logs(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  set_number      smallint not null check (set_number >= 1),
  reps_completed  smallint check (reps_completed >= 0),
  load_kg         numeric(6,2),
  rir             smallint check (rir between 0 and 10),
  completed_at    timestamptz not null default now(),
  unique (workout_log_id, set_number)
);

create index if not exists idx_workout_sets_log on public.workout_sets(workout_log_id, set_number);
create index if not exists idx_workout_sets_user on public.workout_sets(user_id, completed_at desc);

alter table public.workout_sets enable row level security;
alter table public.workout_sets force row level security;

drop policy if exists "workout_sets_select" on public.workout_sets;
create policy "workout_sets_select" on public.workout_sets for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "workout_sets_insert" on public.workout_sets;
create policy "workout_sets_insert" on public.workout_sets for insert
  with check ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "workout_sets_update" on public.workout_sets;
create policy "workout_sets_update" on public.workout_sets for update
  using ( user_id = auth.uid() or public.is_coach() )
  with check ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "workout_sets_delete" on public.workout_sets;
create policy "workout_sets_delete" on public.workout_sets for delete
  using ( user_id = auth.uid() or public.is_coach() );

grant select, insert, update, delete on public.workout_sets to authenticated;
