# PERFORM — assemblaggio Vite/React

## Cosa era rotto

I 7 file (`03`→`09`) erano ciascuno una preview isolata con stato locale
proprio (dark mode, genere, piano, tab). Non esisteva un `App.jsx` che
collegasse la navigazione della `AppShell` a viste condivise: ogni schermata
viveva per conto suo — da qui l'effetto "slide di PowerPoint scollegate".

## Cosa è stato fatto

- Creato `src/App.jsx`: gestisce sessione Supabase reale (`AuthScreen` +
  `makeAuth`), e lo stato condiviso — tema, genere, lingua, piano — passato
  come prop a tutte le view.
- `05_HomeDashboard.jsx` e `08_ClientProfileView.jsx`: i default export
  (`HomePreview`, `ClientProfileViewPreview`) ora accettano prop opzionali
  (`gender`, `dark`, `planTier`/`userPlan`, `profileOverride`, ...). Se le prop
  non vengono passate si comportano esattamente come prima (preview
  autonoma, utile per `npm run dev` puntato solo su quel file). Se le prop
  arrivano da `App.jsx`, seguono lo stato condiviso invece di gestirlo da soli.
- `06_NewsTipsView.jsx` non ha richiesto modifiche: il componente
  `NewsTipsView` era già progettato per l'integrazione (`genderOverride`,
  `planOverride`, `meId`, `supabase`).
- Impostazioni (drawer tema/lingua/piano/account) ora vive **una sola volta**
  in `App.jsx`, aperta dall'icona ingranaggio dell'header — prima ogni file
  ne aveva una copia locale indipendente.

## Cosa NON è stato toccato (a proposito)

`07_ClassificaView.jsx` e `09_CoachDashboard.jsx` sono montati così come
sono: non hanno alcuna prop surface (zero parametri sul componente di
default), tutto lo stato è interno. Funzionano e sono raggiungibili dalla
navigazione, ma restano isole — non condividono ancora gender/tema/dati reali
col resto dell'app. Collegarli davvero (dati reali dal coach, XP sincronizzato,
ecc.) è un refactor a parte, non un fix di oggi: sono ~3400 e ~1000 righe di
logica interna che vanno prima esposte come prop, non riscritte al volo.

## Setup locale

```bash
npm install
cp .env.example .env.local   # poi inserisci le tue chiavi Supabase reali
npm run dev
```

## Deploy su Vercel

1. Push del repo su GitHub.
2. Importa il repo su Vercel (framework preset: **Vite**).
3. In *Project Settings → Environment Variables* (sia Production che
   Preview) imposta:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Build command e output directory sono quelli di default di Vite
   (`npm run build`, `dist/`) — non serve configurazione aggiuntiva.

## Validazione già eseguita

- `npm run build` (vite build) → passa, nessun errore di risoluzione import.
- `esbuild` per singolo file (stessa convenzione già in uso nel progetto) →
  tutti e 8 i file (incluso `App.jsx`) passano.

Non testato: comportamento a runtime nel browser (login reale, click-through
di ogni schermata) — va verificato con `npm run dev` collegato al tuo
progetto Supabase reale, cosa che io non posso fare da qui.
