"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_CLASSIFICATION_MODES } from "./classification-filters";
import { useGraphStore } from "./store";
import { type UrlState, decodeUrlState, encodeUrlState } from "./url-state";

/**
 * Two-way sync between the store and `window.location.hash`. On mount, parses
 * the hash and rehydrates whatever fields it carries. On every store change
 * thereafter, rewrites the hash so the URL reflects the current view.
 *
 * Uses `history.replaceState` (not `pushState`) so the back button doesn't
 * collect a new entry per filter tweak.
 */
export function useUrlStateSync(): void {
  const hydratedRef = useRef(false);

  // Hydrate from the hash on first mount, once a graph has loaded so that
  // selecting / filtering against missing nodes doesn't trash the URL state.
  const graphLoaded = useGraphStore((s) => s.graph !== null);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!graphLoaded) return;
    if (typeof window === "undefined") return;
    hydratedRef.current = true;
    const initial = decodeUrlState(window.location.hash);
    if (!initial) return;
    const store = useGraphStore.getState();
    if (initial.pathMask !== undefined) store.setPathMask(initial.pathMask);
    if (initial.selectedNodeId !== undefined) store.setSelection(initial.selectedNodeId);
    if (initial.classificationModes !== undefined) {
      store.setClassificationModes(initial.classificationModes);
    }
    if (initial.focusModeRoot !== undefined) {
      store.setFocusModeRoot(initial.focusModeRoot);
      if (initial.focusModeDepth !== undefined) store.setFocusModeDepth(initial.focusModeDepth);
    }
    if (initial.collapseDirectories !== undefined) {
      store.setCollapseDirectories(initial.collapseDirectories);
    }
    if (initial.runtimeOnlyMetrics !== undefined) {
      store.setRuntimeOnlyMetrics(initial.runtimeOnlyMetrics);
    }
    if (initial.viewMode !== undefined) store.setViewMode(initial.viewMode);
  }, [graphLoaded]);

  // Write-back: subscribe to the relevant slices and rewrite the hash when any
  // of them changes. Debounced via rAF so a burst of store updates (e.g. when
  // selecting a node also toggles blast radius internally) only writes once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const unsubscribe = useGraphStore.subscribe((state) => {
      if (!hydratedRef.current) return; // don't write before we've finished reading
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => writeHash(state));
    });
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, []);
}

function writeHash(state: {
  pathMask: string;
  selectedNodeId: string | null;
  classificationModes: UrlState["classificationModes"];
  focusModeRoot: string | null;
  focusModeDepth: number;
  collapseDirectories: boolean;
  runtimeOnlyMetrics: boolean;
  viewMode: "2d" | "3d" | "detail";
}): void {
  const encoded = encodeUrlState({
    pathMask: state.pathMask,
    selectedNodeId: state.selectedNodeId,
    classificationModes: state.classificationModes,
    focusModeRoot: state.focusModeRoot,
    focusModeDepth: state.focusModeDepth,
    collapseDirectories: state.collapseDirectories,
    runtimeOnlyMetrics: state.runtimeOnlyMetrics,
    viewMode: state.viewMode,
  });
  const next = encoded ? `#${encoded}` : "";
  if (next === window.location.hash) return;
  // Anchor the new hash without scrolling; replaceState is the right tool.
  const { pathname, search } = window.location;
  history.replaceState(history.state, "", `${pathname}${search}${next}`);
  // Anchor reference so the DEFAULT_CLASSIFICATION_MODES import isn't dropped
  // by the bundler; encodeUrlState reads them transitively.
  void DEFAULT_CLASSIFICATION_MODES;
}
