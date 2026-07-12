/**
 * The combo-tag engine (Docs/04 §2). Tags are applied by abilities/projectiles,
 * decay on timers, and interact via order-agnostic combos. Systemic and
 * data-driven so bots and future classes read the same rules.
 *
 * M3 subset: Ignite, Soak, Shock, Launch. Combos: Soak+Shock → Conduction
 * (chain), Launch consumed by a Slam hit (resolved in abilities.ts).
 * Remaining tags/combos (Chill, Rend, Irradiate, Expose, Gloamfire…) land with
 * their source classes in M6+.
 */

import { TICK_RATE } from "../constants.js";
import type { CombatState, TagKind } from "./state.js";

export interface TagConfig {
  durationTicks: number;
  procInterval: number; // ticks between DoT procs; 0 = no DoT
  procDamagePerStack: number;
  maxStacks: number;
  moveSlow: number; // fractional move-speed reduction while tagged
  damageTakenMult: number; // multiplier applied to incoming damage while tagged
}

const S = TICK_RATE; // one second in ticks

export const TAG_CONFIG: Record<TagKind, TagConfig> = {
  ignite: { durationTicks: 3 * S, procInterval: 15, procDamagePerStack: 3, maxStacks: 5, moveSlow: 0, damageTakenMult: 1 },
  soak: { durationTicks: 4 * S, procInterval: 0, procDamagePerStack: 0, maxStacks: 1, moveSlow: 0.1, damageTakenMult: 1 },
  shock: { durationTicks: 3 * S, procInterval: 20, procDamagePerStack: 2, maxStacks: 3, moveSlow: 0.15, damageTakenMult: 1.2 },
  launch: { durationTicks: Math.round(0.8 * S), procInterval: 0, procDamagePerStack: 0, maxStacks: 1, moveSlow: 0, damageTakenMult: 1 },
};

/** Result of applying a tag — signals the caller to resolve island-wide combos. */
export interface TagApplyResult {
  conduction: boolean; // Soak+Shock met → caller arcs Shock to neighbours
}

/**
 * Apply/refresh a tag. Returns combo signals the caller resolves with island
 * context (neighbours, event sink). Launch is applied here but its detonation
 * (Slam) happens in abilities.ts.
 */
export function applyTag(
  c: CombatState,
  kind: TagKind,
  stacks: number,
  nowTick: number,
): TagApplyResult {
  const cfg = TAG_CONFIG[kind];

  // Soak+Shock → Conduction (order-agnostic): both consumed, caller chains.
  if (kind === "shock" && c.tags.soak) {
    delete c.tags.soak;
    return { conduction: true };
  }
  if (kind === "soak" && c.tags.shock) {
    delete c.tags.shock;
    return { conduction: true };
  }

  const existing = c.tags[kind];
  const newStacks = Math.min(cfg.maxStacks, (existing?.stacks ?? 0) + stacks);
  c.tags[kind] = {
    stacks: newStacks,
    expiresTick: nowTick + cfg.durationTicks,
    nextProcTick: existing?.nextProcTick ?? nowTick + cfg.procInterval,
  };
  return { conduction: false };
}

/** Aggregate move-speed multiplier from active tags (1 = unaffected). */
export function tagMoveMultiplier(c: CombatState): number {
  let m = 1;
  for (const k of Object.keys(c.tags) as TagKind[]) {
    if (c.tags[k]) m *= 1 - TAG_CONFIG[k].moveSlow;
  }
  return Math.max(0.2, m);
}

/** Aggregate incoming-damage multiplier from active tags. */
export function tagDamageTakenMultiplier(c: CombatState): number {
  let m = 1;
  for (const k of Object.keys(c.tags) as TagKind[]) {
    if (c.tags[k]) m *= TAG_CONFIG[k].damageTakenMult;
  }
  return m;
}

/**
 * Advance tags one tick: expire, and return total DoT damage to apply this tick
 * (caller routes it through damage.ts so mitigation/downing stay centralised).
 */
export function tickTags(c: CombatState, nowTick: number): number {
  let dot = 0;
  for (const k of Object.keys(c.tags) as TagKind[]) {
    const t = c.tags[k];
    if (!t) continue;
    if (nowTick >= t.expiresTick) {
      delete c.tags[k];
      continue;
    }
    const cfg = TAG_CONFIG[k];
    if (cfg.procInterval > 0 && nowTick >= t.nextProcTick) {
      dot += cfg.procDamagePerStack * t.stacks;
      t.nextProcTick = nowTick + cfg.procInterval;
    }
  }
  return dot;
}
