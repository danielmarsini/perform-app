/* ============================================================================
   PERFORM · ClientProfileView.jsx  (ex 07_ClientProfile.jsx)
   Coach Daniel Marsini — Area Profilo Atleta

   Contenuto:
     1. i18n ................. selettore lingua, dizionario IT/EN/ES/FR
     2. Utilità .............. badge XP, testo gradiente animato, grafico peso
     3. ClientProfileView .... vista Atleta unica: avatar, XP, Archivio Check
     4. SettingsDrawer ....... Onyx, notifiche, paywall Stripe a 5 piani, privacy
     5. Anteprima ............ da eliminare in produzione

   REVISIONE 4 — internazionalizzazione, gradienti animati, profilo puro
   - Titoli di sezione e prezzi dei 5 piani ora usano GradientText: gradiente
     animato a 3 stop, Oro Lucido Vivo (#D4AF37→#F3E5AB→#AA7C11) per uomo,
     Rosa Cipria Luminescente (#E5C1CD→#F4E0E6→#C896A6) per donna, in base a
     `userGender` da Supabase. Animazione via background-position, GPU-friendly.
   - Card "FULL COACHING SUPREMO" con micro-bordo luminescente colore brand e
     badge fisso bilingue "CONSIGLIATO / RECOMMENDED" (testo dato letteralmente
     dal committente, non passa dal motore di traduzione).
   - Motore i18n a 4 lingue (IT/EN/ES/FR): oggetto `translations`, selettore a
     bandiere sotto l'avatar, traduzione istantanea di profilo, piani Stripe
     e impostazioni.
   - RIMOSSO: CoachClientRoster e ogni riferimento a reparti Attivi/In
     attesa/Scaduti — quella gestione ora vive in CoachDashboard.jsx. Chiunque
     apra questo file (atleta o coach in test) vede solo la vista Atleta.
   - RIMOSSA la tab "Template" di SettingsDrawer (era solo per il coach):
     restano Aspetto, Notifiche, Abbonamento, Privacy per chiunque.
   - Rimossa la sezione "Record personali" dalla vista principale: la vista
     Atleta ora mostra esattamente avatar, nickname, XP e Archivio Check, come
     da specifica. Se ti serve ancora, la ripristino in due minuti: il codice
     (WeightChart, badge, Section) resta tutto disponibile e riusabile.
   - Logica OWNER: se l'email account è danielmarsini@coach.com, la card Full
     Coaching mostra "👑 PROPRIETARIO / OWNER" al posto del bottone d'acquisto.
   ========================================================================== */

import React, { useState, useRef, useEffect } from "react";
import {
  User, Camera, Pencil, Check, X, ChevronDown, ChevronUp, Settings, Moon, Sun,
  ShieldCheck, CreditCard, Trash2, FileText, ExternalLink, TrendingDown, Crown, Trophy, Loader2, MessageCircle, Video,
} from "lucide-react";
import { computeRealXpAndStreak, xpToLevelInfo, fetchCheckins, getCheckinPhotoUrl, fetchExerciseRecords, fetchFavoriteExercises, saveFavoriteExercises, saveProfileDetails, fetchProfileDetails, uploadAvatar, fetchLegalConsents, recompositionReading, LEVEL_TIERS, LEVELS_PER_TIER, fetchUnreadChatCount } from "../lib/coachingData.js";
import { isSoundEnabled, setSoundEnabled, playSound } from "../lib/sounds.js";
import { haptic } from "../lib/haptics.js";
import ChatThread from "./ChatThread.jsx";
import TechniqueVideoPanel from "./TechniqueVideoPanel.jsx";
import { isPushSupported, getBrowserPushSubscription, subscribeToPush, unsubscribeFromPush } from "../lib/pushNotifications.js";
import Portal from "./Portal.jsx";
import SwipeHandle from "./SwipeHandle.jsx";
import { useSwipeDownClose } from "../lib/useSwipeGesture.js";
import { WeeklyCheckModal, PauseSection } from "./05_HomeDashboard.jsx";
import { CONSENT_COPY } from "./03_AuthView.jsx";

/* ============================================================================
   1 · INTERNAZIONALIZZAZIONE
   ========================================================================== */

export const LANGS = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
];

export const translations = {
  it: {
    settingsTitle: "Impostazioni",
    tabs: { aspetto: "Aspetto", notifiche: "Notifiche", piano: "Abbonamento", privacy: "Privacy" },
    editProfile: "Modifica profilo",
    save: "Salva", cancel: "Annulla",
    nicknameLabel: "Nickname pubblico",
    bioLabel: "Bio · massimo 160 caratteri",
    bioPlaceholder: "Due righe su di te: sport, obiettivo, una frase.",
    nicknameHint: "Il nickname è ciò che vedono gli altri atleti: cambia subito in Home e nella classifica. Il nome vero non è mai pubblico.",
    langLabel: "Lingua",
    stats: { level: "Livello", xp: "XP", streak: "Streak", rank: "Classifica" },
    records: {
      title: "I miei traguardi",
      sub: (n) => `${n} esercizi tracciati`,
      filterAll: "Tutti", filterFavorites: "Preferiti",
      emptyAll: "Registra gli allenamenti in Home, nella scheda che ti ha impostato il coach: le progressioni compaiono qui, settimana per settimana.",
      emptyFavorites: "Non hai ancora esercizi preferiti: tocca la stella su quelli che vuoi tenere d'occhio — utile se fai powerlifting o se vuoi seguire da vicino un distretto carente.",
      compoundTag: "Multiarticolare",
      weekLabel: "Sett.", lastSession: "Ultima seduta", vsPrev: "vs settimana precedente",
      favoriteAdd: "Aggiungi ai preferiti", favoriteRemove: "Rimuovi dai preferiti",
      noProgressionData: "Serve almeno una seduta registrata per questo esercizio.",
    },
    archive: {
      title: "Il Mio Archivio Check",
      subReady: (n) => `${n} check di peso · sola lettura`,
      subEmpty: "Nessun check ancora",
      weightTrend: "Andamento del peso",
      deltaPrefix: "Dal primo check:", deltaSuffix: "si aggiorna ogni lunedì con il check",
      photoGallery: "Galleria foto personali · Fronte · Lato · Retro",
      compareTitle: "Confronto mensile",
      compareHint: "Una foto al mese, dal giorno dell'iscrizione: scegli due mesi da confrontare.",
      compareA: "Mese A", compareB: "Mese B",
      timelineTitle: "Cronologia completa",
      photoEmpty: "Le foto del check si aggiungono ogni mese, a partire dal giorno dell'iscrizione.",
      photoLabels: ["Frontale", "Laterale", "Posteriore"],
      photoAbsent: "Assente",
      photoFooter: "Visibili solo a te e a Coach Daniel. Archivio in sola lettura: una nuova foto al mese, salvata automaticamente dal giorno dell'iscrizione.",
      noWeightData: "Servono almeno due check per disegnare la curva.",
    },
    darkModeOnyx: "Dark Mode Onyx",
    notif: {
      title: "Reminder push",
      meals: "Pasti", mealsDesc: "Un promemoria se un pasto resta vuoto oltre l'orario abituale.",
      steps: "Passi", stepsDesc: "Avviso serale se sei sotto la soglia giornaliera.",
      sleep: "Sonno", sleepDesc: "Promemoria per registrare l'orario di addormentamento.",
      motivation: "Pop-up motivazionali", motivationDesc: "Messaggi sui record e nelle settimane difficili.",
      footer: "Le notifiche non sostituiscono il tuo giudizio: se una ti dà fastidio, spegnila.",
    },
    plan: {
      activeTitle: "Piano attivo", chooseTitle: "Seleziona il tuo Piano PERFORM",
      manageBilling: "Gestisci pagamento e rinnovo",
      billingNote: "Il portale è gestito da Stripe: da lì aggiorni la carta, scarichi le fatture o disdici il rinnovo.",
      freeRenew: "Nessun rinnovo: l'uso base è gratuito per sempre.",
      oneTimeRenew: "Acquisto una tantum, nessun rinnovo automatico.",
      autoRenew: (d) => `Rinnovo automatico il ${d}`,
      subscribed: "Abbonamento attivo",
      current: "Piano attuale",
      freeCta: "Torna al Free", oneTimeCta: "Acquista ora", switchCta: "Passa a questo piano",
    },
    plans: {
      free:        { name: "Free", includes: ["Diario libero autogestito: dieta, carichi, integrazione, passi e sonno"],
                     excludes: ["Nessun coach reale che segue i tuoi progressi", "Nessuna scheda o dieta personalizzata", "Nessun assistente AI", "Nessun grafico storico"] },
      performance: { name: "Premium", includes: ["Tutto il Free", "Assistente PERFORM AI per ottimizzare le diete e fare domande profonde ai report scientifici", "Grafici storici 2D avanzati: Sonno, Passi, HRV, stile Apple Salute"],
                     excludes: ["Nessuna scheda creata da me personalmente", "Nessun check settimanale con un coach reale", "Nessun supporto diretto su WhatsApp"] },
      scheda:      { name: "Scheda Personalizzata", includes: ["Scheda di allenamento personalizzata fatta da me", "2 settimane di follow-up incluse", "Video review delle esecuzioni"],
                     excludes: ["Non è un abbonamento: dopo le 2 settimane resti da solo", "Nessun aggiornamento del piano nel tempo", "Nessun piano alimentare incluso"] },
      training:    { name: "Coaching Allenamento", includes: ["Scheda su misura aggiornata in continuo, mai ferma", "Video review delle esecuzioni", "Check settimanale con me", "Supporto diretto H24 su WhatsApp"],
                     excludes: ["Nessun piano alimentare incluso", "Nessun protocollo di integrazione"] },
      full:        { name: "Full Coaching", includes: ["Tutto Coaching Allenamento", "Calcolo macro preciso su misura", "Dieta ON/OFF a 4 momenti della giornata", "Lista sostituzioni alimenti ed esercizi automatica", "Protocollo di integrazione d'élite", "Supporto WhatsApp dedicato 24/7"],
                     excludes: [] },
    },
    periods: { none: "", recurring: "/mese", one_time: "una tantum" },
    privacy: {
      title: "Privacy e trattamento dati",
      genericBody: "PERFORM tratta i tuoi dati personali — profilo, nickname, passi, sonno, diario di macro e idratazione — con crittografia sul database e sui bucket di archiviazione, in conformità al Regolamento UE 2016/679 (GDPR). I dati non vengono mai ceduti, venduti o condivisi con terzi per finalità commerciali: sono usati esclusivamente per farti tracciare i tuoi progressi e, se hai un piano a coaching, per farli leggere al tuo coach. Questa informativa vale per ogni account, a prescindere dal piano attivo.",
      extendedBody: "Con un piano a coaching (Scheda Personalizzata, Coaching Allenamento o Full Coaching) tratti anche dati di categoria particolare ai sensi dell'art. 9 GDPR: foto del check settimanale, circonferenze corporee, bio-marker ematici e le risposte della tua anamnesi iniziale. Questi dati restano protetti con lo stesso livello di crittografia e sono visibili solo a te e a Coach Daniel Marsini, titolare del trattamento — mai ad altri utenti dell'app.",
      legalNote: "Titolare del trattamento: Daniel Marsini. Base giuridica: consenso esplicito ex art. 9 GDPR, raccolto alla registrazione e revocabile in qualsiasi momento da questa schermata.",
      documents: "I tuoi consensi",
      documentsHint: "Il testo esatto che hai accettato in fase di registrazione — tocca per leggerlo per intero.",
      downloadBtn: "Scarica i miei dati",
      downloadHint: "Un file con profilo, consensi accettati e data di registrazione, per i tuoi archivi personali.",
      downloadBusy: "Preparazione…",
      downloadError: "Non sono riuscito a preparare il file. Riprova.",
      dangerTitle: "Elimina account e dati storici",
      dangerBody: "Cancella definitivamente profilo, anamnesi, foto, misurazioni e diario. L'operazione è immediata e irreversibile: non esiste ripristino.",
      deleteBtn: "Elimina il mio account",
      confirmText: "Confermi? Non potrò recuperare nulla, nemmeno su tua richiesta.",
      confirmYes: "Sì, elimina tutto", confirmNo: "Annulla",
    },
    footer: "© 2026 Coach Daniel Marsini",
  },
  en: {
    settingsTitle: "Settings",
    tabs: { aspetto: "Appearance", notifiche: "Notifications", piano: "Subscription", privacy: "Privacy" },
    editProfile: "Edit profile",
    save: "Save", cancel: "Cancel",
    nicknameLabel: "Public nickname",
    bioLabel: "Bio · up to 160 characters",
    bioPlaceholder: "Two lines about you: sport, goal, one sentence.",
    nicknameHint: "Your nickname is what other athletes see: it updates instantly on Home and the leaderboard. Your real name is never public.",
    langLabel: "Language",
    stats: { level: "Level", xp: "XP", streak: "Streak", rank: "Rank" },
    records: {
      title: "My Milestones",
      sub: (n) => `${n} exercises tracked`,
      filterAll: "All", filterFavorites: "Favorites",
      emptyAll: "Log your workouts on Home, in the plan your coach set up: progressions show up here, week by week.",
      emptyFavorites: "No favorite exercises yet: tap the star on the ones you want to keep an eye on — handy for powerlifting or a lagging muscle group.",
      compoundTag: "Compound",
      weekLabel: "Wk", lastSession: "Last session", vsPrev: "vs previous week",
      favoriteAdd: "Add to favorites", favoriteRemove: "Remove from favorites",
      noProgressionData: "Needs at least one logged session for this exercise.",
    },
    archive: {
      title: "My Check Archive",
      subReady: (n) => `${n} weight checks · read-only`,
      subEmpty: "No checks yet",
      weightTrend: "Weight trend",
      deltaPrefix: "Since first check:", deltaSuffix: "updates every Monday with your check",
      photoGallery: "Personal photo gallery · Front · Side · Back",
      compareTitle: "Monthly comparison",
      compareHint: "One photo a month, from your sign-up day: pick two months to compare.",
      compareA: "Month A", compareB: "Month B",
      timelineTitle: "Full timeline",
      photoEmpty: "Check photos are added every month, starting from your sign-up day.",
      photoLabels: ["Front", "Side", "Back"],
      photoAbsent: "Missing",
      photoFooter: "Visible only to you and Coach Daniel. Read-only archive: one new photo a month, saved automatically from your sign-up day.",
      noWeightData: "You need at least two checks to draw the curve.",
    },
    darkModeOnyx: "Dark Mode Onyx",
    notif: {
      title: "Push reminders",
      meals: "Meals", mealsDesc: "A reminder if a meal stays empty past the usual time.",
      steps: "Steps", stepsDesc: "Evening alert if you're below the daily threshold.",
      sleep: "Sleep", sleepDesc: "Reminder to log your bedtime.",
      motivation: "Motivational pop-ups", motivationDesc: "Messages about records and tough weeks.",
      footer: "Notifications don't replace your judgment: if one bothers you, turn it off.",
    },
    plan: {
      activeTitle: "Active plan", chooseTitle: "Choose your PERFORM Plan",
      manageBilling: "Manage payment and renewal",
      billingNote: "The portal is managed by Stripe: update your card, download invoices, or cancel renewal from there.",
      freeRenew: "No renewal: basic use is free forever.",
      oneTimeRenew: "One-time purchase, no automatic renewal.",
      autoRenew: (d) => `Automatic renewal on ${d}`,
      subscribed: "Subscription active",
      current: "Current plan",
      freeCta: "Back to Free", oneTimeCta: "Buy now", switchCta: "Switch to this plan",
    },
    plans: {
      free:        { name: "FREE", includes: ["Self-guided free-form diary: diet, loads, supplements, steps and sleep", "No historical charts or AI"] },
      performance: { name: "PERFORMANCE PACK", includes: ["Everything in Free", "PERFORM AI assistant to optimize your diet and dig deep into the scientific reports", "Advanced 2D historical charts: Sleep, Steps, HRV, Apple Health style"] },
      scheda:      { name: "CUSTOM PLAN", includes: ["Custom training plan built by me personally", "2 weeks of follow-up included", "Video review of your execution"] },
      training:    { name: "TRAINING-ONLY COACHING", includes: ["Continuously updated custom plan", "Video review of your execution", "Weekly check-in", "Direct 24/7 support on WhatsApp"] },
      full:        { name: "FULL SUPREME COACHING", includes: ["Everything in Training-Only Coaching", "Precise macro calculation", "4-window ON/OFF diet cycling", "Automatic food & exercise substitution list", "Elite supplementation protocol", "Dedicated 24/7 WhatsApp support"] },
    },
    periods: { none: "", recurring: "/mo", one_time: "one-time" },
    privacy: {
      title: "Privacy and data handling",
      genericBody: "Your profile data, Nickname, steps, sleep, and daily macros/hydration log are stored encrypted and securely on PERFORM so you can track your progress. No data is shared or sold to third parties.",
      extendedBody: "Your coaching plan also covers the Monday check photos, body measurements, blood bio-markers, and your 56-question intake form: this data is protected by medical-grade encryption and visible only to Coach Daniel Marsini.",
      legalNote: "Data controller: Daniel Marsini. Legal basis: explicit consent under GDPR Art. 9, collected at sign-up and revocable.",
      documents: "Documents",
      docs: ["Privacy notice", "Terms of service", "Medical liability waiver"],
      dangerTitle: "Delete account and historical data",
      dangerBody: "Permanently deletes your profile, intake form, photos, measurements, and diary. The action is immediate and irreversible: there is no restore.",
      deleteBtn: "Delete my account",
      confirmText: "Are you sure? I won't be able to recover anything, even on request.",
      confirmYes: "Yes, delete everything", confirmNo: "Cancel",
    },
    footer: "© 2026 Coach Daniel Marsini",
  },
  es: {
    settingsTitle: "Ajustes",
    tabs: { aspetto: "Apariencia", notifiche: "Notificaciones", piano: "Suscripción", privacy: "Privacidad" },
    editProfile: "Editar perfil",
    save: "Guardar", cancel: "Cancelar",
    nicknameLabel: "Nickname público",
    bioLabel: "Bio · máximo 160 caracteres",
    bioPlaceholder: "Dos líneas sobre ti: deporte, objetivo, una frase.",
    nicknameHint: "Tu nickname es lo que ven los demás atletas: se actualiza al instante en Inicio y en la clasificación. Tu nombre real nunca es público.",
    langLabel: "Idioma",
    stats: { level: "Nivel", xp: "XP", streak: "Racha", rank: "Ranking" },
    records: {
      title: "Mis Logros",
      sub: (n) => `${n} ejercicios registrados`,
      filterAll: "Todos", filterFavorites: "Favoritos",
      emptyAll: "Registra tus entrenamientos en Inicio, en el plan que te configuró tu coach: las progresiones aparecen aquí, semana a semana.",
      emptyFavorites: "Aún no tienes ejercicios favoritos: toca la estrella en los que quieras vigilar de cerca — útil si haces powerlifting o tienes un grupo muscular rezagado.",
      compoundTag: "Multiarticular",
      weekLabel: "Sem.", lastSession: "Última sesión", vsPrev: "vs semana anterior",
      favoriteAdd: "Añadir a favoritos", favoriteRemove: "Quitar de favoritos",
      noProgressionData: "Se necesita al menos una sesión registrada para este ejercicio.",
    },
    archive: {
      title: "Mi Archivo de Chequeos",
      subReady: (n) => `${n} chequeos de peso · solo lectura`,
      subEmpty: "Aún no hay chequeos",
      weightTrend: "Evolución del peso",
      deltaPrefix: "Desde el primer chequeo:", deltaSuffix: "se actualiza cada lunes con tu chequeo",
      photoGallery: "Galería de fotos personales · Frente · Lado · Espalda",
      compareTitle: "Comparación mensual",
      compareHint: "Una foto al mes, desde el día de tu inscripción: elige dos meses para comparar.",
      compareA: "Mes A", compareB: "Mes B",
      timelineTitle: "Cronología completa",
      photoEmpty: "Las fotos del chequeo se añaden cada mes, a partir del día de tu inscripción.",
      photoLabels: ["Frente", "Lado", "Espalda"],
      photoAbsent: "Ausente",
      photoFooter: "Visibles solo para ti y Coach Daniel. Archivo de solo lectura: una foto nueva al mes, guardada automáticamente desde tu día de inscripción.",
      noWeightData: "Se necesitan al menos dos chequeos para dibujar la curva.",
    },
    darkModeOnyx: "Dark Mode Onyx",
    notif: {
      title: "Recordatorios push",
      meals: "Comidas", mealsDesc: "Un aviso si una comida queda vacía más allá del horario habitual.",
      steps: "Pasos", stepsDesc: "Aviso nocturno si estás por debajo del umbral diario.",
      sleep: "Sueño", sleepDesc: "Recordatorio para registrar la hora de dormir.",
      motivation: "Pop-ups motivacionales", motivationDesc: "Mensajes sobre récords y semanas difíciles.",
      footer: "Las notificaciones no sustituyen tu criterio: si una te molesta, apágala.",
    },
    plan: {
      activeTitle: "Plan activo", chooseTitle: "Elige tu Plan PERFORM",
      manageBilling: "Gestionar pago y renovación",
      billingNote: "El portal lo gestiona Stripe: desde allí actualizas la tarjeta, descargas facturas o cancelas la renovación.",
      freeRenew: "Sin renovación: el uso básico es gratis para siempre.",
      oneTimeRenew: "Compra única, sin renovación automática.",
      autoRenew: (d) => `Renovación automática el ${d}`,
      subscribed: "Suscripción activa",
      current: "Plan actual",
      freeCta: "Volver al Gratis", oneTimeCta: "Comprar ahora", switchCta: "Cambiar a este plan",
    },
    plans: {
      free:        { name: "GRATIS", includes: ["Diario libre autogestionado: dieta, cargas, suplementación, pasos y sueño", "Sin gráficos históricos ni IA"] },
      performance: { name: "PACK RENDIMIENTO", includes: ["Todo lo del plan Gratis", "Asistente PERFORM AI para optimizar tu dieta y consultar en profundidad los informes científicos", "Gráficos históricos 2D avanzados: Sueño, Pasos, VFC, estilo Apple Salud"] },
      scheda:      { name: "PLAN PERSONALIZADO", includes: ["Plan de entrenamiento personalizado hecho por mí", "2 semanas de seguimiento incluidas", "Revisión en video de tu ejecución"] },
      training:    { name: "COACHING SOLO ENTRENAMIENTO", includes: ["Plan a medida actualizado de forma continua", "Revisión en video de tu ejecución", "Check semanal", "Soporte directo 24/7 por WhatsApp"] },
      full:        { name: "FULL COACHING SUPREMO", includes: ["Todo el Coaching Solo Entrenamiento", "Cálculo preciso de macros", "Dieta ON/OFF en 4 momentos del día", "Lista automática de sustituciones de alimentos y ejercicios", "Protocolo de suplementación de élite", "Soporte WhatsApp dedicado 24/7"] },
    },
    periods: { none: "", recurring: "/mes", one_time: "pago único" },
    privacy: {
      title: "Privacidad y tratamiento de datos",
      genericBody: "Los datos de tu perfil, el Nickname, los pasos, el sueño y el diario diario de macros e hidratación se almacenan de forma cifrada y segura en PERFORM para que puedas seguir tu progreso. Ningún dato se cede ni se vende a terceros.",
      extendedBody: "Tu plan de coaching incluye también las fotos del chequeo del lunes, las medidas corporales, los bio-marcadores sanguíneos y las 56 preguntas de tu anamnesis inicial: estos datos están protegidos por cifrado de nivel médico y son visibles únicamente para Coach Daniel Marsini.",
      legalNote: "Responsable del tratamiento: Daniel Marsini. Base jurídica: consentimiento explícito según art. 9 RGPD, recogido en el registro y revocable.",
      documents: "Documentos",
      docs: ["Aviso de privacidad", "Términos de servicio", "Exención de responsabilidad médica"],
      dangerTitle: "Eliminar cuenta y datos históricos",
      dangerBody: "Elimina definitivamente tu perfil, anamnesis, fotos, medidas y diario. La acción es inmediata e irreversible: no existe restauración.",
      deleteBtn: "Eliminar mi cuenta",
      confirmText: "¿Confirmas? No podré recuperar nada, ni siquiera a petición tuya.",
      confirmYes: "Sí, eliminar todo", confirmNo: "Cancelar",
    },
    footer: "© 2026 Coach Daniel Marsini",
  },
  fr: {
    settingsTitle: "Paramètres",
    tabs: { aspetto: "Apparence", notifiche: "Notifications", piano: "Abonnement", privacy: "Confidentialité" },
    editProfile: "Modifier le profil",
    save: "Enregistrer", cancel: "Annuler",
    nicknameLabel: "Pseudo public",
    bioLabel: "Bio · 160 caractères maximum",
    bioPlaceholder: "Deux lignes sur toi : sport, objectif, une phrase.",
    nicknameHint: "Ton pseudo est ce que voient les autres athlètes : il se met à jour instantanément sur l'accueil et le classement. Ton vrai nom n'est jamais public.",
    langLabel: "Langue",
    stats: { level: "Niveau", xp: "XP", streak: "Série", rank: "Classement" },
    records: {
      title: "Mes Records",
      sub: (n) => `${n} exercices suivis`,
      filterAll: "Tous", filterFavorites: "Favoris",
      emptyAll: "Enregistre tes séances sur l'accueil, dans le programme configuré par ton coach : les progressions apparaissent ici, semaine après semaine.",
      emptyFavorites: "Aucun exercice favori pour l'instant : touche l'étoile sur ceux que tu veux surveiller de près — utile en powerlifting ou pour un groupe musculaire en retard.",
      compoundTag: "Polyarticulaire",
      weekLabel: "Sem.", lastSession: "Dernière séance", vsPrev: "vs semaine précédente",
      favoriteAdd: "Ajouter aux favoris", favoriteRemove: "Retirer des favoris",
      noProgressionData: "Il faut au moins une séance enregistrée pour cet exercice.",
    },
    archive: {
      title: "Mon Archive de Suivi",
      subReady: (n) => `${n} suivis de poids · lecture seule`,
      subEmpty: "Aucun suivi pour l'instant",
      weightTrend: "Évolution du poids",
      deltaPrefix: "Depuis le premier suivi :", deltaSuffix: "se met à jour chaque lundi avec ton suivi",
      photoGallery: "Galerie photo personnelle · Face · Profil · Dos",
      compareTitle: "Comparaison mensuelle",
      compareHint: "Une photo par mois, depuis ton jour d'inscription : choisis deux mois à comparer.",
      compareA: "Mois A", compareB: "Mois B",
      timelineTitle: "Chronologie complète",
      photoEmpty: "Les photos de suivi s'ajoutent chaque mois, à partir de ton jour d'inscription.",
      photoLabels: ["Face", "Profil", "Dos"],
      photoAbsent: "Absente",
      photoFooter: "Visibles uniquement par toi et Coach Daniel. Archive en lecture seule : une nouvelle photo par mois, enregistrée automatiquement depuis ton jour d'inscription.",
      noWeightData: "Il faut au moins deux suivis pour tracer la courbe.",
    },
    darkModeOnyx: "Dark Mode Onyx",
    notif: {
      title: "Rappels push",
      meals: "Repas", mealsDesc: "Un rappel si un repas reste vide au-delà de l'heure habituelle.",
      steps: "Pas", stepsDesc: "Alerte du soir si tu es sous le seuil quotidien.",
      sleep: "Sommeil", sleepDesc: "Rappel pour enregistrer l'heure du coucher.",
      motivation: "Pop-up motivationnels", motivationDesc: "Messages sur les records et les semaines difficiles.",
      footer: "Les notifications ne remplacent pas ton jugement : si l'une te dérange, désactive-la.",
    },
    plan: {
      activeTitle: "Abonnement actif", chooseTitle: "Choisis ton Plan PERFORM",
      manageBilling: "Gérer le paiement et le renouvellement",
      billingNote: "Le portail est géré par Stripe : mets à jour ta carte, télécharge tes factures ou annule le renouvellement depuis là.",
      freeRenew: "Aucun renouvellement : l'usage de base est gratuit à vie.",
      oneTimeRenew: "Achat unique, aucun renouvellement automatique.",
      autoRenew: (d) => `Renouvellement automatique le ${d}`,
      subscribed: "Abonnement actif",
      current: "Plan actuel",
      freeCta: "Retour au Gratuit", oneTimeCta: "Acheter maintenant", switchCta: "Passer à ce plan",
    },
    plans: {
      free:        { name: "GRATUIT", includes: ["Journal libre autogéré : alimentation, charges, compléments, pas et sommeil", "Aucun graphique historique ni IA"] },
      performance: { name: "PACK PERFORMANCE", includes: ["Tout le plan Gratuit", "Assistant PERFORM AI pour optimiser ton alimentation et interroger en profondeur les rapports scientifiques", "Graphiques historiques 2D avancés : Sommeil, Pas, VFC, façon Apple Santé"] },
      scheda:      { name: "PROGRAMME SUR MESURE", includes: ["Programme d'entraînement personnalisé fait par moi", "2 semaines de suivi incluses", "Revue vidéo de ton exécution"] },
      training:    { name: "COACHING ENTRAÎNEMENT SEUL", includes: ["Programme sur mesure mis à jour en continu", "Revue vidéo de ton exécution", "Bilan hebdomadaire", "Support direct 24/7 via WhatsApp"] },
      full:        { name: "FULL COACHING SUPRÊME", includes: ["Tout le Coaching Entraînement Seul", "Calcul précis des macros", "Régime ON/OFF à 4 moments de la journée", "Liste automatique de substitutions aliments et exercices", "Protocole de complémentation d'élite", "Support WhatsApp dédié 24/7"] },
    },
    periods: { none: "", recurring: "/mois", one_time: "paiement unique" },
    privacy: {
      title: "Confidentialité et traitement des données",
      genericBody: "Les données de ton profil, ton Pseudo, tes pas, ton sommeil et ton journal quotidien de macros et d'hydratation sont archivés de façon cryptée et sécurisée sur PERFORM pour te permettre de suivre tes progrès. Aucune donnée n'est cédée ou vendue à des tiers.",
      extendedBody: "Ton parcours de coaching inclut aussi les photos de suivi du lundi, les mensurations corporelles, les bio-marqueurs sanguins et les 56 questions de ton anamnèse initiale : ces données sont protégées par un chiffrement de niveau médical et visibles uniquement par Coach Daniel Marsini.",
      legalNote: "Responsable du traitement : Daniel Marsini. Base légale : consentement explicite selon l'art. 9 RGPD, recueilli à l'inscription et révocable.",
      documents: "Documents",
      docs: ["Politique de confidentialité", "Conditions d'utilisation", "Décharge de responsabilité médicale"],
      dangerTitle: "Supprimer le compte et les données historiques",
      dangerBody: "Supprime définitivement ton profil, ton anamnèse, tes photos, tes mensurations et ton journal. L'action est immédiate et irréversible : aucune restauration possible.",
      deleteBtn: "Supprimer mon compte",
      confirmText: "Tu confirmes ? Je ne pourrai rien récupérer, même sur demande.",
      confirmYes: "Oui, tout supprimer", confirmNo: "Annuler",
    },
    footer: "© 2026 Coach Daniel Marsini",
  },
};

/* Selettore lingua — card grandi con bandiera e nome, usato in Impostazioni → Aspetto */
function LangSelector({ lang, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Lingua / Language">
      {LANGS.map((l) => {
        const on = lang === l.code;
        return (
          <button key={l.code} onClick={() => onChange(l.code)}
            className="rounded-xl flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200 active:scale-95"
            style={{
              border: on ? "1.5px solid var(--ink)" : "1px solid var(--line)",
              backgroundColor: on ? "var(--surface-2)" : "transparent",
            }}
            aria-label={l.label} aria-pressed={on}>
            {/* Windows spesso non ha i glifi bandiera e mostra le due lettere
                del codice paese come testo semplice invece dell'icona a
                colori — senza un colore esplicito ereditava un colore
                ambiente che in certi stati poteva risultare nero su nero
                (Onyx) o bianco su bianco (Light), illeggibile. */}
            <span style={{ fontSize: "1.55rem", lineHeight: 1, color: "var(--ink)" }}>{l.flag}</span>
            <span style={{ fontSize: "0.68rem", fontWeight: on ? 700 : 500,
                            color: on ? "var(--ink)" : "var(--ink-2)" }}>{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   2 · UTILITÀ
   ========================================================================== */

/* Testo con gradiente brand animato: Oro Lucido Vivo (uomo) / Rosa Cipria
   Luminescente (donna). Animazione via background-position, leggera per la
   GPU: nessun re-render React, solo CSS in loop continuo. */
export function GradientText({ children, gender, className, style }) {
  const gold = gender !== "F";
  return (
    <span
      className={className}
      style={{
        backgroundImage: gold
          ? "linear-gradient(90deg,#D4AF37,#F3E5AB,#AA7C11,#F3E5AB,#D4AF37)"
          : "linear-gradient(90deg,#E5C1CD,#F4E0E6,#C896A6,#F4E0E6,#E5C1CD)",
        backgroundSize: "300% auto",
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        animation: "gradientMove 3.6s linear infinite",
        ...style,
      }}>
      {children}
    </span>
  );
}

export function veteranBadge(joinedAt) {
  if (!joinedAt) return null;
  const d = new Date(joinedAt);
  const months = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months >= 24) return { text: `VETERANO · dal ${d.getFullYear()}`, icon: "🏆" };
  if (months >= 12) return { text: `ATLETA ÉLITE · ${Math.floor(months / 12)} anno`, icon: "🥇" };
  if (months >= 3)  return { text: `${months} mesi`, icon: "⭐" };
  return { text: "NUOVO ISCRITTO", icon: "🌱" };
}

export function VeteranBadge({ joinedAt }) {
  const b = veteranBadge(joinedAt);
  if (!b) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full"
      style={{ padding: "4px 10px", fontSize: "0.7rem", fontWeight: 600,
        background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--line)" }}>
      {b.icon} {b.text}
    </span>
  );
}

/* Scala di titoli PERFORM — calcolata sui punti XP reali dell'atleta
   (Supabase: colonna `xp_total`, aggiornata dal trigger di gamification).
   Soglie: 0–999 Recruit · 1.000–2.999 Hardworker · 3.000–6.999 Iron Mind ·
   7.000–14.999 Bio-Hacker · 15.000+ Livello Élite. */
export function xpTierBadge(xp) {
  const v = xp || 0;
  if (v >= 15000) return { label: "LIVELLO ÉLITE", icon: "🏆", tier: 4 };
  if (v >= 7000)  return { label: "BIO-HACKER",     icon: "🧬", tier: 3 };
  if (v >= 3000)  return { label: "IRON MIND",      icon: "🧠", tier: 2 };
  if (v >= 1000)  return { label: "HARDWORKER",     icon: "💪", tier: 1 };
  return         { label: "RECRUIT", sub: "Nuovo Iscritto", icon: "🌱", tier: 0 };
}

const RECRUIT_SUB = { it: "Nuovo Iscritto", en: "New Member", es: "Nuevo Miembro", fr: "Nouveau Membre" };

export function EliteXpBadge({ xp, accent, lang }) {
  const b = xpTierBadge(xp);
  const metal = b.tier >= 3;
  return (
    <span className="inline-flex items-center gap-2 rounded-full"
      style={{
        padding: "8px 15px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.01em",
        background: metal
          ? `linear-gradient(120deg, ${accent} 0%, #FFFFFF 46%, ${accent} 100%)`
          : `${accent}1A`,
        color: metal ? "#111111" : accent,
        boxShadow: metal ? `0 4px 16px ${accent}55` : "none",
        border: metal ? "none" : `1px solid ${accent}40`,
      }}>
      <span aria-hidden="true">{b.icon}</span>
      <span>
        {b.label}{b.tier === 0 ? ` (${RECRUIT_SUB[lang] || RECRUIT_SUB.it})` : ""}: {(xp || 0).toLocaleString("it-IT")} XP
      </span>
    </span>
  );
}

export function WeightChart({ points, accent, t }) {
  if (!points || points.length < 2) {
    return <p className="meta text-sm">{t.noWeightData}</p>;
  }
  const W = 320, H = 130, pad = 24;
  const vals = points.map((p) => p.kg);
  const min = Math.min(...vals) - 0.6, max = Math.max(...vals) + 0.6;
  const x = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 1.8);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.kg)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${H - pad} L${pad},${H - pad} Z`;
  const delta = +(vals[vals.length - 1] - vals[0]).toFixed(1);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t.weightTrend}>
        <defs>
          <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        <path d={area} fill="url(#wfill)" />
        <path d={path} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.kg)} r="3.4" fill="var(--surface)" stroke={accent} strokeWidth="2" />
            {(i === 0 || i === points.length - 1) && (
              <text x={x(i)} y={y(p.kg) - 10} textAnchor="middle" fontSize="8.5" fontWeight="700"
                    fill={accent} fontFamily="system-ui, -apple-system, sans-serif">{p.kg}</text>
            )}
            {i % Math.ceil(points.length / 5) === 0 && (
              <text x={x(i)} y={H - pad + 13} textAnchor="middle" fontSize="7.5"
                    fill="var(--ink-2)" fontFamily="system-ui, -apple-system, sans-serif">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
      <p className="meta font-data mt-1.5" style={{ fontSize: "0.7rem" }}>
        {t.deltaPrefix}{" "}
        <span style={{ color: delta === 0 ? "var(--ink-2)" : delta < 0 ? "#10B981" : "#B45309", fontWeight: 700 }}>
          {delta > 0 ? "+" : ""}{delta} kg
        </span>{" "}· {t.deltaSuffix}
      </p>
    </>
  );
}

const CIRC_SERIES = [
  { key: "waist", label: "Vita", color: "#2563EB" },
  { key: "thigh", label: "Coscia", color: "#C5A059" },
  { key: "arm", label: "Braccio", color: "#10B981" },
];

/* Confronto circonferenze (vita/coscia/braccio) ad ogni check che le
   registra — non solo il peso: mostra DOVE sta cambiando il corpo, utile
   per distinguere una ricomposizione (vita giù, peso stabile) da un
   dimagrimento vero o da un bulk. Stessa identica lista usata anche lato
   coach in CheckDetail (09_CoachDashboard.jsx, LineChart) — nessuna
   duplicazione di logica, solo di rendering (qui SVG dedicato più
   compatto per lo spazio ridotto del profilo). */
export function CircumferenceChart({ points, accent }) {
  const withAny = (points || []).filter((p) => p.waist != null || p.thigh != null || p.arm != null);
  if (withAny.length < 2) return <p className="meta text-sm">Registra la stessa misura in almeno 2 check per vedere il confronto.</p>;

  const W = 320, H = 130, pad = 24;
  const allVals = CIRC_SERIES.flatMap((s) => withAny.map((p) => p[s.key]).filter((v) => v != null));
  const min = Math.min(...allVals) - 1, max = Math.max(...allVals) + 1;
  const x = (i) => pad + (i * (W - pad * 2)) / (withAny.length - 1 || 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 1.8);

  return (
    <>
      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
        {CIRC_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1 font-data" style={{ fontSize: "0.6rem", color: s.color }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: s.color, display: "inline-block" }} /> {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Confronto circonferenze">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        {CIRC_SERIES.map((s) => {
          const seriesPoints = withAny.map((p, i) => ({ i, v: p[s.key] })).filter((p) => p.v != null);
          if (seriesPoints.length < 2) return null;
          const path = seriesPoints.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {seriesPoints.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="2.8" fill="var(--surface)" stroke={s.color} strokeWidth="1.8" />)}
            </g>
          );
        })}
        {withAny.map((p, i) => (i === 0 || i === withAny.length - 1 || i % Math.ceil(withAny.length / 5) === 0) && (
          <text key={i} x={x(i)} y={H - pad + 13} textAnchor="middle" fontSize="7.5" fill="var(--ink-2)" fontFamily="system-ui, -apple-system, sans-serif">{p.label}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {CIRC_SERIES.map((s) => {
          const vals = withAny.map((p) => p[s.key]).filter((v) => v != null);
          if (vals.length < 2) return null;
          const delta = +(vals[vals.length - 1] - vals[0]).toFixed(1);
          return (
            <p key={s.key} className="meta font-data" style={{ fontSize: "0.68rem" }}>
              {s.label}:{" "}
              <span style={{ color: delta === 0 ? "var(--ink-2)" : delta < 0 ? "#10B981" : "#B45309", fontWeight: 700 }}>
                {delta > 0 ? "+" : ""}{delta} cm
              </span>
            </p>
          );
        })}
      </div>
    </>
  );
}

const RECOMP_TONE_COLOR = { good: "#10B981", warn: "#B45309", neutral: "var(--ink-2)" };

/* Punteggio di ricomposizione: un'etichetta onesta (mai un numero
   inventato) derivata dal confronto reale peso/vita già mostrato sopra —
   il cliente spesso guarda solo il peso e si scoraggia quando resta
   fermo, senza notare che la vita nel frattempo è scesa. */
function RecompositionBadge({ weightPoints, circPoints }) {
  const reading = recompositionReading(weightPoints, circPoints);
  if (!reading) return null;
  const color = RECOMP_TONE_COLOR[reading.tone];
  return (
    <div className="inner px-4 py-3 mt-3">
      <p className="label mb-1">Lettura del periodo</p>
      <p className="text-sm mb-1" style={{ color, fontWeight: 800 }}>{reading.label}</p>
      <p className="meta" style={{ lineHeight: 1.5 }}>{reading.detail}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Bacheca Trofei: raggiungimenti reali derivati dagli stessi dati già
   mostrati altrove nel profilo (streak, livello, numero di check, lettura di
   ricomposizione) — sbloccato/bloccato è sempre una soglia su un valore
   vero, mai uno stato salvato a parte: impossibile disallinearsi da quello
   che il profilo mostra davvero. Stessi nomi/icone di livello del resto
   dell'app (LEVEL_TIERS), non una seconda nomenclatura.
   ------------------------------------------------------------------------- */
const STREAK_MILESTONES = [7, 30, 90, 180, 365];
const CHECKIN_MILESTONES = [5, 15, 30, 50, 100];

function computeTrophies({ level, streak, checkinsCount, recompGood }) {
  const trophies = [];
  STREAK_MILESTONES.forEach((days) => {
    trophies.push({
      id: `streak-${days}`, icon: "🔥", label: `Streak di ${days} giorni`,
      requirement: `Mantieni ${days} giorni consecutivi di costanza`,
      unlocked: (streak ?? 0) >= days,
    });
  });
  LEVEL_TIERS.forEach((tier, i) => {
    trophies.push({
      id: `tier-${i}`, icon: tier.icon, label: tier.title,
      requirement: `Raggiungi il rango "${tier.title}"`,
      unlocked: (level ?? 0) >= i * LEVELS_PER_TIER,
    });
  });
  CHECKIN_MILESTONES.forEach((n) => {
    trophies.push({
      id: `checkins-${n}`, icon: "📋", label: `${n} check registrati`,
      requirement: `Registra ${n} check settimanali`,
      unlocked: (checkinsCount ?? 0) >= n,
    });
  });
  trophies.push({
    id: "recomp-1", icon: "⚖️", label: "Prima ricomposizione rilevata",
    requirement: "Peso stabile e circonferenze in calo nello stesso periodo",
    unlocked: !!recompGood,
  });
  return trophies;
}

function TrophyCelebration({ trophy, onDone }) {
  useEffect(() => {
    playSound("trophy");
    haptic("success");
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);
  return (
    <Portal>
      <div className="trophy-celeb-wrap" role="status" aria-live="polite">
        <div className="trophy-celeb-card">
          <span className="trophy-celeb-icon">{trophy.icon}</span>
          <p className="trophy-celeb-label">🎉 Trofeo sbloccato</p>
          <p className="trophy-celeb-name">{trophy.label}</p>
        </div>
      </div>
    </Portal>
  );
}

function TrophyShelf({ level, streak, checkinsCount, weightPoints, circPoints, userId }) {
  const recomp = recompositionReading(weightPoints, circPoints);
  const trophies = computeTrophies({ level, streak, checkinsCount, recompGood: recomp?.tone === "good" });
  const unlockedCount = trophies.filter((t) => t.unlocked).length;

  // Celebrazione solo per un trofeo comparso DA QUESTA visita in poi — mai
  // alla primissima apertura (seen.length===0), altrimenti festeggerebbe
  // come "appena raggiunto" ogni traguardo già vecchio del cliente.
  const [celebrating, setCelebrating] = useState(null);
  const storageKey = userId ? `perform_trophies_seen_${userId}` : null;
  useEffect(() => {
    if (!storageKey) return;
    const unlockedIds = trophies.filter((t) => t.unlocked).map((t) => t.id);
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { seen = []; }
    const newOnes = unlockedIds.filter((id) => !seen.includes(id));
    if (newOnes.length > 0 && seen.length > 0) {
      setCelebrating(trophies.find((t) => t.id === newOnes[0]));
    }
    try { localStorage.setItem(storageKey, JSON.stringify(unlockedIds)); } catch { /* storage piena/negata: non blocca la pagina */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, unlockedCount]);

  return (
    <>
      <p className="meta mb-3">{unlockedCount}/{trophies.length} trofei sbloccati</p>
      <div className="grid grid-cols-3 gap-2.5">
        {trophies.map((tr) => (
          <div key={tr.id} className="inner flex flex-col items-center justify-center text-center px-2 py-3.5" style={{ minHeight: 96 }}>
            <span style={{ fontSize: "1.6rem", opacity: tr.unlocked ? 1 : 0.35, filter: tr.unlocked ? "none" : "grayscale(1)" }}>
              {tr.unlocked ? tr.icon : "🔒"}
            </span>
            <p className="mt-1.5" style={{ fontSize: "0.66rem", fontWeight: 700, color: tr.unlocked ? "var(--ink)" : "var(--ink-2)" }}>
              {tr.label}
            </p>
            {!tr.unlocked && <p className="meta mt-0.5" style={{ fontSize: "0.58rem", lineHeight: 1.3 }}>{tr.requirement}</p>}
          </div>
        ))}
      </div>
      {celebrating && <TrophyCelebration trophy={celebrating} onDone={() => setCelebrating(null)} />}
    </>
  );
}

/* Progressione settimanale di un singolo esercizio: peso del set migliore
   seduta per seduta. Stesso linguaggio visivo di WeightChart, generalizzato:
   qui il valore è il carico sollevato, non il peso corporeo. */
function ExerciseTrendChart({ sessions, accent, t }) {
  if (!sessions || sessions.length < 2) {
    return <p className="meta" style={{ fontSize: "0.72rem" }}>{t.noProgressionData}</p>;
  }
  const W = 280, H = 84, pad = 16;
  const vals = sessions.map((s) => s.kg);
  const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
  const x = (i) => pad + (i * (W - pad * 2)) / (sessions.length - 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 1.6);
  const path = sessions.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s.kg)}`).join(" ");
  const last = sessions[sessions.length - 1];
  const prev = sessions[sessions.length - 2];
  const delta = +(last.kg - prev.kg).toFixed(1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t.title}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {sessions.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.kg)} r="2.8" fill="var(--surface)" stroke={accent} strokeWidth="1.8" />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1">
        <p className="meta font-data" style={{ fontSize: "0.66rem" }}>
          {t.lastSession}: <span style={{ color: "var(--ink)", fontWeight: 700 }}>{last.kg} kg</span> × {last.reps}
        </p>
        {prev && (
          <p className="font-data" style={{ fontSize: "0.62rem", fontWeight: 700,
                       color: delta === 0 ? "var(--ink-2)" : delta > 0 ? "#10B981" : "#B45309" }}>
            {delta > 0 ? "+" : ""}{delta} kg <span className="meta" style={{ fontWeight: 500 }}>{t.vsPrev}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/* Confronto mensile: una foto al mese dal giorno dell'iscrizione, messe
   affiancate per vedere il cambiamento reale. checkPhotos va ordinato per
   data crescente prima di arrivare qui. */
function PhotoCompareGrid({ checkPhotos, t }) {
  const monthLabel = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(Math.max(0, (checkPhotos?.length || 1) - 1));

  if (!checkPhotos?.length) return null;

  const Column = ({ idx, onChange, label }) => {
    const shot = checkPhotos[idx];
    return (
      <div className="min-w-0">
        <select value={idx} onChange={(e) => onChange(+e.target.value)}
          className="input w-full px-2.5 py-2 text-xs mb-2" aria-label={label}>
          {checkPhotos.map((s, i) => (
            <option key={s.date} value={i}>{monthLabel(s.date)}</option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-1.5">
          {["front", "side", "back"].map((k, i) => (
            <div key={k} className="rounded-lg overflow-hidden"
                 style={{ border: "1px solid var(--line)", backgroundColor: "var(--surface-2)", aspectRatio: "3/4" }}>
              {shot?.[k] ? <img src={shot[k]} alt={t.photoLabels[i]} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center label" style={{ fontSize: "0.5rem" }}>{t.photoAbsent}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <p className="meta leading-relaxed mb-3" style={{ fontSize: "0.75rem" }}>{t.compareHint}</p>
      <div className="grid grid-cols-2 gap-3">
        <Column idx={aIdx} onChange={setAIdx} label={t.compareA} />
        <Column idx={bIdx} onChange={setBIdx} label={t.compareB} />
      </div>
    </div>
  );
}

function BiometricPhotoGallery({ checkPhotos, t }) {
  if (!checkPhotos?.length) {
    return <p className="body">{t.photoEmpty}</p>;
  }
  return (
    <div className="space-y-4">
      {checkPhotos.map((s) => (
        <div key={s.date}>
          <p className="label mb-2">
            {new Date(s.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["front", "side", "back"].map((k, i) => (
              <div key={k} className="text-center">
                <div className="rounded-xl overflow-hidden"
                     style={{ border: "1px solid var(--line)", backgroundColor: "var(--surface-2)", aspectRatio: "3/4" }}>
                  {s[k] ? <img src={s[k]} alt={t.photoLabels[i]} className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center label">{t.photoAbsent}</span>}
                </div>
                <p className="label mt-1" style={{ fontSize: "0.52rem" }}>{t.photoLabels[i]}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="meta leading-relaxed" style={{ fontSize: "0.72rem" }}>{t.photoFooter}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Report Mensile stampabile: una pagina bianca pensata per la stampa/"Salva
   come PDF" del browser (nessuna libreria PDF aggiunta — window.print() con
   CSS @media print già fa il lavoro, senza pesare il bundle). Riusa gli
   stessi componenti/dati già mostrati nell'Archivio Check (WeightChart,
   CircumferenceChart, RecompositionBadge, foto), mai un secondo calcolo.
   ------------------------------------------------------------------------- */
function MonthlyReportView({ profile, accent, level, xp, streak, weightPoints, circPoints, checkPhotos, t, onClose }) {
  const monthLabel = new Date().toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const reading = recompositionReading(weightPoints, circPoints);
  const firstShot = checkPhotos?.[0];
  const lastShot = checkPhotos?.length > 1 ? checkPhotos[checkPhotos.length - 1] : null;

  return (
    <Portal>
      <div className="report-overlay">
        <div className="report-toolbar no-print">
          <button onClick={onClose} className="report-toolbar-btn report-toolbar-btn-ghost">Chiudi</button>
          <button onClick={() => window.print()} className="report-toolbar-btn report-toolbar-btn-solid" style={{ backgroundColor: accent }}>
            Stampa / Salva come PDF
          </button>
        </div>
        <div className="report-page">
          <div className="report-header">
            <div>
              <p className="report-brand">PERFORM</p>
              <p className="report-title">Report mensile — {monthLabel}</p>
            </div>
            <p className="report-name">{profile.nickname || profile.name}</p>
          </div>

          <div className="report-stats">
            {[["Livello", level], ["XP totali", xp.toLocaleString()], ["Streak", `${streak} giorni`]].map(([k, v]) => (
              <div key={k} className="report-stat">
                <p className="report-stat-label">{k}</p>
                <p className="report-stat-value">{v}</p>
              </div>
            ))}
          </div>

          {weightPoints?.length > 0 && (
            <div className="report-section">
              <p className="report-section-title">Andamento peso</p>
              <WeightChart points={weightPoints} accent={accent} t={t.archive} />
            </div>
          )}

          {circPoints?.length > 0 && (
            <div className="report-section">
              <p className="report-section-title">Confronto circonferenze</p>
              <CircumferenceChart points={circPoints} accent={accent} />
            </div>
          )}

          {reading && (
            <div className="report-section">
              <p className="report-section-title">Lettura del periodo</p>
              <p style={{ fontWeight: 800, fontSize: "0.95rem", marginBottom: 4 }}>{reading.label}</p>
              <p style={{ color: "#52525B", fontSize: "0.82rem", lineHeight: 1.5 }}>{reading.detail}</p>
            </div>
          )}

          {firstShot && (
            <div className="report-section">
              <p className="report-section-title">Confronto foto — inizio vs oggi</p>
              <div className="report-photo-grid">
                {[["Inizio", firstShot], ["Oggi", lastShot || firstShot]].map(([lab, shot]) => (
                  <div key={lab}>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>{lab}</p>
                    <div className="report-photo-row">
                      {["front", "side", "back"].map((k) => (
                        <div key={k} className="report-photo-slot">
                          {shot[k] ? <img src={shot[k]} alt={k} /> : <span>—</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="report-footer">Generato da PERFORM · Evidence-Based Method by D. Marsini</p>
        </div>
      </div>
    </Portal>
  );
}

function Section({ id, icon: Icon, title, sub, openId, setOpenId, children, badge }) {
  const on = openId === id;
  return (
    <div className="card mb-3">
      <button onClick={() => setOpenId(on ? null : id)} className="w-full flex items-center gap-3.5 text-left">
        <span className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <Icon size={17} style={{ color: "var(--ink)" }} />
          {badge}
        </span>
        <span className="min-w-0 flex-1">
          <span className="h2 block">{title}</span>
          <span className="meta block" style={{ fontSize: "0.78rem" }}>{sub}</span>
        </span>
        {on ? <ChevronUp size={16} style={{ color: "var(--ink-2)" }} />
            : <ChevronDown size={16} style={{ color: "var(--ink-2)" }} />}
      </button>
      {on && <div className="spring-in mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>{children}</div>}
    </div>
  );
}

/* Card di un esercizio nei Traguardi: stella preferiti, tag multiarticolare,
   mini-grafico di progressione settimanale. I dati arrivano dagli
   allenamenti che l'atleta registra in Home, sulla scheda impostata dal
   coach (Supabase: `workout_logs` filtrati per `exercise_id`). */
function ExerciseProgressCard({ ex, favorite, onToggleFavorite, accent, t }) {
  return (
    <div className="inner px-4 py-3.5 mb-2.5">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-sm truncate" style={{ color: "var(--ink)", fontWeight: 700 }}>{ex.name}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {ex.muscleGroup && (
              <span className="label" style={{ fontSize: "0.56rem", color: "var(--ink-2)" }}>{ex.muscleGroup}</span>
            )}
            {ex.compound && (
              <span className="rounded-full px-2 py-0.5" style={{ fontSize: "0.56rem", fontWeight: 700,
                       backgroundColor: `${accent}22`, color: accent }}>{t.compoundTag}</span>
            )}
          </div>
        </div>
        <button onClick={() => onToggleFavorite(ex.id)}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ border: "1px solid var(--line)", color: favorite ? accent : "var(--ink-2)" }}
          aria-label={favorite ? t.favoriteRemove : t.favoriteAdd} aria-pressed={favorite}>
          <span style={{ fontSize: "0.95rem" }}>{favorite ? "★" : "☆"}</span>
        </button>
      </div>
      <ExerciseTrendChart sessions={ex.sessions} accent={accent} t={t} />
    </div>
  );
}

/* ============================================================================
   3 · PROFILO ATLETA — vista unica per chiunque apra l'app
   ========================================================================== */

export function ClientProfileView({
  accent, accentText, gender, lang, onChangeLang,
  profile,           // { name, nickname, bio, avatar, joined_at, gender, email }
  level, xp, streak, checkinsCount, // streak/checkinsCount: solo per la Bacheca Trofei
  checkPhotos, weightPoints, circPoints,
  exercises,                                   // [{ id, name, muscleGroup, compound, sessions:[{week,date,kg,reps}] }]
  favoriteExerciseIds, onToggleFavoriteExercise,
  onSaveProfile, onOpenSettings, nicknameTaken,
  onOpenManualCheck,   // se passato, mostra il pulsante "Registra ora" nell'Archivio Check
  supabase, userId,    // solo per "Vai in vacanza / chiedi riposo forzato" (PauseSection)
  plan,                // id STRIPE_PLANS ("free"/"performance"/"scheda"/"training"/"full") — gate PauseSection
}) {
  const t = translations[lang] || translations.it;
  const [editing, setEditing] = useState(false);
  const [nick, setNick] = useState(profile.nickname || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [err, setErr] = useState("");
  const isRealMode = Boolean(supabase && userId);
  useEffect(() => { setNick(profile.nickname || ""); setBio(profile.bio || ""); setAvatar(profile.avatar || null); }, [profile.nickname, profile.bio, profile.avatar]);
  // Entrambe le sezioni partono chiuse: pagina profilo pulita, l'atleta apre
  // solo quella che gli interessa in quel momento (Section è già un banner
  // chiudibile — tap per espandere/richiudere, un accordion: mai due aperte
  // insieme, così la pagina resta sempre corta).
  const [openSection, setOpenSection] = useState(null);
  const [exFilter, setExFilter] = useState("all"); // "all" | "compound" | "favorites"
  const [reportOpen, setReportOpen] = useState(false);
  const fileRef = useRef(null);

  // Pallino "nuovo messaggio" sull'icona Messaggi, visibile anche a sezione
  // chiusa — si azzera aprendola (ChatThread segna come letto da solo).
  const [unreadChat, setUnreadChat] = useState(0);
  const hasCoachChat = isRealMode && ["scheda", "training", "full"].includes(plan);
  useEffect(() => {
    if (!hasCoachChat) { setUnreadChat(0); return; }
    fetchUnreadChatCount(supabase, userId, userId).then(setUnreadChat).catch(() => {});
  }, [hasCoachChat, supabase, userId, openSection]);

  const save = () => {
    const n = nick.trim();
    if (n.length < 3 || n.length > 20) return setErr("3–20 " + t.nicknameLabel.toLowerCase());
    // Il nickname resta senza spazi (è pensato come uno pseudonimo pubblico
    // stile username, non un nome e cognome) — ma il messaggio d'errore ora
    // spiega il motivo specifico invece del criptico "A-Z 0-9 . _ -".
    if (/\s/.test(n)) return setErr("Il nickname non può contenere spazi");
    if (!/^[A-Za-z0-9._-]+$/.test(n)) return setErr("Solo lettere, numeri, . _ -");
    if (nicknameTaken && n.toLowerCase() !== (profile.nickname || "").toLowerCase() && nicknameTaken(n))
      return setErr("—");
    setErr("");
    onSaveProfile({ nickname: n, bio: bio.trim(), avatar });
    setEditing(false);
  };

  const cancel = () => {
    setNick(profile.nickname || ""); setBio(profile.bio || "");
    setAvatar(profile.avatar || null); setErr(""); setEditing(false);
  };

  return (
    <div className="spring-in">
      {/* ---------- avatar in cima, cornice brand animata oro/rosa vivo ---------- */}
      <div className="relative rounded-2xl mb-4"
           style={{
             padding: 2,
             backgroundImage: gender === "F"
               ? "linear-gradient(120deg,#E5C1CD,#F4E0E6,#C896A6,#F4E0E6,#E5C1CD)"
               : "linear-gradient(120deg,#D4AF37,#F3E5AB,#AA7C11,#F3E5AB,#D4AF37)",
             backgroundSize: "300% auto",
             animation: "gradientMove 3.6s linear infinite",
           }}>
      <div className="card" style={{ border: "none", margin: 0 }}>
        <button onClick={onOpenSettings}
          className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}
          aria-label={t.settingsTitle}>
          <Settings size={17} strokeWidth={1.7} style={{ color: "var(--ink)" }} />
        </button>

        <div className="flex items-start gap-4 pr-12">
          <button onClick={() => editing && fileRef.current?.click()}
            className="relative rounded-full overflow-hidden shrink-0"
            style={{ width: 84, height: 84, backgroundColor: "var(--surface-2)", border: "1px solid var(--line)" }}
            aria-label={editing ? "avatar" : "avatar"}>
            {avatar ? (
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center">
                <User size={30} style={{ color: "var(--ink-2)" }} />
              </span>
            )}
            {editing && (
              <span className="absolute inset-0 flex items-center justify-center"
                    style={{ backgroundColor: "rgba(17,17,17,0.55)" }}>
                {avatarBusy ? <Loader2 size={20} className="animate-spin" style={{ color: "#FFFFFF" }} /> : <Camera size={20} style={{ color: "#FFFFFF" }} />}
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
                 onChange={async (e) => {
                   const f = e.target.files?.[0];
                   if (!f) return;
                   // BUG PRESO: prima era solo URL.createObjectURL(f), un blob:
                   // locale al browser — spariva già al refresh perché non
                   // veniva mai davvero caricato da nessuna parte.
                   if (!isRealMode) { setAvatar(URL.createObjectURL(f)); return; }
                   setAvatarBusy(true);
                   setErr("");
                   try {
                     const url = await uploadAvatar(supabase, userId, f);
                     setAvatar(url);
                   } catch (err) {
                     console.error("PERFORM: errore caricamento avatar", err);
                     setErr("Non sono riuscito a caricare la foto.");
                   } finally {
                     setAvatarBusy(false);
                   }
                 }} />

          <div className="min-w-0 flex-1">
            {!editing ? (
              <>
                <GradientText gender={gender} style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                  {profile.nickname || "—"}
                </GradientText>
                <p className="meta mt-0.5" style={{ fontSize: "0.78rem" }}>{profile.name}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <EliteXpBadge xp={xp} accent={accentText} lang={lang} />
                  <VeteranBadge joinedAt={profile.joined_at} />
                </div>
                {profile.bio && <p className="body mt-3" style={{ fontSize: "0.87rem" }}>{profile.bio}</p>}
                <button onClick={() => setEditing(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs"
                  style={{ border: `1px solid ${accentText}`, color: accentText, fontWeight: 600 }}>
                  <Pencil size={12} /> {t.editProfile}
                </button>
              </>
            ) : (
              <>
                <label className="block mb-2.5">
                  <span className="label block mb-1.5">{t.nicknameLabel}</span>
                  <input value={nick} onChange={(e) => { setNick(e.target.value); setErr(""); }}
                    maxLength={20} className="input w-full px-3.5 py-2.5 text-sm" aria-label={t.nicknameLabel} />
                </label>
                <label className="block mb-2.5">
                  <span className="label block mb-1.5">{t.bioLabel}</span>
                  <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))}
                    className="input w-full px-3.5 py-2.5 text-sm resize-none"
                    placeholder={t.bioPlaceholder} aria-label={t.bioLabel} />
                  <span className="meta font-data" style={{ fontSize: "0.68rem" }}>{bio.length}/160</span>
                </label>
                {err && <p className="text-xs mb-2.5" style={{ color: "#DC2626" }}>{err}</p>}
                <div className="flex gap-2">
                  <button onClick={save} className="flex-1 rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-1.5 btn-3d"
                    style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 600 }}>
                    <Check size={14} style={{ color: accent }} /> {t.save}
                  </button>
                  <button onClick={cancel} className="rounded-full px-4 py-2.5 text-sm"
                    style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                    {t.cancel}
                  </button>
                </div>
                <p className="meta mt-2.5 leading-relaxed" style={{ fontSize: "0.72rem" }}>{t.nicknameHint}</p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          {[[t.stats.level, level], [t.stats.xp, xp.toLocaleString()]].map(([k, v]) => (
            <div key={k} className="inner px-2 py-2.5 text-center">
              <p className="label" style={{ fontSize: "0.52rem" }}>{k}</p>
              <GradientText gender={gender} className="block mt-0.5" style={{ fontSize: "0.95rem", fontWeight: 800 }}>
                {v}
              </GradientText>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Bacheca Trofei: raggiungimenti reali (streak, livello, check
          registrati, ricomposizione) — accordion chiuso di default, stessa
          filosofia "pagina profilo pulita" dell'Archivio Check sotto. */}
      <Section id="trofei" icon={Trophy}
               title={<GradientText gender={gender}>I tuoi trofei</GradientText>}
               sub="Streak, livelli, check e altri traguardi"
               openId={openSection} setOpenId={setOpenSection}>
        <TrophyShelf level={level} streak={streak} checkinsCount={checkinsCount}
                     weightPoints={weightPoints} circPoints={circPoints} userId={userId} />
      </Section>

      {/* Pausa (vacanza/riposo forzato): solo per chi ha un vero coach dietro
          (Scheda Personalizzata/Coaching Allenamento/Full Coaching) — un
          Free/Premium autogestito non ha nessuno a cui "avvisare" di una
          pausa, il concetto stesso non si applica. */}
      {supabase && userId && ["scheda", "training", "full"].includes(plan) && (
        <div className="mb-4">
          <PauseSection supabase={supabase} userId={userId} accent={accent} accentText={accentText} />
        </div>
      )}

      {/* Chat col coach: stessa esclusiva dei check settimanali e della
          pausa — solo chi ha davvero un coach dietro (Free/Premium restano
          autogestiti, non hanno nessuno con cui parlare qui). */}
      {hasCoachChat && (
        <Section id="chat" icon={MessageCircle}
                 title={<GradientText gender={gender}>Messaggi</GradientText>}
                 sub="Scrivi direttamente al tuo coach"
                 openId={openSection} setOpenId={setOpenSection}
                 badge={unreadChat > 0 && (
                   <span className="absolute rounded-full" style={{ top: -1, right: -1, width: 9, height: 9, backgroundColor: "#DC2626", border: "1.5px solid var(--surface)" }} />
                 )}>
          <ChatThread supabase={supabase} clientId={userId} meId={userId} accent={accent} />
        </Section>
      )}

      {hasCoachChat && (
        <Section id="video-tecnica" icon={Video}
                 title={<GradientText gender={gender}>Video Tecnica</GradientText>}
                 sub="Carica un video di un esercizio per farti correggere"
                 openId={openSection} setOpenId={setOpenSection}>
          <TechniqueVideoPanel supabase={supabase} clientId={userId} role="client" accent={accent} />
        </Section>
      )}

      {/* ---------- Il Mio Archivio Check ---------- */}
      <Section id="archivio" icon={TrendingDown}
               title={<GradientText gender={gender}>{t.archive.title}</GradientText>}
               openId={openSection} setOpenId={setOpenSection}
               sub={weightPoints?.length ? t.archive.subReady(weightPoints.length) : t.archive.subEmpty}>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <p className="label mb-0">{t.archive.weightTrend}</p>
          <span className="flex items-center gap-2">
            {weightPoints?.length > 0 && (
              <button onClick={() => setReportOpen(true)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
                style={{ border: "1px solid var(--line)", color: "var(--ink-2)", fontWeight: 600 }}>
                📄 Report mensile
              </button>
            )}
            {onOpenManualCheck && (
              <button onClick={onOpenManualCheck}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
                style={{ border: `1px solid ${accentText}`, color: accentText, fontWeight: 600 }}>
                + Registra ora
              </button>
            )}
          </span>
        </div>
        <WeightChart points={weightPoints} accent={accent} t={t.archive} />

        <p className="label mt-6 mb-2">Confronto circonferenze</p>
        <CircumferenceChart points={circPoints} accent={accent} />
        <RecompositionBadge weightPoints={weightPoints} circPoints={circPoints} />

        <p className="label mt-6 mb-2">{t.archive.photoGallery}</p>
        <p className="h2 mb-2" style={{ fontSize: "0.95rem" }}>{t.archive.compareTitle}</p>
        <PhotoCompareGrid checkPhotos={checkPhotos} t={t.archive} />

        <p className="h2 mt-6 mb-2" style={{ fontSize: "0.95rem" }}>{t.archive.timelineTitle}</p>
        <BiometricPhotoGallery checkPhotos={checkPhotos} t={t.archive} />
      </Section>

      <Section id="traguardi" icon={Trophy}
               title={<GradientText gender={gender}>{t.records.title}</GradientText>}
               openId={openSection} setOpenId={setOpenSection}
               sub={exercises?.length ? t.records.sub(exercises.length) : t.records.emptyAll}>
        {(() => {
          const favSet = new Set(favoriteExerciseIds || []);
          const filtered = (exercises || []).filter((ex) => exFilter === "favorites" ? favSet.has(ex.id) : true);
          const emptyText = exFilter === "favorites" ? t.records.emptyFavorites : t.records.emptyAll;
          return (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {[["all", t.records.filterAll], ["favorites", t.records.filterFavorites]].map(([id, lab]) => {
                  const on = exFilter === id;
                  return (
                    <button key={id} onClick={() => setExFilter(id)}
                      className="rounded-xl px-1 py-2.5 text-center"
                      style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                                : { border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{lab}</span>
                    </button>
                  );
                })}
              </div>
              {!filtered.length ? (
                <p className="body">{emptyText}</p>
              ) : (
                filtered.map((ex) => (
                  <ExerciseProgressCard key={ex.id} ex={ex} favorite={favSet.has(ex.id)}
                    onToggleFavorite={onToggleFavoriteExercise} accent={accent} t={t.records} />
                ))
              )}
            </>
          );
        })()}
      </Section>

      {reportOpen && (
        <MonthlyReportView profile={profile} accent={accent} level={level} xp={xp} streak={streak}
          weightPoints={weightPoints} circPoints={circPoints} checkPhotos={checkPhotos} t={t}
          onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

/* ============================================================================
   4 · DRAWER IMPOSTAZIONI
   ========================================================================== */

export const OWNER_EMAIL = "danielmarsini@coach.com";

/* Piani Stripe — listino ufficiale a 5 livelli, contenuti tradotti via
   translations.plans[lang][id]. price_id sono placeholder: la Checkout
   Session vera si crea server-side in una Supabase Edge Function.
   currentPlan arriva da Supabase: tabella `subscriptions`, colonna `plan_id`. */
export const STRIPE_PLANS = [
  { id: "free",        emoji: "🆓", price: 0,  billing: "none",      priceId: null },
  { id: "performance", emoji: "⚡", price: 5,  billing: "recurring", priceId: "price_1U53wlFifatHRNX6tkJAV4ni" },
  { id: "scheda",      emoji: "🏋️", price: 40, billing: "one_time",  priceId: "price_1U53w5FifatHRNX6KFotJfnc" },
  { id: "training",    emoji: "🔬", price: 50, billing: "recurring", priceId: "price_1U53vHFifatHRNX6O2Y6fT5n" },
  { id: "full",        emoji: "👑", price: 60, billing: "recurring", priceId: "price_1U53tlFifatHRNX6fVb5k9HC", highlight: true, recommended: true },
];

function Toggle({ on, onClick, label, desc }) {
  return (
    <div className="inner flex items-center justify-between gap-3 px-4 py-3.5 mb-2.5">
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--ink)", fontWeight: 600 }}>{label}</p>
        {desc && <p className="meta mt-0.5 leading-relaxed" style={{ fontSize: "0.75rem" }}>{desc}</p>}
      </div>
      <button onClick={onClick} role="switch" aria-checked={on} aria-label={label}
        className="relative rounded-full transition-all duration-300 shrink-0"
        style={{ width: 48, height: 28, backgroundColor: on ? "var(--ink)" : "var(--surface)",
                 border: on ? "none" : "1px solid var(--line)" }}>
        <span className="absolute rounded-full transition-all duration-300"
              style={{ width: 22, height: 22, top: 3, left: on ? 23 : 3,
                       backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" }} />
      </button>
    </div>
  );
}

/* Card di piano Stripe — glassmorphism; Full Coaching ha micro-bordo
   luminescente + badge fisso bilingue "CONSIGLIATO / RECOMMENDED" (testo
   letterale richiesto dal committente, non tradotto dal motore i18n).
   Se isOwner e plan.id === 'full', mostra "👑 PROPRIETARIO / OWNER" al posto
   del bottone: sblocco nativo, nessun redirect a Stripe. */
export function PlanCard({ plan, active, accent, accentText, gender, dark, t, onChangePlan, isOwner }) {
  const copy = t.plans[plan.id];
  const period = t.periods[plan.billing];
  const ownerOverride = isOwner && plan.id === "full";
  const glow = !!plan.highlight;

  return (
    <div className="relative rounded-2xl p-5 mb-2.5"
         style={{
           backgroundColor: dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.55)",
           backdropFilter: "blur(18px) saturate(160%)",
           WebkitBackdropFilter: "blur(18px) saturate(160%)",
           border: `1.5px solid ${glow || active ? accent : "var(--line)"}`,
           boxShadow: glow
             ? `0 0 0 1px ${accent}55, 0 0 26px ${accent}4D, var(--shadow)`
             : "var(--shadow)",
         }}
         data-theme-card>
      {plan.recommended && (
        <span className="absolute -top-2.5 right-5 rounded-full px-3 py-1"
              style={{ backgroundColor: accent, color: "#111111", fontWeight: 700,
                       fontSize: "0.58rem", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
          CONSIGLIATO / RECOMMENDED
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3 mb-2 mt-1.5">
        <span style={{ color: "var(--ink)", fontSize: "1.02rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
          {plan.emoji} {copy.name}
        </span>
        <GradientText gender={gender} className="shrink-0" style={{ fontWeight: 800, fontSize: "1.05rem" }}>
          {plan.price} €<span style={{ fontWeight: 500, fontSize: "0.68rem" }}> {period}</span>
        </GradientText>
      </div>
      <ul className="space-y-1 mb-1">
        {copy.includes.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
            <Check size={13} className="shrink-0 mt-0.5" style={{ color: accent }} /> {f}
          </li>
        ))}
      </ul>
      {/* Confronto esplicito con quello che MANCA rispetto al piano sopra —
          non solo cosa include, anche cosa non include: crea il contrasto
          che spinge verso il piano più caro (voce esplicita del coach). */}
      {copy.excludes?.length > 0 && (
        <ul className="space-y-1 mb-3">
          {copy.excludes.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-sm" style={{ color: "var(--ink-soft)", opacity: 0.75 }}>
              <X size={13} className="shrink-0 mt-0.5" style={{ color: "var(--ink-soft)" }} /> {f}
            </li>
          ))}
        </ul>
      )}
      {(!copy.excludes || copy.excludes.length === 0) && <div className="mb-3" />}
      {ownerOverride ? (
        <p className="flex items-center gap-1.5" style={{ color: accent, fontSize: "0.72rem", fontWeight: 800,
                     letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <Crown size={13} /> 👑 PROPRIETARIO / OWNER
        </p>
      ) : active ? (
        <p style={{ color: accentText, fontSize: "0.68rem", fontWeight: 700,
                     letterSpacing: "0.08em", textTransform: "uppercase" }}>{t.plan.current}</p>
      ) : (
        <button onClick={() => onChangePlan(plan)}
          className="w-full rounded-full px-4 py-2.5 text-sm"
          style={plan.highlight
            ? { backgroundColor: accent, color: "#111111", fontWeight: 700 }
            : { border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>
          {plan.billing === "none" ? t.plan.freeCta : plan.billing === "one_time" ? t.plan.oneTimeCta : t.plan.switchCta}
        </button>
      )}
    </div>
  );
}

export function SettingsDrawer({
  open, onClose, dark, onToggleDark, accent, accentText, gender, lang, onChangeLang,
  currentPlan, planRenewsOn, accountEmail,
  notifications, onToggleNotification,
  onOpenBillingPortal, onChangePlan, onDeleteAccount, onLogout,
  supabase, userId,   // solo per il toggle reale "Promemoria streak (push)"
}) {
  const t = translations[lang] || translations.it;
  const [tab, setTab] = useState("aspetto");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isRealMode = Boolean(supabase && userId);

  // Stato reale del push: letto dal browser (non da Supabase) perché
  // l'unica fonte di verità su "è davvero attivo qui" è l'abbonamento del
  // Service Worker di QUESTO dispositivo — una riga su push_subscriptions
  // potrebbe esistere per un altro device.
  const [pushState, setPushState] = useState("checking"); // checking | on | off | unsupported | busy
  useEffect(() => {
    if (!open || !isRealMode) return;
    if (!isPushSupported()) { setPushState("unsupported"); return; }
    let cancelled = false;
    getBrowserPushSubscription().then((sub) => { if (!cancelled) setPushState(sub ? "on" : "off"); });
    return () => { cancelled = true; };
  }, [open, isRealMode]);

  // Suoni leggeri (XP, trofei...): spenti di default, letti/scritti solo in
  // localStorage — nessuna dipendenza da Supabase, è una preferenza del
  // dispositivo, non dell'account.
  const [soundOn, setSoundOnState] = useState(false);
  useEffect(() => { if (open) setSoundOnState(isSoundEnabled()); }, [open]);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOnState(next);
    setSoundEnabled(next);
    if (next) playSound("xp"); // anteprima immediata di cosa si è appena attivato
  };

  // "Scarica i miei dati": profilo + i 3 consensi legali esatti accettati
  // alla registrazione (legal_consents, mai letti da nessuna schermata
  // finora) in un unico file JSON leggibile, per gli archivi personali
  // dell'utente — vale per ogni piano, non solo per chi ha un coach.
  const [openDoc, setOpenDoc] = useState(null); // indice CONSENT_COPY aperto nel popup
  const openDocHeaderRef = useRef(null);
  useSwipeDownClose(openDocHeaderRef, () => setOpenDoc(null), openDoc != null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const downloadMyData = async () => {
    if (!isRealMode) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const [profile, consents] = await Promise.all([
        fetchProfileDetails(supabase, userId),
        fetchLegalConsents(supabase, userId).catch(() => null),
      ]);
      const payload = {
        esportato_il: new Date().toISOString(),
        profilo: { email: accountEmail || null, nickname: profile?.nickname || null, bio: profile?.bio || null, iscritto_il: profile?.created_at || null },
        consensi_accettati: consents ? {
          data_accettazione: consents.accepted_at,
          versione_informativa: consents.policy_version,
          data_di_nascita_dichiarata: consents.birth_date,
          testo_accettato: CONSENT_COPY.map((c) => ({ titolo: c.title, testo: c.long })),
        } : "Nessun consenso registrato per questo account.",
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `perform-dati-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PERFORM: errore esportazione dati utente", err);
      setDownloadError(t.privacy.downloadError);
    } finally {
      setDownloadBusy(false);
    }
  };

  const togglePush = async () => {
    setPushState("busy");
    if (pushState === "on") {
      await unsubscribeFromPush(supabase, userId);
      setPushState("off");
      return;
    }
    const res = await subscribeToPush(supabase, userId);
    setPushState(res.ok ? "on" : (res.reason === "denied" ? "off" : "unsupported"));
  };

  // Questi due DEVONO stare prima dell'early return "if (!open) return null"
  // qui sotto, insieme agli altri hook — altrimenti il conteggio di hook
  // chiamati cambia fra un render a drawer chiuso e uno a drawer aperto,
  // React va in crash (schermata nera): è lo stesso bug delle Rules of Hooks
  // già preso e risolto una volta in ClassificaView, non ripeterlo qui.
  const [checkoutBusyId, setCheckoutBusyId] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");

  if (!open) return null;

  const TABS = [["aspetto", t.tabs.aspetto], ["notifiche", t.tabs.notifiche], ["piano", t.tabs.piano], ["privacy", t.tabs.privacy]];
  const activePlan = STRIPE_PLANS.find((p) => p.id === currentPlan) || STRIPE_PLANS[0];
  const isOwner = accountEmail === OWNER_EMAIL;

  // Piano gratuito: nessun pagamento, scrittura diretta come sempre. Piano a
  // pagamento: apre una vera Stripe Checkout Session e redirige lì — plan/
  // client_status si aggiornano SOLO dopo la conferma del webhook lato
  // server (vedi supabase/functions/stripe-webhook), mai qui in ottimistico.
  const startStripeCheckout = async (plan) => {
    if (plan.billing === "none") { onChangePlan(plan.id); return; }
    if (!isRealMode) return;
    setCheckoutError("");
    setCheckoutBusyId(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId: plan.priceId, origin: window.location.origin },
      });
      if (error || !data?.url) throw error || new Error("URL di pagamento non disponibile");
      window.location.href = data.url;
    } catch (err) {
      console.error("PERFORM: errore avvio checkout piano", err);
      setCheckoutError("Non sono riuscito ad avviare il pagamento. Riprova.");
      setCheckoutBusyId(null);
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(9,9,11,0.4)" }}
         role="dialog" aria-modal="true" aria-label={t.settingsTitle}>
      <button className="absolute inset-0" onClick={onClose} aria-label="close" />

      <div className="drawer-in relative w-full max-w-sm h-full overflow-y-auto"
           style={{ backgroundColor: "var(--surface)", boxShadow: "-12px 0 44px rgba(0,0,0,0.18)" }}>
        <div className="px-6 pt-7 pb-4 flex items-center justify-between">
          <p className="h1" style={{ fontSize: "1.2rem", fontWeight: 700 }}>{t.settingsTitle}</p>
          <button onClick={onClose} className="p-2" style={{ color: "var(--ink-2)" }} aria-label="close">
            <X size={17} />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="grid grid-cols-4 gap-1.5">
            {TABS.map(([id, lab]) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)}
                  className="rounded-xl px-1 py-2.5"
                  style={on ? { backgroundColor: "var(--ink)", color: "var(--page)" }
                            : { border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                  <span className="block" style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.02em" }}>{lab}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-10">
          {/* ---------------- ASPETTO ---------------- */}
          {tab === "aspetto" && (
            <div className="spring-in">
              <button onClick={onToggleDark} className="card w-full flex items-center justify-between gap-3 mb-3">
                <span className="flex items-center gap-2.5">
                  {dark ? <Moon size={17} style={{ color: accent }} /> : <Sun size={17} style={{ color: accent }} />}
                  {dark ? (
                    <GradientText gender={gender} style={{ fontWeight: 700 }}>{t.darkModeOnyx}</GradientText>
                  ) : (
                    <span style={{ fontWeight: 700, color: "var(--ink)" }}>{t.darkModeOnyx}</span>
                  )}
                </span>
                <span className="relative rounded-full transition-all duration-300"
                      style={{ width: 48, height: 28, backgroundColor: dark ? accent : "var(--surface-2)",
                               border: dark ? "none" : "1px solid var(--line)" }}>
                  <span className="absolute rounded-full transition-all duration-300"
                        style={{ width: 22, height: 22, top: 3, left: dark ? 23 : 3,
                                 backgroundColor: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.22)" }} />
                </span>
              </button>

              <Toggle on={soundOn} onClick={toggleSound} label="Suoni leggeri"
                desc="Un piccolo suono discreto quando guadagni XP o sblocchi un trofeo — spento di default." />

              <p className="h2 mt-7 mb-3">{t.langLabel}</p>
              <LangSelector lang={lang} onChange={onChangeLang} />
            </div>
          )}

          {/* ---------------- NOTIFICHE ---------------- */}
          {tab === "notifiche" && (
            <div className="spring-in">
              {isRealMode && (
                <div className="card mb-4">
                  <Toggle
                    on={pushState === "on"}
                    onClick={pushState === "busy" || pushState === "checking" || pushState === "unsupported" ? undefined : togglePush}
                    label="Promemoria streak (push)"
                    desc={
                      pushState === "unsupported"
                        ? "Non supportato su questo browser/dispositivo."
                        : "Un avviso in serata se rischi di perdere lo streak di oggi — mai più di uno al giorno."
                    }
                  />
                </div>
              )}
              <p className="label mb-3">{t.notif.title}</p>
              <Toggle on={notifications.meals} onClick={() => onToggleNotification("meals")}
                label={t.notif.meals} desc={t.notif.mealsDesc} />
              <Toggle on={notifications.steps} onClick={() => onToggleNotification("steps")}
                label={t.notif.steps} desc={t.notif.stepsDesc} />
              <Toggle on={notifications.sleep} onClick={() => onToggleNotification("sleep")}
                label={t.notif.sleep} desc={t.notif.sleepDesc} />
              <Toggle on={notifications.motivation} onClick={() => onToggleNotification("motivation")}
                label={t.notif.motivation} desc={t.notif.motivationDesc} />
              <p className="meta mt-3 leading-relaxed" style={{ fontSize: "0.75rem" }}>{t.notif.footer}</p>
            </div>
          )}

          {/* ---------------- ABBONAMENTO / PAYWALL STRIPE ---------------- */}
          {tab === "piano" && (
            <div className="spring-in">
              <div className="card mb-4">
                <p className="label mb-1.5">{t.plan.activeTitle}</p>
                <GradientText gender={gender} className="block mb-1" style={{ fontSize: "1.35rem", fontWeight: 700 }}>
                  {t.plans[activePlan.id].name}
                </GradientText>
                <p className="meta">
                  {isOwner && activePlan.id === "full"
                    ? null
                    : activePlan.billing === "none"
                      ? t.plan.freeRenew
                      : activePlan.billing === "one_time"
                        ? t.plan.oneTimeRenew
                        : planRenewsOn
                          ? t.plan.autoRenew(new Date(planRenewsOn).toLocaleDateString())
                          : t.plan.subscribed}
                </p>
                {activePlan.billing !== "none" && !(isOwner && activePlan.id === "full") && (
                  <button onClick={onOpenBillingPortal}
                    className="w-full rounded-full px-4 py-3 text-sm mt-4 flex items-center justify-center gap-2 btn-3d"
                    style={{ backgroundColor: "#111111", color: "#FFFFFF", fontWeight: 700 }}>
                    <CreditCard size={15} style={{ color: accent }} />
                    {t.plan.manageBilling}
                    <ExternalLink size={12} />
                  </button>
                )}
                <p className="meta mt-2.5 leading-relaxed" style={{ fontSize: "0.72rem" }}>{t.plan.billingNote}</p>
              </div>

              <p className="label mb-3">{t.plan.chooseTitle}</p>
              {checkoutError && (
                <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#DC2626", fontWeight: 500 }}>
                  {checkoutError}
                </p>
              )}
              {STRIPE_PLANS.map((p) => (
                <PlanCard key={p.id} plan={p} active={p.id === activePlan.id}
                          accent={accent} accentText={accentText} gender={gender} dark={dark} t={t}
                          onChangePlan={checkoutBusyId ? () => {} : startStripeCheckout} isOwner={isOwner} />
              ))}
              {checkoutBusyId && (
                <p className="flex items-center justify-center gap-2 text-xs mt-1" style={{ color: "var(--ink-2)" }}>
                  Un attimo…
                </p>
              )}
            </div>
          )}

          {/* ---------------- PRIVACY ---------------- */}
          {tab === "privacy" && (
            <div className="spring-in">
              <div className="card mb-3">
                <p className="flex items-center gap-2 h2 mb-2">
                  <ShieldCheck size={16} style={{ color: accent }} />
                  {t.privacy.title}
                </p>
                <p className="body mb-3">{t.privacy.genericBody}</p>
                {["scheda", "training", "full"].includes(activePlan.id) && (
                  <p className="body">{t.privacy.extendedBody}</p>
                )}
              </div>

              <div className="card mb-3">
                <p className="label mb-1">{t.privacy.documents}</p>
                <p className="meta mb-2" style={{ fontSize: "0.7rem" }}>{t.privacy.documentsHint}</p>
                {CONSENT_COPY.map((d, i) => (
                  <button key={d.key} onClick={() => setOpenDoc(i)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
                          style={{ borderBottom: "1px solid var(--line)" }}>
                    <span className="flex items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
                      <FileText size={14} style={{ color: "var(--ink-2)" }} /> {d.title}
                    </span>
                    <ExternalLink size={13} style={{ color: "var(--ink-2)" }} />
                  </button>
                ))}
              </div>

              {isRealMode && (
                <div className="card mb-3">
                  <p className="label mb-1">{t.privacy.downloadBtn}</p>
                  <p className="meta mb-3" style={{ fontSize: "0.7rem" }}>{t.privacy.downloadHint}</p>
                  {downloadError && <p className="text-xs mb-2" style={{ color: "#DC2626" }}>{downloadError}</p>}
                  <button onClick={downloadMyData} disabled={downloadBusy}
                    className="w-full rounded-2xl px-4 py-3 text-sm flex items-center justify-center gap-2"
                    style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>
                    <FileText size={15} /> {downloadBusy ? t.privacy.downloadBusy : t.privacy.downloadBtn}
                  </button>
                </div>
              )}

              {openDoc != null && (
                <Portal>
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                       style={{ backgroundColor: "rgba(9,9,11,0.6)", backdropFilter: "blur(3px)" }} onClick={() => setOpenDoc(null)}>
                    <div className="spring-in w-full sm:max-w-sm rounded-3xl p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
                         style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}>
                      <div ref={openDocHeaderRef}>
                        <SwipeHandle />
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="h2" style={{ margin: 0 }}>{CONSENT_COPY[openDoc].title}</p>
                          <button onClick={() => setOpenDoc(null)} aria-label="Chiudi"><X size={18} style={{ color: "var(--ink-2)" }} /></button>
                        </div>
                      </div>
                      <p className="body leading-relaxed">{CONSENT_COPY[openDoc].long}</p>
                    </div>
                  </div>
                </Portal>
              )}

              {onLogout && (
                <button onClick={onLogout}
                  className="w-full rounded-2xl px-4 py-3.5 text-sm mb-4"
                  style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)", fontWeight: 600 }}>
                  Esci dall'account
                </button>
              )}

              <div className="rounded-2xl p-5"
                   style={{ backgroundColor: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)" }}>
                <p className="h2 mb-2" style={{ color: "#DC2626" }}>{t.privacy.dangerTitle}</p>
                <p className="body mb-4">{t.privacy.dangerBody}</p>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="w-full rounded-full px-4 py-3 text-sm flex items-center justify-center gap-2"
                    style={{ border: "1px solid #DC2626", color: "#DC2626", fontWeight: 600 }}>
                    <Trash2 size={15} /> {t.privacy.deleteBtn}
                  </button>
                ) : (
                  <div className="spring-in">
                    <p className="text-sm mb-3" style={{ color: "#DC2626", fontWeight: 600 }}>{t.privacy.confirmText}</p>
                    <div className="flex gap-2">
                      <button onClick={onDeleteAccount}
                        className="flex-1 rounded-full px-4 py-3 text-sm"
                        style={{ backgroundColor: "#DC2626", color: "#FFFFFF", fontWeight: 600 }}>
                        {t.privacy.confirmYes}
                      </button>
                      <button onClick={() => setConfirmDelete(false)}
                        className="rounded-full px-4 py-3 text-sm"
                        style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}>
                        {t.privacy.confirmNo}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-center mt-6 leading-relaxed" style={{ fontSize: "10px", color: "#A1A1AA" }}>
                {t.privacy.legalNote}
              </p>
            </div>
          )}

          <p className="label text-center mt-8" style={{ fontSize: "0.6rem" }}>{t.footer}</p>
          <p className="text-center mt-1 italic" style={{ fontSize: "0.56rem", color: "#A1A1AA", opacity: 0.7 }}>
            Evidence-Based Method by D. Marsini
          </p>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/* ============================================================================
   5 · ANTEPRIMA — da eliminare in produzione
   ========================================================================== */

export default function ClientProfileViewPreview({
  gender: genderProp,
  dark: darkProp,
  lang: langProp,
  onChangeLang: onChangeLangProp,
  userPlan,               // 'free' | 'performance_pack' | 'full_coaching' — da App.jsx
  onOpenSettings: onOpenSettingsProp,   // se passato, l'Impostazioni globali di App.jsx sostituisce il drawer locale
  profileOverride,        // { name, nickname, email, joined_at } dalla sessione reale
  ownerEmail,
  supabase, userId,       // solo per XP/livello reale + data di iscrizione reale (VeteranBadge)
} = {}) {
  const isControlled = genderProp !== undefined;
  const [dark, setDark] = useState(darkProp ?? false);
  const [gender, setGender] = useState(genderProp ?? "M");
  const [lang, setLang] = useState(langProp ?? "it");
  const [owner, setOwner] = useState(false);
  const [settings, setSettings] = useState(false);
  const [plan, setPlan] = useState(
    userPlan === "full_coaching" ? "full" : userPlan === "performance_pack" ? "performance" : userPlan === "free" ? "free" : "full"
  );
  useEffect(() => { if (darkProp !== undefined) setDark(darkProp); }, [darkProp]);
  useEffect(() => { if (genderProp !== undefined) setGender(genderProp); }, [genderProp]);
  useEffect(() => { if (langProp !== undefined) setLang(langProp); }, [langProp]);
  const [notif, setNotif] = useState({ meals: true, steps: true, sleep: true, motivation: true });
  const [profile, setProfile] = useState({
    name: "Marco Bianchi", nickname: "IronWolf",
    bio: "Panca e pazienza. Obiettivo: 100 kg per 5 entro l'estate.",
    avatar: null, joined_at: "2023-04-12",
    email: "marco.bianchi@email.it",
    ...profileOverride,
  });

  // XP/livello reali + data di iscrizione reale — STESSA formula usata in
  // Home e Classifica (xpToLevelInfo/computeRealXpAndStreak, coachingData.js
  // — mai un secondo calcolo). In demo restano i valori fissi già in uso.
  const isRealMode = Boolean(supabase && userId);
  const [realXpStreak, setRealXpStreak] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    computeRealXpAndStreak(supabase, userId)
      .then((r) => { if (!cancelled) setRealXpStreak(r); })
      .catch((err) => {
        console.error("PERFORM: errore calcolo XP/livello profilo", err);
        if (!cancelled) setRealXpStreak({ xpTotal: 0, streak: 0 });
      });
    // Nickname/bio/avatar reali: prima il form "Modifica profilo" partiva
    // sempre dai valori demo fissi in questo file, mai da quelli davvero
    // salvati — la causa esatta per cui una modifica sembrava "sparire".
    fetchProfileDetails(supabase, userId)
      .then((data) => {
        if (cancelled || !data) return;
        setProfile((p) => ({
          ...p,
          nickname: data.nickname || p.nickname,
          bio: data.bio ?? "",
          avatar: data.avatar_url || null,
          joined_at: data.created_at ? data.created_at.slice(0, 10) : p.joined_at,
        }));
      })
      .catch((err) => console.error("PERFORM: errore caricamento dettagli profilo", err));
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);
  const realLevelInfo = isRealMode ? xpToLevelInfo(realXpStreak?.xpTotal ?? 0) : null;

  // Trend peso reale: legge i check reali (checkins, coachingData.js) invece
  // dei 6 punti fissi della demo. Ricaricato dopo ogni "Registra ora" così
  // il grafico riflette subito il nuovo check senza dover ricaricare la pagina.
  const [realCheckins, setRealCheckins] = useState(null); // null = non ancora caricato
  const [showManualCheck, setShowManualCheck] = useState(false);
  const reloadCheckins = () => {
    if (!isRealMode) return;
    fetchCheckins(supabase, userId)
      .then((rows) => setRealCheckins(rows))
      .catch((err) => { console.error("PERFORM: errore caricamento check reali", err); setRealCheckins([]); });
  };
  useEffect(() => { reloadCheckins(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isRealMode, supabase, userId]);

  // Oro Lucido Vivo per gli account uomo, Rosa Cipria Luminescente per le donne
  const accent = gender === "F" ? "#E5C1CD" : "#D4AF37";
  const accentText = gender === "F" ? "#9D6666" : "#8C6E33";

  const demoWeightPoints = [
    { label: "C1", kg: 89.6 }, { label: "C2", kg: 89.1 }, { label: "C3", kg: 88.7 },
    { label: "C4", kg: 88.2 }, { label: "C5", kg: 87.9 }, { label: "C6", kg: 87.4 },
  ];
  const weightPoints = isRealMode
    ? (realCheckins ?? [])
        .filter((c) => c.weight != null)
        .map((c) => ({ label: c.date.slice(5).replace("-", "/"), kg: Number(c.weight) }))
    : demoWeightPoints;

  // Circonferenze: confronto ogni volta che il cliente le registra, così
  // vede anche DOVE sta aumentando/diminuendo (non solo il peso) — utile
  // per riconoscere una ricomposizione (peso stabile, vita giù) da un vero
  // dimagrimento o da un bulk. Stesso principio di weightPoints: solo check
  // che hanno davvero quella misura, niente punti a zero inventati.
  const demoCircPoints = [
    { label: "C1", waist: 84, thigh: 58, arm: 37 }, { label: "C2", waist: 83.4, thigh: 58.1, arm: 37.2 },
    { label: "C3", waist: 82.9, thigh: 58.3, arm: 37.3 }, { label: "C4", waist: 82.3, thigh: 58.5, arm: 37.5 },
  ];
  const circPoints = isRealMode
    ? (realCheckins ?? [])
        .filter((c) => c.waist != null || c.thigh != null || c.arm != null)
        .map((c) => ({
          label: c.date.slice(5).replace("-", "/"),
          waist: c.waist != null ? Number(c.waist) : null,
          thigh: c.thigh != null ? Number(c.thigh) : null,
          arm: c.arm != null ? Number(c.arm) : null,
        }))
    : demoCircPoints;
  // Foto reali: realCheckins porta i PATH dello storage privato
  // "checkin-photos" (v36), non URL — ogni path va risolto in un URL
  // firmato temporaneo (1h) al momento della lettura, mai un URL pubblico
  // permanente su foto corporee. Si ricalcola solo quando cambia l'elenco
  // dei check con foto, non ad ogni render.
  const demoCheckPhotos = [
    { date: "2026-02-01", front: null, side: null, back: null },
    { date: "2026-03-01", front: null, side: null, back: null },
    { date: "2026-04-01", front: null, side: null, back: null },
    { date: "2026-05-01", front: null, side: null, back: null },
    { date: "2026-06-01", front: null, side: null, back: null },
    { date: "2026-07-01", front: null, side: null, back: null },
  ];
  const [resolvedCheckPhotos, setResolvedCheckPhotos] = useState(null);
  useEffect(() => {
    if (!isRealMode) return;
    const withPhotos = (realCheckins ?? []).filter((c) => c.has_photos);
    if (withPhotos.length === 0) { setResolvedCheckPhotos([]); return; }
    let cancelled = false;
    Promise.all(withPhotos.map(async (c) => ({
      date: c.date,
      front: await getCheckinPhotoUrl(supabase, c.photo_front_url),
      side: await getCheckinPhotoUrl(supabase, c.photo_side_url),
      back: await getCheckinPhotoUrl(supabase, c.photo_back_url),
    }))).then((shots) => { if (!cancelled) setResolvedCheckPhotos(shots); });
    return () => { cancelled = true; };
  }, [isRealMode, supabase, realCheckins]);
  const checkPhotos = isRealMode ? (resolvedCheckPhotos ?? []) : demoCheckPhotos;

  // Esercizi registrati in Home, sulla scheda impostata dal coach. In
  // isRealMode arrivano da fetchExerciseRecords (storico reale da
  // workout_sets, carico massimo per sessione) invece dalla lista demo
  // sotto; i preferiti si leggono/scrivono su profiles.favorite_exercises
  // (fetchFavoriteExercises/saveFavoriteExercises) così sopravvivono al
  // logout, non più solo stato locale della sessione.
  const [realExercises, setRealExercises] = useState(null); // null = non ancora caricato
  const [realFavoriteIds, setRealFavoriteIds] = useState([]);
  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    fetchExerciseRecords(supabase, userId)
      .then((rows) => { if (!cancelled) setRealExercises(rows); })
      .catch((err) => { console.error("PERFORM: errore caricamento Traguardi reali", err); if (!cancelled) setRealExercises([]); });
    fetchFavoriteExercises(supabase, userId)
      .then((ids) => { if (!cancelled) setRealFavoriteIds(ids); })
      .catch((err) => console.error("PERFORM: errore caricamento preferiti Traguardi", err));
    return () => { cancelled = true; };
  }, [isRealMode, supabase, userId]);

  const [demoFavoriteExerciseIds, setDemoFavoriteExerciseIds] = useState(["panca", "squat", "stacco"]);
  const demoExercises = [
    { id: "panca", name: "Panca Piana Bilanciere", muscleGroup: "Petto", compound: true,
      sessions: [
        { week: "Sett 1", date: "2026-06-01", kg: 72.5, reps: 8 },
        { week: "Sett 2", date: "2026-06-08", kg: 75, reps: 7 },
        { week: "Sett 3", date: "2026-06-15", kg: 77.5, reps: 6 },
        { week: "Sett 4", date: "2026-06-22", kg: 80, reps: 6 },
        { week: "Sett 5", date: "2026-07-20", kg: 82.5, reps: 6 },
      ] },
    { id: "squat", name: "Squat con Bilanciere", muscleGroup: "Gambe", compound: true,
      sessions: [
        { week: "Sett 1", date: "2026-06-02", kg: 105, reps: 6 },
        { week: "Sett 2", date: "2026-06-09", kg: 110, reps: 6 },
        { week: "Sett 3", date: "2026-06-23", kg: 115, reps: 5 },
        { week: "Sett 4", date: "2026-07-15", kg: 120, reps: 5 },
      ] },
    { id: "stacco", name: "Stacco da Terra", muscleGroup: "Dorso/Posteriore", compound: true,
      sessions: [
        { week: "Sett 1", date: "2026-05-30", kg: 135, reps: 4 },
        { week: "Sett 2", date: "2026-06-13", kg: 142.5, reps: 3 },
        { week: "Sett 3", date: "2026-06-28", kg: 150, reps: 3 },
      ] },
    { id: "trazioni", name: "Trazioni Presa Prona", muscleGroup: "Dorso", compound: true,
      sessions: [
        { week: "Sett 1", date: "2026-06-05", kg: 8, reps: 8 },
        { week: "Sett 2", date: "2026-06-19", kg: 10, reps: 7 },
        { week: "Sett 3", date: "2026-07-10", kg: 12.5, reps: 6 },
      ] },
    { id: "curl", name: "Curl Manubri", muscleGroup: "Bicipiti", compound: false,
      sessions: [
        { week: "Sett 1", date: "2026-06-06", kg: 14, reps: 10 },
        { week: "Sett 2", date: "2026-06-20", kg: 15, reps: 10 },
        { week: "Sett 3", date: "2026-07-11", kg: 16, reps: 9 },
      ] },
  ];
  const exercises = isRealMode ? (realExercises ?? []) : demoExercises;
  const favoriteExerciseIds = isRealMode ? realFavoriteIds : demoFavoriteExerciseIds;
  const toggleFavoriteExercise = (id) => {
    if (isRealMode) {
      const next = realFavoriteIds.includes(id) ? realFavoriteIds.filter((x) => x !== id) : [...realFavoriteIds, id];
      setRealFavoriteIds(next); // ottimistico: la UI risponde subito
      saveFavoriteExercises(supabase, userId, next).catch((err) => console.error("PERFORM: errore salvataggio preferiti", err));
      return;
    }
    setDemoFavoriteExerciseIds((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  };

  return (
    <div className={isControlled ? "app-root" : "app-root min-h-screen"} data-theme={dark ? "dark" : "light"}
         style={{ backgroundColor: isControlled ? "transparent" : (dark ? "#09090B" : "#FFFFFF"), transition: "background-color 0.4s ease" }}>
      <style>{`
        .app-root, .app-root *{
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
        .app-root{
          --page:#FFFFFF;--surface:#FFFFFF;--surface-2:#FCFCFD;--line:rgba(17,17,17,.06);
          --shadow:0 8px 30px rgba(0,0,0,.02);--ink:#1A1A1A;--ink-2:#8E8E93;--ink-3:#52525B}
        .app-root[data-theme="dark"]{--page:#09090B;--surface:#18181B;--surface-2:#131316;
          --line:rgba(255,255,255,.07);--shadow:0 8px 30px rgba(0,0,0,.38);
          --ink:#FAFAFA;--ink-2:#A1A1AA;--ink-3:#E4E4E7}
        .h1{color:var(--ink);font-size:1.45rem;font-weight:700;letter-spacing:-0.01em}
        .h2{color:var(--ink);font-size:1.12rem;font-weight:600}
        .body{color:var(--ink-3);font-size:.9rem;line-height:1.6}
        .meta{color:var(--ink-2);font-size:.82rem}
        .label{color:var(--ink-2);font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;font-weight:600}
        .font-data{font-variant-numeric:tabular-nums}
        .card{background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);
          border-radius:1rem;padding:1.5rem}
        .inner{background:var(--surface-2);border:1px solid var(--line);border-radius:.85rem}
        .input{background:var(--surface);border:1px solid var(--line);color:var(--ink);
          border-radius:.7rem;font-size:.95rem}
        .input::placeholder{color:var(--ink-2)}
        @keyframes springIn{0%{opacity:0;transform:translateY(10px) scale(.985)}
          55%{opacity:1;transform:translateY(-2px) scale(1.004)}100%{opacity:1;transform:none}}
        .spring-in{animation:springIn .3s cubic-bezier(.22,1.2,.36,1) both}
        @keyframes drawerIn{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
        .drawer-in{animation:drawerIn .32s cubic-bezier(.22,1.2,.36,1) both}
        @keyframes gradientMove{0%{background-position:0% 50%}100%{background-position:300% 50%}}
        /* Celebrazione trofeo: entra dall'alto con un piccolo rimbalzo,
           resta un attimo, si dissolve da sola — stesso linguaggio del toast
           XP della Home (xpToastPop in 05_HomeDashboard.jsx), qui più grande
           e con un traguardo nominato perché è un evento raro, non uno XP
           di routine. */
        .trophy-celeb-wrap{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
          padding:24px;pointer-events:none}
        .trophy-celeb-card{background:linear-gradient(160deg,#1A1A1A,#09090B);border:1.5px solid rgba(212,175,55,0.5);
          border-radius:1.5rem;padding:28px 32px;text-align:center;box-shadow:0 30px 70px -12px rgba(0,0,0,0.6);
          animation:trophyCelebPop 2.8s cubic-bezier(.22,1,.36,1) both}
        .trophy-celeb-icon{font-size:2.6rem;display:block;margin-bottom:10px;animation:trophyCelebSpin 2.8s ease-in-out both}
        .trophy-celeb-label{color:#D4AF37;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px}
        .trophy-celeb-name{color:#FAFAFA;font-size:1.05rem;font-weight:800}
        @keyframes trophyCelebPop{
          0%{opacity:0;transform:translateY(-20px) scale(.9)}
          14%{opacity:1;transform:translateY(0) scale(1.03)}
          20%{transform:scale(1)}
          85%{opacity:1;transform:none}
          100%{opacity:0;transform:translateY(-10px) scale(.96)}
        }
        @keyframes trophyCelebSpin{
          0%,20%{transform:scale(.5) rotate(-12deg)}
          32%{transform:scale(1.15) rotate(6deg)}
          40%{transform:scale(1) rotate(0deg)}
          100%{transform:scale(1) rotate(0deg)}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}

        /* Report mensile: pagina bianca fissa pensata per la stampa/PDF del
           browser, indipendente dal tema (dark/light) dell'app — un report
           stampato su carta scura sarebbe illeggibile e sprecherebbe inchiostro. */
        .report-overlay{position:fixed;inset:0;z-index:90;background:#F1F1F2;overflow-y:auto}
        .report-toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:flex-end;gap:10px;
          padding:14px 20px;background:rgba(241,241,242,0.92);backdrop-filter:blur(10px)}
        .report-toolbar-btn{border-radius:999px;padding:10px 18px;font-size:0.85rem;font-weight:600;border:none;cursor:pointer}
        .report-toolbar-btn-ghost{background:#FFFFFF;color:#3F3F46;border:1px solid #E4E4E7}
        .report-toolbar-btn-solid{color:#FFFFFF}
        .report-page{max-width:640px;margin:0 auto 40px;background:#FFFFFF;color:#18181B;
          border-radius:16px;padding:36px 32px;box-shadow:0 20px 50px rgba(0,0,0,0.08)}
        .report-header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;
          border-bottom:2px solid #18181B;padding-bottom:14px;margin-bottom:20px}
        .report-brand{font-size:0.7rem;font-weight:800;letter-spacing:0.3em;color:#8C6E33;margin:0 0 2px}
        .report-title{font-size:1.3rem;font-weight:800;margin:0}
        .report-name{font-size:0.95rem;font-weight:600;color:#52525B;margin:0}
        .report-stats{display:flex;gap:12px;margin-bottom:24px}
        .report-stat{flex:1;background:#F8F9FA;border-radius:12px;padding:12px;text-align:center}
        .report-stat-label{font-size:0.62rem;text-transform:uppercase;letter-spacing:0.08em;color:#8E8E93;margin:0 0 4px}
        .report-stat-value{font-size:1.1rem;font-weight:800;margin:0}
        .report-section{margin-bottom:26px}
        .report-section-title{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#8E8E93;font-weight:700;margin:0 0 10px}
        .report-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .report-photo-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
        .report-photo-slot{aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:#F1F1F2;
          display:flex;align-items:center;justify-content:center;color:#A1A1AA;font-size:0.7rem}
        .report-photo-slot img{width:100%;height:100%;object-fit:cover}
        .report-footer{text-align:center;font-size:0.68rem;color:#A1A1AA;margin-top:30px}
        @media print{
          .no-print{display:none!important}
          .report-overlay{position:static;background:#FFFFFF}
          .report-page{box-shadow:none;border-radius:0;max-width:100%;margin:0;padding:0}
        }
      `}</style>

      {!isControlled && (
        <div className="fixed top-3 right-3 z-40 flex gap-2">
          <button onClick={() => setOwner((v) => !v)} className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: owner ? "#D4AF37" : (dark ? "#FAFAFA" : "#111111"),
                     color: owner ? "#111111" : (dark ? "#09090B" : "#FFFFFF"), fontWeight: 600 }}>
            {owner ? "Owner ✓" : "Owner"}
          </button>
          <button onClick={() => setDark((v) => !v)} className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF", fontWeight: 600 }}>
            {dark ? "Light" : "Onyx"}
          </button>
          <button onClick={() => setGender((g) => (g === "M" ? "F" : "M"))} className="text-xs px-3 py-2 rounded-full"
            style={{ backgroundColor: dark ? "#FAFAFA" : "#111111", color: dark ? "#09090B" : "#FFFFFF", fontWeight: 600 }}>
            {gender === "M" ? "Oro" : "Rosa"}
          </button>
        </div>
      )}

      <main className={isControlled ? "" : "max-w-2xl mx-auto px-4 py-16"}>
        <ClientProfileView
          accent={accent} accentText={accentText} gender={gender} lang={lang}
          onChangeLang={onChangeLangProp ?? setLang}
          profile={{ ...profile, email: owner ? (ownerEmail ?? OWNER_EMAIL) : profile.email }}
          level={isRealMode ? realLevelInfo.level : 4} xp={isRealMode ? realLevelInfo.xp : 4850}
          streak={isRealMode ? (realXpStreak?.streak ?? 0) : 12} checkinsCount={isRealMode ? (realCheckins?.length ?? 0) : 6}
          checkPhotos={checkPhotos} weightPoints={weightPoints} circPoints={circPoints}
          exercises={exercises} favoriteExerciseIds={favoriteExerciseIds}
          onToggleFavoriteExercise={toggleFavoriteExercise}
          onSaveProfile={(d) => {
            setProfile((p) => ({ ...p, ...d }));
            // BUG PRESO: qui si aggiornava SOLO lo state locale — nickname e
            // bio non arrivavano mai a Supabase, persi al primo refresh.
            if (isRealMode) {
              saveProfileDetails(supabase, userId, { nickname: d.nickname, bio: d.bio })
                .catch((err) => console.error("PERFORM: errore salvataggio profilo", err));
            }
          }}
          onOpenSettings={onOpenSettingsProp ?? (() => setSettings(true))}
          nicknameTaken={(n) => ["SaraSteel", "LucaE"].some((x) => x.toLowerCase() === n.toLowerCase())}
          onOpenManualCheck={isRealMode ? () => setShowManualCheck(true) : undefined}
          supabase={isRealMode ? supabase : undefined} userId={isRealMode ? userId : undefined}
          plan={plan}
        />
      </main>

      {showManualCheck && (
        <WeeklyCheckModal
          accent={accent} accentText={accentText} gender={gender}
          supabase={supabase} userId={userId}
          onClose={() => setShowManualCheck(false)}
          onSubmit={() => { setShowManualCheck(false); reloadCheckins(); }}
        />
      )}

      {/* Il drawer locale resta solo per la preview isolata: quando il componente
          è controllato da App.jsx, le Impostazioni globali (tema/lingua/piano/account)
          vivono lì, una sola volta per tutta l'app, aperte dall'icona ingranaggio
          nell'header (AppHeader → AppShell → onOpenSettings). */}
      {!isControlled && (
        <SettingsDrawer
          open={settings} onClose={() => setSettings(false)}
          dark={dark} onToggleDark={() => setDark((v) => !v)}
          accent={accent} accentText={accentText} gender={gender} lang={lang} onChangeLang={setLang}
          currentPlan={plan} planRenewsOn="2026-09-01"
          accountEmail={owner ? OWNER_EMAIL : profile.email}
          notifications={notif}
          onToggleNotification={(k) => setNotif((n) => ({ ...n, [k]: !n[k] }))}
          supabase={supabase} userId={userId}
          onOpenBillingPortal={() => {}}
          onChangePlan={(id) => setPlan(id)}
          onDeleteAccount={() => {}}
        />
      )}
    </div>
  );
}
