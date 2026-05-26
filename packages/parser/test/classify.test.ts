import type { Classification } from "@depmod/types";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { classify } from "../src/classify.js";

function classifySource(relPath: string, code: string): Classification {
  const project = new Project();
  const sourceFile = project.createSourceFile(relPath, code, { overwrite: true });
  return classify(relPath, sourceFile);
}

describe("classify", () => {
  it("classifies hooks by filename use[A-Z]", () => {
    expect(classifySource("hooks/useUser.ts", "export const x = 1;")).toBe("hook");
  });

  it("classifies hooks by exported use[A-Z] name even when filename does not match", () => {
    expect(classifySource("lib/auth.ts", "export function useAuth() { return null; }")).toBe(
      "hook",
    );
  });

  it("classifies test paths as test before other roles", () => {
    expect(classifySource("lib/utils.test.ts", "export const x = 1;")).toBe("test");
  });

  it("does not classify lib exports useX as hook when file is a test", () => {
    expect(classifySource("hooks/useAuth.test.ts", "export function useAuth() {}")).toBe("test");
  });

  it("classifies *.config.ts as config", () => {
    expect(classifySource("vite.config.ts", "export default {};")).toBe("config");
    expect(classifySource("apps/web/next.config.js", "module.exports = {};")).toBe("config");
  });

  it("classifies files under a config/ directory as config", () => {
    expect(classifySource("config/build.ts", "export const x = 1;")).toBe("config");
    expect(classifySource("packages/foo/config/env.ts", "export const x = 1;")).toBe("config");
  });

  it("classifies *.d.ts declaration files as config", () => {
    expect(classifySource("next-env.d.ts", "export {};")).toBe("config");
    expect(classifySource("types/cytoscape-augment.d.ts", "export {};")).toBe("config");
  });

  it("classifies config before component / api / hook (config wins over heuristics)", () => {
    // A config file that happens to PascalCase-export should still be config.
    expect(classifySource("eslint.config.ts", "export const Rules = {};")).toBe("config");
    // A config file that exports a use[A-Z] identifier should still be config.
    expect(classifySource("vitest.config.ts", "export function useReporter() {}")).toBe("config");
  });

  it("test still wins over config when both match (test.config.ts is a test file)", () => {
    expect(classifySource("__tests__/foo.test.ts", "export const x = 1;")).toBe("test");
  });
});
