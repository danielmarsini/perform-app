-- PERFORM — SCHEMA_v53_chat_messages_fix_rls.sql
-- ============================================================================
-- BUG PRESO: la chat coach<->cliente falliva SEMPRE lato coach ("Non sono
-- riuscito a caricare la conversazione" + "Non sono riuscito a inviare"),
-- sia in lettura che in scrittura. Causa: SCHEMA_v48_chat_messages.sql è
-- l'UNICA tabella di tutto il progetto la cui RLS riconosce il coach
-- leggendo auth.jwt() ->> 'email' invece di public.is_coach() (usata da
-- OGNI altra tabella coach-gated: workout_logs, nutrition_targets,
-- checkins, profiles, ecc.) — un confronto sul claim email del JWT che non
-- si è mai dimostrato affidabile in produzione, a differenza di is_coach()
-- che legge profiles.role. Riallineato allo stesso pattern collaudato.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages for select
  using ( client_id = auth.uid() or public.is_coach() );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and ( client_id = auth.uid() or public.is_coach() )
  );

drop policy if exists "chat_messages_update_read" on public.chat_messages;
create policy "chat_messages_update_read" on public.chat_messages for update
  using ( client_id = auth.uid() or public.is_coach() )
  with check ( client_id = auth.uid() or public.is_coach() );
