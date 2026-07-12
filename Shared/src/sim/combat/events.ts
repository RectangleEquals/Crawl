/**
 * Combat events — the juice channel (Docs/03 §3). The sim pushes these into a
 * per-tick sink; the host attaches them to each client's Snapshot (TCP-ordered,
 * naturally area-scoped). The client renders damage numbers, death puffs, combo
 * call-outs, telegraphs. Bounded per tick; purely cosmetic-driving (state is
 * always authoritative in the snapshot itself).
 */

import type { Vec3 } from "../../art/mesh.js";

export enum EventKind {
  Damage = 1,
  Death = 2,
  Downed = 3,
  Revive = 4,
  TagApplied = 5, // value = tag bit
  Conduction = 6,
  Slam = 7, // value = radius×10
  WardWall = 8,
  Cast = 9, // value = ability index (telegraph start)
  Block = 10,
}

export interface CombatEvent {
  kind: EventKind;
  entity: number; // subject entity id (0 = worldless)
  value: number; // i16 payload (damage, tag bit, radius…)
  pos: Vec3;
}

export type EventSink = CombatEvent[];

export function pushEvent(sink: EventSink, kind: EventKind, entity: number, pos: Vec3, value = 0): void {
  if (sink.length < 64) sink.push({ kind, entity, value, pos });
}
