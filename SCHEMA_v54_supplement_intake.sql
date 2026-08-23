-- PERFORM — SCHEMA_v54_supplement_intake.sql
-- ============================================================================
-- BUG PRESO: nel protocollo integratori prescritto dal coach (Integrazione,
-- piano Pro/Full Coaching), spuntare un integratore come "preso oggi" era
-- SOLO stato React locale (SupplementsPlanLocked, 05_HomeDashboard.jsx) —
-- nessuna scrittura su Supabase. Riaprendo l'app (o solo ricaricando la
-- pagina) la spunta spariva sempre, perché non esisteva nessuna tabella
-- dove salvarla.
--
-- Una riga = "questo integratore prescritto è stato preso in questa data",
-- per utente. Basta l'esistenza della riga (nessuna colonna "taken"):
-- spuntare = insert, togliere la spunta = delete.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.supplement_intake (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prescribed_supplement_id uuid not null references public.prescribed_supplements(id) on delete cascade,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, prescribed_supplement_id, date)
);

create index if not exists supplement_intake_user_date_idx
  on public.supplement_intake (user_id, date);

alter table public.supplement_intake enable row level security;

drop policy if exists "supplement_intake_select" on public.supplement_intake;
create policy "supplement_intake_select" on public.supplement_intake for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "supplement_intake_insert" on public.supplement_intake;
create policy "supplement_intake_insert" on public.supplement_intake for insert
  with check ( user_id = auth.uid() );

drop policy if exists "supplement_intake_delete" on public.supplement_intake;
create policy "supplement_intake_delete" on public.supplement_intake for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.supplement_intake to authenticated;
