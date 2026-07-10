# 03 — Networking & Sessions

> Server-authoritative everything; the client is a beautiful, predictive liar.

Related: [02-tech-architecture.md](02-tech-architecture.md) (deployment shapes),
[07-procgen.md](07-procgen.md) (what gets generated), [09-modes-social.md](09-modes-social.md) (lobbies).

---

## 1. Transport

- **WebSocket** (`ws`), one connection per client, binary frames. TLS in production.
- All send/receive goes through a **`Transport` interface**; implementations: `WsTransport` (online) and
  `ChannelTransport` (MessageChannel to the singleplayer Web Worker — [02](02-tech-architecture.md) §5).
  A future WebRTC DataChannel implementation slots in without touching game code.
- TCP head-of-line blocking is acceptable for ≤5-player PvE at 30 Hz snapshot rates; mitigations: small
  frames, delta compression, and client interpolation buffering (§4).

## 2. Message Layer

- Schemas defined in `Shared/protocol/` as typed message descriptors; compiled encoders write compact
  binary (varint ids, bit-packed quantized fields). A JSON debug encoding is switchable for development.
- Every message: `[u8 channelTag][varint msgId][payload]`. Channels: `control`, `input`, `snapshot`,
  `event`, `bulk` (generation/asset descriptors), `chat`.
- **Versioning:** protocol hash = hash of all schema definitions; mismatch at handshake ⇒ client prompted
  to refresh (web client, so upgrade friction is one reload).

## 3. Tick & Snapshot Model

- Server sim ticks at **30 Hz** per area island ([02](02-tech-architecture.md) §4).
- **Client → server:** input commands (action-map state, aim vector, tick stamp), sent per tick, redundantly
  bundled (last 3) to ride out loss-adjacent TCP stalls.
- **Server → client:** per-island **delta snapshots** at 30 Hz against the last acked baseline: entity
  create/destroy, changed components (position/velocity quantized: pos 1/256 m, yaw 1/1024 turn), plus
  reliable **events** (damage numbers, loot drops, tag procs, boss phase cues).
- **Interest management:** a client receives only its current area island's snapshot stream (plus party
  status summaries from elsewhere). Area handoff swaps streams (§5).

## 4. Latency Model

- **Local prediction:** the client simulates its own movement/dodge/gadget-traversal with the shared sim
  code, tags each input with its tick, and **reconciles** on authoritative snapshots (rewind + replay of
  unacked inputs). Mispredictions smooth over ~100 ms rather than snapping.
- **Remote entities:** rendered from snapshots with **~100 ms interpolation delay**; extrapolation capped
  at 50 ms during stalls.
- **Hit validation:** melee/hitscan resolved server-side with **lag compensation** — the server rewinds
  hitboxes up to 150 ms to the attacker's tick-stamped view. Projectiles fly authoritatively; the client
  spawns a cosmetic twin immediately and reconciles/despawns against the authoritative one.
- **Ability activation:** client plays windup instantly (animation + sfx); server confirms effect. Combat
  pacing ([00](00-vision.md) §5) is windup-heavy, which hides round-trips gracefully — a design/netcode
  synergy, not an accident.

## 5. Generation & Area Streaming Protocol

Generation is **client-requested, server-executed, streamed back** (user-mandated;
[07-procgen.md](07-procgen.md) §7):

```
 client                                  server
   │ ── InteractRequest(obelisk|door) ──►│  validate (Omens confirmed? gate rules met?)
   │                                     │  Director job → generate/load area(s)
   │ ◄─────── TransitionBegin ────────── │  (client shows loading plate, 01 §2.3)
   │ ◄──── AreaDescriptor (bulk) ─────── │  compact deterministic descriptor:
   │         · layout: kit-piece placements (ids + grid transforms)
   │         · logic: gates, locks, interactables, nav data refs
   │         · population: spawn records (enemy/loot/shrine seeds)
   │  client reconstructs geometry locally from kit ids (02 §7)
   │ ── TransitionReady ───────────────► │
   │ ◄──── SnapshotBaseline + go ─────── │  island stream swaps to the new area
```

- Descriptors are **deterministic**: kit ids + seeds, never raw meshes — a whole area is typically a few
  KB. The same descriptor format is what's persisted ([10-persistence.md](10-persistence.md) §3).
- Party members transition an area boundary together when the leader (or vote, [09](09-modes-social.md) §2)
  confirms; the server pre-warms the destination island so the plate time is dominated by client-side
  reconstruction, not generation.
- The **Waymark Obelisk** flow is the same protocol with a prologue: Omen offer → party confirm → whole-Reach
  Director job scheduled ([09](09-modes-social.md) §5); the first area's descriptor streams while the rest
  of the Reach generates in the background within the horizon rules ([07](07-procgen.md) §7).

## 6. Session & Lobby Flows

- **Handshake:** version check → account auth (token) → character select → resume or create expedition.
- **Party lifecycle:** create (private/public) → invite/join (Sanctum lobby) → embark. Mid-run joins attach
  at the last Sanctum checkpoint; a joiner walks/waygates forward to the party.
- **Sleep (save & quit):** party votes at a Sanctum; server checkpoints expedition + characters
  ([10](10-persistence.md) §4) and parks the expedition. Resume restores party, area states, and gravemarks.
- **Disconnects:** grace window (60 s) with the character server-simulated as safely idle (bots can cover,
  [09](09-modes-social.md) §3); reconnect resumes the session mid-area. Past the window, the character is
  parked at the last Sanctum checkpoint.
- **Global chat:** cross-lobby channel bus on the server cluster; delivered on the `chat` channel;
  moderated/persisted per [10](10-persistence.md) §2 and readable at any Sanctum
  ([09](09-modes-social.md) §4).

## 7. Trust & Anti-Cheat Posture

- The server validates everything that matters: movement envelopes (speed/accel/teleport sanity, gadget
  capability checks against actually-owned Instruments), ability cooldowns/resources, loot rolls, trade
  atomicity, Omen mandatory-pick rules.
- Clients never receive undiscovered-secret data (hidden rooms ship in descriptors only once revealed —
  map-hack resistance within reason for a co-op PvE game).
- Singleplayer integrated-server runs the same validation (cheating yourself offline is shrug-tier, but
  code parity is free); ladder-eligible play ([09](09-modes-social.md) §8, seasonal) requires hosted
  servers.

---

*Next: [04-classes-progression.md](04-classes-progression.md) — the six who crawl.*
