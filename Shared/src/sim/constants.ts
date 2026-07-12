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

// ---- combat (M3, Docs/04 · Docs/08) ----
/** Ticks of hitbox history for lag compensation (~250 ms). */
export const HITBOX_HISTORY = 8;
/** Movement multiplier while blocking (Warden brace). Input-derived → predicted. */
export const BLOCK_SLOW = 0.4;
/** Downed bleed-out window (Docs/09 §6; full gravemark loop is M5). */
export const DOWNED_BLEEDOUT_TICKS = 60 * TICK_RATE;
/** M3 placeholder: a downed player stands back up after this if not finished. */
export const DOWN_RESPAWN_TICKS = 6 * TICK_RATE;
/** Conduction chain: max neighbours and radius (Docs/04 §2). */
export const CONDUCTION_RADIUS = 4.0;
export const CONDUCTION_MAX_TARGETS = 3;
export const CONDUCTION_DAMAGE = 10;
/** Capsule half-height used as the hit-centre offset above feet. */
export const HIT_CENTER_Z = PLAYER_HEIGHT / 2;
/** Bulwark (Warden resource) gained per tick while blocking (Docs/04 §3.1). */
export const BULWARK_PER_BLOCK_TICK = 0.7; // ~21/s → ~5 s to fill from blocking
/** Bulwark gained when taking a hit (× damage dealt), or when blocking (× damage absorbed). */
export const BULWARK_ON_HIT = 0.4;
export const BULWARK_ON_BLOCKED_HIT = 0.6;
