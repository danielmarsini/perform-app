-- PERFORM — SCHEMA_v50_chat_attachments.sql
-- ============================================================================
-- Allegati nella chat coach <-> cliente (SCHEMA_v48): prima solo testo, ora
-- anche foto, video, messaggi vocali e file generici, come su WhatsApp. Un
-- messaggio può avere SOLO testo, SOLO un allegato, o entrambi (es. una foto
-- con una didascalia) — mai messaggio completamente vuoto.
--
-- Stesso pattern già in uso per checkin-photos (SCHEMA_v36) e
-- technique-videos (SCHEMA_v49): bucket privato, path "{client_id}/...",
-- RLS che confronta il primo segmento del path con auth.uid(),
-- public.is_coach() per l'accesso del coach a QUALSIASI cliente. A
-- differenza di technique-videos (solo il cliente carica), qui SCRIVONO
-- entrambi i lati della stessa conversazione — il coach può mandare una
-- foto/vocale/file quanto il cliente.
--
-- Da eseguire in Supabase SQL Editor. Idempotente (IF NOT EXISTS/OR REPLACE
-- ovunque possibile): si può rilanciare senza rompere nulla se già eseguito
-- in parte.

alter table public.chat_messages
  add column if not exists attachment_path text,        -- path nel bucket "chat-attachments"
  add column if not exists attachment_type text,         -- 'image' | 'video' | 'audio' | 'file'
  add column if not exists attachment_name text;         -- nome file originale, per i file generici

do $$ begin
  alter table public.chat_messages
    add constraint chat_messages_attachment_type_check
    check (attachment_type is null or attachment_type in ('image', 'video', 'audio', 'file'));
exception
  when duplicate_object then null;
end $$;

-- Un messaggio con solo allegato (niente testo) è valido: il body NOT NULL
-- originale va tolto, sostituito da un vincolo "almeno uno dei due".
alter table public.chat_messages alter column body drop not null;

do $$ begin
  alter table public.chat_messages
    add constraint chat_messages_body_or_attachment_check
    check (body is not null or attachment_path is not null);
exception
  when duplicate_object then null;
end $$;

-- Storage: bucket privato, stesso pattern di technique-videos (SCHEMA_v49).
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists "chat_attachments_read" on storage.objects;
create policy "chat_attachments_read" on storage.objects for select
  using ( bucket_id = 'chat-attachments'
          and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );

-- A differenza di technique-videos, qui scrivono entrambi i lati della
-- conversazione: il cliente nella propria cartella, il coach in QUALSIASI
-- cartella cliente (sta rispondendo a quel cliente specifico).
drop policy if exists "chat_attachments_write" on storage.objects;
create policy "chat_attachments_write" on storage.objects for insert
  with check ( bucket_id = 'chat-attachments'
               and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );

drop policy if exists "chat_attachments_delete" on storage.objects;
create policy "chat_attachments_delete" on storage.objects for delete
  using ( bucket_id = 'chat-attachments'
          and (auth.uid()::text = (storage.foldername(name))[1] or public.is_coach()) );
