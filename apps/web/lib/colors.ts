import type { Classification } from "@depmod/types";

/**
 * Single source of truth for classification colours. Kept in lock-step with the
 * `@theme` block in `app/globals.css`; change one, change both. Cytoscape can't
 * read CSS variables in its stylesheet, so hex values live here.
 */
export const CLASSIFICATION_COLORS: Record<Classification, string> = {
  page: "#4f7fdf",
  api: "#dc6555",
  hook: "#e0a955",
  component: "#5cb573",
  lib: "#7a8597",
  test: "#a78bfa",
  // Teal; distinct from the existing palette, reads as "tooling/infra".
  config: "#06b6d4",
} as const;

export const CANVAS_BG = "#0f0f0f";
export const NEUTRAL_EDGE = "#3a3a3a";
export const CYCLE_COLOR = "#ef4444";
export const SELECTED_COLOR = "#fbbf24";
export const BLAST_COLOR = "#f59e0b";
export const BLAST_BORDER = "#fcd34d";
export const COMPOUND_FILL = "#161616";
export const COMPOUND_BORDER = "#2a2a2a";
export const LABEL_COLOR = "#e5e5e5";
export const DIM_OPACITY = 0.12;
