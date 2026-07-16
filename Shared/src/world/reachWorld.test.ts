import { describe, expect, it } from "vitest";
import { planReach, gadgetBit } from "./reachWorld.js";
import { M4_GADGET_DEFS } from "../data/gadgets.js";

describe("planReach (M4 world plan)", () => {
  it("plans a start Sanctum, gated portals, and all gadgets as pickups", () => {
    const plan = planReach("world-alpha");
    const start = plan.areas.get(plan.startAreaId);
    expect(start?.role).toBe("sanctum");

    // every gadget in the Reach appears exactly once as a physical pickup
    const pickups = [...plan.areas.values()].flatMap((a) => a.gadgets);
    expect(pickups.length).toBe(plan.gadgetCount);
    expect(new Set(pickups.map((g) => g.itemId)).size).toBe(pickups.length);
    for (const g of pickups) {
      expect(g.bit).toBe(gadgetBit(g.cap));
      expect(g.bit).toBeGreaterThanOrEqual(0);
      expect(g.bit).toBeLessThan(M4_GADGET_DEFS.length);
    }

    // at least one gated doorway names the gadget it needs (metroidvania lock)
    const gated = [...plan.areas.values()]
      .flatMap((a) => [...a.links.values()])
      .filter((l) => l.requires.k !== "always");
    expect(gated.length).toBeGreaterThan(0);
    for (const l of gated) expect(l.requiresCap).not.toBeNull();
  });

  it("is deterministic for a fixed world seed", () => {
    const ser = (seed: string): string =>
      JSON.stringify([...planReach(seed).areas].map(([id, a]) => [id, a.ref, a.role, [...a.links], a.gadgets]));
    expect(ser("same")).toBe(ser("same"));
    expect(ser("a")).not.toBe(ser("b"));
  });
});
