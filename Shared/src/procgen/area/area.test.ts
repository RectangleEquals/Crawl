import { describe, expect, it } from "vitest";
import { complexityFor, DEPTH_AT_CEILING } from "../complexity.js";
import { SUNKEN_PARISH_BIOME } from "../../art/biomes.js";
import { planAreaLayout, type AreaLayout } from "./layout.js";
import { composeArea } from "./compose.js";
import type { Vec3, WorldBox } from "../../art/mesh.js";

const roomAabb = (center: Vec3, half: [number, number]): WorldBox => ({
  min: [center[0] - half[0], center[1] - half[1], 0],
  max: [center[0] + half[0], center[1] + half[1], 4],
});
const xyOverlap = (a: WorldBox, b: WorldBox): boolean =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1];

const PARAMS = { externalKeys: ["s", "n2"], gadgetCaps: ["tether"], entryKey: "s" };

describe("complexity curve", () => {
  it("rises monotonically with depth and plateaus at the ceiling", () => {
    const depths = [0, 4, 8, 16, 24, 32, DEPTH_AT_CEILING, 100];
    let prevF = -1, prevR = -1, prevL = -1;
    for (const d of depths) {
      const b = complexityFor(d);
      expect(b.footprint).toBeGreaterThanOrEqual(prevF);
      expect(b.roomCount).toBeGreaterThanOrEqual(prevR);
      expect(b.loopChance).toBeGreaterThanOrEqual(prevL - 1e-9);
      prevF = b.footprint; prevR = b.roomCount; prevL = b.loopChance;
    }
    // bounded + plateau
    const ceil = complexityFor(DEPTH_AT_CEILING);
    const beyond = complexityFor(1000);
    expect(beyond.footprint).toBe(ceil.footprint);
    expect(beyond.c).toBe(1);
  });

  it("is deterministic", () => {
    expect(complexityFor(17)).toEqual(complexityFor(17));
  });
});

describe("area layout", () => {
  const build = (seed: string, depth: number): AreaLayout =>
    planAreaLayout(seed, SUNKEN_PARISH_BIOME, complexityFor(depth), PARAMS);

  it("is deterministic for a fixed seed", () => {
    const ser = (l: AreaLayout): string => JSON.stringify({ r: l.rooms.map((r) => [r.shape.archetype, r.center, [...r.used]]), c: l.connectors, p: l.portals, g: l.gadgets, cy: l.cycleCount });
    expect(ser(build("a", 6))).toBe(ser(build("a", 6)));
    expect(ser(build("a", 6))).not.toBe(ser(build("b", 6)));
  });

  it("produces a connected, non-overlapping multi-room area with portals + gadgets", () => {
    const l = build("multi", 20);
    expect(l.rooms.length).toBeGreaterThanOrEqual(2);
    // spanning tree (rooms-1) + cycle edges
    expect(l.connectors.length).toBe(l.rooms.length - 1 + l.cycleCount);
    // no two rooms physically overlap
    for (let i = 0; i < l.rooms.length; i++) {
      for (let j = i + 1; j < l.rooms.length; j++) {
        const a = roomAabb(l.rooms[i]!.center, l.rooms[i]!.shape.half);
        const b = roomAabb(l.rooms[j]!.center, l.rooms[j]!.shape.half);
        expect(xyOverlap(a, b), `rooms ${i},${j} overlap`).toBe(false);
      }
    }
    // every room has at least one doorway (no islands)
    if (l.rooms.length > 1) for (const r of l.rooms) expect(r.used.size).toBeGreaterThanOrEqual(1);
    // one external portal per director key; one gadget anchor per cap
    expect(l.portals.map((p) => p.key).sort()).toEqual(["n2", "s"]);
    expect(l.gadgets.map((g) => g.cap)).toEqual(["tether"]);
  });

  it("scales complexity with depth: deep areas are usually bigger & loopier", () => {
    let shallowRooms = 0, deepRooms = 0, shallowLoops = 0, deepLoops = 0;
    for (let s = 0; s < 40; s++) {
      const lo = build(`lo-${s}`, 2);
      const hi = build(`hi-${s}`, 38);
      shallowRooms += lo.rooms.length; deepRooms += hi.rooms.length;
      shallowLoops += lo.cycleCount; deepLoops += hi.cycleCount;
    }
    expect(deepRooms).toBeGreaterThan(shallowRooms); // openness rises
    expect(deepLoops).toBeGreaterThan(shallowLoops); // backtracking rises
    expect(shallowLoops).toBeLessThan(deepLoops); // linearity commoner when shallow
  });

  it("300-seed soak: always valid (≥1 room, no overlaps, portals present)", () => {
    for (let s = 0; s < 300; s++) {
      const l = build(`soak-${s}`, s % DEPTH_AT_CEILING);
      expect(l.rooms.length).toBeGreaterThanOrEqual(1);
      expect(l.portals.length).toBeGreaterThan(0);
      for (let i = 0; i < l.rooms.length; i++) {
        for (let j = i + 1; j < l.rooms.length; j++) {
          const a = roomAabb(l.rooms[i]!.center, l.rooms[i]!.shape.half);
          const b = roomAabb(l.rooms[j]!.center, l.rooms[j]!.shape.half);
          expect(xyOverlap(a, b), `seed ${s} rooms ${i},${j} overlap`).toBe(false);
        }
      }
    }
  });
});

describe("area emit (geometry)", () => {
  it("composes a ChamberData with meshes, colliders, portals + is deterministic", () => {
    const input = { seed: "emit-a", biomeId: "sunken-parish", depth: 18, params: PARAMS };
    const a = composeArea(input);
    expect(a.chamber.meshes.some((m) => m.positions.length > 0)).toBe(true);
    expect(a.chamber.colliders.length).toBeGreaterThan(0);
    expect(a.chamber.portals.length).toBeGreaterThan(0);
    expect(a.chamber.spawn.position).toHaveLength(3);
    const totalVerts = (x: typeof a) => x.chamber.meshes.reduce((n, m) => n + m.positions.length, 0);
    expect(totalVerts(composeArea(input))).toBe(totalVerts(a)); // deterministic geometry
  });
});
