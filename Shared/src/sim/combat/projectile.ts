/**
 * Projectiles (shardspitter, carrion cinders). Simulated in the sim layer
 * (not Rapier rigid bodies) — deterministic, cheap, sphere-marched. The island
 * steps them and resolves hits through the shared damage/tag path.
 */

import type { Vec3 } from "../../art/mesh.js";
import type { TagApply } from "./abilities.js";
import type { Team } from "./state.js";

export interface Projectile {
  id: number;
  ownerId: number;
  team: Team;
  pos: Vec3;
  vel: Vec3;
  damage: number;
  tags: readonly TagApply[];
  radius: number;
  ttl: number; // ticks remaining
  kind: string; // visual id ("shard", "cinder")
}
