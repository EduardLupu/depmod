import { describe, expect, it } from "vitest";
import { filterTargets, validateTargets } from "../src/targets.js";

describe("validateTargets", () => {
  it("accepts a well-formed file", () => {
    const file = validateTargets({
      targets: [
        {
          name: "demo",
          repo: "https://github.com/acme/demo.git",
          ref: null,
          tier: "primary",
          subdir: "apps/web",
          description: "Example",
          cacheName: "demo-cache",
        },
      ],
    });
    expect(file.targets[0]?.subdir).toBe("apps/web");
    expect(file.targets[0]?.cacheName).toBe("demo-cache");
  });

  it("rejects duplicate names", () => {
    expect(() =>
      validateTargets({
        targets: [
          { name: "a", repo: "https://github.com/a/a.git", ref: null, tier: "primary" },
          { name: "a", repo: "https://github.com/b/b.git", ref: null, tier: "medium" },
        ],
      }),
    ).toThrow(/duplicate/);
  });

  it("rejects invalid repo URLs", () => {
    expect(() =>
      validateTargets({
        targets: [{ name: "x", repo: "not-a-url", ref: null, tier: "primary" }],
      }),
    ).toThrow(/repo must be/);
  });
});

describe("filterTargets", () => {
  const targets = validateTargets({
    targets: [
      { name: "a", repo: "https://github.com/a/a.git", ref: null, tier: "primary" },
      { name: "b", repo: "https://github.com/b/b.git", ref: null, tier: "medium" },
    ],
  }).targets;

  it("filters by name", () => {
    expect(filterTargets(targets, { only: new Set(["b"]), tier: null })).toHaveLength(1);
  });

  it("filters by tier", () => {
    expect(filterTargets(targets, { only: null, tier: "primary" })).toHaveLength(1);
  });
});
