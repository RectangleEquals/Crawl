/**
 * Lag-compensation hitbox history (Docs/03 §4). Each island records every
 * combatant's capsule centre + radius for the last N ticks. When a player's
 * attack resolves, the server rewinds targets to the attacker's view (by their
 * measured latency) for HIT DETECTION, then applies damage to CURRENT state —
 * the standard Quake/Source model. Bot/enemy attackers use latency 0.
 */

import { HITBOX_HISTORY, TICK_MS } from "../constants.js";
import { yawBasis } from "../../math/trig.js";
import type { Team } from "./state.js";
import type { Vec3 } from "../../art/mesh.js";

export interface HitboxSample {
  id: number;
  team: Team;
  x: number;
  y: number;
  z: number; // capsule centre height
  radius: number;
}

export class HitboxHistory {
  private readonly ring: HitboxSample[][] = [];
  private readonly ticks: number[] = [];

  record(tick: number, samples: HitboxSample[]): void {
    this.ring.push(samples);
    this.ticks.push(tick);
    if (this.ring.length > HITBOX_HISTORY) {
      this.ring.shift();
      this.ticks.shift();
    }
  }

  /** Samples at (or nearest before) the target tick; latest if not buffered. */
  private at(tick: number): HitboxSample[] {
    for (let i = this.ticks.length - 1; i >= 0; i--) {
      if ((this.ticks[i] as number) <= tick) return this.ring[i] as HitboxSample[];
    }
    return (this.ring[0] as HitboxSample[]) ?? [];
  }

  latencyTicks(rttMs: number): number {
    return Math.min(HITBOX_HISTORY - 1, Math.max(0, Math.round(rttMs / 2 / TICK_MS)));
  }

  /**
   * Enemies of `attackerTeam` inside a horizontal arc (range + half-angle) from
   * origin/facing, evaluated at `atTick` (rewound). Returns hit entity ids.
   */
  meleeArc(
    atTick: number,
    attackerTeam: Team,
    origin: Vec3,
    yaw: number,
    range: number,
    halfAngleRad: number,
    excludeId: number,
  ): number[] {
    const basis = yawBasis(yaw); // forward = (fx, fy)
    const cosHalf = Math.cos(halfAngleRad);
    const hits: number[] = [];
    for (const s of this.at(atTick)) {
      if (s.team === attackerTeam || s.id === excludeId) continue;
      const dx = s.x - origin[0];
      const dy = s.y - origin[1];
      const dist = Math.hypot(dx, dy);
      if (dist > range + s.radius) continue;
      if (dist < 1e-3) {
        hits.push(s.id);
        continue;
      }
      const dot = (dx * basis.fx + dy * basis.fy) / dist;
      if (dot >= cosHalf) hits.push(s.id);
    }
    return hits;
  }

  /** Enemies of `attackerTeam` within a radius of a point (Slam / Conduction). */
  radius(atTick: number, attackerTeam: Team, center: Vec3, radius: number, excludeId: number): number[] {
    const hits: number[] = [];
    for (const s of this.at(atTick)) {
      if (s.team === attackerTeam || s.id === excludeId) continue;
      const d = Math.hypot(s.x - center[0], s.y - center[1], s.z - center[2]);
      if (d <= radius + s.radius) hits.push(s.id);
    }
    return hits;
  }
}
