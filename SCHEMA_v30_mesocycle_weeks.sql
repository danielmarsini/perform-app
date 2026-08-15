-- =====================================================================
-- PERFORM — Schema v30 (nuova tabella): mesocycle_weeks
-- Script idempotente.
-- =====================================================================

-- Etichetta di programmazione per UNA settimana specifica di UN cliente:
-- nome del mesociclo (es. "Bulk Estate 2026") + fase (bulk/cut/mantenimento/
-- scarico). Puramente descrittiva — non tocca allenamento/dieta reali, serve
-- solo al coach per navigare il calendario e capire a colpo d'occhio cosa
-- sta programmando in quella settimana. Chiave naturale (user_id, week_start)
-- perché ogni settimana ha al più UNA etichetta.
create table if not exists public.mesocycle_weeks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  week_start   date not null,
  mesocycle_name text,
  phase        text check (phase in ('bulk', 'cut', 'maintenance', 'deload')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists idx_mesocycle_weeks_user on public.mesocycle_weeks(user_id, week_start desc);

alter table public.mesocycle_weeks enable row level security;
alter table public.mesocycle_weeks force row level security;

drop policy if exists "mesocycle_weeks_select" on public.mesocycle_weeks;
create policy "mesocycle_weeks_select" on public.mesocycle_weeks for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "mesocycle_weeks_upsert" on public.mesocycle_weeks;
create policy "mesocycle_weeks_upsert" on public.mesocycle_weeks for insert
  with check ( public.is_coach() );

drop policy if exists "mesocycle_weeks_update" on public.mesocycle_weeks;
create policy "mesocycle_weeks_update" on public.mesocycle_weeks for update
  using ( public.is_coach() ) with check ( public.is_coach() );

grant select, insert, update on public.mesocycle_weeks to authenticated;
