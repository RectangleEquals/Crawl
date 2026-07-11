/**
 * Protocol messages (Docs/03). The core invariant: clients send INPUTS ONLY —
 * no message exists that asserts state. Binary encode/decode per message.
 */

import { ByteReader, ByteWriter } from "./codec.js";
import { POS_SCALE, VEL_SCALE, YAW_SCALE } from "../sim/constants.js";
import type { Vec3 } from "../art/mesh.js";

export const PROTOCOL_VERSION = 2;

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

/** Button bitfield for one input command. */
export enum Buttons {
  Jump = 1 << 0,
  Sprint = 1 << 1,
  Interact = 1 << 2,
}

export interface InputCmd {
  seq: number; // u32, monotonically increasing per client
  moveX: number; // strafe, [-1, 1]
  moveY: number; // forward, [-1, 1]
  yaw: number; // radians, view yaw at command time
  buttons: number;
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
  /** generateChamber options, kept tiny & explicit for M2. */
  roofHoles: boolean;
  waterLevel: number;
}

export interface EntityState {
  id: number;
  pos: Vec3;
  yaw: number;
  anim: number; // 0 idle, 1 walk, 2 air
}

export interface WelcomeMsg {
  type: MsgType.Welcome;
  playerId: number;
  area: AreaRef;
  spawn: Vec3;
  spawnYaw: number;
}

export interface SnapshotMsg {
  type: MsgType.Snapshot;
  tick: number;
  /** seq of the last input command applied to YOUR character. */
  lastInputSeq: number;
  /** authoritative state for you, for reconciliation. */
  selfPos: Vec3;
  selfVelZ: number;
  selfGrounded: boolean;
  entities: EntityState[]; // everyone except you
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

// ---------------------------------------------------------------- encode

function writeVec3Q(w: ByteWriter, v: Vec3): void {
  w.i32(Math.round(v[0] * POS_SCALE));
  w.i32(Math.round(v[1] * POS_SCALE));
  w.i32(Math.round(v[2] * POS_SCALE));
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
      w.u32(msg.tick);
      w.u32(msg.lastInputSeq);
      writeVec3Q(w, msg.selfPos);
      w.i16(Math.round(msg.selfVelZ * VEL_SCALE));
      w.u8(msg.selfGrounded ? 1 : 0);
      w.u8(msg.entities.length);
      for (const e of msg.entities) {
        w.u16(e.id);
        writeVec3Q(w, e.pos);
        writeYawQ(w, e.yaw);
        w.u8(e.anim);
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
        cmds.push({
          seq: r.u32(),
          moveX: r.i16() / 1000,
          moveY: r.i16() / 1000,
          yaw: readYawQ(r),
          buttons: r.u8(),
        });
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
      const n = r.u8();
      const entities: EntityState[] = [];
      for (let i = 0; i < n; i++) {
        entities.push({ id: r.u16(), pos: readVec3Q(r), yaw: readYawQ(r), anim: r.u8() });
      }
      return { type, tick, lastInputSeq, selfPos, selfVelZ, selfGrounded, entities };
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
