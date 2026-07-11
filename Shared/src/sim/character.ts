/**
 * The character movement rule — ONE function, run by the server per consumed
 * input and by the client for prediction/replay (Docs/03 §4). Deterministic:
 * shared trig, no history beyond CharState.
 */

import { Buttons, type InputCmd } from "../protocol/messages.js";
import type { Vec3 } from "../art/mesh.js";
import { yawBasis } from "../math/trig.js";
import {
  GRAVITY, JUMP_VELOCITY, SPRINT_SPEED, TICK_DT, WALK_SPEED,
} from "./constants.js";
import type { CharacterBody } from "./physics.js";

export interface CharState {
  pos: Vec3; // feet, world space
  velZ: number;
  grounded: boolean;
}

export type AnimState = 0 | 1 | 2; // idle | walk | air

/** Advance one tick of movement. Mutates `state`; moves `body`. */
export function stepCharacter(
  body: CharacterBody,
  state: CharState,
  cmd: InputCmd,
  immediate: boolean,
): void {
  const basis = yawBasis(cmd.yaw);
  let dx = cmd.moveX * basis.rx + cmd.moveY * basis.fx;
  let dy = cmd.moveX * basis.ry + cmd.moveY * basis.fy;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  const speed = (cmd.buttons & Buttons.Sprint) !== 0 ? SPRINT_SPEED : WALK_SPEED;

  // vertical: gamey full-control air model for M2 (momentum model is M3+).
  // Only treat "grounded" as authoritative while NOT ascending — the
  // controller can report grounded on the first jump ticks (still inside its
  // ground-snap margin), which would otherwise cancel the jump into a
  // floor-stutter loop.
  if (state.grounded && state.velZ <= 0) {
    state.velZ = -1.2; // press into the ground so snap/step stays engaged
    if ((cmd.buttons & Buttons.Jump) !== 0) state.velZ = JUMP_VELOCITY;
  } else {
    state.velZ -= GRAVITY * TICK_DT;
  }

  const desired: Vec3 = [dx * speed * TICK_DT, dy * speed * TICK_DT, state.velZ * TICK_DT];
  const { moved, grounded } = body.move(desired, immediate);
  state.pos = [state.pos[0] + moved[0], state.pos[1] + moved[1], state.pos[2] + moved[2]];
  state.grounded = grounded && state.velZ <= 0; // ascending is never "grounded"
  if (state.grounded && state.velZ < 0) state.velZ = 0;
}

export function animFor(state: CharState, cmd: InputCmd | null): AnimState {
  if (!state.grounded) return 2;
  if (cmd && (Math.abs(cmd.moveX) > 0.05 || Math.abs(cmd.moveY) > 0.05)) return 1;
  return 0;
}
