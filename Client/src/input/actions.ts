/**
 * Action-map input layer (Docs/02 §6): gameplay reads ACTIONS, never raw
 * events. KB/M and Gamepad both publish; last meaningful input wins the
 * active-device flag (drives HUD glyph swap).
 */

import { TouchControls } from "./touch.js";

export type InputDevice = "kbm" | "pad" | "touch";

export interface FrameInput {
  moveX: number; // strafe [-1,1]
  moveY: number; // forward [-1,1]
  jump: boolean;
  sprint: boolean;
  attack: boolean; // primary (held)
  block: boolean; // brace (held)
  ability1: boolean; // Ward Wall
  ability2: boolean; // Shield Slam (Launch)
  ability3: boolean; // Ground Slam
  /** mouse look delta (pixels) since last sample */
  lookDX: number;
  lookDY: number;
  /** gamepad look rate [-1,1] (applied × sensitivity × dt by the camera) */
  padLookX: number;
  padLookY: number;
  /** edge-triggered camera toggle */
  toggleCamera: boolean;
}

const DEADZONE = 0.16;

function radialDeadzone(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const scaled = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  return [(x / m) * scaled, (y / m) * scaled];
}

export class InputSystem {
  device: InputDevice = "kbm";
  readonly touch: TouchControls;

  private readonly keys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private cameraTogglePending = false;
  private padCameraHeld = false;
  private onDeviceChange: ((d: InputDevice) => void) | null = null;

  constructor(private readonly element: HTMLElement, forceTouch = false) {
    this.touch = new TouchControls(() => this.setDevice("touch"));
    if (forceTouch) this.touch.enable();
    // the overlay appears on the first real touch, never for mouse users
    window.addEventListener(
      "touchstart",
      () => {
        this.touch.enable();
        this.setDevice("touch");
      },
      { once: true, passive: true },
    );

    element.addEventListener("click", (e) => {
      // pointer lock is a mouse concept; touch look works by dragging
      if ((e as PointerEvent).pointerType === "touch") return;
      if (document.pointerLockElement !== element) element.requestPointerLock();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== this.element) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) this.setDevice("kbm");
    });
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyV") this.cameraTogglePending = true;
      this.setDevice("kbm");
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
    window.addEventListener("gamepadconnected", () => this.setDevice("pad"));
    // combat mouse buttons (fire during pointer lock); suppress the context menu
    window.addEventListener("mousedown", (e) => {
      this.mouseButtons.add(e.button);
      this.setDevice("kbm");
    });
    window.addEventListener("mouseup", (e) => this.mouseButtons.delete(e.button));
    element.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  onDevice(handler: (d: InputDevice) => void): void {
    this.onDeviceChange = handler;
  }

  private setDevice(d: InputDevice): void {
    if (this.device === d) return;
    this.device = d;
    this.onDeviceChange?.(d);
  }

  private firstPad(): Gamepad | null {
    for (const p of navigator.getGamepads()) {
      if (p && p.connected) return p;
    }
    return null;
  }

  /** Drain accumulated deltas + poll devices. Call once per render frame. */
  sample(): FrameInput {
    let moveX = 0;
    let moveY = 0;
    if (this.keys.has("KeyW")) moveY += 1;
    if (this.keys.has("KeyS")) moveY -= 1;
    if (this.keys.has("KeyD")) moveX += 1;
    if (this.keys.has("KeyA")) moveX -= 1;
    let jump = this.keys.has("Space");
    let sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    let attack = this.mouseButtons.has(0);
    let block = this.mouseButtons.has(2);
    let ability1 = this.keys.has("KeyQ");
    let ability2 = this.keys.has("KeyE");
    let ability3 = this.keys.has("KeyF");

    let padLookX = 0;
    let padLookY = 0;
    const pad = this.firstPad();
    if (pad) {
      const [lx, ly] = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      const [rx, ry] = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
      if (lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0) this.setDevice("pad");
      moveX += lx;
      moveY += -ly; // stick up = forward
      padLookX = rx;
      padLookY = ry;
      const btn = (i: number): boolean => (pad.buttons[i]?.pressed ?? false);
      const axisTrigger = (i: number): boolean => (pad.buttons[i]?.value ?? 0) > 0.4;
      if (btn(0)) {
        jump = true;
        this.setDevice("pad");
      }
      if (btn(10)) sprint = true; // L3
      if (axisTrigger(7)) attack = true; // RT
      if (axisTrigger(6)) block = true; // LT
      if (btn(2)) ability1 = true; // X
      if (btn(5)) ability2 = true; // RB
      if (btn(13)) ability3 = true; // D-pad down
      if (attack || block || ability1 || ability2 || ability3) this.setDevice("pad");
      // edge-detect Y (3) for camera toggle
      if (btn(3) && !this.padCameraHeld) this.cameraTogglePending = true;
      this.padCameraHeld = btn(3);
    }

    let lookDX = this.mouseDX;
    let lookDY = this.mouseDY;
    let toggleCamera = this.cameraTogglePending;
    if (this.touch.enabled) {
      const t = this.touch.sample();
      moveX += t.moveX;
      moveY += t.moveY;
      jump ||= t.jump;
      sprint ||= t.sprint;
      lookDX += t.lookDX;
      lookDY += t.lookDY;
      toggleCamera ||= t.toggleCamera;
    }

    const out: FrameInput = {
      moveX: Math.max(-1, Math.min(1, moveX)),
      moveY: Math.max(-1, Math.min(1, moveY)),
      jump,
      sprint,
      attack,
      block,
      ability1,
      ability2,
      ability3,
      lookDX,
      lookDY,
      padLookX,
      padLookY,
      toggleCamera,
    };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.cameraTogglePending = false;
    return out;
  }
}
