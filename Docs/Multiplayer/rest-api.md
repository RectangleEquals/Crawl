# REST APIs — Read-Only Data Plane

A design rule for the whole network: **every non-performance-critical, non-secret piece of structural or
database information is pullable over a read-only REST API.** This lets services *and* external tools (a
status page, a ladder/economy site, a character viewer) fetch what they need asynchronously, on a separate
protocol that never interrupts or slows the realtime gameplay/control path.

## Principles

1. **Read-only.** `GET` only. Any other method returns `405`. **Writes never happen over REST** — they
   occur inside the running service (the sim tick, the control-plane WS, internal jobs).
2. **No secrets.** Passwords, auth hashes, ticket-signing secrets, and session tokens are never exposed.
   "Public" account/character info only.
3. **Non-time-critical only.** Realtime gameplay stays on the binary WebSocket ([Docs/03](../03-networking.md)).
   REST is for structural/status/aggregate data that can tolerate a couple seconds of caching.
4. **CORS-open + cached.** `Access-Control-Allow-Origin: *` and a short `Cache-Control` so browsers and
   external dashboards can read directly.
5. **Two services, two concerns** — the **regional** service exposes region/account/ladder/registry data;
   each **game** service exposes its own world/status. They never reach into each other's databases; a
   consumer that wants both calls both.

## Regional service API (`Private/`)

Base: the regional service's HTTP port (dev `http://localhost:7000`). Implemented in `Private/src/rest.ts`.

| Method + path | Returns |
|---|---|
| `GET /api/health` | `{ status, region, version, uptimeSec }` |
| `GET /api/region` | region info + `{ online, servers }` counts |
| `GET /api/servers?tab=official\|community&q=&password=0\|1` | server-browser listings (filterable by name/kind/password) |
| `GET /api/servers/:id` | one game server's public info |
| `GET /api/leagues` | Standard/Seasonal leagues (official & unofficial realms) |
| `GET /api/ladder/:leagueId` | top ladder entries for a league |
| `GET /api/accounts/:id` | public account info (**no** email/hash) |
| `GET /api/characters/:id` | public character info (name, class, level, realm, league) |

Owns `meta.db` ([Docs/10 §2](../10-persistence.md)). The **server registry** rows it serves are written by
game services over the **control-plane WebSocket** (register/heartbeat), never via REST
([architecture.md](architecture.md) §4).

## Game service API (`Public/Server/`)

Base: `CRAWLSTAR_REST_PORT` (defaults to the ws port + 1, i.e. dev `http://localhost:8788`). Implemented in
`Public/Server/src/rest.ts`, backed by `GameHost.publicInfo()`. **Live now.**

| Method + path | Returns |
|---|---|
| `GET /api/health` | `{ status, tick, uptimeSec }` |
| `GET /api/status` | `{ tick, uptimeSec, players, areas }` |
| `GET /api/world` | per-area occupancy: `[{ id, name, players, enemies, allies }]` |
| `GET /api/players` | public roster: `[{ id, name, area, kind }]` |

`GameHost.publicInfo()` is a cheap read over current state, called on demand — off the 30 Hz tick loop, so
REST traffic can't affect gameplay.

## Example consumers

- **Status page / server browser:** poll regional `GET /api/servers` + `GET /api/region`; optionally
  cross-reference a community server's own `GET /api/world` for live occupancy.
- **Ladder / economy site:** regional `GET /api/leagues` + `GET /api/ladder/:id` + `GET /api/characters/:id`.
- **The game client's server browser** (Phase 2) is itself just a consumer of regional `GET /api/servers`.

## Not exposed over REST (by rule)

Auth (login/token issuance), join-ticket issuance, chat delivery, party-finding, world generation, and any
realtime gameplay — these are the **control-plane WS** and **game ws** responsibilities, and all **writes**.
See [architecture.md](architecture.md) §4.
