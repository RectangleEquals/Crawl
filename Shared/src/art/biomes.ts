/**
 * Biome registry (Docs/01 §4, Docs/07 area composer). The single extension
 * point for "add a biome": maps a biome id to its texture set + composition
 * weights. Kept intentionally small now (Sunken Parish); grows to many biomes /
 * thousands of pieces over the project. `style` links to the palette/BiomeStyle
 * used by the texture synthesizer.
 */

import { SUNKEN_PARISH, type BiomeStyle } from "./style.js";
import type { KitTextureId } from "./textures.js";
import type { RoomArchetypeId } from "../procgen/area/rooms.js";

export interface AreaBiome {
  id: string;
  style: BiomeStyle;
  indoor: boolean;
  tex: { wall: KitTextureId; floor: KitTextureId; trim: KitTextureId; shard: KitTextureId };
  /** Relative weights for the layout's room-archetype picks. */
  roomWeights: Partial<Record<RoomArchetypeId, number>>;
}

export const SUNKEN_PARISH_BIOME: AreaBiome = {
  id: "sunken-parish",
  style: SUNKEN_PARISH,
  indoor: true,
  tex: { wall: "stoneWall", floor: "stoneFloor", trim: "trim", shard: "shard" },
  roomWeights: { rectHall: 3, rotunda: 2, gallery: 2 },
};

export const AREA_BIOMES: Record<string, AreaBiome> = {
  "sunken-parish": SUNKEN_PARISH_BIOME,
};

/** Look up a biome, falling back to Sunken Parish. */
export function areaBiome(id: string): AreaBiome {
  return AREA_BIOMES[id] ?? SUNKEN_PARISH_BIOME;
}
