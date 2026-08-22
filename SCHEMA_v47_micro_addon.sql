-- =====================================================================
-- PERFORM — Schema v47: componente aggiuntivo Micronutrienti per Scheda
-- Personalizzata / Solo Allenamento Coaching.
-- Script idempotente.
-- =====================================================================
--
-- La griglia Micronutrienti (Sodio/Potassio/Ferro/Calcio/Magnesio) è
-- inclusa di default in Full Coaching e in Performance Pack, ma NON nei
-- piani Scheda Personalizzata e Solo Allenamento Coaching: lì è un
-- componente a parte, che il cliente paga in più se lo vuole. Non c'è
-- (ancora) un vero flusso Stripe per acquistarlo separatamente — come per
-- il bypass whitelist, è il coach ad attivarlo a mano quando il cliente lo
-- richiede/paga fuori dall'app.
alter table public.profiles add column if not exists micro_addon boolean not null default false;

comment on column public.profiles.micro_addon is
  'Componente aggiuntivo "Analisi Micronutrienti" per i piani scheda_personalizzata/training (Full Coaching e Performance Pack lo includono già di default) — attivato manualmente dal coach.';
