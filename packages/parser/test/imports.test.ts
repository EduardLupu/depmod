import { describe, expect, it } from "vitest";
import { packageNameOf } from "../src/imports.js";

describe("packageNameOf", () => {
  it("returns bare module name for scoped and unscoped packages", () => {
    expect(packageNameOf("react")).toBe("react");
    expect(packageNameOf("react-dom/client")).toBe("react-dom");
    expect(packageNameOf("@fanduel/ui")).toBe("@fanduel/ui");
    expect(packageNameOf("@fanduel/ui/button")).toBe("@fanduel/ui");
    expect(packageNameOf("@fanduel/ui/deep/path")).toBe("@fanduel/ui");
  });

  it("returns undefined for relative and absolute specifiers", () => {
    expect(packageNameOf("./foo")).toBeUndefined();
    expect(packageNameOf("../foo")).toBeUndefined();
    expect(packageNameOf("/abs")).toBeUndefined();
  });

  it("returns undefined for empty specifier", () => {
    expect(packageNameOf("")).toBeUndefined();
  });

  it("returns undefined for malformed scoped specifier", () => {
    expect(packageNameOf("@scope")).toBeUndefined();
  });

  it("preserves node: builtins as-is", () => {
    expect(packageNameOf("node:fs")).toBe("node:fs");
    expect(packageNameOf("node:fs/promises")).toBe("node:fs/promises");
  });
});
