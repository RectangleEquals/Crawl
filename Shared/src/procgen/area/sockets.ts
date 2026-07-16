/**
 * Sockets — the connection contract for modular stitching (Docs/07 area
 * composer). A socket is a doorway/opening on a room: a 3D position + outward
 * direction + width + how you traverse it. Positions/directions are full 3D
 * (Z-up) and carry a `traversal` + optional `gate` so VERTICAL connections
 * (ropes/ladders/one-way drops/gated ledges) drop in later with no data-model
 * change. The first slice only emits `walk` sockets at floor level.
 */

import type { Vec3 } from "../../art/mesh.js";
import type { Capability } from "../logic.js";

export type Traversal = "walk" | "drop" | "climb" | "ladder" | "rope";
export type SocketKind = "arch" | "cave-mouth" | "open" | "threshold";

export interface Socket {
  /** Doorway centre (world once placed; room-local before). Z = sill height. */
  pos: Vec3;
  /** Outward unit normal. XY for `walk`; may point ±Z for vertical traversal. */
  dir: Vec3;
  /** Doorway width (m). */
  width: number;
  kind: SocketKind;
  traversal: Traversal;
  /** Capability required to traverse (climb→Impeller, rappel→Tether, …). */
  gate?: Capability;
}

/** A floor-level walk socket facing `dir`, `width` wide, at local `pos`. */
export function walkSocket(pos: Vec3, dir: Vec3, width = 2.2): Socket {
  return { pos, dir, width, kind: "arch", traversal: "walk" };
}

/** Copy a (room-local) socket into world space by adding the room centre. */
export function placeSocket(s: Socket, center: Vec3): Socket {
  return { ...s, pos: [s.pos[0] + center[0], s.pos[1] + center[1], s.pos[2] + center[2]] };
}
