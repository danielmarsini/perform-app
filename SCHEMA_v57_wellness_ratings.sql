-- PERFORM — SCHEMA_v57_wellness_ratings.sql
-- ============================================================================
-- Tre nuove valutazioni soggettive giornaliere, TUTTE disponibili a qualunque
-- piano (Free/Performance Pack/Scheda Personalizzata/Training/Full Coaching),
-- non solo a chi ha un coach — l'utente le vede e le compila da solo nel suo
-- Profilo privato, il coach le legge in sola lettura per incrociarle con
-- sonno/passi/HRV/RHR già presenti nella stessa tabella e decidere refeed o
-- deload "non a caso":
--
-- - digestion  (1-10, 10 = ottima): sostituisce il vecchio check-in
--   "Digestione / Gonfiore" a emoji (1-5) di fine Diario Libero
--   (Alimentazione), che era solo stato locale React, mai scritto su
--   Supabase — spariva a ogni refresh.
-- - motivation (1-10, 10 = ottima): chiesto in fondo alla sessione di
--   allenamento di oggi.
-- - fatigue    (1-10, 1 = ottima, 10 = pessima — scala invertita rispetto
--   alle altre due, stessa convenzione già usata per "Dolori/fastidi" e
--   "Stress percepito" nel check settimanale): chiesto insieme a motivation.
--
-- Stessa tabella daily_metrics (un giorno = una riga per utente, già usata
-- per sonno/passi/HRV/RHR) invece di tabelle nuove: stesso RLS già collaudato
-- (select: proprietario o coach; insert/update: proprietario o coach), stessa
-- cadenza "un giorno = una riga", nessuna migrazione aggiuntiva per il coach
-- panel quando dovrà leggerle nei grafici trend.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.daily_metrics
  add column if not exists digestion  smallint,
  add column if not exists motivation smallint,
  add column if not exists fatigue    smallint;

alter table public.daily_metrics drop constraint if exists daily_metrics_digestion_range;
alter table public.daily_metrics add constraint daily_metrics_digestion_range
  check (digestion is null or (digestion between 1 and 10));

alter table public.daily_metrics drop constraint if exists daily_metrics_motivation_range;
alter table public.daily_metrics add constraint daily_metrics_motivation_range
  check (motivation is null or (motivation between 1 and 10));

alter table public.daily_metrics drop constraint if exists daily_metrics_fatigue_range;
alter table public.daily_metrics add constraint daily_metrics_fatigue_range
  check (fatigue is null or (fatigue between 1 and 10));
