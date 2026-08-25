-- PERFORM — SCHEMA_v69_referral_activity_check.sql
-- ============================================================================
-- Rafforza l'anti-frode del referral automatico (SCHEMA_v67): prima bastava
-- un'email verificata a contare verso il premio — un furbetto poteva creare
-- account con varianti "+1"/"+2" della stessa email Gmail (arrivano tutte
-- nella stessa casella, verificabili in autonomia) e ottenere comunque il
-- premio con IP diversi (dati mobili, VPN). Ora conta solo chi ha email
-- verificata E ha davvero usato l'app almeno una volta (un allenamento
-- registrato, un pasto nel diario, o una misura giornaliera) — un account
-- creato solo per il premio, mai più aperto, non vale più nulla.
--
-- Aggiunge anche il tetto massimo: 3 mesi Premium per referrer, anche se
-- porta più di 9 amici (richiesta esplicita del coach).
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.referral_signups add column if not exists has_activity boolean not null default false;

-- Il progresso mostrato al cliente (ReferralCodeCard) deve riflettere lo
-- stesso criterio usato davvero per il premio (process-referral-rewards):
-- email verificata E attività reale, non solo email verificata.
create or replace function public.referral_progress()
returns table(verified_count int, rewards_granted int)
language sql security definer set search_path = public
as $$
  select
    (select count(distinct ip_address) from public.referral_signups
     where referrer_id = auth.uid() and email_verified = true and has_activity = true and ip_address is not null)::int,
    coalesce((select referral_rewards_granted from public.profiles where id = auth.uid()), 0)::int;
$$;
