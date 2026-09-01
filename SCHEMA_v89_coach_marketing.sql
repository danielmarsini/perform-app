-- =====================================================================
-- PERFORM — Schema v89: marketing/scarsità reale sul profilo del coach
-- Script idempotente.
-- =====================================================================

-- Richiesta esplicita: "un contatore o avviso di posti limitati rimasti per
-- il coaching attivo" + "banner dinamici con offerte a scadenza". Coerente
-- con l'intera app: MAI un dato finto/inventato lato frontend — questi
-- valori li imposta il coach stesso (rimangono null finché non lo fa,
-- il frontend nasconde banner e contatore quando sono null, mai un
-- placeholder mostrato come se fosse reale).
--
-- coach_max_active_clients: tetto di clienti a coaching attivo che il coach
-- si è dato — il conteggio reale (quanti ne ha davvero in questo momento) si
-- calcola già da profiles.client_status/plan, non serve duplicarlo qui.
--
-- promo_title/promo_description/promo_expires_at: un'offerta a tempo che il
-- coach vuole mostrare sulla pagina piani — sparisce da sola (frontend) una
-- volta passata promo_expires_at, mai bisogno di disattivarla a mano.
alter table public.profiles add column if not exists coach_max_active_clients integer;
alter table public.profiles add column if not exists promo_title text;
alter table public.profiles add column if not exists promo_description text;
alter table public.profiles add column if not exists promo_expires_at timestamptz;

-- La pagina piani (OnboardingFlow/SettingsDrawer) la vede QUALUNQUE utente,
-- non solo il coach — ma la RLS di profiles è "id = auth.uid() OR
-- is_coach()" (vedi SCHEMA_v45, stesso identico problema già risolto per
-- leaderboard_profiles): un cliente normale che leggesse profiles
-- direttamente vedrebbe solo la propria riga, mai quella del coach né un
-- conteggio reale dei clienti attivi altrui. Stessa soluzione: una VIEW che
-- gira con i privilegi di chi la crea (bypassa la RLS della tabella
-- sorgente "per costruzione"), espone SOLO i 4 campi marketing del coach
-- più il conteggio reale dei clienti a coaching attivo — mai email/piano/
-- stripe/whitelist di nessuno.
create or replace view public.coach_marketing_public as
select
  p.coach_max_active_clients,
  p.promo_title,
  p.promo_description,
  p.promo_expires_at,
  (select count(*) from public.profiles c
     where c.role = 'user' and c.client_status = 'active'
       and c.plan in ('scheda_personalizzata', 'training', 'full')) as active_coaching_count
from public.profiles p
where p.role = 'coach';

grant select on public.coach_marketing_public to authenticated;
