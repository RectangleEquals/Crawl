import { describe, expect, it } from "vitest";
import { datan2, dcos, dsin, yawBasis, yawFromDirection } from "./trig.js";

describe("deterministic trig", () => {
  it("dsin/dcos track Math within 1e-5 across many periods", () => {
    for (let i = -1000; i <= 1000; i++) {
      const a = i * 0.037;
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-5);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-5);
    }
  });

  it("datan2 tracks Math.atan2 within 1e-4", () => {
    for (let i = 0; i < 500; i++) {
      const a = (i / 500) * Math.PI * 2;
      const x = Math.cos(a) * 3;
      const y = Math.sin(a) * 3;
      let d = datan2(y, x) - Math.atan2(y, x);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      expect(Math.abs(d)).toBeLessThan(1e-4);
    }
  });

  it("yawFromDirection inverts yawBasis", () => {
    for (let i = 0; i < 32; i++) {
      const yaw = (i / 32) * Math.PI * 2 - Math.PI;
      const b = yawBasis(yaw);
      let d = yawFromDirection(b.fx, b.fy) - yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      expect(Math.abs(d)).toBeLessThan(1e-4);
    }
  });
});
