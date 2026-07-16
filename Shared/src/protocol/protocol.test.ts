import { describe, expect, it } from "vitest";
import { MsgType, decode, encode, type AnyMsg, type SnapshotMsg } from "./messages.js";
import { POS_SCALE } from "../sim/constants.js";

function roundtrip<T extends AnyMsg>(msg: T): T {
  return decode(encode(msg)) as T;
}

describe("protocol codec", () => {
  it("roundtrips Hello", () => {
    expect(roundtrip({ type: MsgType.Hello, version: 2, name: "Pilgrim-Ω✓" })).toEqual({
      type: MsgType.Hello,
      version: 2,
      name: "Pilgrim-Ω✓",
    });
  });

  it("roundtrips InputBundle with clamping and quantization", () => {
    const out = roundtrip({
      type: MsgType.InputBundle,
      cmds: [
        { seq: 123456, moveX: -1, moveY: 0.5, yaw: 1.234, buttons: 3 },
        { seq: 123457, moveX: 2 /* clamps to 1 */, moveY: -0.25, yaw: -0.5, buttons: 0 },
      ],
    });
    expect(out.cmds).toHaveLength(2);
    const c0 = out.cmds[0]!;
    expect(c0.seq).toBe(123456);
    expect(c0.moveX).toBeCloseTo(-1, 3);
    expect(c0.moveY).toBeCloseTo(0.5, 3);
    expect(c0.yaw).toBeCloseTo(1.234, 2);
    expect(c0.buttons).toBe(3);
    expect(out.cmds[1]!.moveX).toBe(1);
    // negative yaw wraps into [0, 2π)
    expect(out.cmds[1]!.yaw).toBeCloseTo(Math.PI * 2 - 0.5, 2);
  });

  it("roundtrips Snapshot within quantization tolerance", () => {
    const snap: SnapshotMsg = {
      type: MsgType.Snapshot,
      tick: 90210,
      lastInputSeq: 4242,
      selfPos: [7.123456, 15.9876, 0.333],
      selfVelZ: -3.21,
      selfGrounded: false,
      selfHp: 84, selfMaxHp: 120, selfResource: 40, selfMaxResource: 100,
      selfFlags: 2, selfTagFlags: 4, abilityReady: 0b1011, gadgetBits: 0b10,
      entities: [
        { id: 500, pos: [3.5, 20.25, 0], yaw: 2.5, anim: 1, kind: 0, hpFrac: 200, stateFlags: 2, tagFlags: 0 },
        { id: 2, pos: [-1.25, 0.5, 4.0], yaw: 0, anim: 2, kind: 1, hpFrac: 128, stateFlags: 5, tagFlags: 8 },
      ],
      events: [{ kind: 1, entity: 2, value: 30, pos: [1, 2, 1] }],
      projectiles: [{ id: 7, kind: 0, pos: [3, 4, 1] }],
    };
    const out = roundtrip(snap);
    expect(out.tick).toBe(90210);
    expect(out.lastInputSeq).toBe(4242);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(out.selfPos[i]! - snap.selfPos[i]!)).toBeLessThanOrEqual(0.5 / POS_SCALE + 1e-9);
    }
    expect(out.selfGrounded).toBe(false);
    expect(out.selfHp).toBe(84);
    expect(out.abilityReady).toBe(0b1011);
    expect(out.gadgetBits).toBe(0b10);
    expect(out.entities).toHaveLength(2);
    expect(out.entities[1]!.kind).toBe(1);
    expect(out.entities[1]!.tagFlags).toBe(8);
    expect(out.events[0]!.value).toBe(30);
    expect(out.projectiles[0]!.id).toBe(7);
  });

  it("roundtrips transition messages with AreaRef", () => {
    const out = roundtrip({
      type: MsgType.TransitionBegin,
      area: { areaId: 2, name: "The Undercroft", seed: "m2-demo:undercroft", roofHoles: false, waterLevel: 0 },
      spawn: [7, 20.6, 0],
      spawnYaw: Math.PI,
    });
    expect(out.area.name).toBe("The Undercroft");
    expect(out.area.roofHoles).toBe(false);
    expect(out.spawnYaw).toBeCloseTo(Math.PI, 2);
  });
});
