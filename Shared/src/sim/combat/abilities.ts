/**
 * Ability system (Docs/04 §3). Data-defined abilities with a windup→active→
 * recovery phase machine. ONE code path for players, ally bots, and enemies —
 * they differ only by which archetype's AbilityDef[] they carry and who sets
 * the buttons (network input vs AI brain). Effects resolve server-side against
 * lag-compensated hitboxes; the client only plays cosmetic windups.
 */

import { Buttons } from "../../protocol/messages.js";
import { BULWARK_PER_BLOCK_TICK } from "../constants.js";
import { yawBasis } from "../../math/trig.js";
import { applyDamage, gainResource, spendResource } from "./damage.js";
import { applyTag } from "./tags.js";
import { EventKind, pushEvent, type EventSink } from "./events.js";
import { canAct, type CombatState, type TagKind } from "./state.js";
import type { HitboxHistory } from "./hitbox.js";
import type { Projectile } from "./projectile.js";
import type { Vec3 } from "../../art/mesh.js";

export interface TagApply {
  kind: TagKind;
  stacks?: number;
}

export type AbilityEffect =
  | { kind: "melee"; range: number; halfAngle: number; damage: number; bulwarkGain?: number; tags?: TagApply[]; launch?: number }
  | { kind: "slam"; radius: number; damage: number; launchBonus: number; tags?: TagApply[] }
  | { kind: "projectile"; speed: number; damage: number; range: number; radius: number; visual: string; tags?: TagApply[] }
  | { kind: "wardwall"; dist: number; width: number; height: number; thickness: number; lifespanTicks: number };

export interface AbilityDef {
  id: string;
  button: number; // Buttons bit; Attack repeats while held, others fire on edge
  windup: number;
  active: number;
  recovery: number;
  cooldown: number;
  cost: number; // resource (Bulwark)
  effect: AbilityEffect;
  /** index used in the Cast wire event for client telegraphs */
  castIndex: number;
}

/** Everything an ability effect needs from the owning island. */
export interface AbilityContext {
  nowTick: number;
  history: HitboxHistory;
  attackerLatencyTicks: number;
  events: EventSink;
  combatOf(id: number): CombatState | null;
  feetOf(id: number): Vec3 | null;
  yawOf(id: number): number;
  /** Pop a target airborne (heavy → stagger instead) + apply the Launch tag. */
  launchTarget(id: number, upVel: number): void;
  spawnProjectile(p: Omit<Projectile, "id">): void;
  addWardWall(min: Vec3, max: Vec3, lifespanTicks: number): void;
  /** Soak+Shock met on `id` → arc Shock to neighbours. */
  chainConduction(id: number): void;
}

const TORSO = 1.0; // hit-centre height above feet

/**
 * Drive one combatant's abilities for a tick: set block state, maybe start an
 * ability from input edges, advance the active ability, resolve its effect.
 */
export function tickCombatAbilities(
  self: CombatState,
  selfId: number,
  buttons: number,
  abilities: readonly AbilityDef[],
  ctx: AbilityContext,
): void {
  const now = ctx.nowTick;
  const pressed = (bit: number): boolean => (buttons & bit) !== 0;
  const edge = (bit: number): boolean => (buttons & bit) !== 0 && (self.lastButtons & bit) === 0;

  // Block is a held stance (not an ability); only while free to act and not mid-ability.
  self.blocking = pressed(Buttons.Block) && canAct(self, now) && self.ability === null;
  // blocking builds Bulwark (Docs/04 §3.1: "built by blocking/being hit")
  if (self.blocking && self.maxResource > 0) gainResource(self, BULWARK_PER_BLOCK_TICK);

  // start an ability
  if (self.ability === null && canAct(self, now) && !self.blocking) {
    for (const ab of abilities) {
      const isAttack = ab.button === Buttons.Attack;
      const want = isAttack ? pressed(ab.button) : edge(ab.button);
      if (!want) continue;
      if (now < (self.cooldowns[ab.id] ?? 0)) continue;
      if (ab.cost > 0 && !spendResource(self, ab.cost)) continue;
      self.ability = { id: ab.id, phase: "windup", phaseEndTick: now + ab.windup, resolved: false };
      self.cooldowns[ab.id] = now + ab.windup + ab.active + Math.round(ab.cooldown * self.cooldownScale);
      pushEvent(ctx.events, EventKind.Cast, selfId, ctx.feetOf(selfId) ?? [0, 0, 0], ab.castIndex);
      break;
    }
  }

  // advance active ability
  const rt = self.ability;
  if (!rt) {
    self.lastButtons = buttons;
    return;
  }
  const def = abilities.find((a) => a.id === rt.id);
  if (!def) {
    self.ability = null;
    self.lastButtons = buttons;
    return;
  }
  if (now >= rt.phaseEndTick) {
    if (rt.phase === "windup") {
      rt.phase = "active";
      rt.phaseEndTick = now + def.active;
    } else if (rt.phase === "active") {
      rt.phase = "recovery";
      rt.phaseEndTick = now + def.recovery;
    } else {
      self.ability = null;
    }
  }
  if (self.ability && self.ability.phase === "active" && !self.ability.resolved) {
    self.ability.resolved = true;
    resolveEffect(def, self, selfId, ctx);
  }
  self.lastButtons = buttons;
}

function resolveEffect(def: AbilityDef, self: CombatState, selfId: number, ctx: AbilityContext): void {
  const feet = ctx.feetOf(selfId);
  if (!feet) return;
  const yaw = ctx.yawOf(selfId);
  const eff = def.effect;
  const atTick = ctx.nowTick - ctx.attackerLatencyTicks;
  const origin: Vec3 = [feet[0], feet[1], feet[2] + TORSO];

  switch (eff.kind) {
    case "melee": {
      const hits = ctx.history.meleeArc(atTick, self.team, origin, yaw, eff.range, (eff.halfAngle * Math.PI) / 180, selfId);
      for (const id of hits) applyHit(id, eff.damage, eff.tags, eff.launch, origin, ctx);
      if (eff.bulwarkGain) gainResource(self, eff.bulwarkGain);
      break;
    }
    case "slam": {
      const center: Vec3 = [feet[0], feet[1], feet[2] + 0.5];
      const hits = ctx.history.radius(atTick, self.team, center, eff.radius, selfId);
      for (const id of hits) {
        const tc = ctx.combatOf(id);
        if (!tc || tc.downed) continue;
        const consume = !!tc.tags.launch; // Launch consumed by a Slam → bonus (Docs/04 §2)
        if (consume) delete tc.tags.launch;
        const dmg = eff.damage + (consume ? eff.launchBonus : 0);
        emitDamage(id, applyDamageBlocked(tc, dmg, id, origin, ctx), ctx);
        applyTags(id, tc, eff.tags, ctx);
      }
      pushEvent(ctx.events, EventKind.Slam, selfId, center, Math.round(eff.radius * 10));
      break;
    }
    case "projectile": {
      const basis = yawBasis(yaw);
      ctx.spawnProjectile({
        ownerId: selfId,
        team: self.team,
        pos: [origin[0] + basis.fx * 0.5, origin[1] + basis.fy * 0.5, origin[2]],
        vel: [basis.fx * eff.speed, basis.fy * eff.speed, 0],
        damage: eff.damage,
        tags: eff.tags ?? [],
        radius: eff.radius,
        ttl: Math.ceil(eff.range / eff.speed * 30) + 2,
        kind: eff.visual,
      });
      break;
    }
    case "wardwall": {
      const basis = yawBasis(yaw);
      const cx = feet[0] + basis.fx * eff.dist;
      const cy = feet[1] + basis.fy * eff.dist;
      // wall faces the caster: width across the facing, thickness along it
      const rx = basis.rx * eff.width * 0.5;
      const ry = basis.ry * eff.width * 0.5;
      const tx = basis.fx * eff.thickness * 0.5;
      const ty = basis.fy * eff.thickness * 0.5;
      const min: Vec3 = [
        Math.min(cx - rx - tx, cx + rx + tx) - 0.01,
        Math.min(cy - ry - ty, cy + ry + ty) - 0.01,
        feet[2],
      ];
      const max: Vec3 = [
        Math.max(cx - rx - tx, cx + rx + tx) + 0.01,
        Math.max(cy - ry - ty, cy + ry + ty) + 0.01,
        feet[2] + eff.height,
      ];
      ctx.addWardWall(min, max, eff.lifespanTicks);
      pushEvent(ctx.events, EventKind.WardWall, selfId, [cx, cy, feet[2]]);
      break;
    }
  }
}

function applyHit(
  id: number,
  damage: number,
  tags: TagApply[] | undefined,
  launch: number | undefined,
  attackOrigin: Vec3,
  ctx: AbilityContext,
): void {
  const tc = ctx.combatOf(id);
  if (!tc || tc.downed) return;
  emitDamage(id, applyDamageBlocked(tc, damage, id, attackOrigin, ctx), ctx);
  applyTags(id, tc, tags, ctx);
  if (launch) ctx.launchTarget(id, launch);
}

/** Block mitigates only when the target is facing the attack origin (Docs/04 §3.1). */
function applyDamageBlocked(
  tc: CombatState,
  damage: number,
  id: number,
  attackOrigin: Vec3,
  ctx: AbilityContext,
): { dealt: number; killed: boolean; downed: boolean; pos: Vec3 } {
  const feet = ctx.feetOf(id) ?? [0, 0, 0];
  const blocked = tc.blocking && facesToward(ctx.yawOf(id), feet, attackOrigin);
  const res = applyDamage(tc, damage, ctx.nowTick, { blocked });
  return { ...res, pos: [feet[0], feet[1], feet[2] + TORSO] };
}

function emitDamage(
  id: number,
  res: { dealt: number; killed: boolean; downed: boolean; pos: Vec3 },
  ctx: AbilityContext,
): void {
  if (res.dealt > 0) pushEvent(ctx.events, EventKind.Damage, id, res.pos, res.dealt);
  if (res.killed) pushEvent(ctx.events, EventKind.Death, id, res.pos);
  if (res.downed) pushEvent(ctx.events, EventKind.Downed, id, res.pos);
}

function applyTags(id: number, tc: CombatState, tags: TagApply[] | undefined, ctx: AbilityContext): void {
  if (!tags) return;
  for (const t of tags) {
    const r = applyTag(tc, t.kind, t.stacks ?? 1, ctx.nowTick);
    pushEvent(ctx.events, EventKind.TagApplied, id, ctx.feetOf(id) ?? [0, 0, 0], tBit(t.kind));
    if (r.conduction) ctx.chainConduction(id);
  }
}

function tBit(k: TagKind): number {
  return k === "ignite" ? 1 : k === "soak" ? 2 : k === "shock" ? 4 : 8;
}

function facesToward(yaw: number, from: Vec3, to: Vec3): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return true;
  const b = yawBasis(yaw);
  return (dx * b.fx + dy * b.fy) / d > 0.34; // within ~70° of facing
}
