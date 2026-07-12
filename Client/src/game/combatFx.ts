/**
 * Combat juice (Docs/03 §3 events → cosmetics): floating damage numbers (DOM),
 * slam/conduction ground rings + death puffs (meshes), and projectile tracers.
 * Purely presentational — driven by server events/snapshots, owns no state that
 * affects the sim.
 */

import * as THREE from "three";
import { EventKind, type CombatEvent, type ProjectileState } from "@crawlstar/shared";
import { worldVecToRender } from "../render/space.js";

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  maxScale: number;
}
interface Puff {
  mesh: THREE.Mesh;
  age: number;
  life: number;
}
interface FloatNum {
  el: HTMLElement;
  world: THREE.Vector3;
  age: number;
  life: number;
}

const PROJECTILE_COLORS: Record<number, number> = { 0: 0x8be0d0, 1: 0xff8a3a };

export class CombatFx {
  private scene: THREE.Scene;
  private readonly rings: Ring[] = [];
  private readonly puffs: Puff[] = [];
  private readonly numbers: FloatNum[] = [];
  private readonly projMeshes = new Map<number, THREE.Mesh>();
  private readonly numLayer: HTMLElement;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    domRoot: HTMLElement,
    private selfId: number,
  ) {
    this.scene = scene;
    this.numLayer = document.createElement("div");
    this.numLayer.className = "fx-numbers";
    domRoot.appendChild(this.numLayer);
  }

  setScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.rings.length = 0;
    this.puffs.length = 0;
    for (const m of this.projMeshes.values()) m.removeFromParent();
    this.projMeshes.clear();
  }

  setSelfId(id: number): void {
    this.selfId = id;
  }

  handleEvents(events: readonly CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case EventKind.Damage:
          this.spawnNumber(ev.pos, `${ev.value}`, ev.entity === this.selfId ? "#ff6a5a" : "#e8f0d8");
          break;
        case EventKind.Death:
          this.spawnPuff(ev.pos, 0xd06040);
          break;
        case EventKind.Downed:
          this.spawnNumber(ev.pos, "DOWNED", "#ff5a5a");
          break;
        case EventKind.Revive:
          this.spawnNumber(ev.pos, "REVIVE", "#8be0a0");
          break;
        case EventKind.Slam:
          this.spawnRing(ev.pos, ev.value / 10, 0xffb040, 0.45);
          break;
        case EventKind.Conduction:
          this.spawnRing(ev.pos, 4, 0xbfe0ff, 0.35);
          this.spawnNumber(ev.pos, "CONDUCT", "#bfe0ff");
          break;
        case EventKind.WardWall:
          this.spawnRing(ev.pos, 1.4, 0x8fb0ff, 0.4);
          break;
        default:
          break;
      }
    }
  }

  updateProjectiles(projectiles: readonly ProjectileState[]): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let mesh = this.projMeshes.get(p.id);
      if (!mesh) {
        const color = PROJECTILE_COLORS[p.kind] ?? 0xffffff;
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.22, 0.22),
          new THREE.MeshBasicMaterial({ color }),
        );
        this.projMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(...worldVecToRender(p.pos));
    }
    for (const [id, mesh] of this.projMeshes) {
      if (!seen.has(id)) {
        mesh.removeFromParent();
        this.projMeshes.delete(id);
      }
    }
  }

  private spawnRing(worldPos: readonly [number, number, number], radius: number, color: number, life: number): void {
    const geo = new THREE.RingGeometry(0.6, 0.85, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const [x, y, z] = worldVecToRender(worldPos);
    mesh.position.set(x, y + 0.05, z);
    mesh.rotation.x = -Math.PI / 2; // lay flat on the ground (render XZ plane)
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life, maxScale: radius });
  }

  private spawnPuff(worldPos: readonly [number, number, number], color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.position.set(...worldVecToRender(worldPos));
    mesh.position.y += 0.9; // torso height, not underfoot
    this.scene.add(mesh);
    this.puffs.push({ mesh, age: 0, life: 0.4 });
  }

  private spawnNumber(worldPos: readonly [number, number, number], text: string, color: string): void {
    const el = document.createElement("div");
    el.className = "fx-num";
    el.textContent = text;
    el.style.color = color;
    this.numLayer.appendChild(el);
    const [x, y, z] = worldVecToRender(worldPos);
    this.numbers.push({ el, world: new THREE.Vector3(x, y + 0.4, z), age: 0, life: 0.9 });
  }

  update(dt: number): void {
    // rings expand + fade
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += dt;
      const t = r.age / r.life;
      const s = r.maxScale * Math.min(1, t * 1.6);
      r.mesh.scale.setScalar(Math.max(0.01, s));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t));
      if (t >= 1) {
        r.mesh.removeFromParent();
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    // puffs rise + fade
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      const t = p.age / p.life;
      p.mesh.position.y += dt * 1.0;
      p.mesh.scale.setScalar(1 + t * 1.0);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - t));
      if (t >= 1) {
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
    // damage numbers float up + fade, projected to screen
    const rect = this.canvas.getBoundingClientRect();
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]!;
      n.age += dt;
      n.world.y += dt * 0.8;
      const t = n.age / n.life;
      const p = n.world.clone().project(this.camera);
      const visible = p.z < 1 && p.x > -1.2 && p.x < 1.2 && p.y > -1.2 && p.y < 1.2;
      if (visible) {
        n.el.style.display = "block";
        n.el.style.left = `${rect.left + ((p.x + 1) / 2) * rect.width}px`;
        n.el.style.top = `${rect.top + ((1 - p.y) / 2) * rect.height}px`;
        n.el.style.opacity = `${Math.max(0, 1 - t)}`;
      } else {
        n.el.style.display = "none";
      }
      if (t >= 1) {
        n.el.remove();
        this.numbers.splice(i, 1);
      }
    }
  }
}
