# 00 — Vision & Lore

> **CrawlStar** — an online co-op, browser-native, PSX-styled procedural roguelite ARPG looter, built on a
> metroidvania skeleton that is generated — and *proven solvable* — by the server.

This document is the canon. Every other document defers to the names, rules, and tone defined here.

---

## 1. Design Pillars

1. **Retro-modern aesthetic.** Low-poly, mid-res, PSX-era presentation (vertex wobble, affine warp, chunky
   textures, dithering) rendered *underneath* modern lighting, shadows, and post-processing. Not flat-boxy
   everywhere: **PS2-era environments** (curves, bevels, detail) and **N64-era characters**, married by modern
   surface maps — a memory of a console generation that never existed. Nostalgia with teeth. See
   [01-art-direction.md](01-art-direction.md).
2. **High risk = high reward, everywhere.** Depth, Omens, Irradiation, unbanked loot, Dark Shrines, the
   Meridian Peddler — every system offers a dial that trades safety for wealth. The player is always being
   asked: *how greedy are you feeling?*
3. **A procedural metroidvania with zero softlocks.** Gadget-gated exploration, backtracking, and secrets are
   *generated*, not authored — and placement is constructively guaranteed solvable (Archipelago-style assumed
   fill, see [07-procgen.md](07-procgen.md)). If the generator placed a hard gate, the key is already behind you.
4. **Solo-with-bots is as fun as coordinated co-op.** Every system (combo tags, revives, gadget locks,
   trading) is legible to AI party members. Some classes shine alone; some multiply a party. Both are
   first-class ways to play. See [09-modes-social.md](09-modes-social.md).
5. **Fully playable on generated prototype art.** Every asset ships first as procedural placeholder output,
   and every asset type has a guided, step-by-step upgrade recipe (Blender/Photoshop) so art can improve
   later without blocking systems work. See [01-art-direction.md](01-art-direction.md).

---

## 2. Elevator Pitch

An ancient star-engine fell from heaven — and then it *crawled*. For an age it dragged its burning hull
across and beneath the world, carving a thousand-league furrow of trenches, drowned kingdoms, and buried
vaults before going dark somewhere no chart agrees on. That scar is called **the Crawl**. The dying engine
at its end is **the CrawlStar**.

You are an expedition member following the furrow — through gloam-warped ruins and the wreckage of every
civilization that tried before you — killing what the star's radiation has remade, looting what it has
transmuted, and salvaging the impossible Instruments it shed along the way. Five areas to a boss, a warded
Sanctum to catch your breath, an Obelisk to tempt you with worse odds for better loot. Then deeper.

Nobody who has found the CrawlStar has come back to say what it wants.

---

## 3. Lore Bible

### 3.1 Timeline

- **The Flight.** Before recorded history, the CrawlStar crossed the sky for three nights — not falling,
  witnesses' fragments insist, but *fleeing*. From what, no record survives.
- **The Fall.** It struck the world's edge and did not stop. Wounded and burning, it crawled — for decades or
  centuries, accounts conflict — gouging the land, tunneling under mountain ranges, boiling seas into salt
  flats, before its light guttered out somewhere far along its own furrow.
- **The Kingdoms of the Furrow.** Civilizations rose along the scar. The star's shed fragments
  (**starshards**) were miracle and curse: they lit cities, forged unbreakable steel, cured plagues — and
  slowly warped everything near them. Kingdom after kingdom built downward and inward toward richer shards,
  and kingdom after kingdom fell to what the **Gloam** made of them. Their stacked ruins are the game's
  dungeons.
- **The Present — the Age of Expeditions.** The surviving realms ring the Crawl at a superstitious distance.
  Chartered expeditions — desperate, devout, greedy, or damned — walk the furrow toward the star. The
  player's party is one of them.

### 3.2 The Crawl (the region)

The furrow is not a straight trench; the star wandered. The Crawl is a branching scar-land hundreds of
leagues wide: surface wastes and gloamforests, sunken temple-districts, undercroft networks, crystal
caverns, star-slag flats, and the hulks of the star's own shed machinery. Expeditions travel **laterally
along and across the furrow** — descending only where the scar plunges — which is why the world is a
connected graph of *areas*, not a tower of floors ([07-procgen.md](07-procgen.md)).

**The Gloam re-knits the land.** The star's radiation warps space and memory near the scar: paths silt over,
ruins reshuffle, the furrow *forgets* the routes of previous expeditions. This is the in-fiction truth behind
procedural worlds, league seeds, area re-population after death, and why no two expeditions chart the same
path.

### 3.3 The Gloam

The CrawlStar's radiation. Rules of thumb the whole design obeys:

- **It intensifies with proximity to the star** — the risk/reward gradient. Area level is, in fiction, gloam
  saturation.
- **It warps life** into the bestiary ([08-enemies-bosses.md](08-enemies-bosses.md)) and warps *things* into
  magic — every affix on every item is a gloam-mutation ([05-items-loot-affixes.md](05-items-loot-affixes.md)).
  Deliberately soaking an item in raw Gloam is **Irradiation** — the corruption gamble.
- **It answers ritual.** The Omens accepted at a Waymark Obelisk are formal invitations to the Gloam to press
  harder — and it pays for the privilege ([09-modes-social.md](09-modes-social.md)).
- **It cannot cross star-hull.** Fragments of the CrawlStar's own plating (**chorale-stones**, so named for
  the faint harmonic they emit) ward it away. Every Rest Sanctum is built around one.

### 3.4 Starshards & the Starwrought

**Starshards** are fragments the star shed as it crawled — power sources, currency bases, and the seeds
around which biomes and dungeons grew. The lost furrow-kingdoms learned to build with them: their surviving
devices are the **Starwrought Instruments**, the game's gadgets ([06-gadgets.md](06-gadgets.md)) — unique,
irreplaceable tools that answer the Crawl's obstacles. Instruments are keyed to the region of the furrow
they were forged for; they do not survive the crossing between expeditions (the in-fiction reason gadgets
are world-bound while characters persist).

### 3.5 Rest Sanctums

Waystations on the old pilgrim roads, each raised around a chorale-stone that holds the Gloam out. Neutral
ground by ancient charter: expeditions sleep here (save & resume), trade, retrain, and consult the
**Waymark Obelisk** — a chorale-stone spur that both *opens the warded way to the next Reach* and lets the
party bargain with the Gloam (Omens) for richer, deadlier ground ahead.

### 3.6 The Meridian Peddler

A travelling merchant met, rarely, in the open Crawl between Sanctums — always alone, always unbothered by
the local horrors, never quite remembering having met you before. Sells services no honest vendor can:
couriering loot back to Sanctum chests, star-sealed gambles, rumors that are always true. The Peddler's
nature is deliberately unexplained; running gag and low-key dread in equal measure.

### 3.7 Why each class crawls (character motives)

Full mechanical treatments in [04-classes-progression.md](04-classes-progression.md).

| Class | Who they are | Why they seek the CrawlStar |
|---|---|---|
| **Warden** | Knight of the **Furrowguard**, an order forged from re-worked star-hull plate — their force-wards are literally pieces of the star | Sworn to reach the dying engine and **seal it** before its final death-flare re-scars the world |
| **Arcanist** | Starglass scholar of the **Collegium Astrale** | Racing the Furrowguard: **study and harness** the engine's heart before the knights entomb it forever |
| **Reaver** | **Gloam-blooded** — a survivor of deep exposure, strength rising as their self is slowly unmade | Seeks the source to **master or break the curse**; every level deeper is both medicine and poison |
| **Shade** | Guild-sworn to the **Lantern Consortium**, fences of starshard contraband | The star's heart is **the last great heist** — the one score that retires every debt |
| **Artificer** | Salvager-engineer of the **Wroughtwrights**, who reverse-engineer Starwrought relics | The engine is **the motherlode and the blueprint** — the original of every device they've ever half-understood |
| **Chorister** | Hears the engine's failing song — **the Chorale** — in their sleep, as every chorister before them did | On pilgrimage to **answer or soothe** the song; no one knows what happens to the world if it stops |

These motives are flavor and framing (dialogue, class quests later, Sanctum barks) — parties of mixed motive
travel together because the Crawl kills soloists. Faction tension is narrative seasoning, never a mechanical
restriction on grouping.

### 3.8 Expeditions (worlds)

A generated world = one **expedition**: a charted branch of the furrow, seeded by *league seed ⊕ world seed*
([07-procgen.md](07-procgen.md), [10-persistence.md](10-persistence.md)). The expedition persists — the party
can sleep at a Sanctum and resume later — until abandoned or completed. Because the Gloam re-knits the land,
a new expedition is always a new world.

---

## 4. The Core Loop

```
 Rest Sanctum
   ├─ bank loot · respec · trade · manage party/bots · global chat · sleep(save)
   └─ WAYMARK OBELISK: accept Omens (risk ↑ → IIR/IIQ ↑) → opens the way, server generates next Reach
        ↓
 REACH (5 areas, lateral graph, ~area-leveled)
   explore → fight → loot → puzzle → gadget-gates → secrets → branches
   [rare: Meridian Peddler · Dark Shrines · Starwrought Vault (new gadget)]
        ↓
 BOSS AREA (composed boss: archetype × affixes × mechanic modules × arena)
        ↓
 next Rest Sanctum … deeper, richer, worse.
```

Death mid-Reach: party wipes to the last Sanctum; unbanked loot and a slice of unspent XP wait in a
**gravemark** where you fell ([09-modes-social.md](09-modes-social.md) §Death).

---

## 5. Difficulty & Pacing Philosophy

- **Early Reaches feel like Barony**: scarce resources, lethal ordinary enemies, every engagement a
  decision. The Crawl should frighten a fresh party.
- **Power curves toward horde-ARPG**: as builds come online (gear, passives, gadget mobility), density and
  tempo rise; late Reaches are fast, loud, and screen-filling.
- **Bosses never go quiet**: at any depth, bosses are weighty, telegraphed, multi-phase skill checks —
  Dark Souls presence with Path of Exile mechanics. Player power buys margin, never autopilot.

Concrete tuning targets live in [08-enemies-bosses.md](08-enemies-bosses.md).

---

## 6. Tone & References

| Reference | What we take |
|---|---|
| **Barony** | Early-game lethality; first-person dungeon dread; co-op chaos |
| **Path of Exile** | Affix depth, currency-as-crafting, waystone/map Omens, leagues, zone transitions |
| **Hollow Knight / Metroid / Zelda** | Gadget-gated world grammar; the joy of a remembered lock finally opening |
| **Grime** | Dark-surreal biome flavor; absorbing the world's strangeness as power |
| **Dark Souls** | Boss weight and telegraph language; risk of carrying unbanked wealth |
| **King's Field / PSX era** | Aesthetic bedrock: fog, low-poly geometry, loading-plate transitions, menace through restraint |
| **Archipelago Randomizer** | Regions, logic gates, spheres, assumed fill — the solvability engine |

Tone in one line: **a funeral procession that pays in gold** — sorrowful, strange, oppressive, and
irresistibly lucrative. Humor exists (the Peddler, bot banter) but stays dry and rare.

---

## 7. Canonical Glossary

Terms every doc must use exactly:

| Term | Meaning |
|---|---|
| **CrawlStar** | The dying star-engine at the furrow's end; the game's title and goal |
| **the Crawl** | The scarred region the star carved; where the game takes place |
| **the Gloam** | The star's warping radiation; rises with depth; source of all affixes |
| **starshard** | Shed star-fragment; lore seed for biomes, currency, and Instruments |
| **Starwrought Instrument** | A gadget: unique, world-bound, progression-gating key item (never gear) |
| **Reach** | One generation unit: 5 areas → boss area → Rest Sanctum |
| **area** | One transitionally-loaded zone (region, dungeon, or sublevel) with an **area level** |
| **Rest Sanctum** | Safe lobby between Reaches: bank, trade, respec, sleep(save), Obelisk |
| **Waymark Obelisk** | Sanctum device: opens the next Reach and hosts Omen selection |
| **Omen** | An accepted difficulty modifier on a Reach; raises IIR/IIQ and rewards |
| **gravemark** | Death marker holding unbanked loot and recoverable XP |
| **Meridian Peddler** | Rare travelling merchant of unique services |
| **expedition** | One generated, persistent world (league seed ⊕ world seed) |
| **sphere** | Solvability tier: what's reachable given progression items from earlier spheres |
| **remembered lock** | A gadget gate seen but not yet openable; tracked by the Astrolabe |
| **Singular** | Highest item rarity: hand-designed, build-warping uniques |
| **chorale-stone** | Star-hull fragment that wards off the Gloam; heart of every Sanctum |
| **Furrowguard / Collegium Astrale / Lantern Consortium / Wroughtwrights** | Factions (Warden / Arcanist / Shade / Artificer) |
| **the Chorale** | The star's failing song; heard by Choristers |

---

*Next: [01-art-direction.md](01-art-direction.md) — how CrawlStar looks, and how its art gets made without an artist.*
