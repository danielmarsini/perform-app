-- =====================================================================
-- PERFORM — Schema v16 (aggiunta): gate di onboarding post-registrazione
-- Script idempotente.
-- =====================================================================

-- Diventa true solo quando il cliente ha attraversato la schermata di
-- selezione piano (e, per i piani a coaching, anche l'anamnesi). Finché è
-- false, App.jsx mostra OnboardingFlow al posto della Home — è il campo che
-- la specifica funzionale chiama genericamente "stato unpaid", semplificato
-- qui a un solo booleano perché Stripe non è ancora collegato: quando verrà
-- collegato, il vero stato di pagamento resterà su una tabella dedicata
-- (subscriptions), questo campo continua a significare solo "ha superato
-- l'onboarding", non "ha pagato".
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;

-- OnboardingFlow (11_OnboardingFlow.jsx) scrive plan e onboarding_completed
-- direttamente dal client, di riga propria (self-service, nessuna azione del
-- coach). Se su profiles esiste già RLS con una self-update policy più ampia
-- (es. per nickname/bio dal profilo), questa è ridondante ma innocua: resta
-- scoping per riga, coerente con lo stesso pattern "id/user_id = auth.uid()"
-- già usato altrove in questo schema (anamnesis_responses, workout_sets). Se
-- invece profiles non ha ancora RLS abilitata, questa policy resta inerte
-- finché non attivi tu `alter table ... enable row level security` — cosa
-- che NON faccio qui perché non conosco le altre policy select/insert già
-- esistenti sulla tabella (schema v11/v12, non presente in questo repo) e
-- abilitare RLS alla cieca rischierebbe di bloccare letture che oggi funzionano.
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update
  using ( id = auth.uid() )
  with check ( id = auth.uid() );

-- NOTA PER CHI ESEGUE QUESTO SCRIPT: il default false si applica anche alle
-- righe già esistenti. Se hai già clienti attivi in produzione (whitelist,
-- test interni, il tuo stesso account coach), aggiorna manualmente le loro
-- righe prima di far ripartire l'app, altrimenti al primo login successivo
-- si ritroveranno catapultati nella schermata di selezione piano:
--   update public.profiles set onboarding_completed = true where id in (...);
