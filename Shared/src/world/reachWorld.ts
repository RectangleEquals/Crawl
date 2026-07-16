/**
 * Reach world plan (M4 + world composer) — turns a generated + embedded Reach
 * (procgen/director) into the concrete, deterministic descriptor the game runs
 * on: per-area biome + depth (complexity), gated portal links, and gadget pickup
 * placements seated in real composed rooms. Both server and client build this
 * from the same world seed + reachIndex (Docs/02 §3), so the client knows every
 * gate + pickup + the exact multi-room layout without extra geometry protocol.
 *
 * Chambers are NOT built here (the LIGHT layout is — cheap; the HEAVY geometry
 * is emitted per-area on demand via `composeArea(areaComposeInput(pa))`).
 */

import { generateReach } from "../procgen/grammar.js";
import { embedReach, type PortalKey } from "../procgen/director.js";
import { complexityFor } from "../procgen/complexity.js";
import { planAreaLayout } from "../procgen/area/layout.js";
import type { ComposeInput } from "../procgen/area/compose.js";
import { M4_GADGET_DEFS } from "../data/gadgets.js";
import { SUNKEN_PARISH_BIOME } from "../art/biomes.js";
import type { Capability, Rule } from "../procgen/logic.js";
import type { AreaRef } from "../protocol/messages.js";
import type { Vec3 } from "../art/mesh.js";

/** Stable bit index for a gadget capability (order = M4_GADGET_DEFS). -1 if none. */
export function gadgetBit(cap: Capability): number {
  return M4_GADGET_DEFS.findIndex((g) => g.capability === cap);
}

/** Depth of an area = its complexity input (Reach depth + position within it). */
const AREA_DEPTH_STEP = 6;

export interface PlanGadget {
  itemId: string;
  cap: Capability;
  bit: number; // gadgetBit(cap)
  pos: Vec3; // pickup position, seated in a composed room
}

export interface PlanPortal {
  targetAreaId: number;
  targetPortalKey: PortalKey;
  requires: Rule; // ALWAYS = open
  requiresCap: Capability | null; // the primary gadget cap gating it (for UI), if any
}

export interface PlanArea {
  ref: AreaRef;
  role: string; // sanctum | area | boss | next-sanctum | vault
  biome: string; // biome id for the area composer
  depth: number; // complexity depth (Reach + position)
  links: Map<PortalKey, PlanPortal>;
  gadgets: PlanGadget[];
}

export interface ReachPlan {
  worldSeed: string;
  reachIndex: number;
  startAreaId: number;
  areas: Map<number, PlanArea>;
  gadgetCount: number;
}

export interface ReachPlanOptions {
  spineLength?: number;
  /** Reach depth — scales generation complexity (openness/loops/maze). */
  reachIndex?: number;
}

/** The exact input to re-compose a planned area's geometry (server + client). */
export function areaComposeInput(pa: PlanArea): ComposeInput {
  return {
    seed: pa.ref.seed,
    biomeId: pa.biome,
    depth: pa.depth,
    params: { externalKeys: [...pa.links.keys()], gadgetCaps: pa.gadgets.map((g) => g.cap) },
  };
}

/** Deterministically plan a whole Reach: areas, biome/depth, gated portals, gadget pickups. */
export function planReach(worldSeed: string, opts: ReachPlanOptions = {}): ReachPlan {
  const reachIndex = opts.reachIndex ?? 0;
  const reach = generateReach({ seed: worldSeed, ...(opts.spineLength !== undefined ? { spineLength: opts.spineLength } : {}) });
  const world = embedReach(reach, worldSeed);
  const capOfItem = new Map(reach.items.map((i) => [i.id, i.grants] as const));

  const areas = new Map<number, PlanArea>();
  let order = 0;
  for (const [areaId, area] of world.areas) {
    const depth = reachIndex * (AREA_DEPTH_STEP * 2) + order++;
    const links = new Map<PortalKey, PlanPortal>();
    for (const [pk, link] of area.links) {
      links.set(pk, {
        targetAreaId: link.toAreaId,
        targetPortalKey: link.toPortalKey,
        requires: link.requires,
        requiresCap: primaryCap(link.requires),
      });
    }

    // caps placed in this area (in location order), then seat them in composed rooms
    const caps: Capability[] = [];
    const items: string[] = [];
    for (const loc of area.locations) {
      const itemId = world.placement.get(loc);
      if (!itemId) continue;
      const cap = capOfItem.get(itemId);
      if (cap === undefined || gadgetBit(cap) < 0) continue;
      caps.push(cap);
      items.push(itemId);
    }
    const layout = planAreaLayout(area.ref.seed, SUNKEN_PARISH_BIOME, complexityFor(depth), {
      externalKeys: [...links.keys()],
      gadgetCaps: caps,
    });
    const anchorOf = new Map(layout.gadgets.map((g) => [g.cap, g.pos] as const));
    const gadgets: PlanGadget[] = caps.map((cap, i) => ({
      itemId: items[i] as string,
      cap,
      bit: gadgetBit(cap),
      pos: anchorOf.get(cap) ?? [0, 0, 0.8],
    }));

    areas.set(areaId, { ref: area.ref, role: area.role, biome: "sunken-parish", depth, links, gadgets });
  }

  return { worldSeed, reachIndex, startAreaId: world.startAreaId, areas, gadgetCount: reach.items.length };
}

function primaryCap(rule: Rule): Capability | null {
  if (rule.k === "have") return rule.cap;
  if (rule.k === "and" || rule.k === "or") {
    for (const x of rule.of) {
      const c = primaryCap(x);
      if (c) return c;
    }
  }
  return null;
}
