import { describe, expect, it } from "vitest";
import { Rng } from "./rng.js";

describe("Rng determinism", () => {
  it("same seed produces identical sequences", () => {
    const a = new Rng("crawlstar");
    const b = new Rng("crawlstar");
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("different seeds diverge", () => {
    const a = new Rng("crawlstar");
    const b = new Rng("crawlstar2");
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(5);
  });

  it("fork does not advance the parent stream", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    a.fork("loot");
    a.fork("enemies");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("forks are label-stable and independent", () => {
    const f1 = new Rng(42).fork("loot");
    const f2 = new Rng(42).fork("loot");
    const f3 = new Rng(42).fork("enemies");
    expect(f1.next()).toBe(f2.next());
    const divergent = Array.from({ length: 100 }, () => f1.next() === f3.next()).filter(Boolean).length;
    expect(divergent).toBeLessThan(5);
  });

  it("output is well distributed in [0,1)", () => {
    const r = new Rng("distribution");
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.47);
    expect(sum / n).toBeLessThan(0.53);
  });
});
