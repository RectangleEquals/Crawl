# 08 — Enemies & Bosses

> The furrow-kingdoms never left. The Gloam just changed what they are.

Related: [04-classes-progression.md](04-classes-progression.md) §2 (tags), [07-procgen.md](07-procgen.md)
(population & the Director), [09-modes-social.md](09-modes-social.md) §5 (Omens),
[00-vision.md](00-vision.md) §5 (pacing philosophy).

---

## 1. Enemy Design Principles

1. **Readable first.** PSX silhouettes + telegraph language (windup poses, glow cues, audio tells) do the
   communicating; low-poly is a readability *advantage* when animation is deliberate. Creatures follow the
   **N64-tier** geometry rule ([01](01-art-direction.md) §2.4): chunky, silhouette-first, low-tri — detail
   comes from proportion, palette, animation and light normal/AO maps, never from geometric density, so a
   boss-arena swarm still reads instantly at a glance.
2. **Tag-fluent.** Enemies emit and suffer the same combo tags as players ([04](04-classes-progression.md)
   §2) — a drowned knight *Soaks* you before the eel-priest *Shocks*; players learn combos partly by being
   killed by them.
3. **Families over units.** Each biome fields families (a melee line, a ranged line, a support line, a
   horror) sharing a visual/behavioral grammar; depth remixes families with elite affixes rather than
   demanding endless new art ([01](01-art-direction.md) §5 budgets).
4. **Density is the difficulty dial that moves** ([§5](#5-the-pacing-curve)); per-enemy lethality is the
   dial that starts high and *stays* meaningful.

## 2. Bestiary by Biome (launch families)

| Biome ([01](01-art-direction.md) §4) | Families (melee / ranged / support / horror) |
|---|---|
| **Furrowmouth Wastes** | Slag-revenant footmen / shardspitter scavengers / carrion-cant heralds (buff drums) / the **Unfallen** — star-struck giants that stand back up once |
| **Sunken Parish** | Drowned parish knights (Soak auras) / eel-priests (Shock arcs) / bell-wringers (silence zones — anti-caster) / the **Undertow** — a current that hunts |
| **Gloamforest** | Bark-hulk maulers / thornlashers (pull vines) / spore-matrons (heal-over-time clouds) / **moth-swarms** drawn to light sources (punish careless Lantern use — soft counterplay, never a hard gate) |
| **Undercroft Warrens** | Ossuary swarms (skitter packs) / marrow-slingers / grave-chanters (revive lesser dead) / the **Walls-That-Watch** (mimic architecture) |
| **Crystal Chantry** | Chantry wardens (crystal armor — Rend/Bell counterplay) / prism-acolytes (beam refraction) / resonators (enrage hums) / the **Choir-Grown** — fused congregation masses |
| **Hullfall Fields** | Salvage-thralls (welded weapons) / rivet-casters / coolant-tenders (Soak sprays, Chill hazards) / **hull-shades** — phase-flickering machine ghosts (Lantern reveals) |

Each family entry in `Shared/data/enemies/` defines: stat block scaled by area level, tag emissions &
vulnerabilities, AI archetype (§3), pack roles, and loot table hooks.

## 3. AI Archetypes

Shared utility-AI brains ([09](09-modes-social.md) §3 uses the same substrate for bots): **Brawler**
(closes, swings, repositions off Launch threats) · **Skirmisher** (kites, uses cover) · **Warder**
(protects support line) · **Support** (buffs/heals/revives from safety) · **Ambusher** (stealth/burrow/
ceiling openers) · **Siege** (slow, armored, objective-focused). Elites may swap archetypes mid-fight
(a fleeing support elite becoming a cornered brawler is a story every player tells).

## 4. Elites & the Affix Bridge

Elite enemies roll **affixes from the same conceptual system as items** ([05](05-items-loot-affixes.md) §4):
*Gloamtouched* (Irradiate aura — +IIR on kill while tagged), *Mirror-hided* (reflects first tag applied),
*Wardbearer* (projects a force-ward — Warden players recognize the counterplay), *Cadenced* (attacks
on-rhythm; Choristers read it early), *Shardfed* (explodes into currency… and shrapnel). Omens
([09](09-modes-social.md) §5) inject additional forced elite affixes Reach-wide.

## 5. The Pacing Curve

The user-mandated difficulty arc, as tuning targets (per-Reach budgets live in `Shared/data/pacing/`):

| Expedition stage | Feel | Density (pack size · packs/area) | Lethality (TTK-you at even gear) | Player tempo |
|---|---|---|---|---|
| **Reaches 1–2** | **Barony**: scarce, lethal, every fight a decision | 2–4 · 4–6 | 3–5 hits kill you | Slow, deliberate; resources scarce; fleeing is a tactic |
| **Reaches 3–4** | Confidence rising; builds coming online | 4–7 · 6–9 | 5–8 hits | Mid-tempo; combos routine |
| **Reaches 5–7** | **Horde ARPG**: loud, fast, screen-filling | 8–15 · 8–12 | 8+ hits but burst threats appear | Fast; mobility gadgets in constant combat use |
| **Reach 8+ (endgame scaling)** | Horde density **plus** early-game lethality via elite/Omen pressure | 10–18 · 10–14 | Elites hit like Reach-1 enemies again | Mastery check |
| **Bosses, always** | Weighty, telegraphed, multi-phase — Dark Souls presence, PoE mechanics | n/a | Mistakes cost 30–60% HP at any depth | Mid-to-fast, mechanics-driven |

Scaling inputs: area level (base stats), party size (HP/damage multipliers + extra mechanics at 4–5
players), accepted Omens (see [09](09-modes-social.md) §5), Dark Shrines (temporary local spikes).

## 6. The Boss Composer

Every Reach ends in a **composed boss** — procedurally assembled, difficulty-scaled, and *named* (title
generator: *"Vessel-Saint Odrienne, Choir-Grown"*):

```
boss = Archetype × StatRoll × 1–3 BossAffixes × MechanicModules(2 + depth) × Arena × Soundtrack intensity
```

- **Archetype pool** (launch: 8): the Unfallen Colossus (slow, arena-breaking) · the Choir-Grown Mass
  (adds-centric) · the Hull-Shade Duelist (phase-flicker melee) · the Drowned Regent (arena flooding,
  Soak pressure) · the Shardwright Engine (turret phases — Artificer-flavored) · the Grave-Chanter Prime
  (resurrection economy) · the Thornmother (terrain overgrowth) · the Meridian Debtor (steals loot mid-fight;
  killing it pays back with interest).
- **Mechanic modules** (composable, telegraph-first): beam sweeps, arena hazards keyed to biome, add waves,
  tag-combo demands (a Soak flood the party must Shock), phase-armor, enrage timers (soft), vault-tests
  (Impeller-dodged slams)…
- **Gadget-locked modules** (the metroidvania handshake): *resonant carapace* (Bell-shatter to open damage
  phases), *phase-veil* (Lantern reveals the real body), *chrono-tells* (Chronoglass trivializes one
  overwhelming pattern — mastery reward). The Director selects these **only when the Instrument is in an
  earlier sphere** ([07](07-procgen.md) §5), and never more than one per boss.
- **Boss affixes:** from the elite pool plus boss-only entries (*Twin-Sung*: shares HP with a shadow copy).
- **Arena generator:** biome set-piece chamber + module-required geometry (pillars for beam cover, flood
  channels, ferric ceiling ring if Anchor tech is in play).
- **Rewards:** guaranteed Runed+, boss-pool Starmarked chances, first-kill passive point
  ([04](04-classes-progression.md) §4), Omen-scaled currency, and the way forward to the Sanctum.

## 7. Assembly & Testing

Composition happens in the Director's population stage ([07](07-procgen.md) §5) from
`Shared/data/bosses/`; every archetype/module pairing carries compatibility metadata (no flooding module in
a burrow arena). Bot soak runs ([09](09-modes-social.md) §3.4) must clear composed bosses within tuning
envelopes — a boss no bot party survives flags for human review before any player meets it.

---

*Next: [09-modes-social.md](09-modes-social.md) — parties, bots, Sanctums, and the Obelisk's bargains.*
