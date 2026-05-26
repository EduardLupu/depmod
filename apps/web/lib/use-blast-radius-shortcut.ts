"use client";

import { useEffect } from "react";
import { useGraphStore } from "./store";

/**
 * `b` toggles the blast-radius overlay for the currently selected node. Ignored
 * while typing in form fields or when a modifier is held (so Cmd/Ctrl+B browser
 * shortcuts still work).
 */
export function useBlastRadiusShortcut() {
  const toggle = useGraphStore((s) => s.toggleBlastRadiusForSelection);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "b" && e.key !== "B") return;
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
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
