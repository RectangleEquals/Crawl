/**
 * Combat state (Docs/04 §2, Docs/08). Attached to every combatant IslandEntity
 * (player, ally bot, enemy). Dependency-free base types — tags/damage/abilities
 * build logic on top. Server-authoritative: the client only ever RENDERS this
 * from snapshots, never computes it.
 */

export type Team = 0 | 1; // 0 = party, 1 = enemy

export type TagKind = "ignite" | "soak" | "shock" | "launch";
export const TAG_KINDS: readonly TagKind[] = ["ignite", "soak", "shock", "launch"];

/** Wire bitflags for tag presence (fits u8; extend for the full 8-tag set later). */
export const TAG_BIT: Record<TagKind, number> = { ignite: 1, soak: 2, shock: 4, launch: 8 };

export interface TagInstance {
  stacks: number;
  expiresTick: number;
  nextProcTick: number; // for DoT tags
}

export type Tags = Partial<Record<TagKind, TagInstance>>;

/** Ability phase machine, one active at a time (M3). */
export interface AbilityRuntime {
  id: string;
  phase: "windup" | "active" | "recovery";
  phaseEndTick: number;
  resolved: boolean; // effect fired once during active
}

export interface CombatState {
  kind: string; // archetype id ("warden", "slag-revenant", …)
  team: Team;
  hp: number;
  maxHp: number;
  armor: number; // flat mitigation per hit
  resource: number; // Bulwark for Warden; unused by most enemies
  maxResource: number;
  heavy: boolean; // heavy targets are Staggered by Launch instead of popped
  tags: Tags;
  downed: boolean;
  bleedoutTick: number; // when a downed player expires / auto-recovers (M3 placeholder)
  respawnTick: number; // M3-only: when a downed player stands back up
  blocking: boolean;
  ability: AbilityRuntime | null;
  cooldowns: Record<string, number>; // abilityId → ready tick
  staggerUntil: number; // can't act while tick < this
  hasteUntil: number; // carrion-herald aura (move/attack speed)
  cooldownScale: number; // multiplies ability cooldowns (AI tuning knob; 1 = player default)
  lastButtons: number; // previous cmd buttons, for edge detection
}

export interface CombatBaseStats {
  kind: string;
  team: Team;
  maxHp: number;
  armor: number;
  maxResource?: number;
  heavy?: boolean;
}

export function makeCombatState(base: CombatBaseStats): CombatState {
  return {
    kind: base.kind,
    team: base.team,
    hp: base.maxHp,
    maxHp: base.maxHp,
    armor: base.armor,
    resource: 0,
    maxResource: base.maxResource ?? 0,
    heavy: base.heavy ?? false,
    tags: {},
    downed: false,
    bleedoutTick: 0,
    respawnTick: 0,
    blocking: false,
    ability: null,
    cooldowns: {},
    staggerUntil: 0,
    hasteUntil: 0,
    cooldownScale: 1,
    lastButtons: 0,
  };
}

/** Compact tag bitflags for the wire. */
export function tagFlags(c: CombatState): number {
  let f = 0;
  for (const k of TAG_KINDS) if (c.tags[k]) f |= TAG_BIT[k];
  return f;
}

export function canAct(c: CombatState, nowTick: number): boolean {
  return !c.downed && nowTick >= c.staggerUntil;
}
