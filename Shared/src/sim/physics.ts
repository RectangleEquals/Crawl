/**
 * Rapier integration (Docs/02 §4.1): one physics world per area island,
 * Z-up world coordinates (gravity along −Z), kinematic character bodies.
 * `@dimforge/rapier3d-compat` embeds the WASM — identical in Node, browser,
 * and Web Worker, and cross-platform deterministic.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import type { Vec3, WorldBox } from "../art/mesh.js";
import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, TICK_DT } from "./constants.js";

let rapierReady: Promise<unknown> | null = null;

/** Idempotent WASM init; await once at every entrypoint (server, worker, client). */
export function initPhysics(): Promise<unknown> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/** Quaternion rotating local +Y to world +Z: capsules stand up in Z-up space. */
const CAPSULE_UPRIGHT = { x: 0.7071067811865476, y: 0, z: 0, w: 0.7071067811865476 };

/**
 * Collision groups (Rapier: membership << 16 | filter).
 * Characters collide with the WORLD but NOT with each other — party members
 * and bots must never body-block movement (enemies get a blocking group in
 * M3). Camera rays probe world-only.
 */
const WORLD_GROUPS = (0x0001 << 16) | 0x0003; // member: world · collides: world+chars
const CHARACTER_GROUPS = (0x0002 << 16) | 0x0001; // member: char · collides: world only
const RAY_GROUPS = (0xffff << 16) | 0x0001; // camera/probes: world only

const CAPSULE_HALF = PLAYER_HEIGHT / 2 - PLAYER_RADIUS;
const CENTER_Z = PLAYER_HEIGHT / 2;
const SNAP_DIST = 0.4; // ground-snap engage distance (disabled while ascending)

export interface MoveResult {
  moved: Vec3;
  grounded: boolean;
}

export class CharacterBody {
  constructor(
    private readonly world: RAPIER.World,
    readonly body: RAPIER.RigidBody,
    readonly collider: RAPIER.Collider,
    private readonly controller: RAPIER.KinematicCharacterController,
  ) {}

  /** Feet position (bottom of capsule), world space. */
  get feet(): Vec3 {
    const t = this.body.translation();
    return [t.x, t.y, t.z - CENTER_Z];
  }

  setFeet(p: Vec3): void {
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] + CENTER_Z }, false);
    // teleports must reach the collider NOW — queries between steps read
    // collider transforms, not body transforms (reconciliation correctness)
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  /**
   * Collide-and-slide by `desired` displacement.
   * `immediate` teleports the body (client-side replay); otherwise the move
   * applies on the next `world.step()` (authoritative tick path).
   */
  move(desired: Vec3, immediate: boolean): MoveResult {
    // ground-snap must not eat upward motion: jumping while snapped reads as
    // "jumping through the floor" stutter
    if (desired[2] > 0) this.controller.disableSnapToGround();
    this.controller.computeColliderMovement(
      this.collider,
      { x: desired[0], y: desired[1], z: desired[2] },
      undefined,
      CHARACTER_GROUPS,
    );
    if (desired[2] > 0) this.controller.enableSnapToGround(SNAP_DIST);
    const m = this.controller.computedMovement();
    const grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    if (immediate) {
      this.body.setTranslation(next, false);
      // replay path runs several moves between world.step() calls — each one
      // must see the previous move's result, or replayed movement ignores
      // collision entirely (the "strafe through walls + jitter" bug)
      this.world.propagateModifiedBodyPositionsToColliders();
    } else {
      this.body.setNextKinematicTranslation(next);
    }
    return { moved: [m.x, m.y, m.z], grounded };
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body); // removes attached collider too
  }
}

export class AreaPhysics {
  readonly world: RAPIER.World;

  constructor(colliders: readonly WorldBox[]) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: -GRAVITY });
    this.world.timestep = TICK_DT;
    for (const b of colliders) {
      const hx = (b.max[0] - b.min[0]) / 2;
      const hy = (b.max[1] - b.min[1]) / 2;
      const hz = (b.max[2] - b.min[2]) / 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(b.min[0] + hx, b.min[1] + hy, b.min[2] + hz)
          .setCollisionGroups(WORLD_GROUPS),
      );
    }
  }

  createCharacter(feet: Vec3): CharacterBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(feet[0], feet[1], feet[2] + CENTER_Z)
        .setRotation(CAPSULE_UPRIGHT),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALF, PLAYER_RADIUS).setCollisionGroups(CHARACTER_GROUPS),
      body,
    );
    const controller = this.world.createCharacterController(0.02);
    controller.enableAutostep(0.45, 0.2, true);
    controller.enableSnapToGround(SNAP_DIST);
    controller.setUp({ x: 0, y: 0, z: 1 });
    controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    return new CharacterBody(this.world, body, collider, controller);
  }

  /** Camera/boom occlusion ray (client). Returns hit distance or null. */
  castRay(origin: Vec3, dir: Vec3, maxDist: number): number | null {
    const ray = new RAPIER.Ray(
      { x: origin[0], y: origin[1], z: origin[2] },
      { x: dir[0], y: dir[1], z: dir[2] },
    );
    const hit = this.world.castRay(ray, maxDist, true, undefined, RAY_GROUPS);
    return hit ? hit.timeOfImpact : null;
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
