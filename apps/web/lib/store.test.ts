import type { Graph } from "@depmod/types";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CLASSIFICATION_MODES } from "./classification-filters";
import { useGraphStore } from "./store";

const fakeGraph: Graph = {
  schemaVersion: 1,
  generatedAt: "2026-05-17T00:00:00.000Z",
  rootDir: "/tmp/x",
  stats: { files: 0, nodes: 0, edges: 0, cycles: 0, parseMs: 0 },
  nodes: [],
  edges: [],
  cycles: [],
};

describe("useGraphStore", () => {
  beforeEach(() => {
    useGraphStore.getState().clear();
  });

  it("starts empty with tests hidden by default", () => {
    const state = useGraphStore.getState();
    expect(state.graph).toBeNull();
    expect(state.source).toBeNull();
    expect(state.selectedNodeId).toBeNull();
    expect(state.pathMask).toBe("");
    expect(state.classificationModes).toEqual(DEFAULT_CLASSIFICATION_MODES);
    expect(state.layoutRequestId).toBe(0);
  });

  it("setGraph stores both graph and source, and resets view state", () => {
    const store = useGraphStore.getState();
    store.setSelection("preexisting");
    store.setPathMask("foo");
    useGraphStore.getState().cycleClassification("page");

    store.setGraph(fakeGraph, { kind: "file", label: "x.json" });
    const next = useGraphStore.getState();
    expect(next.graph).toBe(fakeGraph);
    expect(next.source).toEqual({ kind: "file", label: "x.json" });
    expect(next.selectedNodeId).toBeNull();
    expect(next.pathMask).toBe("");
    expect(next.classificationModes).toEqual(DEFAULT_CLASSIFICATION_MODES);
  });

  it("cycleClassification advances neutral → dimmed → excluded → solo → neutral", () => {
    useGraphStore.getState().cycleClassification("hook");
    expect(useGraphStore.getState().classificationModes.hook).toBe("dimmed");
    useGraphStore.getState().cycleClassification("hook");
    expect(useGraphStore.getState().classificationModes.hook).toBe("excluded");
    useGraphStore.getState().cycleClassification("hook");
    expect(useGraphStore.getState().classificationModes.hook).toBe("solo");
    expect(useGraphStore.getState().classificationModes.page).toBe("neutral");
    useGraphStore.getState().cycleClassification("hook");
    expect(useGraphStore.getState().classificationModes.hook).toBe("neutral");
  });

  it("setSelection / setPathMask / resetView round-trip cleanly", () => {
    const store = useGraphStore.getState();
    store.setSelection("a.ts");
    store.setPathMask("src/**");
    store.cycleClassification("lib");
    expect(useGraphStore.getState().selectedNodeId).toBe("a.ts");
    expect(useGraphStore.getState().pathMask).toBe("src/**");

    store.resetView();
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().pathMask).toBe("");
    expect(useGraphStore.getState().classificationModes).toEqual(DEFAULT_CLASSIFICATION_MODES);
  });

  it("requestLayout increments the layoutRequestId monotonically", () => {
    const before = useGraphStore.getState().layoutRequestId;
    useGraphStore.getState().requestLayout();
    useGraphStore.getState().requestLayout();
    expect(useGraphStore.getState().layoutRequestId).toBe(before + 2);
  });

  it("clear resets to initial state", () => {
    useGraphStore.getState().setGraph(fakeGraph, { kind: "sample", label: "sample-app" });
    useGraphStore.getState().setSelection("a.ts");
    useGraphStore.getState().clear();
    expect(useGraphStore.getState().graph).toBeNull();
    expect(useGraphStore.getState().source).toBeNull();
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    expect(useGraphStore.getState().blastRadiusFor).toBeNull();
  });

  it("setBlastRadius pins the overlay to a specific node", () => {
    useGraphStore.getState().setBlastRadius("hooks/useUser.ts");
    expect(useGraphStore.getState().blastRadiusFor).toBe("hooks/useUser.ts");
    useGraphStore.getState().setBlastRadius(null);
    expect(useGraphStore.getState().blastRadiusFor).toBeNull();
  });

  it("toggleBlastRadiusForSelection enables when selection exists and clears on second press", () => {
    const store = useGraphStore.getState();
    store.setSelection("lib/utils.ts");
    store.toggleBlastRadiusForSelection();
    expect(useGraphStore.getState().blastRadiusFor).toBe("lib/utils.ts");
    useGraphStore.getState().toggleBlastRadiusForSelection();
    expect(useGraphStore.getState().blastRadiusFor).toBeNull();
  });

  it("changing selection clears the existing blast overlay", () => {
    const store = useGraphStore.getState();
    store.setSelection("lib/utils.ts");
    store.toggleBlastRadiusForSelection();
    expect(useGraphStore.getState().blastRadiusFor).toBe("lib/utils.ts");
    // Selecting a different node should drop the overlay (it was tied to the old id).
    useGraphStore.getState().setSelection("hooks/useUser.ts");
    expect(useGraphStore.getState().blastRadiusFor).toBeNull();
  });

  it("clearing selection resets detail view and overlays", () => {
    const store = useGraphStore.getState();
    store.setSelection("lib/utils.ts");
    store.setViewMode("detail");
    store.setFocusModeRoot("lib/utils.ts");
    store.setCodeViewerOpen(true);
    store.setFocusedCycle(0);

    store.setSelection(null);

    const next = useGraphStore.getState();
    expect(next.selectedNodeId).toBeNull();
    expect(next.viewMode).toBe("2d");
    expect(next.focusModeRoot).toBeNull();
    expect(next.blastRadiusFor).toBeNull();
    expect(next.codeViewerOpen).toBe(false);
    expect(next.focusedCycle).toBeNull();
  });

  it("toggleBlastRadiusForSelection is a no-op when no selection is set", () => {
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
    useGraphStore.getState().toggleBlastRadiusForSelection();
    expect(useGraphStore.getState().blastRadiusFor).toBeNull();
  });

  describe("cluster collapse", () => {
    it("starts disabled", () => {
      expect(useGraphStore.getState().collapseDirectories).toBe(false);
    });

    it("setCollapseDirectories flips the flag", () => {
      useGraphStore.getState().setCollapseDirectories(true);
      expect(useGraphStore.getState().collapseDirectories).toBe(true);
      useGraphStore.getState().setCollapseDirectories(false);
      expect(useGraphStore.getState().collapseDirectories).toBe(false);
    });

    it("preserves the user's preference across setGraph", () => {
      useGraphStore.getState().setCollapseDirectories(true);
      useGraphStore.getState().setGraph(fakeGraph, { kind: "file", label: "x.json" });
      expect(useGraphStore.getState().collapseDirectories).toBe(true);
    });

    it("resets to false on clear()", () => {
      useGraphStore.getState().setCollapseDirectories(true);
      useGraphStore.getState().clear();
      expect(useGraphStore.getState().collapseDirectories).toBe(false);
    });
  });

  describe("directory tree sidebar", () => {
    it("starts visible with no focused directory", () => {
      expect(useGraphStore.getState().directoryTreeOpen).toBe(true);
      expect(useGraphStore.getState().focusedDirectory).toBeNull();
    });

    it("setDirectoryTreeOpen flips the flag", () => {
      useGraphStore.getState().setDirectoryTreeOpen(false);
      expect(useGraphStore.getState().directoryTreeOpen).toBe(false);
    });

    it("setFocusedDirectory normalises empty string to null", () => {
      useGraphStore.getState().setFocusedDirectory("apps/web");
      expect(useGraphStore.getState().focusedDirectory).toBe("apps/web");
      useGraphStore.getState().setFocusedDirectory("");
      expect(useGraphStore.getState().focusedDirectory).toBeNull();
    });

    it("clears focused directory on setGraph (path may not apply to the new graph)", () => {
      useGraphStore.getState().setFocusedDirectory("apps/web");
      useGraphStore.getState().setGraph(fakeGraph, { kind: "file", label: "x.json" });
      expect(useGraphStore.getState().focusedDirectory).toBeNull();
    });

    it("preserves directoryTreeOpen across setGraph as a user preference", () => {
      useGraphStore.getState().setDirectoryTreeOpen(false);
      useGraphStore.getState().setGraph(fakeGraph, { kind: "file", label: "x.json" });
      expect(useGraphStore.getState().directoryTreeOpen).toBe(false);
    });
  });

  describe("focus mode", () => {
    it("starts disabled at the default depth", () => {
      expect(useGraphStore.getState().focusModeRoot).toBeNull();
      expect(useGraphStore.getState().focusModeDepth).toBe(2);
    });

    it("setFocusModeRoot toggles between an id and null", () => {
      useGraphStore.getState().setFocusModeRoot("lib/utils.ts");
      expect(useGraphStore.getState().focusModeRoot).toBe("lib/utils.ts");
      useGraphStore.getState().setFocusModeRoot(null);
      expect(useGraphStore.getState().focusModeRoot).toBeNull();
    });

    it("setFocusModeDepth clamps to [1, 6]", () => {
      useGraphStore.getState().setFocusModeDepth(0);
      expect(useGraphStore.getState().focusModeDepth).toBe(1);
      useGraphStore.getState().setFocusModeDepth(99);
      expect(useGraphStore.getState().focusModeDepth).toBe(6);
      useGraphStore.getState().setFocusModeDepth(3);
      expect(useGraphStore.getState().focusModeDepth).toBe(3);
    });

    it("toggleFocusModeForSelection requires a selection", () => {
      useGraphStore.getState().toggleFocusModeForSelection();
      expect(useGraphStore.getState().focusModeRoot).toBeNull();
    });

    it("toggleFocusModeForSelection switches on, then off on second press", () => {
      const store = useGraphStore.getState();
      store.setSelection("hooks/useUser.ts");
      store.toggleFocusModeForSelection();
      expect(useGraphStore.getState().focusModeRoot).toBe("hooks/useUser.ts");
      useGraphStore.getState().toggleFocusModeForSelection();
      expect(useGraphStore.getState().focusModeRoot).toBeNull();
    });

    it("bumpFocusModeDepth is a no-op when focus is off", () => {
      useGraphStore.getState().bumpFocusModeDepth(+1);
      expect(useGraphStore.getState().focusModeDepth).toBe(2);
    });

    it("bumpFocusModeDepth respects clamping when focus is on", () => {
      const store = useGraphStore.getState();
      store.setFocusModeRoot("lib/utils.ts");
      store.bumpFocusModeDepth(+99);
      expect(useGraphStore.getState().focusModeDepth).toBe(6);
      useGraphStore.getState().bumpFocusModeDepth(-99);
      expect(useGraphStore.getState().focusModeDepth).toBe(1);
    });

    it("clears the focus root on setGraph (id may not exist in the new graph)", () => {
      const store = useGraphStore.getState();
      store.setSelection("a.ts");
      store.toggleFocusModeForSelection();
      expect(useGraphStore.getState().focusModeRoot).toBe("a.ts");
      store.setGraph(fakeGraph, { kind: "file", label: "x.json" });
      expect(useGraphStore.getState().focusModeRoot).toBeNull();
    });
  });

  describe("legendOpen", () => {
    it("starts closed", () => {
      expect(useGraphStore.getState().legendOpen).toBe(false);
    });

    it("setLegendOpen flips the flag", () => {
      useGraphStore.getState().setLegendOpen(true);
      expect(useGraphStore.getState().legendOpen).toBe(true);
      useGraphStore.getState().setLegendOpen(false);
      expect(useGraphStore.getState().legendOpen).toBe(false);
    });
  });

  describe("runtimeOnlyMetrics", () => {
    it("defaults to true so the Inspector starts in runtime-only mode", () => {
      expect(useGraphStore.getState().runtimeOnlyMetrics).toBe(true);
    });

    it("setRuntimeOnlyMetrics flips between the two metric views", () => {
      const store = useGraphStore.getState();
      store.setRuntimeOnlyMetrics(false);
      expect(useGraphStore.getState().runtimeOnlyMetrics).toBe(false);
      store.setRuntimeOnlyMetrics(true);
      expect(useGraphStore.getState().runtimeOnlyMetrics).toBe(true);
    });

    it("survives setGraph (treated as a user preference)", () => {
      useGraphStore.getState().setRuntimeOnlyMetrics(false);
      useGraphStore.getState().setGraph(fakeGraph, { kind: "file", label: "x.json" });
      expect(useGraphStore.getState().runtimeOnlyMetrics).toBe(false);
    });

    it("resets to the runtime-only default on clear()", () => {
      useGraphStore.getState().setRuntimeOnlyMetrics(false);
      useGraphStore.getState().clear();
      expect(useGraphStore.getState().runtimeOnlyMetrics).toBe(true);
    });
  });
});
