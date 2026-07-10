"use client";

import { useEffect } from "react";
import { useGraphStore } from "./store";

/**
 * Keyboard shortcuts for focus mode:
 *
 *   - `f`           toggle focus mode on the current selection
 *   - `[` / `]`     decrease / increase depth in [1, 6]
 *
 * Ignored when the user is typing inside an editable target so the search box
 * doesn't fight the shortcut. Modifier keys are required to be off; `f` alone
 * is the trigger, not `Ctrl+f` (browser find) or `Cmd+f`.
 */
export function useFocusModeShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (useGraphStore.getState().viewMode === "detail") return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        useGraphStore.getState().toggleFocusModeForSelection();
      } else if (e.key === "[") {
        if (useGraphStore.getState().focusModeRoot === null) return;
        e.preventDefault();
        useGraphStore.getState().bumpFocusModeDepth(-1);
      } else if (e.key === "]") {
        if (useGraphStore.getState().focusModeRoot === null) return;
        e.preventDefault();
        useGraphStore.getState().bumpFocusModeDepth(+1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
