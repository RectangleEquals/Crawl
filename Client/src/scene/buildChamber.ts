/**
 * Reconstructs the Shared-generated chamber into a Three scene: geometry
 * conversion at the space boundary, PSX-patched materials, biome lighting.
 * Content decisions all live in Shared (Docs/02 §2 prime directive).
 */

import * as THREE from "three";
import {
  SUNKEN_PARISH,
  generateChamber,
  generateKitTextures,
  rampRgb,
  Rng,
  type MeshData,
} from "@crawlstar/shared";
import { convertIndices, convertTriples, worldVecToRender } from "../render/space.js";
import { psxify, toDataTexture } from "../render/psx/materials.js";

export interface BuiltChamber {
  scene: THREE.Scene;
  spawnPosition: THREE.Vector3;
  triangleCount: number;
}

export function buildChamberScene(seed: string): BuiltChamber {
  const style = SUNKEN_PARISH;
  const chamber = generateChamber(style, seed);
  const textures = generateKitTextures(style, new Rng(seed));

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(style.fog.color);
  scene.fog = new THREE.FogExp2(fogColor, style.fog.density);
  scene.background = fogColor;

  const gloamRamp = rampRgb(style, "gloam");
  const gloamBright = gloamRamp[gloamRamp.length - 1];
  const shardColor = new THREE.Color(
    (gloamBright?.r ?? 126) / 255,
    (gloamBright?.g ?? 224) / 255,
    (gloamBright?.b ?? 106) / 255,
  );

  let triangleCount = 0;
  for (const meshData of chamber.meshes) {
    const mesh = buildMesh(meshData, textures[meshData.texture], shardColor);
    triangleCount += meshData.indices.length / 3;
    scene.add(mesh);
  }

  // ambient: cold hemisphere per style
  const hemi = new THREE.HemisphereLight(
    new THREE.Color(style.lightMood.ambientColor),
    new THREE.Color("#0a0c12"),
    style.lightMood.ambientIntensity,
  );
  scene.add(hemi);

  // key: moonlight raking through the collapsed roof, shadow-casting
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

  // gloam point lights at shard clusters
  for (const spec of chamber.pointLights) {
    const light = new THREE.PointLight(shardColor, spec.intensity, spec.range, 2);
    light.position.set(...worldVecToRender(spec.position));
    scene.add(light);
  }

  return {
    scene,
    spawnPosition: new THREE.Vector3(...worldVecToRender(chamber.spawn.position)),
    triangleCount,
  };
}

function buildMesh(
  meshData: MeshData,
  texture: { width: number; height: number; data: Uint8ClampedArray },
  shardColor: THREE.Color,
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
      emissive: shardColor,
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
