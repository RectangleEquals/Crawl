# 01 — Art Direction & Asset Pipeline

> PSX bones, modern blood: every surface says 1998, every photon says today.
> And every asset in the game can be built by a non-artist following a recipe.

Canon terms: [00-vision.md](00-vision.md) §7. Rendering implementation details: [02-tech-architecture.md](02-tech-architecture.md).

---

## 1. The Look, in One Paragraph

CrawlStar renders chunky low-poly geometry with small palette-locked textures at a low internal resolution —
vertex wobble, affine-style texture swim, hard-edged upscaled pixels — but lights that retro world with a
fully modern pipeline: real-time shadow maps, SSAO, volumetric fog, bloom, and emissive starshard glow. The
result should feel like a memory of a PSX game that never actually existed: *the way King's Field looks in
your head*, not the way it looks on real hardware.

---

## 2. Render Pipeline Specification

### 2.1 The retro layer (geometry & texture rules)

| Parameter | Value | Notes |
|---|---|---|
| Internal resolution | **480×270** default | Player-selectable: 320×180 "Purist" / 480×270 "Classic" / 640×360 "Crisp"; UI renders at native res |
| Upscale | Nearest-neighbor to viewport | Integer scaling preferred; letterbox as needed |
| Vertex snapping | Simulated screen-space grid snap in the vertex shader | Strength scales with internal res; the signature PSX "wobble" |
| Texture warp | Affine-style interpolation approximation in shader | Subtle by default; stronger on "Purist" |
| Texture size | **64×64 standard, 128×128 hero assets** | Nearest filtering, no mips on the retro layer (or LOD-biased) |
| Palette | Textures quantized to per-biome ramps (see §4) | Enforced by the texture toolchain, not by hand |
| Poly budgets | Prop 50–300 · modular kit piece 100–500 · character 500–900 · boss 1,500–3,000 tris | Budgets live in the style constraint file |
| Animation | Skeletal, low bone counts (≤24), snapped to ~15–20 Hz keyframe feel | Interpolation quantized for period-correct motion |

### 2.2 The modern layer (lighting & post)

Applied at internal resolution so it fuses with the retro layer rather than floating on top:

1. **Lighting:** one real-time shadow-casting key light per area mood + starshard point lights with emissive
   cores; stylized Blinn-Phong-plus-rim as default material response (full PBR is *available* for hero
   surfaces but restraint is the style).
2. **Volumetric fog:** per-biome color/density; PSX draw-distance fog reimagined as an intentional
   atmosphere tool. Fog color is a primary storytelling channel (see §4).
3. **SSAO:** low-radius, crunchy — reads as deepened pixel shading, not smooth gradients.
4. **Bloom:** threshold-tuned so only emissives (starshards, Gloam, spell effects) bloom.
5. **Ordered dithering post-pass:** 4×4 Bayer, applied to final internal-res image before upscale — unifies
   the modern lighting gradients back into the retro color space.
6. **Optional CRT flavor** (off by default): slight barrel distortion + scanline mask for those who want it.

**Post order:** opaque → transparents/particles → volumetric fog → SSAO composite → bloom → color grade
(per-biome LUT) → dither → nearest upscale → native-res UI.

### 2.3 The loading plate (transitions as aesthetic)

Area transitions ([07-procgen.md](07-procgen.md)) show a **loading plate**: a full-screen dithered
illustration card (procedurally composed from biome palette + area name + a lore blurb or gameplay hint),
in the tradition of PSX-era and PoE zone loads. Plates are part of the art direction, not an apology —
they get the same palette discipline as everything else.

---

## 3. UI Art Direction

- **Chunky, diegetic-leaning retro UI**: thick bordered panels, big pixel-crisp serif-adjacent bitmap font
  for headers, clean readable sans bitmap for body. UI renders at native resolution (readability wins over
  purism) but uses the palette and dither language of the world.
- **Paperdoll inventory** (PoE-style): character silhouette with gear slots; grid inventory beside it.
  **Gadgets never appear on the paperdoll** — they live in a separate *Instruments* tab and a quick-use
  radial menu ([06-gadgets.md](06-gadgets.md) §6).
- **Input-aware prompts:** all UI glyphs swap automatically between KB/M and gamepad (Xbox layout) based on
  last-used device ([02-tech-architecture.md](02-tech-architecture.md) §6).
- Rarity colors ([05-items-loot-affixes.md](05-items-loot-affixes.md)): Common white · Forged blue ·
  Runed gold · Starmarked violet · Singular **gloam-green with animated dither shimmer**.

---

## 4. Biome Style System

Each biome is defined by a **style constraint file** — a JSON document the asset generators, palette
quantizer, fog system, and grading LUT all read. Cohesion is enforced by tooling, not taste.

```jsonc
// Shared/art/biomes/sunken-parish.style.json (illustrative)
{
  "name": "Sunken Parish",
  "paletteRamps": {            // 4–6 ramps × 6–8 steps each, hex colors
    "stone":  ["#1a1720", "#2e2938", "#4a4258", "#6b5f7a", "#8f819c"],
    "verdigris": ["#0e2420", "#1d4a3c", "#2f7a5c", "#57a97e"],
    "gloam":  ["#0b1f10", "#1e4a22", "#3d8c3f", "#7ee06a"],
    "accent": ["#3a1d12", "#7a3b1e", "#c46a2a", "#e8a94e"]
  },
  "fog":   { "color": "#141821", "density": 0.045 },
  "gradeLUT": "sunken-parish.lut.png",
  "texelDensity": 64,          // texels per world meter
  "polyBudgets": { "prop": 200, "kitPiece": 400, "character": 800, "boss": 2400 },
  "kitTags": ["gothic", "flooded", "verdigris", "vaulted"],
  "lightMood": { "keyColor": "#aec4d8", "keyIntensity": 0.6, "shardColor": "#7ee06a" }
}
```

Launch biome set (one per early Reach flavor; extensible): **Furrowmouth Wastes** (star-slag surface scar),
**Sunken Parish** (flooded gothic kingdom), **Gloamforest** (warped overgrowth), **Undercroft Warrens**
(catacomb maze), **Crystal Chantry** (singing-crystal caverns), **Hullfall Fields** (wrecked star-machinery).
Biome palettes double as wayfinding and visual storytelling — a player should know where they are from a
single screenshot.

---

## 5. Asset Strategy: Two Phases

The user is not a professional artist but has **Blender 3.3+ and Photoshop CS6** and is willing to do
guided art. So:

### Phase A — Procedural prototype art (ships first, blocks nothing)

All assets are generated by TypeScript build-time tools in `Shared/art-gen/`, output as GLTF + PNG:

| Generator | Output | Method |
|---|---|---|
| **Kit generator** | Modular set pieces (walls, floors, arches, doorframes, stairs, pillars, rails) on the world-grid module ([07-procgen.md](07-procgen.md) §5) | Parametric primitives + extrude/lathe/boolean ops; biome kitTags select silhouettes |
| **Prop generator** | Crates, altars, shard clusters, furniture, debris | Same toolkit, seeded variation per instance |
| **Texture synthesizer** | All surface textures | Layered noise (Perlin/Worley) + pattern stamps (brick, plank, rivet) → **palette quantization against the biome ramps** → optional baked edge-darkening |
| **Character assembler** | Player classes, enemies | Modular low-poly humanoid/creature part library (heads, torsos, limbs, silhouette shells) + palette skinning; ≤24-bone shared rigs |
| **Animation library** | Locomotion, attacks, hits, deaths | Data-defined keyframes on the shared rigs; retargeted across characters |
| **Loading-plate composer** | Transition cards | Biome palette + layered dither gradients + typography |

Phase A output is deliberately *good enough to judge the game by*: the palette discipline, dithering, fog,
and lighting carry the aesthetic even when the meshes are simple.

### Phase B — Guided handcraft upgrades (selective, later)

Every asset type gets a **recipe card** checked into `Docs/art-recipes/` (authored during M6+ of the
[roadmap](11-roadmap.md)). A recipe card is a step-by-step, screenshot-level instruction set targeting the
exact same budgets and formats as Phase A, so a handmade asset drops in without breaking cohesion:

```markdown
# Recipe: Biome Wall Kit Piece (Blender 3.3+)
Target: ≤400 tris · 64 texel/m · GLTF (+Y-up export preset, see 02 §3) · palette: <biome>.style.json
1. File → New; delete default cube; set units to meters …
2. Add → Mesh → Plane (2m × 3m); … [exact modeling steps]
3. UV unwrap to the 64×64 grid template (provided) …
4. Export PNG diffuse → run `npm run art:quantize -- --biome sunken-parish wall.png` …
5. Export GLTF with the provided preset; run `npm run art:validate` (checks budget, texel density, palette).
```

- `art:validate` CLI enforces the style constraint file mechanically — the artist can't accidentally break
  the look.
- **Priority order for handcraft:** class characters → bosses → hero props (Obelisk, chorale-stone,
  Peddler) → kit silhouette pieces → everything else stays procedural indefinitely if it reads well.
- **Free AI tooling (optional accelerators):** AI texture/concept generation and free model sources are
  acceptable *as inputs* to the same pipeline — anything imported still passes `art:quantize` +
  `art:validate`, which re-grounds it in the game's palette and budgets. Specific tools/MCP servers get
  evaluated when Phase B starts (licenses checked; free-tier only).

---

## 6. Audio Direction (brief)

Same philosophy as visuals — period texture, modern mix: low-sample-rate-flavored SFX (crunchy, band-limited)
processed with modern reverb/ducking; music sparse and modal, synth-plus-choir leaning (the Chorale motif
recurs, [00-vision.md](00-vision.md) §3.7), intensity layered by combat state. Generated/synthesized first
(Phase A equivalent: procedural SFX synthesis + tracker-style music), replaceable later. Full audio doc
deferred until the vertical slice.

---

## 7. Acceptance Criteria (how we know the look works)

1. A static screenshot of any area is identifiable as CrawlStar (palette + dither + fog signature).
2. Freeze any frame: no surface breaks palette; no mesh breaks budget (`art:validate` green across the build).
3. The "modern" layer disappears into the whole — players should say *"it looks like a PSX game"* first and
   *"wait, it has real shadows?"* second.
4. A complete biome (kit + props + 3 enemies + plates) can be produced by the generators in one build step
   with zero manual art.
5. A non-artist following a recipe card produces a drop-in asset that passes validation on the first try.

---

*Next: [02-tech-architecture.md](02-tech-architecture.md) — the machinery underneath.*
