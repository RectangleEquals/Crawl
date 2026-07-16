import { describe, expect, it } from "vitest";
import { M4_GADGET_DEFS, M4_GADGETS, usesGearSlotNoun } from "./gadgets.js";

describe("gadget definitions (Docs/06)", () => {
  it("derives progression items matching the defs (id ↔ capability)", () => {
    expect(M4_GADGETS.map((g) => g.id)).toEqual(M4_GADGET_DEFS.map((d) => d.id));
    for (const d of M4_GADGET_DEFS) {
      const item = M4_GADGETS.find((g) => g.id === d.id);
      expect(item?.grants).toBe(d.capability);
    }
  });

  it("has unique ids/capabilities and positive charges", () => {
    expect(new Set(M4_GADGET_DEFS.map((d) => d.id)).size).toBe(M4_GADGET_DEFS.length);
    expect(new Set(M4_GADGET_DEFS.map((d) => d.capability)).size).toBe(M4_GADGET_DEFS.length);
    for (const d of M4_GADGET_DEFS) expect(d.charges).toBeGreaterThan(0);
  });

  it("no gadget name uses a gear-slot noun (hard law 1 / README F16)", () => {
    for (const d of M4_GADGET_DEFS) {
      expect(usesGearSlotNoun(d.name), `"${d.name}" reads as equipment`).toBeNull();
    }
  });

  it("the naming guard actually catches gear-slot nouns", () => {
    expect(usesGearSlotNoun("Vault-Greaves")).toBe("greaves");
    expect(usesGearSlotNoun("Gravitic Impeller")).toBeNull();
  });
});
