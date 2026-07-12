# CrawlStar

> *An ancient star-engine fell from heaven — and then it crawled.*

Browser-native co-op (1–5 players + bots) PSX-styled procedural metroidvania ARPG looter.
**The full design bible lives in [Docs/](Docs/README.md)** — start there. Build order: [Docs/11-roadmap.md](Docs/11-roadmap.md).

## Repository layout

| Package | Purpose |
|---|---|
| [Client/](Client/) | Three.js app: PSX-modern renderer, input, UI, prediction |
| [Server/](Server/) | Headless Node: authoritative sim, sockets, SQLite (comes online in M2) |
| [Shared/](Shared/) | The game itself — deterministic, renderer-free: math/RNG, art generators, (later) ECS sim, procgen, protocol |
| [Docs/](Docs/) | Design documentation suite |

## Development

Requires Node ≥ 20 and [pnpm](https://pnpm.io) (`npm i -g pnpm`).

```sh
pnpm install        # once
pnpm dev            # M1 viewer: generated Sunken Parish chamber + fly-cam (http://localhost:5173)
pnpm test           # unit tests (determinism, conversions)
pnpm typecheck      # strict TS across all packages
pnpm build          # production build
```

### Running M2 (the Wire)

```sh
pnpm dev            # client only → auto-falls back to SOLO (integrated worker server + bot)
pnpm dev:online     # headless server (ws://localhost:8787) + client together
```

URL parameters: `?mode=solo|online` · `?name=YourName` · `?rtt=150` (simulated latency) ·
`?touch=1` (force the virtual gamepad) · `?lowfx=1` (skip volumetrics — headless/perf testing) ·
`?server=ws://host:8787` (explicit server).

**Combat tuning knobs** (great for testing abilities in isolation):
- **Solo** (`pnpm dev`, integrated worker): `?bots=0` (fight without an ally) · `?enemies=2` (smaller
  pack) · `?cdscale=3` (enemies/allies attack 3× less often). E.g.
  `http://localhost:5173/?mode=solo&bots=0&enemies=2&cdscale=3`.
- **Online** (`pnpm dev:online`): the same knobs as server env vars —
  `CRAWLSTAR_BOTS=0 CRAWLSTAR_ENEMIES=2 CRAWLSTAR_CD_SCALE=3 pnpm dev:server` (then run `pnpm dev`
  separately, or set them before `pnpm dev:online`).

**Warden combat:** LMB strike · RMB block (builds Bulwark + mitigates frontal hits) · Q ward wall ·
E shield-slam (applies Launch) · F ground-slam (consumes Launch for bonus AoE). Bulwark also builds
from taking hits — block a big swing to charge fast, then spend it on abilities.

**Controls:** click to capture the mouse — **WASD** move · **Space** jump · **Shift** sprint ·
**V** first/third person · **1/2/3** internal resolution · **Esc** release. Gamepads (Xbox layout)
hot-swap automatically: left stick move, right stick look, **A** jump, **LB/L3** sprint, **Y** camera.
Touch devices get an on-screen virtual gamepad automatically.

### Remote playtesting (tablet/phone)

The dev server listens on all interfaces. To allow a DNS hostname (e.g. a DDNS address), put it in
**`Client/.env.local`** (gitignored — keep private hostnames out of the repo):

```
CRAWLSTAR_ALLOWED_HOST=your.ddns.hostname
```

With ports **5173** (client, TCP) and **8787** (game ws, TCP) forwarded to this PC, open
`http://your.ddns.hostname:5173/?name=Tablet` in mobile Chrome — the client connects its WebSocket to
the same hostname automatically. LAN works the same via the PC's local IP (no env entry needed).
⚠ A Vite dev server + an unauthenticated game server are exposed while forwarded — fine for playtest
sessions, but close the forwards (or re-enable the firewall) when not testing.
