import { describe, expect, it } from "vitest";
import { formatModShortcut, isMacPlatform, modKeyParts } from "./mod-key";

describe("isMacPlatform", () => {
  it("detects macOS from platform", () => {
    expect(isMacPlatform("", "MacIntel")).toBe(true);
  });

  it("detects macOS from user agent", () => {
    expect(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "")).toBe(true);
  });

  it("detects Windows", () => {
    expect(isMacPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")).toBe(false);
  });
});

describe("formatModShortcut", () => {
  it("uses Cmd on macOS", () => {
    expect(formatModShortcut("K", true)).toBe("⌘K");
  });

  it("uses Ctrl on other platforms", () => {
    expect(formatModShortcut("K", false)).toBe("Ctrl+K");
  });
});

describe("modKeyParts", () => {
  it("splits macOS shortcut parts", () => {
    expect(modKeyParts("K", true)).toEqual({ mod: "⌘", key: "K", joiner: "" });
  });

  it("splits Windows shortcut parts", () => {
    expect(modKeyParts("K", false)).toEqual({ mod: "Ctrl", key: "K", joiner: "+" });
  });
});
