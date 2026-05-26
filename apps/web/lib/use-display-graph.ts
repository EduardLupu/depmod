"use client";

import { useGraphStore } from "@/lib/store";
import { filterGraphView } from "@/lib/view-graph";
import type { Graph } from "@depmod/types";
import { useMemo } from "react";

/** Canonical graph after view-time filters. */
export function useDisplayGraph(): Graph | null {
  const graph = useGraphStore((s) => s.graph);
  const viewFilters = useGraphStore((s) => s.viewFilters);
  return useMemo(() => (graph ? filterGraphView(graph, viewFilters) : null), [graph, viewFilters]);
}
