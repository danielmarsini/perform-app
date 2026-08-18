-- =====================================================================
-- PERFORM — Schema v37: whitelist coach (bypass Stripe + bypass anamnesi)
-- Script idempotente.
-- =====================================================================
--
-- Per persone che il coach conosce di persona e a cui vuole dare accesso
-- pieno senza pagamento reale (es. promo "3 mesi gratis"): whitelisted_until
-- è la data precisa di scadenza calcolata da whitelistClient (coachingData.js)
-- al momento dell'attivazione. Un cron giornaliero (expire-whitelists,
-- SCHEMA_v37) riporta il piano a "free" superata quella data — MAI se il
-- cliente ha nel frattempo un abbonamento Stripe reale (stripe-webhook
-- azzera whitelisted_until non appena arriva un pagamento vero, così non
-- viene mai declassato un cliente che nel frattempo paga davvero).
alter table public.profiles add column if not exists whitelisted_until timestamptz;

create index if not exists idx_profiles_whitelisted_until on public.profiles(whitelisted_until) where whitelisted_until is not null;
