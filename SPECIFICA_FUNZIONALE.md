# PERFORM — Specifica funzionale completa
### Evidence-Based Method by D. Marsini

Questo documento raccoglie tutto quello che è stato deciso nelle chat di progettazione, come riferimento unico per capire cosa l'app **deve** fare quando è finita — separato da cosa è **già collegato davvero** oggi. Usalo come metro quando trovi un bug: "secondo la specifica dovrebbe fare X, invece fa Y".

---

## 1. Autenticazione e accesso

- Login email/password, registrazione con conferma via **codice OTP a 6 cifre** (non link), recupero password.
- Alla registrazione: nome/cognome, email, password, data di nascita, **sesso biologico** (obbligatorio — calibra target idrici, range bio-marker, sezione ciclo per le donne).
- **3 consensi legali obbligatori e bloccanti**: (1) GDPR dati sensibili e foto, (2) Esonero responsabilità medica, (3) Clausola database cibi crowdsourced + privacy dei post social (foto visibili alla community, ma cartella clinica/esami visibili solo al coach).
- Dopo la registrazione, se lo stato è "unpaid": schermata di selezione piano (vedi sezione 5) prima di poter accedere alla Home.

## 2. Home cliente — i 4 pilastri

**Allenamento**
- Scheda assegnata dal coach, organizzata per split settimanale.
- Per ogni esercizio: serie, reps target, RIR target, tecnica di intensità (es. Rest-Pause), tempi di recupero, storico carichi/reps delle sessioni precedenti.
- Riprogrammazione automatica dello split se una sessione viene saltata (auto-reschedule).

**Alimentazione**
- Target macro/kcal **differenziati per giorno ON (allenamento) e OFF (riposo)**, assegnati dal coach.
- Diario pasti con database alimenti condiviso e crescente (stile MyFitnessPal — ogni scansione/inserimento manuale arricchisce il catalogo per tutti).
- Generazione automatica di alimenti sostitutivi equivalenti (stessi macro, food diverso).
- 4 momenti della giornata per il piano ON/OFF (solo piano Full Coaching, vedi sezione 5).

**Integrazione**
- Checklist supplementi per momento della giornata (mattina/pre-workout/post-workout/sera), spuntabile.

**Sonno, passi, recupero**
- Sonno (inizio/fine/ore), passi, acqua (con target personalizzato), RHR, HRV, sonno REM, stress, caffeina (mg + orario).
- Cerchi di compliance biometrica (stile Apple Watch) su allenamento/nutrizione/recupero.
- Check settimanale automatico Domenica/Lunedì che blocca la navigazione finché non viene compilato.

## 3. News, Tips, Avvisi Team

Tre canali indipendenti, sola lettura:
- 🔬 **News** — scoperte scientifiche, fonte PubMed, scade dopo 48h, salvabile in Cassaforte (da quel momento non scade più).
- 💡 **Tips** — pillole pratiche di bio-hacking, stessa scadenza 48h.
- 📢 **Avvisi Team** — bacheca del coach, **nessuna scadenza**, **nessuna chat AI** a prescindere dal piano dell'utente.
- Chat "Fai una domanda a PERFORM AI" su News/Tips: bloccata (sfocata, glassmorphism) se piano FREE, sbloccata da Performance Pack in su.

## 4. Classifica XP e gamification

- Classifica pubblica mensile, top 10 + podio 3D animato.
- XP guadagnati da azioni reali nell'app (allenamento loggato, check-in, streak).
- Streak giornaliero, si azzera se passano più di 24h senza attività registrata.
- Archivio storico mensile consultabile (mesi passati, non solo quello corrente).
- Livelli con nomi fissi non tradotti: RECRUIT → HARDWORKER → IRON MIND → BIO-HACKER.

## 5. Profilo cliente e i 5 piani di abbonamento

| Piano | Prezzo | Sblocca |
|---|---|---|
| **FREE** | €0/mese | Diario libero autogestito (dieta, carichi, integrazione, passi, sonno). Nessun grafico storico, nessuna AI. |
| **Performance Pack** | €5/mese | PERFORM AI per ottimizzare diete e fare domande ai report scientifici. Grafici storici 2D avanzati (Sonno, Passi, HRV) stile Apple Salute. |
| **Scheda Personalizzata** | €40 una tantum | Scheda su misura dal coach, 2 settimane di follow-up, video review esecuzioni. |
| **Solo Allenamento Coaching** | €50/mese | Scheda continua su misura, video review, check settimanale, supporto WhatsApp H24. |
| **Full Coaching Supremo** | €60/mese | Tutto il pacchetto + calcolo macro completo, dieta ON/OFF a 4 momenti giornalieri, sostituzioni automatiche alimenti/esercizi, integrazione d'élite, WhatsApp dedicato 24/7. |

- Card del piano Full Coaching evidenziata con badge "Consigliato".
- Selezione lingua (🇮🇹🇬🇧🇪🇸🇫🇷) con traduzione istantanea di profilo, piani, impostazioni.
- Tema Oro (uomo) / Rosa Cipria (donna), entrambi in Onyx o Light.

## 6. Pannello Coach — la regia

**Gestione clienti**
- Rubrica alfabetica clienti, **3 reparti**: Attivi, In attesa, Scaduti.
- Per ogni cliente: anamnesi (56 domande in 9 aree), check settimanali con confronto foto e grafici peso/circonferenze, bioritmi (HRV/sonno/passi), editor piani (dieta + allenamento).
- Editor multi-settimana: pianificazione fino a 12 settimane avanti, storico illimitato indietro, funzione "Clona settimana", blocchi di periodizzazione con calcolo automatico settimana di scarico.

**Accesso diretto / Whitelist**
- Pannello "Gestione Whitelist": il coach inserisce l'email di un cliente/amico e attiva due toggle:
  - **Bypass Pagamento Stripe** — forza lo stato a "paid" senza passare da Stripe.
  - **Bypass Anamnesi** — salta le 56 domande, stato diretto ad "active".
- Uso tipico: clienti storici, casi speciali, test interni.

**Finanziario**
- MRR (ricavo ricorrente mensile), proiezione annuale, registro transazioni, grafico crescita ricavi — a specchio di Stripe.

**Rete e controllo accessi**
- Tabella utenti globale con ultimo accesso.
- Visualizzatore credenziali provvisorie (non le password vere — Supabase le cifra in modo irreversibile, questo è un limite tecnico non aggirabile).

## 7. Timing e sblocchi — riepilogo

| Evento | Timing |
|---|---|
| Anamnesi inviata dal cliente | Timer visivo "Consegna entro 48 ore" sul profilo |
| News/Tips pubblicati | Scadono dopo 48h, salvo salvataggio in Cassaforte |
| Check settimanale | Si attiva da solo Domenica/Lunedì, blocca la navigazione finché non compilato |
| Streak | Si azzera se >24h senza attività registrata |
| Sessione allenamento saltata | Riprogrammazione automatica dello split |

---

## Stato attuale — cosa è reale oggi, cosa è ancora vuoto

**Collegato davvero a Supabase:**
- Login/registrazione/OTP, ruolo coach vs cliente
- Target macro/kcal assegnati dal coach → letti veramente in Home (tabella `nutrition_targets`)
- Scheda del giorno assegnata dal coach → letta veramente in Home (tabella `workout_logs`, righe `is_read_only`)

**Ancora isole autonome, non collegate a dati reali condivisi:**
- Classifica XP (`07_ClassificaView.jsx`) — dati finti locali
- Gran parte del Pannello Coach esistente (`09_CoachDashboard.jsx`) — bellissimo esteticamente, ma dati finti locali, nessuna scrittura reale eccetto il pannello "Assegna scheda/target" che ho aggiunto a parte
- Whitelist/bypass Stripe-Anamnesi — mai implementato nel codice assemblato, solo progettato nelle chat originali
- Sonno/passi/acqua/RHR/HRV del cliente — ancora stato locale del browser, mai salvati su `checkins`
- Compilazione reps/carichi durante l'allenamento — locale, non ancora scritta su `workout_logs`
- Stripe — nessun collegamento reale, il click su un piano non fa nulla di persistente
- News/Tips/Classifica AI chat — mai collegate a un vero endpoint Claude API (serve un Edge Function proxy, la chiave API non deve mai stare nel frontend)
