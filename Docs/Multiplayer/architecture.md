# Target Networking Architecture

PoE/MMO-inspired. Three tiers: **browser clients**, **regional directory services**, and **game service
instances**. This doc is the canonical description of the end-goal; [implementation-plan.md](implementation-plan.md)
sequences how we get there.

---

## 1. Tier responsibilities

### 1.1 Client (browser)

- Static single-page app (the Vite-built client). Ships no secrets.
- Boots to a **login page** with a **region dropdown**, auto-filled by querying a small set of REST
  endpoints listed in a local `.env` / env vars (e.g. a region-directory URL that returns
  `[{id:"us-west", name:"US West", api:"https://…", ping:…}, …]`). **The client is connected to nothing
  until the player authenticates.**
- After auth to a chosen **regional** service, the client shows the **server browser** and, on joining a
  world, opens a direct connection to that **game** service using a short-lived **join ticket** from the
  region.
- Renders + predicts gameplay exactly as today (the binary input-command protocol, [Docs/03](../03-networking.md)).

### 1.2 Regional directory service (one per region: `us-west`, `eu`, …)

The "true" dedicated entry point for a region. **Runs no game simulation.** Closed-source, cloud/hosted.
Responsibilities:

- **Accounts & auth** — a regional **account database** (maps to `meta.db`, [Docs/10 §2](../10-persistence.md)):
  accounts, characters, stash, currency. Login issues a session token.
- **Connection registry & login queue** — holds *all* active regional connections; when at capacity, new
  logins enter a **queue** rather than being rejected. Designed to scale asynchronously to **thousands** of
  accounts.
- **Global chat** — cross-lobby channels ([Docs/09 §4](../09-modes-social.md)); persisted regionally.
- **Ladders & leagues** — Standard + Seasonal, and a **separate "unofficial" ladder** for community servers
  ([Docs/09 §8](../09-modes-social.md)). League seeds live here.
- **Economy** — region-wide trade/economy metadata ([Docs/05](../05-items-loot-affixes.md)).
- **Party-finder / matchmaking** — "looking for players to join a party."
- **Server registry & browser backend** — the list of **official** and **community** game instances, their
  metadata (name, player count, ping target, last-activity, password-protected?), search/filter. Spawns and
  manages **official** game instances; accepts **registrations + heartbeats** from community instances.
- **Ticketing** — issues short-lived, signed **join tickets** the game service validates, so the game
  service never has to trust the client's identity claims.

### 1.3 Game service instance (the `GameHost` we already run)

- Authoritative per-world simulation, **one party of ≤5** + **non-party Sanctum visitors** up to a
  **~16-connection cap** (Docs/09 §12, [Docs/03 §8](../03-networking.md)) — every connection, visitors
  included, runs in the 30 Hz physics sim. World generation and building ([Docs/07](../07-procgen.md)). Owns
  one **`world-<id>.db`** ([Docs/10 §3](../10-persistence.md)).
- **Official** — spawned and lifecycle-managed by the regional service (on official cloud/hosting).
- **Community (unofficial)** — privately operated: a public IP+port, or a hosted endpoint. Optionally
  **password-protected**. **Registers** itself with a regional service to appear in the Community list, and
  **heartbeats**; if **no one accesses it for a week it shuts down** and is delisted until manually
  restarted.
- **Realm binding** — a character is bound to **official** *or* **unofficial** and cannot cross that
  boundary; each realm has its own ladder.
- **Non-party visitors & governance** — connectors who aren't accepted party members join Sanctum-confined
  (Docs/09 §9), governed by party vote (Docs/09 §10). The party (≤5) plus these visitors share the cap.
- **Durable write-back** — the game service commits progression/inventory/world/gravemark changes **as they
  happen** to the regional service (official realms) or its own DB (community/offline), never only at sleep
  (§5, Docs/09 §12, [Docs/10 §4](../10-persistence.md)). **Seat reservations** for sleeping members live on
  the regional service and hold the world open (default ~7 days).

---

## 2. Login & join flow

```
launch → LOGIN PAGE (region dropdown from .env REST endpoints)   ← connected to nothing yet
   │  authenticate to chosen REGIONAL service
   ▼
REGIONAL session (account/characters, chat, ladder, party-finder)
   │  open SERVER BROWSER
   ▼
SERVER BROWSER  ── tabs: [Official] [Community] ──
   filter/search by: name · ping · last-activity · password-protected
   choose a server  |  create/enter a custom private server (name + optional password)
   │  regional issues a signed JOIN TICKET for that game instance
   ▼
GAME service (direct ws) — validates ticket → play (≤5)
```

- **Region selection** happens before auth; the dropdown is data-driven from `.env` so local dev can list
  `localhost` regions and production can list hosted ones.
- **Community servers** can be created ad-hoc (name + optional password) or pre-registered.

## 3. Connection lifecycle & the disconnect cascade

- A client holds **two** logical connections: one to the **regional** service (control/social plane) and,
  while in a world, one to a **game** service (gameplay plane).
- **Disconnecting from the regional service auto-disconnects from the game service**, and the player must
  **re-authenticate from the login screen**. (The regional session is the root of trust; losing it drops
  everything.)
- Game-service disconnects alone (e.g. leaving a world) return the player to the regional server's browser
  without re-auth.

## 4. Protocols & trust boundaries

| Link | Transport | Purpose |
|---|---|---|
| Client ↔ Regional | HTTPS REST + a control WebSocket | region list, auth, account/characters, chat (`#`/`$`/`@`), ladder, party-finder, server browser, ticket issuance, **seat reservations** |
| Client ↔ Game | Binary WebSocket (existing, [Docs/03](../03-networking.md)) | the input-command gameplay protocol + world/party chat (`>`/`%`); opens with a **join ticket** |
| Regional ↔ Game | HTTPS/WebSocket (server-to-server) | official-instance spawn/manage; community-instance **register + heartbeat**; ticket validation; player-count/last-activity; **continuous progression write-back** (§5); reservation sync |

**Chat channel tiering** (Docs/09 §11): the **regional** service relays region-wide **`#` global**, **`$`
trade** (Sanctum-only), and **`@` private** (account-addressed, region-wide); the **game** service relays
**`>` world** (whole game server, incl. Sanctum visitors) and **`%` party**.

**Trust:** the regional service authenticates players and signs join tickets (short TTL, bound to a world +
account + realm). The game service validates the ticket signature and never trusts client identity claims —
consistent with the existing input-command, server-authoritative model. Community game servers validate
tickets against the regional service they registered with (and enforce their own password if set).

## 5. Data ownership (maps onto the two-DB design)

| Data | Owner | Store |
|---|---|---|
| Accounts, characters, stash, currency, leagues, ladder, chat, meta-unlocks | **Regional** | `meta.db` ([Docs/10 §2](../10-persistence.md)) |
| **Seat reservations** (which account/character reserves a seat in which world, awake/sleeping, expiry) | **Regional** | `meta.db` `reservations` ([Docs/10 §2](../10-persistence.md)) |
| One generated world/expedition (areas, gadgets, gravemarks, party resume state) | **Game** | `world-<id>.db` ([Docs/10 §3](../10-persistence.md)) |
| Server registry (official + community listings, heartbeats, player counts) | **Regional** | regional DB table |

Official worlds' `world-*.db` may live with the game instances the region spawns; community worlds' DBs live
with the operator. Character *records* are always regional.

**Continuous, durable write-back (not just at exit).** A **join ticket** carries the character snapshot the
game service needs; from then on the game service is authoritative *for the session* but **commits every
progression/inventory/world/gravemark change back to the durable record as it happens** — to the regional
`meta.db` for **official** realms, or the game server's own DB for **community/offline** realms
([Docs/10 §4](../10-persistence.md), Docs/09 §12). This is a hard requirement, not a hardening nicety: a
disconnect or a private-operator-forced rollback must never erase or let someone exploit-undo banked work.
Write-back is **idempotent** (monotonic per-character event version) so retries can't dupe. **Sleep** flushes
full state and takes a **seat reservation** on the regional service.

## 6. Official vs. Community (summary)

| | Official | Community (unofficial) |
|---|---|---|
| Operated by | Regional service (cloud/hosting) | Anyone (public IP+port or hosted) |
| Browser tab | **Official** | **Community** |
| Password | No | Optional |
| Ladder / characters | Official realm | Unofficial realm (separate ladder); **cannot cross** |
| Lifecycle | Region-managed | Auto-shutdown after **1 week** idle; manual restart to relist |
| Trust | Fully region-controlled | Registers + heartbeats to a region; region-issued tickets |

## 7. Relationship to the current build

Everything in Tier 3 (game service) exists today as the `GameHost` (M2–M3). Tiers 1–2 (regional service,
login, server browser, ladders, chat, accounts) are the design docs' **M8** social layer plus **post-slice**
leagues/economy — this doc just names the boundaries precisely and adds the official/community split,
ticketing, region selection, and server lifecycle. Nothing here changes M4–M7 (single-world gameplay), which
proceed against a game service directly.
