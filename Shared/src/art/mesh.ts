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

/** Axis-aligned world-space box (colliders, triggers). */
export interface WorldBox {
  min: Vec3;
  max: Vec3;
}

export function boxContains(b: WorldBox, p: Vec3): boolean {
  return (
    p[0] >= b.min[0] && p[0] <= b.max[0] &&
    p[1] >= b.min[1] && p[1] <= b.max[1] &&
    p[2] >= b.min[2] && p[2] <= b.max[2]
  );
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** A mutable mesh under construction, one per texture/material bucket. */
export class MeshBuilder {
  readonly data: MeshData;

  /**
   * Faces are auto-subdivided so no quad edge exceeds this length (meters).
   * Affine texturing swims uncontrollably on big polygons — the PSX-era
   * subdivision rule, enforced mechanically (Docs/01 §2.1).
   */
  readonly maxEdge: number;

  constructor(
    texture: KitTextureId,
    flags?: { emissive?: boolean; translucent?: boolean; maxEdge?: number },
  ) {
    this.maxEdge = flags?.maxEdge ?? 1.25;
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
   * Push a quad from four corners in CCW order (front face), with a flat
   * normal and per-corner uvs. Subdivided into a bilinear grid so no edge
   * exceeds `maxEdge` (exact for the planar quads the kit produces).
   */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, uvs: readonly [number, number][]): void {
    const ua = uvs[0] as readonly [number, number];
    const ub = uvs[1] as readonly [number, number];
    const uc = uvs[2] as readonly [number, number];
    const ud = uvs[3] as readonly [number, number];
    const nx = Math.max(1, Math.ceil(Math.max(dist3(a, b), dist3(d, c)) / this.maxEdge));
    const ny = Math.max(1, Math.ceil(Math.max(dist3(a, d), dist3(b, c)) / this.maxEdge));
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const t0 = ix / nx;
        const t1 = (ix + 1) / nx;
        const s0 = iy / ny;
        const s1 = (iy + 1) / ny;
        this.rawQuad(
          this.bilerp(a, b, c, d, t0, s0), this.bilerp(a, b, c, d, t1, s0),
          this.bilerp(a, b, c, d, t1, s1), this.bilerp(a, b, c, d, t0, s1),
          normal,
          [this.bilerpUv(ua, ub, uc, ud, t0, s0), this.bilerpUv(ua, ub, uc, ud, t1, s0),
           this.bilerpUv(ua, ub, uc, ud, t1, s1), this.bilerpUv(ua, ub, uc, ud, t0, s1)],
        );
      }
    }
  }

  private bilerp(a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number, s: number): Vec3 {
    return lerp3(lerp3(a, b, t), lerp3(d, c, t), s);
  }

  private bilerpUv(
    a: readonly [number, number], b: readonly [number, number],
    c: readonly [number, number], d: readonly [number, number],
    t: number, s: number,
  ): [number, number] {
    const top: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const bot: [number, number] = [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t];
    return [top[0] + (bot[0] - top[0]) * s, top[1] + (bot[1] - top[1]) * s];
  }

  private rawQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, uvs: readonly [number, number][]): void {
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
