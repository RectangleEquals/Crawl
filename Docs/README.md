# CRAWLSTAR — Design Documentation

> *An ancient star-engine fell from heaven — and then it crawled.*

## What Is CrawlStar?

**CrawlStar** is an online co-op (1–5 players, AI bots welcome), browser-native, first-person ARPG
looter — low-poly PSX aesthetics under fully modern lighting — built on a procedurally generated
**metroidvania skeleton**. Parties follow the furrow of a crashed, crawling star through a lateral graph
of gloam-warped areas: killing what its radiation remade, looting what it transmuted (deep PoE-style affix
loot), and salvaging the **Starwrought Instruments** — gadget keys to the locks the generator wove, and
*proved solvable*, ahead of them. A long-term roguelite: characters persist forever, worlds persist until
finished, death costs exactly as much as you were too greedy to bank.

**Platform:** HTML5 browser (Three.js + TypeScript), KB/M + gamepad with smart hot-swap ·
**Server:** headless Node.js + SQLite · **Modes:** singleplayer (integrated local server + bots), private/
public co-op up to 5, optional hardcore · **Economy:** Standard + monthly Seasonal leagues with a ladder.

## The Core Gameplay Loop

```
 REST SANCTUM ─ bank loot · respec passives · trade · manage party & bots · global chat · sleep(save)
      │
      ▼
 WAYMARK OBELISK ─ the door and the dare: accept randomized OMENS
      │             (risk modifiers → item rarity/quantity rewards; forced picks at depth)
      │             …and the server generates the next Reach, streamed to clients
      ▼
 THE REACH ─ 5 lateral areas: fight (tag-combo combat, Barony-lethal early → horde-ARPG late)
      │       explore (mazes, puzzles, sublevels, branches) · gadget-gates & remembered locks
      │       secrets & Starwrought Vaults (new Instruments) · Dark Shrines · the Meridian Peddler
      │       …die, and your unbanked wealth waits at a gravemark
      ▼
 THE BOSS ─ composed, named, scaled: always weighty, always a skill check
      │
      ▼
 NEXT SANCTUM ─ deeper, richer, worse … until the CrawlStar itself.
```

## Table of Contents

| Doc | Contents |
|---|---|
| [00-vision.md](00-vision.md) | Pillars · elevator pitch · lore bible (the Crawl, the Gloam, factions, class motives) · tone · **canonical glossary** |
| [01-art-direction.md](01-art-direction.md) | PSX-modern render spec · biome style system · two-phase asset pipeline (procedural prototype → guided Blender/Photoshop recipes) |
| [02-tech-architecture.md](02-tech-architecture.md) | Monorepo · shared deterministic sim/ECS · Z-up coordinate convention · area streaming · integrated-server singleplayer · input & focus-graph UI |
| [03-networking.md](03-networking.md) | WebSocket protocol · 30 Hz tick, prediction & lag compensation · generation streaming · sessions, sleep/resume, chat |
| [04-classes-progression.md](04-classes-progression.md) | Combo-tag system · six classes · passive trees & Keystone Gates · downed/revive mechanics |
| [05-items-loot-affixes.md](05-items-loot-affixes.md) | Paperdoll & bases · rarities · affix/currency/Irradiation crafting · Singulars · the risk economy |
| [06-gadgets.md](06-gadgets.md) | Lock vocabulary → 11 Starwrought Instruments · affix quarantine rule · Astrolabe · gadget UI |
| [07-procgen.md](07-procgen.md) | Archipelago model (regions/spheres/assumed fill) · Reach Director · grid embedding · horizon & streaming · softlock impossibility |
| [08-enemies-bosses.md](08-enemies-bosses.md) | Biome bestiary · elite affixes · pacing curve targets · the boss composer |
| [09-modes-social.md](09-modes-social.md) | Modes & hardcore · bots (play + soak-test harness) · Sanctums · **Waymark Obelisk & Omens** · death/gravemarks · Meridian Peddler · leagues/ladder |
| [10-persistence.md](10-persistence.md) | SQLite schemas (meta + per-world) · save semantics · league migration |
| [11-roadmap.md](11-roadmap.md) | Milestones M1–M9 with acceptance criteria |

## Requirements Traceability

Every criterion from the original brief and subsequent design feedback, mapped to its answering section.

| # | Requirement | Where answered |
|---|---|---|
| 1 | Online multiplayer 3D, first-person with third-person camera shift | [02](02-tech-architecture.md) §7, [03](03-networking.md) |
| 2 | Low-poly PSX pixelated graphics **with modern lighting/effects** | [01](01-art-direction.md) §1–2 |
| 3 | Client runs in HTML5 browser | [02](02-tech-architecture.md) §1, §7 |
| 4 | KB/M + smart gamepad detection, for gameplay **and UI** | [02](02-tech-architecture.md) §6, [01](01-art-direction.md) §3 |
| 5 | Singleplayer with AI bots (debug/testing convenience) | [09](09-modes-social.md) §1, §3.4, [02](02-tech-architecture.md) §5 |
| 6 | Co-op ≤5 with optional bot fill (or no bots) | [09](09-modes-social.md) §1–3 |
| 7 | Modular procedural roguelite dungeon-crawler ARPG looter + metroidvania gadgets | [00](00-vision.md), [06](06-gadgets.md), [07](07-procgen.md) |
| 8 | High/dark fantasy × medieval & sci-fi theme | [00](00-vision.md) §3 |
| 9 | Name (was "Crawl"; suggestions requested) | **CrawlStar** — [00](00-vision.md) §2–3 (user-selected) |
| 10 | Unique classes, deep progression, in-class & mixed-class synergies; solo/bots as fun as friends | [04](04-classes-progression.md) §1–3, §6 |
| 11 | Class-specific **and** neutral weapons/gear | [05](05-items-loot-affixes.md) §3 |
| 12 | PoE-style rarity + affix mods; high risk = high reward loot | [05](05-items-loot-affixes.md) §4–6, §9 |
| 13 | Gadgets: new mechanics, traversal, secrets/shortcuts, grab loot/enemies at range, utility — creative & game-unique | [06](06-gadgets.md) §2 |
| 14 | Headless server + local SQLite; long-term roguelite persistence | [02](02-tech-architecture.md) §8, [10](10-persistence.md) |
| 15 | Passive trees: center start, branching, specialization nodes that lock other directions | [04](04-classes-progression.md) §4 |
| 16 | Generate 5 floors→areas at a time from classes/gadgets/lookbehind/lookahead | [07](07-procgen.md) §4, §7 |
| 17 | Boss every 5 areas: pooled, pseudo-random stats/affixes/mechanics, scaled | [08](08-enemies-bosses.md) §6 |
| 18 | Rest areas: sleep/save/resume with party, manage members/bots, sell/trade, respec, cross-lobby global chat | [09](09-modes-social.md) §4 |
| 19 | Smart progression/backtracking beyond ±5 areas; difficult but fun; **zero gadget softlocks** | [07](07-procgen.md) §5–6 |
| 20 | Modular set pieces stitched on a world grid | [07](07-procgen.md) §5, [01](01-art-direction.md) §5 |
| 21 | Areas maze-like with enemies, puzzles, gadget/mechanic requirements | [07](07-procgen.md) §5, [08](08-enemies-bosses.md) |
| 22 | Everything from scratch; achievable aesthetic with minimal user art effort | [01](01-art-direction.md) §5 |
| F1 | Tiered combat pacing: Barony-brutal early → horde late; bosses always weighty (Souls × PoE) | [00](00-vision.md) §5, [08](08-enemies-bosses.md) §5–6 |
| F2 | Out-of-combat revives (limited window, special means); very rare in-combat/self revives behind deep builds or legendary gear | [04](04-classes-progression.md) §5 |
| F3 | Scaling flat XP debt past depth threshold; never delevels; partial XP retained, rest at gravemark with unbanked loot | [09](09-modes-social.md) §6 |
| F4 | Travelling merchants: fee-scaled courier banking → infinite remove-only chest; further unique services | [09](09-modes-social.md) §7 |
| F5 | Standard + ~1-month Seasonal leagues, public ladder, migration at reset, league seed ⊕ world seed, worlds persist / no new retired-seed worlds | [09](09-modes-social.md) §8, [10](10-persistence.md) §6 |
| F6 | Gadget affixes: **max 1**, minor/optional/additive, never progression-required, never gear-competitive | [06](06-gadgets.md) §4, [07](07-procgen.md) §3 |
| F7 | Gadgets roadblock-first: every gadget answers a lock; levels & some bosses **require** gadgets | [06](06-gadgets.md) §1–2, [08](08-enemies-bosses.md) §6 |
| F8 | Lateral area-graph worlds: areas/area-levels, sublevels, branching unlocks; not vertical floors | [07](07-procgen.md) §1 |
| F9 | Left-handed Z-up XYZ grid; Z de-emphasized unless gadget-gated (up **and** safe-down) | [02](02-tech-architecture.md) §3, [07](07-procgen.md) §1 |
| F10 | Transitional loading via transition objects with loading screens (PoE/PSX style) | [03](03-networking.md) §5, [01](01-art-direction.md) §2.3 |
| F11 | Name **CrawlStar**; lore rebuilt around it (artifact sought; per-class motives) | [00](00-vision.md) §2–3 |
| F12 | Archipelago-inspired Director: sphere levels, region logic gates, randomizable item placement with intent | [07](07-procgen.md) §2–5 |
| F13 | Generation client-requested, server-executed, streamed (≤5 connections ahead / Sanctum-to-Sanctum) | [03](03-networking.md) §5, [07](07-procgen.md) §7 |
| F14 | Waymark Obelisk: randomized tiered Omens (enemy mods, player debuffs, pack size, IIR/IIQ rewards); forced picks at depth, ≥2 on final area; same device opens/generates next Reach | [09](09-modes-social.md) §5, [07](07-procgen.md) §4 |
| F15 | User willing to do some art with step-by-step guidance (Blender 3.3+/Photoshop CS6, free AI tools OK); prototype art first | [01](01-art-direction.md) §5 |
| F16 | Gadget names never clash with gear slots; PoE-style paperdoll separate from key items; gadget tab + radial UI | [06](06-gadgets.md) §1.5, §6, [05](05-items-loot-affixes.md) §2 |
| F17 | README: game description, gameplay loop, TOC | This document |

---

*Start reading at [00-vision.md](00-vision.md). Build order lives in [11-roadmap.md](11-roadmap.md).*
