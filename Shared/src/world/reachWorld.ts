/**
 * Reach world plan (M4) — turns a generated + embedded Reach (procgen/director)
 * into the concrete, deterministic descriptor the game runs on: per-area portal
 * links (with capability gates), and gadget pickup placements with physical
 * positions. Both the server and the client build this from the same world seed
 * (Docs/02 §3 "clients reconstruct from deterministic descriptors"), so the
 * client knows every gate + pickup without extra protocol — only the *dynamic*
 * held-capabilities bitmask travels on the wire (Snapshot.gadgetBits).
 *
 * Chambers are NOT built here (that cost is paid lazily, per area, on the
 * server; the client already regenerates the current chamber from its AreaRef).
 */

import { generateReach } from "../procgen/grammar.js";
import { embedReach, type PortalKey } from "../procgen/director.js";
import { M4_GADGET_DEFS } from "../data/gadgets.js";
import type { Capability, Rule } from "../procgen/logic.js";
import type { AreaRef } from "../protocol/messages.js";
import type { Vec3 } from "../art/mesh.js";

/** Stable bit index for a gadget capability (order = M4_GADGET_DEFS). -1 if none. */
export function gadgetBit(cap: Capability): number {
  return M4_GADGET_DEFS.findIndex((g) => g.capability === cap);
}

export interface PlanGadget {
  itemId: string;
  cap: Capability;
  bit: number; // gadgetBit(cap)
  pos: Vec3; // pedestal position (feet-ish; z lifted for a floating pickup)
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
  links: Map<PortalKey, PlanPortal>;
  gadgets: PlanGadget[];
}

export interface ReachPlan {
  worldSeed: string;
  startAreaId: number;
  areas: Map<number, PlanArea>;
  gadgetCount: number;
}

export interface ReachPlanOptions {
  spineLength?: number;
}

/** Deterministically plan a whole Reach: areas, gated portals, gadget pickups. */
export function planReach(worldSeed: string, opts: ReachPlanOptions = {}): ReachPlan {
  const reach = generateReach({ seed: worldSeed, ...(opts.spineLength !== undefined ? { spineLength: opts.spineLength } : {}) });
  const world = embedReach(reach, worldSeed);
  const capOfItem = new Map(reach.items.map((i) => [i.id, i.grants] as const));

  const areas = new Map<number, PlanArea>();
  for (const [areaId, area] of world.areas) {
    const links = new Map<PortalKey, PlanPortal>();
    for (const [pk, link] of area.links) {
      links.set(pk, {
        targetAreaId: link.toAreaId,
        targetPortalKey: link.toPortalKey,
        requires: link.requires,
        requiresCap: primaryCap(link.requires),
      });
    }
    const gadgets: PlanGadget[] = [];
    let slot = 0;
    for (const loc of area.locations) {
      const itemId = world.placement.get(loc);
      if (!itemId) continue;
      const cap = capOfItem.get(itemId);
      if (cap === undefined || gadgetBit(cap) < 0) continue; // only gadgets get a pickup
      gadgets.push({ itemId, cap, bit: gadgetBit(cap), pos: pedestalPos(slot++) });
    }
    areas.set(areaId, { ref: area.ref, role: area.role, links, gadgets });
  }

  return { worldSeed, startAreaId: world.startAreaId, areas, gadgetCount: reach.items.length };
}

/** Pedestal positions down the nave aisle (nave is 14 m × 22 m; X centre = 7). */
function pedestalPos(i: number): Vec3 {
  return [7, 5 + i * 3.5, 0.8];
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
