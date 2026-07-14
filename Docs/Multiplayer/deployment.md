# Deployment — Local, Free, and (eventually) Paid

How to run the [three tiers](architecture.md) in each environment. Priority order matches the owner's
constraints: **local dev first**, **free hosting** next, **paid cloud** only as an endgame scaling step.

## Tier hosting characteristics (why it matters)

| Tier | Shape | Hosting implication |
|---|---|---|
| **Client** | Static SPA (Vite build) | Trivial & free anywhere (Pages/CDN). Its `https`/`http` origin drives the `wss`/`ws` requirement below. |
| **Regional service** | Long-lived, **stateful** (holds connections, queue, chat, registry) + DB | Needs an **always-on process**. **Serverless (Vercel/Netlify functions) is a poor fit** — short-lived, no durable WebSockets. Wants a small VM/container or a stateful edge runtime. |
| **Game service** | Long-lived, **stateful** ws sim (≤5) | Same always-on need; can be self-hosted (home box) or a small VM/on-demand container. |
| **Databases** | `meta.db` (regional), `world.db` (game) | SQLite locally; a free managed DB (or SQLite-on-VM / libSQL) when hosted. |

### The one real gotcha: `https` client ↔ `ws` server (mixed content)

Browsers block `ws://` from an `https://` page. So either:
- serve the client over **plain `http`** from the **same origin** as the server (Phase-1 single-port, no TLS
  needed — fine for dev and casual community servers), **or**
- put the servers behind **TLS** (`wss://`) so an `https` client can reach them. Easiest free TLS:
  **Cloudflare Tunnel** (exposes a home/VM server at an `https`/`wss` hostname with certs, **no port
  forwarding**), or a reverse proxy (Caddy auto-HTTPS) on a VM.

The client already picks `wss` automatically when the page is `https` (planned same-origin default), so the
only work is giving the servers TLS when the client is hosted over `https`.

---

## Environment 1 — Local dev (always supported, preferred now)

Everything on one PC; the region dropdown lists `localhost`.

```
Client (Vite :5173 or single-port)  →  Regional service (Node + SQLite meta.db, :7000)
                                          │ spawns / registers
                                          ▼
                                       Game service(s) (Node ws, :8787…)
```

- `.env` (client): `CRAWLSTAR_REGIONS=[{"id":"local","name":"Local Dev","api":"http://localhost:7000"}]`
  (or a single `CRAWLSTAR_REGION_API=http://localhost:7000`). All `http`/`ws` — no TLS, no mixed content.
- Regional service and game services run as local Node processes; game instances register with the local
  region. This is the **Phase 2** target and needs no internet at all.
- Today (pre-regional), you skip the region tier and connect a client straight to a game service
  ([hosting.md](hosting.md) §A).

## Environment 2 — Free hosting (middle-ground for real testing)

Free-tier-friendly split (no spend), honest tradeoffs:

| Tier | Free options | Notes |
|---|---|---|
| **Client (static)** | **Cloudflare Pages**, Netlify, GitHub Pages, Vercel (static) | All free & easy. Serves the SPA over `https` → servers then need `wss`. |
| **Regional service** | **Oracle Cloud Always-Free VM** (best: genuinely always-on), **Fly.io** (small free allowance), Cloudflare **Workers + Durable Objects** (stateful, free tier — different runtime, would need a port). Avoid free hosts that **spin down on idle** (Render free) for the *directory* — it must stay up. | Long-lived Node process. |
| **Game service** | Same VM/Fly.io, **or self-host from home via Cloudflare Tunnel** (free TLS, no port-forward). On-idle spin-down is *acceptable* here (worlds are ephemeral). | Community servers are exactly this. |
| **Database** | **Turso** (libSQL — SQLite-compatible, matches our SQLite plan), **Supabase**/**Neon** (Postgres), or SQLite on the VM. **Back4app** (Parse BaaS) could back accounts. | Regional `meta.db` first; per-world DBs can stay with each game instance. |

**Recommended free stack:** client on **Cloudflare Pages**; regional service on an **Oracle Always-Free VM**
(or Fly.io) with **Turso**; game instances on the same VM and/or self-hosted at home behind **Cloudflare
Tunnel** for TLS. This gives a real, internet-reachable, `$0` deployment of all three tiers.

## Environment 3 — Paid cloud (endgame scaling only)

When free tiers are outgrown: containerized official game instances with **dynamic spawn/autoscale**
(AWS ECS/Fargate, GCP Cloud Run/GKE, or Fly Machines), a **multi-node regional cluster**, **managed
Postgres**, object storage for world snapshots, and CDN for the client. Add per-region deployments for real
latency. This is Phase 5 — introduce only with demand/monetization.

## Config: pointing the client at regions

The client learns regions from env/`.env` so the *same build* works locally and in production:

```
# examples (final key names TBD in Phase 2)
CRAWLSTAR_REGIONS=[
  {"id":"local","name":"Local Dev","api":"http://localhost:7000"},
  {"id":"us-west","name":"US West","api":"https://usw.crawlstar.example"}
]
```

- Dev builds list `localhost`; production builds list hosted regionals.
- The regional `api` serves the REST region-info + auth endpoints and the control WebSocket; it returns the
  **server browser** data and issues **join tickets** to game services.

## What runs where — quick reference

| | Local dev | Free hosting | Paid cloud |
|---|---|---|---|
| Client | Vite / single-port (`http`) | Cloudflare Pages (`https`) | CDN |
| Regional | Node + SQLite on PC | Oracle/Fly VM + Turso | Managed cluster + Postgres |
| Game (official) | Node child processes | VM instances | Orchestrated containers |
| Game (community) | Node on PC | Self-host + Cloudflare Tunnel | (same, or hosted) |
| TLS | none (`http`/`ws`) | Cloudflare Tunnel / Caddy (`wss`) | managed certs |
