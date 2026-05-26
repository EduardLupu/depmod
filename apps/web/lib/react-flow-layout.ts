import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import dagre from "dagre";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 60;

/**
 * Apply a top-down hierarchical dagre layout to React Flow nodes. Mutates nothing;
 * returns a new array of nodes with `position` set. Edges are returned unchanged.
 */
export function layoutHierarchical<N extends RFNode, E extends RFEdge>(
  nodes: N[],
  edges: E[],
): { nodes: N[]; edges: E[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 40,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laidOut = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOut, edges };
}
