/**
 * Heuristics for configuration files (build tooling, type declarations,
 * config directories). Mirrors test-paths.ts in shape: a regex set used by
 * the parser to assign the `config` classification, plus a glob list for
 * any future "exclude configs at parse-time" toggle.
 *
 * What counts as "config":
 *   - `*.config.{ts,tsx,js,jsx,mjs,cjs}`; vite/next/tailwind/eslint/
 *     vitest/jest/postcss/playwright/etc. config modules.
 *   - Files under any `config/` directory.
 *   - `*.d.ts` type-declaration files (next-env.d.ts, vite-env.d.ts, custom
 *     augments). These are pure type-level and behave more like config than
 *     runtime code.
 *   - Bare `tsconfig.*.ts` wrappers (rare, but possible).
 */
const CONFIG_PATTERNS: readonly RegExp[] = [
  /\.config\.(tsx?|jsx?|mjs|cjs)$/i,
  /(^|\/)config(\/|$)/i,
  /\.d\.ts$/i,
  /(^|\/)tsconfig\.[A-Za-z0-9_.-]+\.ts$/i,
];

export function isConfigFilePath(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return CONFIG_PATTERNS.some((re) => re.test(normalised));
}

/** Parse-time globs for any future excludeConfigs option (mirrors TEST_EXCLUDE_GLOBS). */
export const CONFIG_EXCLUDE_GLOBS = [
  "**/*.config.{ts,tsx,js,jsx,mjs,cjs}",
  "**/config/**",
  "**/*.d.ts",
  "**/tsconfig.*.ts",
] as const;
