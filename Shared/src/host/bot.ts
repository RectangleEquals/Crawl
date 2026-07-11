/**
 * M2 bot: a server-side party member that wanders its area and drifts toward
 * nearby players — submitting the SAME InputCmd stream a human would
 * (Docs/09 §3: bots are mechanically honest). Utility-AI brains arrive in M3+.
 */

import { Rng } from "../math/rng.js";
import { yawFromDirection } from "../math/trig.js";
import { Buttons, type InputCmd } from "../protocol/messages.js";
import type { Vec3 } from "../art/mesh.js";
import type { AreaIsland, IslandEntity } from "../sim/area.js";

export class WanderBot {
  private target: Vec3 | null = null;
  private repathIn = 0;
  private seq = 1;

  constructor(
    readonly entityId: number,
    private readonly rng: Rng,
    private readonly bounds: { min: Vec3; max: Vec3 },
  ) {}

  /** Produce this tick's input command. */
  think(island: AreaIsland, self: IslandEntity): InputCmd {
    const pos = self.state.pos;

    // follow the nearest human if one is close; otherwise wander
    let follow: Vec3 | null = null;
    let bestDist = 7;
    for (const other of island.entities.values()) {
      if (other.isBot || other.id === self.id) continue;
      const dx = other.state.pos[0] - pos[0];
      const dy = other.state.pos[1] - pos[1];
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        follow = other.state.pos;
      }
    }

    this.repathIn -= 1;
    if (follow) {
      this.target = follow;
    } else if (!this.target || this.repathIn <= 0) {
      this.target = [
        this.rng.range(this.bounds.min[0], this.bounds.max[0]),
        this.rng.range(this.bounds.min[1], this.bounds.max[1]),
        0,
      ];
      this.repathIn = this.rng.int(60, 150); // 2–5 s
    }

    const tx = this.target[0] - pos[0];
    const ty = this.target[1] - pos[1];
    const dist = Math.hypot(tx, ty);
    // hold personal space when following a player
    const stop = follow ? 1.6 : 0.4;
    let moveY = 0;
    let yaw = self.yaw;
    if (dist > stop) {
      yaw = yawFromDirection(tx / dist, ty / dist);
      moveY = 1;
    }
    return {
      seq: this.seq++,
      moveX: 0,
      moveY,
      yaw,
      buttons: dist > 6 && !follow ? Buttons.Sprint : 0,
    };
  }
}
