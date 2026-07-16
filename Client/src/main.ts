import * as THREE from "three";
import { PLAYER_EYE, TICK_DT, Buttons, initPhysics, type AreaRef, type ChamberData, type Transport } from "@crawlstar/shared";
import { PsxPipeline, INTERNAL_RESOLUTIONS, volumetricDensity, type InternalRes } from "./render/psx/pipeline.js";
import { renderVecToWorld, worldVecToRender } from "./render/space.js";
import { buildAreaScene, type FlickerLight } from "./scene/buildArea.js";
import { GameSession } from "./game/session.js";
import { Avatar } from "./game/avatar.js";
import { WorldLabels } from "./game/worldLabels.js";
import { GadgetPickups } from "./game/gadgetPickups.js";
import { CombatFx } from "./game/combatFx.js";
import { InputSystem } from "./input/actions.js";
import { WsTransport, WorkerTransport, withLatency } from "./net/transports.js";
import { Hud } from "./ui/hud.js";
import { LoadingPlate } from "./ui/loadingPlate.js";

const params = new URLSearchParams(location.search);
const requestedMode = params.get("mode") ?? "online";
const lowFx = params.get("lowfx") === "1";
const simRtt = Number(params.get("rtt") ?? 0);
const playerName = params.get("name") ?? `Pilgrim-${Math.floor(Math.random() * 900 + 100)}`;
const serverUrl = params.get("server") ?? `ws://${location.hostname}:8787`;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud") as HTMLElement;
const hud = new Hud(hudRoot);
const plate = new LoadingPlate(document.body);
const input = new InputSystem(canvas, params.get("touch") === "1");

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
  // solo tuning knobs (parity with the server's env vars): ?bots ?enemies ?cdscale
  const numParam = (k: string): number | undefined => (params.has(k) ? Number(params.get(k)) : undefined);
  worker.postMessage({ __cfg: { bots: numParam("bots"), enemies: numParam("enemies"), cdscale: numParam("cdscale"), seed: params.get("seed") ?? undefined } });
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
const camPos = new THREE.Vector3();

const avatars = new Map<number, Avatar>();
const labelEntries = new Map<number, Avatar>(); // reused each frame (name/HP overlay)
const SELF_LABEL_ID = -1;
let myAvatar: Avatar | null = null;
let currentScene: THREE.Scene | null = null;
let fx: CombatFx | null = null;
let labels: WorldLabels | null = null;
let gadgetPickups: GadgetPickups | null = null;
let prevGadgetBits = 0;

function rebuildScene(ref: AreaRef, chamber: ChamberData): void {
  const built = buildAreaScene(ref, chamber);
  currentScene = built.scene;
  flickerLights = built.flickerLights;
  built.scene.add(camera);

  for (const a of avatars.values()) a.dispose();
  avatars.clear();
  myAvatar?.dispose();
  myAvatar = new Avatar(playerName, 0, false);
  myAvatar.group.visible = !firstPerson;
  built.scene.add(myAvatar.group);

  if (!pipeline) {
    const res = INTERNAL_RESOLUTIONS[lowFx ? 0 : 1] as InternalRes;
    if (lowFx) volumetricDensity.value = 0;
    pipeline = new PsxPipeline(canvas, built.scene, camera, built.keyLight, res);
    pipeline.fitCanvasToWindow(canvas);
    hud.setRes(pipeline.internalRes.name, pipeline.internalRes.width, pipeline.internalRes.height);
  } else {
    pipeline.setScene(built.scene, built.keyLight);
  }

  if (!fx) fx = new CombatFx(built.scene, camera, canvas, document.body, session.playerId);
  else {
    fx.setScene(built.scene);
    fx.setSelfId(session.playerId);
  }
  if (!labels) labels = new WorldLabels(camera, canvas, document.body);
  else labels.clear();
  if (!gadgetPickups) gadgetPickups = new GadgetPickups(built.scene);
  else gadgetPickups.setScene(built.scene);
  hud.setArea(ref.name);
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
  onTransitionBegin: (ref) => plate.show(ref.name),
  onTransitionEnd: () => plate.hide(),
  onRejected: (reason) => {
    document.body.innerHTML = `<pre style="color:#e06a6a;font-size:20px;padding:40px">${reason}</pre>`;
  },
});

(window as unknown as Record<string, unknown>)["__crawlstar"] = {
  get rtt() { return session.rttMs; },
  get reconErr() { return session.reconciliationError; },
  get area() { return session.areaRef?.name ?? ""; },
  get pos() { return session.renderPos(0); },
  get phase() { return session.phase; },
  get remotes() { return session.rosterNames(); },
  get yaw() { return session.yaw; },
  set yaw(v: number) { session.yaw = Number(v); },
  get mode() { return mode; },
  get lastInput() { return lastSampled; },
  get hp() { return session.self.hp; },
  get maxHp() { return session.self.maxHp; },
  get resource() { return session.self.resource; },
  get maxResource() { return session.self.maxResource; },
  get abilityReady() { return session.self.abilityReady; },
  get blocking() { return session.self.blocking; },
  get downed() { return session.self.downed; },
  get enemyCount() { return session.entityViews().filter((v) => v.kind !== 0).length; },
  get entityCount() { return session.entityViews().length; },
  // M4 acceptance hooks
  get areaId() { return session.areaRef?.areaId ?? 0; },
  get gadgetBits() { return session.self.gadgetBits; },
  get sealed() { return session.sealedPassage(session.renderPos(0)); },
  get areaGadgets() {
    const a = session.currentArea();
    return a ? a.gadgets.filter((g) => !session.hasGadget(g.bit)).map((g) => g.pos) : [];
  },
  // nearest live enemy as [dx, dy, dist] in world space (for the acceptance driver)
  get nearestEnemy() {
    const me = session.renderPos(0);
    let best: [number, number, number] | null = null;
    let bd = Infinity;
    for (const v of session.entityViews()) {
      if (v.kind === 0 || v.hpFrac <= 0) continue;
      const s = v.view.sample(lastRenderTick);
      if (!s) continue;
      const dx = s.pos[0] - me[0];
      const dy = s.pos[1] - me[1];
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = [dx, dy, d]; }
    }
    return best;
  },
};
let lastSampled: unknown = null;
let lastRenderTick = 0;

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
  hud.setPointerLocked(input.pointerLocked || input.device === "touch");
}
document.addEventListener("pointerlockchange", updatePrompt);
updatePrompt();

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

function buttonsFrom(f: ReturnType<InputSystem["sample"]>): number {
  let b = 0;
  if (f.jump) b |= Buttons.Jump;
  if (f.sprint) b |= Buttons.Sprint;
  if (f.attack) b |= Buttons.Attack;
  if (f.block) b |= Buttons.Block;
  if (f.ability1) b |= Buttons.Ability1;
  if (f.ability2) b |= Buttons.Ability2;
  if (f.ability3) b |= Buttons.Ability3;
  return b;
}

let last = performance.now();
let elapsed = 0;
let fpsEma = 60;
let hudTimer = 0;
let tickAcc = 0;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  elapsed += dt;

  const f = input.sample();
  lastSampled = f;
  const buttons = buttonsFrom(f);

  session.yaw -= f.lookDX * MOUSE_SENS + f.padLookX * PAD_LOOK_SPEED * dt;
  pitch -= f.lookDY * MOUSE_SENS + f.padLookY * PAD_LOOK_SPEED * dt;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
  if (f.toggleCamera) {
    firstPerson = !firstPerson;
    if (myAvatar) myAvatar.group.visible = !firstPerson;
  }

  tickAcc += dt;
  while (tickAcc >= TICK_DT) {
    tickAcc -= TICK_DT;
    session.clientTick(f.moveX, f.moveY, buttons);
  }

  // camera
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
    const back = new THREE.Vector3(0, 0, 1).applyEuler(camera.rotation);
    const boomMax = 3.0;
    const dirW = renderVecToWorld([back.x, back.y, back.z]);
    const hit = session.cameraRay([feetW[0], feetW[1], feetW[2] + PLAYER_EYE], dirW, boomMax);
    const boom = Math.max(0.4, (hit ?? boomMax) - 0.18);
    const desired = head.clone().addScaledVector(back, boom).add(new THREE.Vector3(0, 0.25, 0));
    camPos.lerp(desired, Math.min(1, dt * 14));
    camera.position.copy(camPos);
  }

  // self avatar (third person) + self combat visuals
  if (myAvatar) {
    const selfFlags = (session.self.downed ? 1 : 0) | (session.self.blocking ? 2 : 0);
    myAvatar.setCombat(session.self.maxHp > 0 ? session.self.hp / session.self.maxHp : 1, selfFlags, session.self.tagFlags);
    if (!firstPerson) {
      const moving = Math.abs(f.moveX) + Math.abs(f.moveY) > 0.05;
      myAvatar.update(feetR, yawRender, session.grounded ? (moving ? 1 : 0) : 2, dt);
    }
  }

  // remote + enemy avatars, interpolated
  const renderTick = session.clock.advance(dt);
  lastRenderTick = renderTick;
  const views = session.entityViews();
  const seen = new Set<number>();
  labelEntries.clear();
  for (const v of views) {
    seen.add(v.id);
    let a = avatars.get(v.id);
    if (!a) {
      a = new Avatar(v.name, v.kind, true);
      avatars.set(v.id, a);
      currentScene?.add(a.group);
    }
    const s = v.view.sample(renderTick);
    if (s) a.update(new THREE.Vector3(...worldVecToRender(s.pos)), s.yaw, s.anim, dt);
    a.setCombat(v.hpFrac / 255, v.stateFlags, v.tagFlags);
    labelEntries.set(v.id, a);
  }
  for (const [id, a] of avatars) {
    if (!seen.has(id)) {
      a.dispose();
      avatars.delete(id);
    }
  }

  // native-res floating nameplates + HP bars (never through the post chain)
  if (labels) {
    if (!firstPerson && myAvatar) labelEntries.set(SELF_LABEL_ID, myAvatar);
    labels.update(labelEntries);
  }

  // M4: gadget pickups (glowing Instruments), gate feedback, acquire flourish
  if (gadgetPickups) {
    const area = session.currentArea();
    gadgetPickups.sync(area?.gadgets ?? [], (b) => session.hasGadget(b));
    gadgetPickups.update(dt);
  }
  const gb = session.self.gadgetBits;
  if (gb !== prevGadgetBits) {
    const status = session.gadgetStatus();
    for (let i = 0; i < status.length; i++) {
      if ((gb & (1 << i)) !== 0 && (prevGadgetBits & (1 << i)) === 0) hud.flashAcquire(status[i]!.name);
    }
    prevGadgetBits = gb;
    hud.setInstruments(status);
  }
  hud.setSealed(session.sealedPassage(feetW));

  // combat juice
  if (fx) {
    fx.handleEvents(session.drainEvents());
    fx.updateProjectiles(session.projectiles());
    fx.update(dt);
  }

  // cosmetic light flicker
  for (const fl of flickerLights) {
    const n = flickerNoise(elapsed * 9 + fl.phase) * 0.7 + flickerNoise(elapsed * 23 + fl.phase) * 0.3;
    fl.light.intensity = fl.baseIntensity * (0.72 + 0.4 * n);
  }
  lantern.intensity = 5 * (0.9 + 0.1 * flickerNoise(elapsed * 6));

  pipeline?.render(dt);

  if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
  hudTimer += dt;
  if (hudTimer > 0.4) {
    hudTimer = 0;
    hud.setFps(fpsEma);
    hud.setNet(session.rttMs, session.reconciliationError);
    hud.setCombat(session.self);
    hud.setRoster(session.rosterNames(), playerName);
    hud.setInstruments(session.gadgetStatus());
    hud.setAstrolabe(session.rememberedLocks());
  }
  requestAnimationFrame(frame);
}

onResize();
requestAnimationFrame(frame);
