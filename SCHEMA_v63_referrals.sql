-- PERFORM — SCHEMA_v63_referrals.sql
-- ============================================================================
-- §08 memo "Verso l'élite" (Il business dietro l'app): programma referral —
-- "un mese gratis a chi porta un amico, un mese gratis a chi arriva". Nessuna
-- automazione Stripe qui (richiederebbe nuovi prezzi creati dalla dashboard
-- Stripe, non disponibile in questo ambiente): questa migrazione costruisce
-- solo il TRACCIAMENTO (chi ha invitato chi) — il premio (mese gratis) lo
-- applica il coach a mano, riusando il meccanismo whitelist già esistente
-- (whitelistClient, SCHEMA_v37), con piena visibilità su chi l'ha guadagnato.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);

-- Risolve un codice invito nell'id del profilo proprietario, SENZA esporre
-- nome/email/altri dati del proprietario a chi lo digita (mai una query
-- diretta su profiles filtrata per referral_code lato client: le RLS di
-- profiles restano "solo la tua riga", questa funzione è l'unica porta
-- stretta e mirata per il caso d'uso "verifica se questo codice esiste").
-- security definer: gira con i permessi del proprietario della funzione,
-- non del chiamante — l'unico modo per leggere un'altra riga senza aprire
-- l'intera tabella in lettura a chiunque.
create or replace function public.resolve_referral_code(code text)
returns uuid
language sql security definer set search_path = public
as $$
  select id from public.profiles where referral_code = upper(trim(code)) limit 1;
$$;

grant execute on function public.resolve_referral_code(text) to authenticated;
