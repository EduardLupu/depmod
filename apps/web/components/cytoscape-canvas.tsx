"use client";

import { type BlastRadius, computeBlastRadius } from "@/lib/blast-radius";
import { registerCy, unregisterCy } from "@/lib/canvas-ref";
import { getSoloClassification } from "@/lib/classification-filters";
import type { ClassificationModes } from "@/lib/classification-filters";
import {
  CLASSIFICATION_BORDER_STYLE,
  CLASSIFICATION_CYTOSCAPE_SHAPES,
  CLASSIFICATION_ORDER,
} from "@/lib/classification-style";
import { toCollapsedElements } from "@/lib/collapse-clusters";
import {
  BLAST_BORDER,
  BLAST_COLOR,
  CANVAS_BG,
  CLASSIFICATION_COLORS,
  COMPOUND_BORDER,
  COMPOUND_FILL,
  CYCLE_COLOR,
  DIM_OPACITY,
  LABEL_COLOR,
  NEUTRAL_EDGE,
  SELECTED_COLOR,
} from "@/lib/colors";
import { toCytoscapeElements } from "@/lib/cytoscape-elements";
import { isNodeUnderDirectory } from "@/lib/directory-tree";
import { type FocusNeighborhood, computeFocusNeighborhood } from "@/lib/focus-mode";
import { applyCachedPositions, loadCachedPositions, saveCachedPositions } from "@/lib/layout-cache";
import { matchesPathMask, parsePathMask } from "@/lib/path-mask";
import { useGraphStore } from "@/lib/store";
import { useSettings } from "@/lib/use-settings";
import { type ViewFilters, nodeVisible } from "@/lib/view-graph";
import type { Graph } from "@depmod/types";
import cytoscape, { type Core, type NavigatorInstance } from "cytoscape";
import fcose from "cytoscape-fcose";
import navigator from "cytoscape-navigator";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// Register the fCoSE layout exactly once. Re-registering is harmless but throws
// warnings in StrictMode, so we guard with a module-level flag.
let layoutRegistered = false;
function ensureLayoutRegistered() {
  if (layoutRegistered) return;
  cytoscape.use(fcose);
  layoutRegistered = true;
}

let navigatorRegistered = false;
function ensureNavigatorRegistered() {
  if (navigatorRegistered) return;
  cytoscape.use(navigator);
  navigatorRegistered = true;
}

/** Below this size the canvas is already easy to scan; the minimap is just noise. */
const MINIMAP_NODE_THRESHOLD = 30;

/**
 * fCoSE quality "proof" takes seconds on graphs with thousands of nodes, and the
 * result is a hairball you can't read anyway. Above this threshold we render an
 * instant grid layout on mount so the user can pan/zoom immediately; clicking
 * "Re-layout" in the toolbar opts back into a fCoSE pass.
 */
const FAST_LAYOUT_NODE_THRESHOLD = 2000;

interface CytoscapeCanvasProps {
  graph: Graph;
}

export function CytoscapeCanvas({ graph }: CytoscapeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const navRef = useRef<NavigatorInstance | null>(null);
  const layoutRunIdRef = useRef(0);
  // Previous overlay state (per-element class sets + blast depths). Diffed
  // against the freshly computed state on every overlay update so we only
  // touch elements whose visual state actually changed. Declared up here
  // (above the mount effect) so the mount effect can synchronously reset
  // it on cy instance creation.
  const overlayStateRef = useRef<OverlayState>(EMPTY_OVERLAY_STATE);
  const [fps, setFps] = useState<number | null>(null);
  const router = useRouter();

  const setSelection = useGraphStore((s) => s.setSelection);
  const { settings } = useSettings();
  // Stash the live setting in a ref so the long-lived mount effect reads the
  // current value when it runs; re-reading it as a closure would otherwise
  // capture the value at mount time and never update.
  const layoutCacheEnabledRef = useRef(settings.layoutCacheEnabled);
  useEffect(() => {
    layoutCacheEnabledRef.current = settings.layoutCacheEnabled;
  }, [settings.layoutCacheEnabled]);
  const classificationModes = useGraphStore((s) => s.classificationModes);
  const pathMask = useGraphStore((s) => s.pathMask);
  const viewFilters = useGraphStore((s) => s.viewFilters);
  const parsedMask = useMemo(() => parsePathMask(pathMask), [pathMask]);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const layoutRequestId = useGraphStore((s) => s.layoutRequestId);
  const blastRadiusFor = useGraphStore((s) => s.blastRadiusFor);
  const focusModeRoot = useGraphStore((s) => s.focusModeRoot);
  const focusModeDepth = useGraphStore((s) => s.focusModeDepth);
  const focusedDirectory = useGraphStore((s) => s.focusedDirectory);
  const focusedCycle = useGraphStore((s) => s.focusedCycle);
  const collapseDirectories = useGraphStore((s) => s.collapseDirectories);
  const setCollapseDirectories = useGraphStore((s) => s.setCollapseDirectories);
  const setFocusedDirectory = useGraphStore((s) => s.setFocusedDirectory);
  /** Node-id set for the actively isolated cycle (null when no cycle is focused). */
  const cycleNodeIds = useMemo<Set<string> | null>(() => {
    if (focusedCycle === null) return null;
    const cycle = graph.cycles[focusedCycle];
    return cycle ? new Set(cycle.nodes) : null;
  }, [graph.cycles, focusedCycle]);
  const elements = useMemo(
    () => (collapseDirectories ? toCollapsedElements(graph) : toCytoscapeElements(graph)),
    [graph, collapseDirectories],
  );
  const blastRadius = useMemo(
    () => (blastRadiusFor ? computeBlastRadius(graph, blastRadiusFor) : null),
    [graph, blastRadiusFor],
  );
  const focusNeighborhood = useMemo(
    () => (focusModeRoot ? computeFocusNeighborhood(graph, focusModeRoot, focusModeDepth) : null),
    [graph, focusModeRoot, focusModeDepth],
  );

  // Mount / unmount on graph change.
  useEffect(() => {
    if (!containerRef.current) return;
    ensureLayoutRegistered();
    // Reset the overlay diff state SYNCHRONOUSLY here, not in a separate
    // useEffect. The cy instance below is brand-new and carries no overlay
    // classes; the next applyOverlays call must believe "previous = empty"
    // so it adds every needed class from scratch. Doing this in a sibling
    // useEffect would run *after* the overlay effect on the same commit
    // (React fires effects in declaration order) and clobber whatever the
    // overlay effect just stored, leaving every later toggle diffing
    // against EMPTY and never removing the stale classes from the DOM.
    overlayStateRef.current = EMPTY_OVERLAY_STATE;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(),
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      // Cytoscape 3.30+ ships an experimental WebGL renderer that batches
      // nodes/edges into GPU draw calls; required to keep
      // thousands-of-nodes graphs interactive.
      webgl: true,
      // webglDebug logs atlas/frame stats to the console. We render our own
      // FPS chip below; cytoscape's built-in `showFps` is hardcoded to 30px
      // red Arial and can't be styled.
      webglDebug: true,
    });
    cyRef.current = cy;
    registerCy(cy);

    // WebGL renders text from a sprite atlas, so labels stay cheap even on
    // large graphs; keep them visible at the fit-to-screen zoom (~0.15-0.3)
    // and only drop them when nodes are smaller
    // than the text itself.
    //
    // CRITICAL: only call addClass/removeClass when the LOD state actually
    // *changes*. Calling them unconditionally on every 'zoom pan' tick
    // invalidates cytoscape's style cache and forces the WebGL texture
    // atlas to be rebuilt for every node/edge each frame; which is exactly
    // what makes large graphs feel sluggish under WebGL.
    // Maybe could use some optimization?
    let lodHideLabels: boolean | null = null;
    let lodHideEdges: boolean | null = null;
    const applyZoomLod = () => {
      const z = cy.zoom();
      const hideLabels = z < 0.1;
      const hideEdges = z < 0.15;
      if (hideLabels === lodHideLabels && hideEdges === lodHideEdges) return;
      lodHideLabels = hideLabels;
      lodHideEdges = hideEdges;
      cy.batch(() => {
        if (hideLabels) cy.nodes().addClass("lod-no-label");
        else cy.nodes().removeClass("lod-no-label");
        if (hideEdges) cy.edges().addClass("lod-hide-edge");
        else cy.edges().removeClass("lod-hide-edge");
      });
    };
    cy.on("zoom pan", applyZoomLod);
    applyZoomLod();

    // The WebGL renderer overrides `r.render` and does NOT emit cytoscape's
    // 'render' event, so any plugin that subscribes via `cy.onRender(...)`;
    // including cytoscape-navigator; never updates its thumbnail. The
    // viewport rect is fine (it listens on 'zoom pan'); only the snapshot
    // image is stuck. Re-emit on 'viewport' (fires once per zoom/pan gesture
    // burst, not per intermediate frame) and trail with a debounce so we get
    // a final thumbnail update after the user lets go.
    let navPokeTimer: ReturnType<typeof setTimeout> | null = null;
    const pokeNavigator = () => {
      if (cy.destroyed()) return;
      if (navPokeTimer) clearTimeout(navPokeTimer);
      navPokeTimer = setTimeout(() => {
        if (!cy.destroyed()) cy.emit("render");
      }, 300);
    };
    cy.on("viewport", pokeNavigator);

    const destroyNavigator = () => {
      if (!navRef.current) return;
      try {
        navRef.current.destroy();
      } catch {
        // Plugin may already be torn down with the cy instance.
      }
      navRef.current = null;
    };

    const mountNavigator = () => {
      if (navRef.current || !minimapRef.current) return;
      if (cy.destroyed()) return;
      if (graph.nodes.length < MINIMAP_NODE_THRESHOLD) return;
      if (!minimapRef.current.id) {
        minimapRef.current.id = "depmod-minimap";
      }
      for (const orphan of document.querySelectorAll("div.cytoscape-navigator")) {
        if (orphan.id !== "depmod-minimap") orphan.remove();
      }
      const attempt = (triesLeft: number) => {
        if (cy.destroyed() || navRef.current) return;
        try {
          ensureNavigatorRegistered();
          navRef.current = cy.navigator({
            container: `#${minimapRef.current!.id}` as unknown as HTMLElement,
            viewLiveFramerate: 30,
            rerenderDelay: 300,
            removeCustomContainer: false,
          });
        } catch {
          navRef.current = null;
          if (triesLeft > 0) {
            setTimeout(() => attempt(triesLeft - 1), 120);
          }
        }
      };
      attempt(8);
    };
    const collapseMode = collapseDirectories ? "collapsed" : "expanded";

    const runInitialLayout = () => {
      const onDone = () =>
        requestAnimationFrame(() => {
          mountNavigator();
          // The navigator registers its onRender handler the first time it
          // sees a 'render' event; and in WebGL mode nothing emits it for
          // us. Kick it off so the thumbnail draws once on mount.
          if (!cy.destroyed()) cy.emit("render");
        });

      // Fast path: a previous fCoSE pass for this exact graph version is
      // already in localStorage. Apply the positions and skip the layout
      // entirely; for a 1k+ node graph this is the difference between an
      // instant render and a multi-second wait.
      const cached = layoutCacheEnabledRef.current
        ? loadCachedPositions(graph, collapseMode)
        : null;
      if (cached) {
        const complete = applyCachedPositions(cy, cached);
        if (complete) {
          cy.fit(undefined, 30);
          onDone();
          return;
        }
        // Cache covered only some nodes (e.g. a re-parse added files since
        // we last saved). Fall through to a full layout so the new nodes
        // don't sit on top of each other at (0, 0).
      }

      if (graph.nodes.length > FAST_LAYOUT_NODE_THRESHOLD) {
        // Subscribe BEFORE running; grid is synchronous, so layoutstop
        // fires inside `.run()` and a listener attached afterwards is lost.
        cy.one("layoutstop", () => {
          if (layoutCacheEnabledRef.current) saveCachedPositions(graph, collapseMode, cy);
          onDone();
        });
        runFastLayout(cy);
      } else {
        runLayout(cy, layoutRunIdRef, () => {
          if (layoutCacheEnabledRef.current) saveCachedPositions(graph, collapseMode, cy);
          onDone();
        });
      }
    };

    runInitialLayout();

    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      if (node.isParent()) return;
      const isCluster = node.data("isCluster") === true;
      if (isCluster) {
        // Cluster click in collapse mode: drill in by scoping the directory
        // tree's filter to this cluster's path. The user can switch to the
        // expanded view via the toolbar to see the underlying nodes.
        setFocusedDirectory(node.id());
        return;
      }
      setSelection(node.id());
    });
    cy.on("dbltap", "node", (evt) => {
      const node = evt.target;
      if (node.isParent()) return;
      const isCluster = node.data("isCluster") === true;
      if (isCluster) {
        // Double-click drills in AND expands: toggles cluster-collapse off
        // and pins the focus to the just-clicked cluster.
        setFocusedDirectory(node.id());
        setCollapseDirectories(false);
        return;
      }
      router.push(`/graph/page?id=${encodeURIComponent(node.id())}`);
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelection(null);
    });

    return () => {
      cy.off("zoom pan", applyZoomLod);
      cy.off("viewport", pokeNavigator);
      if (navPokeTimer) clearTimeout(navPokeTimer);
      destroyNavigator();
      unregisterCy(cy);
      cy.destroy();
      cyRef.current = null;
    };
  }, [
    elements,
    setSelection,
    setFocusedDirectory,
    setCollapseDirectories,
    router,
    graph.nodes.length,
    graph.rootDir,
    graph.generatedAt,
  ]);

  // React to filter / search / selection / blast-radius / focus-mode / directory changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    overlayStateRef.current = applyOverlays(
      cy,
      overlayStateRef.current,
      classificationModes,
      parsedMask,
      viewFilters,
      selectedNodeId,
      blastRadius,
      focusNeighborhood,
      focusedDirectory,
      cycleNodeIds,
    );
  }, [
    classificationModes,
    parsedMask,
    viewFilters,
    selectedNodeId,
    blastRadius,
    focusNeighborhood,
    focusedDirectory,
    cycleNodeIds,
  ]);

  // Camera pan: when the user picks a directory in the tree sidebar, fly the
  // camera to the bounding box of its descendants so they actually see what's
  // in scope.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!focusedDirectory) return;
    const matched = cy.nodes().filter((n) => {
      if (n.isParent()) return false;
      return isNodeUnderDirectory(n.id(), focusedDirectory);
    });
    if (matched.length === 0) return;
    cy.animate({ fit: { eles: matched, padding: 40 }, duration: 350, easing: "ease-out" });
  }, [focusedDirectory]);

  // Cycle isolation: when a cycle is picked from the inspector, frame the
  // camera onto its participating nodes so the loop is unmissable.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!cycleNodeIds || cycleNodeIds.size === 0) return;
    const matched = cy.nodes().filter((n) => !n.isParent() && cycleNodeIds.has(n.id()));
    if (matched.length === 0) return;
    cy.animate({ fit: { eles: matched, padding: 60 }, duration: 400, easing: "ease-out" });
  }, [cycleNodeIds]);

  // Minimal FPS tracker; counts rAF callbacks and publishes a smoothed
  // value once per second. The loop only schedules the next frame while
  // mounted, so it costs nothing after unmount. Cheap enough to leave on as
  // a soft watchdog while WebGL is still experimental.
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      const elapsed = now - last;
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Toolbar "Re-layout" button bumps layoutRequestId; re-run fCoSE when it changes,
  // but skip the initial 0-value (the mount effect already runs the layout).
  // Re-layout always bypasses the cache (the user is explicitly asking for a
  // fresh pass) and overwrites it afterwards so the new positions stick.
  useEffect(() => {
    if (layoutRequestId === 0) return;
    const cy = cyRef.current;
    if (!cy) return;
    const collapseMode = collapseDirectories ? "collapsed" : "expanded";
    runLayout(cy, layoutRunIdRef, () => {
      saveCachedPositions(graph, collapseMode, cy);
    });
  }, [layoutRequestId, graph, collapseDirectories]);

  const showMinimap = graph.nodes.length >= MINIMAP_NODE_THRESHOLD;

  return (
    <div className="relative h-full w-full" style={{ background: CANVAS_BG }}>
      <div ref={containerRef} className="h-full w-full" />
      {fps !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-2 top-2 select-none rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-neutral-400/70"
          style={{ background: "rgba(15,15,15,0.55)" }}
          title="Frames per second"
        >
          {fps} fps
        </div>
      ) : null}
      {showMinimap ? (
        <div
          id="depmod-minimap"
          ref={minimapRef}
          aria-label="Graph minimap"
          className="depmod-minimap"
        />
      ) : null}
    </div>
  );
}

/** Animate fCoSE only on small graphs; the 400ms tween emits a viewport
 * event per frame, which under WebGL means hundreds of texture-atlas
 * rebuilds in quick succession. Above this threshold we jump straight to the
 * final layout. */
const LAYOUT_ANIMATE_NODE_THRESHOLD = 400;

function runLayout(cy: Core, runIdRef: React.MutableRefObject<number>, onLayoutStop?: () => void) {
  const runId = ++runIdRef.current;
  const animate = cy.nodes().length <= LAYOUT_ANIMATE_NODE_THRESHOLD;
  const layout = cy.layout({
    name: "fcose",
    animate,
    animationDuration: 400,
    randomize: false,
    fit: true,
    padding: 30,
    nodeRepulsion: 4500,
    idealEdgeLength: 70,
    nodeSeparation: 75,
    quality: "proof",
  } as cytoscape.LayoutOptions);
  // Subscribe BEFORE running. With `animate: false` fcose runs synchronously
  // and emits `layoutstop` during `layout.run()`; register after and the
  // callback (and our navigator mount) is silently dropped.
  // Guard against races: if a newer layout has been triggered, ignore the older one's stop.
  layout.one("layoutstop", () => {
    if (runId !== runIdRef.current) return;
    cy.fit(undefined, 30);
    onLayoutStop?.();
  });
  layout.run();
}

/**
 * Cheap initial layout for graphs that exceed FAST_LAYOUT_NODE_THRESHOLD. Cytoscape's
 * built-in `grid` runs synchronously and never blocks the UI. Doesn't update the
 * runId ref because Re-layout always wins anyway.
 */
function runFastLayout(cy: Core) {
  cy.layout({
    name: "grid",
    animate: false,
    fit: true,
    padding: 20,
  } as cytoscape.LayoutOptions).run();
}

/** All classes that applyOverlays manages; used as the diff alphabet. */
const OVERLAY_CLASSES = [
  "dimmed",
  "match",
  "selected",
  "blast",
  "blast-root",
  "focus",
  "focus-root",
  "filtered-out",
] as const;

interface OverlayState {
  /** element id → set of overlay classes the element currently carries. */
  classes: Map<string, Set<string>>;
  /** node id → blast depth (numeric data attribute, used by stylesheet mapData). */
  blastDepth: Map<string, number>;
}

const EMPTY_OVERLAY_STATE: OverlayState = {
  classes: new Map(),
  blastDepth: new Map(),
};

function addCls(map: Map<string, Set<string>>, id: string, cls: string): void {
  let set = map.get(id);
  if (!set) {
    set = new Set();
    map.set(id, set);
  }
  set.add(cls);
}

/**
 * Compute the *desired* overlay state for the current view, then diff it
 * against the previous desired state and only call addClass/removeClass /
 * data/removeData on the elements that actually changed.
 *
 * Why: with WebGL on, every class change invalidates the element's slot in
 * the texture atlas. The old "removeClass on everything, then re-add"
 * approach forced ~all nodes through that pipeline on every store update,
 * which made even single-node selections feel laggy on 1k+ graphs.
 *
 * Returns the new desired state so the caller can stash it in a ref for
 * the next call's diff.
 */
function applyOverlays(
  cy: Core,
  previous: OverlayState,
  classificationModes: ClassificationModes,
  pathMask: ReturnType<typeof parsePathMask>,
  viewFilters: ViewFilters,
  selectedNodeId: string | null,
  blastRadius: BlastRadius | null,
  focusNeighborhood: FocusNeighborhood | null,
  focusedDirectory: string | null,
  cycleNodeIds: Set<string> | null,
): OverlayState {
  const next: OverlayState = { classes: new Map(), blastDepth: new Map() };
  const soloCls = getSoloClassification(classificationModes);

  // ── Compute desired state ────────────────────────────────────────────
  // Precedence (highest first):
  //   cycle isolation → focus mode → blast radius → default (classification
  //                                                 + path-mask + directory).
  // Selection is layered on top in every branch.

  if (cycleNodeIds && cycleNodeIds.size > 0) {
    // Hard isolation: only the cycle's nodes stay visible, every other node
    // is dropped from the canvas entirely so the user can scrutinise the
    // loop without surrounding noise. Internal edges that close the cycle
    // light up with the existing `blast` class; already styled amber-ish,
    // close enough to "this is the important bit" without a new selector.
    cy.nodes().forEach((n) => {
      if (n.isParent()) return;
      if (!cycleNodeIds.has(n.id())) addCls(next.classes, n.id(), "filtered-out");
    });
    cy.edges().forEach((e) => {
      const sIn = cycleNodeIds.has(e.source().id());
      const tIn = cycleNodeIds.has(e.target().id());
      if (!sIn || !tIn) addCls(next.classes, e.id(), "filtered-out");
    });
  } else if (focusNeighborhood && focusNeighborhood.size > 0) {
    // Hard isolation, matching cycle mode: only nodes inside the
    // neighbourhood stay on the canvas, everything else is dropped. Avoids
    // the inconsistent "some classes dim, others vanish" look that arose
    // when out-of-scope nodes were dimmed for normal classes but filtered
    // out for hidden ones. In-scope nodes always render (they override the
    // classification toggle on purpose — focus mode says "show me the
    // network around X, including pieces I'd normally hide").
    cy.nodes().forEach((n) => {
      if (n.isParent()) return;
      const depth = focusNeighborhood.depthByNode.get(n.id());
      if (depth === undefined) {
        addCls(next.classes, n.id(), "filtered-out");
      } else {
        addCls(next.classes, n.id(), depth === 0 ? "focus-root" : "focus");
      }
    });
    cy.edges().forEach((e) => {
      const sd = focusNeighborhood.depthByNode.get(e.source().id());
      const td = focusNeighborhood.depthByNode.get(e.target().id());
      if (sd === undefined || td === undefined) {
        addCls(next.classes, e.id(), "filtered-out");
      } else {
        addCls(next.classes, e.id(), "focus");
      }
    });
  } else if (blastRadius && blastRadius.size > 0) {
    // Same hard-isolation pattern as focus: the blast radius is the answer
    // to "what would break if I change this?", so everything outside it is
    // noise. In-scope nodes get blast styling regardless of classification.
    cy.nodes().forEach((n) => {
      if (n.isParent()) return;
      const depth = blastRadius.depthByNode.get(n.id());
      if (depth === undefined) {
        addCls(next.classes, n.id(), "filtered-out");
      } else {
        next.blastDepth.set(n.id(), depth);
        addCls(next.classes, n.id(), depth === 0 ? "blast-root" : "blast");
      }
    });
    cy.edges().forEach((e) => {
      const sd = blastRadius.depthByNode.get(e.source().id());
      const td = blastRadius.depthByNode.get(e.target().id());
      if (sd === undefined || td === undefined) {
        addCls(next.classes, e.id(), "filtered-out");
      } else {
        addCls(next.classes, e.id(), "blast");
      }
    });
  } else {
    // Default branch: classifications, path mask, directory focus.
    const filteredOutIds = new Set<string>();
    const dimmedIds = new Set<string>();
    cy.nodes().forEach((n) => {
      if (n.isParent()) return;
      const cls = n.data("classification") as keyof ClassificationModes | undefined;
      const id = (n.data("id") as string | undefined) ?? "";
      const structOk =
        nodeVisible(id, viewFilters) && matchesPathMask(id, pathMask, { classification: cls });
      const directoryOk = focusedDirectory ? isNodeUnderDirectory(id, focusedDirectory) : true;
      if (!structOk) {
        addCls(next.classes, n.id(), "filtered-out");
        filteredOutIds.add(n.id());
        return;
      }
      if (soloCls) {
        if (cls !== soloCls) {
          addCls(next.classes, n.id(), "filtered-out");
          filteredOutIds.add(n.id());
        } else if (pathMask.include.length > 0 || pathMask.exclude.length > 0) {
          addCls(next.classes, n.id(), "match");
        }
        return;
      }
      const mode = cls ? classificationModes[cls] : "neutral";
      if (mode === "excluded") {
        addCls(next.classes, n.id(), "filtered-out");
        filteredOutIds.add(n.id());
        return;
      }
      if (!directoryOk || mode === "dimmed") {
        addCls(next.classes, n.id(), "dimmed");
        dimmedIds.add(n.id());
      } else if (pathMask.include.length > 0 || pathMask.exclude.length > 0) {
        addCls(next.classes, n.id(), "match");
      }
    });
    // Edges inherit filtered-out / dimmed from their endpoints. We compute
    // off the in-memory Sets we just built (NOT off DOM classes, since we
    // haven't applied anything yet).
    cy.edges().forEach((e) => {
      const s = e.source().id();
      const t = e.target().id();
      if (filteredOutIds.has(s) || filteredOutIds.has(t)) {
        addCls(next.classes, e.id(), "filtered-out");
      } else if (dimmedIds.has(s) || dimmedIds.has(t)) {
        addCls(next.classes, e.id(), "dimmed");
      }
    });
  }

  if (selectedNodeId) {
    addCls(next.classes, selectedNodeId, "selected");
  }

  // ── Diff and apply ───────────────────────────────────────────────────
  cy.batch(() => {
    // Walk the union of (prev keys, next keys) so we both add to newly
    // overlaid elements and clear classes off elements that lost their
    // overlay.
    const touched = new Set<string>();
    for (const id of previous.classes.keys()) touched.add(id);
    for (const id of next.classes.keys()) touched.add(id);
    for (const id of touched) {
      const before = previous.classes.get(id);
      const after = next.classes.get(id);
      const el = cy.getElementById(id);
      if (!el || el.empty()) continue;
      // removes: classes that were on the element but aren't now.
      if (before) {
        for (const c of before) {
          if (!after || !after.has(c)) el.removeClass(c);
        }
      }
      // adds: classes the element should carry but doesn't.
      if (after) {
        for (const c of after) {
          if (!before || !before.has(c)) el.addClass(c);
        }
      }
    }
    // blastDepth data attribute; same diff pattern.
    const blastTouched = new Set<string>();
    for (const id of previous.blastDepth.keys()) blastTouched.add(id);
    for (const id of next.blastDepth.keys()) blastTouched.add(id);
    for (const id of blastTouched) {
      const before = previous.blastDepth.get(id);
      const after = next.blastDepth.get(id);
      if (before === after) continue;
      const el = cy.getElementById(id);
      if (!el || el.empty()) continue;
      if (after === undefined) el.removeData("blastDepth");
      else el.data("blastDepth", after);
    }
  });
  // Anchor; keeps OVERLAY_CLASSES referenced so future tweakers see the
  // canonical class list when scrolling here.
  void OVERLAY_CLASSES;
  return next;
}

function buildStylesheet(): cytoscape.StylesheetCSS[] {
  const classStyleEntries: cytoscape.StylesheetCSS[] = CLASSIFICATION_ORDER.map((cls) => {
    const color = CLASSIFICATION_COLORS[cls];
    const shape = CLASSIFICATION_CYTOSCAPE_SHAPES[cls];
    const borderStyle = CLASSIFICATION_BORDER_STYLE[cls];
    return {
      selector: `node[classification = "${cls}"]`,
      css: {
        "background-color": color,
        "border-color": color,
        shape,
        ...(borderStyle ? { "border-style": borderStyle } : {}),
      },
    };
  });

  return [
    {
      selector: "node",
      css: {
        label: "data(label)",
        "font-size": 9,
        color: LABEL_COLOR,
        // A near-black text outline keeps filenames legible when a label
        // happens to land on top of a brightly-coloured node (page blue,
        // hook amber, etc). Width is small so the stroke doesn't overwhelm
        // the 9-px font; opacity is dialled down so the outline reads as
        // depth rather than a hard shape.
        "text-outline-color": "#050505",
        "text-outline-width": 1.5,
        "text-outline-opacity": 0.85,
        "text-valign": "center",
        "text-halign": "center",
        "text-opacity": 0.95,
        width: "mapData(loc, 0, 250, 14, 60)",
        height: "mapData(loc, 0, 250, 14, 60)",
        "border-width": "mapData(instability, 0, 1, 1, 4)",
        "border-opacity": 0.85,
        shape: "ellipse",
        "background-opacity": 0.9,
      },
    },
    ...classStyleEntries,
    {
      selector: "node:parent",
      css: {
        "background-color": COMPOUND_FILL,
        "background-opacity": 0.5,
        "border-color": COMPOUND_BORDER,
        "border-width": 1,
        label: "data(label)",
        // Same outline treatment as leaf nodes so directory labels stay
        // readable when they overlap the cluster fill.
        "text-outline-color": "#050505",
        "text-outline-width": 2,
        "text-outline-opacity": 0.85,
        "text-valign": "top",
        "text-halign": "center",
        "text-opacity": 0.9,
        "font-size": 11,
        color: "#9ca3af",
        padding: "10px",
        shape: "round-rectangle",
      },
    },
    {
      selector: "edge",
      css: {
        width: 1,
        "line-color": NEUTRAL_EDGE,
        "curve-style": "bezier",
        "target-arrow-shape": "triangle-backcurve",
        "target-arrow-color": NEUTRAL_EDGE,
        "target-arrow-fill": "filled",
        "arrow-scale": 0.55,
        opacity: 0.75,
      },
    },
    {
      selector: 'edge[kind = "type-only"]',
      css: { "line-style": "dashed" },
    },
    {
      selector: 'edge[kind = "dynamic"]',
      css: { "line-style": "dotted" },
    },
    {
      selector: "edge[?inCycle]",
      css: {
        width: 2,
        "line-color": CYCLE_COLOR,
        "target-arrow-color": CYCLE_COLOR,
        opacity: 0.95,
      },
    },
    {
      selector: "node.lod-no-label",
      css: { "text-opacity": 0 },
    },
    {
      selector: "edge.lod-hide-edge",
      css: { opacity: 0, width: 0 },
    },
    {
      selector: "node.filtered-out",
      css: { display: "none" },
    },
    {
      selector: "edge.filtered-out",
      css: { display: "none" },
    },
    {
      selector: "node.dimmed",
      css: { opacity: DIM_OPACITY },
    },
    {
      selector: "edge.dimmed",
      css: {
        opacity: DIM_OPACITY * 0.7,
        // Hide the arrow head on dimmed edges — at low opacity the tiny
        // triangles still read as visual noise without conveying direction,
        // and they clutter focus / blast overlays where the "real" edges
        // need to stand out.
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "node.match",
      css: {
        "border-color": SELECTED_COLOR,
        "border-width": 3,
      },
    },
    {
      selector: "node.selected",
      css: {
        "border-color": SELECTED_COLOR,
        "border-width": 5,
        "background-blacken": -0.1,
      },
    },
    {
      selector: "node.blast",
      css: {
        // Original classification background stays — only the border carries the
        // blast accent so the user can still read the dependency type at a glance.
        "border-color": BLAST_BORDER,
        "border-width": 3,
        "border-opacity": 1,
        // Closer dependents are fully opaque; deeper ones fade out toward 0.55 so the
        // user can still read the propagation order at a glance. The cytoscape
        // runtime accepts mapData() strings here, but @types/cytoscape pins the
        // property to `number` only; hence the cast.
        opacity: "mapData(blastDepth, 1, 6, 1, 0.55)" as unknown as number,
      },
    },
    {
      // The selected node at the root of the blast keeps its full highlight,
      // so it stays visually distinct from its dependents.
      selector: "node.blast-root",
      css: {
        "background-color": BLAST_COLOR,
        "border-color": SELECTED_COLOR,
        "border-width": 5,
        "border-opacity": 1,
        opacity: 1,
      },
    },
    {
      selector: "edge.blast",
      css: {
        "line-color": BLAST_BORDER,
        "target-arrow-color": BLAST_BORDER,
        width: 2,
        opacity: 0.95,
      },
    },
    {
      // Focus mode: keep neighborhood nodes at full opacity. Dimming of
      // non-neighborhood nodes is handled by the shared .dimmed selector above.
      selector: "node.focus",
      css: { opacity: 1 },
    },
    {
      selector: "node.focus-root",
      css: {
        "border-color": SELECTED_COLOR,
        "border-width": 4,
        "border-opacity": 1,
        opacity: 1,
      },
    },
    {
      // Edges fully inside the active focus neighbourhood. Brighter line so
      // the connections between focused nodes stand out against the dimmed
      // rest of the graph, without competing visually with the blast/cycle
      // overlay colours.
      selector: "edge.focus",
      css: {
        "line-color": "#a3a3a3",
        "target-arrow-color": "#a3a3a3",
        width: 1.3,
        opacity: 0.9,
      },
    },
    // Cluster-collapse super-nodes: rectangles sized by fileCount,
    // distinct from the per-file circles/hexagons rendered in expanded mode.
    {
      selector: "node[?isCluster]",
      css: {
        shape: "round-rectangle",
        "background-color": COMPOUND_FILL,
        "background-opacity": 0.95,
        "border-color": COMPOUND_BORDER,
        "border-width": 2,
        "border-opacity": 1,
        width: "mapData(fileCount, 1, 200, 28, 90)",
        height: "mapData(fileCount, 1, 200, 22, 60)",
        "font-size": 11,
        color: "#cbd5e1",
        "text-outline-color": "#050505",
        "text-outline-width": 2,
        "text-outline-opacity": 0.85,
        "text-valign": "center",
        "text-halign": "center",
        "text-margin-y": 0,
        "text-wrap": "ellipsis",
        "text-max-width": "80px",
      },
    },
    // Weighted aggregated edges between clusters: thicker line for heavier
    // dependency bundles so the topology reads at a glance.
    {
      selector: "edge[weight]",
      css: {
        width: "mapData(weight, 1, 40, 1, 4)" as unknown as number,
        opacity: 0.85,
      },
    },
  ];
}
