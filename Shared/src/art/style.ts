/**
 * Biome style constraint files (Docs/01 §4): the single source of cohesion.
 * Generators, palette quantization, fog, and lighting all read from these.
 */

export interface BiomeStyle {
  id: string;
  name: string;
  /** Named color ramps, dark → light, hex strings. */
  paletteRamps: Record<string, readonly string[]>;
  fog: { color: string; density: number };
  /** Texels per world meter (Docs/01 §2.1). */
  texelDensity: number;
  polyBudgets: { prop: number; kitPiece: number; character: number; boss: number };
  lightMood: {
    keyColor: string;
    keyIntensity: number;
    ambientColor: string;
    ambientIntensity: number;
    shardColor: string;
  };
}

/** Launch biome for M1: flooded gothic kingdom (Docs/01 §4). */
export const SUNKEN_PARISH: BiomeStyle = {
  id: "sunken-parish",
  name: "Sunken Parish",
  paletteRamps: {
    stone: ["#14111b", "#1f1a28", "#2e2938", "#3f3950", "#554d6b", "#6b5f7a", "#84789a"],
    verdigris: ["#0c1d1a", "#12352c", "#1d4a3c", "#2f6a52", "#4c8f70"],
    gloam: ["#0b1f10", "#16391c", "#1e4a22", "#2f6e33", "#3d8c3f", "#5cb84f", "#7ee06a"],
    accent: ["#2c160e", "#3a1d12", "#5c2c18", "#7a3b1e", "#a2551f", "#c46a2a"],
    water: ["#0a0f16", "#101822", "#16222f", "#1d2f3f"],
  },
  fog: { color: "#12161f", density: 0.055 },
  texelDensity: 32,
  polyBudgets: { prop: 200, kitPiece: 400, character: 800, boss: 2400 },
  lightMood: {
    keyColor: "#aec4d8",
    keyIntensity: 1.1,
    ambientColor: "#2a3140",
    ambientIntensity: 0.55,
    shardColor: "#7ee06a",
  },
};

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Ramp as RGB triples, dark → light. */
export function rampRgb(style: BiomeStyle, ramp: string): RGB[] {
  const hexes = style.paletteRamps[ramp];
  if (!hexes) throw new Error(`Unknown ramp '${ramp}' in style '${style.id}'`);
  return hexes.map(hexToRgb);
}

/**
 * Map a value in [0,1] onto a ramp step (hard quantization — texture-space
 * banding is the aesthetic; screen-space dithering happens in the renderer).
 */
export function rampSample(ramp: readonly RGB[], v: number): RGB {
  const t = Math.min(1, Math.max(0, v));
  const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
  return ramp[idx] as RGB;
}
