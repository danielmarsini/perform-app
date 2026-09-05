/* ============================================================================
   units.js — sistema dual-unit (Metrico/Imperiale).

   Regola chiave contro il "drift" di arrotondamento: il DB e ogni calcolo
   interno (volume, target nutrizionali, storico) restano SEMPRE in unità
   metriche (kg, cm) — l'unità imperiale è solo di visualizzazione/input,
   mai la fonte di verità. Convertire ripetutamente (kg->lbs->kg su ogni
   render, o sommare valori già convertiti) accumula errore visibile nel
   tempo su un log ripetuto per mesi; qui invece si converte una sola volta,
   al momento di mostrare o di leggere un input, sempre a partire dal
   valore metrico canonico.
   ========================================================================== */

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

// Arrotonda a un numero di decimali senza i classici problemi di floating
// point di Math.round(x * 100) / 100 (es. 1.005 -> 1 invece di 1.01).
function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function kgToLb(kg) {
  return kg / KG_PER_LB;
}

export function lbToKg(lb) {
  return lb * KG_PER_LB;
}

export function cmToInch(cm) {
  return cm / CM_PER_INCH;
}

export function inchToCm(inch) {
  return inch * CM_PER_INCH;
}

// Converte un peso in kg (fonte di verità) nell'unità di visualizzazione
// richiesta, arrotondato per una UI pulita — 1 decimale in kg (carichi da
// palestra: 0.5kg/1.25kg su bilancieri/manubri), intero in lbs (i dischi
// imperiali standard sono 2.5/5lbs, un decimale non aggiunge precisione
// reale e appesantisce la lettura).
export function formatWeight(kg, unitSystem) {
  if (kg == null || Number.isNaN(kg)) return null;
  return unitSystem === "imperial" ? roundTo(kgToLb(kg), 0) : roundTo(kg, 1);
}

// Converte un valore inserito dall'utente nell'unità attiva in kg (fonte
// di verità) da salvare — l'inverso esatto di formatWeight, mai il
// contrario (non si "ri-arrotonda" un valore già arrotondato).
export function parseWeightToKg(value, unitSystem) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return unitSystem === "imperial" ? lbToKg(n) : n;
}

// Circonferenze/altezza: cm è la fonte di verità, cm interi restano il
// grado di precisione utile in metrico; in imperiale si mostra in pollici
// con 1 decimale (un pollice è quasi 2.5cm, arrotondare all'intero
// perderebbe più risoluzione di quanta ne offra il cm).
export function formatLength(cm, unitSystem) {
  if (cm == null || Number.isNaN(cm)) return null;
  return unitSystem === "imperial" ? roundTo(cmToInch(cm), 1) : roundTo(cm, 0);
}

export function parseLengthToCm(value, unitSystem) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return unitSystem === "imperial" ? inchToCm(n) : n;
}

export function weightUnitLabel(unitSystem) {
  return unitSystem === "imperial" ? "lbs" : "kg";
}

export function lengthUnitLabel(unitSystem) {
  return unitSystem === "imperial" ? "in" : "cm";
}
