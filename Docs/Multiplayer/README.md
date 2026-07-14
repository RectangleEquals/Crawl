# Multiplayer & Networking

The end-goal is a **PoE/MMO-style two-tier server model** with browser clients. This folder captures that
target architecture, how it phases against the [roadmap](../11-roadmap.md), how to deploy it (local-first,
free-hosting-friendly), and how to host/join sessions today while it's still being built.

## The three tiers (end-goal)

```
                       ┌──────────────────────────────────────────────────────────┐
   BROWSER CLIENT ───► │  REGIONAL DIRECTORY SERVICE  (one per region: US-W, EU…)  │
   (static SPA:        │  closed-source · cloud/hosted · NO gameplay sim           │
    login → region →   │  accounts+auth · login queue · global chat · ladders/     │
    server browser)    │  leagues · economy · party-finder · SERVER REGISTRY       │
        │              └───────────────┬──────────────────────────────────────────┘
        │   join ticket                │ spawns/registers/heartbeats
        ▼                              ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  GAME SERVICE INSTANCE  (authoritative per-world sim, ≤5 players/bots)         │
   │  the GameHost we already run · world-gen · official OR private(community)      │
   └──────────────────────────────────────────────────────────────────────────────┘
```

- **Client** — a browser. Boots to a **login page with a region dropdown** (endpoints from a local `.env`);
  it isn't connected to anything until the player authenticates to a chosen **regional** service.
- **Regional directory service** — the "true" entry point for a whole region. Holds **all active
  connections**, an account database, a **login queue** when full, global (cross-lobby) chat, the
  Standard/Seasonal **ladders & leagues**, the economy, party-finding, and the **server registry/browser**.
  It runs **no game simulation**; it spawns/lists game instances and hands players tickets to them. Built to
  scale asynchronously to thousands of accounts.
- **Game service instance** — an authoritative per-world gameplay server (≤5 players + bots) — exactly the
  `GameHost` we run today. **Official** instances are spawned/managed by the regional service; **community**
  instances are privately operated (public IP+port or a hosted endpoint), can set a password, and idle-timeout
  after a week. Characters are bound to **official** *or* **unofficial** and never cross; each has its own
  ladder.

Full detail: **[architecture.md](architecture.md)**.

## Where we are vs. the goal

| Tier | Status |
|---|---|
| **Game service** | **Built** (M2–M3): authoritative sim, multi-client, prediction/reconciliation, combat. This *is* the bottom tier. |
| **Regional directory service** | Not started — maps to roadmap **M8** (lobbies/social) + **post-slice** (leagues/ladder/economy/accounts). |
| **Login / region select / server browser (client)** | Not started — **M8** client UI. |

The persistence design already splits along the tier boundary: **`meta.db`** (accounts, characters, stash,
leagues, ladder, chat — [Docs/10 §2](../10-persistence.md)) belongs to the **regional** service;
**`world-<id>.db`** (one per expedition — [Docs/10 §3](../10-persistence.md)) belongs to the **game**
service. So this architecture is a *formalization* of the existing plan, not a pivot.

## Documents

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | The full target: tier responsibilities, protocols, data ownership, official/community, character binding, server lifecycle, login/browser flow |
| [rest-api.md](rest-api.md) | The read-only REST data plane for both services (game service is **live now**); the "writes never over REST, no secrets" rule + endpoint tables |
| [implementation-plan.md](implementation-plan.md) | Phased build plan (Phase 0 → 5) and how each phase maps to the roadmap (nothing here derails M4–M7) |
| [deployment.md](deployment.md) | Running it **locally** (preferred now) and later on **free** hosting, with the paid-cloud endgame; the `http`/`wss` constraint and free-tier analysis |
| [hosting.md](hosting.md) | Practical: run a game/community server today and (target) how it registers to a region |
| [joining.md](joining.md) | Practical: the target login → region → browser → join flow, and the direct-URL interim you can use right now |

## Guiding constraints (from the project owner)

- **Local dev must always work** end-to-end on one PC (no cloud required to develop or play).
- **Free / no-spend preferred now**; free-scalable + middle-ground hosting later; paid cloud only as an
  endgame scaling/monetization step.
- This is **infrastructure**, sequenced to *not* block single-world gameplay milestones (M4–M7). See
  [implementation-plan.md](implementation-plan.md) §Roadmap alignment.
