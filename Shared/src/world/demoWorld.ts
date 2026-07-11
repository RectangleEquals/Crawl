/**
 * M2 demo world: two chamber areas linked by one transition (Docs/11 M2).
 * The real Reach Director arrives in M4 — this hand-wires the same shapes
 * the Director will emit: AreaRefs (deterministic descriptors) + portal links.
 */

import { SUNKEN_PARISH } from "../art/style.js";
import { generateChamber, type ChamberData, type ChamberOptions } from "../art/chamber.js";
import type { AreaRef } from "../protocol/messages.js";

export interface PortalLink {
  targetAreaId: number;
  targetPortalKey: string;
}

export interface AreaDef {
  ref: AreaRef;
  chamber: ChamberData;
  /** portalKey → destination. Unlinked portals are dead ends (capped). */
  links: Map<string, PortalLink>;
}

export interface DemoWorld {
  areas: Map<number, AreaDef>;
  startAreaId: number;
}

export function chamberOptionsFor(ref: AreaRef): ChamberOptions {
  return { roofHoles: ref.roofHoles, waterLevel: ref.waterLevel };
}

/** Deterministic: client and server regenerate identical areas from the refs. */
export function buildDemoWorld(worldSeed: string): DemoWorld {
  const naveRef: AreaRef = {
    areaId: 1,
    name: "The Sunken Nave",
    seed: `${worldSeed}:nave`,
    roofHoles: true,
    waterLevel: 0.14,
  };
  const undercroftRef: AreaRef = {
    areaId: 2,
    name: "The Undercroft",
    seed: `${worldSeed}:undercroft`,
    roofHoles: false,
    waterLevel: 0,
  };

  const nave: AreaDef = {
    ref: naveRef,
    chamber: generateChamber(SUNKEN_PARISH, naveRef.seed, chamberOptionsFor(naveRef)),
    links: new Map([["n2", { targetAreaId: 2, targetPortalKey: "s" }]]),
  };
  const undercroft: AreaDef = {
    ref: undercroftRef,
    chamber: generateChamber(SUNKEN_PARISH, undercroftRef.seed, chamberOptionsFor(undercroftRef)),
    links: new Map([["s", { targetAreaId: 1, targetPortalKey: "n2" }]]),
  };

  return {
    areas: new Map([
      [1, nave],
      [2, undercroft],
    ]),
    startAreaId: 1,
  };
}
