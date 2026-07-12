/**
 * Furrowmouth Wastes families (Docs/08 §2). M3 launch set: a melee Brawler, a
 * ranged Skirmisher, a Support. Barony-lethal at Reach 1 (Docs/08 §5): a small
 * pack should threaten a fresh Warden. Enemies emit tags players will learn from
 * (shardspitter Soaks, herald Ignites) even though the Warden-only demo can't
 * yet chain every combo — the tag engine is complete and unit-tested.
 */

import { Buttons } from "../../protocol/messages.js";
import type { AbilityDef } from "../../sim/combat/abilities.js";
import type { CombatBaseStats } from "../../sim/combat/state.js";

export type AiRole = "player" | "ally-warden" | "brawler" | "skirmisher" | "support";

export interface EnemyDef {
  base: CombatBaseStats;
  abilities: AbilityDef[];
  ai: AiRole;
  preferredRange: number; // metres the brain tries to hold
  aggro: number; // detection radius
  primaryAbility: string; // ability the brain presses when in range
  hasteAura?: number; // support radius that buffs nearby allies
  visual: { scale: number; hueShift: number };
}

export const SLAG_REVENANT: EnemyDef = {
  base: { kind: "slag-revenant", team: 1, maxHp: 60, armor: 4, heavy: true },
  ai: "brawler",
  preferredRange: 1.5,
  aggro: 16,
  primaryAbility: "revenant.smash",
  visual: { scale: 1.15, hueShift: 0 },
  abilities: [
    {
      id: "revenant.smash",
      button: Buttons.Attack,
      windup: 12, active: 2, recovery: 8, cooldown: 30, cost: 0,
      castIndex: 0,
      effect: { kind: "melee", range: 2.1, halfAngle: 55, damage: 30 },
    },
  ],
};

export const SHARDSPITTER: EnemyDef = {
  base: { kind: "shardspitter", team: 1, maxHp: 34, armor: 0 },
  ai: "skirmisher",
  preferredRange: 9,
  aggro: 18,
  primaryAbility: "shardspitter.spit",
  visual: { scale: 0.85, hueShift: 0.08 },
  abilities: [
    {
      id: "shardspitter.spit",
      button: Buttons.Attack,
      windup: 10, active: 1, recovery: 6, cooldown: 50, cost: 0,
      castIndex: 0,
      effect: { kind: "projectile", speed: 15, damage: 18, range: 20, radius: 0.4, visual: "shard", tags: [{ kind: "soak", stacks: 1 }] },
    },
  ],
};

export const CARRION_HERALD: EnemyDef = {
  base: { kind: "carrion-herald", team: 1, maxHp: 46, armor: 2 },
  ai: "support",
  preferredRange: 8,
  aggro: 20,
  primaryAbility: "herald.cinder",
  hasteAura: 6,
  visual: { scale: 0.95, hueShift: -0.1 },
  abilities: [
    {
      id: "herald.cinder",
      button: Buttons.Attack,
      windup: 14, active: 1, recovery: 8, cooldown: 60, cost: 0,
      castIndex: 0,
      effect: { kind: "projectile", speed: 11, damage: 8, range: 14, radius: 0.45, visual: "cinder", tags: [{ kind: "ignite", stacks: 2 }] },
    },
  ],
};

export const FURROWMOUTH_FAMILIES: Record<string, EnemyDef> = {
  "slag-revenant": SLAG_REVENANT,
  shardspitter: SHARDSPITTER,
  "carrion-herald": CARRION_HERALD,
};
