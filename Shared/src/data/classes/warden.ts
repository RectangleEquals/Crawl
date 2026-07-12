/**
 * Warden — Furrowguard bulwark (Docs/04 §3.1). Frontline control tank.
 * Resource: Bulwark (built by blocking/attacking, spent on ward abilities).
 * Headline combo: Shield Slam applies Launch → Ground Slam consumes it for AoE
 * (Docs/04 §2). M3 kit: attack, ward wall, launch, ground slam.
 */

import { Buttons } from "../../protocol/messages.js";
import type { AbilityDef } from "../../sim/combat/abilities.js";
import type { CombatBaseStats } from "../../sim/combat/state.js";

export const WARDEN_BASE: CombatBaseStats = {
  kind: "warden",
  team: 0,
  maxHp: 120,
  armor: 6,
  maxResource: 100,
};

export const WARDEN_ABILITIES: AbilityDef[] = [
  {
    id: "warden.strike",
    button: Buttons.Attack,
    windup: 3, active: 2, recovery: 5, cooldown: 0, cost: 0,
    castIndex: 0,
    effect: { kind: "melee", range: 2.2, halfAngle: 55, damage: 14, bulwarkGain: 8 },
  },
  {
    id: "warden.wardwall",
    button: Buttons.Ability1,
    windup: 4, active: 1, recovery: 8, cooldown: 90, cost: 25,
    castIndex: 1,
    effect: { kind: "wardwall", dist: 2.2, width: 2.6, height: 2.2, thickness: 0.4, lifespanTicks: 240 },
  },
  {
    id: "warden.shieldslam",
    button: Buttons.Ability2,
    windup: 6, active: 2, recovery: 8, cooldown: 45, cost: 20,
    castIndex: 2,
    effect: { kind: "melee", range: 2.6, halfAngle: 50, damage: 10, launch: 6.0 },
  },
  {
    id: "warden.groundslam",
    button: Buttons.Ability3,
    windup: 10, active: 2, recovery: 10, cooldown: 120, cost: 30,
    castIndex: 3,
    effect: { kind: "slam", radius: 3.4, damage: 22, launchBonus: 26 },
  },
];
