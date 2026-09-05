import { describe, it, expect } from "vitest";
import {
  kgToLb, lbToKg, cmToInch, inchToCm,
  formatWeight, parseWeightToKg, formatLength, parseLengthToCm,
  weightUnitLabel, lengthUnitLabel,
} from "./units.js";

describe("units: conversioni base", () => {
  it("kgToLb/lbToKg sono inverse", () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
  });

  it("cmToInch/inchToCm sono inverse", () => {
    expect(cmToInch(180)).toBeCloseTo(70.866, 2);
    expect(inchToCm(70.866)).toBeCloseTo(180, 1);
  });
});

describe("units: formatWeight/parseWeightToKg", () => {
  it("metrico: 1 decimale, nessuna conversione", () => {
    expect(formatWeight(82.5, "metric")).toBe(82.5);
    expect(parseWeightToKg(82.5, "metric")).toBe(82.5);
  });

  it("imperiale: converte e arrotonda a intero", () => {
    expect(formatWeight(100, "imperial")).toBe(220); // 220.462 -> 220
    expect(parseWeightToKg(220, "imperial")).toBeCloseTo(99.79, 1);
  });

  it("null/NaN non esplodono", () => {
    expect(formatWeight(null, "metric")).toBeNull();
    expect(parseWeightToKg("", "metric")).toBeNull();
    expect(parseWeightToKg("abc", "imperial")).toBeNull();
  });

  it("round-trip ripetuto non deriva: kg -> lbs -> kg (via parse) resta stabile", () => {
    const originalKg = 82.5;
    // Simula 50 cicli "mostra in lbs, l'utente rilegge lo stesso valore,
    // lo si riconverte in kg" — il valore salvato deve restare ancorato
    // all'ultimo kg noto, non a una catena di arrotondamenti precedenti.
    let kg = originalKg;
    for (let i = 0; i < 50; i++) {
      const shownLbs = formatWeight(kg, "imperial");
      kg = parseWeightToKg(shownLbs, "imperial");
    }
    // Il valore può discostarsi al massimo dell'arrotondamento di UN solo
    // ciclo (l'input mostrato è sempre lo stesso numero di lbs una volta
    // stabilizzato), non accumulare errore ciclo dopo ciclo.
    expect(Math.abs(kg - originalKg)).toBeLessThan(0.5);
    // Verifica esplicita di stabilità: dal 2° ciclo in poi il valore non
    // deve più cambiare (nessun drift progressivo).
    const shownLbs1 = formatWeight(kg, "imperial");
    const kgAgain = parseWeightToKg(shownLbs1, "imperial");
    const shownLbs2 = formatWeight(kgAgain, "imperial");
    expect(shownLbs2).toBe(shownLbs1);
  });
});

describe("units: formatLength/parseLengthToCm", () => {
  it("metrico: intero, nessuna conversione", () => {
    expect(formatLength(180.4, "metric")).toBe(180);
    expect(parseLengthToCm(180, "metric")).toBe(180);
  });

  it("imperiale: converte e arrotonda a 1 decimale", () => {
    expect(formatLength(180, "imperial")).toBeCloseTo(70.9, 1);
    expect(parseLengthToCm(70.9, "imperial")).toBeCloseTo(180.05, 0);
  });

  it("null/NaN non esplodono", () => {
    expect(formatLength(undefined, "imperial")).toBeNull();
    expect(parseLengthToCm(null, "metric")).toBeNull();
  });
});

describe("units: label", () => {
  it("restituisce l'unità corretta per sistema", () => {
    expect(weightUnitLabel("metric")).toBe("kg");
    expect(weightUnitLabel("imperial")).toBe("lbs");
    expect(lengthUnitLabel("metric")).toBe("cm");
    expect(lengthUnitLabel("imperial")).toBe("in");
  });
});
