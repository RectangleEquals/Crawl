# 09 — Modes, Bots, Sanctums & Social

> The Crawl is kinder to companies. It says nothing about the company being human.

Related: [03-networking.md](03-networking.md) (sessions), [04-classes-progression.md](04-classes-progression.md)
§5 (revive mechanics), [05-items-loot-affixes.md](05-items-loot-affixes.md) (economy),
[07-procgen.md](07-procgen.md) (what the Obelisk triggers).

---

## 1. Game Modes

| Mode | Players | Bots | Server |
|---|---|---|---|
| **Singleplayer** | 1 | 0–4 optional | Integrated Web Worker ([02](02-tech-architecture.md) §5) |
| **Co-op (private)** | 2–5 invited | Fill empty slots optionally (host choice) — or none | Hosted headless (or one player's integrated server for LAN-style play) |
| **Co-op (public lobby)** | up to 5 via Sanctum lobby listing | Fill-to-preference | Hosted headless |
| **Hardcore** (opt-in flag at character creation, any mode above) | — | — | True permadeath: death = character archived to legacy; gravemark rules replaced by full loss |

One party per expedition; party size sets encounter scaling ([08](08-enemies-bosses.md) §5). Players can
drop in/out at Sanctums; mid-Reach joins attach at the last checkpoint ([03](03-networking.md) §6).

## 2. Party Rules

- Leader owns Obelisk confirmation and embark decisions; **Omen selection and sleep are party votes**
  (majority, leader tiebreak).
- Loot instancing per player by default ([05](05-items-loot-affixes.md) §10); party chest and courier chest
  shared.
- Area transitions move the party together (30 s regroup prompt at the transition object).

## 3. Bots

Bots are **server-side party members** using the player action interface ([02](02-tech-architecture.md) §8)
— mechanically honest: same movement, cooldowns, gadget charges, revive items.

- **3.1 Brains:** utility-AI scoring over the same archetype substrate as enemies
  ([08](08-enemies-bosses.md) §3), plus party-awareness layers: tag-matrix literacy (Soak before Shock,
  hold Expose for the Reaver's execute — [04](04-classes-progression.md) §2), formation & focus-fire,
  gadget use at locks (they can open their own capability gates and follow the party through traversal
  puzzles), banking discipline (bots vote conservatively on Omens; configurable persona sliders).
- **3.2 Personas:** each class ships a default persona ([04](04-classes-progression.md) §6) with sliders
  (aggression, greed, chatter). Bot barks are sparse, dry, and lore-flavored ([00](00-vision.md) §6).
- **3.3 Player-facing config:** at any Sanctum: add/remove bots, pick class/Gate loadout presets, set
  personas. Bot gear auto-scales to a party-median budget (bots don't loot-compete; their drops route to
  the party).
- **3.4 The bot harness (debugging role):** the same brains drive **headless soak testing** — accelerated
  full-expedition runs asserting no-softlock, boss beatability, pacing telemetry
  ([07](07-procgen.md) §8, [08](08-enemies-bosses.md) §7). Bots exist so the game is always playable *and*
  always testable by one developer.

## 4. Rest Sanctums

Safe, chorale-stone-warded lobby areas between Reaches ([00](00-vision.md) §3.5). Facilities:

| Facility | Function |
|---|---|
| **Sleeping quarters** | **Sleep = save & quit as a party**: checkpoints expedition + characters; resume later with the same party (or re-fill with bots) — [10](10-persistence.md) §4 |
| **Stash & party chest** | Personal tabs; limited shared chest ([05](05-items-loot-affixes.md) §10) |
| **Courier chest** | Infinite, remove-only; receives Peddler-banked loot (§7) |
| **Vendors** | Sell/buy basics, consumables; currency exchange at posted rates |
| **Trade circle** | Formal player↔player trade windows |
| **Respec altar** | Passive refunds & Gate unsealing ([04](04-classes-progression.md) §4) |
| **Party board** | Public lobby listing, bot management (§3.3), ladder view (§8) |
| **Global chat brazier** | Cross-lobby chat channels, readable/postable at any Sanctum (also available as overlay mid-run; [03](03-networking.md) §6) |
| **Waymark Obelisk** | §5 — the way forward |
| **Waygates** | Fast travel to previously visited Sanctums (backtracking spine — [07](07-procgen.md) §6) |

## 5. The Waymark Obelisk & Omens

The Obelisk is **both the door and the dare**: the device that opens the warded way to the next Reach
(triggering server-side generation — [03](03-networking.md) §5) and the altar where the party bargains
with the Gloam.

- **Offer roll:** each visit, the Obelisk presents a seeded, tier-gated hand of **Omens** (typically 6–8
  drawn from `Shared/data/omens/`), tiered like waystone mods: **Minor / Major / Dire**. Offer tiers are
  weighted by area level, party power estimate, and prior Omen history (the algorithm never offers only
  Dire hands early; deep offers skew nastier — "each Reach is a map item" in PoE terms).
- **Omen anatomy:** every Omen = *price* (Reach-wide modifier) + *payment* (reward scaling). Examples —
  Minor: *"packs +20% size → IIQ +12%"*, *"enemies Shock-hardened → shock-themed affix pool unlocked"*;
  Major: *"players −20% healing received → IIR +25%"*, *"2 extra Dark Shrines, all pre-lit → +1 vault
  chart"*; Dire: *"a rival hunter stalks the Reach → its death drops Starmarked"*, *"all elites Gloamtouched
  → boss drops +1 Omen-exclusive currency"*.
- **Acceptance rules (user-mandated):** accepting is optional at shallow depth; past area-level thresholds
  **1 Omen is mandatory**, scaling upward; **the final Reach requires at least 2**. Forced picks still
  offer a choice *among* Omens — agency about *which* price, never about *whether*.
- **Flow:** offers shown → party vote (§2) → leader confirms → generation begins → plate → embark.
  Accepted Omens are Director inputs ([07](07-procgen.md) §4) and display on the party HUD for the whole
  Reach.

## 6. Death, Gravemarks & Recovery (flow — mechanics in [04](04-classes-progression.md) §5)

1. **Downed → revive window:** out-of-combat ally revive via Stillwater Phial or revive-granting ability;
   very rare in-combat/self options (Threnody, Deathgrudge, Singulars).
2. **Party wipe:** everyone wakes at the last Sanctum. A **gravemark** forms where the party fell holding:
   all unbanked loot & currency, and the *recoverable* share of unspent XP.
3. **XP debt (past area-level threshold ~15):** a small flat debt scaling with area level is applied;
   **never delevels** — banked levels and spent passives are untouchable. A protected fraction (~40%) of
   unspent XP stays with you; the rest waits at the gravemark. The tension curve is exactly as designed:
   fresh-leveled players can afford recklessness; pockets full of XP and loot make cowards of everyone.
4. **Recovery run:** areas between Sanctum and gravemark partially re-populate (~60% density, no elites
   respawn). Reaching the gravemark restores its contents in full. Only the newest gravemark per character
   persists (a second wipe merges marks at the newer location).
5. **Hardcore:** no gravemark — the character archives to the legacy roster; their gear drops for surviving
   party members (a wake, not a refund).

## 7. The Meridian Peddler

Rare spawn (Director-rolled, [07](07-procgen.md) §5) in mid-Reach areas — never at Sanctums. All services
priced in **Sanctum Tithe** + Shardglass ([05](05-items-loot-affixes.md) §5); carrying enough currency *to*
the Peddler is itself the risk the design wants:

| Service | Effect | Pricing logic |
|---|---|---|
| **Courier banking** | Send items to the Sanctum **courier chest** (infinite, remove-only) | Fee scales with rarity, affix count, and current area monster level (user-specified formula inputs) |
| **Gravewarrant** | Insurance: if the party wipes this Reach, gravemark contents auto-courier home | Expensive; scales with current unbanked value — greed made liquid |
| **Star-sealed gambles** | Unidentified fixed-base items (Gwennen-style rarity lottery) | Cheap thrills, IIR-independent |
| **The one reroll** | Reroll a single chosen affix on one item | Steep, area-level-priced |
| **Vault charts** | Reveal one undiscovered secret/vault on the Astrolabe for an upcoming area | Flat + tier |
| **Rumors (always true)** | Buy intel: next boss's archetype & one mechanic module; or nearest remembered-lock payoff | Cheap; information as inventory |
| **Exotic consumables** | Stock Sanctum vendors never carry (extra Stillwater Phials, Omen-cleansing draughts, shrine primers) | Rotating, capped stock |

*(The Peddler's Thumb Singular interacts here — [05](05-items-loot-affixes.md) §7.)*

## 8. Leagues & Ladder (social layer)

- **Standard:** the forever pool. New expeditions generate from Standard seeds; characters/stashes persist
  indefinitely.
- **Seasonal** (~1 month): league-flagged characters start fresh economies; expeditions generate from
  `leagueSeed ⊕ worldSeed` ([07](07-procgen.md) §1); a **public ladder** ranks depth-reached / bosses
  felled / hardcore survival. At reset, characters, stashes, and their still-active expeditions migrate to
  Standard (worlds stay playable; no *new* worlds from a retired league seed — [10](10-persistence.md) §6).
- Ladder eligibility requires hosted-server play ([03](03-networking.md) §7); bots in the party are
  permitted but flagged on the ladder entry (a solo+bots ladder category exists — bots are first-class
  citizens, remember).
- **Global chat** spans lobbies per league; channels: General, Trade, Party-finder. Persistence & moderation
  hooks: [10](10-persistence.md) §2.

---

*Next: [10-persistence.md](10-persistence.md) — the database under the dungeon.*
