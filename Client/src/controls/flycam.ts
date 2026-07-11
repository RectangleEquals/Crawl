/**
 * M1 fly-cam: pointer-lock mouselook + WASD/QE noclip flight.
 * Throwaway-grade by design — the real controller arrives in M2.
 */

import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

export class FlyCam {
  yaw = 0;
  pitch = 0;
  speed = 4;
  fastMultiplier = 3.5;
  sensitivity = 0.0022;

  private readonly keys = new Set<string>();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly element: HTMLElement,
  ) {
    this.camera.rotation.order = "YXZ";

    element.addEventListener("click", () => {
      if (document.pointerLockElement !== element) element.requestPointerLock();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== element) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    });
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  update(dt: number): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, UP).normalize();

    const v = this.speed * (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? this.fastMultiplier : 1);
    const step = v * dt;
    if (this.keys.has("KeyW")) this.camera.position.addScaledVector(this.forward, step);
    if (this.keys.has("KeyS")) this.camera.position.addScaledVector(this.forward, -step);
    if (this.keys.has("KeyD")) this.camera.position.addScaledVector(this.right, step);
    if (this.keys.has("KeyA")) this.camera.position.addScaledVector(this.right, -step);
    if (this.keys.has("KeyE")) this.camera.position.addScaledVector(UP, step);
    if (this.keys.has("KeyQ")) this.camera.position.addScaledVector(UP, -step);
  }
}
