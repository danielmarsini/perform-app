-- =====================================================================
-- PERFORM — Schema v43: database alimenti collettivo (stile MyFitnessPal)
-- Script idempotente.
-- =====================================================================
--
-- Un alimento inserito manualmente da un cliente (nome non trovato nel
-- catalogo statico) restava prima solo nello state locale del browser —
-- perso al refresh e mai visto da nessun altro cliente. Ora, come la
-- libreria esercizi collettiva (SCHEMA_v39), ogni alimento nuovo arricchisce
-- un catalogo condiviso reale: chi lo cerca dopo lo trova già pronto.
create table if not exists public.custom_foods (
  name       text primary key,
  kcal       numeric(7,2) not null default 0,
  protein    numeric(6,2) not null default 0,
  carbs      numeric(6,2) not null default 0,
  fat        numeric(6,2) not null default 0,
  sodium_mg  numeric(7,2),
  potassium_mg numeric(7,2),
  iron_mg    numeric(6,2),
  calcium_mg numeric(7,2),
  magnesium_mg numeric(7,2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.custom_foods enable row level security;
alter table public.custom_foods force row level security;

-- Catalogo condiviso: leggibile da chiunque abbia effettuato l'accesso.
drop policy if exists "custom_foods_select" on public.custom_foods;
create policy "custom_foods_select" on public.custom_foods for select
  to authenticated using ( true );

-- Chiunque può contribuire un alimento nuovo — mai sovrascrivere una voce
-- già presente (on conflict do nothing lato applicazione), così un valore
-- corretto non viene mai rovinato da un secondo inserimento incoerente.
drop policy if exists "custom_foods_insert" on public.custom_foods;
create policy "custom_foods_insert" on public.custom_foods for insert
  to authenticated with check ( true );

grant select, insert on public.custom_foods to authenticated;
