-- =====================================================================
-- PERFORM — Schema v36: storage foto check (Il Mio Archivio / Registro Check)
-- Script idempotente.
-- =====================================================================
--
-- Foto corporee reali: bucket PRIVATO (a differenza di team-photos, v29,
-- che è pubblico per i traguardi condivisi) — qui sono foto private del
-- singolo cliente, viste solo da lui stesso e dal coach, mai pubbliche.
-- Percorso file: "{user_id}/{timestamp}-{angolo}.jpg" — la RLS confronta il
-- primo segmento del path con auth.uid() invece di usare una colonna owner
-- dedicata (pattern standard storage.objects di Supabase).
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', false)
on conflict (id) do nothing;

drop policy if exists "checkin_photos_read" on storage.objects;
create policy "checkin_photos_read" on storage.objects for select
  using ( bucket_id = 'checkin-photos'
          and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );

drop policy if exists "checkin_photos_write" on storage.objects;
create policy "checkin_photos_write" on storage.objects for insert
  with check ( bucket_id = 'checkin-photos'
               and auth.uid()::text = (storage.foldername(name))[1] );

drop policy if exists "checkin_photos_delete" on storage.objects;
create policy "checkin_photos_delete" on storage.objects for delete
  using ( bucket_id = 'checkin-photos'
          and auth.uid()::text = (storage.foldername(name))[1] );
