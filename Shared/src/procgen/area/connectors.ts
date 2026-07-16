/**
 * Connectors (Docs/07 area composer): corridors that stitch two room sockets
 * together along a polyline — straight, dog-leg (angled), or sampled arc
 * (curved). Because a corridor just follows a path of world points, angled and
 * curved passages "fall out for free" (the visible non-perpendicular win), and a
 * later VERTICAL connector (ramp/stairs/ladder) is just a path whose Z changes.
 */

import type { Vec3, WorldBox } from "../../art/mesh.js";
import { wallPanel, aabb, type RoomBuilders } from "./rooms.js";

export type ConnectorKind = "straight" | "angled" | "curved";

const UV = 0.5;
const CEIL_H = 3.2; // corridors are lower than rooms — reads as a passage

/** Emit a corridor of `width` following `path` (≥2 world points, z≈0). */
export function emitCorridor(bs: RoomBuilders, path: readonly Vec3[], width: number, col: WorldBox[]): void {
  const hw = Math.max(1.0, width / 2);
  for (let i = 0; i + 1 < path.length; i++) {
    const p0 = path[i] as Vec3;
    const p1 = path[i + 1] as Vec3;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-3) continue;
    const ux = dx / len;
    const uy = dy / len;
    const rx = uy; // right = dir rotated -90° about +Z
    const ry = -ux;

    const l0: Vec3 = [p0[0] + rx * hw, p0[1] + ry * hw, 0];
    const r0: Vec3 = [p0[0] - rx * hw, p0[1] - ry * hw, 0];
    const l1: Vec3 = [p1[0] + rx * hw, p1[1] + ry * hw, 0];
    const r1: Vec3 = [p1[0] - rx * hw, p1[1] - ry * hw, 0];

    // floor (up-normal quad) + thin collider slab
    bs.floor.quad(r0, l0, l1, r1, [0, 0, 1], [[0, 0], [width * UV, 0], [width * UV, len * UV], [0, len * UV]]);
    col.push(thin(aabb([l0, r0, l1, r1]), -0.2, 0));

    // side walls (inward normals) + approximate colliders
    wallPanel(bs.wall, l0, l1, CEIL_H, [-rx, -ry, 0]);
    wallPanel(bs.wall, r0, r1, CEIL_H, [rx, ry, 0]);
    col.push(thin(aabb([l0, l1]), 0, CEIL_H, rx, ry, 0.3));
    col.push(thin(aabb([r0, r1]), 0, CEIL_H, -rx, -ry, 0.3));

    // ceiling (down-normal quad) + collider so you can't pop out the top
    const cz = CEIL_H;
    bs.wall.quad([l0[0], l0[1], cz], [r0[0], r0[1], cz], [r1[0], r1[1], cz], [l1[0], l1[1], cz], [0, 0, -1],
      [[0, 0], [width * UV, 0], [width * UV, len * UV], [0, len * UV]]);
    col.push(thin(aabb([l0, r0, l1, r1]), CEIL_H, CEIL_H + 0.3));
  }
}

/** Clamp a box to a Z range (and optionally nudge one XY side out by `t`). */
function thin(b: WorldBox, z0: number, z1: number, ox = 0, oy = 0, t = 0): WorldBox {
  return {
    min: [Math.min(b.min[0], b.min[0] + ox * t), Math.min(b.min[1], b.min[1] + oy * t), z0],
    max: [Math.max(b.max[0], b.max[0] + ox * t), Math.max(b.max[1], b.max[1] + oy * t), z1],
  };
}
