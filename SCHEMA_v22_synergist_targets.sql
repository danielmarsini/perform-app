-- =====================================================================
-- PERFORM — Schema v22 (aggiunta): synergist_targets su workout_logs
-- Script idempotente.
-- =====================================================================

-- Muscoli sinergici/secondari di un esercizio (solo per esercizi CUSTOM,
-- scelti dal coach nell'editor): array di testo con gli stessi valori
-- ammessi da muscle_target (nessun check constraint qui perché un array
-- vuoto o null è il caso normale — la maggior parte degli esercizi non ha
-- sinergici scelti). Usato per il volume INDIRETTO (0.5 serie) nel grafico
-- volumi settimanali, esattamente come EXERCISE_LIB.indirect fa già per gli
-- esercizi di libreria.
alter table public.workout_logs add column if not exists synergist_targets text[];
