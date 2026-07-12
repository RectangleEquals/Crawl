/**
 * Placeholder combatant avatars (Docs/08 §1: silhouette-readable). Kind-aware
 * box figures + floating HP bar + tag tint + attack flash + downed pose.
 * Cosmetic; real character art is the Phase-A/B pipeline later.
 */

import * as THREE from "three";
import { EntityFlag, TAG_BIT } from "@crawlstar/shared";
import { psxify } from "../render/psx/materials.js";

interface KindLook {
  color: number;
  scale: number;
  headTall: boolean;
}

const LOOKS: KindLook[] = [
  { color: 0x6f86c9, scale: 1.0, headTall: false }, // 0 warden (party, steel-blue)
  { color: 0x9a4a34, scale: 1.15, headTall: true }, // 1 slag-revenant (rusty, tall)
  { color: 0x5aa9a0, scale: 0.85, headTall: false }, // 2 shardspitter (pale teal, small)
  { color: 0x6f8f4a, scale: 0.95, headTall: false }, // 3 carrion-herald (sickly green)
];

export class Avatar {
  readonly group = new THREE.Group();
  private readonly bodyGroup = new THREE.Group();
  private readonly mats: THREE.MeshPhongMaterial[] = [];
  private readonly baseColor: THREE.Color;
  private readonly weapon: THREE.Mesh;
  private readonly hpBg: THREE.Sprite;
  private readonly hpFill: THREE.Sprite;
  private readonly hpBarW = 0.9;
  private bobT = 0;
  private downed = false;

  constructor(name: string, kind: number, showHp: boolean) {
    const look = LOOKS[kind] ?? LOOKS[0]!;
    this.baseColor = new THREE.Color(look.color);
    const mat = (): THREE.MeshPhongMaterial => {
      const m = psxify(new THREE.MeshPhongMaterial({ color: this.baseColor.clone(), shininess: 16, emissive: new THREE.Color(0, 0, 0) }));
      this.mats.push(m);
      return m;
    };

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.6), mat());
    torso.position.y = 0.82;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.42), mat());
    hips.position.y = 0.34;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, look.headTall ? 0.34 : 0.26, 0.26), mat());
    head.position.y = look.headTall ? 1.3 : 1.26;
    for (const m of [torso, hips, head]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.bodyGroup.add(m);
    }

    // weapon / attack flash (points +Z-local = forward-ish; shown while attacking)
    this.weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.7),
      psxify(new THREE.MeshPhongMaterial({ color: 0xcfd6e0, emissive: new THREE.Color(0x223040), emissiveIntensity: 1 })),
    );
    this.weapon.position.set(0.28, 0.85, 0.4);
    this.weapon.visible = false;
    this.bodyGroup.add(this.weapon);

    this.group.scale.setScalar(look.scale);
    this.group.add(this.bodyGroup);
    this.group.add(makeNameplate(name, kind === 0));

    // floating hp bar
    this.hpBg = makeBarSprite(0x101014, this.hpBarW, 0.13);
    this.hpFill = makeBarSprite(0x8be06a, this.hpBarW, 0.1);
    this.hpBg.position.y = 1.95;
    this.hpFill.position.y = 1.95;
    this.hpBg.visible = showHp;
    this.hpFill.visible = showHp;
    this.group.add(this.hpBg, this.hpFill);
  }

  /** hpFrac 0..1, stateFlags/tagFlags from the snapshot. */
  setCombat(hpFrac: number, stateFlags: number, tagFlags: number): void {
    const w = this.hpBarW * Math.max(0, Math.min(1, hpFrac));
    this.hpFill.scale.set(w, 0.1, 1);
    this.hpFill.position.x = -(this.hpBarW - w) / 2;
    this.hpFill.material.color.setHex(hpFrac > 0.5 ? 0x8be06a : hpFrac > 0.25 ? 0xe0c04a : 0xe0603a);

    this.weapon.visible = (stateFlags & EntityFlag.Attacking) !== 0;
    this.downed = (stateFlags & EntityFlag.Downed) !== 0;

    // tag tint (dominant): ignite orange · soak blue · shock white · launched yellow
    let emissive = 0x000000;
    let intensity = 0;
    if (tagFlags & TAG_BIT.ignite) { emissive = 0xff6a1e; intensity = 0.9; }
    else if (tagFlags & TAG_BIT.shock) { emissive = 0xdfe6ff; intensity = 0.7; }
    else if (tagFlags & TAG_BIT.soak) { emissive = 0x2a6acc; intensity = 0.6; }
    if ((stateFlags & EntityFlag.Launched) !== 0) { emissive = 0xffe06a; intensity = 0.8; }
    for (const m of this.mats) {
      m.emissive.setHex(emissive);
      m.emissiveIntensity = intensity;
      m.color.copy(this.baseColor).multiplyScalar(this.downed ? 0.4 : 1);
    }
  }

  update(pos: THREE.Vector3, yawRender: number, anim: number, dt: number): void {
    this.group.position.copy(pos);
    this.bodyGroup.rotation.y = yawRender;
    if (this.downed) {
      this.bodyGroup.rotation.x = Math.PI * 0.42; // slumped
      this.bodyGroup.position.y = 0;
      return;
    }
    this.bodyGroup.rotation.x = 0;
    if (anim === 1) {
      this.bobT += dt * 9;
      this.bodyGroup.position.y = Math.abs(Math.sin(this.bobT)) * 0.05;
      this.bodyGroup.rotation.z = Math.sin(this.bobT) * 0.04;
    } else {
      this.bodyGroup.position.y = anim === 2 ? 0.06 : 0;
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

function makeBarSprite(color: number, w: number, h: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, transparent: true }));
  s.scale.set(w, h, 1);
  s.renderOrder = 999;
  return s;
}

function makeNameplate(name: string, party: boolean): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "22px 'DOS VGA', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(name, 130, 30);
    ctx.fillStyle = party ? "#b8e6a0" : "#d8a0a0";
    ctx.fillText(name, 128, 28);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.95, 0.15, 1);
  sprite.position.y = 2.12;
  sprite.renderOrder = 1000;
  return sprite;
}
