"use client";

import type { Classification, Graph } from "@depmod/types";
import { create } from "zustand";
import {
  type ClassificationModes,
  DEFAULT_CLASSIFICATION_MODES,
  cycleClassificationMode,
} from "./classification-filters";
import { FOCUS_MODE_DEFAULT_DEPTH, clampFocusDepth } from "./focus-mode";
import { DEFAULT_VIEW_FILTERS, type ViewFilters, cycleDirectoryVisibility } from "./view-graph";

export interface GraphSource {
  /** Display label shown in the header (filename or sample id). */
  label: string;
  /** "file" when loaded via picker / drag-drop; "sample" when loaded from /samples/. */
  kind: "file" | "sample";
}

interface GraphState {
  graph: Graph | null;
  source: GraphSource | null;
  selectedNodeId: string | null;
  classificationModes: ClassificationModes;
  /** Comma-separated path mask (globs, `!` excludes). See path-mask.ts. */
  pathMask: string;
  /** Incremented whenever the toolbar requests a fresh layout pass. */
  layoutRequestId: number;
  /** Node id for which the blast-radius (reverse-BFS) overlay is active. */
  blastRadiusFor: string | null;
  runtimeOnlyMetrics: boolean;
  legendOpen: boolean;
  focusModeRoot: string | null;
  focusModeDepth: number;
  focusedDirectory: string | null;
  directoryTreeOpen: boolean;
  collapseDirectories: boolean;
  viewFilters: ViewFilters;
  codeViewerOpen: boolean;
  /**
   * Watch status surfaced in the status bar. `null` when the SPA isn't hosted
   * by `depmod-ui --watch`; `"watching"` when the SSE channel is open;
   * briefly `"reloading"` when a reanalyzed event is in flight.
   */
  watchStatus: "watching" | "reloading" | null;
  /**
   * Which canvas renderer is active. Default `"2d"` (Cytoscape full graph).
   * `"3d"` swaps in the three.js force-graph. `"detail"` switches to a React
   * Flow hierarchical view of the selected node's outgoing subtree (BFS); reuses
   * `selectedNodeId` as the root, so picking a node anywhere in the
   * UI re-renders the detail view rooted at that node.
   */
  viewMode: "2d" | "3d" | "detail";
  /**
   * When set, isolates the named cycle (index into `graph.cycles`). Both
   * canvases hide every other node and highlight the cycle's edges.
   * Cleared automatically when the graph changes.
   */
  focusedCycle: number | null;
  setGraph: (graph: Graph, source: GraphSource) => void;
  clear: () => void;
  setSelection: (id: string | null) => void;
  cycleClassification: (cls: Classification) => void;
  setClassificationModes: (modes: ClassificationModes) => void;
  setPathMask: (mask: string) => void;
  resetView: () => void;
  requestLayout: () => void;
  setBlastRadius: (id: string | null) => void;
  toggleBlastRadiusForSelection: () => void;
  setRuntimeOnlyMetrics: (runtimeOnly: boolean) => void;
  setLegendOpen: (open: boolean) => void;
  setFocusModeRoot: (rootId: string | null) => void;
  setFocusModeDepth: (depth: number) => void;
  toggleFocusModeForSelection: () => void;
  bumpFocusModeDepth: (delta: number) => void;
  setFocusedDirectory: (path: string | null) => void;
  setDirectoryTreeOpen: (open: boolean) => void;
  setCollapseDirectories: (collapsed: boolean) => void;
  setCodeViewerOpen: (open: boolean) => void;
  toggleCodeViewer: () => void;
  toggleDetailViewForSelection: () => void;
  setWatchStatus: (status: "watching" | "reloading" | null) => void;
  setViewMode: (mode: "2d" | "3d" | "detail") => void;
  setFocusedCycle: (index: number | null) => void;
  cycleDirectoryFilter: (path: string) => void;
  clearDirectoryFilters: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  source: null,
  selectedNodeId: null,
  classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
  pathMask: "",
  layoutRequestId: 0,
  blastRadiusFor: null,
  runtimeOnlyMetrics: true,
  legendOpen: false,
  focusModeRoot: null,
  focusModeDepth: FOCUS_MODE_DEFAULT_DEPTH,
  focusedDirectory: null,
  directoryTreeOpen: true,
  collapseDirectories: false,
  viewFilters: DEFAULT_VIEW_FILTERS,
  codeViewerOpen: false,
  watchStatus: null,
  viewMode: "2d",
  focusedCycle: null,
  setGraph: (graph, source) =>
    set((state) => ({
      graph,
      source,
      selectedNodeId: null,
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
      pathMask: "",
      layoutRequestId: 0,
      blastRadiusFor: null,
      runtimeOnlyMetrics: state.runtimeOnlyMetrics,
      focusModeRoot: null,
      focusModeDepth: state.focusModeDepth,
      focusedDirectory: null,
      directoryTreeOpen: state.directoryTreeOpen,
      collapseDirectories: state.collapseDirectories,
      viewFilters: DEFAULT_VIEW_FILTERS,
      focusedCycle: null,
    })),
  clear: () =>
    set({
      graph: null,
      source: null,
      selectedNodeId: null,
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
      pathMask: "",
      layoutRequestId: 0,
      blastRadiusFor: null,
      runtimeOnlyMetrics: true,
      focusModeRoot: null,
      focusModeDepth: FOCUS_MODE_DEFAULT_DEPTH,
      focusedDirectory: null,
      directoryTreeOpen: true,
      collapseDirectories: false,
      viewFilters: DEFAULT_VIEW_FILTERS,
      codeViewerOpen: false,
      focusedCycle: null,
    }),
  setSelection: (id) =>
    set((state) => {
      if (id === null) {
        return {
          selectedNodeId: null,
          blastRadiusFor: null,
          focusModeRoot: null,
          focusedCycle: null,
          viewMode: "2d",
          codeViewerOpen: false,
        };
      }
      return {
        selectedNodeId: id,
        blastRadiusFor: id === state.blastRadiusFor ? state.blastRadiusFor : null,
      };
    }),
  setCodeViewerOpen: (open) => set({ codeViewerOpen: open }),
  toggleCodeViewer: () => set((state) => ({ codeViewerOpen: !state.codeViewerOpen })),
  toggleDetailViewForSelection: () =>
    set((state) => {
      if (state.viewMode === "detail") return { viewMode: "2d" };
      if (!state.selectedNodeId) return {};
      return { viewMode: "detail", focusModeRoot: null };
    }),
  setWatchStatus: (status) => set({ watchStatus: status }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFocusedCycle: (index) => set({ focusedCycle: index }),
  cycleClassification: (cls) =>
    set((state) => {
      const nextMode = cycleClassificationMode(state.classificationModes[cls]);
      const classificationModes = { ...state.classificationModes, [cls]: nextMode };
      if (nextMode === "solo") {
        for (const key of Object.keys(classificationModes) as Classification[]) {
          if (key !== cls && classificationModes[key] === "solo") {
            classificationModes[key] = "neutral";
          }
        }
      }
      return { classificationModes };
    }),
  setClassificationModes: (modes) => set({ classificationModes: modes }),
  setPathMask: (mask) => set({ pathMask: mask }),
  resetView: () =>
    set((state) => ({
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
      pathMask: "",
      selectedNodeId: null,
      blastRadiusFor: null,
      viewFilters: { ...state.viewFilters, directoryByPath: {} },
    })),
  requestLayout: () => set((state) => ({ layoutRequestId: state.layoutRequestId + 1 })),
  setBlastRadius: (id) => set({ blastRadiusFor: id }),
  toggleBlastRadiusForSelection: () =>
    set((state) => ({
      blastRadiusFor:
        state.blastRadiusFor && state.blastRadiusFor === state.selectedNodeId
          ? null
          : state.selectedNodeId,
    })),
  setRuntimeOnlyMetrics: (runtimeOnly) => set({ runtimeOnlyMetrics: runtimeOnly }),
  setLegendOpen: (open) => set({ legendOpen: open }),
  setFocusModeRoot: (rootId) => set({ focusModeRoot: rootId }),
  setFocusModeDepth: (depth) => set({ focusModeDepth: clampFocusDepth(depth) }),
  toggleFocusModeForSelection: () =>
    set((state) => {
      if (state.viewMode === "detail") return {};
      return {
        focusModeRoot:
          state.focusModeRoot !== null && state.focusModeRoot === state.selectedNodeId
            ? null
            : state.selectedNodeId,
      };
    }),
  bumpFocusModeDepth: (delta) =>
    set((state) => {
      if (state.focusModeRoot === null) return {};
      return { focusModeDepth: clampFocusDepth(state.focusModeDepth + delta) };
    }),
  setFocusedDirectory: (path) =>
    set({ focusedDirectory: path === null || path === "" ? null : path }),
  setDirectoryTreeOpen: (open) => set({ directoryTreeOpen: open }),
  setCollapseDirectories: (collapsed) => set({ collapseDirectories: collapsed }),
  cycleDirectoryFilter: (path) =>
    set((state) => {
      const current = state.viewFilters.directoryByPath[path] ?? "neutral";
      const next = cycleDirectoryVisibility(current);
      const directoryByPath = { ...state.viewFilters.directoryByPath };
      if (next === "neutral") {
        delete directoryByPath[path];
      } else {
        directoryByPath[path] = next;
      }
      return { viewFilters: { ...state.viewFilters, directoryByPath } };
    }),
  clearDirectoryFilters: () => set({ viewFilters: DEFAULT_VIEW_FILTERS }),
}));
