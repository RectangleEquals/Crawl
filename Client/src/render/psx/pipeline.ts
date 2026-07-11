/**
 * The PSX-modern pipeline (Docs/01 §2): render at a low internal resolution
 * with modern lighting, then post: volumetric light shafts (raymarched
 * against the key light's shadow map) → bloom → tonemap → ordered dither —
 * and let CSS nearest-neighbor upscale the canvas. UI stays native-res DOM.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
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

/** Global dial for the moonbeam strength (0 disables the march entirely). */
export const volumetricDensity = { value: 0.032 };

/**
 * Scattering fades out above this render-space height. Without it, rays
 * exiting through roof holes accumulate 40 m of unoccluded "sky" and blow
 * out — beams belong inside the room, not above it.
 */
export const volumetricFadeHeight = { value: 4.1 };

/**
 * Raymarched volumetric light: for each pixel, march the view ray through
 * the fog and accumulate key-light scattering wherever the shadow map says
 * the air is lit — the moonbeams through the collapsed roof.
 */
class VolumetricLightPass extends Pass {
  private readonly fsQuad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly light: THREE.DirectionalLight,
    sceneTexture: THREE.Texture,
    depthTexture: THREE.DepthTexture,
  ) {
    super();
    this.needsSwap = false; // like RenderPass: writes the chain's read buffer

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: sceneTexture },
        tDepth: { value: depthTexture },
        tShadow: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uLightColor: { value: new THREE.Color(1, 1, 1) },
        uLightDir: { value: new THREE.Vector3(0, -1, 0) },
        uDensity: { value: 0 },
        uFadeHeight: volumetricFadeHeight,
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tShadow;
        uniform mat4 uShadowMatrix;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        uniform vec3 uLightColor;
        uniform vec3 uLightDir;
        uniform float uDensity;
        uniform float uFadeHeight;
        uniform float uTime;
        varying vec2 vUv;

        const int STEPS = 20;
        const float MAX_DIST = 40.0;

        float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

        float hashn(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hashn(i);
          float b = hashn(i + vec2(1.0, 0.0));
          float c = hashn(i + vec2(0.0, 1.0));
          float d = hashn(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        vec3 worldPos(vec2 uv, float depth) {
          vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 view = uInvProj * ndc;
          view /= view.w;
          return (uCamWorld * view).xyz;
        }

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          if (uDensity <= 0.0) { gl_FragColor = color; return; }

          float depth = texture2D(tDepth, vUv).x;
          vec3 wp = worldPos(vUv, depth);
          vec3 camPos = uCamWorld[3].xyz;
          vec3 ray = wp - camPos;
          float dist = length(ray);
          vec3 dir = ray / max(dist, 1e-4);
          float marchLen = min(dist, MAX_DIST);
          float stepLen = marchLen / float(STEPS);
          float jitter = bayer4(gl_FragCoord.xy);

          // mild forward scattering: beams read strongest looking up-beam
          float phase = 0.55 + 0.45 * pow(max(dot(dir, -uLightDir), 0.0), 2.0);

          vec3 accum = vec3(0.0);
          for (int i = 0; i < STEPS; i++) {
            vec3 p = camPos + dir * (stepLen * (float(i) + jitter));
            vec4 sc = uShadowMatrix * vec4(p, 1.0);
            sc.xyz /= sc.w;
            float lit = 0.0;
            if (sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0) {
              float shadowDepth = unpackRGBAToDepth(texture2D(tShadow, sc.xy));
              lit = step(sc.z - 0.0025, shadowDepth);
            }
            // drifting motes give the shafts life
            float shimmer = 0.7 + 0.3 * vnoise(p.xz * 0.45 + vec2(uTime * 0.12, uTime * 0.07));
            // confine scattering to the room: fade out above the roofline
            float hFade = 1.0 - smoothstep(uFadeHeight - 0.3, uFadeHeight + 0.5, p.y);
            accum += uLightColor * (uDensity * stepLen) * lit * shimmer * hFade;
          }
          color.rgb += accum * phase;
          gl_FragColor = color;
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  /** Per-frame uniform sync; call before composer.render(). */
  update(dt: number): void {
    this.time += dt;
    const u = this.material.uniforms;
    (u["uInvProj"] as THREE.IUniform).value = this.camera.projectionMatrixInverse;
    (u["uCamWorld"] as THREE.IUniform).value = this.camera.matrixWorld;
    (u["uTime"] as THREE.IUniform).value = this.time;

    const shadowMap = this.light.shadow.map;
    if (shadowMap) {
      (u["tShadow"] as THREE.IUniform).value = shadowMap.texture;
      (u["uShadowMatrix"] as THREE.IUniform).value = this.light.shadow.matrix;
      (u["uDensity"] as THREE.IUniform).value = volumetricDensity.value;
      const color = (u["uLightColor"] as THREE.IUniform).value as THREE.Color;
      color.copy(this.light.color).multiplyScalar(this.light.intensity);
      const dir = (u["uLightDir"] as THREE.IUniform).value as THREE.Vector3;
      dir.subVectors(this.light.target.position, this.light.position).normalize();
    } else {
      (u["uDensity"] as THREE.IUniform).value = 0;
    }
  }

  override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

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
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly volumetricPass: VolumetricLightPass;
  private sceneTarget: THREE.WebGLRenderTarget;
  private res: InternalRes;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    keyLight: THREE.DirectionalLight,
    res: InternalRes,
  ) {
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

    this.sceneTarget = this.makeSceneTarget(res.width, res.height);

    this.composer = new EffectComposer(this.renderer);
    this.volumetricPass = new VolumetricLightPass(
      camera,
      keyLight,
      this.sceneTarget.texture,
      this.sceneTarget.depthTexture as THREE.DepthTexture,
    );
    this.composer.addPass(this.volumetricPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(res.width, res.height), 0.55, 0.5, 0.8);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(DitherShader));

    this.setInternalResolution(res);
  }

  private makeSceneTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const depthTexture = new THREE.DepthTexture(w, h);
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
    });
    return target;
  }

  get internalRes(): InternalRes {
    return this.res;
  }

  setInternalResolution(res: InternalRes): void {
    this.res = res;
    this.renderer.setSize(res.width, res.height, false); // CSS controls display size
    this.sceneTarget.setSize(res.width, res.height);
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

  render(dt: number): void {
    // 1. scene (with shadow maps) into the depth-carrying internal target
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    // 2. post chain: volumetrics → bloom → tonemap → dither → screen
    this.volumetricPass.update(dt);
    this.composer.render();
  }
}
