-- =====================================================================
-- PERFORM — Schema v14 (aggiunta): anagrafica estesa + anamnesi reale
-- Script idempotente.
-- =====================================================================

-- Nome completo (oggi c'è solo "nickname") e piano corrente (per il coach,
-- gestito manualmente finché Stripe non è collegato — Hub Finanziario).
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists plan text not null default 'free'
  check (plan in ('free', 'performance_pack', 'scheda_personalizzata', 'training', 'full'));

-- Il trigger di creazione profilo (schema v11) non salvava ancora il nome
-- completo: lo aggiorniamo per leggerlo da raw_user_meta_data.full_name,
-- inviato già oggi dal client in fase di registrazione.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, full_name, gender, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'gender', 'male'),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Le 56 risposte dell'anamnesi, salvate come JSON (chiave = codice domanda,
-- es. "obiettivoPrinc", "kgTarget", "activity", "foodLikes"...). Una riga per
-- cliente, sovrascritta man mano che risponde — non serve storico per questa.
create table if not exists public.anamnesis_responses (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.anamnesis_responses enable row level security;
alter table public.anamnesis_responses force row level security;

drop policy if exists "anamnesis_select" on public.anamnesis_responses;
create policy "anamnesis_select" on public.anamnesis_responses for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "anamnesis_upsert" on public.anamnesis_responses;
create policy "anamnesis_upsert" on public.anamnesis_responses for insert
  with check ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "anamnesis_update" on public.anamnesis_responses;
create policy "anamnesis_update" on public.anamnesis_responses for update
  using ( user_id = auth.uid() or public.is_coach() )
  with check ( user_id = auth.uid() or public.is_coach() );

grant select, insert, update on public.anamnesis_responses to authenticated;
