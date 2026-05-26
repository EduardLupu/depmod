import { describe, expect, it } from "vitest";
import { parseFailOn } from "../src/commands/check.js";

describe("parseFailOn", () => {
  it("defaults to cycles, dead-code, unused-deps when empty", () => {
    expect(parseFailOn(undefined)).toEqual({
      rules: ["cycles", "dead-code", "unused-deps"],
      thresholds: {},
    });
    expect(parseFailOn("")).toEqual({
      rules: ["cycles", "dead-code", "unused-deps"],
      thresholds: {},
    });
  });

  it("parses a single rule", () => {
    expect(parseFailOn("cycles")).toEqual({ rules: ["cycles"], thresholds: {} });
  });

  it("parses several rules", () => {
    expect(parseFailOn("cycles,dead-code")).toEqual({
      rules: ["cycles", "dead-code"],
      thresholds: {},
    });
  });

  it("parses instability:>N", () => {
    expect(parseFailOn("instability:>0.9")).toEqual({
      rules: ["instability"],
      thresholds: { instabilityMax: 0.9 },
    });
  });

  it("defaults instability threshold to 0.9 when no operand given", () => {
    expect(parseFailOn("instability")).toEqual({
      rules: ["instability"],
      thresholds: { instabilityMax: 0.9 },
    });
  });

  it("trims whitespace and skips empty tokens", () => {
    expect(parseFailOn(" cycles, , dead-code ")).toEqual({
      rules: ["cycles", "dead-code"],
      thresholds: {},
    });
  });

  it("rejects malformed instability threshold", () => {
    expect(() => parseFailOn("instability:>abc")).toThrow(/Invalid instability/);
    expect(() => parseFailOn("instability:>2")).toThrow(/Invalid instability/);
  });

  it("rejects unknown rule names", () => {
    expect(() => parseFailOn("not-a-rule")).toThrow(/Unknown check rule/);
  });
});
