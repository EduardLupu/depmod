"use client";

/**
 * Persistent user preferences. Lives in localStorage and is intentionally
 * decoupled from the volatile graph state; settings survive across reloads,
 * graph swaps, and route changes, while the store's view state resets.
 */
export interface Settings {
  /** Re-open the source viewer automatically when a node is selected. */
  codeViewerAutoOpen: boolean;
  /** Use the localStorage layout cache (skip fCoSE on re-mount). */
  layoutCacheEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  codeViewerAutoOpen: false,
  layoutCacheEnabled: true,
};

const KEY = "depmod-ui:settings:v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode / quota; silently give up. The defaults still apply at runtime.
  }
}
