import { describe, expect, it } from "vitest";
import { Rng } from "../math/rng.js";
import { ALWAYS, and, have, or, ruleCaps, type Rule } from "./logic.js";
import { computeSpheres, hasCycle, isSolvable, type ProgressionItem, type RegionGraph } from "./graph.js";
import { assumedFill } from "./fill.js";
import { generateReach, M4_GADGETS } from "./grammar.js";
import { embedReach, reachableAreas, rememberedLocks, worldReachesAll, type ReachWorld } from "./director.js";

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

// --- Reach region-graph grammar (grammar.ts) ---

describe("reach grammar", () => {
  const M4_CAPS = new Set(M4_GADGETS.map((g) => g.grants));

  it("generates a solvable Reach with both gadgets collectible", () => {
    const r = generateReach({ seed: "reach-alpha" });
    const byId = new Map(r.items.map((i) => [i.id, i] as const));
    expect(isSolvable(r.graph, r.placement, byId, r.startCaps)).toBe(true);
    const { held, reachedAll } = computeSpheres(r.graph, r.placement, byId, r.startCaps);
    expect(reachedAll).toBe(true); // no stranded locations
    for (const g of M4_GADGETS) expect(held.has(g.grants)).toBe(true); // both Instruments obtainable
    // both gadgets actually placed somewhere
    expect(new Set(r.placement.values())).toEqual(new Set(r.items.map((i) => i.id)));
  });

  it("has the Reach cadence + capability gates + a backtracking loop", () => {
    const r = generateReach({ seed: "reach-shape", spineLength: 5 });
    expect(r.graph.start).toBe(r.meta.sanctum);
    expect(r.meta.spine).toHaveLength(5); // 5 areas → boss → next Sanctum
    expect(r.graph.regions.has(r.meta.boss)).toBe(true);
    expect(r.graph.regions.has(r.meta.nextSanctum)).toBe(true);
    expect(r.meta.gatedEdges.length).toBeGreaterThan(0); // something is gadget-gated
    // every gate references only real gadget capabilities
    for (const e of r.meta.gatedEdges) for (const c of ruleCaps(e.rule)) expect(M4_CAPS.has(c)).toBe(true);
    // the graph loops (branch back-edge) — it's a graph, not a tree
    expect(r.meta.cycleEdges.length).toBeGreaterThan(0);
    expect(hasCycle(r.graph)).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const ser = (x: ReturnType<typeof generateReach>): string =>
      JSON.stringify({
        edges: x.graph.edges,
        locations: [...x.graph.locations.entries()],
        placement: [...x.placement.entries()],
      });
    expect(ser(generateReach({ seed: "same" }))).toBe(ser(generateReach({ seed: "same" })));
    expect(ser(generateReach({ seed: "a" }))).not.toBe(ser(generateReach({ seed: "b" })));
  });

  it("1000 generated Reaches are ALWAYS solvable (Docs/11 M4 accept)", () => {
    for (let s = 0; s < 1000; s++) {
      const r = generateReach({ seed: `soak-${s}` }); // throws if the fill ever fails
      const byId = new Map(r.items.map((i) => [i.id, i] as const));
      const { reachedAll } = computeSpheres(r.graph, r.placement, byId, r.startCaps);
      expect(isSolvable(r.graph, r.placement, byId, r.startCaps), `seed ${s}: unsolvable`).toBe(true);
      expect(reachedAll, `seed ${s}: stranded location`).toBe(true);
    }
  });
});

// --- Reach Director: embedding regions → a navigable area/portal world (director.ts) ---

describe("reach director (area embedding)", () => {
  const byId = (w: ReachWorld): Map<string, ProgressionItem> => new Map(w.items.map((i) => [i.id, i] as const));
  const KEYS = new Set(["s", "n1", "n2"]);

  it("embeds a fully-connected, solvable world", () => {
    const w = embedReach(generateReach({ seed: "dir-alpha" }), "dir-alpha");
    // every region became exactly one area; start is the Sanctum
    expect(w.areas.get(w.startAreaId)?.role).toBe("sanctum");
    // placement solves on the CONCRETE embedded topology
    expect(isSolvable(w.graph, w.placement, byId(w), w.startCaps)).toBe(true);
    // holding all capabilities, walking portals reaches every area (no islands)
    const allCaps = new Set([...w.startCaps, ...w.items.map((i) => i.grants)]);
    expect(reachableAreas(w, allCaps).size).toBe(w.areas.size);
    expect(worldReachesAll(w)).toBe(true);
  });

  it("uses only real chamber portals, ≤3 per area, symmetrically linked", () => {
    const w = embedReach(generateReach({ seed: "dir-portals" }), "dir-portals");
    for (const [id, area] of w.areas) {
      expect(area.links.size).toBeLessThanOrEqual(3);
      // start has no back-door; everyone else links home via `s`
      if (id === w.startAreaId) expect(area.links.has("s")).toBe(false);
      else expect(area.links.get("s")?.requires).toEqual(ALWAYS);
      for (const [pk, link] of area.links) {
        expect(KEYS.has(pk)).toBe(true);
        expect(KEYS.has(link.toPortalKey)).toBe(true);
        // the doorway exists on the other side and points straight back
        const back = w.areas.get(link.toAreaId)?.links.get(link.toPortalKey);
        expect(back).toBeDefined();
        expect(back?.toAreaId).toBe(id);
        expect(back?.toPortalKey).toBe(pk);
      }
    }
  });

  it("produces gadget-gated doorways (the metroidvania locks)", () => {
    const w = embedReach(generateReach({ seed: "dir-gates" }), "dir-gates");
    const caps = new Set(w.items.map((i) => i.grants));
    const gated = [...w.areas.values()].flatMap((a) => [...a.links.values()]).filter((l) => l.requires.k !== "always");
    expect(gated.length).toBeGreaterThan(0);
    for (const g of gated) for (const c of ruleCaps(g.requires)) expect(caps.has(c)).toBe(true);
  });

  it("is deterministic for a fixed reach + world seed", () => {
    const ser = (w: ReachWorld): string =>
      JSON.stringify({
        start: w.startAreaId,
        areas: [...w.areas].map(([id, a]) => [id, a.ref, a.role, [...a.links]]),
        placement: [...w.placement.entries()],
      });
    const mk = (): ReachWorld => embedReach(generateReach({ seed: "fixed" }), "fixed");
    expect(ser(mk())).toBe(ser(mk()));
  });

  it("300 embedded Reaches are ALWAYS solvable & fully connected", () => {
    for (let s = 0; s < 300; s++) {
      const w = embedReach(generateReach({ seed: `dsoak-${s}` }), `dsoak-${s}`); // throws on fill failure
      const allCaps = new Set([...w.startCaps, ...w.items.map((i) => i.grants)]);
      expect(reachableAreas(w, allCaps).size, `seed ${s}: disconnected`).toBe(w.areas.size);
      expect(isSolvable(w.graph, w.placement, byId(w), w.startCaps), `seed ${s}: unsolvable`).toBe(true);
    }
  });

  it("remembered locks: doors are seen-but-locked without gadgets, then all open with them", () => {
    // most Reaches have at least one gadget-gated door visible from the start
    // frontier; every Reach must have zero remembered locks once all caps held.
    let sawLocks = 0;
    for (let s = 0; s < 50; s++) {
      const w = embedReach(generateReach({ seed: `rl-${s}` }), `rl-${s}`);
      if (rememberedLocks(w, w.startCaps).length > 0) sawLocks++;
      const allCaps = new Set([...w.startCaps, ...w.items.map((i) => i.grants)]);
      expect(rememberedLocks(w, allCaps), `seed ${s}: lock remains with all caps`).toHaveLength(0);
    }
    expect(sawLocks).toBeGreaterThan(0); // backtracking content actually gets generated
  });
});
