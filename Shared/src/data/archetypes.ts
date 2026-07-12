/**
 * Archetype registry — unifies player class(es) and enemy families behind one
 * shape so the combat/AI systems have a single lookup (Docs/02 §2 data-driven).
 * `kindIndex` is the compact u8 the wire carries; the client maps it → visual.
 */

import { WARDEN_ABILITIES, WARDEN_BASE } from "./classes/warden.js";
import { FURROWMOUTH_FAMILIES, type AiRole } from "./enemies/furrowmouth.js";
import type { AbilityDef } from "../sim/combat/abilities.js";
import type { CombatBaseStats } from "../sim/combat/state.js";

export interface ArchetypeDef {
  base: CombatBaseStats;
  abilities: AbilityDef[];
  ai: AiRole;
  preferredRange: number;
  aggro: number;
  primaryAbility: string;
  hasteAura?: number;
  visual: { scale: number; hueShift: number };
}

export const ARCHETYPES: Record<string, ArchetypeDef> = {
  warden: {
    base: WARDEN_BASE,
    abilities: WARDEN_ABILITIES,
    ai: "ally-warden", // human players ignore this; ally bots use it
    preferredRange: 1.8,
    aggro: 22,
    primaryAbility: "warden.strike",
    visual: { scale: 1.0, hueShift: 0 },
  },
  ...Object.fromEntries(
    Object.entries(FURROWMOUTH_FAMILIES).map(([k, e]) => [
      k,
      {
        base: e.base,
        abilities: e.abilities,
        ai: e.ai,
        preferredRange: e.preferredRange,
        aggro: e.aggro,
        primaryAbility: e.primaryAbility,
        ...(e.hasteAura !== undefined ? { hasteAura: e.hasteAura } : {}),
        visual: e.visual,
      } satisfies ArchetypeDef,
    ]),
  ),
};

/** Stable wire indices (append-only). */
export const KIND_ORDER: readonly string[] = ["warden", "slag-revenant", "shardspitter", "carrion-herald"];

export function kindIndex(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? 0 : i;
}

export function getArchetype(kind: string): ArchetypeDef {
  const a = ARCHETYPES[kind];
  if (!a) throw new Error(`unknown archetype ${kind}`);
  return a;
}
