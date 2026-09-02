-- =====================================================================
-- PERFORM — Schema v90 (nuova tabella): rest_timer_notifications
-- Script idempotente.
-- =====================================================================
--
-- Push reale per lo Smart Rest Timer quando l'app è chiusa/in background
-- abbastanza a lungo da non poter più avvisare da sola (beep, vibrazione,
-- Notification() locale — vedi REST_TIMER_KEY in 05_HomeDashboard.jsx,
-- che restano il meccanismo primario mentre l'app è aperta).
--
-- Al massimo UNA riga per utente (user_id è la chiave primaria): stesso
-- principio del timer lato client, "un solo timer di recupero attivo per
-- volta" — avviare un nuovo timer sovrascrive quello precedente, non lo
-- accumula. fire_at è il momento assoluto in cui il recupero finisce
-- (stesso endAt salvato in localStorage lato client). Il client cancella
-- questa riga se il countdown finisce mentre l'app è ancora aperta (niente
-- push doppio dopo che l'atleta ha già visto/sentito l'avviso in-app) o se
-- annulla il timer a mano.
create table if not exists public.rest_timer_notifications (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  fire_at       timestamptz not null,
  exercise_name text,
  created_at    timestamptz not null default now()
);

alter table public.rest_timer_notifications enable row level security;
alter table public.rest_timer_notifications force row level security;

-- Il client gestisce SOLO la propria riga (avvio/annullamento del proprio
-- timer). L'Edge Function che invia i push (rest-timer-push) legge/cancella
-- con la service_role key, che bypassa RLS: non serve una policy select
-- "per il coach" o simili qui.
drop policy if exists "rest_timer_notifications_all_own" on public.rest_timer_notifications;
create policy "rest_timer_notifications_all_own" on public.rest_timer_notifications for all
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

grant select, insert, update, delete on public.rest_timer_notifications to authenticated;
