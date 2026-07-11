/**
 * Chamber composer: one Sunken Parish room assembled from kit pieces, now
 * emitting render meshes AND physics colliders AND logical portals from the
 * same placements — the "one generation feeds everything" rule (Docs/07 §7).
 */

import { Rng } from "../math/rng.js";
import { MeshBuilder, mergeMeshes, type MeshData, type Vec3, type WorldBox } from "./mesh.js";
import {
  MODULE, WALL_H,
  floorSlab, ceilingSlab, wallSegment, archSegment, column, dais, shardCluster, torchSconce, waterPlane,
} from "./kit.js";
import type { BiomeStyle } from "./style.js";

export interface PointLightSpec {
  position: Vec3;
  /** style ramp key providing the light color (brightest step). */
  ramp: "gloam" | "accent";
  intensity: number;
  range: number;
  /** Client renders a cosmetic fire-flicker on this light (Tier-3 analog). */
  flicker?: boolean;
}

/** A logical doorway: trigger volume + the spawn used when ARRIVING here. */
export interface PortalSpec {
  key: "s" | "n1" | "n2";
  trigger: WorldBox;
  spawn: Vec3; // feet position, just inside the room
  spawnYaw: number; // sim yaw (0 = +Y north), facing into the room
}

export interface ChamberOptions {
  /** Collapsed-roof holes (moonbeams). Sealed rooms read as undercrofts. */
  roofHoles?: boolean;
  /** Water plane height; <= 0 means drained. */
  waterLevel?: number;
}

export interface ChamberData {
  meshes: MeshData[];
  colliders: WorldBox[];
  portals: PortalSpec[];
  pointLights: PointLightSpec[];
  /** Directional key light direction (world space, pointing FROM light TO scene). */
  keyDir: Vec3;
  /** Default spawn (feet) and sim yaw for fresh joins. */
  spawn: { position: Vec3; yaw: number };
  roofHoles: [number, number][];
}

/** Nave dimensions in cells (module = 2 m): 7 wide (X) × 11 long (Y). */
const W = 7;
const L = 11;

export function generateChamber(
  style: BiomeStyle,
  seed: number | string,
  options: ChamberOptions = {},
): ChamberData {
  const roofHolesEnabled = options.roofHoles ?? true;
  const waterLevel = options.waterLevel ?? 0.14;

  const rng = new Rng(typeof seed === "string" ? seed : seed);
  const stoneWallB = new MeshBuilder("stoneWall");
  const floorB = new MeshBuilder("stoneFloor");
  const pillarB = new MeshBuilder("pillar");
  const trimB = new MeshBuilder("trim");
  const shardB = new MeshBuilder("shard", { emissive: true });
  const emberB = new MeshBuilder("ember", { emissive: true });
  const waterB = new MeshBuilder("water", { translucent: true });
  const colliders: WorldBox[] = [];
  const portals: PortalSpec[] = [];

  // Dark passage stub behind an arch: without it the opening shows raw void,
  // which the fog/volumetrics render as a glowing slab. Unlit + fogged, it
  // reads as "the way onward, into darkness". Also registers the portal.
  const archPassage = (cx: number, side: "n" | "s", key: PortalSpec["key"]): void => {
    const x0 = cx * MODULE;
    const x1 = (cx + 1) * MODULE;
    const depth = 2.4;
    const yIn = side === "s" ? 0 : L * MODULE;
    const yOut = side === "s" ? -depth : L * MODULE + depth;
    const yLo = Math.min(yIn, yOut);
    const yHi = Math.max(yIn, yOut);
    // floor (top only), ceiling (bottom only), flanks, end cap
    stoneWallB.box([x0, yLo, -0.2], [x1, yHi, 0], 0.5, { px: false, nx: false, py: false, ny: false, nz: false });
    stoneWallB.box([x0, yLo, 2.5], [x1, yHi, 2.8], 0.5, { px: false, nx: false, py: false, ny: false, pz: false });
    stoneWallB.box([x0, yLo, 0], [x0 + 0.3, yHi, 2.5], 0.5, { pz: false, nz: false });
    stoneWallB.box([x1 - 0.3, yLo, 0], [x1, yHi, 2.5], 0.5, { pz: false, nz: false });
    const capY: [number, number] = side === "s" ? [yOut, yOut + 0.3] : [yOut - 0.3, yOut];
    stoneWallB.box([x0, capY[0], 0], [x1, capY[1], 2.5], 0.5, { pz: false, nz: false });
    colliders.push(
      { min: [x0, yLo, -0.2], max: [x1, yHi, 0] },
      { min: [x0, yLo, 2.5], max: [x1, yHi, 2.8] },
      { min: [x0, yLo, 0], max: [x0 + 0.3, yHi, 2.5] },
      { min: [x1 - 0.3, yLo, 0], max: [x1, yHi, 2.5] },
      { min: [x0, capY[0], 0], max: [x1, capY[1], 2.5] },
    );
    // trigger: mid-passage slab; spawn: one meter inside the room
    const trigLo = side === "s" ? yOut + 0.5 : yIn + 0.9;
    const trigHi = side === "s" ? yIn - 0.9 : yOut - 0.5;
    portals.push({
      key,
      trigger: { min: [x0 + 0.35, Math.min(trigLo, trigHi), 0], max: [x1 - 0.35, Math.max(trigLo, trigHi), 2.4] },
      spawn: [(x0 + x1) / 2, side === "s" ? 1.4 : L * MODULE - 1.4, 0],
      spawnYaw: side === "s" ? 0 : Math.PI,
    });
  };

  // floor + perimeter walls
  floorSlab(floorB, 0, 0, W, L, colliders);
  for (let cx = 0; cx < W; cx++) {
    // south wall: arch at center, north wall: two arches
    if (cx === Math.floor(W / 2)) {
      archSegment(stoneWallB, trimB, cx, 0, "s", colliders);
      archPassage(cx, "s", "s");
    } else wallSegment(stoneWallB, cx, 0, "s", colliders);
    if (cx === 1) {
      archSegment(stoneWallB, trimB, cx, L - 1, "n", colliders);
      archPassage(cx, "n", "n1");
    } else if (cx === W - 2) {
      archSegment(stoneWallB, trimB, cx, L - 1, "n", colliders);
      archPassage(cx, "n", "n2");
    } else wallSegment(stoneWallB, cx, L - 1, "n", colliders);
  }
  for (let cyc = 0; cyc < L; cyc++) {
    wallSegment(stoneWallB, 0, cyc, "w", colliders);
    wallSegment(stoneWallB, W - 1, cyc, "e", colliders);
  }

  // colonnade: two rows, every other cell along the nave
  const colCells: [number, number][] = [];
  for (let cyc = 2; cyc < L - 2; cyc += 2) {
    colCells.push([1, cyc], [W - 2, cyc]);
  }
  for (const [cx, cyc] of colCells) column(pillarB, trimB, cx, cyc, colliders);

  // ceiling; collapsed holes over the dais end when enabled
  const roofHoles: [number, number][] = roofHolesEnabled
    ? [[2, 7], [3, 7], [4, 7], [3, 8], [2, 8], [4, 6], [3, 6]]
    : [];
  const holeSet = new Set(roofHoles.map(([a, b2]) => `${a},${b2}`));
  for (let cx = 0; cx < W; cx++) {
    for (let cyc = 0; cyc < L; cyc++) {
      if (!holeSet.has(`${cx},${cyc}`)) ceilingSlab(stoneWallB, cx, cyc, cx + 1, cyc + 1, WALL_H, colliders);
    }
  }

  // dais + hero shard cluster
  const d = dais(floorB, W / 2, 7.5, colliders);
  shardCluster(shardB, d.top, rng.fork("hero-cluster"), 6);

  // two sconce clusters on columns midway down the nave
  const sconceCells: [number, number][] = [colCells[1] ?? [1, 4], colCells[2] ?? [5, 4]];
  const sconces: Vec3[] = sconceCells.map(([cx, cyc]) => [
    cx * MODULE + MODULE / 2,
    cyc * MODULE + MODULE / 2,
    2.2,
  ]);
  for (const s of sconces) shardCluster(shardB, s, rng.fork(`sconce-${s[0]}-${s[1]}`), 3);

  // wall torches: warm counterpoint pooling along the nave
  const torchFlames: Vec3[] = [
    torchSconce(trimB, emberB, 0, 3, "w"),
    torchSconce(trimB, emberB, 0, 7, "w"),
    torchSconce(trimB, emberB, W - 1, 3, "e"),
    torchSconce(trimB, emberB, W - 1, 7, "e"),
  ];

  // flood: still water across the nave floor (skipped when drained)
  if (waterLevel > 0) waterPlane(waterB, 0, 0, W, L, waterLevel);

  const pointLights: PointLightSpec[] = [
    { position: [d.top[0], d.top[1], d.top[2] + 1.2], ramp: "gloam", intensity: 30, range: 14 },
    ...sconces.map((s): PointLightSpec => ({
      position: [s[0], s[1], s[2] + 0.8],
      ramp: "gloam",
      intensity: 10,
      range: 8,
    })),
    ...torchFlames.map((p): PointLightSpec => ({
      position: [p[0], p[1], p[2] + 0.25],
      ramp: "accent",
      intensity: 9,
      range: 10,
      flicker: true,
    })),
  ];

  return {
    meshes: mergeMeshes([
      stoneWallB.data, floorB.data, pillarB.data, trimB.data, shardB.data, emberB.data, waterB.data,
    ]),
    colliders,
    portals,
    pointLights,
    // moonlight raking in steeply through the collapsed roof
    keyDir: [0.35, 0.25, -0.9],
    spawn: { position: [W * MODULE * 0.5, 2.2, 0], yaw: 0 },
    roofHoles,
  };
}

export type { BiomeStyle } from "./style.js";
