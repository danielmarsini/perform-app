-- =====================================================================
-- PERFORM — Schema v42: integratori differenziati per giorno ON/OFF
-- Script idempotente.
-- =====================================================================
--
-- Stessa logica già usata per l'alimentazione (nutrition_targets.day_type,
-- guidata da weekPlan[oggi] != null lato cliente): un integratore può
-- valere ogni giorno ('all', default — invariato per chi già lo usa), solo
-- nei giorni di allenamento ('on', es. pre-workout) o solo nei giorni di
-- riposo ('off', es. un supporto al sonno più alto quando non ci si allena).
alter table public.prescribed_supplements add column if not exists day_type text not null default 'all'
  check (day_type in ('all', 'on', 'off'));
