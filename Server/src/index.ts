/**
 * CrawlStar headless server (Docs/02 §8): thin Node wrapper around the
 * transport-agnostic GameHost from Shared — the same host the singleplayer
 * Web Worker runs. M2 scope: sessions, 30 Hz sim, snapshots, transitions.
 */

import { GameHost } from "@crawlstar/shared";
import { WsListener } from "./gateway.js";

const PORT = Number(process.env["CRAWLSTAR_PORT"] ?? 8787);
const SEED = process.env["CRAWLSTAR_SEED"] ?? "m2-demo";

await GameHost.ready();
const listener = new WsListener(PORT);
const host = new GameHost(listener, {
  seed: SEED,
  botCount: 1,
  log: (line) => console.log(`[crawlstar] ${line}`),
});
host.start();
console.log(`[crawlstar] headless server listening on ws://localhost:${PORT} (seed '${SEED}')`);

process.on("SIGINT", () => {
  console.log("[crawlstar] shutting down");
  host.stop();
  listener.wss.close();
  process.exit(0);
});
