-- PERFORM — SCHEMA_v56_self_supplements.sql
-- ============================================================================
-- BUG PRESO: il diario integratori autogestito (SupplementsFreeDiary, per
-- chi non ha un piano Pro/Full Coaching e quindi non riceve un protocollo
-- dal coach) era interamente stato React locale — momenti personalizzati,
-- ogni integratore aggiunto, orario/promemoria, spunta "preso" — tutto
-- perso ad ogni riavvio dell'app. Stessa classe di bug già risolta per il
-- protocollo Pro (prescribed_supplements/supplement_intake, SCHEMA_v54),
-- qui la versione "自 gestita": l'utente stesso scrive nome/dose/momento
-- invece del coach.
--
-- self_supplements = il catalogo che l'utente si è costruito (persistente,
-- non scade). self_supplement_intake = "preso OGGI" (stesso pattern insert/
-- delete di supplement_intake, mai una colonna booleana): un integratore
-- autogestito resta pensato come abitudine quotidiana, la spunta si
-- azzera ogni giorno esattamente come nel protocollo Pro.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.self_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_id text not null,               -- id canonico (SUPP_MOMENTS) o "custom-<timestamp>"
  moment_label text,                     -- solo per un momento personalizzato; null per uno standard
  name text not null,
  qty text,
  day_type text not null default 'all',  -- 'all' | 'on' | 'off'
  reminder_time text,                    -- 'HH:MM', null = nessun orario impostato
  reminder_on boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists self_supplements_user_id_idx on public.self_supplements (user_id);

alter table public.self_supplements enable row level security;

drop policy if exists "self_supplements_select" on public.self_supplements;
create policy "self_supplements_select" on public.self_supplements for select
  using ( user_id = auth.uid() );

drop policy if exists "self_supplements_insert" on public.self_supplements;
create policy "self_supplements_insert" on public.self_supplements for insert
  with check ( user_id = auth.uid() );

drop policy if exists "self_supplements_update" on public.self_supplements;
create policy "self_supplements_update" on public.self_supplements for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

drop policy if exists "self_supplements_delete" on public.self_supplements;
create policy "self_supplements_delete" on public.self_supplements for delete
  using ( user_id = auth.uid() );

grant select, insert, update, delete on public.self_supplements to authenticated;

create table if not exists public.self_supplement_intake (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  self_supplement_id uuid not null references public.self_supplements(id) on delete cascade,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, self_supplement_id, date)
);

create index if not exists self_supplement_intake_user_date_idx
  on public.self_supplement_intake (user_id, date);

alter table public.self_supplement_intake enable row level security;

drop policy if exists "self_supplement_intake_select" on public.self_supplement_intake;
create policy "self_supplement_intake_select" on public.self_supplement_intake for select
  using ( user_id = auth.uid() );

drop policy if exists "self_supplement_intake_insert" on public.self_supplement_intake;
create policy "self_supplement_intake_insert" on public.self_supplement_intake for insert
  with check ( user_id = auth.uid() );

drop policy if exists "self_supplement_intake_delete" on public.self_supplement_intake;
create policy "self_supplement_intake_delete" on public.self_supplement_intake for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.self_supplement_intake to authenticated;
