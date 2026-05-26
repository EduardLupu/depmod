"use client";

import { useEffect } from "react";
import { useGraphStore } from "./store";

/**
 * Global `?` keyboard shortcut: toggles the Legend panel. Ignored when the user
 * is typing inside an <input>, <textarea>, or contenteditable region so the
 * search box doesn't fight the shortcut.
 *
 * `?` is Shift+/ on US layouts; we listen for the resulting "?" character
 * rather than the physical key so the binding is layout-agnostic.
 */
export function useLegendShortcut() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "?") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      // useGraphStore.setState is a stable module-level reference, so it
      // doesn't belong in the effect deps and reads fresh state every time.
      useGraphStore.setState((s) => ({ legendOpen: !s.legendOpen }));
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
