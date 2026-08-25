-- PERFORM — SCHEMA_v67_referral_automation.sql
-- ============================================================================
-- Automatizza il premio referral (SCHEMA_v63): prima il coach applicava un
-- mese gratis a mano dopo aver notato una conversione; ora il premio (1 mese
-- Premium) scatta da solo quando il codice di un utente porta 3 amici con
-- email verificata E indirizzo IP distinto — il secondo requisito impedisce
-- che la stessa persona si auto-inviti con 3 email diverse dallo stesso
-- dispositivo/rete per ottenere il premio da sola.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

-- Una riga per ogni iscrizione arrivata da un codice invito: chi ha
-- invitato, chi si è iscritto, da quale IP, ed è passata la verifica email.
-- referred_user_id è UNIQUE: ogni persona può essere "portata" da un solo
-- referrer, non conta due volte se il codice viene applicato più volte.
create table if not exists public.referral_signups (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  ip_address text,
  email_verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_signups_referrer on public.referral_signups(referrer_id);

-- Nessuna policy per "authenticated": la tabella contiene IP altrui, la
-- scrivono solo le Edge Function (service role, bypassa comunque le RLS) —
-- un utente legge il proprio progresso tramite la funzione sottostante, mai
-- una query diretta sulla tabella.
alter table public.referral_signups enable row level security;
alter table public.referral_signups force row level security;

-- Quanti mesi premio ha già ricevuto ogni referrer: evita di ri-applicare lo
-- stesso premio ad ogni corsa del cron una volta raggiunta la soglia di 3.
alter table public.profiles add column if not exists referral_rewards_granted integer not null default 0;

-- Il proprio progresso (mai i dati grezzi degli amici invitati, es. il loro
-- IP): quanti referral verificati con IP distinto ha accumulato l'utente
-- corrente, e quanti mesi premio ha già ricevuto — per mostrare "2 su 3" in
-- ReferralCodeCard senza esporre la tabella referral_signups in lettura.
create or replace function public.referral_progress()
returns table(verified_count int, rewards_granted int)
language sql security definer set search_path = public
as $$
  select
    (select count(distinct ip_address) from public.referral_signups
     where referrer_id = auth.uid() and email_verified = true and ip_address is not null)::int,
    coalesce((select referral_rewards_granted from public.profiles where id = auth.uid()), 0)::int;
$$;

grant execute on function public.referral_progress() to authenticated;
