// Comma-separated path masks for the toolbar filter (globs, ! prefix excludes).

import type { Classification } from "@depmod/types";

export interface PathMask {
  include: string[];
  exclude: string[];
}

/** Exclude globs that target test/spec/mock paths (aligned with toolbar presets). */
// CAN BE ADJUSTED/MODIFIED, MAKE SURE TO ALSO ADJUST TESTS AND PRESETS
const TEST_EXCLUDE_GLOB =
  /(\.test\.|\.spec\.|\.tests\.|__tests__|__mocks__|__snapshots__|\/tests?\/|\/specs?\/|\.mock\.|\.cy\.|\.stories\.)/i;

/** Exclude globs that target config / build-tooling paths (aligned with isConfigFilePath). */
const CONFIG_EXCLUDE_GLOB = /(\.config\.|\/config\/|\.d\.ts|tsconfig\.[^/]+\.ts)/i;

export function isTestExcludeGlob(pattern: string): boolean {
  return TEST_EXCLUDE_GLOB.test(pattern.replace(/\\/g, "/"));
}

export function isConfigExcludeGlob(pattern: string): boolean {
  return CONFIG_EXCLUDE_GLOB.test(pattern.replace(/\\/g, "/"));
}

/** Remove `!…` test-related excludes so parsed test nodes can appear on the canvas. */
export function stripTestExcludesFromMaskString(input: string): string {
  const parts: string[] = [];
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith("!") && isTestExcludeGlob(part.slice(1).trim())) continue;
    parts.push(part);
  }
  return parts.join(",");
}

/** Remove `!…` config-related excludes so parsed config nodes can appear on the canvas. */
export function stripConfigExcludesFromMaskString(input: string): string {
  const parts: string[] = [];
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith("!") && isConfigExcludeGlob(part.slice(1).trim())) continue;
    parts.push(part);
  }
  return parts.join(",");
}

export function parsePathMask(input: string): PathMask {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith("!")) exclude.push(part.slice(1).trim());
    else include.push(part);
  }
  return { include, exclude };
}

export interface PathMaskMatchOptions {
  /**
   * When `test` (or `config`), path-mask excludes targeting that
   * classification's typical paths are ignored; the user is expected to use
   * the toolbar pill to show/hide those nodes instead.
   */
  classification?: Classification;
}

/** True when the node id matches the mask (empty mask = match all). */
export function matchesPathMask(
  nodeId: string,
  mask: PathMask,
  options?: PathMaskMatchOptions,
): boolean {
  const path = nodeId.replace(/\\/g, "/");
  const excludes =
    options?.classification === "test"
      ? mask.exclude.filter((p) => !isTestExcludeGlob(p))
      : options?.classification === "config"
        ? mask.exclude.filter((p) => !isConfigExcludeGlob(p))
        : mask.exclude;
  if (excludes.some((p) => globMatch(path, p))) return false;
  if (mask.include.length === 0) return true;
  return mask.include.some((p) => globMatch(path, p));
}

function globMatch(path: string, pattern: string): boolean {
  const norm = pattern.replace(/\\/g, "/");
  if (norm.includes("**")) {
    const escaped = norm
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "§§")
      .replace(/\*/g, "[^/]*")
      .replace(/§§/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`, "i").test(path);
  }
  if (norm.startsWith("*.")) {
    return path.toLowerCase().endsWith(norm.slice(1).toLowerCase());
  }
  if (norm.endsWith("/**")) {
    const prefix = norm.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (norm.includes("*")) {
    const escaped = norm
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`, "i").test(path);
  }
  return path === norm || path.endsWith(`/${norm}`) || path.includes(`/${norm}/`);
}

/**
 * Suggestions surfaced by the toolbar's path-mask input. The `<datalist>` shows
 * the mask string itself; the `label` is unused by the datalist (browsers only
 * render the value) but kept here for documentation. The drop-down `<select>`
 * was removed in PREVIOUS phases of implementation to avoid the duplicate UI surface; these are typeahead
 * hints only.
 */
export const PATH_MASK_PRESETS: ReadonlyArray<{ id: string; label: string; mask: string }> = [
  { id: "all", label: "All files", mask: "" },
  {
    id: "prod-tsx",
    label: "TSX/TS (no tests)",
    mask: "*.tsx,*.ts,!**/*.test.*,!**/*.spec.*,!**/__tests__/**",
  },
  { id: "app-src", label: "src/ only", mask: "src/**" },
  { id: "pages", label: "Pages & routes", mask: "**/app/**,**/pages/**" },
  { id: "api-routes", label: "API routes", mask: "**/api/**,**/app/api/**" },
  { id: "components", label: "Components", mask: "**/components/**" },
  { id: "hooks", label: "Hooks", mask: "**/hooks/**,**/use-*.ts*" },
  { id: "lib", label: "lib/ utilities", mask: "**/lib/**,**/utils/**" },
  { id: "tests-only", label: "Tests only", mask: "**/*.test.*,**/*.spec.*,**/__tests__/**" },
  {
    id: "no-stories",
    label: "Exclude storybook & snapshots",
    mask: "!**/*.stories.*,!**/__snapshots__/**,!**/.storybook/**",
  },
  {
    id: "types-only",
    label: ".d.ts only",
    mask: "**/*.d.ts",
  },
  {
    id: "no-generated",
    label: "Exclude generated/build",
    mask: "!**/dist/**,!**/build/**,!**/.next/**,!**/coverage/**",
  },
];
