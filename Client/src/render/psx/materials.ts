/**
 * PSX material surgery (Docs/01 §2.1): vertex snapping + affine texture
 * interpolation, injected into Three's built-in materials via
 * onBeforeCompile so we keep lights, shadows, and fog for free.
 */

import * as THREE from "three";

/**
 * Shared snap-resolution uniform value. All patched materials reference this
 * one Vector2, so changing internal resolution retunes every material live.
 */
export const snapResolution = new THREE.Vector2(480, 270);

/** 1 = snap to full internal-res pixel grid (subtle); 0.5 = half-res (chunky wobble). */
export const snapStrength = { value: 1.0 };

/**
 * 0 = fully perspective-correct (modern), 1 = fully affine (raw PSX swim).
 * The sweet spot keeps the warble readable without textures crawling.
 */
export const affineStrength = { value: 0.45 };

const VERT_HEADER = /* glsl */ `
uniform vec2 uSnapRes;
uniform float uSnapStrength;
#ifdef USE_MAP
varying vec3 vPsxAffine;
#endif
`;

const VERT_SNAP = /* glsl */ `
#include <project_vertex>
{
  // PSX vertex snapping: quantize NDC xy to the internal-res pixel grid
  vec2 grid = uSnapRes * 0.5 * uSnapStrength;
  vec4 snapped = gl_Position;
  snapped.xyz /= snapped.w;
  snapped.xy = floor(snapped.xy * grid + 0.5) / grid;
  snapped.xyz *= snapped.w;
  gl_Position = snapped;
}
#ifdef USE_MAP
  // affine texturing: undo perspective-correct interpolation in the fragment
  vPsxAffine = vec3(vMapUv * gl_Position.w, gl_Position.w);
#endif
`;

const FRAG_HEADER = /* glsl */ `
uniform float uAffineStrength;
#ifdef USE_MAP
varying vec3 vPsxAffine;
#endif
`;

const FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
{
  vec2 psxUv = mix( vMapUv, vPsxAffine.xy / vPsxAffine.z, uAffineStrength );
  vec4 sampledDiffuseColor = texture2D( map, psxUv );
  diffuseColor *= sampledDiffuseColor;
}
#endif
`;

/** Patch any built-in material (Phong for M1) with the PSX vertex/UV model. */
export function psxify<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms["uSnapRes"] = { value: snapResolution };
    shader.uniforms["uSnapStrength"] = snapStrength;
    shader.uniforms["uAffineStrength"] = affineStrength;
    shader.vertexShader = VERT_HEADER + shader.vertexShader.replace("#include <project_vertex>", VERT_SNAP);
    shader.fragmentShader = FRAG_HEADER + shader.fragmentShader.replace("#include <map_fragment>", FRAG_MAP);
  };
  // affine + snapping changes the program signature
  material.customProgramCacheKey = () => "psx-v1";
  return material;
}

/** Nearest-filtered, palette-authentic DataTexture from Shared texture bytes. */
export function toDataTexture(tex: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(tex.data), tex.width, tex.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
