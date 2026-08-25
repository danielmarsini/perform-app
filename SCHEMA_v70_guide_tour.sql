-- PERFORM — SCHEMA_v70_guide_tour.sql
-- ============================================================================
-- Sostituisce il banner "Giorno 1 di 14" (troppo invadente, giudicato
-- "bruttissimo") con una guida interattiva mostrata UNA volta sola, subito
-- dopo l'onboarding, diversa per ogni piano (Free/Premium/Scheda
-- Personalizzata/Coaching Allenamento/Full Coaching) — vedi PerformGuideTour
-- in 05_HomeDashboard.jsx.
--
-- guide_tour_completed segue lo stesso pattern di onboarding_completed
-- (SCHEMA_v16): un booleano semplice, non un vero stato "ha imparato ad
-- usare l'app", solo "ha già visto (o saltato) la guida". Gli utenti GIÀ
-- registrati prima di questa migrazione vengono marcati come "già visto"
-- subito (update qui sotto) — altrimenti si ritroverebbero tutti insieme la
-- guida al primo accesso dopo il deploy, invece che solo i nuovi iscritti da
-- qui in avanti.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

alter table public.profiles add column if not exists guide_tour_completed boolean not null default false;

update public.profiles set guide_tour_completed = true where guide_tour_completed = false;
