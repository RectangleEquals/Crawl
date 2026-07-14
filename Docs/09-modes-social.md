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
- **One party owns the world.** Only accepted party members roam the Reaches; anyone else who connects is a
  **non-party visitor** confined to the current Sanctum (§9), governed by party vote (§10). Party
  membership is granted by an accept-vote, never by simply connecting.
- **All progress is durable the instant it happens** (§12, [10](10-persistence.md) §4) — sleeping at a
  Sanctum is a *secondary* full-state flush + safe co-op exit + **seat reservation** (§4, §12), not the
  only save point. Disconnects/rollbacks must never cost banked work.

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
| **Sleeping quarters** | **Sleep = full commit + safe co-op exit + seat reservation** (§12): flushes *everything* to durable storage and quits to the main menu, **reserving each sleeper's seat in this world for a set window (default ~7 days)** so the same party can resume together later. Reserved seats still count in the server browser's player total; a tooltip breaks it into **awake vs sleeping**. Progress was already durable in real time (§12) — sleep just guarantees a clean party-wide park. |
| **Stash & party chest** | Personal tabs; limited shared chest ([05](05-items-loot-affixes.md) §10) |
| **Courier chest** | Infinite, remove-only; receives Peddler-banked loot (§7) |
| **Vendors** | Sell/buy basics, consumables; currency exchange at posted rates |
| **Trade circle** | Formal player↔player trade windows |
| **Respec altar** | Passive refunds & Gate unsealing ([04](04-classes-progression.md) §4) |
| **Party board** | Public lobby listing, bot management (§3.3), ladder view (§8) |
| **Global chat brazier** | The regional chat channels (`#` global, `$` trade), readable/postable here; full channel spec incl. world/party/private in §11 |
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
- **Chat** is region-wide (`#` global, `$` trade) plus per-game-server and party/private channels — full
  spec in §11. Persistence & moderation hooks: [10](10-persistence.md) §2.

## 9. Joining an Active World (Non-Party Visitors)

When a player connects to a game server whose party has **already made progress** (any character past the
first Sanctum) and they were **not** pre-accepted into the party, they join as a **non-party visitor** — not
a wandering intruder. Rules (all server-authoritative):

- **Spawn** in the party's **most-recently-unlocked Rest Sanctum**, never in the field.
- **Cannot leave the Sanctum** except by leaving the server. They **cannot alter party gameplay**: the party
  stash and courier chest are **view-only**, and no world interactables (Obelisk, waygates, shrines) respond
  to them. Their **own personal stash** is accessible; if the server has **no free seat** for them to
  properly join, their personal inventory is **locked view-only** until a seat opens (§12).
- **May optionally spectate** party members and bots out in the Reaches (read-only camera) — a way to
  audition for the party or just watch.
- **Auto-advance:** when the party fells a boss and unlocks a new Sanctum, visitors are automatically moved
  to it (they always sit in the newest Sanctum).
- **The party is notified** of every visitor arrival and can talk to them (World `>` or private `@`, §11).
- **Governance** — the party leader can put a visitor (or *all* current Sanctum visitors at once, for
  anti-grief) to a party vote: **accept / kick / timeout / ban** (§10).

Design intent: a full, safe on-ramp for co-op recruiting, with zero exposure to griefing the active run.

## 10. Party Governance & Voting

The leader can call a vote on any non-party visitor — or on **all Sanctum visitors at once** (useful against
a horde joining only to spam World chat or annoy the party). Vote outcomes, ranked most→least severe:

1. **Ban** (permanent — can never rejoin this server) · 2. **Timeout** (can't rejoin for a set window,
   default days) · 3. **Kick** (disconnected; may rejoin) · 4. **Accept** (granted party membership; takes a
   free seat and may embark).

Rules:

- **Majority rules; the party leader's vote counts as 2.**
- For a non-accept outcome, votes **cascade downward** — if the "reject" votes are split, they resolve to the
  most severe option that still holds a majority (ban → timeout → kick).
- **Timer:** 60 s. Reconciles **immediately** once every eligible member has voted. **No votes cast → no
  action**, just a "vote lapsed" notice.
- **Everyone gets DMs** throughout: the party members *and* the player(s) in question receive direct
  messages about the vote opening, tallies, the countdown, and the result.
- Accept requires a free seat (§12); if the vote passes accept but the server is full, the visitor holds a
  **priority claim** on the next opening.

## 11. Chat Channels

Prefix-driven; the **regional** service relays region-wide channels, the **game** service relays
server/party channels (tiering: [Multiplayer/architecture.md](Multiplayer/architecture.md)).

| Prefix | Channel | Scope / relay | Notes |
|---|---|---|---|
| `#` | **Global** | Region-wide (regional service) | cross-server chatter |
| `$` | **Trade** | Region-wide, **Sanctum-only** to post/read (regional service) | economy talk; gated to Sanctums |
| `>` | **World** | The whole **game server** (all connections incl. Sanctum visitors) | the default for recruiting visitors — `>Want to join our party?` |
| `%` | **Party** | The accepted party on that game server | private to the run |
| `@` | **Private** | Direct message, **region-wide** to an account | `@PlayerAccountName <msg>` — reaches them on any server |

`>` is the game-server-wide default players use to reach visitors sitting in the Sanctum; `@` reaches a
specific account anywhere in the region.

## 12. Game-Server Capacity & Durable State

**Durable-by-default (anti-rollback, anti-exploit).** Anything touching character progression, inventories,
world progression, or gravemarks is **committed the moment it happens** — to the **regional** service for
official realms (else the **game server's** own DB for community/offline realms) — *not* deferred to sleep
([10](10-persistence.md) §4). A disconnect, crash, or forced rollback (especially on a privately operated
server) must never erase work a player just did, and must not be exploitable to undo unwanted outcomes.
**Sleep** (§4) is the secondary guarantee: a full-state flush + clean party-wide exit + seat reservation.

**Seat reservation (sleeping).** A sleeping character reserves its seat in that world for a window
(default ~7 days). Reservations keep the world tied to the party (anti "server-hopping" for exploits, pro
sticking together). If a player takes a **reserved-elsewhere character into a different server**, a
**warning** first explains that their reserved seat on the other world becomes **unreserved** — but their
personal inventories / stashes / gravemarks on that world **stay reserved**, only becoming **temporarily
inaccessible if that server later fills every seat during their absence** (recovered when a seat frees).

**Connection cap.** A game server houses **the party (up to 5) + up to ~11–15 non-party visitors = ~16
simultaneous connections max** (starting figure; see [03](03-networking.md) §8). Even Sanctum-confined
visitors run inside the authoritative simulation (physics included), so the ceiling is a real
performance/stress limit, expected to be tuned per region/host after load testing (initial cap **16**;
32 judged likely too high for a browser game).

---

*Next: [10-persistence.md](10-persistence.md) — the database under the dungeon.*
