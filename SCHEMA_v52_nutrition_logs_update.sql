-- PERFORM — SCHEMA_v52_nutrition_logs_update.sql
-- ============================================================================
-- BUG PRESO: modificare la quantità (grammi) di un alimento già registrato
-- nel diario pasti sembrava funzionare (il ricalcolo calorie/macro appare
-- subito a schermo, aggiornamento ottimistico lato client), ma spariva ad
-- ogni riapertura dell'app. Causa: SCHEMA_v41_fix_nutrition_logs.sql abilita
-- RLS su nutrition_logs con policy per select/insert/delete ma NESSUNA
-- policy per update, e la grant a "authenticated" non include update — ogni
-- UPDATE veniva rifiutato in silenzio da Postgres, l'errore finiva solo in
-- console (mai mostrato all'utente), quindi la riga in DB non cambiava mai
-- pur sembrando salvata. updateNutritionLogItem (coachingData.js) era già
-- scritta e collegata correttamente: mancava solo il permesso lato database.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

drop policy if exists "nutrition_logs_update" on public.nutrition_logs;
create policy "nutrition_logs_update" on public.nutrition_logs for update
  using ( user_id = auth.uid() or public.is_coach() )
  with check ( user_id = auth.uid() or public.is_coach() );

grant update on public.nutrition_logs to authenticated;
