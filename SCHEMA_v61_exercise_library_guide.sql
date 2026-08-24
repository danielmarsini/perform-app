-- PERFORM — SCHEMA_v61_exercise_library_guide.sql
-- ============================================================================
-- Guida biomeccanica per esercizio, condivisa e riutilizzabile: oggi la
-- spiegazione "Come si esegue / Cosa evitare" mostrata al cliente veniva
-- calcolata lato client con un matching sul NOME dell'esercizio
-- (exerciseHowTo/exerciseAvoid, 05_HomeDashboard.jsx) — per qualunque
-- esercizio inserito manualmente (non nella lista corta riconosciuta) il
-- testo risultava sbagliato o generico. Ora il coach scrive la guida UNA
-- SOLA VOLTA per esercizio (quando lo salva nella libreria condivisa,
-- stesso punto in cui già sceglie i muscoli target) e resta qui,
-- riutilizzabile per ogni cliente dell'app — mai più da reindovinare.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.exercise_library add column if not exists how_to text;
alter table public.exercise_library add column if not exists avoid text;
alter table public.exercise_library add column if not exists video_url text;

-- Solo il coach può scrivere/correggere la guida di un esercizio già in
-- libreria (how_to/avoid/video_url) — l'inserimento di un esercizio NUOVO
-- resta aperto a chiunque (policy "exercise_library_insert" di SCHEMA_v39,
-- invariata: un cliente Premium può ancora programmarsi la scheda da solo),
-- ma correggere la guida di un esercizio esistente è una responsabilità
-- editoriale del coach, non di un singolo cliente.
drop policy if exists "exercise_library_update" on public.exercise_library;
create policy "exercise_library_update" on public.exercise_library for update
  to authenticated using ( public.is_coach() ) with check ( public.is_coach() );

grant update on public.exercise_library to authenticated;
