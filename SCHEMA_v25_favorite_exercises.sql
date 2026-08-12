-- =====================================================================
-- PERFORM — Schema v25 (aggiunta): favorite_exercises su profiles
-- Script idempotente.
-- =====================================================================

-- Preferiti di "I Miei Traguardi" (profilo cliente): array di exercise_name.
-- Stessa tabella/pattern di xp_total/current_streak (self-update via RLS
-- già esistente su profiles) invece di una tabella dedicata: è solo una
-- lista di stringhe per utente, non serve altro.
alter table public.profiles add column if not exists favorite_exercises text[];
