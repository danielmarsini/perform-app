-- =====================================================================
-- PERFORM — Schema v80: "novità" per sezione (Allenamento/Alimentazione/
-- Integrazione) quando il coach aggiorna il piano di un cliente
-- =====================================================================
--
-- Stesso principio di last_seen_announcements_at (ora ritirato): un
-- timestamp di "ultimo aggiornamento del coach" per sezione, confrontato
-- con un timestamp di "ultima visita del cliente" per la stessa sezione —
-- se il primo è più recente del secondo, la Home mostra il pallino rosso
-- pulsante su quella sezione. Recupero resta fuori (non richiesto): solo
-- Allenamento/Alimentazione/Integrazione, le 3 sezioni che il coach può
-- davvero modificare.
--
-- Script idempotente.

alter table public.profiles add column if not exists workout_updated_at timestamptz;
alter table public.profiles add column if not exists nutrition_updated_at timestamptz;
alter table public.profiles add column if not exists supplements_updated_at timestamptz;
alter table public.profiles add column if not exists workout_seen_at timestamptz;
alter table public.profiles add column if not exists nutrition_seen_at timestamptz;
alter table public.profiles add column if not exists supplements_seen_at timestamptz;
