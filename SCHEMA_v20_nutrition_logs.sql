-- =====================================================================
-- PERFORM — Schema v20 (nuova tabella): nutrition_logs
-- Script idempotente.
-- =====================================================================

-- Diario pasti reale del cliente: oggi il diario "Diario Libero" in Home
-- (05_HomeDashboard.jsx) è solo stato locale del componente, mai scritto su
-- Supabase — sparisce a ogni ricarica. Una riga = un alimento aggiunto a un
-- pasto in una data. `meal_slot` testo libero ma allineato ai 6 id fissi già
-- in uso lato client (MEAL_SLOTS: colazione, spuntino1, pranzo, merenda,
-- cena, prenanna) — non vincolato con un check per non dover toccare lo
-- schema se in futuro cambia quell'elenco.
create table if not exists public.nutrition_logs (
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

create index if not exists idx_nutrition_logs_user_date on public.nutrition_logs(user_id, date);

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
