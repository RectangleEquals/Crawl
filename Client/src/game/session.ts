/**
 * Client game session (Docs/03): input-command sender, predictor, reconciler,
 * remote interpolator, transition handler. M3: parses the combat snapshot
 * (self HP/resource/tags/ability-readiness), maintains snapshot-driven entity
 * views (enemies included — no EntityJoin needed), drains combat events for
 * VFX, and tracks projectiles. Combat is server-authoritative; the client only
 * predicts MOVEMENT and renders everything else.
 */

import {
  AreaPhysics, MsgType, PROTOCOL_VERSION, SUNKEN_PARISH, Buttons, SelfFlag, EntityFlag,
  M4_GADGET_DEFS, areaComposeInput, chamberOptionsFor, composeArea, decode, encode, gadgetBit, generateChamber, planReach, stepCharacter,
  type AnyMsg, type AreaRef, type Capability, type ChamberData, type CharState, type CharacterBody,
  type CombatEvent, type EntityState, type InputCmd, type PlanArea, type ProjectileState,
  type ReachPlan, type SnapshotMsg, type Transport, type Vec3,
} from "@crawlstar/shared";
import { RemoteView, RenderClock } from "../net/interpolation.js";

export interface EntityView {
  id: number;
  kind: number;
  name: string;
  isBot: boolean;
  view: RemoteView;
  hpFrac: number;
  stateFlags: number;
  tagFlags: number;
  anim: number;
}

export interface SelfCombat {
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  downed: boolean;
  blocking: boolean;
  tagFlags: number;
  abilityReady: number;
  gadgetBits: number; // held Starwrought Instruments (M4)
}

export interface SessionHooks {
  onArea(ref: AreaRef, chamber: ChamberData): void;
  onTransitionBegin(ref: AreaRef): void;
  onTransitionEnd(): void;
  onRejected(reason: string): void;
}

export type Phase = "connecting" | "playing" | "transition";

const ERR_DECAY = 12;

export class GameSession {
  phase: Phase = "connecting";
  playerId = 0;
  areaRef: AreaRef | null = null;
  chamber: ChamberData | null = null;
  rttMs = 0;
  yaw = 0;
  worldSeed = "";
  reachIndex = 0;
  plan: ReachPlan | null = null;

  self: SelfCombat = { hp: 1, maxHp: 1, resource: 0, maxResource: 0, downed: false, blocking: false, tagFlags: 0, abilityReady: 0, gadgetBits: 0 };

  private mirror: AreaPhysics | null = null;
  private body: CharacterBody | null = null;
  private state: CharState = { pos: [0, 0, 0], velZ: 0, grounded: false };
  private errOffset: Vec3 = [0, 0, 0];

  private seq = 0;
  private pending: InputCmd[] = [];
  private readonly sentAt = new Map<number, number>();
  private readonly views = new Map<number, EntityView>();
  private readonly names = new Map<number, { name: string; isBot: boolean }>();
  private eventBuffer: CombatEvent[] = [];
  private latestProjectiles: ProjectileState[] = [];
  private readonly visited = new Set<number>(); // areas entered (Astrolabe memory)
  readonly clock = new RenderClock();

  constructor(
    private readonly transport: Transport,
    private readonly name: string,
    private readonly hooks: SessionHooks,
  ) {
    transport.onMessage((data) => this.onMessage(decode(data)));
    transport.send(encode({ type: MsgType.Hello, version: PROTOCOL_VERSION, name }));
  }

  // ------------------------------------------------------------ messages

  private onMessage(msg: AnyMsg): void {
    switch (msg.type) {
      case MsgType.Welcome:
        this.playerId = msg.playerId;
        this.worldSeed = msg.worldSeed;
        this.reachIndex = msg.reachIndex;
        this.plan = planReach(msg.worldSeed, { reachIndex: msg.reachIndex }); // reconstruct gates + gadget pickups + layouts
        this.enterArea(msg.area, msg.spawn, msg.spawnYaw);
        this.phase = "playing";
        break;
      case MsgType.Snapshot:
        if (this.phase === "playing") this.onSnapshot(msg);
        break;
      case MsgType.EntityJoin:
        if (msg.id !== this.playerId) this.names.set(msg.id, { name: msg.name, isBot: msg.isBot });
        break;
      case MsgType.EntityLeave:
        this.names.delete(msg.id);
        this.views.delete(msg.id);
        break;
      case MsgType.TransitionBegin:
        this.phase = "transition";
        this.views.clear();
        this.names.clear();
        this.hooks.onTransitionBegin(msg.area);
        this.enterArea(msg.area, msg.spawn, msg.spawnYaw);
        this.transport.send(encode({ type: MsgType.TransitionReady }));
        break;
      case MsgType.TransitionGo:
        this.phase = "playing";
        this.pending = [];
        this.sentAt.clear();
        this.hooks.onTransitionEnd();
        break;
      case MsgType.Ping:
        this.transport.send(encode({ type: MsgType.Pong, nonce: msg.nonce }));
        break;
      case MsgType.Reject:
        this.hooks.onRejected(msg.reason);
        break;
      default:
        break;
    }
  }

  private enterArea(ref: AreaRef, spawn: Vec3, spawnYaw: number): void {
    this.areaRef = ref;
    this.visited.add(ref.areaId); // the Astrolabe only journals ways you've seen
    // rebuild the SAME multi-room area the server composed (deterministic from
    // the plan the client reconstructed); fall back to a bare chamber if unknown.
    const pa = this.plan?.areas.get(ref.areaId);
    this.chamber = pa ? composeArea(areaComposeInput(pa)).chamber : generateChamber(SUNKEN_PARISH, ref.seed, chamberOptionsFor(ref));
    this.mirror?.dispose();
    this.mirror = new AreaPhysics(this.chamber.colliders);
    this.body = this.mirror.createCharacter(spawn);
    this.state = { pos: spawn, velZ: 0, grounded: false };
    this.errOffset = [0, 0, 0];
    this.yaw = spawnYaw;
    this.views.clear();
    this.hooks.onArea(ref, this.chamber);
  }

  // ------------------------------------------------------------ prediction

  /** One fixed 30 Hz client tick: build cmd, predict movement, send. */
  clientTick(moveX: number, moveY: number, buttons: number): void {
    if (this.phase !== "playing" || !this.body || !this.mirror) return;
    const downed = this.self.downed;
    const cmd: InputCmd = {
      seq: ++this.seq,
      moveX: downed ? 0 : moveX,
      moveY: downed ? 0 : moveY,
      yaw: this.yaw,
      buttons: downed ? 0 : buttons,
    };
    stepCharacter(this.body, this.state, cmd, false);
    this.mirror.step();
    this.pending.push(cmd);
    if (this.pending.length > 64) this.pending.shift();
    this.sentAt.set(cmd.seq, performance.now());
    if (this.sentAt.size > 128) {
      const oldest = this.sentAt.keys().next().value;
      if (oldest !== undefined) this.sentAt.delete(oldest);
    }
    this.transport.send(encode({ type: MsgType.InputBundle, cmds: this.pending.slice(-3) }));
  }

  private onSnapshot(msg: SnapshotMsg): void {
    if (!this.body || !this.mirror) return;
    this.clock.onSnapshot(msg.tick);

    // self combat
    this.self = {
      hp: msg.selfHp, maxHp: msg.selfMaxHp,
      resource: msg.selfResource, maxResource: msg.selfMaxResource,
      downed: (msg.selfFlags & SelfFlag.Downed) !== 0,
      blocking: (msg.selfFlags & SelfFlag.Blocking) !== 0,
      tagFlags: msg.selfTagFlags,
      abilityReady: msg.abilityReady,
      gadgetBits: msg.gadgetBits,
    };

    // RTT from input echo
    const sent = this.sentAt.get(msg.lastInputSeq);
    if (sent !== undefined) {
      const rtt = performance.now() - sent;
      this.rttMs = this.rttMs === 0 ? rtt : this.rttMs * 0.9 + rtt * 0.1;
      this.sentAt.delete(msg.lastInputSeq);
    }

    // reconcile movement
    const before = this.state.pos;
    this.pending = this.pending.filter((c) => c.seq > msg.lastInputSeq);
    this.state = { pos: msg.selfPos, velZ: msg.selfVelZ, grounded: msg.selfGrounded };
    this.body.setFeet(msg.selfPos);
    for (const cmd of this.pending) stepCharacter(this.body, this.state, cmd, true);
    this.errOffset = [
      this.errOffset[0] + before[0] - this.state.pos[0],
      this.errOffset[1] + before[1] - this.state.pos[1],
      this.errOffset[2] + before[2] - this.state.pos[2],
    ];
    if (Math.hypot(...this.errOffset) > 2.5) this.errOffset = [0, 0, 0];

    // snapshot-driven entity views (create/update/remove)
    const seen = new Set<number>();
    for (const e of msg.entities) {
      seen.add(e.id);
      this.upsertView(e, msg.tick);
    }
    for (const id of [...this.views.keys()]) if (!seen.has(id)) this.views.delete(id);

    if (msg.events.length) this.eventBuffer.push(...msg.events);
    this.latestProjectiles = msg.projectiles;
  }

  private upsertView(e: EntityState, tick: number): void {
    let v = this.views.get(e.id);
    if (!v) {
      const meta = this.names.get(e.id);
      v = {
        id: e.id, kind: e.kind,
        name: meta?.name ?? kindLabel(e.kind),
        isBot: meta?.isBot ?? true,
        view: new RemoteView(), hpFrac: e.hpFrac, stateFlags: e.stateFlags, tagFlags: e.tagFlags, anim: e.anim,
      };
      this.views.set(e.id, v);
    }
    v.kind = e.kind;
    v.hpFrac = e.hpFrac;
    v.stateFlags = e.stateFlags;
    v.tagFlags = e.tagFlags;
    v.anim = e.anim;
    v.view.push(tick, e.pos, e.yaw, e.anim);
  }

  // ------------------------------------------------------------ render access

  renderPos(dt: number): Vec3 {
    const k = Math.exp(-ERR_DECAY * dt);
    this.errOffset = [this.errOffset[0] * k, this.errOffset[1] * k, this.errOffset[2] * k];
    return [this.state.pos[0] + this.errOffset[0], this.state.pos[1] + this.errOffset[1], this.state.pos[2] + this.errOffset[2]];
  }

  get grounded(): boolean {
    return this.state.grounded;
  }
  get reconciliationError(): number {
    return Math.hypot(...this.errOffset);
  }

  entityViews(): readonly EntityView[] {
    return [...this.views.values()];
  }

  /** The generated plan for the area the player is currently in (M4). */
  currentArea(): PlanArea | null {
    if (!this.plan || !this.areaRef) return null;
    return this.plan.areas.get(this.areaRef.areaId) ?? null;
  }

  /** Is gadget bit `b` (M4_GADGET_DEFS index) currently held by the expedition? */
  hasGadget(b: number): boolean {
    return (this.self.gadgetBits & (1 << b)) !== 0;
  }

  /** Instrument HUD status (name + whether held). */
  gadgetStatus(): { name: string; held: boolean }[] {
    return M4_GADGET_DEFS.map((g, i) => ({ name: g.name, held: this.hasGadget(i) }));
  }

  /**
   * If the player (feet in WORLD coords) is standing at a gated doorway they
   * cannot yet pass, the display name of the Instrument it needs — else null.
   * The metroidvania "sealed way" hint (Docs/06); also the remembered-lock the
   * Astrolabe will one day journal.
   */
  sealedPassage(feetWorld: Vec3): string | null {
    const area = this.currentArea();
    if (!area || !this.chamber) return null;
    for (const portal of this.chamber.portals) {
      const link = area.links.get(portal.key);
      if (!link || link.requiresCap == null) continue;
      if (this.hasGadget(gadgetBit(link.requiresCap))) continue; // already openable
      const t = portal.trigger;
      const p = feetWorld;
      if (p[0] >= t.min[0] && p[0] <= t.max[0] && p[1] >= t.min[1] && p[1] <= t.max[1]) {
        return this.gadgetName(link.requiresCap);
      }
    }
    return null;
  }

  /**
   * Cartographer's Astrolabe (Docs/06): the remembered-lock journal — every
   * gated doorway the party has SEEN (in a visited area) but cannot yet open,
   * with the Instrument it needs. This is what makes backtracking a guided loop;
   * an entry clears the moment its Instrument is collected.
   */
  rememberedLocks(): { areaName: string; gadget: string }[] {
    if (!this.plan) return [];
    const seen = new Set<string>();
    const out: { areaName: string; gadget: string }[] = [];
    for (const areaId of this.visited) {
      const area = this.plan.areas.get(areaId);
      if (!area) continue;
      for (const [pk, link] of area.links) {
        if (link.requiresCap == null || this.hasGadget(gadgetBit(link.requiresCap))) continue;
        const key = `${areaId}:${pk}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ areaName: area.ref.name, gadget: this.gadgetName(link.requiresCap) });
      }
    }
    return out;
  }

  private gadgetName(cap: Capability): string {
    const def = M4_GADGET_DEFS.find((g) => g.capability === cap);
    return def ? def.name : cap;
  }

  /** Party members (Wardens) for the HUD roster. */
  rosterNames(): string[] {
    const out: string[] = [];
    for (const m of this.names.values()) out.push(m.name);
    return out;
  }

  drainEvents(): CombatEvent[] {
    const evs = this.eventBuffer;
    this.eventBuffer = [];
    return evs;
  }

  projectiles(): readonly ProjectileState[] {
    return this.latestProjectiles;
  }

  cameraRay(origin: Vec3, dir: Vec3, maxDist: number): number | null {
    return this.mirror ? this.mirror.castRay(origin, dir, maxDist) : null;
  }

  dispose(): void {
    this.transport.close();
    this.mirror?.dispose();
  }
}

const KIND_LABELS = ["Warden", "Slag-revenant", "Shardspitter", "Carrion-herald"];
function kindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? "Thing";
}

export { EntityFlag };
