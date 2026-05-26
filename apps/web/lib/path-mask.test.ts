import { describe, expect, it } from "vitest";
import {
  isTestExcludeGlob,
  matchesPathMask,
  parsePathMask,
  stripTestExcludesFromMaskString,
} from "./path-mask";

describe("path-mask", () => {
  it("parses include and exclude segments", () => {
    expect(parsePathMask("*.tsx,!**/*.test.*")).toEqual({
      include: ["*.tsx"],
      exclude: ["**/*.test.*"],
    });
  });

  it("matches extension globs", () => {
    const mask = parsePathMask("*.tsx");
    expect(matchesPathMask("app/page.tsx", mask)).toBe(true);
    expect(matchesPathMask("lib/util.ts", mask)).toBe(false);
  });

  it("applies exclude after include", () => {
    const mask = parsePathMask("*.ts,!**/*.test.ts");
    expect(matchesPathMask("src/foo.ts", mask)).toBe(true);
    expect(matchesPathMask("src/foo.test.ts", mask)).toBe(false);
  });

  it("does not apply test excludes to classification=test nodes", () => {
    const mask = parsePathMask("*.tsx,!**/*.test.*");
    expect(matchesPathMask("src/foo.test.tsx", mask)).toBe(false);
    expect(matchesPathMask("src/foo.test.tsx", mask, { classification: "test" })).toBe(true);
    expect(matchesPathMask("src/__tests__/runner.tsx", mask, { classification: "test" })).toBe(
      true,
    );
  });

  it("detects test exclude globs", () => {
    expect(isTestExcludeGlob("**/*.test.*")).toBe(true);
    expect(isTestExcludeGlob("**/app/**")).toBe(false);
  });

  it("strips test excludes from mask string", () => {
    expect(stripTestExcludesFromMaskString("*.tsx,!**/*.test.*,!**/app/**")).toBe(
      "*.tsx,!**/app/**",
    );
  });
});
