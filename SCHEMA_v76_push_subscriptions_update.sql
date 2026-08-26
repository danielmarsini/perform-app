-- =====================================================================
-- PERFORM — Schema v76: permesso UPDATE mancante su push_subscriptions
-- Script idempotente.
-- =====================================================================
--
-- BUG PRESO: pushNotifications.js fa un upsert (onConflict: "endpoint") su
-- push_subscriptions, ma SCHEMA_v26 concedeva solo select/insert/delete —
-- mai update. La primissima attivazione (endpoint nuovo) va a buon fine
-- come INSERT, ma Safari spesso riusa lo stesso endpoint push quando l'app
-- viene rimossa e reinstallata dalla Home: al tentativo successivo l'upsert
-- prova un UPDATE sulla riga già esistente, il database lo rifiuta per
-- mancanza di permesso, e il toggle mostrava (a torto) "non supportato".
drop policy if exists "push_subscriptions_update" on public.push_subscriptions;
create policy "push_subscriptions_update" on public.push_subscriptions for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

grant update on public.push_subscriptions to authenticated;
