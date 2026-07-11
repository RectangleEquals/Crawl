/**
 * The PSX-modern pipeline (Docs/01 §2): render at a low internal resolution
 * with modern lighting, post-process (bloom → tonemap → ordered dither), and
 * let CSS nearest-neighbor upscale the canvas. UI stays native-res DOM.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { snapResolution } from "./materials.js";

export interface InternalRes {
  name: string;
  width: number;
  height: number;
}

export const INTERNAL_RESOLUTIONS: readonly InternalRes[] = [
  { name: "Purist", width: 320, height: 180 },
  { name: "Classic", width: 480, height: 270 },
  { name: "Crisp", width: 640, height: 360 },
];

/** Ordered 4×4 Bayer dither + posterization, applied after tone mapping. */
const DitherShader = {
  name: "CrawlstarDither",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLevels: { value: 26.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uLevels;
    varying vec2 vUv;

    // compact recursive Bayer (no arrays — GLSL ES 1.0 safe)
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = bayer4(gl_FragCoord.xy) - 0.5;
      color.rgb = floor(color.rgb * uLevels + 0.5 + d) / uLevels;
      gl_FragColor = color;
    }
  `,
};

export class PsxPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private res: InternalRes;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera, res: InternalRes) {
    this.res = res;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // pixels are the point
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(res.width, res.height), 0.55, 0.5, 0.8);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(DitherShader));

    this.setInternalResolution(res);
  }

  get internalRes(): InternalRes {
    return this.res;
  }

  setInternalResolution(res: InternalRes): void {
    this.res = res;
    this.renderer.setSize(res.width, res.height, false); // CSS controls display size
    this.composer.setSize(res.width, res.height);
    this.bloomPass.resolution.set(res.width, res.height);
    snapResolution.set(res.width, res.height);
  }

  /** Letterbox the canvas into the window at 16:9 with pixelated upscale. */
  fitCanvasToWindow(canvas: HTMLCanvasElement): void {
    const aspect = 16 / 9;
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    let w = ww;
    let h = Math.round(ww / aspect);
    if (h > wh) {
      h = wh;
      w = Math.round(wh * aspect);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  render(): void {
    this.composer.render();
  }
}
