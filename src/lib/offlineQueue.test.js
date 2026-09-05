// Test unitari per la parte pura di offlineQueue.js (backoffMs) — il resto
// del file dipende da IndexedDB, non disponibile nell'ambiente di test
// Node di questo progetto (vedi vite.config.js, environment: "node").
import { describe, it, expect } from "vitest";
import { backoffMs } from "./offlineQueue.js";

describe("backoffMs", () => {
  it("nessun tentativo ancora fatto: nessuna attesa", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(undefined)).toBe(0);
    expect(backoffMs(null)).toBe(0);
  });

  it("cresce esponenzialmente con i tentativi", () => {
    const b1 = backoffMs(1);
    const b2 = backoffMs(2);
    const b3 = backoffMs(3);
    expect(b2).toBeGreaterThan(b1);
    expect(b3).toBeGreaterThan(b2);
  });

  it("mai sotto zero, sempre un numero finito", () => {
    for (let a = 0; a <= 20; a++) {
      expect(backoffMs(a)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(backoffMs(a))).toBe(true);
    }
  });

  it("ha un tetto massimo (5 minuti) anche con moltissimi tentativi", () => {
    const cap = 5 * 60 * 1000;
    expect(backoffMs(50)).toBe(cap);
    expect(backoffMs(1000)).toBe(cap);
  });
});
