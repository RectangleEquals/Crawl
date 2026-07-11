/**
 * CrawlStar headless server.
 *
 * M1 stub: proves the workspace wiring (imports Shared, runs under Node).
 * The authoritative simulation host arrives in M2 (Docs/11-roadmap.md):
 * socket gateway → expedition manager → area islands @ 30 Hz → persistence
 * worker (Docs/02 §8, Docs/03).
 */

import { Rng, SUNKEN_PARISH, generateChamber } from "@crawlstar/shared";

const seed = process.argv[2] ?? "m1-demo";
const chamber = generateChamber(SUNKEN_PARISH, seed);
const tris = chamber.meshes.reduce((sum, m) => sum + m.indices.length / 3, 0);
const probe = new Rng(seed).fork("probe").next();

console.log(`[crawlstar-server] M1 stub — the wire comes online in M2.`);
console.log(`[crawlstar-server] shared sanity: seed '${seed}' → chamber ${tris} tris, rng probe ${probe.toFixed(6)}`);
