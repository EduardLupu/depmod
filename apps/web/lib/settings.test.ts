import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

/**
 * Minimal in-memory Storage shim so the test can run under the default Node
 * vitest environment (no jsdom/happy-dom available in this workspace).
 */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, String(v));
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => {
      data.clear();
    },
  };
}

// We monkey-patch `globalThis.window` in this test file so the settings module
// (which is browser-only) can be exercised under the default Node vitest
// environment. Casting via `unknown` so TS doesn't demand the full `Window`
// surface; the production code only touches `window.localStorage`.
type FakeWindow = { localStorage: Storage };
const g = globalThis as unknown as { window: FakeWindow | undefined };

describe("settings persistence", () => {
  beforeEach(() => {
    g.window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    g.window = undefined;
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges stored values over defaults", () => {
    g.window?.localStorage.setItem(
      "depmod-ui:settings:v1",
      JSON.stringify({ codeViewerAutoOpen: true }),
    );
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, codeViewerAutoOpen: true });
  });

  it("round-trips saveSettings -> loadSettings", () => {
    saveSettings({ ...DEFAULT_SETTINGS, layoutCacheEnabled: false });
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, layoutCacheEnabled: false });
  });

  it("falls back to defaults on corrupted storage", () => {
    g.window?.localStorage.setItem("depmod-ui:settings:v1", "not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("treats absent window (SSR) as defaults", () => {
    g.window = undefined;
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
