/**
 * Deterministic lattice value-noise + fBm. Integer-hash based (no host trig,
 * no Math.random) so output is identical for a given seed everywhere.
 */

/** 2D integer coordinate hash → [0,1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise at (x, y), lattice period `cell` pixels. */
export function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = smoothstep((x - gx * cell) / cell);
  const fy = smoothstep((y - gy * cell) / cell);
  const a = hash2(gx, gy, seed);
  const b = hash2(gx + 1, gy, seed);
  const c = hash2(gx, gy + 1, seed);
  const d = hash2(gx + 1, gy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractional Brownian motion: `octaves` layers of value noise. */
export function fbm(x: number, y: number, cell: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let c = cell;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y, Math.max(1, c), seed + o * 1013) * amp;
    total += amp;
    amp *= 0.5;
    c /= 2;
  }
  return sum / total;
}
