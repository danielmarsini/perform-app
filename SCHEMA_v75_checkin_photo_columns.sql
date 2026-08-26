-- =====================================================================
-- PERFORM — Schema v75: colonne foto mancanti su checkins
-- Script idempotente.
-- =====================================================================
--
-- BUG PRESO: coachingData.js (saveCheckin/fetchCheckins) legge e scrive da
-- tempo photo_front_url/photo_side_url/photo_back_url su public.checkins,
-- ma nessuna migrazione le ha mai create — solo has_photos (SCHEMA_v24) e
-- il bucket storage "checkin-photos" (SCHEMA_v36) esistono davvero.
-- Risultato: ogni saveCheckin() fallisce lato Postgres con "colonna
-- inesistente", per QUALSIASI check (non solo quelli con foto, perché
-- l'insert include sempre queste chiavi) — verosimilmente la causa reale
-- della segnalazione "le foto del check non si salvano".
alter table public.checkins add column if not exists photo_front_url text;
alter table public.checkins add column if not exists photo_side_url text;
alter table public.checkins add column if not exists photo_back_url text;
