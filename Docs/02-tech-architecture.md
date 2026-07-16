# 02 — Technical Architecture

> One simulation, three homes: the headless server, the singleplayer Web Worker, and the client's
> predicted mirror of both.

Related: [03-networking.md](03-networking.md) (protocol), [07-procgen.md](07-procgen.md) (generation),
[10-persistence.md](10-persistence.md) (storage).

---

## 1. Stack Summary

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript everywhere** (strict) | One language across client/server/shared; shared simulation is the load-bearing decision |
| Client rendering | **Three.js** + custom shaders | Mature, documented, easy custom vertex/post shaders for the PSX layer ([01](01-art-direction.md) §2) |
| Client build | **Vite** | Fast dev loop, worker bundling, asset pipeline hooks |
| Server runtime | **Node.js** (LTS), headless | No rendering; runs simulation + generation + persistence |
| Persistence | **better-sqlite3** (SQLite, WAL mode) **on a dedicated persistence worker thread** | Fast single-file storage; sync API *inside* the worker, event-driven job queue from the sim's view — the tick loop never blocks on disk (§4.2, [10](10-persistence.md) §1) |
| Transport | **WebSocket (`ws`)** behind a transport interface | See [03](03-networking.md) §1; WebRTC possible later without refactor |
| Physics | **Rapier** (`@dimforge/rapier3d-compat`, Rust→WASM) | Full rigid-body engine, server-side authoritative: cross-platform deterministic WASM builds, built-in kinematic character controller, impulse/multibody joints (tether ropes, ragdolls), world snapshots; fastest maintained option for web (≈3–4× cannon-es); runs identically in Node, browser, and Web Worker (§4.1) |
| Tests | Vitest + headless bot soak harness ([09](09-modes-social.md) §3.4) | Simulation is renderer-free by design, so it tests natively |

## 2. Repository Layout (pnpm workspaces)

```
/
├─ Client/          # Three.js app: rendering, input, UI, prediction, integrated-server host
├─ Server/          # Headless Node: authoritative sim host, sockets, sqlite, ops
├─ Shared/          # THE GAME. Everything deterministic and renderer-free:
│  ├─ sim/          #   ECS: components, systems, fixed-tick loop, combat, tags
│  ├─ procgen/      #   Reach Director, regions/spheres/fill, grid embedding (07)
│  ├─ data/         #   Item bases, affix pools, classes, passives, enemies, Omens (05/04/08/09)
│  ├─ protocol/     #   Message schemas, encoding, versioning (03)
│  ├─ art-gen/      #   Build-time asset generators + style constraint files (01)
│  └─ math/         #   Coordinate types, RNG (seeded, forkable), fixed-point helpers
└─ Docs/            # This design suite + art recipes
```

**The prime directive:** `Shared/` imports nothing from `Client/` or `Server/` and touches no DOM, no
Node-only API (injected interfaces for time/storage), and no floating-point nondeterminism it can avoid
(seeded RNG only; no `Math.random`).

## 3. Coordinate System

- **World space (sim + procgen): left-handed, Z-up Cartesian** (Unreal-style), on an XYZ world grid.
  X = east, Y = north, Z = up. Yaw around Z. Grid cells are the procgen module unit ([07](07-procgen.md) §6).
- Z is deliberately de-emphasized in traversal logic: routes are XY-dominant, and Z transitions are always
  explicit features (stairs, shafts, ledges) — often gadget-gated ([06](06-gadgets.md)): Gravitic Impeller /
  Lodestone Anchor to go up, Graviton Tether rappel to go down safely.
- **Render space:** Three.js is right-handed Y-up. Conversion happens at exactly one boundary — a
  `worldToRender` transform (and its inverse) in `Client/render/space.ts`:
  `render(x, y, z) = (world.x, world.z, world.y)` (swap Y/Z, flipping handedness). Property-based tests
  round-trip vectors, quaternions, and winding order. **No other file converts coordinates.** GLTF export
  presets in the art pipeline bake the same convention ([01](01-art-direction.md) §5).

## 4. Simulation Core (Shared/sim)

- **Entity model (as built, M2–M3):** a per-island `Map<id, entity>` of plain objects (`IslandEntity` with
  nested `state`/`combat`/`tags`/`cooldowns`); **systems run in a fixed order each tick**. It is *not* yet a
  data-oriented ECS — no Struct-of-Arrays / typed-array component stores, archetype chunks, sparse-sets, or
  pooling. This is deliberate: it's correct, readable, and fast enough at current scale. **SoA + pooling is a
  deferred optimization** (§4.3), not a claim about today. Written renderer-free so the same code runs on
  server, Web Worker, and in client prediction.
- **Fixed tick:** simulation advances at **30 Hz** (`TICK_MS = 33.33`). Rendering interpolates between the
  last two known states; client input is sampled per frame and quantized to ticks.
- **Determinism level:** *replayable-deterministic* — same inputs + same seed ⇒ same outcomes on the same
  build. We do not require cross-machine bit-determinism (server is always authoritative); we do require
  seedable, forkable RNG streams (`rng.fork("loot", areaId)`) so generation and combat rolls are auditable
  and testable.
- **Area = simulation island:** each loaded area is an isolated sim world (entities, nav data, RNG streams).
  Islands tick independently; nothing references entities across islands except the travel/handoff layer.
  This is the scaling unit — an island is cheap when no players are in it (frozen) and can be re-populated
  on re-entry ([09](09-modes-social.md) §Death).
- **Interaction layer:** combat, combo tags ([04](04-classes-progression.md) §2), gadget capability checks
  ([06](06-gadgets.md)), interactions (doors, shrines, Obelisk), loot generation ([05](05-items-loot-affixes.md)).

### 4.1 Physics Architecture (Rapier, three tiers)

Each area island owns a **Rapier world** stepped in lockstep with the 30 Hz sim tick. Rapier's
WASM build is cross-platform deterministic (same version + same op order ⇒ identical results on any
machine — stronger than our replayable-determinism requirement, and it composes with our seeded-RNG rules:
no `Math.sin`-style host math feeds the sim, which `Shared/math` already mandates). One WASM binary runs
identically on the Node server, the singleplayer Web Worker, and the client's prediction mirror.

| Tier | Where | What | Networked? |
|---|---|---|---|
| **1 — Authoritative gameplay** | Server island world | Kinematic character controllers (Rapier's built-in: autostep, ground-snap, moving platforms) for players/bots/enemies; projectiles; **explosion impulses** (spells shove enemies, pop breakables); **tether/rope dynamics** (Graviton Tether swings, Threadspool lines — joint chains / rope joints); pushable props, collapsing spans, physics puzzles | Yes — via snapshots ([03](03-networking.md) §3) |
| **2 — Predicted** | Client mirror world | The local player's controller + their in-flight projectiles + the tether while *they* swing it, simulated with the same Rapier code and reconciled against server state ([03](03-networking.md) §4) | Reconciled |
| **3 — Cosmetic** | Client only | **Ragdoll deaths** (corpse hand-off from animated skeleton to a client-local ragdoll seeded by the killing impulse event), debris, shell casings, cloth flourish | Never — fire-and-forget, zero bandwidth, zero server cost |

Rules that keep this honest: anything that affects gameplay outcomes lives in Tier 1, full stop (a ragdoll
can never block a doorway; a cosmetic debris chunk can never hide a hitbox). Tier-3 effects are *seeded* by
authoritative events (death impulse vector, explosion origin/magnitude) so every client's cosmetics look
plausibly identical without being synced. Lag compensation for hits keeps the cheap **hitbox-history ring
buffer** ([03](03-networking.md) §4) — we rewind hitboxes, not the whole physics world; Rapier's
`world.createSnapshot()`/`restoreSnapshot()` is reserved for checkpoint/debug/replay tooling, not the hot
path. Sleeping-body management + per-island worlds keep server cost linear in *active* areas, and islands
with no players freeze entirely ([§4](#4-simulation-core-sharedsim)).

### 4.2 Concurrency Model

Node is event-driven by nature; the design leans into it rather than fighting it:

- **Sim thread(s):** the 30 Hz tick loop runs on the main event loop; area islands are independent by
  construction (§4), so expeditions (or islands) can be sharded across `worker_threads` when profiling
  says so — the interface is already message-passing ([03](03-networking.md) §1), making that move cheap.
- **Persistence worker:** all SQLite access lives on a dedicated worker thread with a job queue.
  *Inside* the worker, better-sqlite3's synchronous API is used deliberately — for game-sized
  transactions it outperforms async drivers (no thread-pool round-trip per query), and SQLite serializes
  writers anyway. From the sim's perspective every checkpoint is a fire-and-forget event
  ([10](10-persistence.md) §4); the tick loop never touches disk.
- **Generation jobs** ([07](07-procgen.md) §7) run off the hot path (queued jobs, worker-shardable same as
  islands).
- **Client side:** render thread never simulates the world — the integrated server is already a Web
  Worker ([§5](#5-three-deployment-shapes-one-sim)), so a same-PC host pays for sim+physics on a separate
  core from rendering.

### 4.3 Scaling posture & when to optimize

**Target = concurrent, co-located, simultaneously-simulated-and-visible entities in a single encounter** (the
worst case is a **boss arena where add-swarms can genuinely overwhelm the party** — that's the design intent,
not sparse rooms). Aspire to **hundreds on screen at once**; **~50 concurrent of each** (enemies /
projectiles / effects) is the acceptable **lower bound** if the browser ceiling proves lower. This is *not* a
per-area or per-"floor" spread: an area/floor may hold far more entities *spatially* (spread across many
rooms, only some active near players) — the budget that matters is how many are live and near the camera
**together**. Effects are mostly **client-side cosmetic** (Tier-1/3 split, §4.1), so the *server* budget is
dominated by enemies + projectiles + their physics.

**Numbers are guesswork until the generator exists.** M3 has only two identical single-room areas (no
procedural stitching yet); real per-area/room densities and how many rooms a floor/area spans get set once
the Reach Director (M4+) stitches multi-room areas and the stress tests below run. Treat all counts here as
placeholders to be measured, not literal targets.

**Don't pre-optimize.** The current model handles M2–M9's designed densities (Docs/08 §5: packs of ~2–15).
Optimize only when a **stress test** shows a real ceiling, and attack costs in this order (memory layout is
NOT first in a GC'd sim):

1. **O(n²) hot loops** — `stepProjectiles` (projectiles × entities), `applyHasteAuras` (entities²), AI
   `nearestTarget` (entities² across AI), hitbox `meleeArc`/`radius` scans. Fix with **spatial partitioning**
   (uniform grid / hash) over `AreaIsland`, not SoA.
2. **Per-tick allocations / GC churn** — the per-entity `AbilityContext` (with closures) rebuilt each tick in
   `area.ts`, `recordHistory`'s fresh sample array, bot `InputCmd`s, snapshot spreads. Reuse/pool these.
3. **Snapshot bandwidth** — ~21 B × area entities × 30 Hz per client. Add **interest management / delta
   culling** ([03](03-networking.md) §3).
4. **Rapier body count** — hundreds of kinematic bodies is heavy regardless of ECS; consider cheaper
   collision for far/again-Sanctum entities. (Projectiles are already sim-marched, not Rapier — keep that.)
5. **Only then** consider **SoA typed-array component stores** (positions/tags/cooldowns) + a **sparse-set**
   entity container, if GC is still the bottleneck.

**Where/when to stress test** (use the bot soak harness, [07](07-procgen.md) §8, [08](08-enemies-bosses.md) §7):
- **M6–M7** (first true horde densities + boss add-waves): a headless soak spawning escalating enemy +
  projectile counts in one island, asserting the 30 Hz tick stays within budget (≤ ~20 ms/tick server-side)
  and no runaway GC. This is the earliest point the O(n²) loops could bite.
- **M8** (nightly bot-soak CI + the connection cap, [03](03-networking.md) §8): add a **max-density scenario**
  to the nightly run (target-ceiling enemies/projectiles + a full 16-connection server) and record tick
  time, allocation rate, and snapshot bytes/client as tracked telemetry — this sets the *real* per-region
  entity ceiling and validates the ~50-each floor.
- Re-run whenever a new class/enemy/effect adds a per-tick scan. See `.claude/BACKLOG.md` (Performance &
  scaling) and `.claude/guide/verification.md` for the harness recipe.

## 5. Three Deployment Shapes, One Sim

```
            ┌────────────────────────── Shared/sim + procgen + data ───────────────────────────┐
            │                                                                                   │
   ONLINE   │   Server/ (Node headless)  ── ws ──►  Client A (predict+render)                   │
   CO-OP    │        ▲ sqlite                       Client B …  (≤5 players + bots)             │
            │                                                                                   │
   SINGLE   │   Client-hosted integrated server: the SAME server code bundled into a            │
   PLAYER   │   **Web Worker** (sqlite → sql.js/OPFS adapter). Main thread talks to it          │
            │   through the SAME transport interface (MessageChannel instead of ws).            │
            └───────────────────────────────────────────────────────────────────────────────────┘
```

- Singleplayer is therefore *online co-op with a local server and zero latency* — bots, generation
  streaming, saves, even the loading-plate flow are identical code paths ([03](03-networking.md) §2).
- A singleplayer expedition can be migrated to a hosted server later by exporting its world database
  ([10](10-persistence.md) §5).

## 6. Input System

- **Action map layer:** gameplay and UI consume *actions* (`move`, `look`, `attack`, `gadgetRadial`,
  `interact`, `uiAccept`, `uiNavX/Y`…), never raw events. Bindings map devices → actions; fully rebindable,
  persisted per profile.
- **Devices:** KB/M (pointer-lock mouselook) and **Gamepad API** (Xbox/XInput layout reference; others map
  through standard-gamepad remapping). Stick handling: radial dead zones, response curves, configurable
  ADS/look sensitivity.
- **Smart device detection:** the last device to produce meaningful input becomes *active*; all UI glyphs
  swap instantly ([01](01-art-direction.md) §3). Hot-swap mid-session is seamless; both devices can rest
  connected.
- **Touch (user-requested):** a third device class alongside KB/M and gamepad — an on-screen **virtual
  gamepad** (left virtual stick = move, right-zone drag = look, JUMP/SPRINT/CAM buttons) that appears on
  first touch (or `?touch=1`) and publishes into the same action map. Primarily a debugging/remote-test
  surface today; the path to real mobile support later. Native Bluetooth controllers on mobile already
  work via the standard Gamepad API path. Pointer lock stays a mouse-only concept.
- **UI navigation on gamepad:** every screen's focusable elements register in a **focus graph** (spatial
  neighbors + explicit overrides); left stick/d-pad walks the graph; shoulder keys switch tabs; gadget
  selection uses the radial menu ([06](06-gadgets.md) §6). Mouse users get the same screens with pointer
  interaction — one UI, two grammars.

## 7. Client Architecture

- **Render layer:** Three.js scene fed by the sim snapshot interpolator; PSX pipeline per
  [01](01-art-direction.md) §2 (low-res render target → post chain → nearest upscale). Materials support the
  two-tier fidelity model ([01](01-art-direction.md) §2.4–2.5): PS2-tier environment/prop meshes carry
  normal/height/AO/roughness map sets, N64-tier characters stay light — all under the same modern lighting.
  First-person camera with a smooth shift to third-person orbit (shoulder offset, collision-aware boom); both
  cameras share the same sim-side aim model so the swap is purely presentational.
- **Prediction:** local player movement + gadget traversal are predicted and reconciled
  ([03](03-networking.md) §4); everything else renders from interpolated authoritative snapshots.
- **UI:** HTML/CSS overlay (DOM) — free text layout/accessibility, styled to the retro spec, driven by the
  focus-graph for gamepad parity. **World-space UI** (nameplates, HP bars, damage numbers, markers) is
  projected from world space and drawn as a **native-res overlay outside the post chain** — never as in-scene
  sprites, which the internal-res downscale + dither would render illegible ([01](01-art-direction.md) §3.1;
  `Client/game/worldLabels.ts`, `combatFx.ts`).
- **Asset loading:** GLTF/PNG produced by `art-gen` at build time; areas reference kit pieces by id, so an
  area download is a compact descriptor, not geometry ([03](03-networking.md) §5).

## 8. Server Architecture

- Single Node process hosts N expeditions; each expedition owns its area islands, party state, and a
  world SQLite file ([10](10-persistence.md)). CPU scaling knob: expeditions per process.
- Subsystems: socket gateway (auth, session resume) → expedition manager → area islands (30 Hz, each with
  its Rapier world — §4.1) → generation service ([07](07-procgen.md), runs Director jobs off the hot path) →
  persistence writer (dedicated worker thread — §4.2, transactional checkpoints) → global chat bus
  (cross-lobby, [09](09-modes-social.md) §4).
- Bots are server-side clients: they submit the same action-map inputs through the same interface as
  players ([09](09-modes-social.md) §3).

## 9. Dev & Test Tooling

- `pnpm dev` — client + local headless server with hot reload; `pnpm dev:solo` — integrated-worker mode.
- **Sim tests** (Vitest): combat math, tag interactions, fill/solvability properties ([07](07-procgen.md) §8).
- **Bot soak harness:** headless expeditions run by bot parties at accelerated tick rate; asserts
  no-softlock (every generated Reach completed), perf budgets, and balance telemetry
  ([09](09-modes-social.md) §3.4).
- **Debug overlays:** area graph viewer, sphere/logic inspector, netgraph, ECS inspector — all behind a
  dev flag.

---

*Next: [03-networking.md](03-networking.md) — the wire.*
