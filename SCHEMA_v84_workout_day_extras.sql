-- =====================================================================
-- PERFORM — Schema v84: riscaldamento/mobilità, stretching, cardio-come-esercizio
-- Script idempotente.
-- =====================================================================

-- Riscaldamento & mobilità (prima della sessione) e stretching (a fine
-- sessione), testo libero per giorno — non tracciati con serie/carichi come
-- gli esercizi di forza, solo da leggere. Il generatore AI li scrive sempre
-- in base agli esercizi assegnati quel giorno (generate-workout-week);
-- il coach può comunque scriverli/modificarli a mano in WeekWorkoutEditor.
-- Tabella separata (non colonne su workout_logs) perché sono un dato per
-- GIORNO, non per esercizio — mettendoli su workout_logs si duplicherebbero
-- su ogni riga esercizio di quel giorno, come già succede per split_label
-- ma qui sarebbe un blocco di testo, non un'etichetta breve.
create table if not exists public.workout_day_notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  coach_id        uuid references public.profiles(id),
  date            date not null,
  warmup_text     text,
  stretching_text text,
  updated_at      timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_workout_day_notes_user on public.workout_day_notes(user_id, date);

alter table public.workout_day_notes enable row level security;
alter table public.workout_day_notes force row level security;

-- Stesso schema RLS di prescribed_supplements/diet_plans: il cliente legge,
-- solo il coach scrive.
drop policy if exists "workout_day_notes_select" on public.workout_day_notes;
create policy "workout_day_notes_select" on public.workout_day_notes for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "workout_day_notes_insert" on public.workout_day_notes;
create policy "workout_day_notes_insert" on public.workout_day_notes for insert
  with check ( public.is_coach() );

drop policy if exists "workout_day_notes_update" on public.workout_day_notes;
create policy "workout_day_notes_update" on public.workout_day_notes for update
  using ( public.is_coach() )
  with check ( public.is_coach() );

drop policy if exists "workout_day_notes_delete" on public.workout_day_notes;
create policy "workout_day_notes_delete" on public.workout_day_notes for delete
  using ( public.is_coach() );

grant select, insert, update, delete on public.workout_day_notes to authenticated;

-- Cardio inserito dal coach come una voce in più nell'elenco esercizi del
-- giorno (mai generato dall'AI, mai serie/carichi da monitorare — solo
-- nome + minuti). `kind` distingue le righe strength (comportamento
-- odierno, invariato) dalle righe cardio; per queste ultime i campi
-- prescrittivi di forza restano null (muscle_target/sets_count resi
-- nullable qui sotto — erano NOT NULL implicito dato che ogni riga scritta
-- finora era sempre un esercizio di forza).
alter table public.workout_logs add column if not exists kind text not null default 'strength';
alter table public.workout_logs drop constraint if exists workout_logs_kind_check;
alter table public.workout_logs add constraint workout_logs_kind_check check (kind in ('strength', 'cardio'));
alter table public.workout_logs add column if not exists duration_min integer;
alter table public.workout_logs alter column muscle_target drop not null;
alter table public.workout_logs alter column sets_count drop not null;
