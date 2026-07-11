/**
 * Area island (Docs/02 §4): one isolated sim world per area — physics,
 * characters, portal triggers. Islands never reference each other; the host
 * moves entities between them.
 */

import { boxContains, type Vec3 } from "../art/mesh.js";
import type { ChamberData, PortalSpec } from "../art/chamber.js";
import { animFor, stepCharacter, type AnimState, type CharState } from "./character.js";
import { AreaPhysics, type CharacterBody } from "./physics.js";
import type { InputCmd } from "../protocol/messages.js";

export interface IslandEntity {
  id: number;
  name: string;
  isBot: boolean;
  state: CharState;
  body: CharacterBody;
  yaw: number;
  anim: AnimState;
  lastCmd: InputCmd | null;
}

export class AreaIsland {
  readonly physics: AreaPhysics;
  readonly entities = new Map<number, IslandEntity>();
  private readonly portals: readonly PortalSpec[];

  constructor(chamber: ChamberData) {
    this.physics = new AreaPhysics(chamber.colliders);
    this.portals = chamber.portals;
  }

  addEntity(id: number, name: string, isBot: boolean, feet: Vec3, yaw: number): IslandEntity {
    const body = this.physics.createCharacter(feet);
    const entity: IslandEntity = {
      id,
      name,
      isBot,
      state: { pos: feet, velZ: 0, grounded: false },
      body,
      yaw,
      anim: 0,
      lastCmd: null,
    };
    this.entities.set(id, entity);
    return entity;
  }

  removeEntity(id: number): void {
    const e = this.entities.get(id);
    if (!e) return;
    e.body.dispose();
    this.entities.delete(id);
  }

  /** Apply one input command to one entity (authoritative tick path). */
  applyCmd(entity: IslandEntity, cmd: InputCmd): void {
    stepCharacter(entity.body, entity.state, cmd, false);
    entity.yaw = cmd.yaw;
    entity.anim = animFor(entity.state, cmd);
    entity.lastCmd = cmd;
  }

  /** Advance physics one tick (after all applyCmd calls). */
  step(): void {
    this.physics.step();
  }

  /** Which portal (if any) the entity is standing in. */
  portalAt(feet: Vec3): PortalSpec | null {
    const probe: Vec3 = [feet[0], feet[1], feet[2] + 0.9];
    for (const p of this.portals) {
      if (boxContains(p.trigger, probe)) return p;
    }
    return null;
  }

  portalByKey(key: string): PortalSpec | null {
    return this.portals.find((p) => p.key === key) ?? null;
  }

  dispose(): void {
    for (const e of this.entities.values()) e.body.dispose();
    this.entities.clear();
    this.physics.dispose();
  }
}
