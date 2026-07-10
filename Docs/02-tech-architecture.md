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
| Persistence | **better-sqlite3** (SQLite, WAL mode) | Synchronous, fast, single-file; schema in [10](10-persistence.md) |
| Transport | **WebSocket (`ws`)** behind a transport interface | See [03](03-networking.md) §1; WebRTC possible later without refactor |
| Physics | Custom kinematic character/projectile physics on the collision grid | Full rigid-body engine unnecessary; determinism and server cost win |
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

- **ECS:** dense typed-array component stores keyed by entity id; systems run in a fixed order each tick.
  Written renderer-free so the same code runs on server, Web Worker, and in client prediction.
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
- **UI navigation on gamepad:** every screen's focusable elements register in a **focus graph** (spatial
  neighbors + explicit overrides); left stick/d-pad walks the graph; shoulder keys switch tabs; gadget
  selection uses the radial menu ([06](06-gadgets.md) §6). Mouse users get the same screens with pointer
  interaction — one UI, two grammars.

## 7. Client Architecture

- **Render layer:** Three.js scene fed by the sim snapshot interpolator; PSX pipeline per
  [01](01-art-direction.md) §2 (low-res render target → post chain → nearest upscale). First-person camera
  with a smooth shift to third-person orbit (shoulder offset, collision-aware boom); both cameras share the
  same sim-side aim model so the swap is purely presentational.
- **Prediction:** local player movement + gadget traversal are predicted and reconciled
  ([03](03-networking.md) §4); everything else renders from interpolated authoritative snapshots.
- **UI:** HTML/CSS overlay (DOM) — free text layout/accessibility, styled to the retro spec, driven by the
  focus-graph for gamepad parity. In-world nameplates/damage numbers are canvas sprites in-scene.
- **Asset loading:** GLTF/PNG produced by `art-gen` at build time; areas reference kit pieces by id, so an
  area download is a compact descriptor, not geometry ([03](03-networking.md) §5).

## 8. Server Architecture

- Single Node process hosts N expeditions; each expedition owns its area islands, party state, and a
  world SQLite file ([10](10-persistence.md)). CPU scaling knob: expeditions per process.
- Subsystems: socket gateway (auth, session resume) → expedition manager → area islands (30 Hz) →
  generation service ([07](07-procgen.md), runs Director jobs off the hot path) → persistence writer
  (transactional checkpoints) → global chat bus (cross-lobby, [09](09-modes-social.md) §4).
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
