-- =====================================================================
-- PERFORM — Schema v21 (aggiunta): rir_target su workout_logs
-- Script idempotente.
-- =====================================================================

-- RIR target prescritto dal coach per un esercizio: testo libero (non un
-- numero) perché deve accettare sia "1"/"2"/"3"/"4" sia "A cedimento" — non
-- è un valore numerico puro, stesso motivo per cui reps_target (SCHEMA_v17)
-- è testo e non un range numerico. Distinto da `rir`, che resta l'RIR
-- REALMENTE svolto dal cliente (colonna già esistente, mai da confondere).
alter table public.workout_logs add column if not exists rir_target text;
