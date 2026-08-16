-- =====================================================================
-- PERFORM — Schema v31: collegamento pagamenti Stripe
-- Script idempotente.
-- =====================================================================

-- ID cliente Stripe (cus_...) associato a questo profilo — creato la prima
-- volta che l'utente avvia un checkout (create-checkout-session), poi
-- riusato per ogni acquisto/abbonamento successivo così Stripe li vede
-- come lo stesso cliente invece di crearne uno nuovo ogni volta.
alter table public.profiles add column if not exists stripe_customer_id text;

-- Registro degli eventi webhook Stripe già elaborati: Stripe può ripetere
-- la spedizione dello stesso evento (timeout, riavvio, ecc.) — controllando
-- questa tabella prima di aggiornare profiles evitiamo un doppio
-- aggiornamento (es. due volte "active" non fa danno, ma è comunque scorretto
-- trattare due volte lo stesso pagamento come due eventi distinti).
create table if not exists public.stripe_webhook_events (
  id           text primary key,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;
-- Nessuna policy: la tabella la tocca solo la Edge Function stripe-webhook,
-- che usa la service_role e bypassa RLS. Nessun utente, coach incluso, deve
-- poterla leggere o scrivere direttamente.
