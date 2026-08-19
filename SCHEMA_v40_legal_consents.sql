-- =====================================================================
-- PERFORM — Schema v40: consensi legali (mai creata, salvataggio silenzioso)
-- Script idempotente.
-- =====================================================================
--
-- BUG CRITICO TROVATO ispezionando il database in produzione: la tabella
-- legal_consents non esisteva — saveConsents (03_AuthView.jsx, chiamata
-- ad ogni registrazione) falliva SEMPRE, silenziosamente: l'errore è
-- avvolto in un try/catch vuoto ("ritentato al primo accesso", ma nessun
-- retry esiste davvero). Nessun consenso GDPR/esonero medico/community di
-- NESSUN utente è mai stato registrato da quando esiste questa funzione.
-- Trovata mentre si costruiva "Scarica i miei dati" (SettingsDrawer):
-- fetchLegalConsents tornava sempre vuoto, non per un bug del fetch ma
-- perché non c'era mai stato nulla da leggere.
create table if not exists public.legal_consents (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  gdpr_data        boolean not null default false,
  medical_waiver   boolean not null default false,
  community_direct boolean not null default false,
  birth_date       date,
  accepted_at      timestamptz not null default now(),
  user_agent       text,
  policy_version   text
);

alter table public.legal_consents enable row level security;
alter table public.legal_consents force row level security;

-- Ognuno legge/scrive SOLO il proprio consenso — il coach non ha bisogno
-- di leggere i consensi altrui per operare, restano privati.
drop policy if exists "legal_consents_select_own" on public.legal_consents;
create policy "legal_consents_select_own" on public.legal_consents for select
  using ( user_id = auth.uid() );

drop policy if exists "legal_consents_upsert_own" on public.legal_consents;
create policy "legal_consents_upsert_own" on public.legal_consents for insert
  with check ( user_id = auth.uid() );

drop policy if exists "legal_consents_update_own" on public.legal_consents;
create policy "legal_consents_update_own" on public.legal_consents for update
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

grant select, insert, update on public.legal_consents to authenticated;
