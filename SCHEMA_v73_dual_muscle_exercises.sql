-- PERFORM — SCHEMA_v73_dual_muscle_exercises.sql
-- ============================================================================
-- Esercizi con DUE gruppi muscolari entrambi al 100% (non uno diretto +
-- sinergici al 50%): per 1 serie allenante se ne sfiniscono due al massimo.
-- exercise_library.direct è già un array — computeVolume() (coachingData.js)
-- itera OGNI elemento di "direct" al 100%, quindi non serve nessuna
-- modifica allo schema o al calcolo del volume: basta scrivere qui i due
-- muscoli diretti invece di uno solo. Il volume settimanale si aggiorna in
-- automatico (anche retroattivamente su schede già assegnate) perché
-- computeVolume legge SEMPRE la classificazione corrente in questa tabella
-- per nome esercizio, mai un valore congelato al momento dell'assegnazione.
--
-- "on conflict do UPDATE" (non "do nothing", a differenza di SCHEMA_v71):
-- alcuni di questi esercizi esistono già in libreria con la vecchia
-- classificazione a un solo muscolo diretto (es. "Front squat", "Affondi
-- bulgari") — qui vengono corretti alla classificazione a doppio target.
-- Fa eccezione "Iperestensioni (focus glutei)", inserita come voce
-- DISTINTA dalla "Iperestensioni" già esistente (focus lombare/schiena):
-- sono due esecuzioni diverse della stessa macchina, non la stessa voce
-- da correggere — chi ha già assegnato "Iperestensioni" classica non deve
-- vedersi cambiare significato sotto ai piedi.
--
-- Da eseguire in Supabase SQL Editor. Idempotente.

insert into public.exercise_library (name, direct, indirect, how_to, avoid, created_by) values
  ('Dip alle parallele (petto)', ARRAY['Petto', 'Tricipiti']::text[], ARRAY['Deltoide Ant']::text[], $q$• Inclina il busto in avanti (25-30°) e porta i gomiti leggermente in fuori: più il busto è inclinato, più lavora il petto rispetto ai tricipiti.
• Scendi controllato finché le spalle scendono sotto i gomiti, senza superare il limite di mobilità della spalla.
• Spingi in alto senza bloccare di scatto i gomiti, mantenendo la scapola leggermente depressa per tutto il movimento.$q$, $q$• Busto verticale con gomiti stretti: trasforma l'esercizio quasi solo in tricipiti, perdendo lo stimolo sul petto.
• Scendere oltre il limite di mobilità della spalla solo per "sentire di più": rischio reale per la cuffia dei rotatori.
• Usare slancio delle gambe o del busto per completare le ultime ripetizioni.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Trazioni supine (chin-up)', ARRAY['Dorsali', 'Bicipiti']::text[], ARRAY['Deltoide Post']::text[], $q$• Presa supina larghezza spalle, parti da braccia completamente distese (dead hang) per il ROM massimo.
• Tira portando il petto verso la sbarra, pensando a "spingere i gomiti verso il basso e indietro", non solo a portare il mento sopra.
• Controlla la fase eccentrica (2-3 secondi in discesa): è dove il coinvolgimento di dorso e bicipite è più alto.$q$, $q$• Kip/slancio delle gambe per aiutarsi a salire: annulla il lavoro muscolare reale nella parte iniziale della trazione.
• ROM parziale (fermarsi a metà salita): riduce drasticamente lo stimolo su dorso e bicipiti.
• Portare solo il mento sopra la sbarra flettendo il collo in avanti, invece di portare il petto verso la sbarra.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Lat machine presa supina', ARRAY['Dorsali', 'Bicipiti']::text[], ARRAY['Deltoide Post']::text[], $q$• Presa supina larghezza spalle, busto leggermente inclinato indietro (10-15°) con petto in fuori.
• Tira la barra verso lo sterno/parte alta dell'addome, portando i gomiti lungo il fianco, non in fuori.
• Rilascia in modo controllato fino a completa estensione delle braccia, senza far "saltare" il peso in fase di stacco.$q$, $q$• Tirare la barra dietro la nuca: rischio inutile per la cuffia dei rotatori, nessun vantaggio reale sul dorso.
• Inclinare troppo il busto indietro usando il peso del corpo per "aiutare" la tirata, invece del dorso.
• Accelerare la fase di ritorno lasciando cadere il peso: si perde la parte eccentrica, la più efficace per l'ipertrofia.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Rematore ai cavi presa stretta a V-bar', ARRAY['Dorsali', 'Trapezio']::text[], ARRAY['Bicipiti', 'Deltoide Post']::text[], $q$• Presa neutra sulla V-bar, busto leggermente inclinato indietro, petto alto, scapole addotte a fine tirata.
• Porta i gomiti indietro lungo i fianchi (non larghi), fino a sfiorare l'addome con la maniglia.
• Termina con una retrazione scapolare attiva di 1 secondo prima di tornare in fase eccentrica controllata.$q$, $q$• Dondolare il busto avanti-indietro per spostare più peso: il dorso lavora meno, la zona lombare rischia di più.
• Gomiti larghi verso l'esterno: sposta il lavoro sui deltoidi posteriori a scapito di dorso e trapezio.
• Tirata parziale senza mai arrivare alla retrazione scapolare finale: si perde la parte più efficace per il trapezio medio.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Squat bilanciere', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori']::text[], $q$• Bilanciere in appoggio alto o basso, piedi larghezza spalle, punte leggermente verso l'esterno.
• Scendi spingendo prima le anche indietro poi piegando le ginocchia, petto alto, schiena neutra per tutto il ROM.
• Scendi almeno fino al parallelo (anca sotto il ginocchio), poi spingi il pavimento via da te in risalita.$q$, $q$• Ginocchia che collassano verso l'interno in risalita: aumenta il rischio di infortunio e riduce l'attivazione di quadricipiti/glutei.
• Squat parziale per caricare più peso: riduce drasticamente lo stimolo reale.
• Perdere la curva lombare neutra sotto carico, soprattutto in uscita dal punto più basso.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Front squat', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori']::text[], $q$• Bilanciere sui deltoidi anteriori, gomiti alti e paralleli al pavimento per tutta la ripetizione.
• Busto il più verticale possibile: sposta più lavoro sui quadricipiti rispetto allo squat classico, con meno stress lombare.
• Scendi mantenendo i gomiti alti fino all'ultimo centimetro: se scendono, il bilanciere perde stabilità.$q$, $q$• Lasciare scendere i gomiti in discesa: il busto si inclina in avanti e il carico si sposta sulla zona lombare.
• Usare un carico da back squat: il front squat richiede meno peso per lo stesso stimolo su quadricipiti.
• Forzare una presa scomoda con mobilità di polso insufficiente: meglio la presa a braccia incrociate.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Leg press 45°', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori']::text[], $q$• Piedi larghezza spalle a metà pedana, schiena e bacino sempre a contatto con lo schienale.
• Scendi fino a un angolo ginocchio-anca di circa 90° (o dove la zona lombare stacca dallo schienale), controllando l'eccentrica.
• Spingi senza bloccare mai completamente le ginocchia a fine spinta, per mantenere tensione su quadricipiti e glutei.$q$, $q$• Far staccare il bacino dallo schienale in fondo alla discesa: scarica la fase eccentrica sulla zona lombare invece che sulle gambe.
• Bloccare le ginocchia in estensione completa a ogni ripetizione: scarica il peso sulle articolazioni.
• Piedi troppo bassi sulla pedana: aumenta lo stress sul ginocchio e riduce il coinvolgimento di glutei/femorali.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Hack squat', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori']::text[], $q$• Spalle e schiena ben ancorate al supporto, piedi leggermente avanti rispetto al bacino per proteggere il ginocchio.
• Scendi controllato fino a circa 90° di flessione del ginocchio, tallone sempre a contatto con la pedana.
• Risali spingendo con tutta la pianta del piede, senza staccare i talloni.$q$, $q$• Piedi troppo bassi/stretti sulla pedana: aumenta lo stress sul ginocchio senza benefici reali.
• Staccare i talloni in risalita: sposta il lavoro su caviglie/polpacci e riduce la stabilità.
• ROM eccessivo con schiena che si stacca dal supporto: rischio lombare inutile.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Affondi bulgari', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori', 'Femorali']::text[], $q$• Piede posteriore su una panca/rialzo, gamba anteriore a circa un passo e mezzo di distanza.
• Scendi verticale, busto leggero in avanti per caricare di più i glutei, o più verticale per caricare di più il quadricipite.
• Spingi con il tallone del piede anteriore per tornare su, ginocchio in linea con la punta del piede.$q$, $q$• Ginocchio anteriore che supera troppo la punta del piede in modo incontrollato con peso elevato.
• Appoggiarsi troppo sulla gamba posteriore (sulla panca): riduce il lavoro sulla gamba target.
• Busto che crolla in avanti in modo incontrollato per compensare la fatica.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Affondi manubri', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori', 'Femorali']::text[], $q$• Passo in avanti ampio, scendi finché il ginocchio posteriore sfiora il pavimento, busto eretto e core attivo.
• Il ginocchio anteriore resta sopra la caviglia per tutto il movimento.
• Spingi con il tallone anteriore per tornare in piedi, alternando le gambe con controllo, non con slancio.$q$, $q$• Passo troppo corto: il ginocchio anteriore va troppo avanti rispetto alla caviglia, sovraccaricando l'articolazione.
• Busto che si inclina troppo in avanti senza intenzione: sposta lo stimolo e destabilizza l'equilibrio.
• Rimbalzare sul ginocchio posteriore a terra invece di usare la forza muscolare.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Affondi camminati', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori', 'Femorali']::text[], $q$• Passo lungo in avanti, scendi fino a sfiorare il ginocchio posteriore a terra, poi spingi in avanti per proseguire il passo successivo.
• Busto eretto e bacino stabile, senza oscillazioni laterali a ogni passo.
• Usa manubri o bilanciere in base al livello di controllo dell'equilibrio.$q$, $q$• Passi troppo corti e frequenti: riduce il ROM e quindi lo stimolo su quadricipiti e glutei.
• Perdere la stabilità del bacino per la fatica accumulata sui passi finali.
• Guardare in basso invece che avanti: peggiora equilibrio e postura del busto.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Affondi inversi', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori', 'Femorali']::text[], $q$• Dalla posizione eretta, fai un passo indietro con una gamba, scendendo fino a sfiorare il ginocchio posteriore a terra.
• Il ginocchio anteriore resta sopra la caviglia; il peso rimane soprattutto sul tallone del piede anteriore.
• Spingi sul tallone anteriore per tornare alla posizione di partenza, controllando il ritorno.$q$, $q$• Spostare troppo peso sul piede posteriore durante la discesa: riduce il lavoro sulla gamba target.
• Passo indietro troppo corto: limita il ROM utile su quadricipiti e glutei.
• Busto che si inclina in avanti in modo incontrollato per compensare uno squilibrio.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Step-up', ARRAY['Quadricipiti', 'Glutei']::text[], ARRAY['Adduttori', 'Femorali']::text[], $q$• Piede appoggiato interamente su un rialzo ad altezza ginocchio o poco sopra, spingi con il tallone di quel piede per salire.
• Sali fino a estensione completa dell'anca in cima, senza iperestendere la schiena, poi scendi controllato con la stessa gamba.
• Busto verticale per tutto il movimento, senza slancio delle braccia per "aiutarsi".$q$, $q$• Spingersi con il piede a terra invece che con quello sul rialzo: annulla il lavoro muscolare mirato.
• Rialzo troppo alto rispetto alla mobilità dell'anca: costringe a inclinare il busto e perdere tensione sul gluteo.
• Scendere "a caduta" invece che in modo controllato: perde la fase eccentrica, la più efficace per l'ipertrofia.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Stacco rumeno bilanciere', ARRAY['Femorali', 'Glutei']::text[], ARRAY['Adduttori', 'Lombari']::text[], $q$• Parti in piedi con bilanciere alle cosce, ginocchia leggermente flesse (angolo fisso per tutto il movimento).
• Spingi le anche indietro mantenendo il bilanciere a contatto con le gambe, schiena neutra, finché senti un forte stretch sui femorali.
• Risali spingendo le anche in avanti (non estendendo la schiena), contraendo glutei e femorali in cima.$q$, $q$• Flettere troppo le ginocchia trasformandolo in uno squat: sposta il lavoro dai femorali ai quadricipiti.
• Arrotondare la schiena per scendere più in basso a tutti i costi: rischio serio per la colonna lombare.
• Allontanare il bilanciere dalle gambe durante la discesa: aumenta il braccio di leva sulla zona lombare inutilmente.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Stacco a gambe tese', ARRAY['Femorali', 'Glutei']::text[], ARRAY['Adduttori', 'Lombari']::text[], $q$• Simile allo stacco rumeno ma con ginocchia quasi completamente estese: più stretch su femorali, meno margine di errore sulla tecnica.
• Bilanciere sempre a contatto con le gambe, schiena neutra, scendi solo fino al punto dove riesci a mantenerla piatta.
• Risali spingendo le anche in avanti, senza mai perdere la tensione sui femorali.$q$, $q$• Bloccare completamente le ginocchia (iperestensione): aumenta inutilmente lo stress articolare senza beneficio muscolare.
• Scendere oltre il punto di tenuta della schiena neutra solo per "vedere più ROM": rischio lombare ancora più alto che nello stacco rumeno.
• Usare un carico da stacco rumeno classico: con le ginocchia quasi tese il carico gestibile in sicurezza è sempre inferiore.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Hip thrust bilanciere', ARRAY['Glutei', 'Femorali']::text[], ARRAY['Adduttori', 'Quadricipiti']::text[], $q$• Schiena superiore appoggiata a una panca, bilanciere sul bacino (con protezione), piedi larghezza spalle vicino ai glutei.
• Spingi con i talloni, estendendo l'anca fino ad allineamento ginocchia-anca-spalle, senza iperestendere la zona lombare in cima.
• Contrai i glutei con forza per 1 secondo in cima prima di scendere controllato.$q$, $q$• Iperestendere la schiena in cima per "salire di più": sposta lo stimolo dai glutei alla zona lombare.
• Spingere sulle punte dei piedi invece che sui talloni: riduce l'attivazione del gluteo a favore del quadricipite.
• Piedi troppo distanti o vicini al bacino: riduce l'efficacia nel punto di massima contrazione.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Glute bridge', ARRAY['Glutei', 'Femorali']::text[], ARRAY['Adduttori', 'Quadricipiti']::text[], $q$• Sdraiato a terra (o su un rialzo basso), ginocchia flesse, piedi larghezza spalle vicino ai glutei.
• Spingi con i talloni sollevando il bacino fino ad allineamento ginocchia-anca-spalle, contraendo i glutei con forza in cima.
• Utile come introduzione all'hip thrust (meno ROM, più semplice) o come finisher ad alte ripetizioni.$q$, $q$• ROM eccessivo forzando un'iperestensione lombare in cima: il ROM naturale qui è più corto che nell'hip thrust.
• Spingere con le punte dei piedi anziché con i talloni: riduce l'attivazione del gluteo.
• Velocità eccessiva senza la pausa contratta in cima: perde l'elemento chiave, la contrazione volontaria del gluteo.$q$, (select id from auth.users where email = 'danielmarsini@coach.com')),
  ('Iperestensioni (focus glutei)', ARRAY['Glutei', 'Femorali']::text[], ARRAY['Lombari']::text[], $q$• Bacino appoggiato sul cuscinetto (leggermente più in basso rispetto alla variante lombare classica), gambe quasi tese.
• Il movimento parte dall'anca (hip hinge), non dalla zona lombare: schiena neutra per tutto il ROM, senza inarcarla in cima.
• Risali contraendo attivamente i glutei fino alla linea retta busto-gambe, senza andare oltre.$q$, $q$• Risalire oltre la linea retta inarcando la zona lombare: il lavoro passa dai glutei alla bassa schiena.
• Piegare eccessivamente le ginocchia durante il movimento: riduce lo stretch sui femorali.
• Usare slancio/rimbalzo in basso invece di un movimento controllato: perde la tensione muscolare continua.$q$, (select id from auth.users where email = 'danielmarsini@coach.com'))
on conflict (name) do update set
  direct = excluded.direct,
  indirect = excluded.indirect,
  how_to = excluded.how_to,
  avoid = excluded.avoid;
