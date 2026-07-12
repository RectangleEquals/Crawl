import { beforeAll, describe, expect, it } from "vitest";
import { SUNKEN_PARISH } from "../../art/style.js";
import { generateChamber } from "../../art/chamber.js";
import { AreaIsland, type IslandEntity } from "../area.js";
import { initPhysics } from "../physics.js";
import { getArchetype } from "../../data/archetypes.js";
import { Buttons, type InputCmd } from "../../protocol/messages.js";
import { makeCombatState } from "./state.js";
import { applyTag, tickTags, tagDamageTakenMultiplier } from "./tags.js";
import { applyDamage } from "./damage.js";
import { HitboxHistory } from "./hitbox.js";
import type { CombatEvent } from "./events.js";

beforeAll(async () => {
  await initPhysics();
});

// ---------------------------------------------------------------- pure logic

describe("tags", () => {
  it("Soak+Shock (either order) signals Conduction and consumes the partner", () => {
    const a = makeCombatState({ kind: "x", team: 1, maxHp: 100, armor: 0 });
    applyTag(a, "soak", 1, 0);
    expect(applyTag(a, "shock", 1, 0).conduction).toBe(true);
    expect(a.tags.soak).toBeUndefined();

    const b = makeCombatState({ kind: "x", team: 1, maxHp: 100, armor: 0 });
    applyTag(b, "shock", 1, 0);
    expect(applyTag(b, "soak", 1, 0).conduction).toBe(true);
  });

  it("Ignite deals DoT over its duration then expires", () => {
    const c = makeCombatState({ kind: "x", team: 1, maxHp: 100, armor: 0 });
    applyTag(c, "ignite", 2, 0);
    let total = 0;
    for (let t = 0; t < 120; t++) total += tickTags(c, t);
    expect(total).toBeGreaterThan(0);
    expect(c.tags.ignite).toBeUndefined(); // expired by 3s (90 ticks)
  });

  it("Shock raises incoming-damage multiplier", () => {
    const c = makeCombatState({ kind: "x", team: 1, maxHp: 100, armor: 0 });
    expect(tagDamageTakenMultiplier(c)).toBe(1);
    applyTag(c, "shock", 1, 0);
    expect(tagDamageTakenMultiplier(c)).toBeGreaterThan(1);
  });
});

describe("damage & mitigation", () => {
  it("armour and block reduce damage; players down, enemies die", () => {
    const enemy = makeCombatState({ kind: "e", team: 1, maxHp: 30, armor: 5 });
    expect(applyDamage(enemy, 20, 0).dealt).toBe(15); // 20 - 5 armour

    const player = makeCombatState({ kind: "warden", team: 0, maxHp: 100, armor: 10 });
    const blocked = applyDamage(player, 40, 0, { blocked: true });
    expect(blocked.dealt).toBeLessThan(40 - 10); // block cuts further

    const dead = applyDamage(enemy, 999, 0);
    expect(dead.killed).toBe(true);
    const downed = applyDamage(player, 999, 0);
    expect(downed.downed).toBe(true);
    expect(player.downed).toBe(true);
  });

  it("being hit builds Bulwark (Warden); blocked hits build more", () => {
    const a = makeCombatState({ kind: "warden", team: 0, maxHp: 120, armor: 6, maxResource: 100 });
    applyDamage(a, 30, 0);
    const unblocked = a.resource;
    expect(unblocked).toBeGreaterThan(0);

    const b = makeCombatState({ kind: "warden", team: 0, maxHp: 120, armor: 6, maxResource: 100 });
    applyDamage(b, 30, 0, { blocked: true });
    expect(b.resource).toBeGreaterThan(unblocked); // blocking rewards Bulwark more
  });
});

describe("lag-comp hitbox arc", () => {
  it("hits targets in front within range, misses behind / out of range", () => {
    const h = new HitboxHistory();
    h.record(0, [
      { id: 1, team: 0, x: 0, y: 0, z: 1, radius: 0.35 }, // attacker
      { id: 2, team: 1, x: 0, y: 1.5, z: 1, radius: 0.35 }, // in front (yaw 0 = +Y)
      { id: 3, team: 1, x: 0, y: -1.5, z: 1, radius: 0.35 }, // behind
      { id: 4, team: 1, x: 0, y: 6, z: 1, radius: 0.35 }, // too far
    ]);
    const hits = h.meleeArc(0, 0, [0, 0, 1], 0, 2.2, (55 * Math.PI) / 180, 1);
    expect(hits).toContain(2);
    expect(hits).not.toContain(3);
    expect(hits).not.toContain(4);
  });
});

// ---------------------------------------------------------------- integration

function spawn(island: AreaIsland, id: number, kind: string, feet: [number, number, number], yaw: number): IslandEntity {
  return island.addEntity(id, kind, true, feet, yaw, makeCombatState(getArchetype(kind).base));
}

function cmd(buttons: number, yaw: number): InputCmd {
  return { seq: 0, moveX: 0, moveY: 0, yaw, buttons };
}

/** Run one full server tick for a hand-driven scene. */
function runTick(island: AreaIsland, tick: number, inputs: Map<number, InputCmd>, events: CombatEvent[]): void {
  for (const [id, c] of inputs) {
    const e = island.entities.get(id);
    if (e) island.applyCmd(e, c);
  }
  island.step();
  island.tickCombat(tick, () => 0, events);
}

describe("combat integration (Rapier + full pipeline)", () => {
  it("Warden strikes kill an adjacent enemy; server-authoritative", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "combat-1"));
    const warden = spawn(island, 1, "warden", [7, 3, 0], 0);
    const target = spawn(island, 2, "shardspitter", [7, 4.3, 0], Math.PI); // 1.3 m north, in front
    const startHp = target.combat!.hp;

    let killed = false;
    for (let t = 1; t <= 120 && !killed; t++) {
      const events: CombatEvent[] = [];
      const inputs = new Map([[1, cmd(Buttons.Attack, 0)]]); // hold attack, face north
      runTick(island, t, inputs, events);
      if (!island.entities.has(2)) killed = true;
    }
    expect(killed).toBe(true);
    expect(warden.combat!.hp).toBe(warden.combat!.maxHp); // shardspitter never got a hit in melee-lock
    void startHp;
  });

  it("Shield Slam applies Launch to a light enemy (pops it up)", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "combat-2"));
    const warden = spawn(island, 1, "warden", [7, 3, 0], 0);
    warden.combat!.resource = 100; // Bulwark is built by fighting; grant it for the test
    const target = spawn(island, 2, "shardspitter", [7, 4.6, 0], Math.PI);

    // pulse Ability2 (edge) then idle through windup→active
    for (let t = 1; t <= 14; t++) {
      const events: CombatEvent[] = [];
      const inputs = new Map([[1, cmd(t === 1 ? Buttons.Ability2 : 0, 0)]]);
      runTick(island, t, inputs, events);
    }
    expect(target.combat!.tags.launch).toBeDefined();
    expect(target.state.velZ).toBeGreaterThan(0); // airborne
  });

  it("heavy enemies are Staggered by Launch instead of popped", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "combat-3"));
    const warden = spawn(island, 1, "warden", [7, 3, 0], 0);
    warden.combat!.resource = 100;
    const target = spawn(island, 2, "slag-revenant", [7, 4.6, 0], Math.PI); // heavy

    for (let t = 1; t <= 14; t++) {
      const events: CombatEvent[] = [];
      const inputs = new Map([[1, cmd(t === 1 ? Buttons.Ability2 : 0, 0)]]);
      runTick(island, t, inputs, events);
    }
    expect(target.combat!.tags.launch).toBeUndefined(); // not launched
    expect(target.combat!.staggerUntil).toBeGreaterThan(0); // staggered instead
  });

  it("blocking builds Bulwark over time (Docs/04 §3.1)", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "bulwark"));
    const warden = spawn(island, 1, "warden", [7, 3, 0], 0);
    expect(warden.combat!.resource).toBe(0);
    for (let t = 1; t <= 20; t++) {
      const events: CombatEvent[] = [];
      runTick(island, t, new Map([[1, cmd(Buttons.Block, 0)]]), events);
    }
    expect(warden.combat!.resource).toBeGreaterThan(10);
  });

  it("cooldownScale slows an AI attacker's ability rate", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "cd"));
    const e = spawn(island, 2, "shardspitter", [7, 6, 0], 0);
    e.combat!.cooldownScale = 3; // 3× cooldown
    // fire once
    for (let t = 1; t <= 12; t++) runTick(island, t, new Map([[2, cmd(t === 1 ? Buttons.Attack : 0, 0)]]), []);
    const readyTick = e.combat!.cooldowns["shardspitter.spit"] ?? 0;
    // base cooldown 50 → ×3 ≈ 150 (+windup/active); well beyond the un-scaled ~60
    expect(readyTick).toBeGreaterThan(120);
  });

  it("enemy projectiles damage the Warden across the room", () => {
    const island = new AreaIsland(generateChamber(SUNKEN_PARISH, "combat-4"));
    const warden = spawn(island, 1, "warden", [7, 6, 0], 0);
    spawn(island, 2, "shardspitter", [7, 12, 0], Math.PI); // 6 m north, in spit range

    let hp = warden.combat!.hp;
    for (let t = 1; t <= 120; t++) {
      const events: CombatEvent[] = [];
      // warden holds still & faces away so it can't melee; shardspitter fires via its brain
      const inputs = new Map([[1, cmd(0, 0)]]);
      // drive the shardspitter's AI
      const spitter = island.entities.get(2)!;
      island.applyCmd(spitter, driveEnemy(island, spitter, t));
      for (const [id, c] of inputs) island.applyCmd(island.entities.get(id)!, c);
      island.step();
      island.tickCombat(t, () => 0, events);
      if (warden.combat!.hp < hp) {
        hp = warden.combat!.hp;
        break;
      }
    }
    expect(warden.combat!.hp).toBeLessThan(warden.combat!.maxHp);
  });
});

// tiny inline brain driver (avoids importing the AI module's target logic here)
function driveEnemy(island: AreaIsland, self: IslandEntity, tick: number): InputCmd {
  const target = island.entities.get(1)!;
  const dx = target.state.pos[0] - self.state.pos[0];
  const dy = target.state.pos[1] - self.state.pos[1];
  const yaw = Math.atan2(-dx, dy);
  const ready = tick >= (self.combat!.cooldowns["shardspitter.spit"] ?? 0);
  return { seq: tick, moveX: 0, moveY: 0, yaw, buttons: ready && self.combat!.ability === null ? Buttons.Attack : 0 };
}
