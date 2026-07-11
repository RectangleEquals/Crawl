/** M2 HUD: perf, net, mode, device, area, roster. DOM overlay, DOS-flavored. */

export class Hud {
  private readonly fpsEl: HTMLElement;
  private readonly resEl: HTMLElement;
  private readonly netEl: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly deviceEl: HTMLElement;
  private readonly areaEl: HTMLElement;
  private readonly rosterEl: HTMLElement;
  private readonly promptEl: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">CRAWLSTAR</div>
        <div class="hud-sub">M2 · the Wire</div>
        <div class="hud-line"><span id="hud-area" class="hud-area"></span></div>
        <div class="hud-line">
          <span id="hud-mode"></span> · <span id="hud-device"></span> ·
          <span id="hud-fps">-- fps</span> · <span id="hud-net"></span> · <span id="hud-res"></span>
        </div>
        <div class="hud-help">WASD move · SPACE jump · SHIFT sprint · V camera · 1/2/3 res · ESC release</div>
        <div class="hud-roster" id="hud-roster"></div>
      </div>
      <div class="hud-prompt" id="hud-prompt">CLICK TO TAKE UP THE LANTERN</div>
    `;
    this.fpsEl = root.querySelector("#hud-fps") as HTMLElement;
    this.resEl = root.querySelector("#hud-res") as HTMLElement;
    this.netEl = root.querySelector("#hud-net") as HTMLElement;
    this.modeEl = root.querySelector("#hud-mode") as HTMLElement;
    this.deviceEl = root.querySelector("#hud-device") as HTMLElement;
    this.areaEl = root.querySelector("#hud-area") as HTMLElement;
    this.rosterEl = root.querySelector("#hud-roster") as HTMLElement;
    this.promptEl = root.querySelector("#hud-prompt") as HTMLElement;
  }

  setFps(fps: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} fps`;
  }

  setRes(name: string, w: number, h: number): void {
    this.resEl.textContent = `${name} ${w}×${h}`;
  }

  setNet(rttMs: number, reconErr: number): void {
    this.netEl.textContent = `rtt ${rttMs.toFixed(0)}ms${reconErr > 0.05 ? ` · Δ${reconErr.toFixed(2)}m` : ""}`;
  }

  setMode(mode: string): void {
    this.modeEl.textContent = mode === "solo" ? "SOLO (integrated server)" : "ONLINE";
  }

  setDevice(device: string): void {
    this.deviceEl.textContent = device === "pad" ? "🎮 PAD" : device === "touch" ? "👆 TOUCH" : "⌨ KB/M";
  }

  setArea(name: string): void {
    this.areaEl.textContent = name;
  }

  setRoster(names: readonly string[], self: string): void {
    this.rosterEl.innerHTML = [self + " (you)", ...names]
      .map((n) => `<div>◈ ${n}</div>`)
      .join("");
  }

  setPointerLocked(locked: boolean): void {
    this.promptEl.style.display = locked ? "none" : "block";
  }
}
