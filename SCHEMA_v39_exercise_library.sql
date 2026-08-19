-- =====================================================================
-- PERFORM — Schema v39: libreria esercizi condivisa (collettiva)
-- Script idempotente.
-- =====================================================================
--
-- BUG TROVATO: il grafico volume per gruppo muscolare lato coach (Hub
-- Atleti) e quello lato cliente (Matrice dei Volumi) usavano DUE calcoli
-- completamente diversi e scollegati — il coach legge EXERCISE_LIB (una
-- mappa statica nel codice) + i muscoli scelti a mano per gli esercizi
-- custom; il cliente indovinava il gruppo muscolare con un regex sul NOME
-- dell'esercizio, risultato spesso sbagliato o "Generico". Un cliente
-- vedeva un volume diverso da quello che il coach aveva davvero impostato.
--
-- Questa tabella è la libreria collettiva condivisa (stile "database
-- MyFitnessPal" già usato per gli alimenti custom): quando il coach
-- aggiunge un esercizio nuovo con i suoi muscoli target, resta salvato qui
-- e non va più reinserito — né dal coach per altri clienti, né da un
-- cliente Premium che si programma la scheda da solo.
create table if not exists public.exercise_library (
  name       text primary key,
  direct     text[] not null default '{}',
  indirect   text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.exercise_library enable row level security;
alter table public.exercise_library force row level security;

-- Libreria condivisa: leggibile da chiunque abbia effettuato l'accesso.
drop policy if exists "exercise_library_select" on public.exercise_library;
create policy "exercise_library_select" on public.exercise_library for select
  to authenticated using ( true );

-- Chiunque può contribuire un esercizio nuovo (coach per un cliente, o un
-- cliente Premium che si programma da solo) — mai sovrascrivere una voce
-- già presente (on conflict do nothing lato applicazione), così una voce
-- corretta non viene mai rovinata da un secondo inserimento incoerente.
drop policy if exists "exercise_library_insert" on public.exercise_library;
create policy "exercise_library_insert" on public.exercise_library for insert
  to authenticated with check ( true );

grant select, insert on public.exercise_library to authenticated;
