-- PERFORM — SCHEMA_v48_chat_messages.sql
-- ============================================================================
-- Chat diretta in-app coach <-> cliente: prima non esisteva, la comunicazione
-- viveva fuori dall'app (WhatsApp). Una riga = un messaggio, sempre legato al
-- cliente della conversazione (client_id) e a chi l'ha scritto (sender_id) —
-- basta questo per distinguere i due lati senza una tabella "conversazioni"
-- separata, dato che ogni cliente ha una sola conversazione: quella col coach.
--
-- Da eseguire in Supabase SQL Editor. Idempotente (IF NOT EXISTS ovunque
-- possibile): si può rilanciare senza rompere nulla se già eseguito in parte.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists chat_messages_client_id_created_at_idx
  on public.chat_messages (client_id, created_at);

alter table public.chat_messages enable row level security;

-- Il cliente vede/scrive solo la propria conversazione (client_id = se stesso).
-- Il coach (unico riconoscimento reale nell'app: l'email, mai profiles.role —
-- vedi COACH_EMAIL in 04_AppShell.jsx/App.jsx) vede/scrive su QUALSIASI
-- conversazione, per rispondere a qualunque cliente.
drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages for select
  using (
    client_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'danielmarsini@coach.com'
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      client_id = auth.uid()
      or (auth.jwt() ->> 'email') = 'danielmarsini@coach.com'
    )
  );

-- Solo per segnare come letti i messaggi dell'altra parte (read_at) — mai il
-- contenuto (body), che resta immutabile una volta inviato.
drop policy if exists "chat_messages_update_read" on public.chat_messages;
create policy "chat_messages_update_read" on public.chat_messages for update
  using (
    client_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'danielmarsini@coach.com'
  )
  with check (
    client_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'danielmarsini@coach.com'
  );

-- Realtime: la Chat ascolta gli INSERT live (stesso principio già in uso per
-- coach_news_tips, vedi 06_NewsTipsView.jsx) — serve pubblicare la tabella.
alter publication supabase_realtime add table public.chat_messages;
