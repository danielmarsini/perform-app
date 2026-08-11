-- =====================================================================
-- PERFORM — Schema v18 (nuova tabella): prescribed_supplements
-- Script idempotente.
-- =====================================================================

-- Integratori prescritti dal coach per un cliente specifico, raggruppati per
-- momento della giornata. `moment` è testo libero (non un enum fisso): il
-- coach in WeekSuppsEditor (09_CoachDashboard.jsx) può già rinominare le
-- sezioni a piacere ("Mattina", "Pranzo", "Pre/Post-Workout", "Sera ·
-- Pre-nanna", o un titolo personalizzato) — vincolare qui a un elenco fisso
-- romperebbe quella funzione già esistente. sort_order preserva l'ordine
-- del coach dentro lo stesso momento: stesso motivo per cui workout_logs ha
-- avuto bisogno di un ordinamento esplicito su created_at dopo il fatto —
-- qui lo mettiamo fin da subito invece di scoprirlo dopo.
create table if not exists public.prescribed_supplements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid references public.profiles(id),
  moment      text not null,
  name        text not null,
  dose        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_prescribed_supplements_user on public.prescribed_supplements(user_id, moment, sort_order);

alter table public.prescribed_supplements enable row level security;
alter table public.prescribed_supplements force row level security;

-- Il cliente vede il proprio protocollo in SOLA LETTURA (§2 della specifica
-- funzionale): solo il coach può scrivere/modificare/cancellare.
drop policy if exists "prescribed_supplements_select" on public.prescribed_supplements;
create policy "prescribed_supplements_select" on public.prescribed_supplements for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "prescribed_supplements_insert" on public.prescribed_supplements;
create policy "prescribed_supplements_insert" on public.prescribed_supplements for insert
  with check ( public.is_coach() );

drop policy if exists "prescribed_supplements_update" on public.prescribed_supplements;
create policy "prescribed_supplements_update" on public.prescribed_supplements for update
  using ( public.is_coach() )
  with check ( public.is_coach() );

drop policy if exists "prescribed_supplements_delete" on public.prescribed_supplements;
create policy "prescribed_supplements_delete" on public.prescribed_supplements for delete
  using ( public.is_coach() );

grant select, insert, update, delete on public.prescribed_supplements to authenticated;
