/**
 * Reach region-graph grammar (Docs/07 §5 "region/mission-graph generation" —
 * lock-and-key with cycles). Emits a RegionGraph + progression items that the
 * proven solvability core (graph.ts / fill.ts) turns into a guaranteed-solvable
 * placement.
 *
 * A Reach is the cadence unit (Docs/07 §1, README F8): a start **Sanctum** → a
 * **spine** of area-regions (some entrances capability-gated) → the **boss** →
 * the **next Sanctum**, with branch **pockets** (Starwrought Vaults / loot) and
 * **back-edge shortcuts** that close loops — the structural home of gadget-gated
 * paths and remembered-lock backtracking. Grid embedding (kit → real multi-room
 * areas, M4 next) maps each region to an area/sub-area on top of this.
 *
 * Determinism: seeded Rng only (Docs/02 §4, hard law 9 — no Math.random, no host
 * trig). **Softlock-impossible by construction:** the Sanctum over-provisions
 * ≥ items+1 always-reachable bootstrap slots so assumedFill can never corner, and
 * every region is reachable when all capabilities are held, so the fill's
 * isSolvable regression check always passes.
 */

import { Rng } from "../math/rng.js";
import { ALWAYS, and, have, type Capability, type Rule } from "./logic.js";
import { assumedFill } from "./fill.js";
import { M4_GADGETS } from "../data/gadgets.js";
import type { LocationId, Placement, ProgressionItem, RegionEdge, RegionGraph, RegionId } from "./graph.js";

// The two M4 launch Instruments live in data/gadgets.ts (single source); re-export
// for the procgen surface so callers can keep importing them from here.
export { M4_GADGETS };

export interface ReachGrammarParams {
  seed: string | number;
  /** Progression items to place & to gate with (default: the M4 gadgets). */
  gadgets?: readonly ProgressionItem[];
  /** Number of spine area-regions before the boss (a Reach = 5, Docs/07 §1). */
  spineLength?: number;
  /** Capabilities the party already holds entering the Reach (usually none). */
  startCaps?: Iterable<Capability>;
}

export interface ReachMeta {
  sanctum: RegionId;
  spine: RegionId[]; // ordered area-regions, start → boss
  boss: RegionId;
  nextSanctum: RegionId;
  pockets: RegionId[]; // branch regions (vaults / loot)
  cycleEdges: RegionEdge[]; // back-edges that close loops (shortcuts / remembered locks)
  gatedEdges: RegionEdge[]; // edges carrying a capability lock
}

export interface GeneratedReach {
  graph: RegionGraph;
  items: ProgressionItem[];
  placement: Placement; // guaranteed solvable from startCaps
  startCaps: Set<Capability>;
  meta: ReachMeta;
}

/**
 * Generate one Reach's region graph and a solvable progression placement.
 * Throws only if the fill fails — which is impossible for a well-formed grammar
 * and therefore signals a bug in this file, not bad input.
 */
export function generateReach(params: ReachGrammarParams): GeneratedReach {
  const rng = new Rng(params.seed);
  const items = (params.gadgets ?? M4_GADGETS).map((g) => ({ ...g }));
  const caps = items.map((i) => i.grants);
  const startCaps = new Set<Capability>(params.startCaps ?? []);
  const spineLen = Math.max(2, params.spineLength ?? 5);
  const lockCaps = caps.filter((c) => !startCaps.has(c)); // caps with a placeable item

  const regions = new Set<RegionId>();
  const edges: RegionEdge[] = [];
  const locations = new Map<LocationId, RegionId>();
  const gatedEdges: RegionEdge[] = [];
  const cycleEdges: RegionEdge[] = [];
  let locN = 0;

  const addRegion = (r: RegionId): RegionId => {
    regions.add(r);
    return r;
  };
  const addLoc = (region: RegionId, tag: string): void => {
    locations.set(`L${locN++}.${region}.${tag}`, region);
  };
  const addEdge = (from: RegionId, to: RegionId, rule: Rule): RegionEdge => {
    const e: RegionEdge = { from, to, rule };
    edges.push(e);
    if (rule.k !== "always") gatedEdges.push(e);
    return e;
  };

  // --- Sanctum: over-provision always-reachable bootstrap slots (fill safety) ---
  const sanctum = addRegion("sanctum");
  const bootstrap = items.length + 1 + rng.int(0, 1);
  for (let k = 0; k < bootstrap; k++) addLoc(sanctum, `boot${k}`);

  // --- Spine of area-regions → boss → next Sanctum ---
  const spine: RegionId[] = [];
  for (let i = 0; i < spineLen; i++) {
    const r = addRegion(`area${i + 1}`);
    spine.push(r);
    const nloc = rng.int(1, 2);
    for (let j = 0; j < nloc; j++) addLoc(r, `slot${j}`);
  }
  const boss = addRegion("boss");
  addLoc(boss, "reward");
  const nextSanctum = addRegion("next-sanctum");
  addLoc(nextSanctum, "hearth");

  // spine chain: sanctum → area1 → … → areaN → boss → next
  const chain: RegionId[] = [sanctum, ...spine, boss, nextSanctum];
  // gateable = internal edges only (keep sanctum→area1 entry and boss→next open)
  const gateableIdx: number[] = [];
  for (let i = 1; i <= chain.length - 3; i++) gateableIdx.push(i);
  const shuffledIdx = shuffle(gateableIdx.slice(), rng);
  const spineGate = new Map<number, Capability>();
  if (lockCaps.length > 0) {
    const gateCount = Math.min(shuffledIdx.length, Math.max(1, Math.ceil(lockCaps.length / 2)));
    for (let g = 0; g < gateCount; g++) {
      const idx = shuffledIdx[g];
      if (idx === undefined) break;
      spineGate.set(idx, lockCaps[g % lockCaps.length] as Capability);
    }
  }
  for (let i = 0; i < chain.length - 1; i++) {
    const from = chain[i] as RegionId;
    const to = chain[i + 1] as RegionId;
    const cap = spineGate.get(i);
    addEdge(from, to, cap ? have(cap) : ALWAYS);
  }

  // --- Branch pockets (vaults) + loop shortcuts ---
  const pockets: RegionId[] = [];
  const pocketCount = Math.max(1, lockCaps.length) + rng.int(0, 1);
  for (let p = 0; p < pocketCount; p++) {
    const anchorIdx = rng.int(0, spine.length - 1);
    const anchor = spine[anchorIdx] as RegionId;
    const pocket = addRegion(`vault${p + 1}`);
    pockets.push(pocket);
    const nloc = rng.int(1, 2);
    for (let j = 0; j < nloc; j++) addLoc(pocket, `cache${j}`);

    // entrance: sometimes a compound lock (Docs/07 §2 example: A ∧ B) for a deep vault
    let entrance: Rule = ALWAYS;
    if (lockCaps.length >= 2 && rng.chance(0.25)) {
      const two = shuffle(lockCaps.slice(), rng);
      entrance = and(have(two[0] as Capability), have(two[1] as Capability));
    } else if (lockCaps.length > 0) {
      entrance = have(rng.pick(lockCaps));
    }
    addEdge(anchor, pocket, entrance);

    // sometimes a back-edge to an EARLIER spine region → a loop / shortcut
    if (anchorIdx > 0 && rng.chance(0.6)) {
      const backTarget = spine[rng.int(0, anchorIdx - 1)] as RegionId;
      const backCap = lockCaps.length > 0 && rng.chance(0.5) ? rng.pick(lockCaps) : undefined;
      cycleEdges.push(addEdge(pocket, backTarget, backCap ? have(backCap) : ALWAYS));
    }
  }

  // guarantee at least one real cycle (backtracking structure)
  if (cycleEdges.length === 0 && spine.length >= 2 && pockets.length > 0) {
    cycleEdges.push(addEdge(pockets[0] as RegionId, spine[0] as RegionId, ALWAYS));
  }

  const graph: RegionGraph = { start: sanctum, regions, edges, locations };
  const placement = assumedFill(graph, items, startCaps, rng.fork("fill"));
  if (!placement) {
    throw new Error("generateReach: assumedFill failed — malformed grammar (should be impossible by construction)");
  }

  return {
    graph,
    items,
    placement,
    startCaps,
    meta: { sanctum, spine, boss, nextSanctum, pockets, cycleEdges, gatedEdges },
  };
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}
