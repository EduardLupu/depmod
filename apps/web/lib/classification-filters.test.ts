import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLASSIFICATION_MODES,
  cycleClassificationMode,
  getSoloClassification,
} from "./classification-filters";

describe("classification-filters", () => {
  it("hides tests by default", () => {
    expect(DEFAULT_CLASSIFICATION_MODES.test).toBe("excluded");
  });

  it("cycles modes in order", () => {
    expect(cycleClassificationMode("neutral")).toBe("dimmed");
    expect(cycleClassificationMode("dimmed")).toBe("excluded");
    expect(cycleClassificationMode("excluded")).toBe("solo");
    expect(cycleClassificationMode("solo")).toBe("neutral");
  });

  it("finds the solo classification", () => {
    const modes = { ...DEFAULT_CLASSIFICATION_MODES, hook: "solo" as const };
    expect(getSoloClassification(modes)).toBe("hook");
  });
});
