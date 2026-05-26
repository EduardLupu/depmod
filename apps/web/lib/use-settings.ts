"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from "./settings";

/**
 * Tiny hook around localStorage-backed settings. Re-renders the caller when
 * any field changes and persists every update. Reads on mount only; SSR
 * always sees the defaults so the initial paint is stable.
 */
export function useSettings(): {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, setSetting };
}
