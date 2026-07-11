/**
 * Remote-entity interpolation (Docs/03 §4): render others ~100 ms in the
 * past, lerping between authoritative snapshots; extrapolate briefly on gaps.
 */

import { INTERP_TICKS, TICK_RATE, type Vec3 } from "@crawlstar/shared";

interface Sample {
  tick: number;
  pos: Vec3;
  yaw: number;
  anim: number;
}

const KEEP = 32;
const MAX_EXTRAPOLATE_TICKS = 1.5;

function lerpYaw(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RemoteView {
  private readonly samples: Sample[] = [];

  push(tick: number, pos: Vec3, yaw: number, anim: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && tick <= last.tick) return;
    this.samples.push({ tick, pos, yaw, anim });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** Sample at a (fractional) tick; clamps to available data. */
  sample(renderTick: number): { pos: Vec3; yaw: number; anim: number } | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const first = s[0] as Sample;
    const last = s[s.length - 1] as Sample;
    if (renderTick <= first.tick) return { pos: first.pos, yaw: first.yaw, anim: first.anim };
    if (renderTick >= last.tick) {
      // brief dead-reckoning off the final pair, then freeze
      const prev = s.length >= 2 ? (s[s.length - 2] as Sample) : last;
      const span = Math.max(1, last.tick - prev.tick);
      const ahead = Math.min(MAX_EXTRAPOLATE_TICKS, renderTick - last.tick) / span;
      return {
        pos: [
          last.pos[0] + (last.pos[0] - prev.pos[0]) * ahead,
          last.pos[1] + (last.pos[1] - prev.pos[1]) * ahead,
          last.pos[2] + (last.pos[2] - prev.pos[2]) * ahead,
        ],
        yaw: last.yaw,
        anim: last.anim,
      };
    }
    for (let i = s.length - 2; i >= 0; i--) {
      const a = s[i] as Sample;
      const b = s[i + 1] as Sample;
      if (renderTick >= a.tick && renderTick <= b.tick) {
        const t = (renderTick - a.tick) / (b.tick - a.tick);
        return {
          pos: [
            a.pos[0] + (b.pos[0] - a.pos[0]) * t,
            a.pos[1] + (b.pos[1] - a.pos[1]) * t,
            a.pos[2] + (b.pos[2] - a.pos[2]) * t,
          ],
          yaw: lerpYaw(a.yaw, b.yaw, t),
          anim: b.anim,
        };
      }
    }
    return { pos: last.pos, yaw: last.yaw, anim: last.anim };
  }
}

/** Smoothly tracks "what tick should I render remotes at right now". */
export class RenderClock {
  private renderTick = 0;
  private latest = 0;

  onSnapshot(tick: number): void {
    this.latest = Math.max(this.latest, tick);
    if (this.renderTick === 0) this.renderTick = tick - INTERP_TICKS;
  }

  advance(dt: number): number {
    const target = this.latest - INTERP_TICKS;
    this.renderTick += dt * TICK_RATE;
    // gentle rate discipline toward the target instead of snapping
    const err = target - this.renderTick;
    this.renderTick += err * Math.min(1, dt * 2);
    return this.renderTick;
  }
}
