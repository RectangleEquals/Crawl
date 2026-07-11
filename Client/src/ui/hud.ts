/** Minimal M1 HUD: title, fps, internal-res readout, controls, capture prompt. */

export class Hud {
  private readonly fpsEl: HTMLElement;
  private readonly resEl: HTMLElement;
  private readonly trisEl: HTMLElement;
  private readonly promptEl: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">CRAWLSTAR</div>
        <div class="hud-sub">M1 · Sunken Parish · the Look</div>
        <div class="hud-line"><span id="hud-fps">-- fps</span> · <span id="hud-res"></span> · <span id="hud-tris"></span></div>
        <div class="hud-help">WASD move · Q/E down/up · SHIFT fast · 1/2/3 internal res · ESC release</div>
      </div>
      <div class="hud-prompt" id="hud-prompt">CLICK TO TAKE UP THE LANTERN</div>
    `;
    this.fpsEl = root.querySelector("#hud-fps") as HTMLElement;
    this.resEl = root.querySelector("#hud-res") as HTMLElement;
    this.trisEl = root.querySelector("#hud-tris") as HTMLElement;
    this.promptEl = root.querySelector("#hud-prompt") as HTMLElement;
  }

  setFps(fps: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} fps`;
  }

  setRes(name: string, w: number, h: number): void {
    this.resEl.textContent = `${name} ${w}×${h}`;
  }

  setTris(count: number): void {
    this.trisEl.textContent = `${count} tris`;
  }

  setPointerLocked(locked: boolean): void {
    this.promptEl.style.display = locked ? "none" : "block";
  }
}
