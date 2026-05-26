"use client";

import { computeBlastRadius } from "@/lib/blast-radius";
import { CLASSIFICATION_ORDER } from "@/lib/classification-style";
import { BLAST_BORDER, CYCLE_COLOR, SELECTED_COLOR } from "@/lib/colors";
import { isNodeUnderDirectory } from "@/lib/directory-tree";
import { registerFg, unregisterFg } from "@/lib/fg-canvas-ref";
import { computeFocusNeighborhood } from "@/lib/focus-mode";
import { type ForceGraphNode, MAX_3D_NODES, toForceGraphData } from "@/lib/force-graph-elements";
import { parsePathMask } from "@/lib/path-mask";
import { useGraphStore } from "@/lib/store";
import type { Classification, Graph } from "@depmod/types";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * react-force-graph-3d's accessor callbacks are typed against its own
 * `NodeObject`/`LinkObject` defaults (which don't know about our custom
 * fields). The Next dynamic import additionally erases the generic
 * parameters. Use these aliases inside callbacks so the accessor signature
 * matches the library's expectation while we still write code against our
 * domain shape via a narrowing read.
 */
// biome-ignore lint/suspicious/noExplicitAny: library typed loosely; we narrow inside.
type FgNode = any;
// biome-ignore lint/suspicious/noExplicitAny: library typed loosely; we narrow inside.
type FgLink = any;

// react-force-graph-3d pulls in three.js (~700 KB gzipped); only load when
// the user actually toggles to 3D mode. SSR explicitly off; `window` is
// touched at import time inside the package.
const ForceGraph3D = dynamic(
  // The package exports `ForceGraph3D` as the default of its 3d entry point.
  () => import("react-force-graph-3d").then((m) => m.default),
  { ssr: false, loading: () => <Loading /> },
);

/**
 * Y-coordinate per classification, used to pin nodes onto horizontal "floors"
 * via `fy` (fixed y position). Reads top→bottom as: page → api → hook →
 * component → lib → test → config. Matches the brief's "page at top, lib at
 * bottom" mental model and makes layered architectures pop out visually
 * (incoming-edge fan-in goes upward, dependencies hang downward).
 *
 * Values are tight enough that force-directed X/Z layout still has room to
 * spread inside each band; the simulation is constrained on one axis only.
 */
const CLASSIFICATION_Y: Record<Classification, number> = (() => {
  // Map CLASSIFICATION_ORDER index → y, evenly spaced from +300 (top) to -300 (bottom).
  const out = {} as Record<Classification, number>;
  const span = 600;
  const step = span / Math.max(1, CLASSIFICATION_ORDER.length - 1);
  CLASSIFICATION_ORDER.forEach((cls, i) => {
    out[cls] = span / 2 - i * step;
  });
  return out;
})();

/**
 * three.js / WebGL 3D renderer. Reads the same overlay state as the 2D
 * Cytoscape canvas (selection, blast radius, focus mode, directory focus,
 * cycle highlighting) and applies it via per-node colour + size + per-link
 * styling; no per-element opacity (the WebGL renderer in react-force-graph
 * doesn't expose it cleanly), so dimmed elements use a low-contrast colour
 * blend instead.
 *
 * Keyboard:
 *   r → reset camera (zoom to fit)
 */
export function ForceGraph3DCanvas({ graph }: { graph: Graph }) {
  const classificationModes = useGraphStore((s) => s.classificationModes);
  const pathMaskRaw = useGraphStore((s) => s.pathMask);
  const viewFilters = useGraphStore((s) => s.viewFilters);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelection = useGraphStore((s) => s.setSelection);
  const blastRadiusFor = useGraphStore((s) => s.blastRadiusFor);
  const focusModeRoot = useGraphStore((s) => s.focusModeRoot);
  const focusModeDepth = useGraphStore((s) => s.focusModeDepth);
  const focusedDirectory = useGraphStore((s) => s.focusedDirectory);
  const focusedCycle = useGraphStore((s) => s.focusedCycle);

  const pathMask = useMemo(() => parsePathMask(pathMaskRaw), [pathMaskRaw]);

  // Overlay derivations, mirroring the Cytoscape canvas. The depth maps are
  // consumed in the accessor closures below so per-frame work stays O(1) per
  // node/link lookup. Computed against the *full* graph, not the
  // post-classification-filter view, so focus/blast can surface neighbours
  // whose classification has been toggled off.
  const blastRadius = useMemo(
    () => (blastRadiusFor ? computeBlastRadius(graph, blastRadiusFor) : null),
    [graph, blastRadiusFor],
  );
  const focusNeighborhood = useMemo(
    () => (focusModeRoot ? computeFocusNeighborhood(graph, focusModeRoot, focusModeDepth) : null),
    [graph, focusModeRoot, focusModeDepth],
  );

  const data = useMemo(() => {
    // Focus / blast both run as hard isolation: only nodes inside the
    // neighbourhood reach the renderer, mirroring the 2D canvas after the
    // hard-isolate fix. We still pass `alwaysInclude` so the adapter
    // surfaces hidden-class neighbours; then we discard everything else.
    const scope = focusNeighborhood
      ? new Set(focusNeighborhood.depthByNode.keys())
      : blastRadius
        ? new Set(blastRadius.depthByNode.keys())
        : null;
    const raw = toForceGraphData({
      graph,
      classificationModes,
      pathMask,
      viewFilters,
      alwaysInclude: scope ?? undefined,
    });
    const filtered = scope
      ? {
          nodes: raw.nodes.filter((n) => scope.has(n.id)),
          links: raw.links.filter((l) => scope.has(l.source) && scope.has(l.target)),
        }
      : raw;
    // Pin each node's Y to its classification band. The simulation will work
    // out X/Z but the vertical position stays fixed; that's the trick that
    // makes layered architectures pop out in 3D.
    for (const n of filtered.nodes) {
      (n as ForceGraphNode & { fy: number }).fy = CLASSIFICATION_Y[n.classification];
    }
    return filtered;
  }, [graph, classificationModes, pathMask, viewFilters, focusNeighborhood, blastRadius]);
  /** Node ids belonging to the actively-isolated cycle (or null if none). */
  const cycleNodeIds = useMemo<Set<string> | null>(() => {
    if (focusedCycle === null) return null;
    const cycle = graph.cycles[focusedCycle];
    if (!cycle) return null;
    return new Set(cycle.nodes);
  }, [graph.cycles, focusedCycle]);
  /** Directed edge keys (`src|dst`) inside the active isolated cycle. */
  const cycleEdgeKeys = useMemo<Set<string> | null>(() => {
    if (focusedCycle === null) return null;
    const cycle = graph.cycles[focusedCycle];
    if (!cycle) return null;
    const keys = new Set<string>();
    const ns = cycle.nodes;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i] as string;
      const b = (ns[(i + 1) % ns.length] as string) ?? a;
      keys.add(`${a}|${b}`);
    }
    return keys;
  }, [graph.cycles, focusedCycle]);

  /**
   * Set of node ids "in scope" for the active overlay; drives both the
   * filename sprite labels (only in-scope nodes get a label) and the visual
   * focus. `null` = no overlay; render all nodes plain.
   */
  const inScope = useMemo<Set<string> | null>(() => {
    if (cycleNodeIds) return cycleNodeIds;
    if (focusNeighborhood) return new Set(focusNeighborhood.depthByNode.keys());
    if (blastRadius) return new Set(blastRadius.depthByNode.keys());
    if (focusedDirectory) {
      const out = new Set<string>();
      for (const n of data.nodes) {
        if (isNodeUnderDirectory(n.id, focusedDirectory)) out.add(n.id);
      }
      return out;
    }
    return null;
  }, [cycleNodeIds, focusNeighborhood, blastRadius, focusedDirectory, data.nodes]);

  // Above the cap, the 3D renderer melts the GPU. Show a friendly nudge to
  // filter first rather than render an unusable graph.
  const tooLarge = data.nodes.length > MAX_3D_NODES;

  // Track the container's pixel dimensions so the canvas resizes with the
  // surrounding layout. react-force-graph respects explicit width/height props
  // but doesn't auto-fit a flex container.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.max(200, Math.floor(width)), h: Math.max(200, Math.floor(height)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Imperative ref to the force-graph instance; exposed for `r` reset camera
  // and the various fly-to behaviours.
  // biome-ignore lint/suspicious/noExplicitAny: react-force-graph types are loose.
  const fgRef = useRef<any>(null);

  // Force a fresh ForceGraph3D instance per mount of this component. Without
  // it, toggling 2D ↔ 3D ↔ 2D ↔ 3D could leave the inner three.js renderer
  // in a stale state — the second 3D mount sometimes painted nothing because
  // the d3-force simulation hadn't been re-seeded against the new canvas.
  // `useId` is stable across re-renders but unique per mount, which is
  // exactly the key semantic we want.
  const instanceKey = useId();

  // Spread nodes out in the X/Z plane. Default d3-force-3d charge is around
  // -30 and link distance is ~30 — fine for dozens of nodes, far too dense
  // for the hundreds we render here, so labels stack and the layout looks
  // crowded on the X axis. Bumping charge repulsion + link distance gives
  // each node much more elbow room. Re-applied on every graph rebuild
  // because the underlying simulation is recreated with `graphData`.
  //
  // Applied via `requestAnimationFrame` (one rAF defer) so the call lands
  // *after* react-force-graph has set up its initial simulation. On a
  // rapid 2D→3D remount, applying forces synchronously in the useEffect
  // could race with the lib's own initialisation and silently no-op,
  // leaving the scene at the default low repulsion (which also helps
  // mask the "graph disappears" issue if the rAF-timed reheat is missed).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const raf = requestAnimationFrame(() => {
      const inst = fgRef.current;
      if (!inst) return;
      try {
        inst.d3Force?.("charge")?.strength?.(-250);
        inst.d3Force?.("link")?.distance?.(70);
        inst.d3Force?.("center")?.strength?.(0.05);
        inst.d3ReheatSimulation?.();
      } catch {
        // The library occasionally rejects calls during a remount race;
        // the next data change will retry, so swallow.
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [data]);

  // After the simulation cools, frame the camera on whatever nodes exist.
  // Belt-and-braces for the same remount race: even if forces failed to
  // apply, nodes still have *some* positions from the lib's initial
  // layout, and zoomToFit guarantees they're inside the viewport.
  const framedOnceRef = useRef(false);
  useEffect(() => {
    framedOnceRef.current = false;
  }, [data]);

  // Register the active fg instance for toolbar consumers (Export menu reads
  // the underlying three.js renderer through this handle). Re-registers any
  // time the instance changes — after the `data`-keyed remount the ref points
  // at a new ForceGraph3D, so use that as the dependency.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    registerFg(fg);
    return () => unregisterFg(fg);
  }, [data]);

  // `r` resets the camera (zoom to fit). Ignored while typing in form fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "r" && e.key !== "R") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.isContentEditable) return;
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      e.preventDefault();
      fgRef.current?.zoomToFit?.(400, 40);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When the selection changes from outside (e.g. node search), fly the
  // camera to it. The library expects coordinates in the same coordinate
  // space as the simulation, which it tracks on each node via `x/y/z` after
  // the first tick.
  useEffect(() => {
    if (!selectedNodeId) return;
    const fg = fgRef.current;
    if (!fg) return;
    flyToNode(fg, data.nodes, selectedNodeId);
  }, [selectedNodeId, data.nodes]);

  // Directory pan-to: when the user picks a folder in the sidebar, fly the
  // camera to the centroid of nodes under that subtree. Same UX as the 2D
  // canvas's `cy.animate({ fit: { eles: matched } })`.
  useEffect(() => {
    if (!focusedDirectory) return;
    const fg = fgRef.current;
    if (!fg) return;
    const matching = (data.nodes as Array<FgNode>).filter((n) =>
      isNodeUnderDirectory(n.id, focusedDirectory),
    );
    if (matching.length === 0) return;
    flyToCentroid(fg, matching);
  }, [focusedDirectory, data.nodes]);

  // Cycle isolation: when a cycle is picked from the inspector, fly to its
  // centroid so the user can actually see what they just clicked.
  useEffect(() => {
    if (!cycleNodeIds) return;
    const fg = fgRef.current;
    if (!fg) return;
    const matching = (data.nodes as Array<FgNode>).filter((n) => cycleNodeIds.has(n.id));
    if (matching.length === 0) return;
    flyToCentroid(fg, matching);
  }, [cycleNodeIds, data.nodes]);

  if (tooLarge) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-925 px-6 text-center">
        <h2 className="text-base font-semibold text-neutral-200">3D view disabled</h2>
        <p className="max-w-sm text-sm text-neutral-400">
          3D mode supports up to {MAX_3D_NODES.toLocaleString()} visible nodes. This filtered view
          has <strong className="text-neutral-200">{data.nodes.length.toLocaleString()}</strong>.
          Use the path mask or classification pills to filter first, or switch back to 2D.
        </p>
      </div>
    );
  }

  // ── Accessor closures (per-node / per-link styling) ──────────────────────
  //
  // Precedence (same as the 2D `applyOverlays`):
  //   cycle isolation > focus mode > blast radius > directory focus
  //                   > classification/path-mask.
  // Selection is layered on top in every branch.
  const colorForNode = (n: FgNode): string => {
    if (cycleNodeIds) {
      // Cycle isolation: the cycle nodes glow red; everything else fades out.
      if (cycleNodeIds.has(n.id)) return n.id === selectedNodeId ? SELECTED_COLOR : CYCLE_COLOR;
      return dimColor(n.color);
    }
    if (focusNeighborhood) {
      const inside = focusNeighborhood.depthByNode.has(n.id);
      if (focusModeRoot === n.id) return SELECTED_COLOR;
      return inside ? n.color : dimColor(n.color);
    }
    if (blastRadius) {
      const inside = blastRadius.depthByNode.has(n.id);
      // Selected root keeps the strong highlight; in-scope nodes keep their
      // own classification colour (the highlighted edges already mark them
      // as part of the blast).
      if (blastRadiusFor === n.id) return SELECTED_COLOR;
      return inside ? n.color : dimColor(n.color);
    }
    if (focusedDirectory && !isNodeUnderDirectory(n.id, focusedDirectory)) {
      return dimColor(n.color);
    }
    if (n.dimmed) return dimColor(n.color);
    return n.id === selectedNodeId ? SELECTED_COLOR : n.color;
  };

  const valForNode = (n: FgNode): number => {
    if (n.id === selectedNodeId || n.id === blastRadiusFor || n.id === focusModeRoot) {
      return n.val * 1.7;
    }
    if (cycleNodeIds?.has(n.id)) return n.val * 1.3;
    return n.val;
  };

  const colorForLink = (l: FgLink): string => {
    const sId: string = l.source.id ?? l.source;
    const tId: string = l.target.id ?? l.target;
    if (cycleNodeIds) {
      const inCycleEdge = cycleEdgeKeys?.has(`${sId}|${tId}`) ?? false;
      if (inCycleEdge) return CYCLE_COLOR;
      return dimEdgeColor;
    }
    if (l.inCycle) return CYCLE_COLOR;
    if (focusNeighborhood) {
      const sIn = focusNeighborhood.depthByNode.has(sId);
      const tIn = focusNeighborhood.depthByNode.has(tId);
      return sIn && tIn ? NEUTRAL_EDGE_3D : dimEdgeColor;
    }
    if (blastRadius) {
      const sIn = blastRadius.depthByNode.has(sId);
      const tIn = blastRadius.depthByNode.has(tId);
      return sIn && tIn ? BLAST_BORDER : dimEdgeColor;
    }
    if (focusedDirectory) {
      const sIn = isNodeUnderDirectory(sId, focusedDirectory);
      const tIn = isNodeUnderDirectory(tId, focusedDirectory);
      return sIn && tIn ? NEUTRAL_EDGE_3D : dimEdgeColor;
    }
    return l.dimmed ? dimEdgeColor : NEUTRAL_EDGE_3D;
  };

  const widthForLink = (l: FgLink): number => {
    const sId: string = l.source.id ?? l.source;
    const tId: string = l.target.id ?? l.target;
    if (cycleEdgeKeys?.has(`${sId}|${tId}`)) return 2.4;
    if (l.inCycle) return 2.0;
    if (blastRadius) {
      const sIn = blastRadius.depthByNode.has(sId);
      const tIn = blastRadius.depthByNode.has(tId);
      if (sIn && tIn) return 1.6;
    }
    if (focusNeighborhood) {
      const sIn = focusNeighborhood.depthByNode.has(sId);
      const tIn = focusNeighborhood.depthByNode.has(tId);
      if (sIn && tIn) return 1.4;
    }
    return l.dimmed ? 0.4 : 1.1;
  };

  /**
   * Sprite cache for filename labels. Building a CanvasTexture per node is
   * expensive (`~1 ms` each); cache by id + visual variant so swapping an
   * overlay only rebuilds the affected sprites. The map is intentionally
   * not garbage-collected; for the node-counts we render in 3D (≤ 5k), a
   * few hundred labels' worth of textures is trivial memory.
   */
  const labelCacheRef = useRef<Map<string, THREE.Sprite>>(new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: cache clearing on overlay swap.
  useEffect(() => {
    // Drop stale sprites when the overlay swaps so colour / contents stay correct.
    for (const sprite of labelCacheRef.current.values()) disposeSprite(sprite);
    labelCacheRef.current.clear();
  }, [cycleNodeIds, focusNeighborhood, blastRadius, focusedDirectory]);

  /**
   * `nodeThreeObject` accessor with `nodeThreeObjectExtend=true`: the
   * returned sprite ADDS to the default sphere rather than replacing.
   *
   * Every node gets a label now (was: only in-scope when an overlay was
   * active). In-scope nodes get the larger, accent-coloured "emphasized"
   * variant so the focused subset still pops; everyone else gets the
   * smaller, neutral "default" variant.
   */
  const nodeThreeObject = (n: FgNode): THREE.Sprite | null => {
    const cache = labelCacheRef.current;
    const inOverlay = inScope?.has(n.id) ?? false;
    const variant: LabelVariant = inOverlay
      ? cycleNodeIds
        ? "cycle"
        : focusNeighborhood
          ? "focus"
          : blastRadius
            ? "blast"
            : "default"
      : "default";
    const cacheKey = `${n.id}|${variant}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const label = basename(n.id);
    const sprite = makeLabelSprite(label, variant);
    cache.set(cacheKey, sprite);
    return sprite;
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#050505]">
      <ForceGraph3D
        key={instanceKey}
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="#050505"
        // `preserveDrawingBuffer` keeps the WebGL back buffer readable after a
        // frame ends, which `canvas.toBlob` / `toDataURL` need to produce a
        // PNG/JPG export. Slight perf cost — fine for our node counts.
        rendererConfig={{ preserveDrawingBuffer: true, antialias: true }}
        showNavInfo={false}
        nodeId="id"
        nodeLabel={(n: FgNode) => `<div class="rfg-tip">${escapeHtml(n.label)}</div>`}
        nodeColor={colorForNode}
        nodeVal={valForNode}
        nodeOpacity={0.92}
        nodeResolution={12}
        // Custom three.js sprite labels for in-scope nodes (blast/focus/dir/cycle).
        // `nodeThreeObjectExtend` keeps the default sphere AND adds our label.
        // The library's type says we must return an Object3D, but at runtime
        // `null` means "no extension"; that's the path we take for nodes
        // outside the active scope. Cast through `unknown` so the types line up.
        nodeThreeObject={nodeThreeObject as unknown as (n: FgNode) => THREE.Object3D}
        nodeThreeObjectExtend={true}
        linkColor={colorForLink}
        linkWidth={widthForLink}
        linkOpacity={0.85}
        linkDirectionalArrowLength={3.2}
        linkDirectionalArrowRelPos={0.96}
        // Animated particles for dynamic imports; gives the 3D view a bit
        // of motion that the static 2D canvas can't replicate.
        linkDirectionalParticles={(l: FgLink) => (l.kind === "dynamic" ? 2 : 0)}
        linkDirectionalParticleWidth={0.8}
        cooldownTicks={150}
        onEngineStop={() => {
          // The simulation has settled. Frame the camera on whatever ended
          // up in the scene exactly once per data revision — protects
          // against the "blank scene" symptom on rapid 2D↔3D toggles by
          // guaranteeing the viewport always contains the node cloud.
          if (framedOnceRef.current) return;
          framedOnceRef.current = true;
          fgRef.current?.zoomToFit?.(0, 60);
        }}
        onNodeClick={(n: FgNode) => setSelection(n.id)}
        onBackgroundClick={() => setSelection(null)}
      />
      <Overlay
        nodeCount={data.nodes.length}
        linkCount={data.links.length}
        overlay={
          cycleNodeIds
            ? `cycle · ${cycleNodeIds.size} nodes`
            : focusNeighborhood
              ? `focus · ${focusNeighborhood.size} nodes @ depth ${focusModeDepth}`
              : blastRadius
                ? `blast · ${blastRadius.size} dependents`
                : focusedDirectory
                  ? `directory · ${focusedDirectory}`
                  : null
        }
      />
    </div>
  );
}

function Overlay({
  nodeCount,
  linkCount,
  overlay,
}: {
  nodeCount: number;
  linkCount: number;
  overlay: string | null;
}) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 select-none space-y-1">
      <div className="rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-neutral-400">
        3D · {nodeCount.toLocaleString()} nodes · {linkCount.toLocaleString()} edges · press{" "}
        <kbd className="rounded bg-neutral-900 px-1 text-neutral-300">r</kbd> to reset camera
      </div>
      {overlay ? (
        <div className="rounded bg-amber-950/60 px-2 py-1 font-mono text-[10px] text-amber-300">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-925 text-sm text-neutral-500">
      Loading 3D renderer (three.js)…
    </div>
  );
}

/**
 * Reduced-contrast variant of a classification colour. Cytoscape achieves
 * the same effect by lowering element opacity; three.js / react-force-graph
 * doesn't expose per-node opacity natively, so we blend toward the dark
 * canvas background and let the renderer paint at full alpha. Result reads
 * the same way as the 2D dim; "still there, but pushed back".
 */
function dimColor(hex: string): string {
  // Blend ~25% colour with 75% dark grey.
  const rgb = parseHex(hex);
  if (!rgb) return "#2a2a2a";
  const mix = (c: number) => Math.round(c * 0.25 + 0x20 * 0.75);
  return `#${[mix(rgb.r), mix(rgb.g), mix(rgb.b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const dimEdgeColor = "#1a1a1a";
/**
 * Brighter than the 2D `NEUTRAL_EDGE` (#3a3a3a) because the 3D canvas sits
 * on an almost-black background where the 2D's mid-grey would disappear.
 * Kept neutral so the classification node colours stay the focal point.
 */
const NEUTRAL_EDGE_3D = "#6a6a6a";

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const v = Number.parseInt(m[1] as string, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * Smoothly orbit-fly the camera so the named node sits centred and at a
 * reasonable viewing distance. Falls back gracefully if the simulation
 * hasn't produced coordinates yet (very first frame).
 */
// biome-ignore lint/suspicious/noExplicitAny: react-force-graph fg ref is loose.
function flyToNode(fg: any, nodes: Array<FgNode>, id: string): void {
  const live = (nodes as Array<{ id: string; x?: number; y?: number; z?: number }>).find(
    (n) => n.id === id,
  );
  if (!live || live.x === undefined || live.y === undefined || live.z === undefined) return;
  const distance = 120;
  const distRatio = 1 + distance / Math.hypot(live.x, live.y, live.z || 1);
  fg.cameraPosition?.(
    { x: live.x * distRatio, y: live.y * distRatio, z: (live.z ?? 0) * distRatio },
    { x: live.x, y: live.y, z: live.z ?? 0 },
    1200,
  );
}

/**
 * Fly the camera to the geometric mean of a node group's positions; the
 * 3D analogue of Cytoscape's `cy.fit({ eles: matched })`. Used by the
 * directory pan-to: clicking a folder in the sidebar reframes the camera
 * onto everything inside it.
 */
// biome-ignore lint/suspicious/noExplicitAny: fg ref is loose.
function flyToCentroid(fg: any, nodes: Array<FgNode>): void {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (const n of nodes as Array<{ x?: number; y?: number; z?: number }>) {
    if (n.x === undefined || n.y === undefined || n.z === undefined) continue;
    sx += n.x;
    sy += n.y;
    sz += n.z;
    count++;
  }
  if (count === 0) return;
  const cx = sx / count;
  const cy = sy / count;
  const cz = sz / count;
  const distance = 200;
  const distRatio = 1 + distance / (Math.hypot(cx, cy, cz) || 1);
  fg.cameraPosition?.(
    { x: cx * distRatio, y: cy * distRatio, z: cz * distRatio },
    { x: cx, y: cy, z: cz },
    1400,
  );
}

type LabelVariant = "default" | "focus" | "blast" | "cycle";

interface VariantStyle {
  fontSize: number;
  /** sprite-to-world divisor; smaller = bigger world-units. */
  worldDivisor: number;
  color: string;
}

const LABEL_VARIANTS: Record<LabelVariant, VariantStyle> = {
  // Default = "always on" label, matching the 2D canvas's outlined text
  // (light fill + near-black stroke). No background pill; the stroke is
  // what keeps the filename legible against bright spheres or the dark void.
  default: {
    fontSize: 30,
    worldDivisor: 8,
    color: "#e2e8f0",
  },
  focus: {
    fontSize: 38,
    worldDivisor: 6.5,
    color: SELECTED_COLOR,
  },
  blast: {
    fontSize: 38,
    worldDivisor: 6.5,
    color: BLAST_BORDER,
  },
  cycle: {
    fontSize: 38,
    worldDivisor: 6.5,
    color: CYCLE_COLOR,
  },
};

/**
 * Build a `THREE.Sprite` showing `text` as outlined text — no background pill,
 * just a near-black stroke around the fill, mirroring the 2D canvas's label
 * treatment (`text-outline-color: #050505`). The sprite renders as a billboard
 * (always faces the camera) and is positioned at the node's centre.
 *
 * Variants:
 *  - `default` — every node when no overlay is active. Light fill, dark stroke.
 *  - `focus` / `blast` / `cycle` — emphasised label tinted with the overlay
 *    accent so the in-scope subset stands out.
 *
 * Owned by `labelCacheRef`; the caller is responsible for disposal on
 * cache flush (`disposeSprite` releases the GPU texture).
 */
function makeLabelSprite(text: string, variant: LabelVariant): THREE.Sprite {
  const style = LABEL_VARIANTS[variant];
  const { fontSize, color } = style;
  // Stroke width scales with font size so the outline reads the same across
  // variants. ~13% of font size matches the 2D `text-outline-width: 1.5` at
  // `font-size: 9` proportion.
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.16));
  // Extra padding so the stroke isn't clipped at the canvas edges.
  const padX = strokeWidth + 2;
  const padY = strokeWidth + 2;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

  // Measure once, then size the canvas to fit.
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (mctx) mctx.font = font;
  const textWidth = mctx ? Math.ceil(mctx.measureText(text).width) : text.length * fontSize * 0.6;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((textWidth + padX * 2) * dpr);
  canvas.height = Math.ceil((fontSize + padY * 2) * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const cx = canvas.width / (2 * dpr);
    const cy = canvas.height / (2 * dpr);
    // Outline first, fill on top — same trick the 2D canvas uses via
    // `text-outline-*` to keep small labels readable against any background.
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = "#050505";
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  // World-unit scale tuned so labels read at the default camera distance
  // without dominating the scene. The divisor turns the canvas's pixel-ish
  // dimensions into reasonable world coords — variants pick their own
  // value so emphasised labels can be bigger than the always-on defaults.
  const worldH = canvas.height / dpr / style.worldDivisor;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldH * aspect, worldH, 1);
  // Centered on the node (0,0,0) — `renderOrder: 1` + `depthTest: false`
  // keeps the label readable even when it overlaps the sphere.
  sprite.position.set(0, 0, 0);
  sprite.renderOrder = 1;
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite): void {
  const material = sprite.material as THREE.SpriteMaterial;
  if (material.map) material.map.dispose();
  material.dispose();
}

function basename(id: string): string {
  const idx = id.lastIndexOf("/");
  return idx === -1 ? id : id.slice(idx + 1);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
