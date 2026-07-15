import { describe, expect, it } from "vitest";
import { Rng } from "../math/rng.js";
import { ALWAYS, and, have, or, type Rule } from "./logic.js";
import { computeSpheres, isSolvable, type ProgressionItem, type RegionGraph } from "./graph.js";
import { assumedFill } from "./fill.js";

// M4 launch locks (Docs/06 §2 #1–2): Graviton Tether gap, Gravitic Impeller ledge.
const TETHER: ProgressionItem = { id: "graviton-tether", grants: "tether" };
const IMPELLER: ProgressionItem = { id: "gravitic-impeller", grants: "impeller" };

/** A little hand-built Reach: two gated pockets + a deep vault behind both. */
function handReach(): RegionGraph {
  return {
    start: "sanctum",
    regions: new Set(["sanctum", "gap-pocket", "ledge-pocket", "deep-vault"]),
    edges: [
      { from: "sanctum", to: "gap-pocket", rule: have("tether") },
      { from: "sanctum", to: "ledge-pocket", rule: have("impeller") },
      { from: "gap-pocket", to: "deep-vault", rule: have("impeller") },
      { from: "ledge-pocket", to: "deep-vault", rule: have("tether") },
    ],
    locations: new Map([
      ["L.sanctum.a", "sanctum"],
      ["L.sanctum.b", "sanctum"],
      ["L.gap", "gap-pocket"],
      ["L.ledge", "ledge-pocket"],
      ["L.deep", "deep-vault"],
    ]),
  };
}

const byId = (items: ProgressionItem[]): Map<string, ProgressionItem> => new Map(items.map((i) => [i.id, i]));

describe("reachability & spheres", () => {
  it("computes correct spheres for a known-good placement", () => {
    const g = handReach();
    // tether in a sanctum (sphere 0), impeller behind the tether gap
    const placement = new Map([["L.sanctum.a", "graviton-tether"], ["L.gap", "gravitic-impeller"]]);
    const items = byId([TETHER, IMPELLER]);
    const res = computeSpheres(g, placement, items, new Set());
    expect(res.reachedAll).toBe(true);
    expect(res.spheres[0]).toContain("L.sanctum.a"); // reachable with no items
    expect(res.spheres[0]).not.toContain("L.gap"); // gated behind tether
    // L.gap becomes reachable only after tether is collected (a later sphere)
    const gapSphere = res.spheres.findIndex((s) => s.includes("L.gap"));
    expect(gapSphere).toBeGreaterThan(0);
  });

  it("flags a softlocked placement as unsolvable (regression check works)", () => {
    const g = handReach();
    // both instruments locked behind their own gates → nothing collectible
    const bad = new Map([["L.gap", "graviton-tether"], ["L.ledge", "gravitic-impeller"]]);
    expect(isSolvable(g, bad, byId([TETHER, IMPELLER]), new Set())).toBe(false);
  });
});

describe("assumed fill", () => {
  it("places the two Instruments solvably in the hand-built Reach", () => {
    const g = handReach();
    const placement = assumedFill(g, [TETHER, IMPELLER], new Set(), new Rng("hand"));
    expect(placement).not.toBeNull();
    expect(isSolvable(g, placement!, byId([TETHER, IMPELLER]), new Set())).toBe(true);
    // at least one Instrument must sit in a start-reachable (sphere-0) location
    const spheres = computeSpheres(g, placement!, byId([TETHER, IMPELLER]), new Set()).spheres;
    const sphere0 = new Set(spheres[0]);
    const anyInSphere0 = [...placement!].some(([loc]) => sphere0.has(loc));
    expect(anyInSphere0).toBe(true);
  });

  it("1000 random well-formed Reaches → assumed fill is ALWAYS solvable (Docs/11 M4 accept)", () => {
    const rng = new Rng("m4-solver-soak");
    for (let s = 0; s < 1000; s++) {
      const r = rng.fork(`reach-${s}`);
      const { g, items } = randomReach(r, 3 + Math.floor(r.next() * 4)); // 3–6 gated caps
      const placement = assumedFill(g, items, new Set(), r);
      expect(placement, `seed ${s}: fill failed`).not.toBeNull();
      expect(isSolvable(g, placement as Map<string, string>, byId(items), new Set()), `seed ${s}: unsolvable`).toBe(true);
    }
  });
});

// --- random but well-formed Reach generator (for the soak) ---
// Tree DAG rooted at the sanctum; every edge rule is satisfiable when all caps
// are held (so the world is solvable in principle), and there is always a
// sphere-0 location, and locations ≥ items.
function randomReach(rng: Rng, nCaps: number): { g: RegionGraph; items: ProgressionItem[] } {
  const caps = Array.from({ length: nCaps }, (_, i) => `cap${i}`);
  const items = caps.map((c, i) => ({ id: `item${i}`, grants: c }));
  const regionIds = ["R0", ...caps.map((_, i) => `R${i + 1}`)];
  const edges = [];
  for (let i = 1; i < regionIds.length; i++) {
    const from = regionIds[Math.floor(rng.next() * i)] as string; // an earlier region
    edges.push({ from, to: regionIds[i] as string, rule: randomRule(rng, caps) });
  }
  const locations = new Map<string, string>();
  let n = 0;
  // Ample sphere-0 (start-reachable) slots — ≥ item count + 1 — so assumed fill
  // can never exhaust bootstrap locations. Real Reaches always over-provision
  // slots the same way (every area has several); with (items+1) start slots there
  // is provably always an empty reachable location at each placement step.
  for (let k = 0; k < nCaps + 1; k++) locations.set(`L${n++}`, "R0");
  for (const r of regionIds) locations.set(`L${n++}`, r);
  const extra = 2 + Math.floor(rng.next() * 3);
  for (let e = 0; e < extra; e++) locations.set(`L${n++}`, regionIds[Math.floor(rng.next() * regionIds.length)] as string);
  return { g: { start: "R0", regions: new Set(regionIds), edges, locations }, items };
}

function randomRule(rng: Rng, caps: string[]): Rule {
  const c = (): string => caps[Math.floor(rng.next() * caps.length)] as string;
  const roll = rng.next();
  if (roll < 0.35) return ALWAYS;
  if (roll < 0.75) return have(c());
  if (roll < 0.9) return or(have(c()), have(c()));
  return and(have(c()), have(c()));
}
