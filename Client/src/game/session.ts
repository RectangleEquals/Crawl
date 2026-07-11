/**
 * Client game session (Docs/03): input-command sender, predictor,
 * reconciler, remote interpolator, transition handler. Talks to any
 * Transport (ws or integrated worker) — it cannot tell the difference.
 */

import {
  AreaPhysics, MsgType, PROTOCOL_VERSION, SUNKEN_PARISH, Buttons,
  chamberOptionsFor, decode, encode, generateChamber, stepCharacter,
  type AnyMsg, type AreaRef, type ChamberData, type CharState,
  type CharacterBody, type InputCmd, type Transport, type Vec3,
} from "@crawlstar/shared";
import { RemoteView, RenderClock } from "../net/interpolation.js";

export interface RemoteEntity {
  id: number;
  name: string;
  isBot: boolean;
  view: RemoteView;
}

export interface SessionHooks {
  /** A new area is active: rebuild the render scene from this chamber. */
  onArea(ref: AreaRef, chamber: ChamberData): void;
  onRoster(remotes: readonly RemoteEntity[]): void;
  onTransitionBegin(ref: AreaRef): void;
  onTransitionEnd(): void;
  onRejected(reason: string): void;
}

export type Phase = "connecting" | "playing" | "transition";

const ERR_DECAY = 12; // 1/s — reconciliation error smoothing rate

export class GameSession {
  phase: Phase = "connecting";
  playerId = 0;
  areaRef: AreaRef | null = null;
  chamber: ChamberData | null = null;
  rttMs = 0;

  /** sim-space view yaw the player controls (0 = +Y north). */
  yaw = 0;

  private mirror: AreaPhysics | null = null;
  private body: CharacterBody | null = null;
  private state: CharState = { pos: [0, 0, 0], velZ: 0, grounded: false };
  private errOffset: Vec3 = [0, 0, 0];

  private seq = 0;
  private pending: InputCmd[] = [];
  private readonly sentAt = new Map<number, number>();
  private readonly remotes = new Map<number, RemoteEntity>();
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
        this.enterArea(msg.area, msg.spawn, msg.spawnYaw);
        this.phase = "playing";
        break;
      case MsgType.Snapshot:
        if (this.phase === "playing") this.onSnapshot(msg.tick, msg.lastInputSeq, msg.selfPos, msg.selfVelZ, msg.selfGrounded, msg.entities);
        break;
      case MsgType.EntityJoin:
        if (!this.remotes.has(msg.id) && msg.id !== this.playerId) {
          this.remotes.set(msg.id, { id: msg.id, name: msg.name, isBot: msg.isBot, view: new RemoteView() });
          this.hooks.onRoster([...this.remotes.values()]);
        }
        break;
      case MsgType.EntityLeave:
        if (this.remotes.delete(msg.id)) this.hooks.onRoster([...this.remotes.values()]);
        break;
      case MsgType.TransitionBegin: {
        this.phase = "transition";
        this.remotes.clear();
        this.hooks.onRoster([]);
        this.hooks.onTransitionBegin(msg.area);
        // regenerate the destination locally (deterministic descriptor)
        this.enterArea(msg.area, msg.spawn, msg.spawnYaw);
        this.transport.send(encode({ type: MsgType.TransitionReady }));
        break;
      }
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
    this.chamber = generateChamber(SUNKEN_PARISH, ref.seed, chamberOptionsFor(ref));
    this.mirror?.dispose();
    this.mirror = new AreaPhysics(this.chamber.colliders);
    this.body = this.mirror.createCharacter(spawn);
    this.state = { pos: spawn, velZ: 0, grounded: false };
    this.errOffset = [0, 0, 0];
    this.yaw = spawnYaw;
    this.hooks.onArea(ref, this.chamber);
  }

  // ------------------------------------------------------------ prediction

  /** One fixed 30 Hz client tick: build cmd, predict locally, send. */
  clientTick(moveX: number, moveY: number, jump: boolean, sprint: boolean): void {
    if (this.phase !== "playing" || !this.body || !this.mirror) return;
    const cmd: InputCmd = {
      seq: ++this.seq,
      moveX,
      moveY,
      yaw: this.yaw,
      buttons: (jump ? Buttons.Jump : 0) | (sprint ? Buttons.Sprint : 0),
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
    // redundant bundle of the last 3 commands rides out TCP stalls (Docs/03 §3)
    const bundle = this.pending.slice(-3);
    this.transport.send(encode({ type: MsgType.InputBundle, cmds: bundle }));
  }

  private onSnapshot(
    tick: number,
    lastInputSeq: number,
    selfPos: Vec3,
    selfVelZ: number,
    selfGrounded: boolean,
    entities: readonly { id: number; pos: Vec3; yaw: number; anim: number }[],
  ): void {
    if (!this.body || !this.mirror) return;
    this.clock.onSnapshot(tick);

    // RTT estimate from input echo
    const sent = this.sentAt.get(lastInputSeq);
    if (sent !== undefined) {
      const rtt = performance.now() - sent;
      this.rttMs = this.rttMs === 0 ? rtt : this.rttMs * 0.9 + rtt * 0.1;
      this.sentAt.delete(lastInputSeq);
    }

    // reconcile: rewind to authoritative state, replay unacked inputs
    const before = this.state.pos;
    this.pending = this.pending.filter((c) => c.seq > lastInputSeq);
    this.state = { pos: selfPos, velZ: selfVelZ, grounded: selfGrounded };
    this.body.setFeet(selfPos);
    for (const cmd of this.pending) stepCharacter(this.body, this.state, cmd, true);
    // fold the correction into a decaying render offset instead of a snap
    this.errOffset = [
      this.errOffset[0] + before[0] - this.state.pos[0],
      this.errOffset[1] + before[1] - this.state.pos[1],
      this.errOffset[2] + before[2] - this.state.pos[2],
    ];
    const mag = Math.hypot(...this.errOffset);
    if (mag > 2.5) this.errOffset = [0, 0, 0]; // teleport-scale: just snap

    // feed remote views
    for (const e of entities) {
      const remote = this.remotes.get(e.id);
      remote?.view.push(tick, e.pos, e.yaw, e.anim);
    }
  }

  // ------------------------------------------------------------ render access

  /** Smoothed feet position for the camera/avatar (world space). */
  renderPos(dt: number): Vec3 {
    const k = Math.exp(-ERR_DECAY * dt);
    this.errOffset = [this.errOffset[0] * k, this.errOffset[1] * k, this.errOffset[2] * k];
    return [
      this.state.pos[0] + this.errOffset[0],
      this.state.pos[1] + this.errOffset[1],
      this.state.pos[2] + this.errOffset[2],
    ];
  }

  get grounded(): boolean {
    return this.state.grounded;
  }

  get reconciliationError(): number {
    return Math.hypot(...this.errOffset);
  }

  remoteList(): readonly RemoteEntity[] {
    return [...this.remotes.values()];
  }

  /** Camera-boom occlusion probe in the current area. */
  cameraRay(origin: Vec3, dir: Vec3, maxDist: number): number | null {
    return this.mirror ? this.mirror.castRay(origin, dir, maxDist) : null;
  }

  dispose(): void {
    this.transport.close();
    this.mirror?.dispose();
  }
}
