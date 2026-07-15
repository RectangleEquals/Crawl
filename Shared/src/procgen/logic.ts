/**
 * Access logic (Docs/07 §2–3). Boolean rules over CAPABILITIES — base gadget
 * capabilities, key items, and virtual "discovery" flags (never affixes, never
 * class abilities). These gate region entrances; the sphere/fill machinery
 * (graph.ts, fill.ts) uses them to make softlocks impossible by construction.
 */

export type Capability = string;

export type Rule =
  | { k: "always" }
  | { k: "have"; cap: Capability }
  | { k: "and"; of: Rule[] }
  | { k: "or"; of: Rule[] };

export const ALWAYS: Rule = { k: "always" };
export const have = (cap: Capability): Rule => ({ k: "have", cap });
export const and = (...of: Rule[]): Rule => (of.length === 1 ? (of[0] as Rule) : { k: "and", of });
export const or = (...of: Rule[]): Rule => (of.length === 1 ? (of[0] as Rule) : { k: "or", of });

/** Does `held` satisfy the rule? */
export function evalRule(r: Rule, held: ReadonlySet<Capability>): boolean {
  switch (r.k) {
    case "always":
      return true;
    case "have":
      return held.has(r.cap);
    case "and":
      return r.of.every((x) => evalRule(x, held));
    case "or":
      return r.of.some((x) => evalRule(x, held));
  }
}

/** All capabilities a rule references (for validation/debug). */
export function ruleCaps(r: Rule, out = new Set<Capability>()): Set<Capability> {
  if (r.k === "have") out.add(r.cap);
  else if (r.k === "and" || r.k === "or") for (const x of r.of) ruleCaps(x, out);
  return out;
}
