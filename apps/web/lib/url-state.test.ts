import { describe, expect, it } from "vitest";
import { DEFAULT_CLASSIFICATION_MODES } from "./classification-filters";
import { type UrlState, decodeUrlState, encodeUrlState } from "./url-state";

function defaults(): UrlState {
  return {
    pathMask: "",
    selectedNodeId: null,
    classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
    focusModeRoot: null,
    focusModeDepth: 2,
    collapseDirectories: false,
    runtimeOnlyMetrics: true,
    viewMode: "2d",
  };
}

describe("encodeUrlState", () => {
  it("emits empty string when every field matches defaults", () => {
    expect(encodeUrlState(defaults())).toBe("");
  });

  it("emits only the fields that diverge from defaults", () => {
    const out = encodeUrlState({ ...defaults(), pathMask: "*.tsx" });
    // URLSearchParams leaves `*` un-encoded (RFC 3986 reserved char that's
    // safe inside query strings); assert via decoded value.
    expect(new URLSearchParams(out).get("m")).toBe("*.tsx");
    expect(new URLSearchParams(out).get("s")).toBeNull();
  });

  it("encodes selection + collapse", () => {
    const params = new URLSearchParams(
      encodeUrlState({
        ...defaults(),
        selectedNodeId: "src/a.ts",
        collapseDirectories: true,
      }),
    );
    expect(params.get("s")).toBe("src/a.ts");
    expect(params.get("col")).toBe("1");
  });

  it("encodes focus root + depth together", () => {
    const params = new URLSearchParams(
      encodeUrlState({ ...defaults(), focusModeRoot: "src/x.ts", focusModeDepth: 3 }),
    );
    expect(params.get("f")).toBe("src/x.ts");
    expect(params.get("fd")).toBe("3");
  });

  it("encodes classification modes as a 7-letter string when non-default", () => {
    const state = defaults();
    state.classificationModes = { ...state.classificationModes, lib: "solo", page: "dimmed" };
    const params = new URLSearchParams(encodeUrlState(state));
    expect(params.get("c")?.length).toBe(7);
  });
});

describe("decodeUrlState", () => {
  it("returns null on empty input", () => {
    expect(decodeUrlState("")).toBeNull();
    expect(decodeUrlState("#")).toBeNull();
  });

  it("round-trips a non-default state", () => {
    const state = defaults();
    state.pathMask = "*.tsx,!**/*.test.*";
    state.selectedNodeId = "src/a.ts";
    state.focusModeRoot = "src/b.ts";
    state.focusModeDepth = 4;
    state.collapseDirectories = true;
    state.runtimeOnlyMetrics = false;
    state.classificationModes = { ...state.classificationModes, lib: "solo" };

    const encoded = encodeUrlState(state);
    const decoded = decodeUrlState(`#${encoded}`);
    expect(decoded).toMatchObject({
      pathMask: state.pathMask,
      selectedNodeId: state.selectedNodeId,
      focusModeRoot: state.focusModeRoot,
      focusModeDepth: state.focusModeDepth,
      collapseDirectories: true,
      runtimeOnlyMetrics: false,
    });
    expect(decoded?.classificationModes?.lib).toBe("solo");
  });

  it("ignores malformed classification string", () => {
    const decoded = decodeUrlState("#c=xxx");
    expect(decoded?.classificationModes).toBeUndefined();
  });
});
