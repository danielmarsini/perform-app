-- =====================================================================
-- PERFORM — Schema v38: bio/avatar/streak massimo reali sul profilo
-- Script idempotente.
-- =====================================================================
--
-- BUG TROVATO: la Impostazioni "Modifica profilo" (nickname/bio/avatar) non
-- scriveva MAI su Supabase — onSaveProfile in App.jsx/08_ClientProfileView.jsx
-- aggiornava solo lo state React locale, e l'avatar era un blob: URL locale
-- al browser (URL.createObjectURL), invalido già al refresh. Il cliente
-- vedeva la modifica "salvata" per un istante e la perdeva sempre.
--
-- profiles non aveva nemmeno le colonne per contenerle: bio/avatar_url non
-- esistevano. longest_streak nemmeno: solo current_streak era tracciato, e
-- l'utente vuole vedere "giorni massimi di streak" nel dettaglio Classifica.

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists longest_streak integer not null default 0;

-- Storage pubblico in lettura (l'avatar deve essere visibile a chiunque in
-- Classifica, non solo al proprietario) ma scrivibile SOLO dal proprietario
-- del file — path avatars/<user_id>/..., verificato via storage.foldername.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
