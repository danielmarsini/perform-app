-- =====================================================================
-- PERFORM — Schema v24 (aggiunta): checkins completo per il check reale
-- Script idempotente.
-- =====================================================================

-- La tabella checkins esiste già (usata da fetchClientRoster in
-- coachingData.js: date, weight, chest, arm, thigh) ma finora nessun punto
-- del client scriveva davvero su di essa — WeeklyCheckModal
-- (05_HomeDashboard.jsx) simulava il salvataggio con un setTimeout. Il
-- `create table if not exists` qui sotto è solo un fallback nel caso non
-- esista ancora in qualche ambiente; se esiste già (il caso reale) è un
-- no-op e le colonne nuove arrivano dagli `alter table` sotto.
create table if not exists public.checkins (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  date     date not null,
  weight   numeric(5,2),
  chest    numeric(5,2),
  arm      numeric(5,2),
  thigh    numeric(5,2),
  created_at timestamptz not null default now()
);

-- Campi del check settimanale reale che non erano ancora su questa tabella:
-- girovita (WeeklyCheckModal lo chiama "Addome", concettualmente diverso da
-- `chest` che esisteva già), più le 4 domande soggettive e la fase ciclo.
-- Niente `not null`: un check può arrivare anche parziale (es. la
-- registrazione manuale rapida potrebbe non compilare tutto in futuro).
alter table public.checkins add column if not exists waist numeric(5,2);
alter table public.checkins add column if not exists pain smallint;
alter table public.checkins add column if not exists stress smallint;
alter table public.checkins add column if not exists digestion smallint;
alter table public.checkins add column if not exists sleep_quality smallint;
alter table public.checkins add column if not exists cycle_phase text;
-- Vero/finto solo se il cliente ha allegato foto in quel check: le foto
-- stesse NON sono ancora caricate su uno storage reale (fuori scope di
-- questo giro), quindi qui si traccia solo il booleano di presenza.
alter table public.checkins add column if not exists has_photos boolean not null default false;

create index if not exists idx_checkins_user_date on public.checkins(user_id, date desc);

alter table public.checkins enable row level security;
alter table public.checkins force row level security;

drop policy if exists "checkins_select" on public.checkins;
create policy "checkins_select" on public.checkins for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "checkins_insert" on public.checkins;
create policy "checkins_insert" on public.checkins for insert
  with check ( user_id = auth.uid() or public.is_coach() );

grant select, insert on public.checkins to authenticated;
