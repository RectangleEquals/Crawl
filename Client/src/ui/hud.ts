/** M3 HUD: perf/net/mode/device/area/roster + combat (HP, Bulwark, abilities). */

import type { SelfCombat } from "../game/session.js";

const ABILITY_KEYS = ["LMB", "Q", "E", "F"];
const ABILITY_NAMES = ["Strike", "Ward Wall", "Shield Slam", "Ground Slam"];

export class Hud {
  private readonly fpsEl: HTMLElement;
  private readonly resEl: HTMLElement;
  private readonly netEl: HTMLElement;
  private readonly modeEl: HTMLElement;
  private readonly deviceEl: HTMLElement;
  private readonly areaEl: HTMLElement;
  private readonly rosterEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly resFill: HTMLElement;
  private readonly abilityEls: HTMLElement[];
  private readonly downedEl: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">CRAWLSTAR</div>
        <div class="hud-sub">M3 · Combat &amp; the Warden</div>
        <div class="hud-line"><span id="hud-area" class="hud-area"></span></div>
        <div class="hud-line">
          <span id="hud-mode"></span> · <span id="hud-device"></span> ·
          <span id="hud-fps">-- fps</span> · <span id="hud-net"></span> · <span id="hud-res"></span>
        </div>
        <div class="hud-help">WASD move · LMB strike · RMB block · Q ward · E shield-slam · F ground-slam · SPACE jump · SHIFT sprint · V cam</div>
        <div class="hud-roster" id="hud-roster"></div>
      </div>
      <div class="hud-combat">
        <div class="cbar"><div class="cbar-fill hp" id="hud-hp"></div><div class="cbar-text" id="hud-hp-text"></div></div>
        <div class="cbar bulwark"><div class="cbar-fill res" id="hud-res-fill"></div></div>
        <div class="hud-abilities" id="hud-abilities"></div>
      </div>
      <div class="hud-downed" id="hud-downed">DOWNED — hold on…</div>
      <div class="hud-prompt" id="hud-prompt">CLICK TO TAKE UP THE LANTERN</div>
    `;
    const q = (s: string): HTMLElement => root.querySelector(s) as HTMLElement;
    this.fpsEl = q("#hud-fps");
    this.resEl = q("#hud-res");
    this.netEl = q("#hud-net");
    this.modeEl = q("#hud-mode");
    this.deviceEl = q("#hud-device");
    this.areaEl = q("#hud-area");
    this.rosterEl = q("#hud-roster");
    this.promptEl = q("#hud-prompt");
    this.hpFill = q("#hud-hp");
    this.hpText = q("#hud-hp-text");
    this.resFill = q("#hud-res-fill");
    this.downedEl = q("#hud-downed");

    const abilities = q("#hud-abilities");
    this.abilityEls = ABILITY_NAMES.map((name, i) => {
      const el = document.createElement("div");
      el.className = "ability";
      el.innerHTML = `<span class="ability-key">${ABILITY_KEYS[i]}</span><span class="ability-name">${name}</span>`;
      abilities.appendChild(el);
      return el;
    });
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
    this.rosterEl.innerHTML = [self + " (you)", ...names].map((n) => `<div>◈ ${n}</div>`).join("");
  }
  setPointerLocked(locked: boolean): void {
    this.promptEl.style.display = locked ? "none" : "block";
  }

  setCombat(c: SelfCombat): void {
    const hpFrac = c.maxHp > 0 ? c.hp / c.maxHp : 0;
    this.hpFill.style.width = `${Math.max(0, Math.min(1, hpFrac)) * 100}%`;
    this.hpFill.style.background = hpFrac > 0.5 ? "#8be06a" : hpFrac > 0.25 ? "#e0c04a" : "#e0603a";
    this.hpText.textContent = `${Math.max(0, Math.round(c.hp))} / ${c.maxHp}`;
    const resFrac = c.maxResource > 0 ? c.resource / c.maxResource : 0;
    this.resFill.style.width = `${Math.max(0, Math.min(1, resFrac)) * 100}%`;
    this.abilityEls.forEach((el, i) => {
      el.classList.toggle("ready", (c.abilityReady & (1 << i)) !== 0);
    });
    this.downedEl.style.display = c.downed ? "block" : "none";
  }
}
