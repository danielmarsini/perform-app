-- =====================================================================
-- PERFORM — Schema v78: il coach può eliminare un post Avvisi Team
-- =====================================================================
--
-- Gli Avvisi Team sono stati spostati dal modale a megafono (SCHEMA_v77,
-- ora superato) al canale "team" già esistente in News & Tips
-- (coach_news_tips, SCHEMA_v35): quella tabella aveva già le policy di
-- select/insert per il canale 'team' ma NESSUNA policy di delete, quindi
-- il coach non poteva eliminare un post pubblicato per errore.
--
-- Script idempotente.

drop policy if exists "coach_news_tips_delete_team" on public.coach_news_tips;
create policy "coach_news_tips_delete_team" on public.coach_news_tips for delete
  to authenticated using ( channel = 'team' and public.is_coach() );

grant delete on public.coach_news_tips to authenticated;

-- Nota: la tabella team_announcements (SCHEMA_v77) e la colonna
-- profiles.last_seen_announcements_at non sono più usate dall'app — gli
-- Avvisi Team ora vivono su coach_news_tips (channel='team'), che esisteva
-- già da prima. Non le tocchiamo qui: restano presenti ma inutilizzate,
-- puoi eliminarle a mano in futuro se vuoi, non c'è fretta né rischio a
-- lasciarle.
