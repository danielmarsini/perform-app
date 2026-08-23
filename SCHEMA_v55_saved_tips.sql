-- PERFORM — SCHEMA_v55_saved_tips.sql
-- ============================================================================
-- BUG PRESO: la Cassaforte (Report Salvati) in News & Tips era SOLO stato
-- React locale (vault, 06_NewsTipsView.jsx) — il codice aveva perfino un
-- commento esplicito "Produzione: supabase.from('saved_tips')..." mai
-- scritto. Un articolo "salvato" (che per definizione dovrebbe restare
-- accessibile anche dopo le 48h di scadenza dal feed live) spariva invece
-- ad ogni riavvio dell'app, esattamente come tutto il resto.
--
-- coach_news_tips non cancella mai le righe scadute (la scadenza è solo un
-- filtro lato lettura sul feed live, vedi useNewsFeed) — basta quindi
-- salvare un riferimento all'articolo (tip_id), non una copia del
-- contenuto: il contenuto resta comunque leggibile in futuro.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.saved_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tip_id uuid not null references public.coach_news_tips(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, tip_id)
);

create index if not exists saved_tips_user_id_idx on public.saved_tips (user_id);

alter table public.saved_tips enable row level security;

drop policy if exists "saved_tips_select" on public.saved_tips;
create policy "saved_tips_select" on public.saved_tips for select
  using ( user_id = auth.uid() );

drop policy if exists "saved_tips_insert" on public.saved_tips;
create policy "saved_tips_insert" on public.saved_tips for insert
  with check ( user_id = auth.uid() );

drop policy if exists "saved_tips_delete" on public.saved_tips;
create policy "saved_tips_delete" on public.saved_tips for delete
  using ( user_id = auth.uid() );

grant select, insert, delete on public.saved_tips to authenticated;
