-- =====================================================================
-- PERFORM — Schema v35: tabelle reali per News & Tips (mai create finora)
-- Script idempotente.
-- =====================================================================
--
-- BUG TROVATO: refresh-news-feed (cron ogni 2 ore, task #31/#61) e il feed
-- Avvisi Team (CoachDashboard, task #30) scrivono e leggono da
-- "coach_news_tips" da mesi, ma la tabella non è MAI stata creata sul
-- database reale — nessuna migrazione l'ha mai definita, solo v29 la
-- alterava assumendola "già esistente". Ogni insert del cron falliva in
-- silenzio (errore solo nei log della Edge Function, mai visto da
-- nessuno) e ogni lettura del client tornava vuota: la causa esatta di
-- "la lista News & Tips è completamente vuota".

create table if not exists public.coach_news_tips (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('news', 'tips', 'team')),
  eyebrow          text,
  title            text not null,
  body             text,
  body_extended    jsonb,
  source_query     text,
  like_count       integer not null default 0,
  published_at     timestamptz not null default now(),
  photo_before_url text,
  photo_after_url  text,
  weight_achieved  numeric(5,2)
);

create index if not exists idx_coach_news_tips_channel_published
  on public.coach_news_tips(channel, published_at desc);

alter table public.coach_news_tips enable row level security;
alter table public.coach_news_tips force row level security;

-- Il feed è visibile a chiunque abbia effettuato l'accesso (free incluso):
-- nessun cliente reale deve mai vedere una lista vuota per colpa di RLS.
drop policy if exists "coach_news_tips_select" on public.coach_news_tips;
create policy "coach_news_tips_select" on public.coach_news_tips for select
  to authenticated using ( true );

-- Scrittura diretta dal client SOLO per gli Avvisi Team del coach (channel
-- 'team', vedi CoachDashboard.segnalaObiettivo). I canali 'news'/'tips' li
-- scrive solo la Edge Function con la service role key, che bypassa RLS.
drop policy if exists "coach_news_tips_insert_team" on public.coach_news_tips;
create policy "coach_news_tips_insert_team" on public.coach_news_tips for insert
  to authenticated with check ( channel = 'team' and public.is_coach() );

grant select on public.coach_news_tips to authenticated;
grant insert on public.coach_news_tips to authenticated;

-- RLS bypassa le policy per service_role, ma non sostituisce il GRANT SQL:
-- senza questa riga la Edge Function (service_role) riceve "permission
-- denied" su ogni insert/select — causa reale, verificata in produzione,
-- del feed rimasto vuoto (stesso pattern già usato per ai_usage_monthly,
-- v33, qui dimenticato la prima volta).
grant select, insert, update, delete on public.coach_news_tips to service_role;

-- Like pubblici: un utente può mettere/togliere like una sola volta per post.
create table if not exists public.tip_likes (
  tip_id     uuid not null references public.coach_news_tips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tip_id, user_id)
);

alter table public.tip_likes enable row level security;
alter table public.tip_likes force row level security;

drop policy if exists "tip_likes_select" on public.tip_likes;
create policy "tip_likes_select" on public.tip_likes for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "tip_likes_insert" on public.tip_likes;
create policy "tip_likes_insert" on public.tip_likes for insert
  with check ( user_id = auth.uid() );

drop policy if exists "tip_likes_delete" on public.tip_likes;
create policy "tip_likes_delete" on public.tip_likes for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.tip_likes to authenticated;
grant select, insert, delete on public.tip_likes to service_role;

-- like_count su coach_news_tips tenuto sincronizzato via trigger (il client
-- scrive solo su tip_likes, mai direttamente su like_count) — security
-- definer per poter aggiornare coach_news_tips anche se l'utente non ha un
-- suo permesso di update diretto su quella tabella.
create or replace function public.sync_tip_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.coach_news_tips set like_count = like_count + 1 where id = NEW.tip_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.coach_news_tips set like_count = greatest(0, like_count - 1) where id = OLD.tip_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists tip_likes_after_insert on public.tip_likes;
create trigger tip_likes_after_insert after insert on public.tip_likes
  for each row execute function public.sync_tip_like_count();

drop trigger if exists tip_likes_after_delete on public.tip_likes;
create trigger tip_likes_after_delete after delete on public.tip_likes
  for each row execute function public.sync_tip_like_count();

-- Segnali di gradimento grezzi, per un futuro ranking/raccomandazione (già
-- scritti dal client oggi, mai persistiti prima d'ora).
create table if not exists public.feed_signals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tip_id     uuid references public.coach_news_tips(id) on delete cascade,
  signal     text not null,
  created_at timestamptz not null default now()
);

alter table public.feed_signals enable row level security;
alter table public.feed_signals force row level security;

drop policy if exists "feed_signals_select" on public.feed_signals;
create policy "feed_signals_select" on public.feed_signals for select
  using ( user_id = auth.uid() or public.is_coach() );

drop policy if exists "feed_signals_insert" on public.feed_signals;
create policy "feed_signals_insert" on public.feed_signals for insert
  with check ( user_id = auth.uid() );

grant select, insert on public.feed_signals to authenticated;
grant select, insert on public.feed_signals to service_role;

-- Realtime: il client si iscrive a postgres_changes su INSERT per mostrare
-- i nuovi post istantaneamente, senza dover ricaricare la schermata.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'coach_news_tips'
  ) then
    alter publication supabase_realtime add table public.coach_news_tips;
  end if;
end $$;
