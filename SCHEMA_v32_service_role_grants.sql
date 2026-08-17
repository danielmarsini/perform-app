-- =====================================================================
-- PERFORM — Schema v32: grant privilegi a service_role su profiles e
-- stripe_webhook_events
-- Script idempotente.
-- =====================================================================

-- Le Edge Function stripe-webhook/create-checkout-session scrivono con la
-- service role. BYPASSRLS esenta dalle policy di row-level security ma è
-- un sistema SEPARATO dai permessi SQL classici (GRANT) a livello di
-- tabella — in questo progetto mancavano, causando "42501 insufficient
-- privilege" al primo vero pagamento di prova (sia sull'update di
-- profiles.plan che sull'insert di idempotenza in stripe_webhook_events).
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
