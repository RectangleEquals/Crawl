/**
 * Procedural texture synthesis (Docs/01 §5 Phase A): layered noise + pattern
 * stamps, hard-quantized against the biome palette ramps. 64×64 standard.
 * Pure and deterministic — same style + seed ⇒ identical bytes, anywhere.
 */

import { Rng } from "../math/rng.js";
import { hash2, fbm } from "./noise.js";
import { rampRgb, rampSample, type BiomeStyle, type RGB } from "./style.js";

export interface TextureData {
  id: string;
  width: number;
  height: number;
  /** RGBA8, row-major from top-left. */
  data: Uint8ClampedArray;
}

const SIZE = 64;

function makeTexture(id: string, fill: (x: number, y: number) => RGB): TextureData {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = fill(x, y);
      const i = (y * SIZE + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 255;
    }
  }
  return { id, width: SIZE, height: SIZE, data };
}

/** Ashlar stone blocks: mortar seams, per-block value jitter, grime fBm, verdigris creep. */
function stoneWall(style: BiomeStyle, seed: number): TextureData {
  const stone = rampRgb(style, "stone");
  const verdigris = rampRgb(style, "verdigris");
  const ROW = 16; // 4 courses per tile
  const COL = 32; // 2 blocks per course, offset per row
  return makeTexture("stoneWall", (x, y) => {
    const row = Math.floor(y / ROW);
    const xo = (x + (row % 2 === 0 ? 0 : COL / 2) + SIZE) % SIZE;
    const col = Math.floor(xo / COL);
    const inBlockX = xo % COL;
    const inBlockY = y % ROW;
    const mortar = inBlockX < 2 || inBlockY < 2;
    const block = hash2(col, row, seed) * 0.35 + 0.35; // per-block base value
    const grime = fbm(x, y, 24, 3, seed + 7) * 0.35;
    let v = mortar ? 0.12 : block + grime - 0.15;
    // verdigris creep from the bottom (waterline) and noise pockets
    const creep = fbm(x, y + 128, 20, 3, seed + 31) + (1 - y / SIZE) * -0.25;
    if (!mortar && creep > 0.62) {
      return rampSample(verdigris, (creep - 0.62) * 2.2 + block * 0.3);
    }
    return rampSample(stone, v);
  });
}

/** Worn flagstone floor: large tiles, cracks, damp mottling. */
function stoneFloor(style: BiomeStyle, seed: number): TextureData {
  const stone = rampRgb(style, "stone");
  const water = rampRgb(style, "water");
  const TILE = 32;
  return makeTexture("stoneFloor", (x, y) => {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const seam = x % TILE < 2 || y % TILE < 2;
    const base = hash2(tx, ty, seed) * 0.3 + 0.32;
    const wear = fbm(x, y, 16, 3, seed + 13) * 0.3;
    // cracks: thin ridges where two noise octaves nearly cancel
    const crack = Math.abs(fbm(x + 61, y + 17, 22, 2, seed + 41) - 0.5) < 0.015;
    if (seam || crack) return rampSample(stone, 0.1);
    // damp pooling
    const damp = fbm(x + 200, y + 90, 28, 3, seed + 77);
    if (damp > 0.66) return rampSample(water, base + wear);
    return rampSample(stone, base + wear - 0.1);
  });
}

/** Carved pillar shaft: vertical flutes + banding. */
function pillar(style: BiomeStyle, seed: number): TextureData {
  const stone = rampRgb(style, "stone");
  const verdigris = rampRgb(style, "verdigris");
  return makeTexture("pillar", (x, y) => {
    const flute = 1 - Math.abs(((x % 16) / 8) - 1); // triangle wave: pure arithmetic, engine-stable
    const band = y % 32 < 3 || y % 32 > 28 ? -0.2 : 0;
    const grime = fbm(x, y, 20, 3, seed + 3) * 0.25;
    const creep = fbm(x, y + 300, 18, 3, seed + 19);
    if (creep > 0.68) return rampSample(verdigris, grime * 2 + 0.3);
    return rampSample(stone, 0.28 + flute * 0.3 + band + grime);
  });
}

/** Gloam shard crystal: bright emissive core, faceted value steps. */
function shard(style: BiomeStyle, seed: number): TextureData {
  const gloam = rampRgb(style, "gloam");
  return makeTexture("shard", (x, y) => {
    const facets = hash2(Math.floor(x / 9), Math.floor(y / 11), seed) * 0.4;
    const core = 1 - Math.min(1, Math.hypot(x - SIZE / 2, y - SIZE / 2) / (SIZE * 0.55));
    return rampSample(gloam, 0.35 + core * 0.55 + facets * 0.3);
  });
}

/** Trim/accent: aged bronze fittings. */
function trim(style: BiomeStyle, seed: number): TextureData {
  const accent = rampRgb(style, "accent");
  return makeTexture("trim", (x, y) => {
    const stud = (x % 16 > 6 && x % 16 < 10 && y % 16 > 6 && y % 16 < 10) ? 0.35 : 0;
    const grime = fbm(x, y, 12, 3, seed + 5) * 0.3;
    return rampSample(accent, 0.3 + stud + grime);
  });
}

/** Still water surface tint (used on a translucent plane). */
function water(style: BiomeStyle, seed: number): TextureData {
  const ramp = rampRgb(style, "water");
  return makeTexture("water", (x, y) => {
    const ripple = fbm(x, y, 18, 3, seed + 23);
    return rampSample(ramp, 0.3 + ripple * 0.5);
  });
}

export type KitTextureId = "stoneWall" | "stoneFloor" | "pillar" | "shard" | "trim" | "water";

/** Generate the biome's full kit texture set. */
export function generateKitTextures(
  style: BiomeStyle,
  rng: Rng,
): Record<KitTextureId, TextureData> {
  const seed = rng.fork("textures").int(0, 0x7fffffff);
  return {
    stoneWall: stoneWall(style, seed + 1),
    stoneFloor: stoneFloor(style, seed + 2),
    pillar: pillar(style, seed + 3),
    shard: shard(style, seed + 4),
    trim: trim(style, seed + 5),
    water: water(style, seed + 6),
  };
}
