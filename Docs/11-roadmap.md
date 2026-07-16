# 11 — Roadmap to Vertical Slice

> Prove the two scary things first. Everything else is diligence.

The two existential risks are **the look** (does PSX-modern actually sing in a browser?) and **the wire**
(does predicted co-op feel right over WebSockets?). They are M1 and M2 on purpose. Every milestone ends
with something *runnable*; each lists acceptance criteria the [verify flow](README.md) can exercise.

Solo-developer scope discipline applies throughout: launch content targets are minimums, all data-driven
and extensible later.

---

## Art-fidelity upgrade path

> Prototype art first; upgrade the *look* exactly when it starts costing more to defer than to do.

The [art direction](01-art-direction.md) sets a higher bar than the M1–M3 prototype kit hits: PS2-tier
environment geometry (curves, bevels, radial forms, protruding detail), N64-tier characters, PBR-ish surface
maps (normal/height/AO), a Director decoration layer, always-legible native-res UI, and — longer-term — a
**dedicated in-pipeline UI render layer** to replace the interim DOM overlays ([01](01-art-direction.md)
§2.4–2.5, §3.1–3.2). We **don't** retrofit all of that at once — we land each capability at the milestone where
it first pays for itself. The trigger is always *"are we about to mass-produce or hand-author (or DOM-hack)
against the old fidelity?"* — upgrade the engine/generator/UI support **just before** that, never after.

| Capability | Lands at | Why then |
|---|---|---|
| **Interim native-res UI overlay** (DOM: nameplates, HP bars legible through the post chain, [01](01-art-direction.md) §3.1) | **Done (pre-M4)** | Cheap, isolated stopgap; the blurry-nameplate bug was already visible in M3. **DOM is not the destination** — see the UI-layer row below |
| **In-pipeline UI render layer** — native-res UI pass with per-element post policy (clarity vs opt-in bloom/retro), SDF/atlas text in sprite panels, render-target minimap/automap, focus-graph layout; migrate the interim DOM overlays onto it ([01](01-art-direction.md) §3.2) | **M5** | M5 is the first heavy-UI milestone (paperdoll/inventory/tooltips/loot filter/stash) — DOM can't do render-target minimaps, in-panel text anchoring, or per-element GPU post, and won't port beyond the browser. Build the substrate here so M6 (Sanctum/Obelisk/automap) and M7 (boss bars) sit on it, not on more DOM |
| **Geometry fidelity tiers in style files + `art:validate`**; **kit generator emits PS2-tier forms** (lathe/bevel/radial) + **normal + AO** map support in the renderer | **M4** | M4's grid embedding is the **first time the kit is stitched into real multi-room areas** ([07](07-procgen.md) §5) — the first time flat boxes are seen at scale, and the last cheap moment to change the kit before content multiplies. Land it with M4's embedding or as a short pass right after; **do not gate M4's procgen `Accept:` on it.** |
| **Full surface-map pipeline** (add **height/parallax**, roughness/metallic), **Director decoration layer** (vines/roots/debris), **N64-tier character handcraft begins** | **M6** | M6 adds the **second biome + families** — the moment biome variety and prop density scale, so the map pipeline and decoration scatter stop being polish and start being cohesion. First Phase-B recipe cards ([01](01-art-direction.md) §5) can begin against hero props here |
| **Hero-asset handcraft** (classes → bosses → hero props → kit silhouettes, [01](01-art-direction.md) §5 priority order) + the [01](01-art-direction.md) §7 look-acceptance pass on the slice | **M9** | Vertical slice is the showcase; heroes get the guided Blender/PS treatment against final palettes/budgets |

Everything here is data-driven (style files + generators), so a later biome automatically inherits the
fidelity of whatever pass is current. Deferred items live in `.claude/BACKLOG.md` (Gameplay/client + a new
art-fidelity block); the per-milestone one-liners below fold each into its milestone's scope.

---

## M1 — Scaffold & the Look
Monorepo (`Client/`, `Server/`, `Shared/` — [02](02-tech-architecture.md) §2), Vite + TS strict + Vitest;
first art-gen output (one biome's kit + textures via style constraint file); PSX-modern render pipeline
(internal-res target, vertex snap, dither, fog, shadows, bloom — [01](01-art-direction.md) §2); fly-cam
viewer.
**Accept:** a generated Sunken Parish chamber, screenshot-identifiable per [01](01-art-direction.md) §7,
at 60 fps at 480×270 internal on a mid laptop.

## M2 — The Wire (walking skeleton)
Shared ECS + 30 Hz fixed tick; headless server hosting one area island **with its Rapier world**
([02](02-tech-architecture.md) §4.1); WebSocket transport + binary protocol; client
prediction/reconciliation + interpolation ([03](03-networking.md) §3–4) including the client Rapier mirror;
Rapier-kinematic first-person controller (+ third-person camera shift); action-map input with KB/M +
gamepad hot-swap
([02](02-tech-architecture.md) §6); **one transition object** between two areas with loading plate and
descriptor streaming; integrated Web Worker server running the same code (singleplayer parity).
**Accept:** two browsers + one bot walk the same two areas at 150 ms simulated RTT without rubber-banding;
the same build runs offline in Worker mode.

## M3 — Combat Core + Warden
Damage/mitigation math, downed state, combo-tag components and first four tags (Ignite, Soak, Shock,
Launch — [04](04-classes-progression.md) §2); Warden kit (block/Bulwark, ward walls, Launch→Slam); three
Furrowmouth enemy families on utility-AI archetypes ([08](08-enemies-bosses.md) §2–3); lag-compensated
melee/hitscan validation.
Explosion impulses (Launch→Slam shoves bodies for real) and first cosmetic ragdolls
([02](02-tech-architecture.md) §4.1 Tier 3).
**Accept:** a Warden + one bot clear a populated chamber; tag combos land server-authoritatively; a Slam
visibly launches enemies and deaths ragdoll client-side; fights feel Barony-lethal per
[08](08-enemies-bosses.md) §5 Reach-1 targets.

## M4 — The Director (one Reach)
Region graph grammar + assumed fill + reachability regression ([07](07-procgen.md) §5) over the first two
lock types (Tether gaps, Impeller ledges); grid embedding with the M1 kit; Starwrought Vault set-piece; the
two Instruments with charges + radial menu + Astrolabe with remembered locks ([06](06-gadgets.md));
generation horizon + Obelisk-triggered whole-Reach jobs (Omens stubbed).
**Art-fidelity (see [upgrade path](#art-fidelity-upgrade-path)):** because grid embedding is the first time the
kit is stitched into real multi-room areas, this is the trigger to add **geometry fidelity tiers** to the
style files + `art:validate`, have the **kit generator emit PS2-tier forms** (lathe/bevel/radial, not raw
boxes), and add **normal + AO** map support to the renderer ([01](01-art-direction.md) §2.4–2.5). Land it with
embedding or as a short pass right after — **not** a gate on the procgen accept below.
**Accept:** 1,000 seeded Reaches generate with zero solver failures in CI; a bot party completes a full
Reach headlessly; a human party crosses a gadget-gated golden path and opens one remembered lock by
backtracking.

## M5 — Loot & the Economy Floor
Item bases + paperdoll/inventory UI (gamepad focus-graph parity); rarities through Starmarked; affix pools
+ tiers; loot filter + rarity beams; first five currencies + Irradiation; party chest, stash, vendors;
gravemark + XP-debt death loop ([09](09-modes-social.md) §6).
**Art-fidelity (see [upgrade path](#art-fidelity-upgrade-path)):** paperdoll/inventory/tooltips are the first
heavy UI, so **build the in-pipeline UI render layer** here ([01](01-art-direction.md) §3.2) — native-res UI
pass, per-element post policy, SDF/atlas text in sprite panels, focus-graph layout — and **migrate the interim
DOM overlays** (`worldLabels.ts`, damage numbers) onto it. Don't extend the DOM stopgap into real screens.
**Accept:** a 2-hour session produces sensible drops/crafts at Reach-1/2 rates; a wipe → recovery run →
gravemark reclaim works end-to-end. **UI renders through the new layer** (inventory, tooltips, migrated
nameplates) crisp at native res with gamepad + touch parity.

## M6 — Depth (Reaches 2–3, Omens, Sanctum)
Rest Sanctum area with sleep/save/resume, respec altar, waygates ([09](09-modes-social.md) §4,
[10](10-persistence.md) §4); Waymark Obelisk with real Omens (Minor/Major tiers, mandatory-pick rules);
second biome + families; locks 3–6 with their Instruments; Arcanist + Reaver classes; passive trees with
Keystone Gates.
**Art-fidelity (see [upgrade path](#art-fidelity-upgrade-path)):** the second biome is the cue to complete the
**full surface-map pipeline** (add height/parallax + roughness/metallic), turn on the **Director decoration
layer** (vines/roots/shard-debris scatter), and **begin N64-tier character handcraft** + the first Phase-B
recipe cards ([01](01-art-direction.md) §2.5, §5) — biome variety is where map/decoration cohesion stops being
polish.
**Accept:** save-and-resume a 3-Reach expedition across server restart; Omens visibly reshape a Reach;
Gate sealing/unsealing works with respec costs.

## M7 — Bosses & the Loop Closes
Boss composer (3 archetypes × 6 modules incl. one gadget-locked — [08](08-enemies-bosses.md) §6) + arena
generation; boss rewards + first-kill passive points; Meridian Peddler with courier banking + Gravewarrant
+ gambles ([09](09-modes-social.md) §7); Stillwater Phial revive flow; difficulty pacing curve wired to
Reach index. **Art-fidelity (see [upgrade path](#art-fidelity-upgrade-path)):** the **Dark-Souls-style boss
HP bar** (world-anchored name + segmented bar, possibly with an opt-in bloom on phase-shift) is built on the
M5 in-pipeline UI layer ([01](01-art-direction.md) §3.2) — the first showcase of per-element UI post.
**Accept:** Sanctum → Omens → 5 areas → composed boss → Sanctum, repeatable for 3 Reaches, with banking
tension demonstrably shaping player behavior (telemetry: courier use, gravemark losses).
**Stress test (first entity-density checkpoint — [02](02-tech-architecture.md) §4.3):** headless soak
spawning escalating enemy + projectile counts in one island (boss add-waves are the first true horde);
assert 30 Hz tick stays ≤ ~20 ms server-side with no runaway GC. This is the earliest point the O(n²) combat
loops could bite — if they do, add spatial partitioning + kill per-tick allocations before piling on content.

## M8 — The Full Company
Shade, Artificer, Chorister; revive keystones (Threnody, Deathgrudge) + one revive Singular; bot personas
for all six classes + party-fill recommender; public/private lobbies (regional service, [Multiplayer/](Multiplayer/README.md)),
non-party visitors + party voting + chat channels ([09](09-modes-social.md) §9–11), mid-run join, connection
cap ([03](03-networking.md) §8); soak-test harness in CI (nightly full-expedition bot runs — [07](07-procgen.md) §8).
**Accept:** 5-player mixed human/bot party completes 5 Reaches; nightly soak is green a week straight;
solo-with-bots session quality holds up per pillar 4 playtesting.
**Stress test (sets the real entity ceiling — [02](02-tech-architecture.md) §4.3):** add a **max-density
single-encounter** scenario to the nightly soak (a boss-arena add-swarm: as many concurrent, co-located
enemies/projectiles/effects as possible + a **full 16-connection** server) and record tick time, allocation
rate, and snapshot bytes/client as tracked telemetry. This validates (or lowers) the concurrency target —
aspire to **hundreds on screen at once**, **~50 concurrent of each as the acceptable lower bound** — and
sets the per-region connection cap ([03](03-networking.md) §8).

## M9 — Vertical Slice
Content fill to 6 biomes / 8 boss archetypes / all 11 locks + Instruments; remaining tags and currencies;
Singulars set; hardcore flag; Dire Omens + final-Reach double-mandatory rule; performance/persistence
hardening. **Art-fidelity (see [upgrade path](#art-fidelity-upgrade-path)):** the **hero-asset handcraft pass**
in Phase-B priority order (classes → bosses → hero props → kit silhouettes, [01](01-art-direction.md) §5) plus
the [01](01-art-direction.md) §7 look-acceptance pass across the whole slice — the two-tier geometry + UI
legibility criteria (§7.6–7.7) must hold on every biome.
**Accept:** a complete expedition (8+ Reaches to a CrawlStar finale encounter) playable solo-with-bots and
5-player online; a stranger can install nothing, click a link, and be playing inside a minute.

## Post-slice (explicitly deferred)
Leagues/ladder/season ops ([09](09-modes-social.md) §8, [10](10-persistence.md) §6) · trade circle UX ·
meta-unlock pools · audio bible · WebRTC transport option · account services hardening · content
expansion cadence.

---

*Index & traceability: [README.md](README.md).*
