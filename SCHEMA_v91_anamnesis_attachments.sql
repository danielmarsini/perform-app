-- =====================================================================
-- PERFORM — Schema v91: storage allegati anamnesi (foto fisico iniziale +
-- programmi/diete passati caricati dal cliente)
-- Script idempotente.
-- =====================================================================
--
-- Segnalato da un cliente: nell'anamnesi non riusciva a caricare le foto
-- del fisico in modo che il coach potesse vederle — quel campo ("Foto del
-- check iniziale") era in realtà solo un placeholder demo, mai collegato a
-- un vero upload. Stesso problema per programmi/diete passati: nessun
-- modo di allegarli.
--
-- Bucket PRIVATO, stesso pattern di checkin-photos (v36): solo il
-- proprietario e il coach possono leggere, mai pubblico. Path file:
-- "{user_id}/{timestamp}-{tag}.{ext}" — la RLS confronta il primo
-- segmento del path con auth.uid(), come tutti gli altri bucket privati
-- dell'app.
insert into storage.buckets (id, name, public)
values ('anamnesis-attachments', 'anamnesis-attachments', false)
on conflict (id) do nothing;

drop policy if exists "anamnesis_attachments_read" on storage.objects;
create policy "anamnesis_attachments_read" on storage.objects for select
  using ( bucket_id = 'anamnesis-attachments'
          and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );

drop policy if exists "anamnesis_attachments_write" on storage.objects;
create policy "anamnesis_attachments_write" on storage.objects for insert
  with check ( bucket_id = 'anamnesis-attachments'
               and auth.uid()::text = (storage.foldername(name))[1] );

drop policy if exists "anamnesis_attachments_delete" on storage.objects;
create policy "anamnesis_attachments_delete" on storage.objects for delete
  using ( bucket_id = 'anamnesis-attachments'
          and auth.uid()::text = (storage.foldername(name))[1] );
