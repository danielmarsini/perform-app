-- =====================================================================
-- PERFORM — Schema v46: stile di intensità (LISS/Moderata/HIIT) e
-- macchinari da palestra per il Cardio.
-- Script idempotente.
-- =====================================================================
--
-- intensity_style: applicabile a QUALUNQUE attività cardio, outdoor o da
-- macchinario — è una scelta di metodo (steady state vs intervalli), non
-- legata al tipo di attività. Per 'hiit' si registra anche la struttura
-- reale degli intervalli (round/lavoro/recupero), non solo l'etichetta:
-- è il dato che rende la sessione confrontabile nel tempo, non solo un tag.
alter table public.cardio_logs add column if not exists intensity_style text
  check (intensity_style in ('liss', 'moderate', 'hiit'));
alter table public.cardio_logs add column if not exists hiit_rounds integer;
alter table public.cardio_logs add column if not exists hiit_work_sec integer;
alter table public.cardio_logs add column if not exists hiit_rest_sec integer;

-- machine_metrics: jsonb invece di una colonna per metrica, perché ogni
-- macchinario ha metriche diverse (pendenza per il tapis roulant, colpi al
-- minuto per il vogatore, resistenza per cyclette/ellittica/scalatore) — una
-- tabella con 15 colonne quasi sempre vuote sarebbe meno onesta di un jsonb
-- che contiene SOLO le chiavi davvero raccolte per quella sessione. La
-- forma delle chiavi è definita lato client (MACHINE_FIELDS in
-- 05_HomeDashboard.jsx), mai validata qui: è metadata descrittivo, non un
-- vincolo di business.
alter table public.cardio_logs add column if not exists machine_metrics jsonb;
