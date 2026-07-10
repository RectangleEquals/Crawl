# 04 — Classes & Progression

> Six ways to walk the furrow. Alone, some walk faster. Together, some become something else.

Motives and factions: [00-vision.md](00-vision.md) §3.7. Items/skill-enabling gear:
[05-items-loot-affixes.md](05-items-loot-affixes.md). Revive/death consequences in play:
[09-modes-social.md](09-modes-social.md) §6 (this doc is the source of truth for revive *mechanics*).

---

## 1. Design Goals

1. **Every class is playable solo or with bots** — but their *ceilings* differ deliberately: some peak
   alone, some multiply a party. The roster is a spectrum, stated openly to the player (§3).
2. **Synergy is systemic, not scripted.** Cross-class combos emerge from the combo-tag rules (§2), which
   bots also understand — so "playing with synergy" works at every party composition.
3. **Builds are commitments.** Passive trees offer breadth early and demand identity later via Keystone
   Gates (§4). Two Wardens should be able to play nothing alike.
4. **Rescue is earned.** Revives exist but are gated behind items, deep specialization, or rare Singulars —
   never free (§5).

---

## 2. The Combo-Tag System

All abilities, weapons, enemy attacks, and some gadget secondaries speak one language: **tags** they *emit*
onto targets and tags they *consume* for amplified effects. Tags are ECS components
([02](02-tech-architecture.md) §4) — fully systemic, bot-legible, and shared by enemies
([08](08-enemies-bosses.md) §2).

| Tag | On target | Consumed by → result |
|---|---|---|
| **Ignite** | Fire DoT | + `Irradiate` → **Gloamfire** detonation (AoE burst, both consumed) |
| **Chill** | Slow (stacking to brief Freeze) | + `Soak` → **Flash-Freeze** (short solidify; frozen targets can be **Shattered** by heavy hits) |
| **Shock** | Stagger buildup + damage-taken pulses | + `Soak` → **Conduction** (arcs to nearby enemies) |
| **Rend** | Physical DoT + armor shred (stacking) | consumed by **Execute-class** hits → burst scaled by stacks |
| **Soak** | Drenched: conductive, freezable, fire-damped | consumed by Chill/Shock combos above |
| **Irradiate** | Gloam DoT, stacks; enemies drop +rarity while irradiated (risk: they hit harder too) | + `Ignite` → Gloamfire; detonated by some finishers |
| **Expose** | Defenses opened | consumed by the next crit-capable hit → guaranteed crit |
| **Launch** | Knocked airborne (heavies are Staggered instead) | consumed by a descending/heavy hit → **Slam** (AoE ground shock) |

Rules: tags decay on timers; bosses have per-tag diminishing returns; combo consumption is order-agnostic
(either partner can be applied first). Every class emits some tags natively and consumes others well — the
matrix below is the party-composition metagame.

| | emits well | consumes well |
|---|---|---|
| Warden | Launch, Expose | Launch (Slam), Rend |
| Arcanist | Ignite, Chill, Shock | Soak combos (Freeze/Conduction), Gloamfire |
| Reaver | Rend, Ignite (self-oil) | Rend (executes), Expose |
| Shade | Expose, Rend, Soak (venoms/oils) | Expose (crits), Chill (frozen shatters) |
| Artificer | Shock, Soak (sprayers) | Shock (Conduction via grids) |
| Chorister | Irradiate, Expose | none directly — **amplifies**: extends/strengthens allies' tags |

---

## 3. The Roster

Format — *Role · Resource · Solo/Party rating (5 = highest) · signature mechanics · Keystone Gates (§4).*
Ability lists are launch-target kits (~8 actives + weapon skills each); tuning tables live with the data in
`Shared/data/classes/`.

### 3.1 Warden — the Furrowguard bulwark
- **Role:** frontline control tank. **Resource:** *Bulwark* (charge built by blocking/being hit; spent on
  ward abilities). **Solo 4 / Party 4.**
- Force-ward barriers (deployable cover walls, party bubbles), shield-brace block/parry, taunting
  challenges, Launch-into-Slam wombo starter. Ward walls are *terrain* — they body-block projectiles and
  funnel melee, and clever placement is the skill ceiling.
- **Gates:** **Bastion** (wards grow larger, sharable, reflective — the protector) · **Juggernaut**
  (wards become weapons: ram charges, collapsing walls on enemies — the aggressor) · **Lodestar** (auras,
  banner wards, party move-speed/resolve — the anchor; party-leaning).

### 3.2 Arcanist — the Collegium starglass elementalist
- **Role:** ranged caster, primary tag generator. **Resource:** *Starglass Heat* — spells build Heat;
  overheat locks casting briefly but empowers the next combo consume (risk dial in the kit itself).
- **Solo 3 / Party 5.** Bots tank for it acceptably; a coordinated party turns its combo consumes lethal.
- Beams, orbs, ground pools across Ignite/Chill/Shock; a Gravity school (sci-fi flavor: micro-singularities
  that group enemies — prime Launch/AoE setup).
- **Gates:** **Pyrelight** (Ignite/Gloamfire detonations) · **Rimebound** (Chill/Freeze/Shatter control) ·
  **Stormcall** (Shock/Conduction chains + gravity wells).

### 3.3 Reaver — the gloam-blooded berserker
- **Role:** melee bruiser paying in blood. **Resource:** *Fervor* (builds from damage dealt *and taken*;
  abilities additionally cost **health**). Lifesteal is the class economy.
- **Solo 3 / Party 4** (a Chorister or Bastion Warden unlocks its recklessness).
- Wide cleaves, self-oiling Ignite blades, Rend stacking into executes; the deeper its own HP, the harder
  some abilities hit (dark-fantasy risk/reward embodied).
- **Gates:** **Bloodprice** (bigger health costs, bigger payoffs; lifesteal scaling) · **Harrow** (attack
  tempo, Fervor frenzy stacking) · **Deathgrudge** (the undying spec — see §5; death-adjacent power:
  bonuses while downed-risk is high).

### 3.4 Shade — the Lantern Consortium infiltrator
- **Role:** stealth skirmisher, scout, and loot-sense. **Resource:** *Guile* (stacks from unseen movement
  and openers; spent on vanishes and guaranteed-crit finishers).
- **Solo 4 / Party 3.** The best first-into-a-room class; treasure-sense pings secrets
  (synergizes with, but doesn't replace, the Astrolabe — [06](06-gadgets.md) §5).
- Smoke, snares, venom/oil coatings (Soak/Rend), backline deletion via Expose consumes.
- **Gates:** **Nightwork** (assassination, stealth uptime) · **Snaresmith** (traps, area denial — the
  "tower defense in a trenchcoat" solo spec) · **Gildhand** (loot: IIR auras on kills, pickpocket strikes,
  deeper treasure-sense — party-leaning greed spec).

### 3.5 Artificer — the Wroughtwright salvager-engineer
- **Role:** deployables commander — a party in a class. **Resource:** *Scrap* (harvested from kills and
  breakables; spent to build/upgrade emplacements).
- **Solo 5 / Party 3.** The designated best-with-bots/alone class.
- Turrets (Shock sprayers, Soak misters — a walking Conduction combo), drone companions, repair swarms;
  unique perk line: **gadget affinity** (+1 Instrument charge, faster gadget cooldowns —
  [06](06-gadgets.md) §4).
- **Gates:** **Foundry** (bigger, meaner static emplacements) · **Retinue** (mobile drones that follow and
  fight) · **Startuner** (Instrument-focused: gadget actives gain combat riders — e.g., Tether yank
  applies Expose).

### 3.6 Chorister — the one who hears the Chorale
- **Role:** support/amplifier priest. **Resource:** *Cadence* (builds while maintaining harmony — casting
  on-rhythm with ability timing windows; spent on crescendo effects).
- **Solo 2 / Party 5.** Deliberately the weakest alone and the strongest multiplier — the strategic pick.
- Harmonic auras that **extend and amplify allies' tags**, Irradiate hymns (its own damage identity:
  risk/reward — irradiated enemies drop better and hit harder), sanctified ground, the only baseline
  out-of-combat revive ability (§5).
- **Gates:** **Wardsong** (heals, shields, cleanse) · **Crescendo** (offensive harmonics, Gloamfire
  enablement, tag-extension mastery) · **Threnody** (the death-song spec — in-combat resurrection, §5).

---

## 4. Passive Trees & Keystone Gates

Each class has its **own tree**, structured identically:

```
            [Gate A: deep cluster ▓▓▓]
                    │ GATE A
   inner ring ──────┼───────────────
  (generic nodes:   │      class core
   life, damage,    ●  ← start (center)
   resist, speed,   │
   resource)        ┼─── GATE B ──── [▓▓▓]
                    │
                    └─── GATE C ──── [▓▓▓]
```

- **Points:** 1 per level (target cap: level 60) + bonus points from first-kill boss achievements per
  expedition tier — roughly 70 lifetime points; the tree offers ~3× that many nodes, so scarcity is real.
- **Inner ring** (first ~15 points of any path): generic stats and minor class mechanics — free-form,
  respec-cheap, lets every class start "balanced in all directions" per the design brief.
- **Branches** radiate outward; mid-branch sits a **Keystone Gate** — a named node with a build-defining
  mechanic. **Allocating a Gate seals the *deep clusters* behind the other two Gates** (their shallow
  branch nodes stay available). One Gate per character at a time: this is the specialization contract.
- **Deep clusters** hold the spec's signature nodes (e.g., Threnody's battle-resurrection lives ~6 points
  past its Gate).
- **Respec:** at Rest Sanctums only ([09](09-modes-social.md) §4): per-point refunds priced in crafting
  currency (cheap for inner ring, steep for deep cluster); **unsealing a Gate** is a major currency sink +
  refunds all deep-cluster points. Identity changes are possible, never casual.
- **Mixed-class strategy** comes from Gate choices interlocking across the party (Lodestar Warden +
  Crescendo Chorister turns everyone's tags into a weapons system; double-solo picks like Foundry +
  Snaresmith make a bot-party fortress comp). The tree data format lets the
  [Reach Director](07-procgen.md) §4 read party Gates when weighting content.

---

## 5. Downed, Revive & Death Mechanics (source of truth)

- **Downed state:** at 0 HP a character is downed (crawl-crawl speed, no actions, 60 s bleed-out). If the
  whole party downs → wipe → gravemark flow ([09](09-modes-social.md) §6).
- **Out-of-combat revive** (the intended common path): when the party is fully out of combat, an ally may
  channel a revive on a downed member **within the bleed-out window** using a **Stillwater Phial**
  (uncommon consumable, [05](05-items-loot-affixes.md) §6) *or* a class ability that explicitly grants
  revive (Chorister baseline kit includes one on a long cooldown).
- **In-combat revive — VERY RARE by design:**
  - **Threnody** (Chorister deep cluster): channel a battle-resurrection — long, interruptible,
    Cadence-hungry; deep nodes shorten it and add a post-revive ward. The only repeatable in-combat rez.
  - Certain **Singular** items carry one-charge-per-Sanctum lesser versions
    ([05](05-items-loot-affixes.md) §5).
- **Self-revive — VERY RARE by design:**
  - **Deathgrudge** (Reaver deep cluster): on being downed, rise at 50% HP **draining steadily to 0** —
    stabilized only by killing the enemy that downed you (a *grudge mark* shows the target). Once per
    Sanctum-to-Sanctum leg.
  - One-off Singular effects can mimic this weakly (once per expedition tier).
- **XP debt & gravemarks:** defined in [09-modes-social.md](09-modes-social.md) §6 — summary: past an
  area-level threshold death adds a small scaling flat XP debt (never delevels); a protected fraction of
  unspent XP stays with you; the remainder plus all unbanked loot waits at the gravemark.

---

## 6. Bots & the Roster

Every class has a bot persona ([09](09-modes-social.md) §3): tag-matrix-aware (an Arcanist bot will Soak
before it Shocks), Gate-respecting (a Threnody bot holds its rez for real emergencies), and honest about
the solo/party ratings — the party-fill recommender suggests bots that complement the humans' Gates.

---

*Next: [05-items-loot-affixes.md](05-items-loot-affixes.md) — what the Gloam makes of metal.*
