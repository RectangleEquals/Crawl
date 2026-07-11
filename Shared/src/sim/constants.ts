/** Simulation constants (Docs/02 §4, Docs/03 §3). One source of truth. */

export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

/** Snapshot interpolation delay for remote entities, in ticks (~100 ms). */
export const INTERP_TICKS = 3;

/** Position quantization: 1/256 m (Docs/03 §3). */
export const POS_SCALE = 256;
/** Yaw quantization: 1/1024 turn. */
export const YAW_SCALE = 1024 / (Math.PI * 2);
/** Velocity quantization for reconciliation state. */
export const VEL_SCALE = 256;

// Character movement (tuning targets; the real character doc is M3+)
export const WALK_SPEED = 3.4; // m/s
export const SPRINT_SPEED = 6.2;
export const AIR_CONTROL = 0.35;
export const GRAVITY = 18; // m/s², slightly gamey — falls feel decisive
export const JUMP_VELOCITY = 6.4;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.7; // capsule total height
export const PLAYER_EYE = 1.55; // eye height above feet

/** Max input commands the server accepts per wall-clock second (anti-speedhack, Docs/03 §3). */
export const MAX_CMDS_PER_SECOND = TICK_RATE + 8;
