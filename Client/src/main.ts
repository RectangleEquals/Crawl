import * as THREE from "three";
import {
  PLAYER_EYE, TICK_DT, initPhysics,
  type AreaRef, type ChamberData, type Transport,
} from "@crawlstar/shared";
import { PsxPipeline, INTERNAL_RESOLUTIONS, volumetricDensity, type InternalRes } from "./render/psx/pipeline.js";
import { renderVecToWorld, worldVecToRender } from "./render/space.js";
import { buildAreaScene, type FlickerLight } from "./scene/buildArea.js";
import { GameSession, type RemoteEntity } from "./game/session.js";
import { Avatar } from "./game/avatar.js";
import { InputSystem } from "./input/actions.js";
import { WsTransport, WorkerTransport, withLatency } from "./net/transports.js";
import { Hud } from "./ui/hud.js";
import { LoadingPlate } from "./ui/loadingPlate.js";

// ------------------------------------------------------------ bootstrap

const params = new URLSearchParams(location.search);
const requestedMode = params.get("mode") ?? "online";
const lowFx = params.get("lowfx") === "1"; // headless/perf testing: skip the raymarch
const simRtt = Number(params.get("rtt") ?? 0);
const playerName = params.get("name") ?? `Pilgrim-${Math.floor(Math.random() * 900 + 100)}`;
const serverUrl = params.get("server") ?? `ws://${location.hostname}:8787`;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud") as HTMLElement;
const hud = new Hud(hudRoot);
const plate = new LoadingPlate(document.body);
const input = new InputSystem(canvas, params.get("touch") === "1");

// the client's prediction mirror is a Rapier world too — WASM must be ready
// before the first Welcome arrives (Docs/02 §4.1)
await initPhysics();

async function makeTransport(): Promise<{ transport: Transport; mode: "online" | "solo" }> {
  if (requestedMode !== "solo") {
    const ws = new WsTransport();
    try {
      await ws.connect(serverUrl);
      return { transport: simRtt > 0 ? withLatency(ws, simRtt) : ws, mode: "online" };
    } catch {
      console.warn(`[crawlstar] ${serverUrl} unreachable — falling back to integrated server`);
    }
  }
  const worker = new Worker(new URL("./worker/integratedServer.ts", import.meta.url), { type: "module" });
  const t = new WorkerTransport(worker);
  return { transport: simRtt > 0 ? withLatency(t, simRtt) : t, mode: "solo" };
}

// ------------------------------------------------------------ render state

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
const lantern = new THREE.PointLight(new THREE.Color("#e8a94e"), 5, 9, 2);
lantern.position.set(0.12, -0.18, 0.05);
camera.add(lantern);

let pipeline: PsxPipeline | null = null;
let flickerLights: FlickerLight[] = [];
let firstPerson = true;
let pitch = 0;
let camPos = new THREE.Vector3();

const avatars = new Map<number, Avatar>();
let myAvatar: Avatar | null = null;
let currentScene: THREE.Scene | null = null;
let roster: readonly RemoteEntity[] = [];

function rebuildScene(ref: AreaRef, chamber: ChamberData): void {
  const built = buildAreaScene(ref, chamber);
  currentScene = built.scene;
  flickerLights = built.flickerLights;
  built.scene.add(camera); // lantern travels with the player

  for (const a of avatars.values()) a.dispose();
  avatars.clear();
  myAvatar?.dispose();
  myAvatar = new Avatar(playerName, false, 7);
  myAvatar.group.visible = !firstPerson;
  built.scene.add(myAvatar.group);

  if (!pipeline) {
    const res = INTERNAL_RESOLUTIONS[lowFx ? 0 : 1] as InternalRes;
    if (lowFx) volumetricDensity.value = 0;
    pipeline = new PsxPipeline(canvas, built.scene, camera, built.keyLight, res);
    pipeline.fitCanvasToWindow(canvas); // the startup resize ran before we existed
    const r = pipeline.internalRes;
    hud.setRes(r.name, r.width, r.height);
  } else {
    pipeline.setScene(built.scene, built.keyLight);
  }
  hud.setArea(ref.name);
}

function syncAvatars(): void {
  if (!currentScene) return;
  const seen = new Set<number>();
  for (const r of roster) {
    seen.add(r.id);
    if (!avatars.has(r.id)) {
      const a = new Avatar(r.name, r.isBot, r.id);
      avatars.set(r.id, a);
      currentScene.add(a.group);
    }
  }
  for (const [id, a] of avatars) {
    if (!seen.has(id)) {
      a.dispose();
      avatars.delete(id);
    }
  }
  hud.setRoster(roster.map((r) => r.name), playerName);
}

// ------------------------------------------------------------ session

const { transport, mode } = await makeTransport();
hud.setMode(mode);
hud.setDevice(input.device);
input.onDevice((d) => {
  hud.setDevice(d);
  updatePrompt();
});

const session = new GameSession(transport, playerName, {
  onArea: (ref, chamber) => rebuildScene(ref, chamber),
  onRoster: (list) => {
    roster = list;
    syncAvatars();
  },
  onTransitionBegin: (ref) => plate.show(ref.name),
  onTransitionEnd: () => plate.hide(),
  onRejected: (reason) => {
    document.body.innerHTML = `<pre style="color:#e06a6a;font-size:20px;padding:40px">${reason}</pre>`;
  },
});

// debug/acceptance handle (read by the automated netcode test)
(window as unknown as Record<string, unknown>)["__crawlstar"] = {
  get rtt() { return session.rttMs; },
  get reconErr() { return session.reconciliationError; },
  get area() { return session.areaRef?.name ?? ""; },
  get pos() { return session.renderPos(0); },
  get phase() { return session.phase; },
  get remotes() { return session.remoteList().map((r) => r.name); },
  get yaw() { return session.yaw; },
  // debug steering hook (yaw is an INPUT — the server still owns all state)
  set yaw(v: number) { session.yaw = Number(v); },
  get mode() { return mode; },
  get lastInput() { return lastSampled; },
};
let lastSampled: unknown = null;

// ------------------------------------------------------------ controls & loop

const MOUSE_SENS = 0.0022;
const PAD_LOOK_SPEED = 2.6;

window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") applyRes(0);
  if (e.code === "Digit2") applyRes(1);
  if (e.code === "Digit3") applyRes(2);
});

function applyRes(index: number): void {
  const res = INTERNAL_RESOLUTIONS[index];
  if (!res || !pipeline) return;
  pipeline.setInternalResolution(res);
  hud.setRes(res.name, res.width, res.height);
}

function onResize(): void {
  pipeline?.fitCanvasToWindow(canvas);
}
window.addEventListener("resize", onResize);

function updatePrompt(): void {
  // the capture prompt is a mouse concept; touch players just play
  hud.setPointerLocked(input.pointerLocked || input.device === "touch");
}
document.addEventListener("pointerlockchange", updatePrompt);
updatePrompt();

/** Smooth 1D value noise for cosmetic flicker (client-only, never sim). */
function flickerNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const h = (k: number): number => {
    const x = Math.sin(k * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  return h(i) * (1 - s) + h(i + 1) * s;
}

let last = performance.now();
let elapsed = 0;
let fpsEma = 60;
let hudTimer = 0;
let tickAcc = 0;

function frame(now: number): void {
  // generous clamp: slow frames must still yield full prediction-tick batches
  // (starving the server of inputs reads as rubber-banding)
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  elapsed += dt;

  const f = input.sample();
  lastSampled = f;

  // look: sim yaw is CCW-positive (0 = north), so mouse-right decreases it
  session.yaw -= f.lookDX * MOUSE_SENS + f.padLookX * PAD_LOOK_SPEED * dt;
  pitch -= f.lookDY * MOUSE_SENS + f.padLookY * PAD_LOOK_SPEED * dt;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
  if (f.toggleCamera) {
    firstPerson = !firstPerson;
    if (myAvatar) myAvatar.group.visible = !firstPerson;
  }

  // fixed-tick prediction clock (mirrors the server's 30 Hz)
  tickAcc += dt;
  while (tickAcc >= TICK_DT) {
    tickAcc -= TICK_DT;
    session.clientTick(f.moveX, f.moveY, f.jump, f.sprint);
  }

  // camera: with the rotation mapping, sim yaw IS the camera's Y rotation
  const feetW = session.renderPos(dt);
  const feetR = new THREE.Vector3(...worldVecToRender(feetW));
  const yawRender = session.yaw;
  const head = feetR.clone().add(new THREE.Vector3(0, PLAYER_EYE, 0));
  if (firstPerson) {
    camPos.copy(head);
    camera.position.copy(camPos);
    camera.rotation.set(pitch, yawRender, 0, "YXZ");
  } else {
    camera.rotation.set(pitch, yawRender, 0, "YXZ");
    const back = new THREE.Vector3(0, 0, 1).applyEuler(camera.rotation); // −forward
    const boomMax = 2.8;
    const dirW = renderVecToWorld([back.x, back.y, back.z]);
    const hit = session.cameraRay([feetW[0], feetW[1], feetW[2] + PLAYER_EYE], dirW, boomMax);
    const boom = Math.max(0.4, (hit ?? boomMax) - 0.18);
    const desired = head.clone().addScaledVector(back, boom).add(new THREE.Vector3(0, 0.25, 0));
    camPos.lerp(desired, Math.min(1, dt * 14));
    camera.position.copy(camPos);
  }

  // own avatar (third person)
  if (myAvatar && !firstPerson) {
    const moving = Math.abs(f.moveX) + Math.abs(f.moveY) > 0.05;
    const anim = session.grounded ? (moving ? 1 : 0) : 2;
    myAvatar.update(feetR, yawRender, anim, dt);
  }

  // remotes: interpolate ~100 ms behind the newest snapshot
  const renderTick = session.clock.advance(dt);
  for (const r of session.remoteList()) {
    const avatar = avatars.get(r.id);
    const s = r.view.sample(renderTick);
    if (avatar && s) {
      avatar.update(new THREE.Vector3(...worldVecToRender(s.pos)), s.yaw, s.anim, dt);
    }
  }

  // cosmetic torch flicker + lantern breathing
  for (const fl of flickerLights) {
    const n = flickerNoise(elapsed * 9 + fl.phase) * 0.7 + flickerNoise(elapsed * 23 + fl.phase) * 0.3;
    fl.light.intensity = fl.baseIntensity * (0.72 + 0.4 * n);
  }
  lantern.intensity = 5 * (0.9 + 0.1 * flickerNoise(elapsed * 6));

  pipeline?.render(dt);

  if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
  hudTimer += dt;
  if (hudTimer > 0.5) {
    hudTimer = 0;
    hud.setFps(fpsEma);
    hud.setNet(session.rttMs, session.reconciliationError);
  }
  requestAnimationFrame(frame);
}

onResize();
requestAnimationFrame(frame);
