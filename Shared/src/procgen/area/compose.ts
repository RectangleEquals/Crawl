/**
 * Area composer entry point (Docs/07). `planAreaLayout` (light) + `emitArea`
 * (heavy) are also exported separately so `planReach` can read gadget/portal
 * anchors without paying for geometry. `composeArea` does both for callers that
 * want a ready `ChamberData`.
 */

import type { ChamberData } from "../../art/chamber.js";
import { areaBiome, type AreaBiome } from "../../art/biomes.js";
import { complexityFor, type ComplexityBudget } from "../complexity.js";
import { planAreaLayout, type AreaLayout, type AreaParams } from "./layout.js";
import { emitArea } from "./emit.js";

export interface ComposeInput {
  seed: number | string;
  biomeId: string;
  depth: number;
  params: AreaParams;
}

export interface ComposedArea {
  layout: AreaLayout;
  chamber: ChamberData;
  biome: AreaBiome;
  budget: ComplexityBudget;
}

export function composeArea(input: ComposeInput): ComposedArea {
  const biome = areaBiome(input.biomeId);
  const budget = complexityFor(input.depth);
  const layout = planAreaLayout(input.seed, biome, budget, input.params);
  const chamber = emitArea(layout, biome, input.seed);
  return { layout, chamber, biome, budget };
}
