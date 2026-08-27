-- =====================================================================
-- PERFORM — Schema v82: lingua persistente + cache traduzioni News&Tips
-- =====================================================================
--
-- Finora `lang` (Impostazioni → Aspetto) era solo stato React locale,
-- resettato a 'it' ad ogni ricarica — nessuna colonna lo salvava. Con la
-- traduzione automatica di News&Tips serve invece un valore persistente e
-- riletto al login, altrimenti ogni sessione ripartirebbe in italiano.
--
-- `coach_news_tips.translations` è la cache delle traduzioni già generate
-- (una per lingua, scritta dalla Edge Function translate-content): un post
-- si traduce UNA SOLA VOLTA per lingua, non ad ogni apertura da ogni
-- cliente — { "en": {eyebrow,title,body,body_extended}, "es": {...}, ... }.
--
-- Script idempotente.

alter table public.profiles add column if not exists lang text not null default 'it';
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('it', 'en', 'es', 'fr'));

alter table public.coach_news_tips add column if not exists translations jsonb not null default '{}'::jsonb;
