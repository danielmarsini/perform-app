-- PERFORM — SCHEMA_v72_exercise_library_manage.sql
-- ============================================================================
-- Il coach può ora correggere un esercizio già salvato in libreria (nome
-- sbagliato o dimenticato, muscoli da rivedere, guida da rifinire) invece
-- di doverne risalvare uno nuovo che lascia il vecchio, sbagliato, ancora
-- lì come doppione — e può eliminare una voce sbagliata/doppione.
-- SCHEMA_v61 aveva già aperto l'UPDATE al solo coach; qui si aggiunge il
-- DELETE, con la stessa restrizione (solo il coach corregge/ripulisce la
-- libreria condivisa — l'inserimento di un esercizio nuovo resta aperto a
-- chiunque, invariato, SCHEMA_v39).
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

drop policy if exists "exercise_library_delete" on public.exercise_library;
create policy "exercise_library_delete" on public.exercise_library for delete
  to authenticated using ( public.is_coach() );

grant delete on public.exercise_library to authenticated;
