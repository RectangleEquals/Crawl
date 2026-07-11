/**
 * THE coordinate boundary (Docs/02 §3). World space is left-handed Z-up
 * (X east, Y north, Z up); Three.js render space is right-handed Y-up.
 *
 * Conversion: (x, y, z)world → (x, z, y)render — a Y/Z swap. That swap is a
 * reflection (det = −1), so triangle winding flips: `convertIndices` reverses
 * every triangle to keep front faces front. NO OTHER FILE MAY CONVERT.
 */

export function worldVecToRender(v: readonly [number, number, number]): [number, number, number] {
  return [v[0], v[2], v[1]];
}

export function renderVecToWorld(v: readonly [number, number, number]): [number, number, number] {
  return [v[0], v[2], v[1]];
}

/** Convert flat xyz world-space triples (positions or normals). */
export function convertTriples(src: readonly number[]): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i] ?? 0;
    out[i + 1] = src[i + 2] ?? 0;
    out[i + 2] = src[i + 1] ?? 0;
  }
  return out;
}

/** Reverse triangle winding (reflection compensation). */
export function convertIndices(src: readonly number[]): Uint32Array {
  const out = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i] ?? 0;
    out[i + 1] = src[i + 2] ?? 0;
    out[i + 2] = src[i + 1] ?? 0;
  }
  return out;
}
