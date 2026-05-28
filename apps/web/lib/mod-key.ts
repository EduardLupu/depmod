/** True when the host OS uses Cmd as the primary modifier (macOS / iOS). */
export function isMacPlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? navigator.platform : "",
): boolean {
  if (/Mac|iPhone|iPod|iPad/i.test(platform)) return true;
  if (/Mac OS X|Macintosh/i.test(userAgent)) return true;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const uaData = nav
    ? (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    : undefined;
  if (uaData?.platform === "macOS") return true;
  return false;
}

export function formatModShortcut(key: string, isMac: boolean): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

export function modKeyParts(
  key: string,
  isMac: boolean,
): { mod: string; key: string; joiner: "" | "+" } {
  return isMac ? { mod: "⌘", key, joiner: "" } : { mod: "Ctrl", key, joiner: "+" };
}
