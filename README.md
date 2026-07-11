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

### M1 viewer controls

Click the canvas to capture the mouse. **WASD** move · **Q/E** down/up · **Shift** fast ·
**1/2/3** internal resolution (320×180 / 480×270 / 640×360) · **Esc** release mouse.
