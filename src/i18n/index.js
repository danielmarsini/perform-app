import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import it from "../locales/it.json";
import en from "../locales/en.json";
import es from "../locales/es.json";

/* i18next per i testi UI "di sistema" (nav, chrome, messaggi comuni) —
   affiancato, non sostituisce, il dizionario `translations` già esistente
   in 08_ClientProfileView.jsx (Impostazioni/Piani, già coperto in
   it/en/es/fr): quello resta per ora la fonte per quelle schermate, questo
   è lo standard per tutta la nuova copertura. Stessa lingua attiva in
   entrambi i sistemi: la sorgente di verità resta `profiles.lang`
   (persistita via updateUserLang), qui solo cacheata in localStorage per
   un primo render corretto anche offline/prima del fetch del profilo —
   vedi setI18nLanguage, chiamato da App.jsx appena il profilo è noto. */
const LOCAL_KEY = "perform_lang";
// Il selettore Impostazioni (LANGS in 08_ClientProfileView.jsx) offre anche
// 'fr': nessun bundle fr.json qui (solo 3 lingue coperte da questo sistema
// per ora), ma è comunque una lingua valida da passare a i18next — cade da
// solo sul fallbackLng (en) per ogni chiave senza risorsa fr.
const SUPPORTED = ["it", "en", "es", "fr"];

function initialLanguage() {
  try {
    const cached = localStorage.getItem(LOCAL_KEY);
    if (cached && SUPPORTED.includes(cached)) return cached;
  } catch { /* localStorage non disponibile: fallback sotto */ }
  const nav = typeof navigator !== "undefined" ? (navigator.language || "").slice(0, 2) : "";
  return SUPPORTED.includes(nav) ? nav : "en";
}

i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en }, es: { translation: es } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

// Chiamata quando la lingua cambia (selettore Impostazioni, o al login
// quando arriva profiles.lang) — aggiorna sia i18next sia la cache locale.
export function setI18nLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  i18n.changeLanguage(lang);
  try { localStorage.setItem(LOCAL_KEY, lang); } catch { /* ignorabile */ }
}

export default i18n;
