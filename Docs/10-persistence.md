# 10 — Persistence

> The Crawl forgets its paths. The database does not.

Related: [02-tech-architecture.md](02-tech-architecture.md) §5 (deployment shapes),
[03-networking.md](03-networking.md) §6 (sessions), [09-modes-social.md](09-modes-social.md) (what gets saved).

---

## 1. Storage Topology

- **Engine:** SQLite via **better-sqlite3** (WAL mode) on the headless server, running on a **dedicated
  persistence worker thread** ([02](02-tech-architecture.md) §4.2): the sim posts checkpoint jobs to an
  event queue and never blocks on disk; inside the worker the synchronous API is a deliberate choice
  (faster than async drivers for game-sized transactions, and SQLite serializes writers regardless). The
  singleplayer integrated server uses the same schema through a sql.js/OPFS adapter behind one storage
  interface ([02](02-tech-architecture.md) §5).
- **Two database classes:**
  - **`meta.db`** (one per server): accounts, characters, stashes, leagues, ladder, chat, meta-unlocks.
  - **`world-<expeditionId>.db`** (one per expedition): everything about one generated world. Worlds are
    self-contained files — archivable, exportable (a singleplayer world can migrate to a hosted server by
    copying its file, [02](02-tech-architecture.md) §5).

## 2. `meta.db` Schema (sketch)

```sql
accounts        (id, email, auth_hash, created_at, settings_json)
characters      (id, account_id, league_id, class, hardcore, level, xp, xp_debt,
                 passives_json,          -- allocated nodes + sealed/active Gate
                 paperdoll_json,         -- equipped item ids by slot
                 status,                 -- active | legacy(hardcore death) | migrated
                 expedition_id NULL,     -- current world, if any
                 created_at, played_ms)
items           (id, owner_type,        -- character | stash | party_chest | courier | gravemark | trade
                 owner_id, base_id, rarity, affixes_json, sockets_json,
                 irradiated, seal_state, created_at)
stash_tabs      (id, account_id, league_id, name, sort, capacity)
meta_unlocks    (account_id, unlock_id, unlocked_at)   -- widened gadget/boss/biome pools (00 §3.4)
leagues         (id, name, seed, starts_at, ends_at, ruleset_json)
ladder          (league_id, character_id, depth_reached, bosses_felled, hardcore_alive,
                 bots_used, updated_at)
chat_messages   (id, league_id, channel, account_id, body, created_at)   -- ring-buffered retention
```

- Items live in `meta.db` so trade/stash/courier transfers are single-database transactions; a character's
  *in-world* carried inventory is snapshotted into the world checkpoint (§4) and reconciled on save.

## 3. `world-<id>.db` Schema (sketch)

```sql
expedition      (id, league_id, world_seed, created_at, status,      -- active | sleeping | complete | archived
                 furrow_position,          -- progress along the golden path
                 sphere_plan_json)         -- lookahead reservations (07 §4)
areas           (id, reach_index, biome, area_level, descriptor_blob,  -- compact deterministic descriptor (03 §5)
                 state,                    -- ungenerated | generated | visited | cleared
                 discovered_secrets_json, repopulation_seed)
region_logic    (region_id, access_rule_json, sphere_index)            -- the solvability record (07 §5)
placed_items    (location_id, area_id, classification,                 -- progression | useful | filler
                 payload_json, collected_by NULL)
gadget_grants   (instrument_id, tier, granted_at_area, party_wide BOOLEAN)
remembered_locks(id, area_id, lock_type, seen_by_json, opened BOOLEAN) -- Astrolabe pins (06 §5)
omens_active    (reach_index, omen_id, tier, accepted_at)
parties         (id, leader_character_id, mode, public BOOLEAN)
party_members   (party_id, character_id NULL, bot_persona_json NULL, slot)
party_position  (party_id, area_id, checkpoint_sanctum_id)
gravemarks      (id, character_id, area_id, pos_xyz, xp_amount, item_ids_json, created_at)
peddler_state   (reach_index, spawned_area_id NULL, stock_json, services_used_json)
obelisk_offers  (sanctum_id, offer_json, rolled_at)                    -- deterministic re-offer on resume
```

- **Descriptors, not geometry:** areas persist as the same compact deterministic descriptors the network
  streams ([03](03-networking.md) §5) — kit ids, transforms, seeds, logic, spawn records. A saved world is
  typically well under a megabyte.

## 4. Save Semantics

- **Checkpoint events** (transactional, WAL): Sanctum arrival · **sleep** (party save & quit — parks the
  expedition, [09](09-modes-social.md) §4) · area transitions (position + carried-inventory snapshot) ·
  gravemark creation/recovery · Obelisk confirmation (Omens + generation outputs) · trades and courier
  transfers (atomic across `meta.db`).
- **Mid-area crash/disconnect recovery:** restore to the last area-entry snapshot; loot picked up since is
  re-droppable from the area's deterministic records (no dupes: item ids are seeded by
  location — [02](02-tech-architecture.md) §4).
- **Resume:** wakes the expedition file, restores party at their checkpoint Sanctum (or area snapshot),
  re-offers the same Obelisk hand (`obelisk_offers`), rehydrates gravemarks and remembered locks.
- **Durability posture:** WAL + checkpoint-on-event; periodic `world` file snapshots; `meta.db` nightly
  backup. Good enough for a small hosted cluster; replication is out of scope until scale demands it.

## 5. World Lifecycle

`active` ⇄ `sleeping` → `complete` (CrawlStar reached — world stays walkable as a trophy) or `archived`
(abandoned; file retained for a grace period, then compacted to a summary row in `meta.db`).

## 6. League Migration

At season end ([09](09-modes-social.md) §8): league characters/stashes re-flag to Standard in `meta.db`
(one transaction per account); their world files re-home to Standard **frozen for new generation** — the
`leagueSeed` retires, so existing areas remain playable/backtrackable but the sphere plan stops extending;
finishing the expedition remains possible if its remaining Reaches were already within the generated
horizon, otherwise the Obelisk offers a Standard-seed graft (new seed for remaining Reaches, flagged on the
ladder as post-season). Ladder rows freeze at reset.

---

*Next: [11-roadmap.md](11-roadmap.md) — the order of operations.*
