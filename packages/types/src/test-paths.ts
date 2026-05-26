/**
 * Heuristics for test / spec / mock / e2e paths. Shared by the parser
 * (parse-time exclude) and the dashboard (view-time hide).
 */
const TEST_PATTERNS: readonly RegExp[] = [
  /\.(test|spec|tests)\.(tsx?|jsx?|mjs|cjs)$/i,
  /\.(unit|integration|e2e|bench)\.(tsx?|jsx?)$/i,
  /\.(cy|stories)\.(tsx?|jsx?)$/i,
  /(^|\/)(__tests__|__mocks__|__snapshots__)(\/|$)/i,
  /(^|\/)(tests?|specs?|e2e|integration|unit-tests?)(\/|$)/i,
  /(^|\/)(test-utils?|testing-utils?|test-helpers?|test-support)(\/|$)/i,
  /(^|\/)vitest\.setup\./i,
  /(^|\/)jest\.setup\./i,
  /(^|\/)setupTests\./i,
  /\.mock\.(tsx?|jsx?)$/i,
  /\.snap$/i,
];

export function isTestFilePath(path: string): boolean {
  const normalised = path.replace(/\\/g, "/");
  return TEST_PATTERNS.some((re) => re.test(normalised));
}

/** Parse-time globs merged into file-filter when excludeTests is true. */
export const TEST_EXCLUDE_GLOBS = [
  "**/*.{test,spec,tests}.{ts,tsx,js,jsx,mjs,cjs}",
  "**/*.{unit,integration,e2e,bench}.{ts,tsx,js,jsx}",
  "**/*.{cy,stories}.{ts,tsx,js,jsx}",
  "**/*.mock.{ts,tsx,js,jsx}",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/__snapshots__/**",
  "**/test/**",
  "**/tests/**",
  "**/spec/**",
  "**/specs/**",
  "**/e2e/**",
  "**/integration/**",
  "**/unit-tests/**",
] as const;
