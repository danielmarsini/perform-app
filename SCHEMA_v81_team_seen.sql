-- =====================================================================
-- PERFORM — Schema v81: pallino "novità" sul tab News per Avvisi Team
-- =====================================================================
--
-- Stesso principio già usato altrove (last_seen_announcements_at, ora
-- ritirato, e le colonne *_seen_at di SCHEMA_v80): un timestamp di "ultima
-- visita" del cliente al canale Avvisi Team, confrontato con la data del
-- post più recente in quel canale — se il post è più recente dell'ultima
-- visita, il tab News mostra un pallino rosso.
--
-- Script idempotente.

alter table public.profiles add column if not exists team_seen_at timestamptz;
