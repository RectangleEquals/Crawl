# 01 — Art Direction & Asset Pipeline

> PSX bones, modern blood: every surface remembers 1998, every photon says today.
> Environments carry PS2-era shape and detail; characters keep N64-era chunk; the light is always modern.
> And every asset in the game can be built by a non-artist following a recipe.

Canon terms: [00-vision.md](00-vision.md) §7. Rendering implementation details: [02-tech-architecture.md](02-tech-architecture.md).

---

## 1. The Look, in One Paragraph

CrawlStar renders low-poly geometry with small palette-locked textures at a low internal resolution —
vertex wobble, affine-style texture swim, hard-edged upscaled pixels — but lights that retro world with a
fully modern pipeline: real-time shadow maps, SSAO, volumetric fog, bloom, and emissive starshard glow. The
result should feel like a memory of a retro game that never actually existed: *the way King's Field looks in
your head*, not the way it looks on real hardware.

Crucially, "low-poly" is **not** "flat and boxy everywhere." Retro geometry had *eras*, and we borrow from
two on purpose (§2.4): **environments and props take PS2-era cues** — a blend of flat planes, honest curves,
radial and bevelled forms, and modest silhouette detail — while **characters, NPCs, enemies and bosses take
N64-era cues** — chunkier, simpler, lower-count figures with strong readable silhouettes. Modern surface maps
(normal / height / AO, §2.5) then carve the *fine* detail that the triangle budget can't, so a wall reads as
carved stone with real crevices while still being a handful of quads. The one law that unifies all of it:
**blend modern and retro until the result feels nostalgic for something that never existed.** These are
directions to *surprise* within, not a fixed recipe — every generated asset should explore the space, not
just reproduce the examples in this doc.

---

## 2. Render Pipeline Specification

### 2.1 The retro layer (geometry & texture rules)

| Parameter | Value | Notes |
|---|---|---|
| Internal resolution | **480×270** default | Player-selectable: 320×180 "Purist" / 480×270 "Classic" / 640×360 "Crisp"; UI renders at native res |
| Upscale | Nearest-neighbor to viewport | Integer scaling preferred; letterbox as needed |
| Vertex snapping | Simulated screen-space grid snap in the vertex shader | Strength scales with internal res; the signature PSX "wobble" |
| Texture warp | Affine-style interpolation approximation in shader | Subtle by default; stronger on "Purist" |
| Texture size | **64×64 standard, 128×128 hero assets** | Albedo nearest-filtered, no mips on the retro layer (or LOD-biased). Normal/height/AO map sets are allowed on environment & hero surfaces (§2.5) |
| Palette | **Albedo** textures quantized to per-biome ramps (see §4) | Enforced by the texture toolchain, not by hand. Normal/height/AO are data, not color — they are *not* palette-quantized |
| Poly budgets (**PS2-tier** env) | Prop 80–500 · modular kit piece 150–900 tris | Environments/props get the headroom for curves, bevels & radial forms (§2.4). Budgets live in the style constraint file |
| Poly budgets (**N64-tier** char) | Character 500–900 · boss 1,500–3,000 tris | Creatures stay chunky & silhouette-first; detail comes from maps + palette, not tris |
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

### 2.4 Geometry fidelity: the two-tier rule

Retro low-poly is not one thing. We deliberately mix two console eras so the world feels crafted, not
prototyped.

**The fidelity band — "intent without laziness":** aim *slightly above* a blockout and *slightly below* a
modern AAA asset. The tell of laziness is the **pure-90°/180° blockout** (right-angle boxes, flat unbroken
runs — the Minecraft/greybox look); we don't want that. But we also don't want the dense triangle counts of
modern art. The target is the middle: a few deliberate curves, bevels, chamfers, **45° cuts**, lattices, and
silhouette breaks that show a shape was *designed* — carried the rest of the way by surface maps (§2.5) rather
than by geometry. Environments, props, **and weapons** all sit in this band: visually striking, economically
modelled.

| Tier | Applies to | Reference era | Shape language |
|---|---|---|---|
| **Environment / prop tier** | Walls, floors, arches, columns, stairs, dais, terrain, furniture, breakables, hero set-pieces (Obelisk, chorale-stone) | **PS2** (a blend of flat, curved & moderately detailed) | Flat planes *plus* honest curves, bevelled edges, radial/lathed forms, chamfers, lattices, and small protruding/recessed silhouette detail. **Avoid the pure right-angle blockout look** — perfect **90°** corners and long **180°** flat runs are what read as "boxy"; **45° cuts and any in-between angles are welcome**, as are curves and chamfers. |
| **Character / creature tier** | Player classes, NPCs, enemies, bosses | **N64** (chunky, readable, low-count) | Simple, blocky-but-organic masses; strong silhouette; few tris; personality from proportion, palette and animation — *not* from geometric density. Detail is carried by texture + maps. |

Both tiers live under the same modern lighting. The point of the split: **environments reward looking closely;
characters read instantly at a glance and in a crowd** (important once boss arenas swarm — Docs/08 §5–6). The
poly budgets in §2.1 and the per-biome style file (§4) encode the split; `art:validate` enforces it.

Worked examples (illustrative, **not** exhaustive — generators should invent beyond these):
- **Cobblestone wall** — not a flat quad: individual stones actually protrude and the mortar lines recess as
  real geometry, then a normal + height + AO set (§2.5) deepens every crevice. Moss is baked into the albedo
  *and* given normal/height/AO relief so it sits *in* the surface. The Director may hang **vines** on fitting
  biomes as an optional prop: curved, cylindrical, lathed geometry — not a flat decal.
- **Columns, dais steps & stairs** — radial/lathed and bevelled rather than boxy; fluting, torus bases, worn
  nosings on steps; AO + roughness + normal/height to read as carved stone under the key light.
- **Crystals / shard clusters** — many variations: cracked faces, shards that have sheared off the main
  formation lying nearby, varied sizes/counts/angles, emissive cores that bloom (§2.2). No two clusters
  identical.

### 2.5 Surface maps: modern detail on retro geometry

The bridge between "handful of quads" and "reads as carved stone" is a **PBR-ish map set**, used with
restraint so it fuses with the retro layer instead of turning the game glossy-modern:

- **Albedo** — palette-quantized to the biome ramps (§4). The *only* channel bound by the palette.
- **Normal** — the primary detail channel: crevices, brick relief, wood grain, chisel marks, moss edges.
- **Height / parallax** — for the deepest recesses (mortar gaps, cobble seams) where a normal alone flattens
  at grazing angles; parallax-occlusion is optional/quality-gated (§2.2 draw-order, cost-tunable).
- **AO** — baked contact shadow that grounds detail and marries the retro albedo to the modern SSAO.
- **Roughness** (+ optional metallic for star-machinery/verdigris) — mostly matte; controlled specular for
  wet stone, crystal, hull metal. Full PBR is *available*, restraint is the default (§2.2).

Map sets are standard on **environment & hero surfaces**; **N64-tier characters** use albedo + a light
normal/AO at most (chunky reads clean without heavy maps). Maps are **data, not color** — they skip palette
quantization. Both Phase-A generation and Phase-B handcraft emit the same channels to the same budgets (§5).

**Director decoration layer:** on biomes where it fits, the generator scatters optional geometric props —
vines on cobble, hanging roots, shard debris, rubble, drips — as a post-embedding pass (Docs/07 §5). These
are cosmetic dressing (never gameplay geometry, never collision-critical) and obey the same tier/budget/map
rules. They exist to break up repetition and *surprise*.

---

## 3. UI Art Direction

- **Chunky, diegetic-leaning retro UI**: thick bordered panels, pixel-crisp bitmap type for flavor,
  legible sans for information. UI renders at native resolution (readability wins over purism) but uses
  the palette and dither language of the world.
- **Typography** (fonts live in `Client/assets/fonts/`, licenses alongside):
  | Font | Role | Notes |
  |---|---|---|
  | **Perfect DOS VGA 437** (user-provided) | HUD numerals, terminal/console-flavored text, damage numbers, debug overlay, loading-plate captions | Use the `Win` variant as primary (Windows-codepage glyph coverage); render at integer multiples of its native size — no fractional scaling |
  | **Liberation Sans** (user-provided, w/ Bold·Italic·BoldItalic) | Body text: tooltips, item affixes, chat, menus, lore blurbs — anything needing sustained legibility or bold/italic emphasis | Metrically Arial-compatible; SIL OFL licensed |
  | **Alagard** (in project — free, by Hewett Tsoi) | Display headers: screen titles, area-name reveals, boss names, rarity headers | Medieval pixel display face — the dark-fantasy signature; pairs beautifully with DOS VGA |
  | **m5x7** (in project — free, by Daniel Linssen) | Very dense small pixel UI (stat sheets, Astrolabe labels) where DOS VGA runs too wide | Tiny but shockingly legible |
  Rule of thumb: **Alagard announces, DOS VGA flavors, Liberation informs.** Any new font must be free
  (OFL/free-for-commercial) and ship with its license file.
- **Paperdoll inventory** (PoE-style): character silhouette with gear slots; grid inventory beside it.
  **Gadgets never appear on the paperdoll** — they live in a separate *Instruments* tab and a quick-use
  radial menu ([06-gadgets.md](06-gadgets.md) §6).
- **Input-aware prompts:** all UI glyphs swap automatically between KB/M and gamepad (Xbox layout) based on
  last-used device ([02-tech-architecture.md](02-tech-architecture.md) §6).
- Rarity colors ([05-items-loot-affixes.md](05-items-loot-affixes.md)): Common white · Forged blue ·
  Runed gold · Starmarked violet · Singular **gloam-green with animated dither shimmer**.

### 3.1 Legibility law: the world post chain must never eat the UI

The PSX post chain (internal-res render target → vertex snap → affine warp → Bayer dither → nearest upscale,
§2.2) is for the **world**. It must **never** be allowed to render UI illegible. The invariant:

- **All UI renders at native resolution, outside the *world's* internal-res post chain** — flat 2D HUD *and*
  world-anchored 3D UI alike. UI may *look* pixelated (bitmap fonts, hard edges, palette colors, a light
  ordered-dither flavor is fine) but must always stay **crisp and readable**. Text especially: **readability
  beats purism, every time.**
- **World-space / "3D" UI** — nameplates, HP/resource bars, boss bars, floating damage numbers, interaction
  prompts, gadget-lock markers, quest/Astrolabe pings — is **projected from world space and composited at
  native resolution**, never rendered as in-scene sprites/meshes that the downscale + dither would smear. It
  tracks its anchor entity, scales mildly with distance (clamped to a legible minimum) and fades out beyond a
  range — but is never blurred, re-diced, or vertex-snapped.
- **Diegetic exceptions** are deliberate: signage, screens, and props that are meant to live *in* the world
  (a rune-lit door glyph, a merchant's price board) *do* go through the world post chain — because they are
  world, not UI. If the player needs to read it to play, it's UI and renders native; if it's set dressing,
  it's world.

The *invariant is the native-res compositing and legibility* — **not** the specific mechanism. There are two:

**Interim (now, through ~M4): a DOM overlay.** Nameplates/HP bars/damage numbers project world→screen and
position absolutely-placed DOM elements above the canvas (`Client/game/worldLabels.ts`, `combatFx.ts`; `.wl-*`
/ `.fx-*` CSS). This is a deliberate stopgap that unblocks basic testing — cheap, crisp, good enough while UI
is just labels + a simple HUD. (The original bug it replaced: nameplates as `CanvasTexture` sprites *inside*
the 3D scene → smeared illegible by the post chain.) The DOM approach **does not scale** to the real UI to
come (§3.2 explains why) and is **not** the destination.

### 3.2 Target: an in-pipeline UI render layer (build at M5)

Once real UI arrives — paperdoll/inventory grids, loot tooltips, Dark-Souls-style boss bars, the Sanctum &
Obelisk screens, the Astrolabe **minimap/automap**, radial gadget menu, sprite/texture panels, and FX that
*want* effects (a Singular's emissive shimmer that should bloom, a diegetic CRT panel that should scanline) —
DOM is the wrong tool: it can't sample a render-target minimap, can't anchor text precisely inside a scaling
sprite panel, can't opt individual elements into GPU post, fights the game's own action-map/focus-graph, costs
layout/reflow on the CPU instead of the GPU, and is browser-locked (a barrier if CrawlStar ever leaves the
browser for a native shell). So the destination is a **dedicated UI render layer inside the pipeline**:

- **A UI pass composited after the world post chain, at native canvas resolution.** A screen-space
  **orthographic** camera draws 2D UI; world-anchored UI (nameplates, boss bars, markers) is placed by an
  in-engine world→screen projection. UI never enters the internal-res world target.
- **Per-element post policy — the key capability.** The UI compositor owns *its own* optional passes so
  elements choose their treatment: (a) **crisp** (default — menus, text, bars: no world post, GPU-filtered for
  legibility); (b) **opt-in FX** (bloom on a rarity glow, a soft dither/scanline "retro filter" on a diegetic
  element); (c) **anchored-in-world** (billboarded but native-res). Clarity and retro mix *deliberately*,
  per element — not globally.
- **Text:** GPU-rendered from **SDF/MSDF font atlases** (crisp at any scale, cheap, anchorable to sub-pixel
  positions inside panels) — pixel/bitmap fonts shipped as **nearest-filtered glyph atlases** keep the
  retro-but-legible look. Text can be parented into sprite/9-slice panels so a boss name sits correctly inside
  its frame as the frame scales.
- **Sprites & panels:** textured quads, 9-slice frames, and sprite atlases authored through the same art
  pipeline (palette discipline, §4). Icons/frames are assets, not CSS.
- **Minimap / automap:** rendered to its **own render target** (top-down ortho camera over discovered
  area-graph geometry, [07-procgen.md](07-procgen.md)) and sampled as a UI texture — *inherently* in-pipeline,
  impossible in DOM.
- **Layout & input:** a lightweight retained/immediate UI over the quads, wired to the existing action-map +
  **focus-graph** ([02-tech-architecture.md](02-tech-architecture.md) §6) so gamepad/touch parity is native,
  not bolted on.
- **Portability:** an in-engine UI layer (WebGL today) ports to a native backend (wgpu / OpenGL / Vulkan)
  far more cleanly than DOM — it keeps the UI a first-class part of the renderer.

Candidate building blocks to evaluate when M5 starts (free/open, license-checked): **SDF text** via
troika-three-text or a custom `msdfgen`/`msdf-atlas-gen` atlas; **panels/quads** via three-mesh-ui or a custom
textured-quad + sprite-atlas layer; **minimap** via a second scene + ortho camera to a `WebGLRenderTarget`;
**selective post** via a small dedicated `EffectComposer`/pass set the UI compositor owns. Genuinely
document-flow needs (accessibility, text-entry fields) may stay DOM by choice; **game UI lives in the
pipeline.** Migrate the interim `worldLabels.ts` / `combatFx` overlays onto this layer when it lands
([11-roadmap.md](11-roadmap.md#art-fidelity-upgrade-path)).

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
  // budgets are split by fidelity tier (§2.4): env/props get headroom for
  // curves & bevels; characters stay N64-chunky
  "polyBudgets": { "prop": 300, "kitPiece": 700, "character": 800, "boss": 2400 },
  "geometry": {                // §2.4 shape language, per tier
    "envDetail": "ps2",        // allow curves/bevels/radial forms on kit & props
    "charDetail": "n64",       // chunky, silhouette-first creatures
    "radialSegments": 10,      // lathe/round resolution cap for env forms
    "bevelKit": true           // kit pieces get chamfered edges, not raw boxes
  },
  "surfaceMaps": {             // §2.5 which channels generators/recipes emit
    "env":  ["albedo", "normal", "height", "ao", "roughness"],
    "char": ["albedo", "normal", "ao"],
    "parallax": "quality-gated" // POM only above a quality tier; normal-only below
  },
  "decoration": {              // §2.5 Director optional-prop scatter (cosmetic)
    "props": ["vines", "roots", "shardDebris", "rubble"],
    "density": 0.35
  },
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
| **Kit generator** (PS2-tier, §2.4) | Modular set pieces (walls, floors, arches, doorframes, stairs, pillars, rails) on the world-grid module ([07-procgen.md](07-procgen.md) §5) — now consumed by the **area composer** ([07](07-procgen.md) §5.1) which stitches them into multi-room, varied, loopable areas (round rotundas, curved/angled corridors, galleries) via room/connector **archetype registries** | Parametric primitives + extrude/**lathe/bevel/chamfer**/boolean ops → **curved & radial forms, not raw boxes**; biome kitTags select silhouettes; emits the env map set (albedo+normal+height+AO+roughness, §2.5) |
| **Prop generator** (PS2-tier) | Crates, altars, **crystal/shard clusters (cracked, sheared, varied)**, columns, furniture, debris | Same toolkit, seeded variation per instance (varied shapes/sizes/counts); env map set |
| **Texture synthesizer** | All surface **map sets** | Layered noise (Perlin/Worley) + pattern stamps (brick, plank, rivet) → **albedo palette-quantized to the biome ramps**; derives **normal + height + AO** from the same height field (data, not palette-bound); optional baked edge-darkening |
| **Character assembler** (N64-tier, §2.4) | Player classes, enemies, bosses | Modular low-poly humanoid/creature part library (heads, torsos, limbs, silhouette shells) + palette skinning; **chunky silhouette-first**, albedo+light normal/AO only; ≤24-bone shared rigs |
| **Animation library** | Locomotion, attacks, hits, deaths | Data-defined keyframes on the shared rigs; retargeted across characters |
| **Decoration scatterer** (§2.5) | Optional cosmetic props (vines, roots, shard debris, rubble) placed per biome fit | Post-embedding pass driven by the style file `decoration` block ([07-procgen.md](07-procgen.md) §5); cosmetic only, never gameplay/collision-critical geometry |
| **Loading-plate composer** | Transition cards | Biome palette + layered dither gradients + typography |

Phase A output is deliberately *good enough to judge the game by*: palette discipline, dithering, fog,
lighting — plus PS2-tier env shapes and surface maps (§2.4–2.5) — carry the aesthetic so it reads as crafted,
not blocked-out, even before any handcraft. (The M1–M3 prototype kit predates the two-tier rule and is
flatter/boxier than this target; the [roadmap](11-roadmap.md#art-fidelity-upgrade-path) schedules the uplift.)

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
2. Freeze any frame: no albedo surface breaks palette; no mesh breaks its **tier** budget (§2.4) —
   `art:validate` green across the build.
3. The "modern" layer disappears into the whole — players should say *"it looks like a retro game"* first and
   *"wait, it has real shadows?"* second.
4. A complete biome (kit + props + 3 enemies + plates) can be produced by the generators in one build step
   with zero manual art.
5. A non-artist following a recipe card produces a drop-in asset that passes validation on the first try.
6. **Geometry reads by tier:** environments/props show PS2-era shape (curves, bevels, radial forms, protruding
   detail + surface-map relief), characters/enemies/bosses read as clean N64-era chunk — neither looks like a
   flat prototype box. Two clusters of the same prop (e.g. crystals) are visibly varied, not clones.
7. **UI stays legible through the post chain (§3.1):** nameplates, HP bars and other world-space UI are crisp
   and readable at gameplay distances (not blurred/dithered/smeared), including in a crowded boss-arena swarm.

---

*Next: [02-tech-architecture.md](02-tech-architecture.md) — the machinery underneath.*
