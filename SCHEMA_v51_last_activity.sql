-- PERFORM — SCHEMA_v51_last_activity.sql
-- ============================================================================
-- Ultimo accesso reale per Hub Utenti (ex Hub Rete & Accessi): prima l'elenco
-- ordinava per data di iscrizione con un "ultimo ingresso" completamente
-- simulato (più streak/aderenza alti, più il login sembrava recente) — mai
-- un dato reale. Ora ogni utente scrive last_activity sulla propria riga
-- una volta per sessione app (touchLastActivity, chiamata da App.jsx appena
-- la sessione è pronta), e Hub Utenti ordina davvero per quello.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.profiles add column if not exists last_activity timestamptz;

create index if not exists profiles_last_activity_idx on public.profiles (last_activity);

-- Nessuna nuova policy RLS: profiles ha già una policy di update per la
-- propria riga (stesso principio già in uso per nickname/bio/avatar/
-- favorite_exercises), che copre anche questa nuova colonna.
