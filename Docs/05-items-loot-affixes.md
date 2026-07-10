# 05 — Items, Loot & Affixes

> Everything the Gloam touches becomes valuable, dangerous, or both. Usually both.

Related: [04-classes-progression.md](04-classes-progression.md) (what gear enables),
[06-gadgets.md](06-gadgets.md) (what is *deliberately not* gear), [09-modes-social.md](09-modes-social.md)
(vendors, banking, Peddler).

---

## 1. Philosophy

- **High risk = high reward is the economy's physics.** Deeper areas, accepted Omens, Irradiated elites,
  Dark Shrines, and unbanked greed are the drop-quality dials. Safety is always purchasable — with worse loot.
- **PoE-inherited depth, first-person readability.** Affix pools are deep, but item evaluation must work in
  a fast co-op session: strong tooltips, rarity beams, and a loot filter from day one.
- **Gear is power; gadgets are progression.** The paperdoll makes you stronger; the Instruments tab gets you
  *places*. The two systems never trade responsibilities ([06](06-gadgets.md) §1).

## 2. Slots & Inventory

**Paperdoll** (PoE-style silhouette): Head · Chest · Hands · Feet · Main Hand · Off Hand (or 2H) · Amulet ·
2× Ring · Belt · **Shardframe** (class engine slot — see §3). Grid inventory beside it; weight-free,
space-limited. **Instruments (gadgets) and key items live in separate tabs, never on the paperdoll**
([06](06-gadgets.md) §6).

## 3. Base Items

- **Neutral bases** (usable by all classes): the full armor/jewelry set + generalist weapons (blades, maces,
  bows, crossbows, staves, bucklers…). Implicit stat ranges per base; higher-area bases roll better implicits.
- **Class bases** (enable class weapon-skills; usable only by the class): Warden *ward-shields* & bastion
  polearms · Arcanist *starglass foci* · Reaver *gloamforged greatblades* · Shade *fang-pairs* & snare kits ·
  Artificer *wrought-tools* (turret cores double as maces) · Chorister *chorale-tuned bells/censers*
  (musical armaments — instruments in the *musical* sense only; no overlap with Starwrought Instrument
  naming in UI: gear tooltips say **Armament**, gadgets say **Instrument**).
- **Shardframe** (class engine slot): a starshard housing unique to each class (Warden's hull-plate core,
  Arcanist's lens array…). Shardframes carry class-mechanic affixes (e.g., ±Bulwark capacity, Heat vent
  rate) — the slot where class fantasy concentrates.

## 4. Rarity & Affixes

| Rarity | Color | Affixes | Notes |
|---|---|---|---|
| **Common** | white | 0 | Crafting fodder & early lifeline |
| **Forged** | blue | 1 prefix + 1 suffix max | |
| **Runed** | gold | up to 3 prefixes + 3 suffixes | The build workhorse |
| **Starmarked** | violet | Runed pool + 1 **starmark** (special-slot mod from a rarer pool: triggered effects, tag interactions) | Relic tier |
| **Singular** | gloam-green | Hand-designed fixed effects + limited rolled ranges | Build-warping uniques (§7) |

- **Affix system:** prefixes (offense/defense magnitudes) and suffixes (speeds, resists, utility) drawn from
  per-item-class pools; every affix has **tiers (T5→T1)** gated by area level — deep loot isn't just more,
  it's *better rolled*. Weights per pool; some affixes are biome- or Omen-flavored (an Omen-run item can roll
  mods from that Omen's theme — [09](09-modes-social.md) §5).
- **Tag affixes** bind gear to the combo system ([04](04-classes-progression.md) §2): *"adds Ignite on
  crit"*, *"+40% Rend duration"*, *"Conduction arcs +1 target"* — cross-class build glue.
- **IIR / IIQ** (item rarity / item quantity): party-wide stats from gear, Omens, Dark Shrines, Gildhand
  auras; IIR raises rarity upgrade odds, IIQ raises drop counts. Displayed openly on the party screen.

## 5. Crafting Currency

Starshard-derived, PoE-grammar (orbs as both currency and crafting verbs), all tradeable:

| Currency | Effect |
|---|---|
| **Shardglass** | The common exchange denomination (vendoring, fees, respec costs) |
| **Whetshard** | Reforge a Common → Forged with random affixes |
| **Kilnshard** | Reforge Forged → Runed (random) |
| **Auric Thread** | Add one affix to an item with an open slot |
| **Unmaking Salt** | Remove one chosen affix |
| **Chorus Grain** | Reroll the *values* of existing affixes (keeps mods) |
| **Star-Seal** | Seal one affix so other currency can't touch it |
| **Gloamvial** | **Irradiate** an item (§6) |
| **Sanctum Tithe** | Peddler/waygate service fees; the "fee currency" the Meddler prices in ([09](09-modes-social.md) §7) |

Currency drops obey the same IIR/IIQ economy; crafting is deliberately currency-hungry to keep drops
exciting deep into an expedition. (Exact drop rates: `Shared/data/economy/`.)

## 6. Irradiation (the corruption gamble)

Crack a **Gloamvial** over any item: the Gloam rewrites it, once, irreversibly —

- ~35% nothing + item sealed (no further crafting) · ~30% one affix rerolled to any tier (up or down) ·
  ~20% gain a **gloam-affix** (exclusive pool: powerful, always double-edged — *"+25% damage, −10% max
  HP"*) · ~10% brick (base ruined → shard salvage) · ~5% ascend one rarity tier keeping mods.
- Starmarked/Singular items risk more (bricking destroys star-level value) and gain more (gloam-affixes roll
  at higher tiers). Percentages are tuning targets.

**Consumable risk-siblings:** **Stillwater Phial** (revive consumable — [04](04-classes-progression.md) §5),
antidotes/wards, Omen-cleansing draughts ([09](09-modes-social.md) §5) — all scarce enough that using one is
a decision.

## 7. Singulars

Hand-designed uniques with fixed mechanics; the home of effects too dangerous for the affix pool — and the
designated container for power the user explicitly excluded from gadgets:

- ***The Long Way Home*** (relic amulet): place a phantom waypost at a Sanctum; once per Reach, channel 6 s
  to return the party to it. *(The recall-waypoint fantasy — a Singular, deliberately not an Instrument.)*
- ***Third Verse*** (chorale bell armament): once per Sanctum-to-Sanctum leg, an ally's fatal blow instead
  channels a 3 s auto-revive at 25% HP. *(Rare in-combat revive — [04](04-classes-progression.md) §5.)*
- ***Grudgeholder's Iron*** (belt): a once-per-expedition-tier lesser Deathgrudge (rise at 25%, 10 s).
- ***The Peddler's Thumb*** (ring): Meridian Peddler services cost 25% less; the Peddler appears slightly
  more often. *(Economy-warping, progression-neutral.)*
- Design rules: Singulars may bend class/economy/death rules; they may **never** replicate an Instrument's
  lock-opening capability ([06](06-gadgets.md) §3 — progression gating stays generator-controlled).

## 8. Key Items (not gadgets, not gear)

Vault keys, sigils, lever-stones, boss-door seals, quest tokens: ordinary inventory objects placed by the
generator as **progression items** in the Archipelago sense ([07-procgen.md](07-procgen.md) §3). They carry
no stats, occupy the key-items tab, and are expedition-bound.

## 9. The Risk Economy (where loot pressure comes from)

| Dial | Risk | Reward |
|---|---|---|
| **Depth** (area level) | Everything scales | Higher affix tiers, better bases |
| **Omens** ([09](09-modes-social.md) §5) | Enemy affixes, player debuffs, pack size | IIR/IIQ, currency multipliers, extra vault charts |
| **Dark Shrines** (in-area altars) | Activate: area-wide elite empowerment for N minutes | Empowered enemies drop upgraded rarity |
| **Irradiated elites** (Chorister hymns, Omen mods) | Hit harder while tagged | Drop +rarity while tagged |
| **Unbanked greed** | Everything not banked drops at the gravemark ([09](09-modes-social.md) §6) | Party chest space is finite; the Peddler's courier is priced by value ([09](09-modes-social.md) §7) |
| **Irradiation crafting** (§6) | Brick chance | Gloam-affixes, tier ascension |

## 10. Acquisition, Trade & Storage

- **Drops** identify on pickup (no scroll friction), with rarity beams + loot filter.
- **Party loot rules:** instanced drops per player by default (co-op greed protection); free drop/trade
  between present players; formal **trade window** at Sanctums.
- **Storage:** personal **stash** at Sanctums (tabbed, upgradeable), the shared **party chest**
  (limited space — a real constraint, per the banking design), and the **Peddler's courier chest**
  (infinite, *remove-only*, fee-gated — [09](09-modes-social.md) §7).
- **Leagues:** Seasonal and Standard economies are separate; seasonal characters/stashes migrate to Standard
  at reset ([10-persistence.md](10-persistence.md) §6). Ladder rules: [09](09-modes-social.md) §8.

---

*Next: [06-gadgets.md](06-gadgets.md) — the Instruments, and the locks they answer.*
