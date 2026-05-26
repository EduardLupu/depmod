import type { Classification, EdgeKind } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { CLASSIFICATION_ENTRIES, GLOSSARY, GLOSSARY_GROUPS, lookupGlossaryEntry } from "./glossary";

describe("glossary", () => {
  it("has a stable, unique id per entry", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never ships an empty term or short description", () => {
    for (const entry of GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.short.length).toBeGreaterThan(0);
    }
  });

  it("covers every Classification", () => {
    const expected: Classification[] = ["page", "api", "hook", "component", "lib", "test"];
    for (const cls of expected) {
      expect(CLASSIFICATION_ENTRIES[cls]).toBeDefined();
      expect(CLASSIFICATION_ENTRIES[cls].swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("covers every EdgeKind", () => {
    const expected: EdgeKind[] = ["import", "type-only", "dynamic"];
    for (const kind of expected) {
      const id = `edge.${kind}`;
      expect(lookupGlossaryEntry(id)).toBeDefined();
    }
  });

  it("exposes the core metric ids referenced by the Inspector", () => {
    // If any of these change, the Inspector's StatRow `tooltipTerm` props are
    // silently broken; keep them in lock-step.
    for (const id of ["metric.loc", "metric.ca", "metric.ce", "metric.instability"]) {
      expect(lookupGlossaryEntry(id)).toBeDefined();
    }
  });

  it("exposes the action ids referenced by the Toolbar and Inspector", () => {
    for (const id of [
      "action.blast-radius",
      "action.collapse-clusters",
      "action.cycle",
      "action.focus-mode",
      "action.relayout",
      "action.type-only-toggle",
    ]) {
      expect(lookupGlossaryEntry(id)).toBeDefined();
    }
  });

  it("returns undefined for unknown ids", () => {
    expect(lookupGlossaryEntry("metric.does-not-exist")).toBeUndefined();
  });

  it("groups every entry in exactly one section", () => {
    const groupedIds = GLOSSARY_GROUPS.flatMap((g) => g.entries.map((e) => e.id));
    expect(groupedIds.sort()).toEqual(GLOSSARY.map((e) => e.id).sort());
    expect(new Set(groupedIds).size).toBe(groupedIds.length);
  });
});
