/**
 * Region graph, reachability, and sphere computation (Docs/07 §2, §5.5).
 * A REGION is a cluster of areas whose entrance edges carry access rules; a
 * LOCATION is a placeable slot (vault pedestal, key alcove, cache) sitting in a
 * region. Spheres are the solvability ladder: sphere 0 = reachable from start
 * with starting capabilities, sphere N+1 = reachable once items in spheres ≤ N
 * are collected. This module is the independent **reachability regression
 * check** — the fill (fill.ts) is verified against it.
 */

import { evalRule, type Capability, type Rule } from "./logic.js";

export type RegionId = string;
export type LocationId = string;

export interface RegionEdge {
  from: RegionId;
  to: RegionId;
  rule: Rule;
}

export interface RegionGraph {
  start: RegionId;
  regions: ReadonlySet<RegionId>;
  edges: readonly RegionEdge[];
  locations: ReadonlyMap<LocationId, RegionId>;
}

/** A progression item grants one capability when collected. */
export interface ProgressionItem {
  id: string;
  grants: Capability;
}

export type Placement = Map<LocationId, string>; // location → item id

/** Regions reachable from `start` given held capabilities (fixed-point BFS). */
export function reachableRegions(g: RegionGraph, held: ReadonlySet<Capability>): Set<RegionId> {
  const reached = new Set<RegionId>([g.start]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of g.edges) {
      if (reached.has(e.from) && !reached.has(e.to) && evalRule(e.rule, held)) {
        reached.add(e.to);
        changed = true;
      }
    }
  }
  return reached;
}

/** Locations whose region is reachable given held capabilities. */
export function reachableLocations(g: RegionGraph, held: ReadonlySet<Capability>): Set<LocationId> {
  const rr = reachableRegions(g, held);
  const out = new Set<LocationId>();
  for (const [loc, reg] of g.locations) if (rr.has(reg)) out.add(loc);
  return out;
}

export interface SphereResult {
  spheres: LocationId[][]; // locations first reachable at each sphere
  held: Set<Capability>; // capabilities collectible in total
  reachedAll: boolean; // every location is reachable (no stranded slots)
}

/** Collect items sphere by sphere from a placement, to a fixed point. */
export function computeSpheres(
  g: RegionGraph,
  placement: ReadonlyMap<LocationId, string>,
  itemsById: ReadonlyMap<string, ProgressionItem>,
  startCaps: ReadonlySet<Capability>,
): SphereResult {
  const held = new Set<Capability>(startCaps);
  const collected = new Set<LocationId>();
  const spheres: LocationId[][] = [];
  for (;;) {
    const newly: LocationId[] = [];
    for (const l of reachableLocations(g, held)) if (!collected.has(l)) newly.push(l);
    if (newly.length === 0) break;
    spheres.push(newly);
    for (const l of newly) {
      collected.add(l);
      const id = placement.get(l);
      const item = id ? itemsById.get(id) : undefined;
      if (item) held.add(item.grants);
    }
  }
  return { spheres, held, reachedAll: collected.size === g.locations.size };
}

/**
 * The zero-softlock guarantee: every progression item is collectible AND every
 * location is reachable, playing forward from starting capabilities.
 */
export function isSolvable(
  g: RegionGraph,
  placement: ReadonlyMap<LocationId, string>,
  itemsById: ReadonlyMap<string, ProgressionItem>,
  startCaps: ReadonlySet<Capability>,
): boolean {
  const { held, reachedAll } = computeSpheres(g, placement, itemsById, startCaps);
  for (const it of itemsById.values()) if (!held.has(it.grants)) return false;
  return reachedAll;
}
