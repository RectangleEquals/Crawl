import * as THREE from "three";
import { buildChamberScene } from "./scene/buildChamber.js";
import { PsxPipeline, INTERNAL_RESOLUTIONS, type InternalRes } from "./render/psx/pipeline.js";
import { FlyCam } from "./controls/flycam.js";
import { Hud } from "./ui/hud.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hud = new Hud(document.getElementById("hud") as HTMLElement);

const { scene, spawnPosition, triangleCount } = buildChamberScene("m1-demo");

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
camera.position.copy(spawnPosition);

const classic = INTERNAL_RESOLUTIONS[1] as InternalRes;
const pipeline = new PsxPipeline(canvas, scene, camera, classic);
hud.setRes(classic.name, classic.width, classic.height);
hud.setTris(triangleCount);

const fly = new FlyCam(camera, canvas);
fly.yaw = Math.PI; // face down the nave toward the dais (+Z render)

function applyRes(index: number): void {
  const res = INTERNAL_RESOLUTIONS[index];
  if (!res) return;
  pipeline.setInternalResolution(res);
  hud.setRes(res.name, res.width, res.height);
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") applyRes(0);
  if (e.code === "Digit2") applyRes(1);
  if (e.code === "Digit3") applyRes(2);
});

function onResize(): void {
  pipeline.fitCanvasToWindow(canvas);
}
window.addEventListener("resize", onResize);
onResize();

document.addEventListener("pointerlockchange", () => hud.setPointerLocked(fly.pointerLocked));
hud.setPointerLocked(false);

let last = performance.now();
let fpsEma = 60;
let hudTimer = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  fly.update(dt);
  pipeline.render();

  if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
  hudTimer += dt;
  if (hudTimer > 0.5) {
    hudTimer = 0;
    hud.setFps(fpsEma);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
