/**
 * THE coordinate boundary (Docs/02 §3). World space is left-handed Z-up
 * (X east, Y north, Z up); Three.js render space is right-handed Y-up.
 *
 * Conversion: (x, y, z)world → (x, z, −y)render — a −90° rotation about X
 * (det = +1). A plain Y/Z swap would be a REFLECTION: it mirrors the world,
 * which reverses apparent strafe direction and turn direction. With this
 * rotation, world north = render −Z, sim yaw maps 1:1 onto the camera's Y
 * rotation, winding is preserved, and screen-right equals sim-right.
 * NO OTHER FILE MAY CONVERT.
 */

export function worldVecToRender(v: readonly [number, number, number]): [number, number, number] {
  return [v[0], v[2], -v[1] + 0]; // `+ 0` normalizes −0
}

export function renderVecToWorld(v: readonly [number, number, number]): [number, number, number] {
  return [v[0], -v[2] + 0, v[1]];
}

/** Convert flat xyz world-space triples (positions or normals). */
export function convertTriples(src: readonly number[]): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i] ?? 0;
    out[i + 1] = src[i + 2] ?? 0;
    out[i + 2] = -(src[i + 1] ?? 0);
  }
  return out;
}

/** Indices pass through unchanged — a rotation preserves winding. */
export function convertIndices(src: readonly number[]): Uint32Array {
  return Uint32Array.from(src);
}
