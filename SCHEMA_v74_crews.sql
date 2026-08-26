-- PERFORM — SCHEMA_v74_crews.sql
-- ============================================================================
-- "Crew": la streak solitaria diventa di piccolo gruppo (3-6 persone). Non
-- sostituisce lo streak individuale (computeRealXpAndStreak resta invariato),
-- lo affianca: stessa identica definizione di "giornata completa"
-- (isDayComplete, coachingData.js), ora osservata anche dai propri compagni
-- di crew, con un contatore di giorni consecutivi CONDIVISO che si rompe solo
-- se il gruppo nel suo insieme smette di essere costante — non un singolo
-- membro con un giorno storto (vedi CREW_DAY_THRESHOLD lato client).
--
-- Un utente appartiene a UNA sola crew alla volta (unique index su user_id):
-- l'appartenenza a un gruppo è un impegno, non una collezione — frammentare
-- l'attenzione su più crew contemporaneamente vanificherebbe l'effetto
-- "responsabilità reciproca" che è il punto di tutta la funzionalità.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

-- Un solo membership per utente in tutto il sistema (non solo per crew).
create unique index if not exists crew_members_user_unique on public.crew_members (user_id);

create table if not exists public.crew_messages (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists crew_messages_crew_id_created_at_idx on public.crew_messages (crew_id, created_at);

-- Tetto di 6 membri per crew, applicato lato DB (non solo lato client): un
-- trigger BEFORE INSERT invece di una condizione nella policy RLS, perché la
-- policy di insert deve restare semplice ("posso inserire solo la mia riga")
-- e il conteggio dev'essere verificato SEMPRE, anche da un client compromesso.
create or replace function public.enforce_crew_capacity()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.crew_members where crew_id = new.crew_id) >= 6 then
    raise exception 'crew piena — massimo 6 membri';
  end if;
  return new;
end;
$$;

drop trigger if exists crew_members_capacity on public.crew_members;
create trigger crew_members_capacity
  before insert on public.crew_members
  for each row execute function public.enforce_crew_capacity();

-- Risolve un codice invito nell'id della crew SENZA dare accesso in lettura
-- diretto a public.crews a chi non ne fa già parte — stesso identico
-- principio di resolve_referral_code (SCHEMA_v63): una porta stretta e
-- mirata per il solo caso d'uso "verifica se questo codice esiste".
create or replace function public.resolve_crew_code(code text)
returns uuid
language sql security definer set search_path = public
as $$
  select id from public.crews where invite_code = upper(trim(code)) limit 1;
$$;

grant execute on function public.resolve_crew_code(text) to authenticated;

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_messages enable row level security;

-- crews: visibile solo a chi l'ha creata o ne fa già parte — mai un elenco
-- pubblico di tutte le crew esistenti (si entra solo con un codice invito,
-- risolto dalla funzione sopra).
drop policy if exists "crews_select" on public.crews;
create policy "crews_select" on public.crews for select
  using (
    created_by = auth.uid()
    or exists (select 1 from public.crew_members m where m.crew_id = crews.id and m.user_id = auth.uid())
  );

drop policy if exists "crews_insert" on public.crews;
create policy "crews_insert" on public.crews for insert
  with check ( created_by = auth.uid() );

-- crew_members: un membro vede tutti i membri delle crew a cui appartiene
-- (subquery sulla stessa tabella — pattern standard Postgres per RLS, non
-- ricorsione: la USING della riga candidata interroga le righe già visibili
-- del chiamante, non richiama se stessa sulla riga candidata).
drop policy if exists "crew_members_select" on public.crew_members;
create policy "crew_members_select" on public.crew_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.crew_members m2 where m2.crew_id = crew_members.crew_id and m2.user_id = auth.uid())
  );

drop policy if exists "crew_members_insert" on public.crew_members;
create policy "crew_members_insert" on public.crew_members for insert
  with check ( user_id = auth.uid() );

-- Uscire dalla crew (o il creatore che la scioglie per sé): si cancella solo
-- la propria riga, mai quella di un altro membro.
drop policy if exists "crew_members_delete" on public.crew_members;
create policy "crew_members_delete" on public.crew_members for delete
  using ( user_id = auth.uid() );

-- crew_messages: solo i membri della crew leggono/scrivono, e solo a nome
-- proprio (sender_id = auth.uid()) — stesso principio di chat_messages
-- (SCHEMA_v48), qui esteso da 2 a N partecipanti.
drop policy if exists "crew_messages_select" on public.crew_messages;
create policy "crew_messages_select" on public.crew_messages for select
  using ( exists (select 1 from public.crew_members m where m.crew_id = crew_messages.crew_id and m.user_id = auth.uid()) );

drop policy if exists "crew_messages_insert" on public.crew_messages;
create policy "crew_messages_insert" on public.crew_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.crew_members m where m.crew_id = crew_messages.crew_id and m.user_id = auth.uid())
  );

grant select, insert on public.crews to authenticated;
grant select, insert, delete on public.crew_members to authenticated;
grant select, insert on public.crew_messages to authenticated;

-- Realtime per la chat di crew — stesso principio già in uso per
-- chat_messages/coach_news_tips.
alter publication supabase_realtime add table public.crew_messages;
