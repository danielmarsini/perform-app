-- =====================================================================
-- PERFORM — Schema v33: tracciamento consumo AI (budget mensile per utente)
-- Script idempotente.
-- =====================================================================

-- Un totale per utente per mese (formato 'YYYY-MM', stesso pattern di
-- monthly_xp_snapshots) — le Edge Function ask-perform-ai/generate-plan lo
-- leggono PRIMA di ogni chiamata a Claude per applicare il tetto di spesa
-- (1$ mese per i clienti paganti, un tetto più alto di sicurezza per il
-- coach), e lo aggiornano DOPO ogni chiamata coi token realmente usati
-- (response.usage), mai una stima — così il tetto è sempre accurato.
create table if not exists public.ai_usage_monthly (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  month      text not null,
  cost_usd   numeric not null default 0,
  requests   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.ai_usage_monthly enable row level security;
alter table public.ai_usage_monthly force row level security;
-- Nessuna policy: la tabella la tocca solo la Edge Function (service_role).
grant select, insert, update on public.ai_usage_monthly to service_role;
