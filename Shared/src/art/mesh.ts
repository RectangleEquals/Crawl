/**
 * Renderer-free mesh data in WORLD space: left-handed, Z-up (Docs/02 §3).
 * X = east, Y = north, Z = up. The client converts to render space at exactly
 * one boundary (Client/src/render/space.ts).
 */

import type { KitTextureId } from "./textures.js";

export interface MeshData {
  texture: KitTextureId;
  /** Flat xyz triples, world space. */
  positions: number[];
  /** Flat xyz triples, world space, unit length. */
  normals: number[];
  /** Flat uv pairs. */
  uvs: number[];
  /** Triangle indices (counter-clockwise when viewed from the front, world space). */
  indices: number[];
  /** Emissive surfaces glow (shards); renderer maps this to emissive + bloom. */
  emissive?: boolean;
  /** Translucent surfaces (water). */
  translucent?: boolean;
}

export type Vec3 = readonly [number, number, number];

/** A mutable mesh under construction, one per texture/material bucket. */
export class MeshBuilder {
  readonly data: MeshData;

  constructor(texture: KitTextureId, flags?: { emissive?: boolean; translucent?: boolean }) {
    this.data = {
      texture,
      positions: [],
      normals: [],
      uvs: [],
      indices: [],
      ...(flags?.emissive ? { emissive: true } : {}),
      ...(flags?.translucent ? { translucent: true } : {}),
    };
  }

  /**
   * Push a quad (two triangles) from four corners in CCW order (front face),
   * with a flat normal and per-corner uvs.
   */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, uvs: readonly [number, number][]): void {
    const base = this.data.positions.length / 3;
    for (const p of [a, b, c, d]) this.data.positions.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.data.normals.push(normal[0], normal[1], normal[2]);
    for (const uv of uvs) this.data.uvs.push(uv[0], uv[1]);
    this.data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Axis-aligned box from min to max corner, all six faces, uv-mapped at
   * `uvPerMeter` texture repeats per world meter (texel-density discipline).
   * Face selection lets thin pieces skip hidden faces to respect poly budgets.
   */
  box(
    min: Vec3,
    max: Vec3,
    uvPerMeter: number,
    faces: { px?: boolean; nx?: boolean; py?: boolean; ny?: boolean; pz?: boolean; nz?: boolean } = {},
  ): void {
    const f = { px: true, nx: true, py: true, ny: true, pz: true, nz: true, ...faces };
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const u = uvPerMeter;
    // +X (east): CCW seen from +X, up = +Z
    if (f.px)
      this.quad(
        [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1],
        [1, 0, 0],
        [[0, 0], [(y1 - y0) * u, 0], [(y1 - y0) * u, (z1 - z0) * u], [0, (z1 - z0) * u]],
      );
    // -X (west)
    if (f.nx)
      this.quad(
        [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1],
        [-1, 0, 0],
        [[0, 0], [(y1 - y0) * u, 0], [(y1 - y0) * u, (z1 - z0) * u], [0, (z1 - z0) * u]],
      );
    // +Y (north)
    if (f.py)
      this.quad(
        [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1],
        [0, 1, 0],
        [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u, (z1 - z0) * u], [0, (z1 - z0) * u]],
      );
    // -Y (south)
    if (f.ny)
      this.quad(
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [0, -1, 0],
        [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u, (z1 - z0) * u], [0, (z1 - z0) * u]],
      );
    // +Z (top)
    if (f.pz)
      this.quad(
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        [0, 0, 1],
        [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u, (y1 - y0) * u], [0, (y1 - y0) * u]],
      );
    // -Z (bottom)
    if (f.nz)
      this.quad(
        [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0],
        [0, 0, -1],
        [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u, (y1 - y0) * u], [0, (y1 - y0) * u]],
      );
  }

  get triangleCount(): number {
    return this.data.indices.length / 3;
  }
}

/** Merge builders that share texture+flags into a single MeshData list. */
export function mergeMeshes(meshes: readonly MeshData[]): MeshData[] {
  const buckets = new Map<string, MeshData>();
  for (const m of meshes) {
    const key = `${m.texture}|${m.emissive ? "e" : ""}|${m.translucent ? "t" : ""}`;
    const target = buckets.get(key);
    if (!target) {
      buckets.set(key, {
        texture: m.texture,
        positions: [...m.positions],
        normals: [...m.normals],
        uvs: [...m.uvs],
        indices: [...m.indices],
        ...(m.emissive ? { emissive: true } : {}),
        ...(m.translucent ? { translucent: true } : {}),
      });
    } else {
      const offset = target.positions.length / 3;
      target.positions.push(...m.positions);
      target.normals.push(...m.normals);
      target.uvs.push(...m.uvs);
      for (const i of m.indices) target.indices.push(i + offset);
    }
  }
  return [...buckets.values()];
}
