-- =====================================================================
-- PERFORM — Schema v26 (nuova tabella): push_subscriptions
-- Script idempotente.
-- =====================================================================

-- Una riga per dispositivo/browser abbonato alle notifiche push (Web Push
-- standard: endpoint + due chiavi di cifratura, niente token proprietario
-- di un vendor). Un utente può avere più righe se attiva le notifiche da
-- più dispositivi. `last_reminder_date` evita di mandare due promemoria
-- streak nello stesso giorno se il job schedulato gira più di una volta.
create table if not exists public.push_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  endpoint           text not null unique,
  p256dh             text not null,
  auth_key           text not null,
  last_reminder_date date,
  created_at         timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

-- Sola gestione dei PROPRI abbonamenti dal client (attiva/disattiva dalle
-- Impostazioni). Il job schedulato che invia i push legge con la
-- service_role key da una Edge Function, che bypassa RLS: non serve una
-- policy select "per il coach" o simili qui.
drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select" on public.push_subscriptions for select
  using ( user_id = auth.uid() );

drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
create policy "push_subscriptions_insert" on public.push_subscriptions for insert
  with check ( user_id = auth.uid() );

drop policy if exists "push_subscriptions_delete" on public.push_subscriptions;
create policy "push_subscriptions_delete" on public.push_subscriptions for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.push_subscriptions to authenticated;
