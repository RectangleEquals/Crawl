/**
 * Area emit (Docs/07 area composer) — the HEAVY geometry pass. Turns a light
 * `AreaLayout` into a `ChamberData` (meshes + colliders + portals + lights +
 * spawn) that `AreaIsland` (server) and `buildArea` (client) consume unchanged.
 * Split from the layout so `planReach` can read anchors cheaply without building
 * geometry for every area. Deterministic from (layout, biome, seed).
 */

import { MeshBuilder, mergeMeshes, type Vec3, type WorldBox } from "../../art/mesh.js";
import { shardCluster } from "../../art/kit.js";
import { Rng } from "../../math/rng.js";
import type { AreaBiome } from "../../art/biomes.js";
import type { ChamberData, PointLightSpec, PortalSpec } from "../../art/chamber.js";
import { emitRoom, type RoomBuilders } from "./rooms.js";
import { emitCorridor } from "./connectors.js";
import type { AreaLayout } from "./layout.js";

export function emitArea(layout: AreaLayout, biome: AreaBiome, seed: number | string): ChamberData {
  const rng = new Rng(typeof seed === "string" ? `${seed}:emit` : seed);
  const wall = new MeshBuilder(biome.tex.wall);
  const floor = new MeshBuilder(biome.tex.floor);
  const trim = new MeshBuilder(biome.tex.trim);
  const shard = new MeshBuilder(biome.tex.shard, { emissive: true });
  const bs: RoomBuilders = { wall, floor, trim };
  const colliders: WorldBox[] = [];
  const pointLights: PointLightSpec[] = [];

  // rooms — light generously (no moonbeams indoors): a bright gloam key per room
  // + a warm accent offset for the PSX counterpoint; rotundas get a hero crystal.
  layout.rooms.forEach((room, i) => {
    emitRoom(bs, room.shape, room.center, room.used, colliders);
    const [rx, ry] = room.shape.half;
    const span = rx + ry;
    pointLights.push({ position: [room.center[0], room.center[1], 2.9], ramp: "gloam", intensity: 30, range: Math.max(13, span * 1.5) });
    const ax = room.center[0] + rx * 0.5;
    const ay = room.center[1] + ry * 0.5;
    pointLights.push({ position: [ax, ay, 2.2], ramp: "accent", intensity: 10, range: Math.max(9, span), flicker: true });
    if (room.shape.archetype === "rotunda" || rng.chance(0.5)) {
      const c: Vec3 = [room.center[0], room.center[1], 0];
      shardCluster(shard, c, rng.fork(`shard-${i}`), room.shape.archetype === "rotunda" ? 6 : 3);
    }
  });

  // corridors + a dim light every couple of segments so passages aren't pitch black
  for (const c of layout.connectors) {
    emitCorridor(bs, c.path, c.width, colliders);
    const midp = c.path[Math.floor(c.path.length / 2)] as Vec3;
    pointLights.push({ position: [midp[0], midp[1], 2.4], ramp: "gloam", intensity: 12, range: 9 });
  }

  // external portals (director link keys s/n1/n2) → trigger volumes
  const portals: PortalSpec[] = [];
  for (const p of layout.portals) {
    const perp: Vec3 = [p.dir[1], -p.dir[0], 0];
    const hw = 1.4;
    const corners: Vec3[] = [
      [p.pos[0] + perp[0] * hw - p.dir[0] * 1.6, p.pos[1] + perp[1] * hw - p.dir[1] * 1.6, 0],
      [p.pos[0] - perp[0] * hw + p.dir[0] * 0.4, p.pos[1] - perp[1] * hw + p.dir[1] * 0.4, 0],
    ];
    portals.push({ key: p.key as PortalSpec["key"], trigger: aabbZ(corners, 0, 2.4), spawn: p.spawn, spawnYaw: p.spawnYaw });
  }

  const meshes = mergeMeshes([wall.data, floor.data, trim.data, shard.data]);
  return {
    meshes,
    colliders,
    portals,
    pointLights,
    keyDir: [0.35, 0.25, -0.9],
    spawn: layout.spawn,
    roofHoles: [],
  };
}

function aabbZ(corners: readonly Vec3[], z0: number, z1: number): WorldBox {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const c of corners) {
    minx = Math.min(minx, c[0]); miny = Math.min(miny, c[1]);
    maxx = Math.max(maxx, c[0]); maxy = Math.max(maxy, c[1]);
  }
  return { min: [minx, miny, z0], max: [maxx, maxy, z1] };
}
