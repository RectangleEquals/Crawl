/**
 * Starwrought Instruments — gadget definitions (Docs/06). Gadgets are
 * progression KEY ITEMS, never gear (hard law 1): each answers a roadblock in
 * the generator's lock vocabulary, grants exactly one BASE capability the solver
 * may gate on, carries charges, and — critically — its name never uses a
 * gear-slot noun (so nothing reads as equippable; Docs/06 §1.5, README F16).
 * The procgen grammar/Director place these; the client renders them in a
 * key-item tab + radial menu (M4 client work).
 */

import type { Capability } from "../procgen/logic.js";
import type { ProgressionItem } from "../procgen/graph.js";

export interface GadgetDef {
  id: string;
  /** Display name — MUST NOT contain a gear-slot noun (see GEAR_SLOT_NOUNS). */
  name: string;
  /** The single base capability the logic/solver gates on (never an affix). */
  capability: Capability;
  /** The roadblock this Instrument answers (Docs/06 lock vocabulary). */
  lock: string;
  /** Base charges before recharge (Docs/06 — gadgets are charge-limited). */
  charges: number;
  blurb: string;
}

/** The two M4 launch Instruments (Docs/06 §2 #1–2). */
export const M4_GADGET_DEFS: readonly GadgetDef[] = [
  {
    id: "graviton-tether",
    name: "Graviton Tether",
    capability: "tether",
    lock: "gap", // uncrossable gaps & deadly drops
    charges: 3,
    blurb: "Fling an anchor across a chasm and haul across; reverse the pull to rappel down safely.",
  },
  {
    id: "gravitic-impeller",
    name: "Gravitic Impeller",
    capability: "impeller",
    lock: "ledge", // sheer climbs & unreachable ledges
    charges: 2,
    blurb: "A charged downward shove that launches you up to ledges out of a normal jump's reach.",
  },
];

/** The grammar/Director place these as progression items (id ↔ capability). */
export const M4_GADGETS: readonly ProgressionItem[] = M4_GADGET_DEFS.map((g) => ({ id: g.id, grants: g.capability }));

/**
 * Gear-slot nouns that gadget names must NEVER use (hard law 1 / README F16) —
 * so a gadget never reads as equipment. Enforced by a unit test.
 */
export const GEAR_SLOT_NOUNS: readonly string[] = [
  "greave", "greaves", "boot", "boots", "gauntlet", "gauntlets", "glove", "gloves",
  "helm", "helmet", "hood", "coif", "cap", "crown", "mask",
  "harness", "cuirass", "breastplate", "plate", "mail", "vest", "chestpiece",
  "cloak", "cape", "mantle", "shroud",
  "belt", "sash", "girdle", "ring", "band", "amulet", "necklace", "pendant",
  "bracer", "bracers", "vambrace", "pauldron", "sabaton", "shield", "buckler", "charm",
];

/** Does a name contain a gear-slot noun (whole-word, case-insensitive)? */
export function usesGearSlotNoun(name: string): string | null {
  for (const w of name.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    if (GEAR_SLOT_NOUNS.includes(w)) return w;
  }
  return null;
}
