-- PERFORM — SCHEMA_v64_backfill_onboarding_anamnesis_gate.sql
-- ============================================================================
-- Fix una tantum per il bug: un cliente che pagava un piano a coaching da
-- Impostazioni > Cambia piano (quindi con onboarding_completed già a true da
-- PRIMA del pagamento) non vedeva mai la schermata anamnesi — il gate in
-- App.jsx scatta solo su onboarding_completed=false, e quel flag restava per
-- sempre true una volta impostato la prima volta. Il fix strutturale è nel
-- webhook (supabase/functions/stripe-webhook/index.ts, stessa PR): da ora,
-- un pagamento per un piano a coaching senza anamnesi salvata azzera di
-- nuovo onboarding_completed.
--
-- Questa query riallinea chi è rimasto bloccato in questo stato PRIMA del
-- fix: ogni cliente con un piano a coaching attivo ma senza anamnesi salvata
-- torna a onboarding_completed=false, così al prossimo accesso vede
-- l'anamnesi. Sicura da rieseguire (idempotente: chi ha già l'anamnesi salvata
-- non viene toccato).
--
-- Da eseguire in Supabase SQL Editor, DOPO aver deployato la nuova versione
-- di supabase/functions/stripe-webhook (`supabase functions deploy stripe-webhook`).

update public.profiles p
set onboarding_completed = false
where p.plan in ('scheda_personalizzata', 'training', 'full')
  and p.client_status = 'active'
  and not exists (
    select 1 from public.anamnesis_responses a where a.user_id = p.id
  );
