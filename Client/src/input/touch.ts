/**
 * Touch controls (Docs/02 §6): an on-screen virtual gamepad — left stick for
 * movement, right-zone drag for look, JUMP/SPRINT/CAM buttons. Appears on
 * first touch (or `?touch=1`), publishes into the same action map as KB/M
 * and gamepads. Native Bluetooth controllers on mobile already work through
 * the standard Gamepad API path.
 */

export interface TouchSample {
  moveX: number;
  moveY: number;
  lookDX: number; // pixel-ish deltas, mouse-equivalent
  lookDY: number;
  jump: boolean;
  sprint: boolean;
  toggleCamera: boolean;
}

const STICK_RADIUS = 56; // px, logical
const LOOK_GAIN = 2.2; // touch-drag → mouse-delta equivalence

export class TouchControls {
  enabled = false;

  private root: HTMLElement | null = null;
  private stickBase: HTMLElement | null = null;
  private stickNub: HTMLElement | null = null;

  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private moveX = 0;
  private moveY = 0;

  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookDX = 0;
  private lookDY = 0;

  private jump = false;
  private sprint = false;
  private togglePending = false;

  constructor(private readonly onActivity: () => void) {}

  /** Build the overlay and start listening. Idempotent. */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    const root = document.createElement("div");
    root.id = "touch-controls";
    root.innerHTML = `
      <div class="tc-stick" id="tc-stick"><div class="tc-nub" id="tc-nub"></div></div>
      <div class="tc-btn tc-jump" id="tc-jump">JUMP</div>
      <div class="tc-btn tc-sprint" id="tc-sprint">SPRINT</div>
      <div class="tc-btn tc-cam" id="tc-cam">CAM</div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.stickBase = root.querySelector("#tc-stick") as HTMLElement;
    this.stickNub = root.querySelector("#tc-nub") as HTMLElement;

    const btn = (id: string, down: () => void, up: () => void): void => {
      const el = root.querySelector(id) as HTMLElement;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        el.classList.add("tc-held");
        down();
        this.onActivity();
      });
      const release = (): void => {
        el.classList.remove("tc-held");
        up();
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", release);
    };
    btn("#tc-jump", () => (this.jump = true), () => (this.jump = false));
    btn("#tc-sprint", () => (this.sprint = true), () => (this.sprint = false));
    btn("#tc-cam", () => (this.togglePending = true), () => undefined);

    // stick + look zones live on the document so drags can leave the widgets
    document.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    document.addEventListener("pointermove", this.onPointerMove, { passive: false });
    document.addEventListener("pointerup", this.onPointerUp);
    document.addEventListener("pointercancel", this.onPointerUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(".tc-btn")) return; // buttons handle themselves
    this.onActivity();
    if (e.clientX < window.innerWidth * 0.42 && this.stickPointer === null) {
      this.stickPointer = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.positionStick(e.clientX, e.clientY, e.clientX, e.clientY);
      e.preventDefault();
    } else if (this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickPointer) {
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const m = Math.hypot(dx, dy);
      const clamped = Math.min(m, STICK_RADIUS);
      const nx = m > 0 ? (dx / m) * clamped : 0;
      const ny = m > 0 ? (dy / m) * clamped : 0;
      this.moveX = nx / STICK_RADIUS;
      this.moveY = -ny / STICK_RADIUS; // screen-up = forward
      this.positionStick(this.stickOrigin.x, this.stickOrigin.y, this.stickOrigin.x + nx, this.stickOrigin.y + ny);
      e.preventDefault();
    } else if (e.pointerId === this.lookPointer) {
      this.lookDX += (e.clientX - this.lookLast.x) * LOOK_GAIN;
      this.lookDY += (e.clientY - this.lookLast.y) * LOOK_GAIN;
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickPointer) {
      this.stickPointer = null;
      this.moveX = 0;
      this.moveY = 0;
      this.hideStick();
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
    }
  };

  private positionStick(bx: number, by: number, nx: number, ny: number): void {
    if (!this.stickBase || !this.stickNub) return;
    this.stickBase.style.opacity = "1";
    this.stickBase.style.left = `${bx - STICK_RADIUS}px`;
    this.stickBase.style.top = `${by - STICK_RADIUS}px`;
    this.stickNub.style.left = `${nx - bx + STICK_RADIUS - 22}px`;
    this.stickNub.style.top = `${ny - by + STICK_RADIUS - 22}px`;
  }

  private hideStick(): void {
    if (this.stickBase) this.stickBase.style.opacity = "0.35";
  }

  /** Drain per-frame state (mirrors gamepad polling semantics). */
  sample(): TouchSample {
    const out: TouchSample = {
      moveX: this.moveX,
      moveY: this.moveY,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      jump: this.jump,
      sprint: this.sprint,
      toggleCamera: this.togglePending,
    };
    this.lookDX = 0;
    this.lookDY = 0;
    this.togglePending = false;
    return out;
  }

  dispose(): void {
    this.root?.remove();
    document.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    document.removeEventListener("pointercancel", this.onPointerUp);
  }
}
