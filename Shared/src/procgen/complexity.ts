/**
 * Depth-driven complexity budget (Docs/07). Areas/Reaches get GRADUALLY more
 * complex the deeper the expedition goes, up to a CEILING — the spatial analog
 * of the combat pacing curve (Docs/08 §5). This module is the pure, deterministic
 * curve: it maps a depth measure to the MEANS of the generation knobs. The
 * per-area variance ("linearity gets rarer but never vanishes") is applied by the
 * layout using these means as distribution centres (procgen/area/layout.ts).
 *
 * No RNG here — same depth ⇒ same budget on every machine (determinism, law 9).
 */

export interface ComplexityBudget {
  /** The 0..1 scalar the curve produced (for debug/telemetry). */
  c: number;
  depth: number;
  /** Rough target area extent in world metres (footprint side). */
  footprint: number;
  /** Target room count for the area. */
  roomCount: number;
  /** Probability an extra cycle edge is added (linearity ↓ with depth). */
  loopChance: number;
  /** Expected number of extra cycle edges beyond the spanning structure. */
  extraCycles: number;
  /** Max single-room dimension in metres (openness). */
  roomSizeMax: number;
  /** 0..1 branchiness / angle-variety / "snaking". */
  mazeFactor: number;
  /** Reserved: vertical spread (levels) — 0 until Z content exists. */
  zSpread: number;
}

/** Depth at which complexity reaches its ceiling and plateaus. */
export const DEPTH_AT_CEILING = 40;

/** Optional modifiers (e.g. a "labyrinthine" Waymark Omen — Docs/09 §5). */
export interface ComplexityMods {
  /** Added to the normalized depth before the curve (−1..+1), clamped. */
  depthBias?: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Smoothstep S-curve — gentle at both ends, "only just more each time". */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Complexity budget for a given depth (Reach index × areas-per-Reach + area
 * position, or area level). Monotonic non-decreasing in depth, bounded by the
 * ceiling, fully deterministic.
 */
export function complexityFor(depth: number, mods: ComplexityMods = {}): ComplexityBudget {
  const t = clamp01(depth / DEPTH_AT_CEILING + (mods.depthBias ?? 0));
  const c = smooth(t);
  return {
    c,
    depth,
    footprint: lerp(28, 92, c),
    roomCount: Math.round(lerp(3, 9, c)),
    loopChance: lerp(0.1, 0.9, c),
    extraCycles: lerp(0, 3, c),
    roomSizeMax: lerp(14, 34, c),
    mazeFactor: lerp(0.15, 0.9, c),
    zSpread: 0,
  };
}
