/**
 * Placeholder combatant avatars (Docs/08 §1: silhouette-readable). Kind-aware
 * box figures + tag tint + attack flash + downed pose. Cosmetic; real character
 * art is the Phase-A/B pipeline later.
 *
 * Nameplate + HP bar are NOT in-scene sprites — they'd be smeared illegible by
 * the internal-res post chain. The avatar exposes the `Labelled` interface and
 * `WorldLabels` draws them as native-res DOM projected from `writeLabelAnchor`.
 */

import * as THREE from "three";
import { EntityFlag, TAG_BIT } from "@crawlstar/shared";
import { psxify } from "../render/psx/materials.js";
import type { Labelled } from "./worldLabels.js";

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

export class Avatar implements Labelled {
  readonly group = new THREE.Group();
  // Labelled surface — consumed by WorldLabels (native-res nameplate/HP overlay).
  readonly labelName: string;
  readonly labelParty: boolean;
  private readonly bodyGroup = new THREE.Group();
  private readonly mats: THREE.MeshPhongMaterial[] = [];
  private readonly baseColor: THREE.Color;
  private readonly weapon: THREE.Mesh;
  private readonly showHp: boolean;
  private readonly anchorY: number; // local head height × group scale
  private hp = 1;
  private bobT = 0;
  private downed = false;

  constructor(name: string, kind: number, showHp: boolean) {
    const look = LOOKS[kind] ?? LOOKS[0]!;
    this.baseColor = new THREE.Color(look.color);
    this.labelName = name;
    this.labelParty = kind === 0;
    this.showHp = showHp;
    this.anchorY = 2.12 * look.scale;
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
  }

  // --- Labelled (native-res nameplate/HP overlay) ---
  labelHpFrac(): number | null {
    return this.showHp ? this.hp : null;
  }
  labelDowned(): boolean {
    return this.downed;
  }
  writeLabelAnchor(out: THREE.Vector3): void {
    out.copy(this.group.position);
    out.y += this.anchorY;
  }

  /** hpFrac 0..1, stateFlags/tagFlags from the snapshot. */
  setCombat(hpFrac: number, stateFlags: number, tagFlags: number): void {
    this.hp = Math.max(0, Math.min(1, hpFrac));

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
    });
  }
}
