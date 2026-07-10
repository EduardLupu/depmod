"use client";

import {
  Background,
  Controls,
  type Edge as RFEdge,
  type Node as RFNode,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MODULE_NODE_TYPE, ModuleNode, type ModuleNodeData } from "@/components/module-node";
import { computeBlastRadius } from "@/lib/blast-radius";
import { BLAST_BORDER, BLAST_COLOR, CANVAS_BG, CYCLE_COLOR, NEUTRAL_EDGE } from "@/lib/colors";
import { layoutHierarchical } from "@/lib/react-flow-layout";
import { useGraphStore } from "@/lib/store";
import { DEFAULT_DETAIL_DEPTH, extractSubtree } from "@/lib/subtree";
import type { Graph } from "@depmod/types";
import { useMemo } from "react";

const nodeTypes = { [MODULE_NODE_TYPE]: ModuleNode };

interface ReactFlowDetailProps {
  graph: Graph;
  rootId: string;
}

export function ReactFlowDetail({ graph, rootId }: ReactFlowDetailProps) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelection = useGraphStore((s) => s.setSelection);
  const blastRadiusFor = useGraphStore((s) => s.blastRadiusFor);

  const { rfNodes, rfEdges, subtreeSize, truncated, missing, blastInSubtree } = useMemo(() => {
    if (!graph.nodes.some((n) => n.id === rootId)) {
      return {
        rfNodes: [],
        rfEdges: [],
        subtreeSize: 0,
        truncated: false,
        missing: true,
        blastInSubtree: 0,
      };
    }
    const subtree = extractSubtree(graph, rootId);
    const subtreeIds = new Set(subtree.nodes.map((n) => n.id));
    const cycleEdgeKeys = buildCycleEdgeKeys(graph);

    // Blast radius is computed against the full graph but only nodes inside the
    // current subtree are highlighted; "what within this page's subtree depends
    // on the selected module?".
    const fullBlast = blastRadiusFor ? computeBlastRadius(graph, blastRadiusFor) : null;
    const blastInSubtreeMap = new Map<string, number>();
    if (fullBlast) {
      for (const [id, depth] of fullBlast.depthByNode) {
        if (subtreeIds.has(id)) blastInSubtreeMap.set(id, depth);
      }
    }

    const rawNodes: RFNode<ModuleNodeData>[] = subtree.nodes.map((n) => ({
      id: n.id,
      type: MODULE_NODE_TYPE,
      position: { x: 0, y: 0 },
      data: {
        basename: n.name,
        fullPath: n.id,
        classification: n.classification,
        loc: n.loc,
        instability: n.metrics.instability,
        isRoot: n.id === rootId,
        isSelected: n.id === selectedNodeId,
      },
      style: blastStyleFor(blastInSubtreeMap.get(n.id), fullBlast !== null),
    }));

    const rawEdges: RFEdge[] = subtree.edges.map((e) => {
      const key = `${e.source}|${e.target}|${e.kind}`;
      const inCycle = cycleEdgeKeys.has(key);
      const dashed = e.kind !== "import";
      const bothInBlast = blastInSubtreeMap.has(e.source) && blastInSubtreeMap.has(e.target);
      const stroke = bothInBlast ? BLAST_BORDER : inCycle ? CYCLE_COLOR : NEUTRAL_EDGE;
      return {
        id: key,
        source: e.source,
        target: e.target,
        animated: false,
        style: {
          stroke,
          strokeWidth: bothInBlast ? 2 : inCycle ? 2 : 1.25,
          strokeDasharray: dashed ? (e.kind === "dynamic" ? "2 4" : "5 5") : undefined,
          opacity: fullBlast && !bothInBlast ? 0.15 : 1,
        },
        markerEnd: { type: "arrow" as const, color: stroke },
      };
    });

    const laid = layoutHierarchical(rawNodes, rawEdges);
    return {
      rfNodes: laid.nodes,
      rfEdges: laid.edges,
      subtreeSize: subtree.nodes.length,
      truncated: subtree.truncated,
      missing: false,
      blastInSubtree: blastInSubtreeMap.size,
    };
  }, [graph, rootId, selectedNodeId, blastRadiusFor]);

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-neutral-925 text-center">
        <h2 className="text-lg font-semibold text-neutral-200">Node not found</h2>
        <p className="mt-2 max-w-sm text-sm text-neutral-500">
          <code className="rounded bg-neutral-900 px-1.5 py-0.5">{rootId}</code> is not present in
          the loaded graph.
        </p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => {
            const data = node.data as ModuleNodeData;
            setSelection(data.fullPath);
          }}
        >
          <Background color="#222" gap={20} />
          <Controls
            position="bottom-left"
            showInteractive={false}
            className="depmod-flow-controls"
          />
        </ReactFlow>

        <div
          className="pointer-events-none absolute left-4 top-4 rounded-md border border-neutral-800 bg-neutral-950/90 px-3 py-2 text-xs text-neutral-400 backdrop-blur"
          style={{ backgroundColor: CANVAS_BG }}
        >
          <span className="font-mono text-neutral-200">{rootId}</span>
          <span className="ml-2 text-neutral-500">
            · {subtreeSize} module{subtreeSize === 1 ? "" : "s"} in subtree
            {truncated ? ` (truncated at depth ${DEFAULT_DETAIL_DEPTH})` : ""}
          </span>
          {blastRadiusFor ? (
            <span className="ml-2" style={{ color: BLAST_COLOR }}>
              · blast radius: {blastInSubtree} in subtree
            </span>
          ) : null}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function blastStyleFor(depth: number | undefined, overlayActive: boolean) {
  if (!overlayActive) return undefined;
  if (depth === undefined) return { opacity: 0.18 };
  // Fully opaque at depth 0–1, fading to 0.6 by depth 5+.
  const t = Math.min(depth, 5) / 5;
  return { opacity: 1 - t * 0.4 };
}

function buildCycleEdgeKeys(graph: Graph): Set<string> {
  const keys = new Set<string>();
  for (const cycle of graph.cycles) {
    const set = new Set(cycle.nodes);
    for (const e of graph.edges) {
      if (set.has(e.source) && set.has(e.target)) {
        keys.add(`${e.source}|${e.target}|${e.kind}`);
      }
    }
  }
  return keys;
}
