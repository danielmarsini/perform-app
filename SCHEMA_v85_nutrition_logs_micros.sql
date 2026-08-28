-- =====================================================================
-- PERFORM — Schema v85: micronutrienti su nutrition_logs
-- Script idempotente.
-- =====================================================================

-- BUG PRESO: il diario alimentare (Home cliente) calcola i totali di
-- sodio/potassio/ferro/calcio/magnesio del giorno sommando i campi na/k/fe/
-- ca/mg di ogni voce già in nutrition_logs (computeMicroTotals,
-- 05_HomeDashboard.jsx) — ma la tabella non ha MAI avuto le colonne per
-- salvarli (SCHEMA_v41 l'ha ricreata senza, vedi commento lì). Il coach
-- vedeva i micronutrienti calcolati correttamente SOLO nella stessa
-- sessione in cui aggiungeva un alimento (lo stato React locale li aveva
-- ancora), ma ogni ricarica (giorno dopo, nuova sessione) li rileggeva
-- sempre a 0/non calcolati, qualunque cosa fosse stata davvero registrata
-- — esattamente il sintomo segnalato. custom_foods (SCHEMA_v43) ha già
-- queste colonne per il catalogo alimenti condiviso: stessi nomi qui, per
-- coerenza.
alter table public.nutrition_logs
  add column if not exists sodium_mg    numeric(7,2),
  add column if not exists potassium_mg numeric(7,2),
  add column if not exists iron_mg      numeric(6,2),
  add column if not exists calcium_mg   numeric(7,2),
  add column if not exists magnesium_mg numeric(7,2);
