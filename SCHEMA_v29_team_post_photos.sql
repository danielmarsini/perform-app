-- =====================================================================
-- PERFORM — Schema v29 (aggiunta): foto prima/dopo + peso sui post Avvisi Team
-- Script idempotente.
-- =====================================================================

-- Traguardi con foto: il coach può allegare un confronto prima/dopo e il
-- peso raggiunto al post "Obiettivo Raggiunto" (channel 'team' di
-- coach_news_tips, già esistente). Tutti e tre nullable: un post normale
-- (senza foto) resta possibile come oggi.
alter table public.coach_news_tips add column if not exists photo_before_url text;
alter table public.coach_news_tips add column if not exists photo_after_url text;
alter table public.coach_news_tips add column if not exists weight_achieved numeric(5,2);

-- Bucket storage pubblico in lettura (i traguardi sono visibili a tutti gli
-- iscritti, free e a pagamento) ma scrivibile SOLO dal coach: un cliente non
-- deve poter caricare foto arbitrarie nel feed pubblico dell'app.
insert into storage.buckets (id, name, public)
values ('team-photos', 'team-photos', true)
on conflict (id) do nothing;

drop policy if exists "team_photos_public_read" on storage.objects;
create policy "team_photos_public_read" on storage.objects for select
  using ( bucket_id = 'team-photos' );

drop policy if exists "team_photos_coach_write" on storage.objects;
create policy "team_photos_coach_write" on storage.objects for insert
  with check ( bucket_id = 'team-photos' and public.is_coach() );
