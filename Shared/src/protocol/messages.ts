/**
 * Protocol messages (Docs/03). The core invariant: clients send INPUTS ONLY —
 * no message asserts state. Binary encode/decode per message.
 * v3 (M3): combat buttons, per-entity combat fields, self combat block in
 * Snapshot, and a per-tick CombatEvent list (juice channel, Docs/03 §3).
 */

import { ByteReader, ByteWriter } from "./codec.js";
import { POS_SCALE, VEL_SCALE, YAW_SCALE } from "../sim/constants.js";
import { EventKind, type CombatEvent } from "../sim/combat/events.js";
import type { Vec3 } from "../art/mesh.js";

export const PROTOCOL_VERSION = 3;

export enum MsgType {
  // client → server
  Hello = 1,
  InputBundle = 2,
  TransitionReady = 3,
  Pong = 4,
  // server → client
  Welcome = 10,
  Snapshot = 11,
  EntityJoin = 12,
  EntityLeave = 13,
  TransitionBegin = 14,
  TransitionGo = 15,
  Ping = 16,
  Reject = 17,
}

// ---------------------------------------------------------------- inputs

/** Button bitfield for one input command (fits u8). */
export enum Buttons {
  Jump = 1 << 0,
  Sprint = 1 << 1,
  Interact = 1 << 2,
  Attack = 1 << 3, // primary (repeats while held)
  Block = 1 << 4, // held stance
  Ability1 = 1 << 5, // edge-triggered
  Ability2 = 1 << 6,
  Ability3 = 1 << 7,
}

export interface InputCmd {
  seq: number;
  moveX: number;
  moveY: number;
  yaw: number;
  buttons: number;
}

/** Per-entity combat flags on the wire (EntityState.stateFlags). */
export enum EntityFlag {
  Downed = 1 << 0,
  Blocking = 1 << 1,
  Attacking = 1 << 2, // windup or active
  Launched = 1 << 3,
}

/** Self combat flags (SnapshotMsg.selfFlags). */
export enum SelfFlag {
  Downed = 1 << 0,
  Blocking = 1 << 1,
}

export interface HelloMsg { type: MsgType.Hello; version: number; name: string }
export interface InputBundleMsg { type: MsgType.InputBundle; cmds: InputCmd[] }
export interface TransitionReadyMsg { type: MsgType.TransitionReady }
export interface PongMsg { type: MsgType.Pong; nonce: number }

// ---------------------------------------------------------------- world/state

export interface AreaRef {
  areaId: number;
  name: string;
  seed: string;
  roofHoles: boolean;
  waterLevel: number;
}

export interface EntityState {
  id: number;
  pos: Vec3;
  yaw: number;
  anim: number; // 0 idle, 1 walk, 2 air
  kind: number; // archetype index (client maps → visual)
  hpFrac: number; // 0..255
  stateFlags: number; // EntityFlag bits
  tagFlags: number; // TAG_BIT bits
}

export interface WelcomeMsg {
  type: MsgType.Welcome;
  playerId: number;
  area: AreaRef;
  spawn: Vec3;
  spawnYaw: number;
}

export interface ProjectileState {
  id: number;
  kind: number; // 0 shard, 1 cinder
  pos: Vec3;
}

export interface SnapshotMsg {
  type: MsgType.Snapshot;
  tick: number;
  lastInputSeq: number;
  selfPos: Vec3;
  selfVelZ: number;
  selfGrounded: boolean;
  selfHp: number;
  selfMaxHp: number;
  selfResource: number;
  selfMaxResource: number;
  selfFlags: number; // SelfFlag bits
  selfTagFlags: number;
  abilityReady: number; // bit per ability slot 0..3 (1 = off cooldown & affordable)
  entities: EntityState[];
  events: CombatEvent[];
  projectiles: ProjectileState[];
}

export interface EntityJoinMsg { type: MsgType.EntityJoin; id: number; name: string; isBot: boolean }
export interface EntityLeaveMsg { type: MsgType.EntityLeave; id: number }
export interface TransitionBeginMsg { type: MsgType.TransitionBegin; area: AreaRef; spawn: Vec3; spawnYaw: number }
export interface TransitionGoMsg { type: MsgType.TransitionGo }
export interface PingMsg { type: MsgType.Ping; nonce: number }
export interface RejectMsg { type: MsgType.Reject; reason: string }

export type ClientMsg = HelloMsg | InputBundleMsg | TransitionReadyMsg | PongMsg;
export type ServerMsg =
  | WelcomeMsg | SnapshotMsg | EntityJoinMsg | EntityLeaveMsg
  | TransitionBeginMsg | TransitionGoMsg | PingMsg | RejectMsg;
export type AnyMsg = ClientMsg | ServerMsg;

// ---------------------------------------------------------------- codec helpers

function writeVec3Q(w: ByteWriter, v: Vec3): void {
  w.i32(Math.round(v[0] * POS_SCALE)).i32(Math.round(v[1] * POS_SCALE)).i32(Math.round(v[2] * POS_SCALE));
}
function readVec3Q(r: ByteReader): Vec3 {
  return [r.i32() / POS_SCALE, r.i32() / POS_SCALE, r.i32() / POS_SCALE];
}
function writeYawQ(w: ByteWriter, yaw: number): void {
  const t = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  w.u16(Math.round(t * YAW_SCALE) & 0xffff);
}
function readYawQ(r: ByteReader): number {
  return r.u16() / YAW_SCALE;
}
function writeAreaRef(w: ByteWriter, a: AreaRef): void {
  w.u16(a.areaId).str(a.name).str(a.seed).u8(a.roofHoles ? 1 : 0).f32(a.waterLevel);
}
function readAreaRef(r: ByteReader): AreaRef {
  return { areaId: r.u16(), name: r.str(), seed: r.str(), roofHoles: r.u8() === 1, waterLevel: r.f32() };
}

// ---------------------------------------------------------------- encode

export function encode(msg: AnyMsg): Uint8Array {
  const w = new ByteWriter();
  w.u8(msg.type);
  switch (msg.type) {
    case MsgType.Hello:
      w.u8(msg.version).str(msg.name);
      break;
    case MsgType.InputBundle:
      w.u8(msg.cmds.length);
      for (const c of msg.cmds) {
        w.u32(c.seq);
        w.i16(Math.round(Math.max(-1, Math.min(1, c.moveX)) * 1000));
        w.i16(Math.round(Math.max(-1, Math.min(1, c.moveY)) * 1000));
        writeYawQ(w, c.yaw);
        w.u8(c.buttons);
      }
      break;
    case MsgType.TransitionReady:
      break;
    case MsgType.Pong:
      w.u32(msg.nonce);
      break;
    case MsgType.Welcome:
      w.u16(msg.playerId);
      writeAreaRef(w, msg.area);
      writeVec3Q(w, msg.spawn);
      writeYawQ(w, msg.spawnYaw);
      break;
    case MsgType.Snapshot:
      w.u32(msg.tick).u32(msg.lastInputSeq);
      writeVec3Q(w, msg.selfPos);
      w.i16(Math.round(msg.selfVelZ * VEL_SCALE)).u8(msg.selfGrounded ? 1 : 0);
      w.u16(Math.max(0, Math.round(msg.selfHp))).u16(msg.selfMaxHp);
      w.u16(Math.max(0, Math.round(msg.selfResource))).u16(msg.selfMaxResource);
      w.u8(msg.selfFlags).u8(msg.selfTagFlags).u8(msg.abilityReady);
      w.u8(msg.entities.length);
      for (const e of msg.entities) {
        w.u16(e.id);
        writeVec3Q(w, e.pos);
        writeYawQ(w, e.yaw);
        w.u8(e.anim).u8(e.kind).u8(e.hpFrac).u8(e.stateFlags).u8(e.tagFlags);
      }
      w.u8(msg.events.length);
      for (const ev of msg.events) {
        w.u8(ev.kind).u16(ev.entity).i16(Math.max(-32768, Math.min(32767, Math.round(ev.value))));
        writeVec3Q(w, ev.pos);
      }
      w.u8(msg.projectiles.length);
      for (const p of msg.projectiles) {
        w.u16(p.id).u8(p.kind);
        writeVec3Q(w, p.pos);
      }
      break;
    case MsgType.EntityJoin:
      w.u16(msg.id).str(msg.name).u8(msg.isBot ? 1 : 0);
      break;
    case MsgType.EntityLeave:
      w.u16(msg.id);
      break;
    case MsgType.TransitionBegin:
      writeAreaRef(w, msg.area);
      writeVec3Q(w, msg.spawn);
      writeYawQ(w, msg.spawnYaw);
      break;
    case MsgType.TransitionGo:
      break;
    case MsgType.Ping:
      w.u32(msg.nonce);
      break;
    case MsgType.Reject:
      w.str(msg.reason);
      break;
  }
  return w.finish();
}

export function decode(data: Uint8Array): AnyMsg {
  const r = new ByteReader(data);
  const type = r.u8() as MsgType;
  switch (type) {
    case MsgType.Hello:
      return { type, version: r.u8(), name: r.str() };
    case MsgType.InputBundle: {
      const n = r.u8();
      const cmds: InputCmd[] = [];
      for (let i = 0; i < n; i++) {
        cmds.push({ seq: r.u32(), moveX: r.i16() / 1000, moveY: r.i16() / 1000, yaw: readYawQ(r), buttons: r.u8() });
      }
      return { type, cmds };
    }
    case MsgType.TransitionReady:
      return { type };
    case MsgType.Pong:
      return { type, nonce: r.u32() };
    case MsgType.Welcome:
      return { type, playerId: r.u16(), area: readAreaRef(r), spawn: readVec3Q(r), spawnYaw: readYawQ(r) };
    case MsgType.Snapshot: {
      const tick = r.u32();
      const lastInputSeq = r.u32();
      const selfPos = readVec3Q(r);
      const selfVelZ = r.i16() / VEL_SCALE;
      const selfGrounded = r.u8() === 1;
      const selfHp = r.u16();
      const selfMaxHp = r.u16();
      const selfResource = r.u16();
      const selfMaxResource = r.u16();
      const selfFlags = r.u8();
      const selfTagFlags = r.u8();
      const abilityReady = r.u8();
      const nE = r.u8();
      const entities: EntityState[] = [];
      for (let i = 0; i < nE; i++) {
        entities.push({
          id: r.u16(), pos: readVec3Q(r), yaw: readYawQ(r),
          anim: r.u8(), kind: r.u8(), hpFrac: r.u8(), stateFlags: r.u8(), tagFlags: r.u8(),
        });
      }
      const nEv = r.u8();
      const events: CombatEvent[] = [];
      for (let i = 0; i < nEv; i++) {
        events.push({ kind: r.u8() as EventKind, entity: r.u16(), value: r.i16(), pos: readVec3Q(r) });
      }
      const nP = r.u8();
      const projectiles: ProjectileState[] = [];
      for (let i = 0; i < nP; i++) {
        projectiles.push({ id: r.u16(), kind: r.u8(), pos: readVec3Q(r) });
      }
      return {
        type, tick, lastInputSeq, selfPos, selfVelZ, selfGrounded,
        selfHp, selfMaxHp, selfResource, selfMaxResource, selfFlags, selfTagFlags, abilityReady,
        entities, events, projectiles,
      };
    }
    case MsgType.EntityJoin:
      return { type, id: r.u16(), name: r.str(), isBot: r.u8() === 1 };
    case MsgType.EntityLeave:
      return { type, id: r.u16() };
    case MsgType.TransitionBegin:
      return { type, area: readAreaRef(r), spawn: readVec3Q(r), spawnYaw: readYawQ(r) };
    case MsgType.TransitionGo:
      return { type };
    case MsgType.Ping:
      return { type, nonce: r.u32() };
    case MsgType.Reject:
      return { type, reason: r.str() };
    default:
      throw new Error(`Unknown message type ${type}`);
  }
}
