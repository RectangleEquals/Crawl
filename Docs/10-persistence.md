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
                 realm,                  -- official | unofficial (never crosses; Multiplayer/architecture §6)
                 passives_json,          -- allocated nodes + sealed/active Gate
                 paperdoll_json,         -- equipped item ids by slot
                 status,                 -- active | sleeping | legacy(hardcore death) | migrated
                 expedition_id NULL,     -- current world, if any
                 last_event_version,     -- monotonic; anti-dupe for game→regional write-back (§4)
                 created_at, played_ms)
reservations    (expedition_id, character_id, account_id, seat_index,
                 state,                  -- awake | sleeping
                 reserved_until,         -- epoch; NULL once released (character taken elsewhere)
                 PRIMARY KEY (expedition_id, character_id))  -- seat reservation & awake/sleeping tally (§4, 09 §12)
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

- **Durable-by-default — commit the instant it happens (user-mandated, [09](09-modes-social.md) §12).**
  Every change to **character progression, inventories, world progression, or gravemarks** is written to the
  durable store **at the moment of the event**, transactionally — never deferred to sleep. For **official**
  realms the durable owner is the **regional** `meta.db` (write-back on each such event, [09](09-modes-social.md) §12);
  for **community/offline** realms it is the **game server's** own DB. A disconnect, crash, or forced
  rollback must **never** erase work a player just banked, and must not be exploitable (e.g. a private-server
  operator forcing a rollback to undo an unwanted outcome). Write-back is idempotent (§4 note) so retries
  can't dupe.
- **Checkpoint / flush events** (transactional, WAL): item pickups, bank/stash/trade/courier moves, XP &
  level & passive changes, gadget grants, Obelisk confirmations, gravemark creation/recovery, area
  transitions (position + carried-inventory snapshot), boss kills / Sanctum unlocks — each commits as it
  occurs. **Sleep** is a *full-state flush + party park + seat reservation* (§Seats below), a secondary
  guarantee on top of the continuous writes, not the primary save.
- **Mid-area crash/disconnect recovery:** restore to the last committed state (which, with continuous
  write-back, is essentially "moments ago"); loot picked up but not yet in a container is re-droppable from
  the area's deterministic records (no dupes: item ids are seeded by location — [02](02-tech-architecture.md) §4).
- **Resume:** wakes the expedition file, restores party at their checkpoint Sanctum (or area snapshot),
  re-offers the same Obelisk hand (`obelisk_offers`), rehydrates gravemarks and remembered locks.
- **Write-back integrity:** game→regional progression writes carry a monotonic per-character version /
  event id so the regional service applies each once (anti-dupe/anti-rollback). Conflicts resolve to the
  highest committed version.

### Seats & reservations (sleeping) — [09](09-modes-social.md) §12

- **On sleep,** each party member's seat in that world is reserved (`reservations.reserved_until = now +
  window`, default ~7 days) and their character marked `sleeping`. Reserved seats still count toward the
  server's player total ([Multiplayer/rest-api.md](Multiplayer/rest-api.md) `GET /api/servers`), and the
  server browser tooltip splits **awake vs sleeping** from these rows.
- **Taking a reserved character into a different server** clears that reservation (`reserved_until = NULL`,
  seat freed) after a client warning; the character's **personal stash/inventory/gravemarks on the old world
  remain owned/reserved**, but become **inaccessible while that world is at full seats** during the absence,
  and recover when a seat frees.
- **Durability posture:** WAL + commit-on-event; periodic `world` file snapshots; `meta.db` nightly backup;
  replication out of scope until scale demands it.

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
