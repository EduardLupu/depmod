"use client";

import { useEffect } from "react";
import { useGraphStore } from "./store";

/**
 * `c` toggles the code viewer pane. Ignored while typing in form fields or inside Monaco.
 */
export function useCodeViewerShortcut() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "c" && e.key !== "C") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      useGraphStore.getState().toggleCodeViewer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".monaco-editor")) return true;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
