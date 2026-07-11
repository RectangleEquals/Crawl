/**
 * Builds the render scene for an area from its (already generated) chamber
 * data — geometry conversion at the space boundary, PSX materials, lighting.
 * The session owns generation; this file only visualizes (Docs/02 §2).
 */

import * as THREE from "three";
import {
  SUNKEN_PARISH, generateKitTextures, rampRgb, Rng,
  type AreaRef, type ChamberData, type MeshData,
} from "@crawlstar/shared";
import { convertIndices, convertTriples, worldVecToRender } from "../render/space.js";
import { psxify, toDataTexture } from "../render/psx/materials.js";

export interface FlickerLight {
  light: THREE.PointLight;
  baseIntensity: number;
  phase: number;
}

export interface BuiltArea {
  scene: THREE.Scene;
  keyLight: THREE.DirectionalLight;
  flickerLights: FlickerLight[];
  triangleCount: number;
}

export function buildAreaScene(ref: AreaRef, chamber: ChamberData): BuiltArea {
  const style = SUNKEN_PARISH;
  const textures = generateKitTextures(style, new Rng(ref.seed));

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(style.fog.color);
  scene.fog = new THREE.FogExp2(fogColor, style.fog.density);
  scene.background = fogColor;

  const rampColor = (ramp: "gloam" | "accent"): THREE.Color => {
    const steps = rampRgb(style, ramp);
    const bright = steps[steps.length - 1];
    return new THREE.Color((bright?.r ?? 255) / 255, (bright?.g ?? 255) / 255, (bright?.b ?? 255) / 255);
  };
  const shardColor = rampColor("gloam");
  const emberColor = rampColor("accent");

  let triangleCount = 0;
  for (const meshData of chamber.meshes) {
    const emissiveColor = meshData.texture === "ember" ? emberColor : shardColor;
    const mesh = buildMesh(meshData, textures[meshData.texture], emissiveColor);
    triangleCount += meshData.indices.length / 3;
    scene.add(mesh);
  }

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(style.lightMood.ambientColor),
    new THREE.Color("#0a0c12"),
    style.lightMood.ambientIntensity,
  );
  scene.add(hemi);

  const bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());
  const keyDir = new THREE.Vector3(...worldVecToRender(chamber.keyDir)).normalize();
  const key = new THREE.DirectionalLight(
    new THREE.Color(style.lightMood.keyColor),
    style.lightMood.keyIntensity,
  );
  key.position.copy(center).addScaledVector(keyDir, -30);
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.near = 5;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  scene.add(key, key.target);

  const flickerLights: FlickerLight[] = [];
  let phase = 0;
  for (const spec of chamber.pointLights) {
    const light = new THREE.PointLight(rampColor(spec.ramp), spec.intensity, spec.range, 2);
    light.position.set(...worldVecToRender(spec.position));
    scene.add(light);
    if (spec.flicker) {
      flickerLights.push({ light, baseIntensity: spec.intensity, phase: (phase += 7.31) });
    }
  }

  return { scene, keyLight: key, flickerLights, triangleCount };
}

function buildMesh(
  meshData: MeshData,
  texture: { width: number; height: number; data: Uint8ClampedArray },
  emissiveColor: THREE.Color,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(convertTriples(meshData.positions), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(convertTriples(meshData.normals), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(meshData.uvs), 2));
  geometry.setIndex(new THREE.BufferAttribute(convertIndices(meshData.indices), 1));

  const map = toDataTexture(texture);
  let material: THREE.MeshPhongMaterial;
  if (meshData.emissive) {
    material = new THREE.MeshPhongMaterial({
      map,
      emissive: emissiveColor,
      emissiveMap: map,
      emissiveIntensity: 2.4,
      shininess: 40,
      specular: new THREE.Color("#2a3a2a"),
    });
  } else if (meshData.translucent) {
    material = new THREE.MeshPhongMaterial({
      map,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      shininess: 120,
      specular: new THREE.Color("#2a3a4a"),
    });
  } else {
    material = new THREE.MeshPhongMaterial({
      map,
      shininess: 10,
      specular: new THREE.Color("#14161c"),
    });
  }
  psxify(material);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = !meshData.translucent;
  mesh.receiveShadow = true;
  return mesh;
}
