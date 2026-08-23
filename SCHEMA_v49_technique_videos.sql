-- PERFORM — SCHEMA_v49_technique_videos.sql
-- ============================================================================
-- Video-check tecnica esecuzione: il cliente carica un video breve di un
-- esercizio, il coach lo guarda e lascia un commento (può riferirsi a un
-- istante preciso scrivendolo nel testo, es. "a 0:12 ginocchia troppo
-- interne" — niente scrubber con marker cliccabili, sarebbe una feature a
-- parte molto più grande per un guadagno marginale rispetto al commento
-- testuale). Stesso pattern già in uso per le foto check (SCHEMA_v36):
-- bucket privato, path "{user_id}/...", RLS che confronta il primo
-- segmento del path con auth.uid(), public.is_coach() per l'accesso del
-- coach a QUALSIASI cliente.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

create table if not exists public.technique_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  video_path text not null,        -- path nel bucket "technique-videos"
  note text,                        -- nota facoltativa del cliente ("guarda il ginocchio destro")
  coach_comment text,
  coach_comment_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists technique_videos_client_id_created_at_idx
  on public.technique_videos (client_id, created_at);

alter table public.technique_videos enable row level security;

drop policy if exists "technique_videos_select" on public.technique_videos;
create policy "technique_videos_select" on public.technique_videos for select
  using (client_id = auth.uid() or public.is_coach());

-- Solo il cliente carica un video nuovo per sé stesso — il coach non "posta"
-- video a nome del cliente, solo commenta quelli già caricati.
drop policy if exists "technique_videos_insert" on public.technique_videos;
create policy "technique_videos_insert" on public.technique_videos for insert
  with check (client_id = auth.uid());

-- Il cliente può correggere/cancellare solo la propria nota prima che sia
-- stato commentato; il coach può scrivere/aggiornare solo il proprio
-- commento. Un'unica policy con USING ampia, il controllo fine su QUALI
-- colonne cambiano resta lato applicazione (stesso principio già adottato
-- altrove in questo schema per update non distinti per colonna).
drop policy if exists "technique_videos_update" on public.technique_videos;
create policy "technique_videos_update" on public.technique_videos for update
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists "technique_videos_delete" on public.technique_videos;
create policy "technique_videos_delete" on public.technique_videos for delete
  using (client_id = auth.uid());

alter publication supabase_realtime add table public.technique_videos;

-- Storage: bucket privato, stesso pattern di checkin-photos (SCHEMA_v36).
insert into storage.buckets (id, name, public)
values ('technique-videos', 'technique-videos', false)
on conflict (id) do nothing;

drop policy if exists "technique_videos_read" on storage.objects;
create policy "technique_videos_read" on storage.objects for select
  using ( bucket_id = 'technique-videos'
          and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );

drop policy if exists "technique_videos_write" on storage.objects;
create policy "technique_videos_write" on storage.objects for insert
  with check ( bucket_id = 'technique-videos'
               and auth.uid()::text = (storage.foldername(name))[1] );

drop policy if exists "technique_videos_object_delete" on storage.objects;
create policy "technique_videos_object_delete" on storage.objects for delete
  using ( bucket_id = 'technique-videos'
          and auth.uid()::text = (storage.foldername(name))[1] );
