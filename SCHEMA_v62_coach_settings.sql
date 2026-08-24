-- PERFORM — SCHEMA_v62_coach_settings.sql
-- ============================================================================
-- §05 memo "Verso l'élite" (I primi 14 giorni): un video di benvenuto
-- registrato UNA SOLA VOLTA dal coach, mostrato a ogni nuovo cliente durante
-- il percorso dei primi 14 giorni — personalizza senza costare tempo per
-- cliente. Non è un dato per-cliente (come exercise_library, video_url,
-- SCHEMA_v61) ma un'unica impostazione condivisa da tutta l'app: la tabella
-- è forzata a UNA sola riga (id boolean, sempre true) con il classico
-- trucco Postgres del singleton, non un id arbitrario che potrebbe
-- moltiplicarsi per errore.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.coach_settings (
  id boolean primary key default true,
  welcome_video_url text,
  updated_at timestamptz not null default now(),
  constraint coach_settings_singleton check (id)
);

insert into public.coach_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.coach_settings enable row level security;

-- Lettura aperta a chiunque sia autenticato (ogni cliente deve poter vedere
-- il video di benvenuto durante il proprio onboarding), scrittura riservata
-- al coach — stessa convenzione is_coach() già usata in tutto lo schema.
drop policy if exists "coach_settings_select" on public.coach_settings;
create policy "coach_settings_select" on public.coach_settings for select
  to authenticated using ( true );

drop policy if exists "coach_settings_update" on public.coach_settings;
create policy "coach_settings_update" on public.coach_settings for update
  to authenticated using ( public.is_coach() ) with check ( public.is_coach() );

grant select, update on public.coach_settings to authenticated;
