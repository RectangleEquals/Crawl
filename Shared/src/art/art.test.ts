import { describe, expect, it } from "vitest";
import { Rng, fnv1a } from "../math/rng.js";
import { SUNKEN_PARISH, rampRgb } from "./style.js";
import { generateKitTextures } from "./textures.js";
import { generateChamber } from "./chamber.js";

function hashBytes(data: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe("texture synthesis", () => {
  it("is deterministic: same style + seed ⇒ identical bytes", () => {
    const a = generateKitTextures(SUNKEN_PARISH, new Rng("world-1"));
    const b = generateKitTextures(SUNKEN_PARISH, new Rng("world-1"));
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      expect(hashBytes(a[key].data)).toBe(hashBytes(b[key].data));
    }
  });

  it("differs across seeds", () => {
    const a = generateKitTextures(SUNKEN_PARISH, new Rng("world-1"));
    const b = generateKitTextures(SUNKEN_PARISH, new Rng("world-2"));
    expect(hashBytes(a.stoneWall.data)).not.toBe(hashBytes(b.stoneWall.data));
  });

  it("only emits colors from the biome's palette ramps", () => {
    const textures = generateKitTextures(SUNKEN_PARISH, new Rng("palette-check"));
    const allowed = new Set<string>();
    for (const ramp of Object.keys(SUNKEN_PARISH.paletteRamps)) {
      for (const c of rampRgb(SUNKEN_PARISH, ramp)) allowed.add(`${c.r},${c.g},${c.b}`);
    }
    for (const tex of Object.values(textures)) {
      for (let i = 0; i < tex.data.length; i += 4) {
        const key = `${tex.data[i]},${tex.data[i + 1]},${tex.data[i + 2]}`;
        expect(allowed.has(key), `${tex.id} pixel ${i / 4} off-palette: ${key}`).toBe(true);
      }
    }
  });
});

describe("chamber generation", () => {
  it("is deterministic per seed", () => {
    const a = generateChamber(SUNKEN_PARISH, "demo");
    const b = generateChamber(SUNKEN_PARISH, "demo");
    expect(JSON.stringify(a.meshes.map((m) => fnv1a(m.positions.join(","))))).toBe(
      JSON.stringify(b.meshes.map((m) => fnv1a(m.positions.join(",")))),
    );
  });

  it("produces valid indexed meshes with matched attribute counts", () => {
    const c = generateChamber(SUNKEN_PARISH, "demo");
    expect(c.meshes.length).toBeGreaterThan(0);
    for (const m of c.meshes) {
      const vertCount = m.positions.length / 3;
      expect(m.positions.length % 3).toBe(0);
      expect(m.normals.length).toBe(m.positions.length);
      expect(m.uvs.length / 2).toBe(vertCount);
      expect(m.indices.length % 3).toBe(0);
      for (const i of m.indices) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(vertCount);
      }
    }
  });

  it("stays within a sane PSX budget", () => {
    const c = generateChamber(SUNKEN_PARISH, "demo");
    const tris = c.meshes.reduce((sum, m) => sum + m.indices.length / 3, 0);
    expect(tris).toBeGreaterThan(200);
    expect(tris).toBeLessThan(20000);
  });
});
