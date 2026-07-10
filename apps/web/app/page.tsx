"use client";

import { CodeViewer } from "@/components/code-viewer";
import { DirectoryTree } from "@/components/directory-tree";
import { Header } from "@/components/header";
import { Inspector } from "@/components/inspector";
import { LoadingScreen } from "@/components/loading-screen";
import { StatusBar } from "@/components/status-bar";
import { Toolbar } from "@/components/toolbar";
import { getSoloClassification } from "@/lib/classification-filters";
import { useGraphStore } from "@/lib/store";
import { useBlastRadiusShortcut } from "@/lib/use-blast-radius-shortcut";
import { useCodeViewerAutoOpen } from "@/lib/use-code-viewer-auto-open";
import { useCodeViewerShortcut } from "@/lib/use-code-viewer-shortcut";
import { useDetailViewShortcut } from "@/lib/use-detail-view-shortcut";
import { useFocusModeShortcuts } from "@/lib/use-focus-mode-shortcuts";
import { useServerGraphBootstrap } from "@/lib/use-server-graph-bootstrap";
import { useUrlStateSync } from "@/lib/use-url-state-sync";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Cytoscape touches `window` on import; defer to the client.
const CytoscapeCanvas = dynamic(
  () => import("@/components/cytoscape-canvas").then((m) => m.CytoscapeCanvas),
  { ssr: false, loading: () => <CanvasFallback /> },
);

// react-force-graph-3d / three.js is heavier and only loaded when the user
// first toggles into 3D mode. Both fall back to the same loading shell.
const ForceGraph3DCanvas = dynamic(
  () => import("@/components/force-graph-3d-canvas").then((m) => m.ForceGraph3DCanvas),
  { ssr: false, loading: () => <CanvasFallback /> },
);

// React Flow detail (hierarchical subtree of the selected node). Lazy-loaded
// for the same reason as 3D: keeps `@xyflow/react` out of the base bundle
// when the user never opens this view.
const ReactFlowDetail = dynamic(
  () => import("@/components/react-flow-detail").then((m) => m.ReactFlowDetail),
  { ssr: false, loading: () => <CanvasFallback /> },
);

/**
 * Root page. The app is always launched by `depmod-ui`, which spawns the
 * Next server with a session file pointing at the freshly-analysed graph.
 * No landing screen, no file picker, no `/graph` sub-route — just the
 * dashboard, served at `/`.
 */
export default function DashboardPage() {
  useBlastRadiusShortcut();
  useFocusModeShortcuts();
  useCodeViewerShortcut();
  useDetailViewShortcut();
  useCodeViewerAutoOpen();
  useUrlStateSync();
  const { showLoadingScreen, progress } = useServerGraphBootstrap();
  const graph = useGraphStore((s) => s.graph);
  const directoryTreeOpen = useGraphStore((s) => s.directoryTreeOpen);
  const codeViewerOpen = useGraphStore((s) => s.codeViewerOpen);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const watchStatus = useGraphStore((s) => s.watchStatus);
  const viewMode = useGraphStore((s) => s.viewMode);
  const classificationModes = useGraphStore((s) => s.classificationModes);
  const soloClassification = getSoloClassification(classificationModes);

  // Once the user has visited 3D, keep the canvas mounted forever. Toggling
  // back to 2D and forward again is a pure CSS visibility flip — no React
  // unmount, no three.js renderer churn. react-force-graph-3d caches some
  // internal state across its mount cycle that occasionally left the scene
  // blank after a rapid 2D ↔ 3D ↔ 2D ↔ 3D sequence; persistent mount
  // sidesteps the issue entirely.
  const [has3DBeenUsed, setHas3DBeenUsed] = useState(false);
  useEffect(() => {
    if (viewMode === "3d") setHas3DBeenUsed(true);
  }, [viewMode]);

  // Same "mount once, then keep" pattern for the detail view. React Flow is
  // cheaper than three.js but re-mounting still resets pan/zoom and re-runs
  // the dagre layout, which jitters as the user toggles between modes.
  const [hasDetailBeenUsed, setHasDetailBeenUsed] = useState(false);
  useEffect(() => {
    if (viewMode === "detail") setHasDetailBeenUsed(true);
  }, [viewMode]);

  if (showLoadingScreen) {
    return <LoadingScreen progress={progress} />;
  }

  if (!graph) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="text-xl font-semibold text-neutral-200">No graph available</h2>
          <p className="max-w-sm text-neutral-400">
            This page is served by the{" "}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-sm">
              depmod-ui
            </code>{" "}
            CLI. Run it against a project root and the dashboard will pick up the analysed graph
            automatically.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      {soloClassification ? (
        <div className="border-b border-violet-900/50 bg-violet-950/30 px-4 py-2 text-center text-xs text-violet-200/90">
          Showing only <strong className="font-medium">{soloClassification}</strong> nodes; click
          the pill again to return to normal
        </div>
      ) : null}
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        {directoryTreeOpen ? <DirectoryTree graph={graph} /> : null}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* Both canvases live in the same stacking context, layered absolutely.
              `visibility: hidden` keeps layout/size intact (so ResizeObservers
              keep firing) while preventing pointer + visual interaction. */}
          <div
            className={`absolute inset-0 ${
              viewMode === "2d" ? "z-10" : "pointer-events-none invisible z-0"
            }`}
            aria-hidden={viewMode !== "2d"}
          >
            <CytoscapeCanvas graph={graph} />
          </div>
          {has3DBeenUsed ? (
            <div
              className={`absolute inset-0 ${
                viewMode === "3d" ? "z-10" : "pointer-events-none invisible z-0"
              }`}
              aria-hidden={viewMode !== "3d"}
            >
              <ForceGraph3DCanvas graph={graph} />
            </div>
          ) : null}
          {hasDetailBeenUsed ? (
            <div
              className={`absolute inset-0 ${
                viewMode === "detail" ? "z-10" : "pointer-events-none invisible z-0"
              }`}
              aria-hidden={viewMode !== "detail"}
            >
              {selectedNodeId ? (
                <ReactFlowDetail graph={graph} rootId={selectedNodeId} />
              ) : (
                <DetailEmpty />
              )}
            </div>
          ) : null}
        </div>
        <Inspector graph={graph} />
        {codeViewerOpen ? <CodeViewer nodeId={selectedNodeId} /> : null}
      </div>
      <StatusBar graph={graph} watchStatus={watchStatus} />
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-925 text-sm text-neutral-500">
      Loading canvas…
    </div>
  );
}

function DetailEmpty() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-925 px-6 text-center">
      <p className="text-sm text-neutral-500">Select a module</p>
    </div>
  );
}
