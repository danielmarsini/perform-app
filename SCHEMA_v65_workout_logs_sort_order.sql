-- PERFORM — SCHEMA_v65_workout_logs_sort_order.sql
-- ============================================================================
-- Feature: drag-to-reorder degli esercizi nella scheda assegnata dal coach
-- (WeekWorkoutEditor, 09_CoachDashboard.jsx). L'ordine con cui gli esercizi
-- comparivano prima d'ora era dedotto da created_at — corretto finché non si
-- riordinava mai nulla, ma un riordino a trascinamento non cambia QUANDO una
-- riga è stata creata, quindi created_at non può rappresentarlo.
--
-- Aggiunge workout_logs.sort_order (intero, nullable): la posizione
-- dell'esercizio nel giorno, scritta da saveWeekWorkout a ogni salvataggio
-- (src/lib/coachingData.js) nell'ordine dell'array locale — che il coach può
-- riordinare trascinando. fetchWeekWorkout e fetchAssignedWorkouts (lo stesso
-- file) ora ordinano per sort_order, con created_at come fallback per righe
-- non ancora backfillate.
--
-- Backfill idempotente: assegna sort_order alle righe esistenti (oggi tutte
-- NULL) usando l'ordine attuale per created_at all'interno di ogni giorno —
-- cioè l'ordine già visto finora, quindi nessun riordino visibile subito dopo
-- l'esecuzione. Tocca solo le righe con sort_order ancora NULL: rieseguibile
-- in sicurezza, non sovrascrive un ordine già scelto dal coach.
--
-- Da eseguire in Supabase SQL Editor.

alter table public.workout_logs add column if not exists sort_order integer;

with numbered as (
  select id, row_number() over (partition by user_id, date order by created_at asc) - 1 as rn
  from public.workout_logs
  where sort_order is null
)
update public.workout_logs w
set sort_order = numbered.rn
from numbered
where w.id = numbered.id;

create index if not exists idx_workout_logs_sort on public.workout_logs(user_id, date, sort_order);
