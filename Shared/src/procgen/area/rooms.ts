/**
 * Room archetypes (Docs/07 area composer). Each archetype PLANS a room (size +
 * candidate sockets, cheap) and EMITS its geometry (walls/floor/ceiling). Shapes
 * are chunky-PSX but NOT pure-90° boxes: `rotunda` is a faceted round room whose
 * exits leave at varied angles, `gallery` is a long colonnade, `rectHall` a
 * plain hall. This registry is where environmental variety grows over time.
 *
 * Determinism: seeded Rng + deterministic trig (dsin/dcos) only (law 9).
 */

import type { MeshBuilder } from "../../art/mesh.js";
import type { Vec3, WorldBox } from "../../art/mesh.js";
import { Rng } from "../../math/rng.js";
import { dcos, dsin } from "../../math/trig.js";
import { walkSocket, type Socket } from "./sockets.js";

export type RoomArchetypeId = "rectHall" | "rotunda" | "gallery";

export interface RoomShape {
  archetype: RoomArchetypeId;
  /** XY half-extents (footprint AABB = center ± [hx, hy]). */
  half: [number, number];
  /** full wall height. */
  height: number;
  /** LOCAL candidate sockets (relative to room centre). */
  sockets: Socket[];
}

const WALL_H = 4;
const WALL_T = 0.35;
const DOOR_H = 2.6;
const UV = 0.5;

export interface RoomBuilders {
  wall: MeshBuilder;
  floor: MeshBuilder;
  trim: MeshBuilder;
}

/** Plan a room of the given archetype, sized under `sizeMax` metres. */
export function planRoom(archetype: RoomArchetypeId, rng: Rng, sizeMax: number): RoomShape {
  switch (archetype) {
    case "rotunda": {
      const r = clamp(rng.range(5, sizeMax / 2), 4.5, 17);
      const k = 6 + rng.int(0, 3);
      const sockets: Socket[] = [];
      for (let i = 0; i < k; i++) {
        const a = (i * (Math.PI * 2)) / k + rng.range(-0.16, 0.16);
        const dir: Vec3 = [dcos(a), dsin(a), 0];
        sockets.push(walkSocket([dir[0] * r, dir[1] * r, 0], dir));
      }
      return { archetype, half: [r, r], height: WALL_H, sockets };
    }
    case "gallery": {
      const hw = rng.range(3, 4.5);
      const hl = clamp(rng.range(8, sizeMax / 2), 8, 15);
      return { archetype, half: [hw, hl], height: WALL_H, sockets: boxSockets(hw, hl) };
    }
    default: {
      const hx = clamp(rng.range(3.5, sizeMax / 2), 3.5, 12);
      const hy = clamp(rng.range(3.5, sizeMax / 2), 3.5, 12);
      return { archetype: "rectHall", half: [hx, hy], height: WALL_H, sockets: boxSockets(hx, hy) };
    }
  }
}

/** N / S / E / W edge-midpoint sockets for a box footprint. */
function boxSockets(hx: number, hy: number): Socket[] {
  return [
    walkSocket([0, hy, 0], [0, 1, 0]), // 0 N
    walkSocket([0, -hy, 0], [0, -1, 0]), // 1 S
    walkSocket([hx, 0, 0], [1, 0, 0]), // 2 E
    walkSocket([-hx, 0, 0], [-1, 0, 0]), // 3 W
  ];
}

/** Emit a room's geometry at world `center`; `used` = socket indices that are doorways. */
export function emitRoom(bs: RoomBuilders, shape: RoomShape, center: Vec3, used: ReadonlySet<number>, col: WorldBox[]): void {
  const [cx, cy] = center;
  const [hx, hy] = shape.half;
  // floor + ceiling as AABB slabs (round walls sit on a square slab; corners hide)
  slab(bs.floor, [cx - hx, cy - hy, -0.2], [cx + hx, cy + hy, 0], col, true);
  slab(bs.wall, [cx - hx, cy - hy, WALL_H], [cx + hx, cy + hy, WALL_H + 0.3], col, false);

  if (shape.archetype === "rotunda") {
    emitRing(bs, shape, center, used, col);
  } else {
    emitBoxWalls(bs, shape, center, used, col);
    if (shape.archetype === "gallery") emitColonnade(bs, shape, center);
  }
}

/** Top (floor) or bottom (ceiling) slab face + a solid collider. */
function slab(b: MeshBuilder, min: Vec3, max: Vec3, col: WorldBox[], floor: boolean): void {
  b.box(min, max, UV, floor
    ? { px: false, nx: false, py: false, ny: false, nz: false }
    : { px: false, nx: false, py: false, ny: false, pz: false });
  col.push({ min, max });
}

/** Four axis walls with a centred door gap on any used side. */
function emitBoxWalls(bs: RoomBuilders, shape: RoomShape, center: Vec3, used: ReadonlySet<number>, col: WorldBox[]): void {
  const [cx, cy] = center;
  const [hx, hy] = shape.half;
  const dw = 2.2;
  // N (index 0): y = cy+hy, thickness inward
  wallX(bs, col, cx - hx, cx + hx, cy + hy - WALL_T, cy + hy, used.has(0) ? cx : undefined, dw);
  // S (1)
  wallX(bs, col, cx - hx, cx + hx, cy - hy, cy - hy + WALL_T, used.has(1) ? cx : undefined, dw);
  // E (2)
  wallY(bs, col, cy - hy, cy + hy, cx + hx - WALL_T, cx + hx, used.has(2) ? cy : undefined, dw);
  // W (3)
  wallY(bs, col, cy - hy, cy + hy, cx - hx, cx - hx + WALL_T, used.has(3) ? cy : undefined, dw);
}

/** Wall running along X between x0..x1 at y0..y1, optional centred door. */
function wallX(bs: RoomBuilders, col: WorldBox[], x0: number, x1: number, y0: number, y1: number, doorCx: number | undefined, dw: number): void {
  if (doorCx === undefined) {
    solidBox(bs.wall, col, [x0, y0, 0], [x1, y1, WALL_H]);
    return;
  }
  const dl = doorCx - dw / 2;
  const dr = doorCx + dw / 2;
  if (dl > x0) solidBox(bs.wall, col, [x0, y0, 0], [dl, y1, WALL_H]);
  if (dr < x1) solidBox(bs.wall, col, [dr, y0, 0], [x1, y1, WALL_H]);
  solidBox(bs.wall, col, [dl, y0, DOOR_H], [dr, y1, WALL_H]); // lintel
  bs.trim.box([dl - 0.05, y0 - 0.03, DOOR_H - 0.2], [dr + 0.05, y1 + 0.03, DOOR_H], 1, {}); // sill trim
}

/** Wall running along Y between y0..y1 at x0..x1, optional centred door. */
function wallY(bs: RoomBuilders, col: WorldBox[], y0: number, y1: number, x0: number, x1: number, doorCy: number | undefined, dw: number): void {
  if (doorCy === undefined) {
    solidBox(bs.wall, col, [x0, y0, 0], [x1, y1, WALL_H]);
    return;
  }
  const dl = doorCy - dw / 2;
  const dr = doorCy + dw / 2;
  if (dl > y0) solidBox(bs.wall, col, [x0, y0, 0], [x1, dl, WALL_H]);
  if (dr < y1) solidBox(bs.wall, col, [x0, dr, 0], [x1, y1, WALL_H]);
  solidBox(bs.wall, col, [x0, dl, DOOR_H], [x1, dr, WALL_H]); // lintel
  bs.trim.box([x0 - 0.03, dl - 0.05, DOOR_H - 0.2], [x1 + 0.03, dr + 0.05, DOOR_H], 1, {});
}

/** Faceted round wall: short panels around the ring, gaps at used sockets. */
function emitRing(bs: RoomBuilders, shape: RoomShape, center: Vec3, used: ReadonlySet<number>, col: WorldBox[]): void {
  const [cx, cy] = center;
  const r = shape.half[0];
  const panels = Math.max(16, Math.round(r * 2.2));
  const DOOR_DOT = 0.955; // cos(~0.30 rad): a panel this aligned with a door dir is skipped
  const doorDirs: Vec3[] = [];
  shape.sockets.forEach((s, i) => {
    if (used.has(i)) doorDirs.push(s.dir);
  });
  for (let i = 0; i < panels; i++) {
    const a0 = (i * (Math.PI * 2)) / panels;
    const a1 = ((i + 1) * (Math.PI * 2)) / panels;
    const mx = dcos((a0 + a1) / 2);
    const my = dsin((a0 + a1) / 2);
    if (doorDirs.some((d) => d[0] * mx + d[1] * my > DOOR_DOT)) continue; // doorway gap
    const p0: Vec3 = [cx + r * dcos(a0), cy + r * dsin(a0), 0];
    const p1: Vec3 = [cx + r * dcos(a1), cy + r * dsin(a1), 0];
    wallPanel(bs.wall, p0, p1, WALL_H, [mx, my, 0]);
    // approximate collider: AABB of the (thin) panel footprint pushed slightly out
    const ox = mx * WALL_T;
    const oy = my * WALL_T;
    col.push(aabb([p0, p1, [p0[0] + ox, p0[1] + oy, 0], [p1[0] + ox, p1[1] + oy, WALL_H]]));
  }
}

/** Two rows of chunky columns down a gallery's long (Y) axis. */
function emitColonnade(bs: RoomBuilders, shape: RoomShape, center: Vec3): void {
  const [cx, cy] = center;
  const [hx, hy] = shape.half;
  const w = 0.3;
  for (let y = -hy + 2.5; y <= hy - 2.5; y += 3) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * (hx - 1.1);
      const yy = cy + y;
      bs.trim.box([x - w - 0.1, yy - w - 0.1, 0], [x + w + 0.1, yy + w + 0.1, 0.3], 1, { nz: false });
      solidBoxNoCol(bs.wall, [x - w, yy - w, 0.3], [x + w, yy + w, WALL_H - 0.4]);
      bs.trim.box([x - w - 0.1, yy - w - 0.1, WALL_H - 0.4], [x + w + 0.1, yy + w + 0.1, WALL_H], 1, { pz: false });
    }
  }
}

// --- low-level geometry helpers ---

function solidBox(b: MeshBuilder, col: WorldBox[], min: Vec3, max: Vec3): void {
  b.box(min, max, UV, { pz: false, nz: false });
  col.push({ min, max });
}
function solidBoxNoCol(b: MeshBuilder, min: Vec3, max: Vec3): void {
  b.box(min, max, UV, { pz: false, nz: false });
}

/** A vertical wall panel from base segment p0→p1 up to `h`, double-faced so
 *  winding never matters (chunky-PSX; cheap and robust for angled/round walls). */
export function wallPanel(b: MeshBuilder, p0: Vec3, p1: Vec3, h: number, n: Vec3): void {
  const p0b: Vec3 = [p0[0], p0[1], 0];
  const p1b: Vec3 = [p1[0], p1[1], 0];
  const p1t: Vec3 = [p1[0], p1[1], h];
  const p0t: Vec3 = [p0[0], p0[1], h];
  const len = Math.sqrt((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) || 1;
  const uv: [number, number][] = [[0, 0], [len * UV, 0], [len * UV, h * UV], [0, h * UV]];
  b.quad(p0b, p1b, p1t, p0t, n, uv);
  b.quad(p1b, p0b, p0t, p1t, [-n[0], -n[1], -n[2]], [[0, 0], [len * UV, 0], [len * UV, h * UV], [0, h * UV]]);
}

export function aabb(pts: readonly Vec3[]): WorldBox {
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const p of pts) {
    minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); minz = Math.min(minz, p[2]);
    maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); maxz = Math.max(maxz, p[2]);
  }
  return { min: [minx, miny, minz], max: [maxx, maxy, maxz] };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
