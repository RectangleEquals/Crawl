# Implementation Plan & Roadmap Alignment

How we get from today's single game service to the full [architecture.md](architecture.md), in phases that
**do not block single-world gameplay (M4–M7)** and stay **local-first / free-hosting-friendly**.

## Guiding principles

- **Local dev always works** — every phase runs end-to-end on one PC with no cloud.
- **Ship the bottom tier first** (it exists), add the regional tier incrementally.
- **Don't build cloud orchestration early.** Prove the model locally; host on free tiers; pay only to scale.
- Reuse the planned **two-DB split** ([Docs/10](../10-persistence.md)): `meta.db` → regional, `world.db` →
  game.

## Phases

### Phase 0 — Today (done)
Single authoritative **game service** (`GameHost`), multi-client, direct browser connect. Friends can test
together right now via [hosting.md](hosting.md) §A. No accounts, one shared world.

### Phase 1 — Dedicated game service, one URL *(small, near-term; optional)*
Serve the built client + game ws from **one port** so a community server is one URL to share; add a
join-by-**room-code/password** and an optional **player cap**. ~1–2 days. Pure packaging on the existing game
service; no regional tier yet. (This is the "dedicated server" ask from the previous docs, now framed as
Tier-3 packaging.)

### Phase 2 — Local regional directory service (MVP) *(the big step; = M8 core)*
A new **Regional service** process (Node + SQLite `meta.db`) running on the dev PC:
- Accounts + auth (email/pass hashed) → session token; **login page + region dropdown** on the client
  (regions from `.env`, pointing at `localhost` in dev).
- **Server registry**: game services **register + heartbeat**; **server browser** UI with
  **Official/Community** tabs and filters (name, ping, last-activity, password).
- **Join tickets**: region signs a ticket; game service validates it (server-to-server or shared secret).
- **Disconnect cascade** + re-auth; official/unofficial **realm** flag on characters.
- Global **chat** relay.
Game services are launched locally (in-process or child processes) and register with the local region. This
delivers the whole flow — login → region → browser → join — on one machine.

### Phase 3 — Ladders, leagues, economy, party-finder *(= post-slice)*
Move the social/economy systems onto the regional service: Standard/Seasonal + unofficial ladders, league
seeds, trade/economy, party-finder. Character stash/XP write-back on world exit. Aligns with
[Docs/09 §8](../09-modes-social.md) / [Docs/10 §6](../10-persistence.md).

### Phase 4 — Free-hosting deployment
Deploy: static **client** (Cloudflare Pages / Netlify — free), one **regional** service on a free
always-on host (Oracle Always-Free VM / Fly.io) with a free DB (Turso/Supabase), and a **game** instance or
two. Community servers can self-host from home via a tunnel (TLS, no port-forwarding). See
[deployment.md](deployment.md).

### Phase 5 — Official-instance orchestration & scale *(paid-cloud endgame)*
Dynamic spawning/autoscaling of official game instances (containers), multi-node regional cluster, managed
Postgres, monetization. Only when demand justifies spend.

## Roadmap alignment

| Architecture piece | Roadmap home | Notes |
|---|---|---|
| Game service (Tier 3) | **M2–M9** | Already built/expanding; unaffected by this doc |
| Single-port packaging, room-code (Phase 1) | infra side-task | Optional, near-term; doesn't touch gameplay |
| Regional service, login, region select, server browser, tickets, realms (Phase 2) | **M8** (lobbies/social) | This *is* M8, now specified concretely |
| Ladders/leagues/economy/party-finder (Phase 3) | **post-slice** | Matches [Docs/11](../11-roadmap.md) deferral |
| Free-hosting deploy (Phase 4) | infra, parallel to M8+ | Can start once Phase 2 exists |
| Orchestration/scale (Phase 5) | post-launch | Paid, endgame |

**M4–M7 are unblocked:** they build single-world gameplay against a game service directly. The regional tier
can be prototyped anytime (Phase 2) but is only *required* for the social/league features (M8+). Recommended
sequencing: keep doing M4–M7; slot Phase 1 whenever a cleaner shareable server is wanted; do Phase 2 as the
concrete plan for M8.

## Security & correctness to carry forward

- Region-signed **join tickets** (short TTL, bound to account+world+realm); game service validates, never
  trusts client identity — extends the existing server-authoritative posture.
- **Realm isolation**: official vs unofficial characters never mix; enforced at ticket issuance.
- **Community trust**: community servers are semi-trusted — the region gates *listing* and *ticketing*, but a
  malicious operator controls their own world; keep official and community ladders separate (already the
  design).
- **Write-back integrity** (stash/XP from game → regional) needs idempotency/anti-dupe — a Phase-3 hardening
  item.
- Community-server **1-week idle shutdown** + delist; manual restart to relist.

## Explicitly deferred

Cloud orchestration, autoscaling, managed multi-region replication, payments/monetization, and anti-cheat
beyond the current input-command model — all **Phase 5 / post-launch**.
