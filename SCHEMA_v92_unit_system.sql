-- =====================================================================
-- PERFORM — Schema v92: sistema di unità di misura persistente (dual-unit)
-- =====================================================================
--
-- Metrico (kg/cm) vs Imperiale (lbs/in), scelto in Impostazioni → Aspetto,
-- stesso pattern di `lang` (SCHEMA_v82): senza una colonna persistente la
-- scelta tornerebbe sempre a 'metric' a ogni login. Il DB resta SEMPRE in
-- kg/cm (fonte di verità) — questa colonna decide solo come l'app
-- converte per mostrare/leggere gli input, mai cosa viene salvato.
--
-- Script idempotente.

alter table public.profiles add column if not exists unit_system text not null default 'metric';
alter table public.profiles drop constraint if exists profiles_unit_system_check;
alter table public.profiles add constraint profiles_unit_system_check check (unit_system in ('metric', 'imperial'));
