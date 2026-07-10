# 11 — Roadmap to Vertical Slice

> Prove the two scary things first. Everything else is diligence.

The two existential risks are **the look** (does PSX-modern actually sing in a browser?) and **the wire**
(does predicted co-op feel right over WebSockets?). They are M1 and M2 on purpose. Every milestone ends
with something *runnable*; each lists acceptance criteria the [verify flow](README.md) can exercise.

Solo-developer scope discipline applies throughout: launch content targets are minimums, all data-driven
and extensible later.

---

## M1 — Scaffold & the Look
Monorepo (`Client/`, `Server/`, `Shared/` — [02](02-tech-architecture.md) §2), Vite + TS strict + Vitest;
first art-gen output (one biome's kit + textures via style constraint file); PSX-modern render pipeline
(internal-res target, vertex snap, dither, fog, shadows, bloom — [01](01-art-direction.md) §2); fly-cam
viewer.
**Accept:** a generated Sunken Parish chamber, screenshot-identifiable per [01](01-art-direction.md) §7,
at 60 fps at 480×270 internal on a mid laptop.

## M2 — The Wire (walking skeleton)
Shared ECS + 30 Hz fixed tick; headless server hosting one area island; WebSocket transport + binary
protocol; client prediction/reconciliation + interpolation ([03](03-networking.md) §3–4); first-person
controller (+ third-person camera shift); action-map input with KB/M + gamepad hot-swap
([02](02-tech-architecture.md) §6); **one transition object** between two areas with loading plate and
descriptor streaming; integrated Web Worker server running the same code (singleplayer parity).
**Accept:** two browsers + one bot walk the same two areas at 150 ms simulated RTT without rubber-banding;
the same build runs offline in Worker mode.

## M3 — Combat Core + Warden
Damage/mitigation math, downed state, combo-tag components and first four tags (Ignite, Soak, Shock,
Launch — [04](04-classes-progression.md) §2); Warden kit (block/Bulwark, ward walls, Launch→Slam); three
Furrowmouth enemy families on utility-AI archetypes ([08](08-enemies-bosses.md) §2–3); lag-compensated
melee/hitscan validation.
**Accept:** a Warden + one bot clear a populated chamber; tag combos land server-authoritatively; fights
feel Barony-lethal per [08](08-enemies-bosses.md) §5 Reach-1 targets.

## M4 — The Director (one Reach)
Region graph grammar + assumed fill + reachability regression ([07](07-procgen.md) §5) over the first two
lock types (Tether gaps, Impeller ledges); grid embedding with the M1 kit; Starwrought Vault set-piece; the
two Instruments with charges + radial menu + Astrolabe with remembered locks ([06](06-gadgets.md));
generation horizon + Obelisk-triggered whole-Reach jobs (Omens stubbed).
**Accept:** 1,000 seeded Reaches generate with zero solver failures in CI; a bot party completes a full
Reach headlessly; a human party crosses a gadget-gated golden path and opens one remembered lock by
backtracking.

## M5 — Loot & the Economy Floor
Item bases + paperdoll/inventory UI (gamepad focus-graph parity); rarities through Starmarked; affix pools
+ tiers; loot filter + rarity beams; first five currencies + Irradiation; party chest, stash, vendors;
gravemark + XP-debt death loop ([09](09-modes-social.md) §6).
**Accept:** a 2-hour session produces sensible drops/crafts at Reach-1/2 rates; a wipe → recovery run →
gravemark reclaim works end-to-end.

## M6 — Depth (Reaches 2–3, Omens, Sanctum)
Rest Sanctum area with sleep/save/resume, respec altar, waygates ([09](09-modes-social.md) §4,
[10](10-persistence.md) §4); Waymark Obelisk with real Omens (Minor/Major tiers, mandatory-pick rules);
second biome + families; locks 3–6 with their Instruments; Arcanist + Reaver classes; passive trees with
Keystone Gates.
**Accept:** save-and-resume a 3-Reach expedition across server restart; Omens visibly reshape a Reach;
Gate sealing/unsealing works with respec costs.

## M7 — Bosses & the Loop Closes
Boss composer (3 archetypes × 6 modules incl. one gadget-locked — [08](08-enemies-bosses.md) §6) + arena
generation; boss rewards + first-kill passive points; Meridian Peddler with courier banking + Gravewarrant
+ gambles ([09](09-modes-social.md) §7); Stillwater Phial revive flow; difficulty pacing curve wired to
Reach index.
**Accept:** Sanctum → Omens → 5 areas → composed boss → Sanctum, repeatable for 3 Reaches, with banking
tension demonstrably shaping player behavior (telemetry: courier use, gravemark losses).

## M8 — The Full Company
Shade, Artificer, Chorister; revive keystones (Threnody, Deathgrudge) + one revive Singular; bot personas
for all six classes + party-fill recommender; public/private lobbies, mid-run join, global chat; soak-test
harness in CI (nightly full-expedition bot runs — [07](07-procgen.md) §8).
**Accept:** 5-player mixed human/bot party completes 5 Reaches; nightly soak is green a week straight;
solo-with-bots session quality holds up per pillar 4 playtesting.

## M9 — Vertical Slice
Content fill to 6 biomes / 8 boss archetypes / all 11 locks + Instruments; remaining tags and currencies;
Singulars set; hardcore flag; Dire Omens + final-Reach double-mandatory rule; performance/persistence
hardening; first Phase-B art recipe cards ([01](01-art-direction.md) §5) authored against the slice's
hero assets.
**Accept:** a complete expedition (8+ Reaches to a CrawlStar finale encounter) playable solo-with-bots and
5-player online; a stranger can install nothing, click a link, and be playing inside a minute.

## Post-slice (explicitly deferred)
Leagues/ladder/season ops ([09](09-modes-social.md) §8, [10](10-persistence.md) §6) · trade circle UX ·
meta-unlock pools · audio bible · WebRTC transport option · account services hardening · content
expansion cadence.

---

*Index & traceability: [README.md](README.md).*
