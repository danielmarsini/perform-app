-- PERFORM — SCHEMA_v68_scheda_addon.sql
-- ============================================================================
-- Scheda Personalizzata diventa un add-on acquistabile SOPRA il piano base
-- (Free o Premium) invece di sostituirlo: un cliente Free che la compra
-- ottiene chat col coach per 2 settimane + un programma di 8 settimane, ma
-- resta Free a tutti gli effetti — nessuna funzionalità Premium sbloccata di
-- riflesso. Due colonne indipendenti da profiles.plan, mai scritte insieme
-- ad esso (vedi stripe-webhook): la scadenza della chat decide l'accesso
-- (hasCoachChat, App.jsx/05_HomeDashboard.jsx), la scadenza del programma è
-- solo informativa (il coach assegna comunque gli allenamenti da
-- WeekWorkoutEditor a prescindere dal piano del cliente, nessun gate lì).
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.profiles add column if not exists scheda_addon_chat_until timestamptz;
alter table public.profiles add column if not exists scheda_addon_program_until timestamptz;
