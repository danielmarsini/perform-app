// moveItem è il cuore del riordino a trascinamento (esercizi, giorni,
// integratori...) — un bug qui riappare come "il riordino non si applica
// bene" ovunque nell'app venga riusato. Testato con particolare attenzione
// ai casi limite (stesso indice, indici fuori range) perché un bug reale
// era già stato preso in passato su un riordino simile (vedi #100/#140
// nella cronologia del progetto: modificare un esercizio o riordinarlo
// cambiava l'ordine in modo inatteso).
import { describe, it, expect } from "vitest";
import { moveItem } from "./useDragReorder.js";

describe("moveItem", () => {
  it("sposta un elemento in avanti mantenendo tutti gli altri nell'ordine relativo", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
  it("sposta un elemento indietro mantenendo tutti gli altri nell'ordine relativo", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("stesso indice di partenza e arrivo => nessuna modifica", () => {
    const arr = ["a", "b", "c"];
    expect(moveItem(arr, 1, 1)).toEqual(arr);
  });
  it("indice negativo o fuori range => ritorna l'array invariato, mai un crash", () => {
    const arr = ["a", "b", "c"];
    expect(moveItem(arr, -1, 1)).toBe(arr);
    expect(moveItem(arr, 1, -1)).toBe(arr);
    expect(moveItem(arr, 5, 1)).toBe(arr);
    expect(moveItem(arr, 1, 5)).toBe(arr);
  });
  it("non muta mai l'array originale (immutabilità)", () => {
    const arr = ["a", "b", "c"];
    const copy = [...arr];
    moveItem(arr, 0, 2);
    expect(arr).toEqual(copy);
  });
  it("array di un solo elemento resta invariato", () => {
    const arr = ["solo"];
    expect(moveItem(arr, 0, 0)).toEqual(["solo"]);
  });
});
