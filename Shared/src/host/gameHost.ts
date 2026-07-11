/**
 * GameHost: the entire authoritative game server, transport-agnostic
 * (Docs/02 §5). Server/ wraps it in ws; the singleplayer Web Worker wraps it
 * in a MessageChannel. Input-command model per Docs/03 §3: clients send
 * inputs only; this host derives all state.
 */

import { buildDemoWorld, type AreaDef, type DemoWorld } from "../world/demoWorld.js";
import { AreaIsland, type IslandEntity } from "../sim/area.js";
import { initPhysics } from "../sim/physics.js";
import { Rng } from "../math/rng.js";
import { WanderBot } from "./bot.js";
import { MODULE } from "../art/kit.js";
import {
  MsgType, PROTOCOL_VERSION, decode, encode,
  type AnyMsg, type EntityState, type InputCmd, type ServerMsg,
} from "../protocol/messages.js";
import type { ClientConnection, ConnectionListener } from "../protocol/transport.js";
import { MAX_CMDS_PER_SECOND, TICK_MS } from "../sim/constants.js";

const INPUT_QUEUE_CAP = 8;
const HOLD_LAST_TICKS = 6; // starve grace before decaying to neutral (Docs/03 §3)

interface Session {
  conn: ClientConnection;
  playerId: number;
  name: string;
  areaId: number;
  entity: IslandEntity | null; // null while transitioning
  queue: InputCmd[];
  lastAppliedSeq: number;
  starvedTicks: number;
  cmdBudget: number; // refilled per second (anti-speedhack)
  pendingTransition: { targetAreaId: number; targetPortalKey: string } | null;
}

interface BotSlot {
  bot: WanderBot;
  areaId: number;
  entity: IslandEntity;
}

export interface GameHostOptions {
  seed?: string;
  botCount?: number;
  log?: (line: string) => void;
}

export class GameHost {
  private readonly world: DemoWorld;
  private readonly islands = new Map<number, AreaIsland>();
  private readonly sessions = new Map<number, Session>(); // by conn id
  private readonly bots: BotSlot[] = [];
  private readonly log: (line: string) => void;
  private nextPlayerId = 1;
  private tick = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private budgetTimer: ReturnType<typeof setInterval> | null = null;

  constructor(listener: ConnectionListener, opts: GameHostOptions = {}) {
    this.log = opts.log ?? (() => undefined);
    this.world = buildDemoWorld(opts.seed ?? "m2-demo");
    for (const [areaId, def] of this.world.areas) {
      this.islands.set(areaId, new AreaIsland(def.chamber));
    }
    const botCount = opts.botCount ?? 1;
    const rng = new Rng(`${opts.seed ?? "m2-demo"}:bots`);
    for (let i = 0; i < botCount; i++) this.spawnBot(rng.fork(`bot-${i}`), i);
    listener.onConnection((conn) => this.onConnection(conn));
  }

  /** Must be awaited before start(): loads the Rapier WASM. */
  static ready(): Promise<unknown> {
    return initPhysics();
  }

  private area(areaId: number): { def: AreaDef; island: AreaIsland } {
    const def = this.world.areas.get(areaId);
    const island = this.islands.get(areaId);
    if (!def || !island) throw new Error(`unknown area ${areaId}`);
    return { def, island };
  }

  private spawnBot(rng: Rng, index: number): void {
    const areaId = this.world.startAreaId;
    const { def, island } = this.area(areaId);
    const id = 500 + index;
    const spawn = def.chamber.spawn;
    const entity = island.addEntity(id, `Wayfarer-${index + 1} [bot]`, true, [spawn.position[0] + 1.2, spawn.position[1] + 1.5, spawn.position[2]], spawn.yaw);
    // wander the open middle of the nave (cells 1..W-1 / 1..L-1, inset)
    this.bots.push({
      bot: new WanderBot(id, rng, {
        min: [1.2, 1.2, 0],
        max: [7 * MODULE - 1.2, 11 * MODULE - 1.2, 0],
      }),
      areaId,
      entity,
    });
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
          if (cmd.seq <= (session.queue[session.queue.length - 1]?.seq ?? session.lastAppliedSeq)) continue; // redundant resend
          if (session.cmdBudget <= 0) break; // speedhack budget exhausted: excess ignored
          session.cmdBudget -= 1;
          if (session.queue.length >= INPUT_QUEUE_CAP) session.queue.shift();
          session.queue.push(cmd);
        }
        break;
      }
      case MsgType.TransitionReady: {
        this.completeTransition(session);
        break;
      }
      case MsgType.Pong:
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
    // offset spawns slightly so simultaneous joins don't overlap
    const jitter = (playerId % 5) * 0.7 - 1.4;
    const feet = [def.chamber.spawn.position[0] + jitter, def.chamber.spawn.position[1], def.chamber.spawn.position[2]] as const;
    const entity = island.addEntity(playerId, name, false, feet, def.chamber.spawn.yaw);

    const session: Session = {
      conn,
      playerId,
      name,
      areaId,
      entity,
      queue: [],
      lastAppliedSeq: 0,
      starvedTicks: 0,
      cmdBudget: MAX_CMDS_PER_SECOND,
      pendingTransition: null,
    };
    this.sessions.set(conn.id, session);

    this.send(conn, {
      type: MsgType.Welcome,
      playerId,
      area: def.ref,
      spawn: feet,
      spawnYaw: def.chamber.spawn.yaw,
    });
    // roster: tell newcomer about everyone here; tell everyone about newcomer
    for (const other of island.entities.values()) {
      if (other.id === playerId) continue;
      this.send(conn, { type: MsgType.EntityJoin, id: other.id, name: other.name, isBot: other.isBot });
    }
    this.broadcastArea(areaId, { type: MsgType.EntityJoin, id: playerId, name, isBot: false }, playerId);
    this.log(`join: ${name} (#${playerId})`);
  }

  private dropSession(connId: number): void {
    const session = this.sessions.get(connId);
    if (!session) return;
    this.sessions.delete(connId);
    if (session.entity) {
      this.area(session.areaId).island.removeEntity(session.playerId);
      this.broadcastArea(session.areaId, { type: MsgType.EntityLeave, id: session.playerId });
    }
    this.log(`leave: ${session.name} (#${session.playerId})`);
  }

  // ---------------------------------------------------------------- transitions

  private beginTransition(session: Session, targetAreaId: number, targetPortalKey: string): void {
    if (!session.entity) return;
    const from = this.area(session.areaId);
    from.island.removeEntity(session.playerId);
    this.broadcastArea(session.areaId, { type: MsgType.EntityLeave, id: session.playerId });
    session.entity = null;
    session.queue = [];
    session.pendingTransition = { targetAreaId, targetPortalKey };

    const to = this.area(targetAreaId);
    const portal = this.islands.get(targetAreaId) ? to.island.portalByKey(targetPortalKey) : null;
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
    session.entity = island.addEntity(session.playerId, session.name, false, spawn, spawnYaw);
    session.lastAppliedSeq = 0; // client resets seq on transition
    // roster sync for the new area
    for (const other of island.entities.values()) {
      if (other.id === session.playerId) continue;
      this.send(session.conn, { type: MsgType.EntityJoin, id: other.id, name: other.name, isBot: other.isBot });
    }
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
      if (nowMs() - next > 250) next = nowMs(); // hard stall: resync rather than spiral
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

  private stepTick(): void {
    this.tick += 1;

    // 1. consume one input per player (hold-last on starvation, then neutral)
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity) continue;
      let cmd = session.queue.shift() ?? null;
      if (cmd) {
        session.starvedTicks = 0;
        session.lastAppliedSeq = cmd.seq;
      } else if (entity.lastCmd) {
        session.starvedTicks += 1;
        cmd =
          session.starvedTicks <= HOLD_LAST_TICKS
            ? { ...entity.lastCmd, buttons: 0, seq: session.lastAppliedSeq }
            : { seq: session.lastAppliedSeq, moveX: 0, moveY: 0, yaw: entity.yaw, buttons: 0 };
      }
      if (cmd) this.area(session.areaId).island.applyCmd(entity, cmd);
    }

    // 2. bots think and move
    for (const slot of this.bots) {
      const island = this.islands.get(slot.areaId);
      if (!island) continue;
      island.applyCmd(slot.entity, slot.bot.think(island, slot.entity));
    }

    // 3. physics
    for (const island of this.islands.values()) island.step();

    // 4. portal checks (players only, M2)
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity || session.pendingTransition) continue;
      const { def, island } = this.area(session.areaId);
      const portal = island.portalAt(entity.state.pos);
      if (!portal) continue;
      const link = def.links.get(portal.key);
      if (link) this.beginTransition(session, link.targetAreaId, link.targetPortalKey);
    }

    // 5. snapshots, per client, from its island
    for (const session of this.sessions.values()) {
      const entity = session.entity;
      if (!entity) continue;
      const island = this.area(session.areaId).island;
      const entities: EntityState[] = [];
      for (const other of island.entities.values()) {
        if (other.id === session.playerId) continue;
        entities.push({ id: other.id, pos: other.state.pos, yaw: other.yaw, anim: other.anim });
      }
      this.send(session.conn, {
        type: MsgType.Snapshot,
        tick: this.tick,
        lastInputSeq: session.lastAppliedSeq,
        selfPos: entity.state.pos,
        selfVelZ: entity.state.velZ,
        selfGrounded: entity.state.grounded,
        entities,
      });
    }
  }

  // ---------------------------------------------------------------- io

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

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
