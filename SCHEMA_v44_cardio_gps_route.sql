-- =====================================================================
-- PERFORM — Schema v44: tracciamento GPS reale per il Cardio (stile Strava)
-- Script idempotente.
-- =====================================================================
--
-- cardio_logs (SCHEMA_v34) finora era solo inserimento manuale (tipo,
-- durata, distanza a mano). Aggiunge il percorso reale registrato dal GPS
-- del telefono durante la sessione: un array di punti {lat,lng,t} salvato
-- come jsonb (niente estensione PostGIS necessaria — basta per disegnare
-- il percorso su una mappa, non serve una vera query geospaziale) più
-- velocità media/massima calcolate a fine sessione dai punti reali.
alter table public.cardio_logs add column if not exists route jsonb;
alter table public.cardio_logs add column if not exists avg_speed_kmh numeric(5,2);
alter table public.cardio_logs add column if not exists max_speed_kmh numeric(5,2);
