/**
 * Rapier integration (Docs/02 §4.1): one physics world per area island,
 * Z-up world coordinates (gravity along −Z), kinematic character bodies.
 * `@dimforge/rapier3d-compat` embeds the WASM — identical in Node, browser,
 * and Web Worker, and cross-platform deterministic.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import type { Vec3, WorldBox } from "../art/mesh.js";
import { GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS, TICK_DT } from "./constants.js";
import type { Team } from "./combat/state.js";

let rapierReady: Promise<unknown> | null = null;

/** Idempotent WASM init; await once at every entrypoint (server, worker, client). */
export function initPhysics(): Promise<unknown> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/** Quaternion rotating local +Y to world +Z: capsules stand up in Z-up space. */
const CAPSULE_UPRIGHT = { x: 0.7071067811865476, y: 0, z: 0, w: 0.7071067811865476 };

/**
 * Collision groups (Rapier interaction groups: membership << 16 | filter; two
 * colliders interact iff each membership intersects the other's filter).
 * bit0 WORLD · bit1 PARTY · bit2 ENEMY · bit3 WARD (Warden ward walls).
 * Party never body-blocks party (Docs pitfall #3); enemies block everything;
 * ward walls block both teams; camera rays hit world only.
 */
const G_WORLD = 0x0001;
const G_PARTY = 0x0002;
const G_ENEMY = 0x0004;
const G_WARD = 0x0008;
const WORLD_GROUPS = (G_WORLD << 16) | (G_PARTY | G_ENEMY);
const PARTY_GROUPS = (G_PARTY << 16) | (G_WORLD | G_ENEMY | G_WARD); // not PARTY: no ally body-block
const ENEMY_GROUPS = (G_ENEMY << 16) | (G_WORLD | G_PARTY | G_ENEMY | G_WARD);
const WARD_GROUPS = (G_WARD << 16) | (G_PARTY | G_ENEMY);
const RAY_GROUPS = (0xffff << 16) | G_WORLD; // camera/probes: world only

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
    private readonly filterGroups: number, // this mover's interaction groups
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
      this.filterGroups,
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

  createCharacter(feet: Vec3, team: Team = 0): CharacterBody {
    const groups = team === 1 ? ENEMY_GROUPS : PARTY_GROUPS;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(feet[0], feet[1], feet[2] + CENTER_Z)
        .setRotation(CAPSULE_UPRIGHT),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALF, PLAYER_RADIUS).setCollisionGroups(groups),
      body,
    );
    const controller = this.world.createCharacterController(0.02);
    controller.enableAutostep(0.45, 0.2, true);
    controller.enableSnapToGround(SNAP_DIST);
    controller.setUp({ x: 0, y: 0, z: 1 });
    controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    return new CharacterBody(this.world, body, collider, controller, groups);
  }

  /** Deploy a solid ward-wall collider (Warden). Returns a handle for removal. */
  addWall(min: Vec3, max: Vec3): number {
    const hx = (max[0] - min[0]) / 2;
    const hy = (max[1] - min[1]) / 2;
    const hz = (max[2] - min[2]) / 2;
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(Math.max(0.05, hx), Math.max(0.05, hy), Math.max(0.05, hz))
        .setTranslation(min[0] + hx, min[1] + hy, min[2] + hz)
        .setCollisionGroups(WARD_GROUPS),
    );
    return c.handle;
  }

  removeWall(handle: number): void {
    const c = this.world.getCollider(handle);
    if (c) this.world.removeCollider(c, false);
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
