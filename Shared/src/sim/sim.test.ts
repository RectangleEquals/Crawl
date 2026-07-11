import { beforeAll, describe, expect, it } from "vitest";
import { SUNKEN_PARISH } from "../art/style.js";
import { generateChamber } from "../art/chamber.js";
import { AreaIsland } from "./area.js";
import { initPhysics } from "./physics.js";
import { Buttons, type InputCmd } from "../protocol/messages.js";

beforeAll(async () => {
  await initPhysics();
});

function scriptedCmds(count: number): InputCmd[] {
  const cmds: InputCmd[] = [];
  for (let i = 0; i < count; i++) {
    cmds.push({
      seq: i + 1,
      moveX: i % 20 < 10 ? 0.3 : -0.5,
      moveY: i % 30 < 22 ? 1 : 0,
      yaw: (i * 0.02) % (Math.PI * 2),
      buttons: (i % 45 === 10 ? Buttons.Jump : 0) | (i % 60 > 40 ? Buttons.Sprint : 0),
    });
  }
  return cmds;
}

describe("simulation determinism (Rapier + shared movement)", () => {
  it("same chamber + same inputs ⇒ identical trajectories", () => {
    const chamber = generateChamber(SUNKEN_PARISH, "sim-test");
    const run = (): readonly [number, number, number] => {
      const island = new AreaIsland(chamber);
      const e = island.addEntity(1, "t", false, chamber.spawn.position, 0);
      for (const cmd of scriptedCmds(240)) {
        island.applyCmd(e, cmd);
        island.step();
      }
      const p = e.state.pos;
      island.dispose();
      return [p[0], p[1], p[2]];
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // bit-identical, not just close
  });

  it("characters collide with walls and stand on the floor", () => {
    const chamber = generateChamber(SUNKEN_PARISH, "sim-test-2");
    const island = new AreaIsland(chamber);
    const e = island.addEntity(1, "t", false, chamber.spawn.position, 0);
    // sprint due west into the wall for 4 seconds
    for (let i = 0; i < 120; i++) {
      island.applyCmd(e, { seq: i + 1, moveX: -1, moveY: 0, yaw: 0, buttons: Buttons.Sprint });
      island.step();
    }
    expect(e.state.pos[0]).toBeGreaterThan(0.3); // stopped by the west wall, not through it
    expect(e.state.pos[2]).toBeGreaterThanOrEqual(-0.05); // on the floor (controller offset ~2 cm)
    expect(e.state.grounded).toBe(true);
    island.dispose();
  });

  it("jump ascends smoothly and lands (no floor-stutter)", () => {
    const chamber = generateChamber(SUNKEN_PARISH, "sim-jump");
    const island = new AreaIsland(chamber);
    const e = island.addEntity(1, "t", false, chamber.spawn.position, 0);
    // settle onto the floor
    for (let i = 0; i < 10; i++) {
      island.applyCmd(e, { seq: i + 1, moveX: 0, moveY: 0, yaw: 0, buttons: 0 });
      island.step();
    }
    const floorZ = e.state.pos[2];
    // hold jump for one tick, then ride the arc
    const heights: number[] = [];
    for (let i = 0; i < 40; i++) {
      island.applyCmd(e, { seq: 100 + i, moveX: 0, moveY: 0, yaw: 0, buttons: i === 0 ? Buttons.Jump : 0 });
      island.step();
      heights.push(e.state.pos[2] - floorZ);
    }
    const apex = Math.max(...heights);
    expect(apex).toBeGreaterThan(0.7); // real air time (v²/2g ≈ 1.14 m ideal)
    // monotonic rise for the first few ticks — the old bug oscillated at ~0
    expect(heights[0]!).toBeGreaterThan(0.05);
    expect(heights[1]!).toBeGreaterThan(heights[0]!);
    expect(heights[2]!).toBeGreaterThan(heights[1]!);
    // and back on the ground by the end
    expect(heights[heights.length - 1]!).toBeLessThan(0.05);
    expect(e.state.grounded).toBe(true);
    island.dispose();
  });

  it("portal triggers register where the demo world links areas", () => {
    const chamber = generateChamber(SUNKEN_PARISH, "sim-test-3");
    const portal = chamber.portals.find((p) => p.key === "n2");
    expect(portal).toBeDefined();
    const inside = [
      (portal!.trigger.min[0] + portal!.trigger.max[0]) / 2,
      (portal!.trigger.min[1] + portal!.trigger.max[1]) / 2,
      0,
    ] as const;
    const island = new AreaIsland(chamber);
    expect(island.portalAt(inside)?.key).toBe("n2");
    expect(island.portalAt(chamber.spawn.position)).toBeNull();
    island.dispose();
  });
});
