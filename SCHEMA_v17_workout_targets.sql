-- =====================================================================
-- PERFORM — Schema v17 (aggiunta): reps_target e rest_seconds su workout_logs
-- Script idempotente.
-- =====================================================================

-- Prescrizione del coach per ogni esercizio assegnato: intervallo di
-- ripetizioni target (es. "8-10" — testo libero perché può essere un range,
-- un AMRAP, "fino al cedimento"...) e secondi di recupero tra le serie.
-- Nessun default: le righe già esistenti restano NULL finché il coach non
-- le riassegna da WeekWorkoutEditor (09_CoachDashboard.jsx) — non è un dato
-- che si può inventare a posteriori.
alter table public.workout_logs add column if not exists reps_target text;
alter table public.workout_logs add column if not exists rest_seconds integer;
