-- =====================================================================
-- PERFORM — Schema v41: ricrea nutrition_logs con lo schema corretto
-- Script idempotente (drop mirato + create, la tabella era vuota: 0 righe
-- mai salvate con successo — vedi motivo sotto).
-- =====================================================================
--
-- BUG CRITICO trovato ispezionando il database in produzione: la tabella
-- nutrition_logs REALE aveva colonne completamente diverse da quelle che
-- il codice scrive e legge — day_type/meal_number/food_name/weight_g/
-- calories invece di meal_slot/name/grams/kcal (più colonne di
-- micronutrienti mai usate da nessuna parte). Ogni addNutritionLogItem
-- falliva con "column does not exist", sempre, silenziosamente (errore
-- solo in console, mai mostrato all'utente) — il diario pasti del
-- cliente si aggiornava solo in memoria locale e spariva ad ogni cambio
-- schermata o refresh, esattamente come segnalato.
--
-- Causa: SCHEMA_v20_nutrition_logs.sql (già nel repo, schema corretto)
-- usa "create table if not exists" — che non fa NULLA se una tabella con
-- quel nome esiste già, anche con una struttura completamente diversa.
-- Una nutrition_logs precedente (struttura da un progetto diverso/più
-- vecchio) doveva già esistere quando v20 fu eseguita, bloccando in
-- silenzio lo schema corretto per sempre. La tabella è confermata vuota
-- (0 righe): nessun dato reale da preservare.
drop table if exists public.nutrition_logs cascade;

create table public.nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  meal_slot   text not null,
  name        text not null,
  grams       numeric(7,2),
  kcal        numeric(7,2) not null default 0,
  protein     numeric(6,2) not null default 0,
  carbs       numeric(6,2) not null default 0,
  fat         numeric(6,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_nutrition_logs_user_date on public.nutrition_logs(user_id, date);

alter table public.nutrition_logs enable row level security;
alter table public.nutrition_logs force row level security;

drop policy if exists "nutrition_logs_select" on public.nutrition_logs;
create policy "nutrition_logs_select" on public.nutrition_logs for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "nutrition_logs_insert" on public.nutrition_logs;
create policy "nutrition_logs_insert" on public.nutrition_logs for insert
  with check ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "nutrition_logs_delete" on public.nutrition_logs;
create policy "nutrition_logs_delete" on public.nutrition_logs for delete
  using ( user_id = auth.uid() or public.is_coach() );

grant select, insert, delete on public.nutrition_logs to authenticated;
