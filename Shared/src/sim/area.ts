/**
 * Area island (Docs/02 §4): one isolated sim world per area — physics,
 * characters, projectiles, ward walls, and the authoritative combat tick.
 * Islands never reference each other; the host moves entities between them.
 */

import { boxContains, type Vec3 } from "../art/mesh.js";
import type { ChamberData, PortalSpec } from "../art/chamber.js";
import { animFor, stepCharacter, type AnimState, type CharState } from "./character.js";
import { AreaPhysics, type CharacterBody } from "./physics.js";
import { Buttons, type InputCmd } from "../protocol/messages.js";
import {
  CONDUCTION_DAMAGE, CONDUCTION_MAX_TARGETS, CONDUCTION_RADIUS,
  DOWN_RESPAWN_TICKS, HIT_CENTER_Z, PLAYER_RADIUS, TICK_DT,
} from "./constants.js";
import { getArchetype } from "../data/archetypes.js";
import { tickCombatAbilities, type AbilityContext } from "./combat/abilities.js";
import { applyDamage } from "./combat/damage.js";
import { applyTag, tagMoveMultiplier, tickTags, TAG_CONFIG } from "./combat/tags.js";
import { HitboxHistory, type HitboxSample } from "./combat/hitbox.js";
import { EventKind, pushEvent, type CombatEvent, type EventSink } from "./combat/events.js";
import type { CombatState } from "./combat/state.js";
import type { Projectile } from "./combat/projectile.js";

export interface IslandEntity {
  id: number;
  name: string;
  isBot: boolean;
  state: CharState;
  body: CharacterBody;
  yaw: number;
  anim: AnimState;
  lastCmd: InputCmd | null;
  buttons: number; // buttons of the cmd applied this tick (for combat)
  combat: CombatState | null;
}

interface WardWall {
  handle: number;
  expireTick: number;
}

export interface CombatTickResult {
  removed: number[]; // enemy ids that died and were despawned
}

export class AreaIsland {
  readonly physics: AreaPhysics;
  readonly entities = new Map<number, IslandEntity>();
  readonly history = new HitboxHistory();
  private readonly portals: readonly PortalSpec[];
  private readonly projectiles: Projectile[] = [];
  private readonly wards: WardWall[] = [];
  private nextProjectileId = 1;

  constructor(chamber: ChamberData) {
    this.physics = new AreaPhysics(chamber.colliders);
    this.portals = chamber.portals;
  }

  addEntity(id: number, name: string, isBot: boolean, feet: Vec3, yaw: number, combat: CombatState | null = null): IslandEntity {
    const body = this.physics.createCharacter(feet, combat?.team ?? 0);
    const entity: IslandEntity = {
      id, name, isBot, state: { pos: feet, velZ: 0, grounded: false },
      body, yaw, anim: 0, lastCmd: null, buttons: 0, combat,
    };
    this.entities.set(id, entity);
    return entity;
  }

  removeEntity(id: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    e.body.dispose();
    this.entities.delete(id);
  }

  /** Apply one input command (movement) to one entity. */
  applyCmd(entity: IslandEntity, cmd: InputCmd): void {
    const downed = entity.combat?.downed ?? false;
    const c = downed ? { ...cmd, moveX: 0, moveY: 0, buttons: 0 } : cmd;
    const speedMult = entity.combat ? tagMoveMultiplier(entity.combat) : 1;
    stepCharacter(entity.body, entity.state, c, false, speedMult);
    entity.yaw = c.yaw;
    entity.anim = animFor(entity.state, c);
    entity.buttons = c.buttons;
    entity.lastCmd = cmd;
  }

  /** Advance physics one tick (after all applyCmd calls). */
  step(): void {
    this.physics.step();
  }

  // ----------------------------------------------------------- combat tick

  /**
   * The authoritative combat pass, after movement + physics.step. Order:
   * record hitboxes → tags/DoT → abilities → projectiles → ward expiry →
   * haste auras → downed/death cleanup. Pushes juice events into `events`.
   */
  tickCombat(nowTick: number, latencyOf: (id: number) => number, events: EventSink): CombatTickResult {
    this.ctxTick = nowTick; // ctx closures (launch/conduction/ward) read this
    this.recordHistory(nowTick);

    // tags: decay + DoT (routed through the mitigation path, armour-ignoring)
    for (const e of this.entities.values()) {
      const c = e.combat;
      if (!c || c.downed) continue;
      const dot = tickTags(c, nowTick);
      if (dot > 0) {
        const res = applyDamage(c, dot, nowTick, { ignoreArmor: true });
        const pos: Vec3 = [e.state.pos[0], e.state.pos[1], e.state.pos[2] + HIT_CENTER_Z];
        if (res.dealt > 0) pushEvent(events, EventKind.Damage, e.id, pos, res.dealt);
        if (res.downed) pushEvent(events, EventKind.Downed, e.id, pos);
        if (res.killed) pushEvent(events, EventKind.Death, e.id, pos);
      }
    }

    // abilities: activation + phase advance + effect resolution
    for (const e of this.entities.values()) {
      const c = e.combat;
      if (!c) continue;
      const abilities = getArchetype(c.kind).abilities;
      if (abilities.length === 0 && c.ability === null) {
        c.blocking = false;
        continue;
      }
      const ctx = this.makeCtx(e, latencyOf(e.id), events);
      tickCombatAbilities(c, e.id, e.buttons, abilities, ctx);
    }

    this.stepProjectiles(nowTick, events);
    this.expireWards(nowTick);
    this.applyHasteAuras(nowTick);
    return this.cleanup(nowTick, events);
  }

  private recordHistory(nowTick: number): void {
    const samples: HitboxSample[] = [];
    for (const e of this.entities.values()) {
      if (!e.combat) continue;
      samples.push({
        id: e.id, team: e.combat.team,
        x: e.state.pos[0], y: e.state.pos[1], z: e.state.pos[2] + HIT_CENTER_Z,
        radius: PLAYER_RADIUS,
      });
    }
    this.history.record(nowTick, samples);
  }

  private ctxTick = 0; // current tick, for ctx closures set at tickCombat top

  private makeCtx(self: IslandEntity, latencyTicks: number, events: EventSink): AbilityContext {
    const team = self.combat?.team ?? 0;
    return {
      nowTick: this.ctxTick,
      history: this.history,
      attackerLatencyTicks: latencyTicks,
      events,
      combatOf: (id) => this.entities.get(id)?.combat ?? null,
      feetOf: (id) => this.entities.get(id)?.state.pos ?? null,
      yawOf: (id) => this.entities.get(id)?.yaw ?? 0,
      launchTarget: (id, up) => this.launchTarget(team, id, up, events),
      spawnProjectile: (p) => this.projectiles.push({ id: this.nextProjectileId++, ...p }),
      addWardWall: (min, max, life) => {
        const handle = this.physics.addWall(min, max);
        this.wards.push({ handle, expireTick: this.ctxTick + life });
      },
      chainConduction: (id) => this.chainConduction(team, id, events),
    };
  }

  private launchTarget(_attackerTeam: number, id: number, up: number, events: EventSink): void {
    const e = this.entities.get(id);
    if (!e?.combat || e.combat.downed) return;
    const pos: Vec3 = [e.state.pos[0], e.state.pos[1], e.state.pos[2] + HIT_CENTER_Z];
    if (e.combat.heavy) {
      e.combat.staggerUntil = this.ctxTick + 18; // heavies stagger instead of pop
    } else {
      e.state.velZ = up;
      e.state.grounded = false;
      applyTag(e.combat, "launch", 1, this.ctxTick);
    }
    pushEvent(events, EventKind.TagApplied, id, pos, 8 /* launch bit */);
  }

  private chainConduction(attackerTeam: number, originId: number, events: EventSink): void {
    const origin = this.entities.get(originId);
    if (!origin?.combat) return;
    const center: Vec3 = [origin.state.pos[0], origin.state.pos[1], origin.state.pos[2] + HIT_CENTER_Z];
    const neighbours = this.history.radius(this.ctxTick, attackerTeam as 0 | 1, center, CONDUCTION_RADIUS, originId);
    let n = 0;
    for (const id of neighbours) {
      if (n >= CONDUCTION_MAX_TARGETS) break;
      const tc = this.entities.get(id)?.combat;
      if (!tc || tc.downed) continue;
      // direct shock (bypass combo → no recursive chaining)
      tc.tags.shock = {
        stacks: 1,
        expiresTick: this.ctxTick + TAG_CONFIG.shock.durationTicks,
        nextProcTick: this.ctxTick + TAG_CONFIG.shock.procInterval,
      };
      const res = applyDamage(tc, CONDUCTION_DAMAGE, this.ctxTick);
      const p = this.entities.get(id)!.state.pos;
      const pos: Vec3 = [p[0], p[1], p[2] + HIT_CENTER_Z];
      if (res.dealt > 0) pushEvent(events, EventKind.Damage, id, pos, res.dealt);
      if (res.killed) pushEvent(events, EventKind.Death, id, pos);
      n++;
    }
    pushEvent(events, EventKind.Conduction, originId, center, n);
  }

  private stepProjectiles(nowTick: number, events: EventSink): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i] as Projectile;
      const from: Vec3 = [p.pos[0], p.pos[1], p.pos[2]];
      p.pos = [p.pos[0] + p.vel[0] * TICK_DT, p.pos[1] + p.vel[1] * TICK_DT, p.pos[2] + p.vel[2] * TICK_DT];
      p.ttl -= 1;

      // world hit → despawn
      const seg = Math.hypot(p.pos[0] - from[0], p.pos[1] - from[1], p.pos[2] - from[2]);
      if (seg > 1e-4) {
        const dir: Vec3 = [(p.pos[0] - from[0]) / seg, (p.pos[1] - from[1]) / seg, (p.pos[2] - from[2]) / seg];
        const toi = this.physics.castRay(from, dir, seg + p.radius);
        if (toi !== null && toi <= seg) {
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // entity hit → damage + tags + despawn
      let hit: IslandEntity | null = null;
      let hitD = Infinity;
      for (const e of this.entities.values()) {
        const c = e.combat;
        if (!c || c.team === p.team || c.downed) continue;
        const cz = e.state.pos[2] + HIT_CENTER_Z;
        const d = Math.hypot(e.state.pos[0] - p.pos[0], e.state.pos[1] - p.pos[1], cz - p.pos[2]);
        if (d < PLAYER_RADIUS + p.radius + 0.35 && d < hitD) {
          hitD = d;
          hit = e;
        }
      }
      if (hit?.combat) {
        const res = applyDamage(hit.combat, p.damage, nowTick);
        const pos: Vec3 = [hit.state.pos[0], hit.state.pos[1], hit.state.pos[2] + HIT_CENTER_Z];
        if (res.dealt > 0) pushEvent(events, EventKind.Damage, hit.id, pos, res.dealt);
        if (res.downed) pushEvent(events, EventKind.Downed, hit.id, pos);
        if (res.killed) pushEvent(events, EventKind.Death, hit.id, pos);
        for (const t of p.tags) {
          const r = applyTag(hit.combat, t.kind, t.stacks ?? 1, nowTick);
          pushEvent(events, EventKind.TagApplied, hit.id, pos, tagBit(t.kind));
          if (r.conduction) this.chainConduction(p.team, hit.id, events);
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.ttl <= 0) this.projectiles.splice(i, 1);
    }
  }

  private expireWards(nowTick: number): void {
    for (let i = this.wards.length - 1; i >= 0; i--) {
      const w = this.wards[i] as WardWall;
      if (nowTick >= w.expireTick) {
        this.physics.removeWall(w.handle);
        this.wards.splice(i, 1);
      }
    }
  }

  private applyHasteAuras(nowTick: number): void {
    for (const e of this.entities.values()) {
      const c = e.combat;
      if (!c) continue;
      const aura = getArchetype(c.kind).hasteAura;
      if (aura === undefined || c.downed) continue;
      for (const o of this.entities.values()) {
        if (o.id === e.id || !o.combat || o.combat.team !== c.team) continue;
        const d = Math.hypot(o.state.pos[0] - e.state.pos[0], o.state.pos[1] - e.state.pos[1]);
        if (d <= aura) o.combat.hasteUntil = nowTick + 6;
      }
    }
  }

  private cleanup(nowTick: number, events: EventSink): CombatTickResult {
    const removed: number[] = [];
    for (const e of [...this.entities.values()]) {
      const c = e.combat;
      if (!c) continue;
      if (c.team === 1 && c.hp <= 0) {
        this.removeEntity(e.id);
        removed.push(e.id);
      } else if (c.team === 0 && c.downed && nowTick >= c.respawnTick) {
        // M3 placeholder for the M5 gravemark loop: stand back up at half HP
        c.downed = false;
        c.hp = Math.round(c.maxHp * 0.5);
        pushEvent(events, EventKind.Revive, e.id, [e.state.pos[0], e.state.pos[1], e.state.pos[2] + HIT_CENTER_Z]);
      }
    }
    return { removed };
  }

  // ----------------------------------------------------------- portals

  portalAt(feet: Vec3): PortalSpec | null {
    const probe: Vec3 = [feet[0], feet[1], feet[2] + 0.9];
    for (const p of this.portals) if (boxContains(p.trigger, probe)) return p;
    return null;
  }

  portalByKey(key: string): PortalSpec | null {
    return this.portals.find((p) => p.key === key) ?? null;
  }

  projectileList(): readonly Projectile[] {
    return this.projectiles;
  }

  dispose(): void {
    for (const e of this.entities.values()) e.body.dispose();
    this.entities.clear();
    this.physics.dispose();
  }
}

function tagBit(k: string): number {
  return k === "ignite" ? 1 : k === "soak" ? 2 : k === "shock" ? 4 : 8;
}

export type { CombatEvent };
