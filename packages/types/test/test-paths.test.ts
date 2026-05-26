import { describe, expect, it } from "vitest";
import { isTestFilePath } from "../src/test-paths.js";

describe("isTestFilePath", () => {
  it("detects common test layouts", () => {
    expect(isTestFilePath("src/foo.test.ts")).toBe(true);
    expect(isTestFilePath("src/foo.spec.tsx")).toBe(true);
    expect(isTestFilePath("src/__tests__/bar.ts")).toBe(true);
    expect(isTestFilePath("e2e/login.spec.ts")).toBe(true);
    expect(isTestFilePath("src/setupTests.ts")).toBe(true);
    expect(isTestFilePath("vitest.config.ts")).toBe(false);
  });

  it("allows production modules", () => {
    expect(isTestFilePath("app/page.tsx")).toBe(false);
    expect(isTestFilePath("lib/utils.ts")).toBe(false);
  });
});
