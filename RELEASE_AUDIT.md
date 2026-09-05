# PERFORM — Release readiness audit (global-market restructuring)

Audit onesto dello stato del branch `claude/focused-heisenberg-mtv2k9` (PR #212)
rispetto ai 4 pilastri del goal "ristruttura e potenzia perform-app per il
mercato globale". Non certifica "pronto per il mercato globale" come stato
assoluto — quello richiede verifiche che un agente di codice non può fare da
solo (vedi §5). Certifica invece, con precisione, cosa è stato costruito,
testato e verificato, e cosa resta da fare e da chi.

Generato: 2026-09-05. Base: `git log --oneline 25d8ad5..HEAD` (10 commit).

## 1. Stato di verifica automatica

- `npx vite build`: pulito, nessun errore. Bundle principale >500kB
  (warning esistente pre-sessione, non introdotto qui — vedi §4).
- `npm test -- --run`: **173/173 test passati** (5 file: units, biometrics,
  coachingData, useDragReorder, offlineQueue).
- Nessuna modifica a schema SQL già applicato — solo colonne/tabelle
  aggiuntive, sempre `if not exists`/idempotenti.

## 2. Per pilastro

### 2.1 Internazionalizzazione (i18n)
- i18next + react-i18next integrati, inizializzazione da `profiles.lang`
  (stessa fonte di verità del vecchio dizionario `translations` in
  08_ClientProfileView.jsx — mai due stati lingua paralleli).
- 3 lingue complete: it/en/es (+ fr ereditato dal vecchio dizionario).
  Selettore fluido già esistente in Impostazioni → Aspetto (bandiere,
  invariato da prima di questa sessione, verificato funzionante).
- Copertura reale: bottom nav, header Chat/Classifica, le 4 etichette di
  sezione (Allenamento/Alimentazione/Recupero/Integrazione) ovunque
  appaiono (tile Home, cerchi compliance, header sotto-schermate).
- **Non tradotto**: la maggioranza delle stringhe di corpo (descrizioni,
  placeholder, messaggi di errore) nei componenti più grandi
  (05_HomeDashboard.jsx, 12.000+ righe) resta in italiano hardcoded. Una
  copertura "tutti i testi dell'interfaccia" letterale richiederebbe
  estrarre e tradurre ordini di grandezza in più di stringhe — lavoro
  meccanico ma non piccolo, onestamente fuori scope per il tempo di
  questa sessione. Prossimo incremento suggerito: dare priorità a
  Allenamento/Alimentazione/Integrazione (le schermate più usate) prima
  del resto.

### 2.2 Dual-unit (Metric/Imperial)
- `src/lib/units.js`: conversioni kg⇄lbs, cm⇄inch, arrotondamento
  epsilon-safe, gestione esplicita di stringa vuota/null (mai un falso
  zero). 10 unit test dedicati, incluso un test di drift su 50 cicli
  format→parse.
- Storage canonico sempre metrico in DB — l'unità scelta è solo un filtro
  di visualizzazione/input, mai la fonte di verità. Verificato in:
  logging serie (ExerciseCard), check-in settimanale (peso/circonferenze),
  anamnesi (peso/altezza/peso-target).
- **Non esteso**: altri numeri fisici sparsi nel codice (es. eventuali
  campi cardio/GPS in km vs miglia) non sono stati auditati in questa
  sessione — nessuna evidenza di bug lì, ma nemmeno una verifica esplicita.

### 2.3 Digital Twin (biometria predittiva)
- `computeOverreachAlert` (lib/biometrics.js): confronto basale (7gg) vs
  recente (3gg) su HRV, RHR, sonno — soglie da letteratura (Plews 2013,
  Buchheit 2014, Bourdon 2017, Helms "Muscle and Strength Pyramid" per
  l'autoregolazione del volume). Ritorna `null` esplicito con dati
  insufficienti — mai un alert inventato. 37 test in biometrics.test.js.
- Superficie UI: banner proattivo in Home, dettaglio nel popup Recupero, e
  — l'incremento più concreto — un **target numerico di serie** calcolato
  nella card Volume settimanale ("con N serie pianificate, scendi a X-Y").
- **Bug reale trovato e corretto**: RHR/HRV "di oggi" usavano un
  placeholder demo costante ("58"/"62") anche in modalità reale,
  contaminando silenziosamente il calcolo — corretto in questa sessione.
- Integrazione Whoop (HRV/RHR reali): schema (`whoop_tokens` RLS
  deny-by-default + `profiles.whoop_connected/whoop_last_sync`), 3 Edge
  Function (oauth-callback/sync/disconnect), UI in Impostazioni.
  Endpoint/campi API verificati via ricerca web prima di scrivere il
  codice (non indovinati) — ma **mai testato contro un account Whoop
  reale** (nessuna credenziale disponibile in questa sessione). Limite
  noto e documentato nel codice: la data di un recovery usa `created_at`
  troncato in UTC, non il fuso orario reale dell'atleta.
  **Bloccante per l'uso reale**: serve un account Whoop Developer
  (`WHOOP_CLIENT_ID`/`WHOOP_CLIENT_SECRET`) — vedi §5.
- Apple Health / Health Connect: **non implementabile da questa
  architettura** (PWA web pura) — richiedono un'app nativa con
  entitlement (Capacitor o simile), fuori scope per un cambiamento
  solo-codice. Non è stato tentato né inventato un finto collegamento.

### 2.4 Offline-first
- `offlineQueue.js`: backoff esponenziale (cap 5 min) per voce in coda,
  evita "retry storm" su errori non di rete. 4 test dedicati.
- Apertura istantanea offline: Allenamento e Alimentazione erano già a
  posto; **Integrazione aveva un gap reale** (nessuna cache-seed su
  cold-open, sia piano Pro assegnato dal coach sia diario autogestito
  Free/Performance) — trovato e corretto in questa sessione, stesso
  pattern di localCache.js già in uso altrove.
- Dexie.js: valutato e scartato a favore di IndexedDB nativo + wrapper
  minimo (già in uso, funzionante, testato) — nessun beneficio concreto
  identificato che giustificasse la dipendenza aggiuntiva.
- **Non verificato in questa sessione**: comportamento su una vera
  interruzione di rete in un dispositivo reale (aereo/spegnimento wifi a
  metà scrittura) — solo verificato a livello di logica/unit test.

## 3. Commit di questa sessione (branch `claude/focused-heisenberg-mtv2k9`)

```
a85f441 Digital Twin: banner proattivo in Home + dual-unit su check-in settimanale
004d5d5 Dual-unit: estendi conversione a peso/altezza/target nell'anamnesi
9326062 i18n: estendi copertura a header Chat e Classifica
29621d1 Offline-first: apertura istantanea Integrazione anche a rete assente
411f924 i18n: estrai i 4 nomi di sezione (Allenamento/Alimentazione/Recupero/Integrazione)
99825ba Digital Twin: target di volume concreto in Volume settimanale
1d95dda Fix bug: RHR/HRV di oggi usavano un placeholder demo anche in modalità reale
047280c Digital Twin: integrazione reale Whoop (HRV/RHR) per il motore di sovraccarico
faf3f53 Security: valida redirectUri in whoop-oauth-callback (stesso allowlist di Stripe)
```

## 4. Debito tecnico noto (pre-esistente, non introdotto in questa sessione)

- Bundle JS principale >500kB dopo minificazione — code-splitting
  parziale già presente (vedi task #240 storico), non ulteriormente
  affrontato qui.
- i18n: copertura parziale (vedi §2.1).

## 5. Checklist per il merge e il lancio — azioni che richiedono te, non altro codice

- [ ] Eseguire `SCHEMA_v92_unit_system.sql` su Supabase (SQL Editor,
      idempotente, ~4 righe).
- [ ] Eseguire `SCHEMA_v93_whoop_integration.sql` su Supabase (idempotente).
- [ ] Registrare un'app su [developer.whoop.com](https://developer.whoop.com),
      impostare `VITE_WHOOP_CLIENT_ID` (Vercel) e `WHOOP_CLIENT_ID`/
      `WHOOP_CLIENT_SECRET` (secret delle Edge Function Supabase), registrare
      il Redirect URL esatto dell'app nel Whoop Developer Dashboard.
- [ ] Deploy delle 3 nuove Edge Function (`whoop-oauth-callback`,
      `whoop-sync`, `whoop-disconnect`) su Supabase.
- [ ] Test manuale end-to-end del collegamento Whoop con un account reale
      (nessun modo di farlo da questa sessione).
- [ ] QA su dispositivo reale (iPhone + Android almeno), inclusa una prova
      reale di rete assente in palestra.
- [ ] Revisione umana della traduzione EN/ES (fatta da un agente, non da un
      madrelingua) prima di considerarla pubblica.
- [ ] Se destinata agli store: asset/testi store in 3 lingue, ToS/privacy
      policy tradotte, revisione legale — nessuna di queste è una modifica
      di codice.

Questo documento è lo stato di fatto onesto al termine della sessione, non
una promessa di "pronto al 100%": i pilastri 1/2/4 sono in stato solido e
testato per quanto un agente di codice può verificare da solo; il pilastro
3 (Digital Twin) ha l'infrastruttura completa ma resta non testato contro
un vero dispositivo Whoop, bloccato in modo strutturale sulle credenziali
del punto 5.
