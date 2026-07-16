/**
 * Reach Director — area embedding (Docs/07 §5 "grid embedding"). Takes a
 * generated region graph (grammar.ts) and lays it out as a navigable world of
 * **areas** linked by **portals**, carrying each region edge's capability gate
 * onto the doorway. This is the module that "MAKES AreaRefs + links" (Docs/11
 * M4) — the same shapes the hand-wired M2 `demoWorld` produced, now generated.
 *
 * Portal reality (art/chamber.ts): every chamber emits exactly three doorways —
 * `s` (south) + `n1`, `n2` (north). So an area links to ≤3 neighbours. We embed
 * the region graph as a **binary-branching tree**: each area's `s` links back to
 * its host (always open), and the host's free north slot links forward to the
 * child (gated by that region edge's rule). Total north capacity (2 per area)
 * always covers a spanning tree, so any Reach embeds.
 *
 * Solvability is re-established on the CONCRETE area topology: after embedding we
 * run `assumedFill` again over the embedded graph (which still has the Sanctum's
 * ≥ items+1 bootstrap slots), so the placement is guaranteed solvable for the
 * world the player actually walks — not just the abstract graph. Determinism:
 * seeded Rng only (hard law 9).
 */

import { Rng } from "../math/rng.js";
import { ALWAYS, evalRule, type Capability, type Rule } from "./logic.js";
import { assumedFill } from "./fill.js";
import { reachableRegions, type LocationId, type Placement, type ProgressionItem, type RegionEdge, type RegionGraph, type RegionId } from "./graph.js";
import type { GeneratedReach } from "./grammar.js";
import type { AreaRef } from "../protocol/messages.js";

export type PortalKey = "s" | "n1" | "n2";
const NORTH: readonly PortalKey[] = ["n1", "n2"];

/** A directed doorway: which area/portal it leads to, and the gate to pass it. */
export interface AreaPortalLink {
  toAreaId: number;
  toPortalKey: PortalKey;
  requires: Rule; // ALWAYS = open; otherwise a capability gate
}

export type AreaRole = "sanctum" | "area" | "boss" | "next-sanctum" | "vault";

export interface ReachArea {
  ref: AreaRef; // the deterministic descriptor client+server regenerate from
  regionId: RegionId;
  role: AreaRole;
  links: Map<PortalKey, AreaPortalLink>;
  locations: LocationId[]; // placeable slots physically in this area
}

export interface ReachWorld {
  worldSeed: string;
  startAreaId: number;
  areas: Map<number, ReachArea>;
  /** Region graph rebuilt from the embedded portals — the solver's source of truth. */
  graph: RegionGraph;
  placement: Placement; // guaranteed solvable on THIS topology
  items: ProgressionItem[];
  startCaps: Set<Capability>;
}

const AREA_NAMES = [
  "The Sunken Nave", "The Undercroft", "The Drowned Transept", "The Collapsed Cloister",
  "The Silt Gallery", "The Verdigris Crypt", "The Chapel of Salt", "The Flooded Reliquary",
];

/** Embed a generated Reach into a navigable, solvable area/portal world. */
export function embedReach(reach: GeneratedReach, worldSeed = "reach"): ReachWorld {
  const rng = new Rng(`${worldSeed}:embed`);
  const roleOf = buildRoleMap(reach);

  // BFS from the Sanctum over forward edges → placement order + each region's
  // (host, gate) parent. Every region is structurally reachable (grammar builds
  // a connected graph), so all get visited.
  const parent = new Map<RegionId, { from: RegionId; rule: Rule }>();
  const order: RegionId[] = [reach.graph.start];
  const seen = new Set<RegionId>([reach.graph.start]);
  for (let head = 0; head < order.length; head++) {
    const u = order[head] as RegionId;
    for (const e of reach.graph.edges) {
      if (e.from === u && !seen.has(e.to)) {
        seen.add(e.to);
        parent.set(e.to, { from: u, rule: e.rule });
        order.push(e.to);
      }
    }
  }

  // Assign areaIds in BFS order (host is always placed before its children).
  const areaIdOf = new Map<RegionId, number>();
  order.forEach((r, i) => areaIdOf.set(r, i + 1));

  const areas = new Map<number, ReachArea>();
  const freeNorth = new Map<number, PortalKey[]>();
  const nameRng = rng.fork("names");
  const usedNames = new Set<string>();

  const makeArea = (region: RegionId): ReachArea => {
    const areaId = areaIdOf.get(region) as number;
    const role = roleOf.get(region) as AreaRole;
    freeNorth.set(areaId, [...NORTH]);
    const area: ReachArea = {
      ref: areaRef(areaId, region, role, worldSeed, nameRng, usedNames),
      regionId: region,
      role,
      links: new Map(),
      locations: [],
    };
    areas.set(areaId, area);
    return area;
  };

  // sanctum (root) first
  makeArea(reach.graph.start);

  // link each subsequent region to a host with a free north slot (prefer its
  // grammar parent; fall back to the lowest-id area that still has capacity —
  // total north capacity always suffices for a tree).
  for (let i = 1; i < order.length; i++) {
    const region = order[i] as RegionId;
    const area = makeArea(region);
    const p = parent.get(region) as { from: RegionId; rule: Rule };
    let hostId = areaIdOf.get(p.from) as number;
    if ((freeNorth.get(hostId)?.length ?? 0) === 0) {
      hostId = firstFreeHost(freeNorth, area.ref.areaId) ?? hostId;
    }
    const host = areas.get(hostId) as ReachArea;
    const slot = (freeNorth.get(hostId) as PortalKey[]).shift() as PortalKey;
    // forward doorway carries the gate; walking back is always open
    host.links.set(slot, { toAreaId: area.ref.areaId, toPortalKey: "s", requires: p.rule });
    area.links.set("s", { toAreaId: hostId, toPortalKey: slot, requires: ALWAYS });
  }

  // Distribute the region graph's locations to their area; rebuild the embedded
  // region graph and re-solve on it (concrete topology is the source of truth).
  const locations = new Map<LocationId, RegionId>();
  for (const [loc, region] of reach.graph.locations) {
    locations.set(loc, region);
    (areas.get(areaIdOf.get(region) as number) as ReachArea).locations.push(loc);
  }
  const edges: RegionEdge[] = [];
  for (const area of areas.values()) {
    for (const link of area.links.values()) {
      edges.push({ from: area.regionId, to: (areas.get(link.toAreaId) as ReachArea).regionId, rule: link.requires });
    }
  }
  const graph: RegionGraph = { start: reach.graph.start, regions: new Set(areaIdOf.keys()), edges, locations };

  const placement = assumedFill(graph, reach.items, reach.startCaps, rng.fork("refill"));
  if (!placement) {
    throw new Error("embedReach: assumedFill failed on the embedded topology (should be impossible)");
  }

  return {
    worldSeed,
    startAreaId: areaIdOf.get(reach.graph.start) as number,
    areas,
    graph,
    placement,
    items: reach.items,
    startCaps: reach.startCaps,
  };
}

/** All areas reachable by walking portals from the start given held caps. */
export function reachableAreas(world: ReachWorld, held: ReadonlySet<Capability>): Set<number> {
  const reached = new Set<number>([world.startAreaId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, area] of world.areas) {
      if (!reached.has(id)) continue;
      for (const link of area.links.values()) {
        if (!reached.has(link.toAreaId) && evalRule(link.requires, held)) {
          reached.add(link.toAreaId);
          changed = true;
        }
      }
    }
  }
  return reached;
}

/**
 * A **remembered lock**: a gated doorway the party can currently *see* (its area
 * is reachable) but cannot yet open (the gate isn't satisfied). This is exactly
 * what the Cartographer's Astrolabe journals so the player knows where to
 * backtrack once they find the gadget (Docs/06 Astrolabe; M4 accept — "opens one
 * remembered lock by backtracking").
 */
export interface RememberedLock {
  fromAreaId: number;
  portalKey: PortalKey;
  toAreaId: number;
  requires: Rule;
}

export function rememberedLocks(world: ReachWorld, held: ReadonlySet<Capability>): RememberedLock[] {
  const reached = reachableAreas(world, held);
  const out: RememberedLock[] = [];
  for (const id of reached) {
    const area = world.areas.get(id) as ReachArea;
    for (const [pk, link] of area.links) {
      if (link.requires.k !== "always" && !evalRule(link.requires, held)) {
        out.push({ fromAreaId: id, portalKey: pk, toAreaId: link.toAreaId, requires: link.requires });
      }
    }
  }
  return out;
}

// --- helpers ---

function buildRoleMap(reach: GeneratedReach): Map<RegionId, AreaRole> {
  const m = new Map<RegionId, AreaRole>();
  m.set(reach.meta.sanctum, "sanctum");
  for (const r of reach.meta.spine) m.set(r, "area");
  m.set(reach.meta.boss, "boss");
  m.set(reach.meta.nextSanctum, "next-sanctum");
  for (const r of reach.meta.pockets) m.set(r, "vault");
  return m;
}

function firstFreeHost(freeNorth: Map<number, PortalKey[]>, exclude: number): number | undefined {
  let best: number | undefined;
  for (const [id, slots] of freeNorth) {
    if (id !== exclude && slots.length > 0 && (best === undefined || id < best)) best = id;
  }
  return best;
}

function areaRef(
  areaId: number,
  region: RegionId,
  role: AreaRole,
  worldSeed: string,
  rng: Rng,
  usedNames: Set<string>,
): AreaRef {
  const seed = `${worldSeed}:a${areaId}:${region}`;
  const name = roleName(role, rng, usedNames);
  // sanctums are sealed & dry; areas/vaults flood & let moonlight in (varied)
  const sanctumish = role === "sanctum" || role === "next-sanctum";
  const roofHoles = sanctumish ? false : rng.chance(0.6);
  const waterLevel = sanctumish ? 0 : rng.chance(0.5) ? rng.range(0.08, 0.2) : 0;
  return { areaId, name, seed, roofHoles, waterLevel };
}

function roleName(role: AreaRole, rng: Rng, used: Set<string>): string {
  switch (role) {
    case "sanctum":
      return "The Waking Sanctum";
    case "next-sanctum":
      return "The Onward Sanctum";
    case "boss":
      return "The Drowned Reliquary";
    case "vault":
      return "Starwrought Vault";
    default: {
      const free = AREA_NAMES.filter((n) => !used.has(n));
      const pool = free.length > 0 ? free : AREA_NAMES;
      const name = rng.pick(pool);
      used.add(name);
      return name;
    }
  }
}

/** Convenience: does this world's placement solve on its embedded graph? */
export function worldReachesAll(world: ReachWorld): boolean {
  const allCaps = new Set<Capability>([...world.startCaps, ...world.items.map((i) => i.grants)]);
  return reachableRegions(world.graph, allCaps).size === world.graph.regions.size;
}
