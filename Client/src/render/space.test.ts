import { describe, expect, it } from "vitest";
import { convertIndices, convertTriples, renderVecToWorld, worldVecToRender } from "./space.js";

function cross(a: number[], b: number[]): number[] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

describe("world ↔ render conversion", () => {
  it("round-trips vectors", () => {
    const v: [number, number, number] = [1, 2, 3];
    expect(renderVecToWorld(worldVecToRender(v))).toEqual(v);
  });

  it("maps world-up (+Z) to render-up (+Y)", () => {
    expect(worldVecToRender([0, 0, 1])).toEqual([0, 1, 0]);
  });

  it("keeps geometric winding normals aligned with converted normals", () => {
    // world-space floor quad, CCW as seen from above, normal +Z (up)
    const positions = [0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0];
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const indices = [0, 1, 2, 0, 2, 3];

    const rp = convertTriples(positions);
    const rn = convertTriples(normals);
    const ri = convertIndices(indices);

    // geometric normal of the first converted triangle
    const p = (i: number): number[] => [rp[i * 3]!, rp[i * 3 + 1]!, rp[i * 3 + 2]!];
    const [i0, i1, i2] = [ri[0]!, ri[1]!, ri[2]!];
    const a = p(i0);
    const e1 = p(i1).map((v, k) => v - a[k]!);
    const e2 = p(i2).map((v, k) => v - a[k]!);
    const g = cross(e1, e2);
    const len = Math.hypot(g[0]!, g[1]!, g[2]!);
    const dot = (g[0]! * rn[0]! + g[1]! * rn[1]! + g[2]! * rn[2]!) / len;

    // reflection compensated: geometric normal must agree with stored normal
    expect(dot).toBeGreaterThan(0.99);
  });
});
