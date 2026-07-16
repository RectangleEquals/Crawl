/**
 * Gadget pickups (M4) — floating, glowing Starwrought Instruments the player
 * walks over to collect. Purely presentational: positions come from the plan the
 * client reconstructs from the world seed, and an Instrument is shown only while
 * the expedition doesn't yet hold it (server-authoritative via Snapshot.gadgetBits).
 */

import * as THREE from "three";
import type { PlanGadget } from "@crawlstar/shared";
import { worldVecToRender } from "../render/space.js";

// tether = graviton cyan, impeller = gravitic violet (M4_GADGET_DEFS order)
const GADGET_COLOR: Record<number, number> = { 0: 0x66e0ff, 1: 0xc98bff };

export class GadgetPickups {
  private group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private t = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  setScene(scene: THREE.Scene): void {
    this.clear();
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /** Show one glowing pickup per uncollected gadget in the current area. */
  sync(gadgets: readonly PlanGadget[], has: (bit: number) => boolean): void {
    const live = new Set<string>();
    for (const g of gadgets) {
      if (has(g.bit)) continue; // collected → no pickup
      live.add(g.itemId);
      if (this.meshes.has(g.itemId)) continue;
      const color = GADGET_COLOR[g.bit] ?? 0xffffff;
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.36, 0),
        new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 1.15, shininess: 40 }),
      );
      const [x, y, z] = worldVecToRender(g.pos);
      mesh.position.set(x, y, z);
      mesh.userData["baseY"] = y;
      this.group.add(mesh);
      this.meshes.set(g.itemId, mesh);
    }
    for (const [id, mesh] of this.meshes) if (!live.has(id)) this.remove(id, mesh);
  }

  update(dt: number): void {
    this.t += dt;
    for (const mesh of this.meshes.values()) {
      mesh.rotation.y += dt * 1.7;
      const baseY = (mesh.userData["baseY"] as number) ?? mesh.position.y;
      mesh.position.y = baseY + Math.sin(this.t * 2.2) * 0.12;
    }
  }

  clear(): void {
    for (const [id, mesh] of this.meshes) this.remove(id, mesh);
  }

  private remove(id: string, mesh: THREE.Mesh): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.meshes.delete(id);
  }
}
