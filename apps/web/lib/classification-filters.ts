import type { Classification } from "@depmod/types";

/** Toolbar / canvas cycle: neutral → dim → exclude → solo-only → neutral. */
export type ClassificationFilterMode = "neutral" | "dimmed" | "excluded" | "solo";

export type ClassificationModes = Record<Classification, ClassificationFilterMode>;

export const DEFAULT_CLASSIFICATION_MODES: ClassificationModes = {
  page: "neutral",
  api: "neutral",
  hook: "neutral",
  component: "neutral",
  lib: "neutral",
  test: "excluded",
  // Build/tooling files (vite.config.ts, *.d.ts, etc.) add noise to the
  // architecture view; start hidden, mirror the test classification.
  config: "excluded",
};

export function cycleClassificationMode(
  current: ClassificationFilterMode,
): ClassificationFilterMode {
  switch (current) {
    case "neutral":
      return "dimmed";
    case "dimmed":
      return "excluded";
    case "excluded":
      return "solo";
    case "solo":
      return "neutral";
  }
}

/** At most one solo mode; the first in toolbar order wins. */
export function getSoloClassification(modes: ClassificationModes): Classification | null {
  const order: Classification[] = ["page", "api", "hook", "component", "lib", "test", "config"];
  for (const cls of order) {
    if (modes[cls] === "solo") return cls;
  }
  return null;
}

export function classificationModeLabel(mode: ClassificationFilterMode): string {
  switch (mode) {
    case "neutral":
      return "normal";
    case "dimmed":
      return "dimmed";
    case "excluded":
      return "hidden";
    case "solo":
      return "only";
  }
}
