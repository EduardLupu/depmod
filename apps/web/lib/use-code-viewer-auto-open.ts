"use client";

import { useEffect, useRef } from "react";
import { useGraphStore } from "./store";
import { useSettings } from "./use-settings";

/**
 * When the `codeViewerAutoOpen` setting is on, opening a fresh selection also
 * opens the source-code pane. Mirrors the pre-Phase-1 behaviour as an opt-in.
 *
 * Implemented as a hook (rather than a store middleware) so it can read user
 * settings without coupling the store to localStorage.
 */
export function useCodeViewerAutoOpen(): void {
  const { settings } = useSettings();
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const prevIdRef = useRef<string | null>(selectedNodeId);

  useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = selectedNodeId;
    if (!settings.codeViewerAutoOpen) return;
    // Only fire on actual *change* to a non-null selection; don't keep
    // re-opening the viewer on every settings refresh.
    if (selectedNodeId === null) return;
    if (selectedNodeId === prev) return;
    useGraphStore.getState().setCodeViewerOpen(true);
  }, [selectedNodeId, settings.codeViewerAutoOpen]);
}
