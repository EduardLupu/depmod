"use client";

import type { Classification } from "@depmod/types";
import type { ClassificationFilterMode, ClassificationModes } from "./classification-filters";
import { DEFAULT_CLASSIFICATION_MODES } from "./classification-filters";

/**
 * Subset of the store state that we encode into `window.location.hash`. Kept
 * deliberately small; every field must be useful in a bookmarked URL. Things
 * like "sidebar open" or "code viewer open" stay out so URLs don't churn on
 * incidental UI changes.
 */
export interface UrlState {
  pathMask: string;
  selectedNodeId: string | null;
  classificationModes: ClassificationModes;
  focusModeRoot: string | null;
  focusModeDepth: number;
  collapseDirectories: boolean;
  runtimeOnlyMetrics: boolean;
  viewMode: "2d" | "3d" | "detail";
}

const MODE_LETTER: Record<ClassificationFilterMode, string> = {
  neutral: "n",
  dimmed: "d",
  excluded: "x",
  solo: "s",
};
const LETTER_MODE: Record<string, ClassificationFilterMode> = {
  n: "neutral",
  d: "dimmed",
  x: "excluded",
  s: "solo",
};

const CLASS_ORDER: readonly Classification[] = [
  "page",
  "api",
  "hook",
  "component",
  "lib",
  "test",
  "config",
];

export function encodeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.pathMask) params.set("m", state.pathMask);
  if (state.selectedNodeId) params.set("s", state.selectedNodeId);
  const modeStr = CLASS_ORDER.map((c) => MODE_LETTER[state.classificationModes[c]]).join("");
  const defaultModeStr = CLASS_ORDER.map((c) => MODE_LETTER[DEFAULT_CLASSIFICATION_MODES[c]]).join(
    "",
  );
  if (modeStr !== defaultModeStr) params.set("c", modeStr);
  if (state.focusModeRoot) {
    params.set("f", state.focusModeRoot);
    params.set("fd", String(state.focusModeDepth));
  }
  if (state.collapseDirectories) params.set("col", "1");
  // runtimeOnlyMetrics defaults to true; encode only when the user has flipped it off.
  if (!state.runtimeOnlyMetrics) params.set("ro", "0");
  // viewMode defaults to "2d"; encode only the non-default modes so URLs stay
  // clean for the common case.
  if (state.viewMode === "3d") params.set("v", "3d");
  else if (state.viewMode === "detail") params.set("v", "detail");
  return params.toString();
}

export function decodeUrlState(hash: string): Partial<UrlState> | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return null;
  const params = new URLSearchParams(trimmed);
  const out: Partial<UrlState> = {};

  const m = params.get("m");
  if (m !== null) out.pathMask = m;

  const s = params.get("s");
  if (s !== null) out.selectedNodeId = s;

  const c = params.get("c");
  if (c !== null && c.length === CLASS_ORDER.length) {
    const modes: ClassificationModes = { ...DEFAULT_CLASSIFICATION_MODES };
    for (let i = 0; i < CLASS_ORDER.length; i++) {
      const letter = c[i];
      if (!letter) continue;
      const mode = LETTER_MODE[letter];
      if (mode) {
        const cls = CLASS_ORDER[i];
        if (cls) modes[cls] = mode;
      }
    }
    out.classificationModes = modes;
  }

  const f = params.get("f");
  if (f !== null) {
    out.focusModeRoot = f;
    const fd = Number.parseInt(params.get("fd") ?? "", 10);
    if (Number.isFinite(fd)) out.focusModeDepth = fd;
  }

  if (params.get("col") === "1") out.collapseDirectories = true;
  if (params.get("ro") === "0") out.runtimeOnlyMetrics = false;
  const v = params.get("v");
  if (v === "3d") out.viewMode = "3d";
  else if (v === "detail") out.viewMode = "detail";

  return Object.keys(out).length > 0 ? out : null;
}
