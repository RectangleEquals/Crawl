/**
 * M1 demo composer: one Sunken Parish nave, assembled from kit pieces
 * (Docs/11 M1). Returns world-space mesh data + lighting spec — the client
 * converts and renders, but decides nothing about content.
 */

import { Rng } from "../math/rng.js";
import { MeshBuilder, mergeMeshes, type MeshData, type Vec3 } from "./mesh.js";
import {
  MODULE, WALL_H,
  floorSlab, ceilingSlab, wallSegment, archSegment, column, dais, shardCluster, waterPlane,
} from "./kit.js";
import type { BiomeStyle } from "./style.js";

export interface PointLightSpec {
  position: Vec3;
  /** style ramp key providing the light color (brightest step). */
  ramp: "gloam";
  intensity: number;
  range: number;
}

export interface ChamberData {
  meshes: MeshData[];
  pointLights: PointLightSpec[];
  /** Directional key light direction (world space, pointing FROM light TO scene). */
  keyDir: Vec3;
  /** Suggested camera spawn (world space) and yaw (radians around +Z from +Y). */
  spawn: { position: Vec3; yaw: number };
  /** Roof holes let the key light rake in — listed so the client can debug. */
  roofHoles: [number, number][];
}

/** Nave dimensions in cells (module = 2 m): 7 wide (X) × 11 long (Y). */
const W = 7;
const L = 11;

export function generateChamber(style: BiomeStyle, seed: number | string): ChamberData {
  const rng = new Rng(typeof seed === "string" ? seed : seed);
  const stoneWallB = new MeshBuilder("stoneWall");
  const floorB = new MeshBuilder("stoneFloor");
  const pillarB = new MeshBuilder("pillar");
  const trimB = new MeshBuilder("trim");
  const shardB = new MeshBuilder("shard", { emissive: true });
  const waterB = new MeshBuilder("water", { translucent: true });

  // floor + perimeter walls
  floorSlab(floorB, 0, 0, W, L);
  for (let cx = 0; cx < W; cx++) {
    // south wall: arch at center, north wall: two arches
    if (cx === Math.floor(W / 2)) archSegment(stoneWallB, trimB, cx, 0, "s");
    else wallSegment(stoneWallB, cx, 0, "s");
    if (cx === 1 || cx === W - 2) archSegment(stoneWallB, trimB, cx, L - 1, "n");
    else wallSegment(stoneWallB, cx, L - 1, "n");
  }
  for (let cyc = 0; cyc < L; cyc++) {
    wallSegment(stoneWallB, 0, cyc, "w");
    wallSegment(stoneWallB, W - 1, cyc, "e");
  }

  // colonnade: two rows, every other cell along the nave
  const colCells: [number, number][] = [];
  for (let cyc = 2; cyc < L - 2; cyc += 2) {
    colCells.push([1, cyc], [W - 2, cyc]);
  }
  for (const [cx, cyc] of colCells) column(pillarB, trimB, cx, cyc);

  // ceiling with collapsed holes over the dais end (key light rakes through)
  const roofHoles: [number, number][] = [
    [2, 7], [3, 7], [4, 7], [3, 8], [2, 8], [4, 6], [3, 6],
  ];
  const holeSet = new Set(roofHoles.map(([a, b2]) => `${a},${b2}`));
  for (let cx = 0; cx < W; cx++) {
    for (let cyc = 0; cyc < L; cyc++) {
      if (!holeSet.has(`${cx},${cyc}`)) ceilingSlab(stoneWallB, cx, cyc, cx + 1, cyc + 1, WALL_H);
    }
  }

  // dais + hero shard cluster under the roof holes
  const d = dais(floorB, W / 2, 7.5); // center of the nave width, under the roof holes
  shardCluster(shardB, d.top, rng.fork("hero-cluster"), 6);

  // two sconce clusters on columns midway down the nave
  const sconceCells: [number, number][] = [colCells[1] ?? [1, 4], colCells[2] ?? [5, 4]];
  const sconces: Vec3[] = sconceCells.map(([cx, cyc]) => [
    cx * MODULE + MODULE / 2,
    cyc * MODULE + MODULE / 2,
    2.2,
  ]);
  for (const s of sconces) shardCluster(shardB, s, rng.fork(`sconce-${s[0]}-${s[1]}`), 3);

  // flood: still water across the whole nave floor; the dais rises out of it
  waterPlane(waterB, 0, 0, W, L, 0.14);

  const pointLights: PointLightSpec[] = [
    { position: [d.top[0], d.top[1], d.top[2] + 1.2], ramp: "gloam", intensity: 30, range: 14 },
    ...sconces.map((s): PointLightSpec => ({
      position: [s[0], s[1], s[2] + 0.8],
      ramp: "gloam",
      intensity: 10,
      range: 8,
    })),
  ];

  return {
    meshes: mergeMeshes([
      stoneWallB.data, floorB.data, pillarB.data, trimB.data, shardB.data, waterB.data,
    ]),
    pointLights,
    // moonlight raking in steeply through the collapsed roof
    keyDir: [0.35, 0.25, -0.9],
    spawn: { position: [W * MODULE * 0.5, 2.2, 1.7], yaw: 0 },
    roofHoles,
  };
}

export type { BiomeStyle } from "./style.js";
