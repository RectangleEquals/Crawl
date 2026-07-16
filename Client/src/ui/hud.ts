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
  private readonly instrumentsEl: HTMLElement;
  private readonly sealedEl: HTMLElement;
  private readonly acquireEl: HTMLElement;
  private readonly astrolabeEl: HTMLElement;
  private acquireTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-title">CRAWLSTAR</div>
        <div class="hud-sub">M4 · The Reach Director</div>
        <div class="hud-line"><span id="hud-area" class="hud-area"></span></div>
        <div class="hud-line">
          <span id="hud-mode"></span> · <span id="hud-device"></span> ·
          <span id="hud-fps">-- fps</span> · <span id="hud-net"></span> · <span id="hud-res"></span>
        </div>
        <div class="hud-help">WASD move · LMB strike · RMB block · Q ward · E shield-slam · F ground-slam · SPACE jump · SHIFT sprint · V cam</div>
        <div class="hud-roster" id="hud-roster"></div>
        <div class="hud-instruments" id="hud-instruments"></div>
      </div>
      <div class="hud-sealed" id="hud-sealed"></div>
      <div class="hud-acquire" id="hud-acquire"></div>
      <div class="hud-astrolabe" id="hud-astrolabe"></div>
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
    this.instrumentsEl = q("#hud-instruments");
    this.sealedEl = q("#hud-sealed");
    this.acquireEl = q("#hud-acquire");
    this.astrolabeEl = q("#hud-astrolabe");

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

  /** Held/unheld Starwrought Instruments (M4). */
  setInstruments(list: readonly { name: string; held: boolean }[]): void {
    if (list.length === 0) {
      this.instrumentsEl.innerHTML = "";
      return;
    }
    const chips = list
      .map((g) => `<span class="instr ${g.held ? "held" : "locked"}">${g.held ? "✦" : "◇"} ${g.name}</span>`)
      .join(" ");
    this.instrumentsEl.innerHTML = `<span class="instr-label">Instruments:</span> ${chips}`;
  }

  /** Show/clear the "sealed doorway needs Instrument X" hint. */
  setSealed(name: string | null): void {
    if (name) {
      this.sealedEl.textContent = `⊘ SEALED WAY — needs the ${name}`;
      this.sealedEl.style.display = "block";
    } else {
      this.sealedEl.style.display = "none";
    }
  }

  /** Astrolabe remembered-lock journal: sealed ways seen but not yet openable. */
  setAstrolabe(locks: readonly { areaName: string; gadget: string }[]): void {
    if (locks.length === 0) {
      this.astrolabeEl.style.display = "none";
      return;
    }
    const rows = locks
      .slice(0, 5)
      .map((l) => `<div class="astro-row">⊘ <span class="astro-area">${l.areaName}</span> — needs the <span class="astro-gadget">${l.gadget}</span></div>`)
      .join("");
    this.astrolabeEl.innerHTML = `<div class="astro-title">✶ Astrolabe — Remembered Locks</div>${rows}`;
    this.astrolabeEl.style.display = "block";
  }

  /** Brief flourish when an Instrument is acquired. */
  flashAcquire(name: string): void {
    this.acquireEl.textContent = `✦ Acquired the ${name} ✦`;
    this.acquireEl.style.display = "block";
    this.acquireEl.style.opacity = "1";
    if (this.acquireTimer) clearTimeout(this.acquireTimer);
    this.acquireTimer = setTimeout(() => {
      this.acquireEl.style.opacity = "0";
    }, 1800);
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
