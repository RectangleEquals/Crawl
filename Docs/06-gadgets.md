# 06 — Starwrought Instruments (Gadgets)

> Not weapons. Not armor. Keys — to doors the Crawl forgot it built.

Related: [07-procgen.md](07-procgen.md) (where locks and Instruments are placed, and the solvability proof),
[05-items-loot-affixes.md](05-items-loot-affixes.md) (what gadgets are *not*),
[08-enemies-bosses.md](08-enemies-bosses.md) (gadget-locked boss mechanics).

---

## 1. Design Laws

1. **Roadblock-first.** Every Instrument exists to answer at least one **lock type** in the generator's
   vocabulary (§2). An Instrument with no lock is a defect; a lock with no Instrument is a bug.
2. **Progression tools, not gear.** Instruments are usable key items with their own UI (§6): never on the
   paperdoll, never competing with weapons/gear for power. Their combat/utility secondaries are
   conveniences and combo garnishes, not DPS lines.
3. **Locks are required; affixes never are.** Areas — and some bosses — *require* Instruments to progress,
   exactly like classic metroidvanias. Instrument **affixes** (§4) are strictly optional garnish, capped and
   quarantined from progression by the solver rule ([07](07-procgen.md) §5).
4. **World-bound.** Instruments are found fresh each expedition (Starwrought Vaults, §5) and don't cross
   worlds — the generator always controls metroidvania pacing ([00](00-vision.md) §3.4 for the lore cover).
5. **Naming law:** Instrument names never use gear-slot nouns (greaves, boots, gauntlets, helm, harness,
   cloak, charm…). They read as carried devices. Gear tooltips say **Armament**; gadget tooltips say
   **Instrument**.

## 2. Lock Vocabulary → Instrument Roster

The eleven lock types the [Reach Director](07-procgen.md) §4 may weave into required paths, and the
Instrument that answers each. *(Secondary uses are flavor/utility; they never substitute for another
Instrument's lock.)*

| # | Lock type (what blocks you) | Instrument | How it opens · secondary uses |
|---|---|---|---|
| 1 | **Uncrossable gaps & deadly drops** — chasms; heights that would kill on landing | **Graviton Tether** | Grapple to anchor plates to swing/pull across; **rappel mode** for controlled safe descent (the Z-down gate). *Secondary:* yank loot & small enemies to you. |
| 2 | **Sheer climbs & out-of-reach ledges** (the Z-up gate) | **Gravitic Impeller** | Charged double-jump / vertical launch between impeller pads. *Upgrade:* brief slow-fall. *Secondary:* dodge-hop; Launch-tag garnish on landing. |
| 3 | **Ferric routes** — magnetized wall/ceiling paths bridging unwalkable space | **Lodestone Anchor** | Bind to and walk marked ferric surfaces; shaft ascents, inverted galleries. *Secondary:* briefly magnet-pin a metal-armored enemy. |
| 4 | **Phase geometry** — ghost bridges, doors, and stairs that only exist in star-light | **Phase Lantern** | Its beam solidifies phase structures while lit (charge-limited — commit before you shine). *Secondary:* reveals invisible enemies & false walls. |
| 5 | **Barred passages** — grates, portcullises, collapsed lattices | **Blink Coil** | Short blink through thin obstructions to the far side. *Secondary:* i-frame micro-dodge (long cooldown; not a combat spammable). |
| 6 | **Resonant seals** — singing-crystal walls, harmonic doors | **Resonance Bell** | Ring at matched pitch to shatter/open. *Secondary:* sonar ping etches hollow spaces & secrets onto the Astrolabe map; staggers armored foes. |
| 7 | **Burrow networks** — crawlspaces no armored adult fits through | **Wyrmburrow Effigy** | Clutch it to shrink into a wyrmling form and crawl the burrows into sealed pockets (defenseless while small — tension by design). |
| 8 | **Light-locks & gloomweave** — lens-doors needing a star-beam; webs of hardened dark | **Starlight Prism** | Catch and redirect star-beams onto lock lenses; the focused beam burns gloomweave from doorways. *Secondary:* flash-blind (Expose garnish). |
| 9 | **Timing locks** — spans that crumble too fast, flux-gates flickering open/shut, piston/trap corridors | **Chronoglass** | Local time-slow bubble freezes the obstacle mid-cycle long enough to cross. *Secondary:* slows projectiles crossing the bubble. |
| 10 | **Hazard-flooded zones** — submerged passages, gloam-choked galleries, star-fire vents | **Wardlight Censer** | Carried ward bubble grants *timed* traversal of one hazard class (per-charge). *Secondary:* party members inside the bubble share it. |
| 11 | **Sundered spans** — paired loom-posts across a gap no single line crosses | **Weaver's Threadspool** | String a taut, walkable thread strictly **between fixed loom-posts within limited range**; the whole party (or a solo player, anchoring both ends) crosses. *Secondary:* thread trips small pursuers. |

Every lock type also has **soft variants** for secrets: an optional side-vault behind lock #4, a bonus
stash across lock #1 — the generator uses required locks for the golden path and soft locks for greed
([07](07-procgen.md) §5).

## 3. What Instruments Are *Not*

- Not a damage system: secondaries scale with area level for utility only, never with gear stats.
- Not replicable: no Singular, affix, or class ability may open an Instrument's lock type
  ([05](05-items-loot-affixes.md) §7). A Gravitic-Impeller-shaped jump on a class kit is a *dodge*, not a
  ledge-gate opener — gate interactions check the **capability flag**, which only the Instrument grants.
- Not permanent: expedition-bound (§1.4).
- Not tradeable, not sellable, no inventory footprint (own tab).

## 4. Charges, Upgrades & Affixes

- **Charges:** traversal uses are generous but not unlimited (Lantern light, Censer wards, Chronoglass
  bubbles are per-charge; Tether/Impeller/Anchor are cooldown-based). Charges refill at Sanctums and
  shard-founts; Artificer *gadget affinity* extends them ([04](04-classes-progression.md) §3.5).
- **Upgrade tiers (T1→T3):** found as **star cores** in later spheres; extend *base capability along
  designed steps* (Lantern beam duration, Censer hazard classes, Impeller slow-fall). The Director may
  require a tier for a deep lock only if that core placement is already guaranteed
  ([07](07-procgen.md) §5).
- **Affix rule (hard constraint):** an Instrument may carry **at most ONE affix**, drawn from a quarantined
  pool of minor utility / QoL / temporary combat garnish / small unique actives. Examples: *"+20% Tether
  reach"* (reaches optional bonus anchors only), *"Bell ping radius +30%"*, *"Blink leaves a 2 s decoy"*,
  *"Censer bubble also grants minor resist while active"*.
  **Never:** progression-required, gear-competitive, or stacking with class power.
  Enforcement is structural: the solvability solver evaluates **base capabilities only**
  ([07](07-procgen.md) §5), and affix-reachable content is generator-tagged *bonus* (extra loot/currency
  only).

## 5. Acquisition & the Astrolabe

- **Starwrought Vaults:** set-piece chambers placed by assumed fill ([07](07-procgen.md) §5) — each vault
  is a small authored-feeling puzzle/arena moment ending in an Instrument on a pedestal (the *item get*
  beat, staged with full ceremony: unique loading-plate stinger, chorale sting, glyph card).
- **Grant pacing:** first Instrument inside Reach 1; roughly one new Instrument or star core per Reach
  thereafter; party-wide pickup (every member receives it — no gadget-hogging in co-op).
- **Cartographer's Astrolabe** (baseline tool, every character, not a slot Instrument): the automap, plus
  the **remembered-locks journal** — every gadget gate you've *seen* but couldn't open is pinned with its
  lock glyph; when the answering Instrument is found, its pins light up: the backtracking engine
  ([07](07-procgen.md) §6). Bell pings, Shade treasure-sense, and Peddler vault charts all annotate it.

## 6. UI & Controls

- **Instruments tab** (inventory screen): the gadget collection, upgrade tiers, charge states, the one
  affix — visually distinct from the paperdoll (key-item framing, no slot silhouette;
  [01](01-art-direction.md) §3).
- **Radial menu** (hold `gadget` action): gamepad-native quick select (also mouse-friendly); the selected
  Instrument binds to the use-gadget action. KB users additionally get number-row quick-binds.
- **Contextual prompts:** aiming at a lock the *selected* Instrument answers shows the use glyph; aiming at
  one whose Instrument you own but haven't selected hints the radial; locks you can't open yet show the
  lock glyph — and pin to the Astrolabe.

---

*Next: [07-procgen.md](07-procgen.md) — how the Crawl builds itself, and why it can never strand you.*
