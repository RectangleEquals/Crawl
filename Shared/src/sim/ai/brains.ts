/**
 * Utility-lite combat AI (Docs/08 §3, Docs/09 §3). One `think` for enemies and
 * ally bots — they differ only by archetype role. Produces the SAME InputCmd a
 * player would send (move + buttons), so the combat path is identical for all.
 * Full utility-AI + navmesh is later; M3 uses target-select + range-band steering.
 */

import { getArchetype } from "../../data/archetypes.js";
import { yawFromDirection } from "../../math/trig.js";
import { Buttons, type InputCmd } from "../../protocol/messages.js";
import type { AreaIsland, IslandEntity } from "../area.js";

function nearestTarget(self: IslandEntity, island: AreaIsland, wantEnemyOfTeam: number, maxDist: number): IslandEntity | null {
  let best: IslandEntity | null = null;
  let bestD = maxDist;
  for (const e of island.entities.values()) {
    const c = e.combat;
    if (!c || e.id === self.id) continue;
    if (c.team === wantEnemyOfTeam) continue; // same team
    if (c.downed || c.hp <= 0) continue;
    const d = Math.hypot(e.state.pos[0] - self.state.pos[0], e.state.pos[1] - self.state.pos[1]);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function abilityRange(kind: string, abilityId: string): number {
  const arch = getArchetype(kind);
  const ab = arch.abilities.find((a) => a.id === abilityId);
  if (!ab) return 2;
  const e = ab.effect;
  if (e.kind === "melee") return e.range;
  if (e.kind === "projectile") return e.range;
  if (e.kind === "slam") return e.radius;
  return 2;
}

/** Decide one entity's input this tick. `self.combat` must be set. */
export function combatThink(self: IslandEntity, island: AreaIsland, nowTick: number): InputCmd {
  const c = self.combat;
  const neutral: InputCmd = { seq: nowTick, moveX: 0, moveY: 0, yaw: self.yaw, buttons: 0 };
  if (!c || c.downed) return neutral;

  const arch = getArchetype(c.kind);
  const target = nearestTarget(self, island, c.team, arch.aggro);

  // Ally bots with no enemy in sight fall back to loosely following a player.
  if (!target) {
    if (arch.ai === "ally-warden") {
      const player = [...island.entities.values()].find((e) => e.combat && e.combat.team === 0 && e.id !== self.id && !e.isBot);
      if (player) {
        const dx = player.state.pos[0] - self.state.pos[0];
        const dy = player.state.pos[1] - self.state.pos[1];
        const d = Math.hypot(dx, dy);
        if (d > 2.5) return { seq: nowTick, moveX: 0, moveY: 1, yaw: yawFromDirection(dx / d, dy / d), buttons: 0 };
      }
    }
    return neutral;
  }

  const dx = target.state.pos[0] - self.state.pos[0];
  const dy = target.state.pos[1] - self.state.pos[1];
  const dist = Math.hypot(dx, dy) || 1e-3;
  const yaw = yawFromDirection(dx / dist, dy / dist);

  // range-band steering
  let moveY = 0;
  const pref = arch.preferredRange;
  const melee = arch.ai === "brawler" || arch.ai === "ally-warden";
  if (melee) {
    if (dist > pref) moveY = 1; // close in
  } else {
    if (dist < pref * 0.8) moveY = -1; // kite back
    else if (dist > pref * 1.25) moveY = 1; // regain range
  }

  // fire the primary when in range, facing, and ready
  let buttons = 0;
  const range = abilityRange(c.kind, arch.primaryAbility);
  const inRange = melee ? dist <= range * 0.95 : dist <= range;
  const ab = arch.abilities.find((a) => a.id === arch.primaryAbility);
  const ready = ab ? nowTick >= (c.cooldowns[ab.id] ?? 0) : false;
  if (inRange && ready && ab && c.ability === null) {
    buttons |= ab.button;
    if (melee) moveY = 0; // plant to swing
  }

  // ally warden: occasionally launch then slam a clustered target (headline combo)
  if (arch.ai === "ally-warden" && c.ability === null && inRange) {
    const slam = c.cooldowns["warden.groundslam"] ?? 0;
    const launch = c.cooldowns["warden.shieldslam"] ?? 0;
    if (target.combat && target.combat.tags.launch && nowTick >= slam) buttons |= Buttons.Ability3;
    else if (nowTick >= launch && c.resource >= 20) buttons |= Buttons.Ability2;
  }

  return { seq: nowTick, moveX: 0, moveY, yaw, buttons };
}
