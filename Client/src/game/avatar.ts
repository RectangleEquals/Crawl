/**
 * Placeholder pilgrim avatar: chunky box figure + nameplate sprite.
 * Client-side cosmetic; real character art is Phase A/B pipeline work.
 */

import * as THREE from "three";
import { psxify } from "../render/psx/materials.js";

export class Avatar {
  readonly group = new THREE.Group();
  private readonly bodyGroup = new THREE.Group();
  private bobT = 0;

  constructor(name: string, isBot: boolean, tint: number) {
    const color = new THREE.Color().setHSL((tint % 12) / 12, 0.35, isBot ? 0.35 : 0.45);
    const mat = psxify(new THREE.MeshPhongMaterial({ color, shininess: 18 }));
    const dark = psxify(new THREE.MeshPhongMaterial({ color: color.clone().multiplyScalar(0.55), shininess: 8 }));

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.62), mat);
    torso.position.y = 0.82;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.42), dark);
    hips.position.y = 0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mat);
    head.position.y = 1.28;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.32), dark);
    hood.position.y = 1.45;
    for (const m of [torso, hips, head, hood]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.bodyGroup.add(m);
    }
    this.group.add(this.bodyGroup);
    this.group.add(makeNameplate(name, isBot));
  }

  /** pos = feet (render space); yawRender = three Y rotation. */
  update(pos: THREE.Vector3, yawRender: number, anim: number, dt: number): void {
    this.group.position.copy(pos);
    this.bodyGroup.rotation.y = yawRender;
    if (anim === 1) {
      this.bobT += dt * 9;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.bobT)) * 0.05;
      this.bodyGroup.rotation.z = Math.sin(this.bobT) * 0.04;
    } else if (anim === 2) {
      this.bodyGroup.position.y = 0.06;
      this.bodyGroup.rotation.z = 0;
    } else {
      this.bobT = 0;
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.z = 0;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }
}

function makeNameplate(name: string, isBot: boolean): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "22px 'DOS VGA', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(name, 130, 30);
    ctx.fillStyle = isBot ? "#9ab8d8" : "#b8e6a0";
    ctx.fillText(name, 128, 28);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sprite.scale.set(0.95, 0.15, 1);
  sprite.position.y = 1.8;
  return sprite;
}
