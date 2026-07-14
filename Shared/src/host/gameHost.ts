/**
 * GameHost: the entire authoritative game server, transport-agnostic
 * (Docs/02 §5). Input-command model (Docs/03 §3): clients send inputs only;
 * this host derives all state. M3 adds combat — enemy packs, an ally Warden
 * bot, the tag/ability/projectile sim, lag-comp via per-session RTT, and the
 * extended combat snapshot.
 */

import { buildDemoWorld, type AreaDef, type DemoWorld } from "../world/demoWorld.js";
import { AreaIsland, type IslandEntity } from "../sim/area.js";
import { initPhysics } from "../sim/physics.js";
import { Rng } from "../math/rng.js";
import { combatThink } from "../sim/ai/brains.js";
import { makeCombatState, tagFlags } from "../sim/combat/state.js";
import { getArchetype, kindIndex } from "../data/archetypes.js";
import type { CombatState } from "../sim/combat/state.js";
import type { CombatEvent } from "../sim/combat/events.js";
import {
  EntityFlag, MsgType, PROTOCOL_VERSION, SelfFlag, decode, encode,
  type AnyMsg, type EntityState, type InputCmd, type ProjectileState, type ServerMsg,
} from "../protocol/messages.js";
import type { ClientConnection, ConnectionListener } from "../protocol/transport.js";
import { HITBOX_HISTORY, MAX_CMDS_PER_SECOND, TICK_MS } from "../sim/constants.js";

const INPUT_QUEUE_CAP = 8;
const HOLD_LAST_TICKS = 6;
const PING_INTERVAL_TICKS = 15;

interface Session {
  conn: ClientConnection;
  playerId: number;
  name: string;
  areaId: number;
  entity: IslandEntity | null;
  queue: InputCmd[];
  lastAppliedSeq: number;
  starvedTicks: number;
  cmdBudget: number;
  pendingTransition: { targetAreaId: number; targetPortalKey: string } | null;
  rttMs: number;
  pingNonce: number;
  pingSentAt: number;
}

interface AiSlot {
  id: number;
  areaId: number;
}

export interface GameHostOptions {
  seed?: string;
  /** Ally Warden bots spawned beside the player (default 1; 0 = fight solo). */
  botCount?: number;
  /** Enemies in the starting-area pack (default 4). */
  enemyCount?: number;
  /** Multiplies AI ability cooldowns (default 1; >1 = enemies/allies attack less often). */
  cooldownScale?: number;
  log?: (line: string) => void;
}

/** Read-only public snapshot for the game service's REST API (no secrets). */
export interface GamePublicInfo {
  server: { tick: number; uptimeSec: number; players: number; areas: number };
  areas: { id: number; name: string; players: number; enemies: number; allies: number }[];
  players: { id: number; name: string; area: number; kind: string }[];
}

const ENEMY_FAMILY_CYCLE = ["slag-revenant", "shardspitter", "carrion-herald"];

function latencyTicks(rttMs: number): number {
  return Math.min(HITBOX_HISTORY - 1, Math.max(0, Math.round(rttMs / 2 / TICK_MS)));
}

export class GameHost {
  private readonly world: DemoWorld;
  private readonly islands = new Map<number, AreaIsland>();
  private readonly sessions = new Map<number, Session>();
  private readonly players = new Map<number, Session>(); // by playerId
  private readonly ai: AiSlot[] = [];
  private readonly log: (line: string) => void;
  private readonly rng: Rng;
  private nextPlayerId = 1;
  private nextEnemyId = 1000;
  private nextAllyId = 500;
  private readonly allyCount: number;
  private readonly cooldownScale: number;
  private readonly packs = new Map<number, [string, [number, number, number]][]>();
  private tick = 0;
  private readonly startedAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private budgetTimer: ReturnType<typeof setInterval> | null = null;

  constructor(listener: ConnectionListener, opts: GameHostOptions = {}) {
    this.log = opts.log ?? (() => undefined);
    const seed = opts.seed ?? "m3-demo";
    this.rng = new Rng(seed);
    this.world = buildDemoWorld(seed);
    for (const [areaId, def] of this.world.areas) this.islands.set(areaId, new AreaIsland(def.chamber));

    // The ally Warden(s) and the packs are (re)spawned when a player enters an
    // area (below) — so a lone ally can't farm packs before anyone arrives,
    // and every session/clear gets a fresh fight. Reach-1 Furrowmouth packs
    // (Docs/08 §5: 2–4 per pack, Barony-lethal), sizes configurable for testing.
    this.allyCount = Math.max(0, Math.floor(opts.botCount ?? 1));
    this.cooldownScale = Math.max(0.1, opts.cooldownScale ?? 1);
    const enemyCount = Math.max(0, Math.floor(opts.enemyCount ?? 4));
    this.packs.set(this.world.startAreaId, buildPack(enemyCount));
    this.packs.set(2, buildPack(Math.min(2, enemyCount)));
    this.log(`config: allies=${this.allyCount} enemies=${enemyCount} cooldownScale=${this.cooldownScale}`);

    listener.onConnection((conn) => this.onConnection(conn));
  }

  static ready(): Promise<unknown> {
    return initPhysics();
  }

  /**
   * Read-only public snapshot (game-service REST API). Non-performance-critical
   * structural data; no secrets. Cheap to compute (a read over current state);
   * called on demand by REST, off the tick loop.
   */
  publicInfo(): GamePublicInfo {
    const areas: GamePublicInfo["areas"] = [];
    for (const [id, def] of this.world.areas) {
      const island = this.islands.get(id);
      let enemies = 0;
      let allies = 0;
      if (island) {
        for (const e of island.entities.values()) {
          if (e.combat?.team === 1) enemies += 1;
          else if (e.isBot && e.combat?.team === 0) allies += 1;
        }
      }
      const players = [...this.sessions.values()].filter((s) => s.areaId === id && s.entity).length;
      areas.push({ id, name: def.ref.name, players, enemies, allies });
    }
    const players = [...this.sessions.values()]
      .filter((s) => s.entity)
      .map((s) => ({ id: s.playerId, name: s.name, area: s.areaId, kind: "warden" }));
    return {
      server: {
        tick: this.tick,
        uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
        players: players.length,
        areas: this.world.areas.size,
      },
      areas,
      players,
    };
  }

  private area(areaId: number): { def: AreaDef; island: AreaIsland } {
    const def = this.world.areas.get(areaId);
    const island = this.islands.get(areaId);
    if (!def || !island) throw new Error(`unknown area ${areaId}`);
    return { def, island };
  }

  private makeCombat(kind: string, ai = false): CombatState {
    const c = makeCombatState(getArchetype(kind).base);
    if (ai) c.cooldownScale = this.cooldownScale;
    return c;
  }

  /** Respawn the area's pack if it currently holds no living enemies. */
  private ensurePopulated(areaId: number): void {
    const island = this.islands.get(areaId);
    const pack = this.packs.get(areaId);
    if (!island || !pack) return;
    if ([...island.entities.values()].some((e) => e.combat?.team === 1)) return;
    for (const [kind, pos] of pack) {
      const id = this.nextEnemyId++;
      island.addEntity(id, kind, true, pos, Math.PI, this.makeCombat(kind, true));
      this.ai.push({ id, areaId });
    }
  }

  /** Ensure `allyCount` ally Warden bots exist in the area, near the player. */
  private ensureAlly(areaId: number, feet: [number, number, number]): void {
    if (this.allyCount <= 0) return;
    const island = this.islands.get(areaId);
    if (!island) return;
    const have = [...island.entities.values()].filter((e) => e.isBot && e.combat?.team === 0).length;
    for (let i = have; i < this.allyCount; i++) {
      const id = this.nextAllyId++;
      const name = this.allyCount > 1 ? `Warden-ally ${i + 1} [bot]` : "Warden-ally [bot]";
      const off: [number, number, number] = [feet[0] + 1.2 + (i % 3) * 0.9, feet[1] + 1.0 + Math.floor(i / 3) * 0.9, feet[2]];
      island.addEntity(id, name, true, off, 0, this.makeCombat("warden", true));
      this.ai.push({ id, areaId });
      this.broadcastArea(areaId, { type: MsgType.EntityJoin, id, name, isBot: true });
    }
  }

  // ---------------------------------------------------------------- sessions

  private onConnection(conn: ClientConnection): void {
    conn.onMessage((data) => {
      let msg: AnyMsg;
      try {
        msg = decode(data);
      } catch {
        conn.close();
        return;
      }
      this.onMessage(conn, msg);
    });
    conn.onClose(() => this.dropSession(conn.id));
  }

  private onMessage(conn: ClientConnection, msg: AnyMsg): void {
    const session = this.sessions.get(conn.id);
    if (!session) {
      if (msg.type !== MsgType.Hello) return;
      if (msg.version !== PROTOCOL_VERSION) {
        this.send(conn, { type: MsgType.Reject, reason: `protocol mismatch (server ${PROTOCOL_VERSION})` });
        conn.close();
        return;
      }
      this.acceptSession(conn, msg.name);
      return;
    }
    switch (msg.type) {
      case MsgType.InputBundle: {
        if (!session.entity || session.pendingTransition) break;
        for (const cmd of msg.cmds) {
          if (cmd.seq <= (session.queue[session.queue.length - 1]?.seq ?? session.lastAppliedSeq)) continue;
          if (session.cmdBudget <= 0) break;
          session.cmdBudget -= 1;
          if (session.queue.length >= INPUT_QUEUE_CAP) session.queue.shift();
          session.queue.push(cmd);
        }
        break;
      }
      case MsgType.TransitionReady:
        this.completeTransition(session);
        break;
      case MsgType.Pong:
        if (msg.nonce === session.pingNonce) {
          const rtt = nowMs() - session.pingSentAt;
          session.rttMs = session.rttMs === 0 ? rtt : session.rttMs * 0.8 + rtt * 0.2;
        }
        break;
      default:
        break;
    }
  }

  private acceptSession(conn: ClientConnection, rawName: string): void {
    const name = (rawName || "Pilgrim").slice(0, 24);
    const playerId = this.nextPlayerId++;
    const areaId = this.world.startAreaId;
    const { def, island } = this.area(areaId);
    this.ensurePopulated(areaId); // fresh pack if the area was cleared
    const jitter = (playerId % 5) * 0.7 - 1.4;
    const feet = [def.chamber.spawn.position[0] + jitter, def.chamber.spawn.position[1], def.chamber.spawn.position[2]] as const;
    const entity = island.addEntity(playerId, name, false, feet, def.chamber.spawn.yaw, this.makeCombat("warden"));
    this.ensureAlly(areaId, [feet[0] + 1.6, feet[1] + 1.0, feet[2]]);

    const session: Session = {
      conn, playerId, name, areaId, entity,
      queue: [], lastAppliedSeq: 0, starvedTicks: 0, cmdBudget: MAX_CMDS_PER_SECOND,
      pendingTransition: null, rttMs: 0, pingNonce: 0, pingSentAt: 0,
    };
    this.sessions.set(conn.id, session);
    this.players.set(playerId, session);

    this.send(conn, { type: MsgType.Welcome, playerId, area: def.ref, spawn: feet, spawnYaw: def.chamber.spawn.yaw });
    this.sendRosterTo(conn, island, playerId);
    this.broadcastArea(areaId, { type: MsgType.EntityJoin, id: playerId, name, isBot: false }, playerId);
    this.log(`join: ${name} (#${playerId})`);
  }

  /** Roster = players + ally bots (for HUD/nameplates). Enemies are avatar-only, driven by snapshots. */
  private sendRosterTo(conn: ClientConnection, island: AreaIsland, exceptId: number): void {
    for (const other of island.entities.values()) {
      if (other.id === exceptId || other.combat?.team === 1) continue;
      this.send(conn, { type: MsgType.EntityJoin, id: other.id, name: other.name, isBot: other.isBot });
    }
  }

  private dropSession(connId: number): void {
    const session = this.sessions.get(connId);
    if (!session) return;
    this.sessions.delete(connId);
    this.players.delete(session.playerId);
    if (session.entity) {
      this.area(session.areaId).island.removeEntity(session.playerId);
      this.broadcastArea(session.areaId, { type: MsgType.EntityLeave, id: session.playerId });
    }
    this.log(`leave: ${session.name} (#${session.playerId})`);
  }

  // ---------------------------------------------------------------- transitions

  private beginTransition(session: Session, targetAreaId: number, targetPortalKey: string): void {
    if (!session.entity) return;
    this.area(session.areaId).island.removeEntity(session.playerId);
    this.broadcastArea(session.areaId, { type: MsgType.EntityLeave, id: session.playerId });
    session.entity = null;
    session.queue = [];
    session.pendingTransition = { targetAreaId, targetPortalKey };

    const to = this.area(targetAreaId);
    const portal = to.island.portalByKey(targetPortalKey);
    const spawn = portal ? portal.spawn : to.def.chamber.spawn.position;
    const spawnYaw = portal ? portal.spawnYaw : to.def.chamber.spawn.yaw;
    this.send(session.conn, { type: MsgType.TransitionBegin, area: to.def.ref, spawn, spawnYaw });
  }

  private completeTransition(session: Session): void {
    const pending = session.pendingTransition;
    if (!pending) return;
    session.pendingTransition = null;
    const { def, island } = this.area(pending.targetAreaId);
    const portal = island.portalByKey(pending.targetPortalKey);
    const spawn = portal ? portal.spawn : def.chamber.spawn.position;
    const spawnYaw = portal ? portal.spawnYaw : def.chamber.spawn.yaw;
    session.areaId = pending.targetAreaId;
    this.ensurePopulated(pending.targetAreaId);
    session.entity = island.addEntity(session.playerId, session.name, false, spawn, spawnYaw, this.makeCombat("warden"));
    this.ensureAlly(pending.targetAreaId, [spawn[0] + 1.6, spawn[1] + 1.0, spawn[2]]);
    session.lastAppliedSeq = 0;
    this.sendRosterTo(session.conn, island, session.playerId);
    this.broadcastArea(session.areaId, { type: MsgType.EntityJoin, id: session.playerId, name: session.name, isBot: false }, session.playerId);
    this.send(session.conn, { type: MsgType.TransitionGo });
  }

  // ---------------------------------------------------------------- tick loop

  start(): void {
    if (this.timer) return;
    let next = nowMs() + TICK_MS;
    const loop = (): void => {
      this.stepTick();
      next += TICK_MS;
      if (nowMs() - next > 250) next = nowMs();
      this.timer = setTimeout(loop, Math.max(0, next - nowMs()));
    };
    this.timer = setTimeout(loop, TICK_MS);
    this.budgetTimer = setInterval(() => {
      for (const s of this.sessions.values()) s.cmdBudget = MAX_CMDS_PER_SECOND;
    }, 1000);
    this.log(`host started (tick ${TICK_MS.toFixed(1)} ms)`);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.budgetTimer) clearInterval(this.budgetTimer);
    this.timer = null;
    this.budgetTimer = null;
    for (const island of this.islands.values()) island.dispose();
  }

  private latencyOf(entityId: number): number {
    const s = this.players.get(entityId);
    return s ? latencyTicks(s.rttMs) : 0;
  }

  private stepTick(): void {
    this.tick += 1;
    const now = this.tick;

    // 1. player inputs (hold-last on starvation, then neutral)
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity) continue;
      let cmd = session.queue.shift() ?? null;
      if (cmd) {
        session.starvedTicks = 0;
        session.lastAppliedSeq = cmd.seq;
      } else if (entity.lastCmd) {
        session.starvedTicks += 1;
        cmd = session.starvedTicks <= HOLD_LAST_TICKS
          ? { ...entity.lastCmd, buttons: 0, seq: session.lastAppliedSeq }
          : { seq: session.lastAppliedSeq, moveX: 0, moveY: 0, yaw: entity.yaw, buttons: 0 };
      }
      if (cmd) this.area(session.areaId).island.applyCmd(entity, cmd);
    }

    // 2. AI inputs (allies + enemies), same InputCmd path
    for (const slot of this.ai) {
      const island = this.islands.get(slot.areaId);
      const entity = island?.entities.get(slot.id);
      if (!island || !entity) continue;
      island.applyCmd(entity, combatThink(entity, island, now));
    }

    // 3. physics
    for (const island of this.islands.values()) island.step();

    // 4. combat, per island
    const eventsByArea = new Map<number, CombatEvent[]>();
    for (const [areaId, island] of this.islands) {
      const events: CombatEvent[] = [];
      const res = island.tickCombat(now, (id) => this.latencyOf(id), events);
      eventsByArea.set(areaId, events);
      for (const deadId of res.removed) {
        const idx = this.ai.findIndex((a) => a.id === deadId);
        if (idx >= 0) this.ai.splice(idx, 1);
      }
    }

    // 5. portals (players only, not while downed)
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity || session.pendingTransition || entity.combat?.downed) continue;
      const { def, island } = this.area(session.areaId);
      const portal = island.portalAt(entity.state.pos);
      if (!portal) continue;
      const link = def.links.get(portal.key);
      if (link) this.beginTransition(session, link.targetAreaId, link.targetPortalKey);
    }

    // 6. snapshots + events, per client
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity) continue;
      this.sendSnapshot(session, entity, eventsByArea.get(session.areaId) ?? []);
    }

    // 7. RTT pings
    if (now % PING_INTERVAL_TICKS === 0) {
      for (const session of this.sessions.values()) {
        session.pingNonce = (session.pingNonce + 1) & 0xffffffff;
        session.pingSentAt = nowMs();
        this.send(session.conn, { type: MsgType.Ping, nonce: session.pingNonce });
      }
    }
  }

  private sendSnapshot(session: Session, entity: IslandEntity, events: CombatEvent[]): void {
    const island = this.area(session.areaId).island;
    const c = entity.combat!;
    const entities: EntityState[] = [];
    for (const other of island.entities.values()) {
      if (other.id === session.playerId || !other.combat) continue;
      const oc = other.combat;
      entities.push({
        id: other.id, pos: other.state.pos, yaw: other.yaw, anim: other.anim,
        kind: kindIndex(oc.kind),
        hpFrac: Math.max(0, Math.min(255, Math.round((oc.hp / oc.maxHp) * 255))),
        stateFlags: entityFlags(oc),
        tagFlags: tagFlags(oc),
      });
    }
    const projectiles: ProjectileState[] = island.projectileList().map((p) => ({
      id: p.id, kind: p.kind === "cinder" ? 1 : 0, pos: p.pos,
    }));

    let selfFlags = 0;
    if (c.downed) selfFlags |= SelfFlag.Downed;
    if (c.blocking) selfFlags |= SelfFlag.Blocking;

    this.send(session.conn, {
      type: MsgType.Snapshot,
      tick: this.tick,
      lastInputSeq: session.lastAppliedSeq,
      selfPos: entity.state.pos,
      selfVelZ: entity.state.velZ,
      selfGrounded: entity.state.grounded,
      selfHp: c.hp, selfMaxHp: c.maxHp,
      selfResource: c.resource, selfMaxResource: c.maxResource,
      selfFlags, selfTagFlags: tagFlags(c),
      abilityReady: abilityReadyBits(c, this.tick),
      entities, events, projectiles,
    });
  }

  private send(conn: ClientConnection, msg: ServerMsg): void {
    conn.send(encode(msg));
  }

  private broadcastArea(areaId: number, msg: ServerMsg, exceptPlayerId?: number): void {
    const data = encode(msg);
    for (const s of this.sessions.values()) {
      if (s.areaId !== areaId || !s.entity) continue;
      if (exceptPlayerId !== undefined && s.playerId === exceptPlayerId) continue;
      s.conn.send(data);
    }
  }
}

function entityFlags(c: CombatState): number {
  let f = 0;
  if (c.downed) f |= EntityFlag.Downed;
  if (c.blocking) f |= EntityFlag.Blocking;
  if (c.ability && (c.ability.phase === "windup" || c.ability.phase === "active")) f |= EntityFlag.Attacking;
  if (c.tags.launch) f |= EntityFlag.Launched;
  return f;
}

function abilityReadyBits(c: CombatState, tick: number): number {
  let bits = 0;
  for (const ab of getArchetype(c.kind).abilities) {
    const ready = tick >= (c.cooldowns[ab.id] ?? 0) && c.resource >= ab.cost;
    if (ready && ab.castIndex >= 0 && ab.castIndex < 8) bits |= 1 << ab.castIndex;
  }
  return bits;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Lay out `n` enemies across the north half of the nave (Docs/08 §5 packs). */
function buildPack(n: number): [string, [number, number, number]][] {
  const out: [string, [number, number, number]][] = [];
  for (let i = 0; i < n; i++) {
    const kind = i === 0 ? "slag-revenant" : (ENEMY_FAMILY_CYCLE[i % ENEMY_FAMILY_CYCLE.length] as string);
    const x = 4 + (i % 3) * 2.6;
    const y = 13 + Math.floor(i / 3) * 2.4;
    out.push([kind, [x, y, 0]]);
  }
  return out;
}
