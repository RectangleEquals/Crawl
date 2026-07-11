/**
 * Modular kit-piece generators for the Sunken Parish (Docs/01 §5 Phase A).
 * All geometry in world space (left-handed Z-up), built on the 2 m module
 * grid (Docs/07 §5). Deliberately chunky: PSX budgets are the aesthetic.
 */

import { MeshBuilder, type Vec3, type WorldBox } from "./mesh.js";
import type { Rng } from "../math/rng.js";

/** Push a solid collider box (min/max corners) if a collector is given. */
function solid(col: WorldBox[] | undefined, min: Vec3, max: Vec3): void {
  col?.push({ min, max });
}

export const MODULE = 2; // meters per grid cell
export const WALL_H = 4; // chamber wall height
const UV = 0.5; // texture repeats per meter (64px tile @ 32 texel/m)

/**
 * Literal cos/sin pairs (15°/25°/40° and yaw steps) — rotation without host
 * trig, keeping generation engine-stable (Docs/02 §4 determinism rules).
 */
const TILT: readonly (readonly [number, number])[] = [
  [0.9659, 0.2588],
  [0.9063, 0.4226],
  [0.766, 0.6428],
];
const YAW: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.9239, 0.3827],
  [0.7071, 0.7071],
  [0.3827, 0.9239],
  [0, 1],
  [-0.3827, 0.9239],
  [-0.7071, 0.7071],
  [-0.9239, 0.3827],
];

function rot(v: Vec3, cy: number, sy: number, ct: number, st: number): Vec3 {
  // tilt around X, then yaw around Z (world up)
  const y1 = v[1] * ct - v[2] * st;
  const z1 = v[1] * st + v[2] * ct;
  return [v[0] * cy - y1 * sy, v[0] * sy + y1 * cy, z1];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Floor covering [x0,y0]→[x1,y1] cells; top faces only, one quad PER CELL —
 * large polygons warp hard under affine texturing (the PSX subdivision rule).
 */
export function floorSlab(b: MeshBuilder, x0: number, y0: number, x1: number, y1: number, col?: WorldBox[]): void {
  for (let cx = x0; cx < x1; cx++) {
    for (let cy = y0; cy < y1; cy++) {
      b.box([cx * MODULE, cy * MODULE, -0.2], [(cx + 1) * MODULE, (cy + 1) * MODULE, 0], UV, {
        px: false, nx: false, py: false, ny: false, nz: false,
      });
    }
  }
  solid(col, [x0 * MODULE, y0 * MODULE, -0.2], [x1 * MODULE, y1 * MODULE, 0]);
}

/** Ceiling slab; bottom face only. */
export function ceilingSlab(b: MeshBuilder, x0: number, y0: number, x1: number, y1: number, h: number, col?: WorldBox[]): void {
  b.box([x0 * MODULE, y0 * MODULE, h], [x1 * MODULE, y1 * MODULE, h + 0.3], UV, {
    px: false, nx: false, py: false, ny: false, pz: false,
  });
  solid(col, [x0 * MODULE, y0 * MODULE, h], [x1 * MODULE, y1 * MODULE, h + 0.3]);
}

export type WallDir = "n" | "s" | "e" | "w";

/**
 * One straight wall segment on the edge of cell (cx, cy), facing into the
 * room. 0.3 m thick, WALL_H tall, one module long.
 */
export function wallSegment(b: MeshBuilder, cx: number, cy: number, dir: WallDir, col?: WorldBox[]): void {
  const x = cx * MODULE;
  const y = cy * MODULE;
  const t = 0.3;
  switch (dir) {
    case "s":
      b.box([x, y, 0], [x + MODULE, y + t, WALL_H], UV, { ny: false, pz: false, nz: false });
      solid(col, [x, y, 0], [x + MODULE, y + t, WALL_H]);
      break;
    case "n":
      b.box([x, y + MODULE - t, 0], [x + MODULE, y + MODULE, WALL_H], UV, { py: false, pz: false, nz: false });
      solid(col, [x, y + MODULE - t, 0], [x + MODULE, y + MODULE, WALL_H]);
      break;
    case "w":
      b.box([x, y, 0], [x + t, y + MODULE, WALL_H], UV, { nx: false, pz: false, nz: false });
      solid(col, [x, y, 0], [x + t, y + MODULE, WALL_H]);
      break;
    case "e":
      b.box([x + MODULE - t, y, 0], [x + MODULE, y + MODULE, WALL_H], UV, { px: false, pz: false, nz: false });
      solid(col, [x + MODULE - t, y, 0], [x + MODULE, y + MODULE, WALL_H]);
      break;
  }
}

/**
 * Arched doorway segment (south/north walls only for M1): jambs to 2.4 m,
 * stepped chunky lintel, solid wall above — the PSX arch.
 */
export function archSegment(b: MeshBuilder, trim: MeshBuilder, cx: number, cy: number, dir: "n" | "s", col?: WorldBox[]): void {
  const x = cx * MODULE;
  const y = dir === "s" ? cy * MODULE : cy * MODULE + MODULE - 0.3;
  const y1 = y + 0.3;
  const jamb = 0.4;
  const openTop = 2.4;
  // jambs
  b.box([x, y, 0], [x + jamb, y1, openTop], UV, { pz: false, nz: false });
  b.box([x + MODULE - jamb, y, 0], [x + MODULE, y1, openTop], UV, { pz: false, nz: false });
  // stepped lintel: two shoulder blocks + keystone course
  b.box([x + jamb, y, openTop], [x + jamb + 0.3, y1, openTop + 0.3], UV, {});
  b.box([x + MODULE - jamb - 0.3, y, openTop], [x + MODULE - jamb, y1, openTop + 0.3], UV, {});
  b.box([x, y, openTop + 0.3], [x + MODULE, y1, openTop + 0.7], UV, { nz: false });
  // wall above to full height
  b.box([x, y, openTop + 0.7], [x + MODULE, y1, WALL_H], UV, { pz: false, nz: false });
  // bronze keystone accent
  trim.box([x + MODULE / 2 - 0.2, y - 0.05, openTop + 0.25], [x + MODULE / 2 + 0.2, y1 + 0.05, openTop + 0.75], 1, {});
  // colliders: jambs solid, lintel-and-above solid — the opening stays open
  solid(col, [x, y, 0], [x + jamb, y1, openTop]);
  solid(col, [x + MODULE - jamb, y, 0], [x + MODULE, y1, openTop]);
  solid(col, [x, y, openTop], [x + MODULE, y1, WALL_H]);
}

/** Fluted column with plinth and capital at cell center (cx, cy). */
export function column(shaft: MeshBuilder, trim: MeshBuilder, cx: number, cy: number, col?: WorldBox[]): void {
  const x = cx * MODULE + MODULE / 2;
  const y = cy * MODULE + MODULE / 2;
  const w = 0.28; // half-width of shaft
  trim.box([x - w - 0.12, y - w - 0.12, 0], [x + w + 0.12, y + w + 0.12, 0.35], 1, { nz: false });
  shaft.box([x - w, y - w, 0.35], [x + w, y + w, WALL_H - 0.45], UV * 2, { pz: false, nz: false });
  trim.box([x - w - 0.12, y - w - 0.12, WALL_H - 0.45], [x + w + 0.12, y + w + 0.12, WALL_H], 1, { pz: false });
  solid(col, [x - w - 0.12, y - w - 0.12, 0], [x + w + 0.12, y + w + 0.12, WALL_H]);
}

/** Raised dais: stepped platform of stone slabs centered at (cx, cy) cells. */
export function dais(b: MeshBuilder, cx: number, cy: number, col?: WorldBox[]): { top: Vec3 } {
  const x = cx * MODULE;
  const y = cy * MODULE;
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const inset = i * 0.5;
    b.box(
      [x - 2 + inset, y - 2 + inset, i * 0.25],
      [x + 2 - inset, y + 2 - inset, (i + 1) * 0.25],
      UV,
      { nz: false },
    );
    solid(col, [x - 2 + inset, y - 2 + inset, i * 0.25], [x + 2 - inset, y + 2 - inset, (i + 1) * 0.25]);
  }
  return { top: [x, y, steps * 0.25] };
}

/**
 * Gloam shard cluster: tilted crystal prisms around a center point.
 * Emissive — the renderer gives these bloom and a point light.
 */
export function shardCluster(b: MeshBuilder, center: Vec3, rng: Rng, count = 5): void {
  const r = rng.fork("shards");
  for (let i = 0; i < count; i++) {
    const [cy, sy] = r.pick(YAW);
    const [ct, st] = i === 0 ? [1, 0] : r.pick(TILT); // hero crystal stands straight
    const w = i === 0 ? 0.22 : r.range(0.09, 0.16);
    const h = i === 0 ? r.range(1.5, 1.9) : r.range(0.6, 1.1);
    const off: Vec3 = i === 0 ? [0, 0, 0] : [r.range(-0.55, 0.55), r.range(-0.55, 0.55), 0];
    const base = add(center, off);
    // prism: 4 sides + pyramidal tip, corners rotated by literal-angle table
    const c = (lx: number, ly: number, lz: number): Vec3 => add(base, rot([lx, ly, lz], cy, sy, ct, st));
    const tip = c(0, 0, h + w * 1.8);
    const corners = [c(-w, -w, 0), c(w, -w, 0), c(w, w, 0), c(-w, w, 0)];
    const shoulders = [c(-w, -w, h), c(w, -w, h), c(w, w, h), c(-w, w, h)];
    const sideNormals: Vec3[] = [
      rot([0, -1, 0], cy, sy, ct, st),
      rot([1, 0, 0], cy, sy, ct, st),
      rot([0, 1, 0], cy, sy, ct, st),
      rot([-1, 0, 0], cy, sy, ct, st),
    ];
    for (let s = 0; s < 4; s++) {
      const a = corners[s] as Vec3;
      const bb = corners[(s + 1) % 4] as Vec3;
      const cc = shoulders[(s + 1) % 4] as Vec3;
      const dd = shoulders[s] as Vec3;
      const n = sideNormals[s] as Vec3;
      b.quad(a, bb, cc, dd, n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // tip facet (degenerate quad → triangle look)
      b.quad(dd, cc, tip, tip, n, [[0, 1], [1, 1], [0.5, 0], [0.5, 0]]);
    }
  }
}

/**
 * Wall-mounted torch on a west/east wall cell: bronze bracket + ember head.
 * Returns the flame position for the light spec (warm counterpoint to the
 * gloam — the "less ominous" dial for populated areas).
 */
export function torchSconce(
  trim: MeshBuilder,
  emberB: MeshBuilder,
  cx: number,
  cy: number,
  dir: "w" | "e",
): Vec3 {
  const wallT = 0.3;
  const y = cy * MODULE + MODULE / 2;
  const zBase = 1.55;
  const inward = dir === "w" ? 1 : -1;
  const xWall = dir === "w" ? cx * MODULE + wallT : (cx + 1) * MODULE - wallT;
  const x0 = Math.min(xWall, xWall + inward * 0.22);
  const x1 = Math.max(xWall, xWall + inward * 0.22);
  // bracket arm + cup
  trim.box([x0, y - 0.06, zBase], [x1, y + 0.06, zBase + 0.1], 1, {});
  const cupX0 = Math.min(xWall + inward * 0.14, xWall + inward * 0.34);
  const cupX1 = Math.max(xWall + inward * 0.14, xWall + inward * 0.34);
  trim.box([cupX0, y - 0.1, zBase + 0.1], [cupX1, y + 0.1, zBase + 0.28], 1, { nz: false });
  // ember head (emissive bucket)
  emberB.box([cupX0 + 0.03, y - 0.07, zBase + 0.28], [cupX1 - 0.03, y + 0.07, zBase + 0.5], 2, { nz: false });
  return [xWall + inward * 0.24, y, zBase + 0.55];
}

/** Still-water plane over [x0,y0]→[x1,y1] cells at `level` meters (per-cell quads — see floorSlab). */
export function waterPlane(b: MeshBuilder, x0: number, y0: number, x1: number, y1: number, level: number): void {
  const u = UV * 0.25;
  for (let cx = x0; cx < x1; cx++) {
    for (let cy = y0; cy < y1; cy++) {
      const X0 = cx * MODULE;
      const Y0 = cy * MODULE;
      const X1 = (cx + 1) * MODULE;
      const Y1 = (cy + 1) * MODULE;
      b.quad(
        [X0, Y0, level], [X1, Y0, level], [X1, Y1, level], [X0, Y1, level],
        [0, 0, 1],
        [[X0 * u, Y0 * u], [X1 * u, Y0 * u], [X1 * u, Y1 * u], [X0 * u, Y1 * u]],
      );
    }
  }
}
