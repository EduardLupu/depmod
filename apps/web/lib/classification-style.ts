import { CLASSIFICATION_COLORS } from "@/lib/colors";
import type { Classification } from "@depmod/types";

/** Cytoscape `node.shape` values; kept as strings so this module stays cytoscape-free. */
export type CytoscapeNodeShape =
  | "ellipse"
  | "rectangle"
  | "round-rectangle"
  | "diamond"
  | "round-hexagon"
  | "octagon"
  | "pentagon"
  | "vee";

export type CytoscapeBorderStyle = "solid" | "dashed" | "double" | "dotted";

export const CLASSIFICATION_CYTOSCAPE_SHAPES: Record<Classification, CytoscapeNodeShape> = {
  page: "round-rectangle",
  api: "diamond",
  hook: "round-hexagon",
  component: "vee",
  lib: "rectangle",
  test: "octagon",
  config: "pentagon",
};

export const CLASSIFICATION_BORDER_STYLE: Partial<Record<Classification, CytoscapeBorderStyle>> = {
  test: "dashed",
  hook: "double",
  // Dotted border lets config nodes echo the "test" stylistic cue (both are
  // off-by-default, support-role files) without colliding with its dashed look.
  config: "dotted",
};

export const CLASSIFICATION_ORDER: readonly Classification[] = [
  "page",
  "api",
  "hook",
  "component",
  "lib",
  "test",
  "config",
] as const;

export interface ClassificationStyle {
  color: string;
  shape: CytoscapeNodeShape;
  borderStyle?: CytoscapeBorderStyle;
}

export function getClassificationStyle(cls: Classification): ClassificationStyle {
  return {
    color: CLASSIFICATION_COLORS[cls],
    shape: CLASSIFICATION_CYTOSCAPE_SHAPES[cls],
    borderStyle: CLASSIFICATION_BORDER_STYLE[cls],
  };
}
