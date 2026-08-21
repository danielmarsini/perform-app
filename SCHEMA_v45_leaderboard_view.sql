-- =====================================================================
-- PERFORM — Schema v45: la Classifica non vedeva nessun altro atleta
-- Script idempotente.
-- =====================================================================
--
-- BUG PRESO: fetchMonthlyLeaderboard (coachingData.js) legge public.profiles
-- direttamente. La RLS su profiles (schema v?) è "id = auth.uid() OR
-- is_coach()" — corretta per proteggere email/piano/stripe_customer_id/
-- client_status/whitelisted_until, MA significa che un cliente normale
-- (non il coach) interrogando profiles vede SOLO la propria riga: la
-- classifica risultava sempre vuota (o con un solo atleta, se stesso) per
-- chiunque non fosse il coach — esattamente il sintomo segnalato ("non fa
-- vedere tutti gli utenti online in classifica").
--
-- Fix: una VIEW che espone SOLO le colonne davvero pubbliche per la
-- classifica (nickname, xp, streak, avatar, bio) — mai email/piano/
-- stripe/whitelist — leggibile da qualsiasi utente autenticato. Le view
-- Postgres girano di default con i privilegi di chi le CREA (non di chi le
-- interroga), quindi bypassano la RLS restrittiva della tabella sorgente:
-- è il modo standard per "vetrina pubblica da una tabella privata".
create or replace view public.leaderboard_profiles as
select id, nickname, full_name, xp_total, current_streak, longest_streak, avatar_url, bio, role
from public.profiles;

grant select on public.leaderboard_profiles to authenticated;
