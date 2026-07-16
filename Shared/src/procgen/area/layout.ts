/**
 * Area layout (Docs/07 area composer) — the LIGHT plan pass (no geometry). Given
 * a seed, biome, complexity budget, and the area's external exits + gadgets, it
 * builds a cyclic room-graph and embeds it in world XY by **socket matching**:
 * place the entry room, walk the spanning tree placing each child off a free
 * parent socket (varied directions — rotunda sockets give angled corridors),
 * resolving overlaps by retry/drop, then close loops with extra connectors. The
 * result feeds `emit.ts` (heavy geometry) and `reachWorld.planReach` (gadget/
 * portal anchors). Deterministic; softlock-free (always connected, never overlaps).
 */

import { Rng } from "../../math/rng.js";
import { yawFromDirection } from "../../math/trig.js";
import type { Vec3, WorldBox } from "../../art/mesh.js";
import type { AreaBiome } from "../../art/biomes.js";
import type { ComplexityBudget } from "../complexity.js";
import type { Capability } from "../logic.js";
import { planRoom, type RoomArchetypeId, type RoomShape } from "./rooms.js";
import type { ConnectorKind } from "./connectors.js";

export interface PlacedRoom {
  shape: RoomShape;
  center: Vec3;
  used: Set<number>; // socket indices consumed (doorways)
  leaf: boolean; // only one connection → good for a vault/gadget
}
export interface PlacedConnector {
  path: Vec3[];
  width: number;
  kind: ConnectorKind;
}
export interface ExternalPortal {
  key: string;
  pos: Vec3;
  dir: Vec3;
  spawn: Vec3;
  spawnYaw: number;
}
export interface GadgetAnchor {
  cap: Capability;
  pos: Vec3;
}
export interface AreaLayout {
  rooms: PlacedRoom[];
  connectors: PlacedConnector[];
  portals: ExternalPortal[];
  gadgets: GadgetAnchor[];
  spawn: { position: Vec3; yaw: number };
  bounds: WorldBox;
  cycleCount: number;
}
export interface AreaParams {
  externalKeys: readonly string[]; // director link keys this area exposes
  gadgetCaps: readonly Capability[];
  entryKey?: string; // key the player arrives through (default spawn)
}

const MARGIN = 1.6; // min gap between room footprints (m)

export function planAreaLayout(seed: number | string, biome: AreaBiome, budget: ComplexityBudget, params: AreaParams): AreaLayout {
  const rng = new Rng(typeof seed === "string" ? `${seed}:area` : seed);

  // per-area sample around the budget means (variance → entropy)
  const needed = Math.max(2, params.externalKeys.length);
  const targetRooms = Math.max(needed, Math.min(10, Math.round(budget.roomCount + rng.range(-1, 1.6))));

  // pick archetypes: entry is a plain hall; the rest by biome weights
  const archetypes: RoomArchetypeId[] = ["rectHall"];
  for (let i = 1; i < targetRooms; i++) archetypes.push(pickArchetype(biome, rng));
  const shapes = archetypes.map((a) => planRoom(a, rng, budget.roomSizeMax));

  // spanning tree: each room hangs off a random earlier one
  const parent: number[] = [-1];
  for (let i = 1; i < shapes.length; i++) parent.push(rng.int(0, i - 1));

  // embed
  const rooms: (PlacedRoom | null)[] = shapes.map(() => null);
  const connectors: PlacedConnector[] = [];
  rooms[0] = { shape: shapes[0] as RoomShape, center: [0, 0, 0], used: new Set(), leaf: false };

  for (let i = 1; i < shapes.length; i++) {
    const p = parent[i] as number;
    const parentRoom = rooms[p];
    if (!parentRoom) continue; // parent was dropped → drop this subtree branch
    const placed = tryPlace(parentRoom, shapes[i] as RoomShape, rooms, connectors, rng);
    if (placed) {
      rooms[i] = placed.room;
      connectors.push(placed.connector);
    }
  }

  const live = rooms.filter((r): r is PlacedRoom => r !== null);
  // mark leaves (exactly one doorway used so far) — candidates for vaults
  for (const r of live) r.leaf = r.used.size <= 1;

  // close loops: extra connectors between already-placed rooms (the backtracking)
  let cycleCount = 0;
  const extraCycles = sampleCount(budget.extraCycles, budget.loopChance, rng);
  for (let c = 0; c < extraCycles; c++) {
    if (addCycle(live, connectors, rng)) cycleCount++;
  }

  // external portals — one per director link key, on outward-facing free sockets
  const centroid = centroidOf(live);
  const portals: ExternalPortal[] = [];
  for (const key of params.externalKeys) {
    const pick = pickOutwardSocket(live, centroid);
    if (!pick) continue;
    const wp = worldSocket(pick.room, pick.idx);
    pick.room.used.add(pick.idx);
    const spawn: Vec3 = [wp.pos[0] - wp.dir[0] * 1.6, wp.pos[1] - wp.dir[1] * 1.6, 0];
    portals.push({ key, pos: wp.pos, dir: wp.dir, spawn, spawnYaw: yawFromDirection(-wp.dir[0], -wp.dir[1]) });
  }

  // seat gadgets in leaf/vault rooms (fall back to any room)
  const gadgets: GadgetAnchor[] = [];
  const vaultPool = (live.filter((r) => r.leaf).length ? live.filter((r) => r.leaf) : live).slice();
  for (const cap of params.gadgetCaps) {
    const room = vaultPool[rng.int(0, Math.max(0, vaultPool.length - 1))] ?? live[0];
    if (room) gadgets.push({ cap, pos: [room.center[0], room.center[1], 0.8] });
  }

  const entry = portals.find((p) => p.key === params.entryKey) ?? portals[0];
  const spawn = entry ? { position: entry.spawn, yaw: entry.spawnYaw } : { position: [0, 0, 0] as Vec3, yaw: 0 };

  return { rooms: live, connectors, portals, gadgets, spawn, bounds: boundsOf(live, connectors), cycleCount };
}

// --- embedding helpers ---

interface PlaceResult {
  room: PlacedRoom;
  connector: PlacedConnector;
}

/** Try to attach `childShape` to `parentRoom` at a free socket without overlap. */
function tryPlace(
  parentRoom: PlacedRoom,
  childShape: RoomShape,
  rooms: readonly (PlacedRoom | null)[],
  connectors: readonly PlacedConnector[],
  rng: Rng,
): PlaceResult | null {
  const parentSockets = shuffle(freeSocketIdx(parentRoom), rng);
  const gaps = [3, 4.5, 6];
  for (const pi of parentSockets) {
    const P = worldSocket(parentRoom, pi);
    for (const gap of shuffle(gaps.slice(), rng)) {
      // child socket facing back toward the parent (most anti-parallel dir)
      const ci = bestFacing(childShape, P.dir);
      const sc = childShape.sockets[ci];
      if (!sc) continue;
      const target: Vec3 = [P.pos[0] + P.dir[0] * gap, P.pos[1] + P.dir[1] * gap, 0];
      const center: Vec3 = [target[0] - sc.pos[0], target[1] - sc.pos[1], 0];
      const box = roomBox(childShape, center);
      if (overlapsAny(box, rooms, connectors)) continue;
      const child: PlacedRoom = { shape: childShape, center, used: new Set([ci]), leaf: true };
      parentRoom.used.add(pi);
      return { room: child, connector: { path: [P.pos, target], width: Math.min(P.width, sc.width), kind: "straight" } };
    }
  }
  return null;
}

/** Close a loop: connect two placed rooms' free sockets with a dog-leg/curve. */
function addCycle(live: readonly PlacedRoom[], connectors: PlacedConnector[], rng: Rng): boolean {
  const pool = shuffle(live.filter((r) => freeSocketIdx(r).length > 0).slice(), rng);
  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      const ra = pool[a] as PlacedRoom;
      const rb = pool[b] as PlacedRoom;
      const ia = freeSocketIdx(ra)[0] as number;
      const ib = freeSocketIdx(rb)[0] as number;
      const sa = worldSocket(ra, ia);
      const sb = worldSocket(rb, ib);
      const dist = Math.sqrt((sa.pos[0] - sb.pos[0]) ** 2 + (sa.pos[1] - sb.pos[1]) ** 2);
      if (dist < 3 || dist > 26) continue;
      // dog-leg: out from A along its dir, kink, into B (an angled/curved passage)
      const mid: Vec3 = [sa.pos[0] + sa.dir[0] * 2 + (sb.pos[0] - sa.pos[0]) * 0.5, sa.pos[1] + sa.dir[1] * 2 + (sb.pos[1] - sa.pos[1]) * 0.5, 0];
      const path: Vec3[] = [sa.pos, mid, sb.pos];
      const box = pathBox(path, 3);
      // the connector necessarily touches its two endpoint rooms — exclude them
      if (overlapsRoomsExcept(box, live, ra, rb)) continue;
      ra.used.add(ia);
      rb.used.add(ib);
      connectors.push({ path, width: Math.min(sa.width, sb.width), kind: "angled" });
      return true;
    }
  }
  return false;
}

// --- geometry/query helpers ---

function worldSocket(room: PlacedRoom, idx: number): { pos: Vec3; dir: Vec3; width: number } {
  const s = room.shape.sockets[idx];
  if (!s) return { pos: room.center, dir: [0, 1, 0], width: 2 };
  return { pos: [room.center[0] + s.pos[0], room.center[1] + s.pos[1], 0], dir: s.dir, width: s.width };
}

function freeSocketIdx(room: PlacedRoom): number[] {
  const out: number[] = [];
  for (let i = 0; i < room.shape.sockets.length; i++) if (!room.used.has(i)) out.push(i);
  return out;
}

/** Index of the child socket whose dir is most opposite to `dir`. */
function bestFacing(shape: RoomShape, dir: Vec3): number {
  let best = 0;
  let bestDot = Infinity;
  shape.sockets.forEach((s, i) => {
    const d = s.dir[0] * dir[0] + s.dir[1] * dir[1];
    if (d < bestDot) { bestDot = d; best = i; }
  });
  return best;
}

function roomBox(shape: RoomShape, center: Vec3): WorldBox {
  const [hx, hy] = shape.half;
  return { min: [center[0] - hx, center[1] - hy, 0], max: [center[0] + hx, center[1] + hy, shape.height] };
}

function pathBox(path: readonly Vec3[], width: number): WorldBox {
  const hw = width / 2 + 0.5;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of path) {
    minx = Math.min(minx, p[0] - hw); miny = Math.min(miny, p[1] - hw);
    maxx = Math.max(maxx, p[0] + hw); maxy = Math.max(maxy, p[1] + hw);
  }
  return { min: [minx, miny, 0], max: [maxx, maxy, 4] };
}

function overlaps(a: WorldBox, b: WorldBox, margin: number): boolean {
  return (
    a.min[0] - margin < b.max[0] && a.max[0] + margin > b.min[0] &&
    a.min[1] - margin < b.max[1] && a.max[1] + margin > b.min[1]
  );
}

function overlapsRoomsExcept(box: WorldBox, rooms: readonly PlacedRoom[], ...skip: PlacedRoom[]): boolean {
  for (const r of rooms) {
    if (skip.includes(r)) continue;
    if (overlaps(box, roomBox(r.shape, r.center), 0.3)) return true;
  }
  return false;
}

function overlapsAny(box: WorldBox, rooms: readonly (PlacedRoom | null)[], connectors: readonly PlacedConnector[]): boolean {
  for (const r of rooms) if (r && overlaps(box, roomBox(r.shape, r.center), MARGIN)) return true;
  for (const c of connectors) if (overlaps(box, pathBox(c.path, c.width), 0.4)) return true;
  return false;
}

function pickArchetype(biome: AreaBiome, rng: Rng): RoomArchetypeId {
  const entries = Object.entries(biome.roomWeights) as [RoomArchetypeId, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let t = rng.next() * total;
  for (const [id, w] of entries) {
    t -= w;
    if (t <= 0) return id;
  }
  return "rectHall";
}

function pickOutwardSocket(live: readonly PlacedRoom[], centroid: Vec3): { room: PlacedRoom; idx: number } | null {
  let best: { room: PlacedRoom; idx: number } | null = null;
  let bestScore = -Infinity;
  for (const r of live) {
    for (const idx of freeSocketIdx(r)) {
      const ws = worldSocket(r, idx);
      const score = ws.dir[0] * (ws.pos[0] - centroid[0]) + ws.dir[1] * (ws.pos[1] - centroid[1]);
      if (score > bestScore) { bestScore = score; best = { room: r, idx }; }
    }
  }
  return best;
}

function centroidOf(live: readonly PlacedRoom[]): Vec3 {
  if (live.length === 0) return [0, 0, 0];
  let x = 0, y = 0;
  for (const r of live) { x += r.center[0]; y += r.center[1]; }
  return [x / live.length, y / live.length, 0];
}

function boundsOf(live: readonly PlacedRoom[], connectors: readonly PlacedConnector[]): WorldBox {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const acc = (b: WorldBox): void => {
    minx = Math.min(minx, b.min[0]); miny = Math.min(miny, b.min[1]);
    maxx = Math.max(maxx, b.max[0]); maxy = Math.max(maxy, b.max[1]);
  };
  for (const r of live) acc(roomBox(r.shape, r.center));
  for (const c of connectors) acc(pathBox(c.path, c.width));
  if (!isFinite(minx)) return { min: [0, 0, 0], max: [1, 1, 4] };
  return { min: [minx, miny, -0.2], max: [maxx, maxy, 4.3] };
}

/** Expected count from a mean + a per-trial probability (entropy, not a switch). */
function sampleCount(mean: number, chance: number, rng: Rng): number {
  let n = 0;
  const trials = Math.ceil(mean) + 1;
  for (let i = 0; i < trials; i++) if (rng.chance(chance * (mean / Math.max(1, trials)) + chance * 0.25)) n++;
  return n;
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}
