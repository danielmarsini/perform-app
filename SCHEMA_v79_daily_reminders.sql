-- =====================================================================
-- PERFORM — Schema v79: colonne di dedup per i promemoria passi/sonno
-- =====================================================================
--
-- Stesso pattern di push_subscriptions.last_reminder_date (già usato da
-- streak-reminder): un cron che gira più volte al giorno (ogni 15 minuti,
-- vedi istruzioni di deploy della Edge Function daily-reminders) non deve
-- mandare due volte lo stesso promemoria nello stesso giorno — colonne
-- separate da last_reminder_date perché sono due promemoria diversi, in
-- momenti diversi della giornata, su dati diversi (passi vs sonno).
--
-- Script idempotente.

alter table public.push_subscriptions add column if not exists last_steps_reminder_date date;
alter table public.push_subscriptions add column if not exists last_sleep_reminder_date date;
