-- =====================================================================
-- PERFORM — Schema v83 (nuova tabella): diet_plans
-- Script idempotente.
-- =====================================================================

-- Dieta tipo assegnata dal coach pasto-per-pasto (WeekDietEditor, editor
-- alimentazione del coach panel) — fino ad ora "Salva modifiche" scriveva
-- SOLO il target macro (nutrition_targets), mai i pasti stessi: il tab
-- "Dieta Tipo" lato cliente restava per questo nascosto in modalità reale
-- (vedi 05_HomeDashboard.jsx). `meals` è una SNAPSHOT già calcolata al
-- momento del salvataggio (kcal per alimento/pasto già risolti da FOOD_DB
-- lato coach) — non un riferimento vivo a un catalogo alimenti che qui non
-- esiste, così il cliente vede esattamente quello che il coach ha
-- confermato anche se FOOD_DB cambia in futuro.
create table if not exists public.diet_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid references public.profiles(id),
  day_type    text not null check (day_type in ('on', 'off')),
  meals       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, day_type)
);

create index if not exists idx_diet_plans_user on public.diet_plans(user_id);

alter table public.diet_plans enable row level security;
alter table public.diet_plans force row level security;

-- Il cliente vede la propria dieta tipo in SOLA LETTURA: solo il coach può
-- scrivere/modificare/cancellare (stesso schema di prescribed_supplements).
drop policy if exists "diet_plans_select" on public.diet_plans;
create policy "diet_plans_select" on public.diet_plans for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "diet_plans_insert" on public.diet_plans;
create policy "diet_plans_insert" on public.diet_plans for insert
  with check ( public.is_coach() );

drop policy if exists "diet_plans_update" on public.diet_plans;
create policy "diet_plans_update" on public.diet_plans for update
  using ( public.is_coach() )
  with check ( public.is_coach() );

drop policy if exists "diet_plans_delete" on public.diet_plans;
create policy "diet_plans_delete" on public.diet_plans for delete
  using ( public.is_coach() );

grant select, insert, update, delete on public.diet_plans to authenticated;
