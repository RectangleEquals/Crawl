# Hosting a Server

"Hosting" means running a **game service** — a Tier-3 world server ([architecture.md](architecture.md)). In
the end-goal it registers with a **regional** service and appears in the **Community** tab of the server
browser; **today**, before the regional tier exists, you connect clients to it directly.

> ⚠ **Security.** A game server is **unauthenticated** until join-tickets land ([implementation-plan.md](implementation-plan.md)
> Phase 2). Anyone with the address can join. Fine for a scheduled session with friends; **close port
> forwards / re-enable the firewall afterward** and don't leave it exposed unattended.

---

## Today (interim) — direct connect

### Path A: works right now, no code

```sh
pnpm dev:online        # game service (ws :8787) + client host (Vite :5173)
```

1. Add your DDNS host to the **gitignored** `Client/.env.local`:
   `CRAWLSTAR_ALLOWED_HOST=your.ddns.hostname`, then restart `pnpm dev`.
2. Forward **5173/TCP** (client page) and **8787/TCP** (game ws) to this PC.
3. Share `http://your.ddns.hostname:5173/?name=HostName`. Friends open it with their own `?name=`
   ([joining.md](joining.md)); their client auto-connects to `ws://your.ddns.hostname:8787` and everyone
   lands in the same Sunken Nave.

Caveat: dev build (unminified, source maps), two ports.

### Path B (optional, ~1–2 days — Phase 1): dedicated one-port server

After the [Phase 1](implementation-plan.md) packaging (Node serves the built client + ws on one port), share
**one** URL and forward **one** port:

```sh
pnpm serve             # build client → run dedicated game server (client + ws, one port)
# → http://your.host:8080/?name=HostName
```

No Vite, no source maps, no hostname allowlist. Add an optional **room-code/password** and **player cap** at
this phase.

### Tuning the session (both paths)

Server env vars shape the whole session:

```sh
CRAWLSTAR_BOTS=0 CRAWLSTAR_ENEMIES=6 CRAWLSTAR_CD_SCALE=2 pnpm dev:server
```

`CRAWLSTAR_BOTS` ally bots (default 1) · `CRAWLSTAR_ENEMIES` pack size (default 4) · `CRAWLSTAR_CD_SCALE`
enemy/ally attack-cooldown multiplier (default 1; higher = calmer). Per-player URL: `?name=` · `?rtt=150` ·
`?lowfx=1`.

---

## Target — a Community server (Phase 2+)

Once the regional tier exists, running a **community** server means:

1. Start a game service with a **name** and optional **password**, pointed at a **regional** service to
   **register** with (from your `.env`).
2. It appears in the browser's **Community** tab, searchable by name/ping/last-activity/password, alongside
   region-run **Official** servers.
3. It **heartbeats** to the region; if **nobody joins for a week it auto-shuts-down** and is delisted —
   restart it manually to relist.
4. Characters played on community servers are **unofficial-realm** (separate ladder) and never mix with
   official characters ([architecture.md](architecture.md) §6).

Hosting options for community servers (all free-tier viable): a home box exposed via **Cloudflare Tunnel**
(TLS, no port-forwarding), or a small free VM — see [deployment.md](deployment.md).

## Stopping / cleanup

Stop the process(es) and **remove port forwards**. Orphaned Windows dev process holding a port:

```powershell
Get-NetTCPConnection -LocalPort 5173,8787 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
