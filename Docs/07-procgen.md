# 07 — Procedural Generation

> The Crawl re-knits itself for every expedition — but it is constitutionally incapable of stranding you.

Related: [06-gadgets.md](06-gadgets.md) (lock vocabulary), [03-networking.md](03-networking.md) §5
(streaming protocol), [08-enemies-bosses.md](08-enemies-bosses.md) (population & boss composer),
[09-modes-social.md](09-modes-social.md) §5 (Omens).

---

## 1. Shape of a World

An **expedition** (world) is a seeded graph of **areas** — open regions, dungeon complexes, and their
sublevels — linked by **transition objects** (gates, cave mouths, lifts, causeway doors) that
transitionally load with a plate ([01](01-art-direction.md) §2.3). Structure:

```
Sanctum₀ ──[REACH 1: 5 areas]── Boss₁ ── Sanctum₁ ──[REACH 2]── Boss₂ ── Sanctum₂ ── … → the CrawlStar
              │      │
              side-  sub-
              areas  levels     (branches: locked, remembered, or discovered)
```

- **Lateral by default:** the world graph is XY-dominant on the left-handed Z-up grid
  ([02](02-tech-architecture.md) §3). Z appears as explicit features — shaft ascents, plunge descents,
  multi-story interiors — and crossing Z meaningfully is **always gadget-gated** (Impeller/Anchor up,
  Tether-rappel down; [06](06-gadgets.md) §2).
- **Area levels** rise along the golden path (gloam saturation, [00](00-vision.md) §3.3); side-branches
  match or slightly exceed their parent (risk pockets).
- **Biomes** color consecutive stretches ([01](01-art-direction.md) §4); a Reach usually lives in 1–2 biomes
  with a transition area between.
- Seeds: `worldSeed = H(leagueSeed, expeditionSeed)`; every subsystem forks deterministic RNG streams from
  it ([02](02-tech-architecture.md) §4, [10](10-persistence.md) §3).

## 2. The Archipelago Model, Adapted

CrawlStar's generator borrows the [Archipelago Randomizer](https://archipelago.gg)'s formal core — the
thing that makes thousand-seed randomizers provably beatable — and turns it into a *level generator's*
skeleton:

| Archipelago concept | CrawlStar adaptation |
|---|---|
| **Region** | A cluster of areas (or one area) whose entrances carry **logic gates**: boolean access rules over capabilities — e.g. `canCross(gap) ∧ (canBlink ∨ canShatterSeal)` |
| **Location** | A placeable slot: vault pedestal, key alcove, boss reward, secret cache |
| **Item classification** | **Progression** (Instruments, star cores, key items — may appear in logic), **Useful** (upgrades, big currency), **Filler** (loot; never in logic) |
| **Sphere** | Sphere 0 = regions reachable with starting capabilities; sphere N+1 = reachable once progression items placed in spheres ≤ N are collected. The solvability ladder. |
| **Assumed fill** | The placement algorithm (§5) — progression items placed so that solvability is *constructed*, not checked-and-retried |

## 3. What Counts as "Logic"

Only **base Instrument capabilities** ([06](06-gadgets.md) §4 — never affixes), **key items**, and
**explicit discoveries** (a thrown lever, a revealed causeway — modeled as virtual progression items) may
appear in access rules. Character build/class abilities never gate logic (any-party-composition guarantee);
they may *flavor* placement (§4).

## 4. The Reach Director

Runs server-side per Reach ([03](03-networking.md) §5). **Inputs:** world seed & position along the furrow ·
party classes and Keystone Gates ([04](04-classes-progression.md) §4) · Instruments/cores already granted
(lookbehind) · the **sphere plan** (which Instruments the world intends to grant in future Reaches —
lookahead reservations) · accepted **Omens** ([09](09-modes-social.md) §5) · difficulty budget from the
pacing curve ([08](08-enemies-bosses.md) §5) · biome plan.

**Outputs:** a Reach blueprint — region graph, logic gates, placed progression/useful/filler items, area
layouts, population records, boss spec — plus updates to the world's lookbehind/lookahead registries.

**Placement intent** (the "and why"): the Director doesn't scatter — it *plots*. New-Instrument Reaches get
a **Starwrought Vault** showcase area followed by areas that teach, then test, then combine the new lock
type. Party-class weighting nudges flavor (Artificer parties see more ferric routes; a Gildhand Shade
attracts more soft-lock secrets). Omens bend population and reward placement. Boss specs may include a
gadget-locked mechanic **only if** the required Instrument sits in an earlier sphere
([08](08-enemies-bosses.md) §4).

## 5. Generation Pipeline (per Reach)

1. **Region/mission graph** — lock-and-key grammar with cycles (à la cyclic dungeon generation: loops,
   shortcuts-back, vista teases), 5 areas + boss area + connective branches; lock types drawn from the
   [vocabulary](06-gadgets.md) §2; sub-levels and side-areas attached with their own gates; **soft-lock
   secrets** (optional gates, including *future*-Instrument gates and affix-bonus caches, tagged `bonus`).
2. **Assumed fill** — progression items placed into locations: assume all unplaced progression items are
   held; place from the deepest sphere backwards, re-verifying reachability of each location at placement
   time. Softlocks are impossible *by construction*. Useful/filler items fill remaining locations by
   risk-weighted budgets.
3. **Grid embedding** — the region graph is laid onto the world grid as modular set-piece placements
   (kit pieces on module cells, [01](01-art-direction.md) §5): corridors, chambers, vertical features,
   nav data. Mazes where the grammar says maze; arenas where it says arena.
4. **Population pass** — enemy packs/elites by difficulty budget and biome bestiary, puzzles, traps, Dark
   Shrines, Peddler spawn rolls, breakables, ambience.
5. **Reachability regression check** — an independent solver walks the finished Reach with base
   capabilities only, sphere by sphere; failure = generation bug, fail loudly (never ship-and-pray). Also
   verifies: every `bonus`-tagged reward is loot/currency only, and every boss gadget-mechanic's
   Instrument is in an earlier sphere.

### 5.1 Area composition — the World Composer (implements step 3)

Step 3 above ("grid embedding") is a **per-area** sub-generator that turns each region into a **multi-room,
varied, loopable area** — not one prefab room. It is an extensible, registry-driven system (grows toward
thousands of pieces / many biomes). Code: `Shared/src/procgen/area/` (+ `complexity.ts`, `art/biomes.ts`).

**Algorithm — hybrid cyclic-graph + socket stitching** (Dormans/*Unexplored* cyclic generation for guaranteed
loops; socket-based modular stitching for non-90° connections). Pipeline (`composeArea`, all seeded):
1. **Footprint** — area size in world XY × the depth complexity budget (§5.2).
2. **Layout** (`layout.ts`) — a **cyclic room-graph**: a spanning tree of rooms + extra cycle edges (loops =
   backtracking). Rooms pick an **archetype** (`rooms.ts`: `rectHall`, `rotunda` faceted round room, `gallery`
   colonnade — more to come: caverns, outdoor patches); edges pick a **connector** (`connectors.ts`: straight/
   curved/angled corridors). Each edge is **directed + carries `traversal` + `gate`** (walk today; the same
   shape expresses one-way drops and climb-gated ledges — see Z-readiness §5.3).
3. **Embed** — place rooms by **socket matching** (align a free parent socket to a child socket at varied
   angles — rotunda sockets give angled corridors); resolve overlaps by retry/drop (always valid, never
   overlapping); close cycles with extra connectors.
4. **Tag / populate** — external portals on outward sockets (keyed to the director's links), gadget pickups
   seated in leaf/vault rooms, biome-contextual props + lights. (Arena-lockdown / hazard set-pieces: hooks
   now, built next.)
5. **Emit** (`emit.ts`) — walk the layout → `ChamberData` (meshes/colliders/portals/lights), consumed
   unchanged by `AreaIsland` (server) + `buildArea` (client). Split light-layout / heavy-emit so `planReach`
   reads gadget/portal anchors cheaply; both server and client run the SAME `composeArea` deterministically.

### 5.2 Difficulty-scaled complexity (deterministic, depth-driven)

`complexity.ts` maps a **depth** (Reach index × step + area position) to a **`ComplexityBudget`** — the *means*
of the generation knobs (footprint, room count, loop chance/count, room-size ceiling, maze/branchiness),
rising via a smooth curve to a **ceiling** then plateauing. The layout samples **around** those means (seeded
variance), so **linearity gets rarer with depth but never vanishes** (a deep area is *usually* bigger/loopier,
occasionally simple). This is the spatial analog of the combat pacing curve ([08](08-enemies-bosses.md) §5).
Waymark **Omens** ([09](09-modes-social.md) §5) can bias the budget (a "labyrinthine" Omen → more openness).

### 5.3 Z-axis (vertical) readiness

The composer is **Z-native by data model** even though the first slice is horizontal: sockets carry 3D
`pos`/`dir` + `traversal` (`walk|drop|climb|ladder|rope`) + `gate`; rooms carry `baseZ` + a multi-level slot;
the connector registry reserves vertical archetypes (stairs/ladder/rope/drop-shaft). **Solvability already
covers Z**: a one-way drop is a directed edge with no reverse; a climb-gated ledge is an edge with
`rule = have(<gadget>)` — the assumed-fill + reachability check (§5 steps 2, 5) handle both. Deferred: vertical
geometry + physics (climb/ladder, one-way platforms, moving platforms, fall/void death).

## 6. Backtracking & Remembered Locks

- Optional gates may reference Instruments from **future spheres** (lookahead): players see the lock, the
  Astrolabe pins it ([06](06-gadgets.md) §5), and Reaches later the pin lights up.
- **Sanctum waygates** allow travel back to any previously visited Sanctum (and from there, walking re-entry
  into cleared areas, which partially re-populate — [09](09-modes-social.md) §6). Backtracking is always a
  *choice* (greed, completion, gravemark recovery), never required for the golden path.
- The lookbehind registry keeps every unopened lock/secret alive across the whole expedition — the world
  remembers its debts.

## 7. Generation Horizon & Streaming

- **Horizon rule:** the server generates up to **5 connections ahead of the party's current position**, or
  the full Sanctum-to-Sanctum Reach in flight — whichever is larger; nothing beyond the horizon exists yet
  except the sphere plan's reservations (so lookahead stays cheap and late inputs — party changes, Omens —
  can still shape ungated future Reaches).
- **Trigger flow** ([03](03-networking.md) §5): Waymark Obelisk activation ⇒ whole-Reach Director job;
  transition-object approach ⇒ area finalize/population jobs. First area streams while the rest of the
  Reach generates in the background.
- Clients receive **compact deterministic descriptors** (kit ids + transforms + seeds + logic + spawn
  records) and reconstruct locally; descriptors are identical to what persistence stores
  ([10](10-persistence.md) §3). Undiscovered secrets are withheld until revealed
  ([03](03-networking.md) §7).

## 8. Testing the Generator

- **Property tests** (Vitest): fill invariants (no progression item in its own sphere's logic shadow,
  `bonus` purity, gadget-boss ordering), graph connectivity, budget conformance — across thousands of seeds
  in CI.
- **Bot soak runs** ([09](09-modes-social.md) §3.4): headless bot parties play full expeditions at
  accelerated tick; assert completion without capability violations, log pacing/loot telemetry for balance.
- **Debug tooling:** area-graph/sphere visualizer, seed replay, descriptor diffing
  ([02](02-tech-architecture.md) §9).

---

*Next: [08-enemies-bosses.md](08-enemies-bosses.md) — what the Gloam made of the furrow's dead.*
