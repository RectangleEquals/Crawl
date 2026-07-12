/**
 * CrawlStar headless server (Docs/02 §8): thin Node wrapper around the
 * transport-agnostic GameHost from Shared — the same host the singleplayer
 * Web Worker runs. M2 scope: sessions, 30 Hz sim, snapshots, transitions.
 */

import { GameHost } from "@crawlstar/shared";
import { WsListener } from "./gateway.js";

// Tuning knobs via env (for testing): CRAWLSTAR_BOTS=0 to fight solo,
// CRAWLSTAR_ENEMIES=2 for a smaller pack, CRAWLSTAR_CD_SCALE=2 to halve enemy
// attack frequency. Example: CRAWLSTAR_BOTS=0 CRAWLSTAR_CD_SCALE=2 pnpm dev:server
const PORT = Number(process.env["CRAWLSTAR_PORT"] ?? 8787);
const SEED = process.env["CRAWLSTAR_SEED"] ?? "m2-demo";
const num = (key: string, def: number): number => {
  const v = process.env[key];
  return v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : def;
};

await GameHost.ready();
const listener = new WsListener(PORT);
const host = new GameHost(listener, {
  seed: SEED,
  botCount: num("CRAWLSTAR_BOTS", 1),
  enemyCount: num("CRAWLSTAR_ENEMIES", 4),
  cooldownScale: num("CRAWLSTAR_CD_SCALE", 1),
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
