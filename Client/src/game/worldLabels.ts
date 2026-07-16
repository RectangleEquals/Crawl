/**
 * Floating nameplates + HP bars, drawn as **native-resolution DOM** projected
 * from world space — NOT as in-scene sprites. The PSX post chain (internal-res
 * render target → vertex snap → dither → nearest upscale, Docs/01 §2) mangles
 * small in-world text into an illegible smear at distance; UI must stay
 * native-res and legible ("somewhat pixelated, always readable", Docs/01 §3.x).
 * Same world→screen projection idiom as CombatFx damage numbers. Purely
 * presentational — owns no state that affects the sim.
 */

import * as THREE from "three";

/** What the overlay needs from anything it labels (Avatar implements this). */
export interface Labelled {
  readonly labelName: string;
  readonly labelParty: boolean;
  /** 0..1 for an HP bar, or null for name-only (e.g. the self avatar). */
  labelHpFrac(): number | null;
  labelDowned(): boolean;
  /** Render-space head position (world units) to anchor the label above. */
  writeLabelAnchor(out: THREE.Vector3): void;
}

interface LabelDom {
  root: HTMLElement;
  name: HTMLElement;
  fill: HTMLElement | null; // null when the label has no bar
}

// Distance behaviour, render-space metres. Labels scale mildly with distance
// (clamped so text never drops below a legible size) and fade out past FADE_END
// so a far room doesn't clutter with tags.
const REF_DIST = 6;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.35;
const FADE_START = 18;
const FADE_END = 30;

export class WorldLabels {
  private readonly layer: HTMLElement;
  private readonly doms = new Map<number, LabelDom>();
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    domRoot: HTMLElement,
  ) {
    this.layer = document.createElement("div");
    this.layer.className = "wl-layer";
    domRoot.appendChild(this.layer);
  }

  /** Position/refresh every label this frame; drop labels not in `entries`. */
  update(entries: Iterable<[number, Labelled]>): void {
    const rect = this.canvas.getBoundingClientRect();
    const seen = new Set<number>();

    for (const [id, src] of entries) {
      seen.add(id);
      const dom = this.ensure(id, src);

      // distance in world space (before project() mutates scratch into NDC)
      src.writeLabelAnchor(this.scratch);
      const dist = this.camera.position.distanceTo(this.scratch);
      const p = this.scratch.project(this.camera);
      const onScreen = p.z < 1 && p.x > -1.15 && p.x < 1.15 && p.y > -1.15 && p.y < 1.15;
      const opacity = onScreen ? 1 - THREE.MathUtils.smoothstep(dist, FADE_START, FADE_END) : 0;
      if (opacity <= 0.02) {
        dom.root.style.display = "none";
        continue;
      }

      const scale = THREE.MathUtils.clamp(REF_DIST / Math.max(dist, 0.01), MIN_SCALE, MAX_SCALE);
      const x = rect.left + ((p.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - p.y) / 2) * rect.height;
      dom.root.style.display = "block";
      dom.root.style.left = `${x.toFixed(1)}px`;
      dom.root.style.top = `${y.toFixed(1)}px`;
      dom.root.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      dom.root.style.opacity = opacity.toFixed(3);

      const hp = src.labelHpFrac();
      if (dom.fill && hp !== null) {
        const frac = Math.max(0, Math.min(1, hp));
        dom.fill.style.width = `${(frac * 100).toFixed(1)}%`;
        dom.fill.style.background = frac > 0.5 ? "#8be06a" : frac > 0.25 ? "#e0c04a" : "#e0603a";
      }
      dom.name.style.opacity = src.labelDowned() ? "0.5" : "1";
    }

    for (const [id, dom] of this.doms) {
      if (!seen.has(id)) {
        dom.root.remove();
        this.doms.delete(id);
      }
    }
  }

  /** Tear down all labels (area transitions). */
  clear(): void {
    for (const dom of this.doms.values()) dom.root.remove();
    this.doms.clear();
  }

  private ensure(id: number, src: Labelled): LabelDom {
    const existing = this.doms.get(id);
    if (existing) return existing;

    const root = document.createElement("div");
    root.className = "wl-label";

    const name = document.createElement("div");
    name.className = src.labelParty ? "wl-name wl-party" : "wl-name";
    name.textContent = src.labelName;
    root.appendChild(name);

    let fill: HTMLElement | null = null;
    if (src.labelHpFrac() !== null) {
      const bar = document.createElement("div");
      bar.className = "wl-bar";
      fill = document.createElement("div");
      fill.className = "wl-fill";
      bar.appendChild(fill);
      root.appendChild(bar);
    }

    this.layer.appendChild(root);
    const dom: LabelDom = { root, name, fill };
    this.doms.set(id, dom);
    return dom;
  }
}
