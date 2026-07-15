/**
 * Assumed fill (Docs/07 §5.2) — the placement algorithm that makes softlocks
 * impossible by CONSTRUCTION rather than by check-and-retry. To place an item,
 * assume the player holds every OTHER unplaced progression item, find the
 * reachable empty locations, and drop the item in one. Inductively this yields
 * a valid sphere ordering: an item is only ever gated behind items placed after
 * it. A reachability regression check (graph.ts `isSolvable`) confirms each run.
 */

import { isSolvable, reachableLocations, type Placement, type ProgressionItem, type RegionGraph } from "./graph.js";
import type { Capability } from "./logic.js";
import type { Rng } from "../math/rng.js";

/**
 * Place all `items` so the result is solvable from `startCaps`. Retries with
 * fresh random orders if an order paints itself into a corner (standard "fill
 * error" recovery). Returns null only if no order works (malformed graph:
 * too few reachable locations).
 */
export function assumedFill(
  g: RegionGraph,
  items: readonly ProgressionItem[],
  startCaps: ReadonlySet<Capability>,
  rng: Rng,
  retries = 30,
): Placement | null {
  const itemsById = new Map(items.map((i) => [i.id, i] as const));
  for (let attempt = 0; attempt < retries; attempt++) {
    const order = shuffle(items.slice(), rng);
    const placement: Placement = new Map();
    const assumed = new Set<Capability>(order.map((i) => i.grants)); // assume all held
    let ok = true;
    for (const item of order) {
      assumed.delete(item.grants); // don't assume the one we're placing
      const held = new Set<Capability>([...startCaps, ...assumed]);
      const empty: string[] = [];
      for (const l of reachableLocations(g, held)) if (!placement.has(l)) empty.push(l);
      if (empty.length === 0) {
        ok = false;
        break;
      }
      placement.set(empty[Math.floor(rng.next() * empty.length)] as string, item.id);
    }
    if (ok && isSolvable(g, placement, itemsById, startCaps)) return placement;
  }
  return null;
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
