"use client";

import { useEffect } from "react";
import { useGraphStore } from "./store";

/**
 * `t` toggles the React Flow subtree detail view for the current selection.
 * Ignored while typing in form fields or inside Monaco.
 */
export function useDetailViewShortcut() {
  const toggle = useGraphStore((s) => s.toggleDetailViewForSelection);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "t" && e.key !== "T") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".monaco-editor")) return true;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
