/**
 * Damage & mitigation (Docs/04, Docs/08 §5 pacing). One choke-point so
 * downing, tag damage-taken multipliers, block, and armour stay consistent.
 */

import { BULWARK_ON_BLOCKED_HIT, BULWARK_ON_HIT, DOWNED_BLEEDOUT_TICKS, DOWN_RESPAWN_TICKS } from "../constants.js";
import { tagDamageTakenMultiplier } from "./tags.js";
import type { CombatState } from "./state.js";

export interface DamageResult {
  dealt: number;
  killed: boolean; // enemy reduced to 0 → removed
  downed: boolean; // player reduced to 0 → downed this hit
}

export interface DamageOpts {
  blocked?: boolean; // attacker was inside the target's block cone
  ignoreArmor?: boolean; // DoT ticks bypass flat armour
}

const BLOCK_MITIGATION = 0.65;

/**
 * Apply damage to a combatant. Players hitting 0 HP are DOWNED (not dead) per
 * the death model (Docs/09 §6 — full gravemark/XP-debt loop is M5); enemies
 * hitting 0 are killed. Returns what happened for event emission.
 */
export function applyDamage(
  target: CombatState,
  amount: number,
  nowTick: number,
  opts: DamageOpts = {},
): DamageResult {
  if (target.downed || target.hp <= 0) return { dealt: 0, killed: false, downed: false };

  let dmg = amount * tagDamageTakenMultiplier(target);
  if (!opts.ignoreArmor) dmg = Math.max(1, dmg - target.armor);
  const absorbed = dmg; // pre-block incoming damage (what a block soaks)
  if (opts.blocked) dmg *= 1 - BLOCK_MITIGATION;
  dmg = Math.round(dmg);

  target.hp -= dmg;
  // being hit builds Bulwark (Warden); blocking builds more, scaled to what you
  // ABSORBED (pre-mitigation) so blocking is rewarded despite the smaller hit.
  if (target.maxResource > 0) {
    gainResource(target, opts.blocked ? absorbed * BULWARK_ON_BLOCKED_HIT : dmg * BULWARK_ON_HIT);
  }
  if (target.hp > 0) return { dealt: dmg, killed: false, downed: false };

  target.hp = 0;
  if (target.team === 0) {
    target.downed = true;
    target.blocking = false;
    target.ability = null;
    target.tags = {};
    target.bleedoutTick = nowTick + DOWNED_BLEEDOUT_TICKS;
    target.respawnTick = nowTick + DOWN_RESPAWN_TICKS;
    return { dealt: dmg, killed: false, downed: true };
  }
  return { dealt: dmg, killed: true, downed: false };
}

export function gainResource(c: CombatState, amount: number): void {
  c.resource = Math.min(c.maxResource, c.resource + amount);
}

export function spendResource(c: CombatState, amount: number): boolean {
  if (c.resource < amount) return false;
  c.resource -= amount;
  return true;
}
