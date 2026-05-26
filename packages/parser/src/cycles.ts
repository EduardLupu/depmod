import type { Cycle, Edge } from "@depmod/types";

/**
 * Find strongly-connected components of size >= 2 (i.e. real cycles) using Tarjan's
 * algorithm. Self-loops are not reported; the parser already skips self-edges, so
 * SCCs of size 1 reaching this code are necessarily non-cyclic single nodes.
 *
 * Implementation is iterative to avoid blowing the JS stack on large codebases
 * (cal.com-scale projects have >= 10 000 modules; default Node.js stack handles
 * around 10 000 recursion frames before throwing RangeError).
 *
 * Output is deterministic: nodes within each cycle are sorted alphabetically, and
 * the cycle list itself is sorted by its first (smallest) node id.
 */
export function findCycles(
  nodeIds: readonly string[],
  edges: readonly Pick<Edge, "source" | "target">[],
): Cycle[] {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    if (e.source === e.target) continue;
    const list = adj.get(e.source);
    // Dedupe: multi-edges between the same pair contribute one adjacency only.
    if (list && !list.includes(e.target)) list.push(e.target);
  }

  // Tarjan state
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  // Iterative DFS with an explicit call stack. Each frame tracks the current node
  // and an iterator pointer into its adjacency list.
  type Frame = { node: string; i: number };

  for (const start of nodeIds) {
    if (indices.has(start)) continue;
    const callStack: Frame[] = [{ node: start, i: 0 }];
    indices.set(start, index);
    lowlink.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      if (!frame) break;
      const neighbours = adj.get(frame.node) ?? [];

      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i];
        frame.i++;
        if (w === undefined) continue;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlink.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          callStack.push({ node: w, i: 0 });
        } else if (onStack.has(w)) {
          const v = frame.node;
          const vLow = lowlink.get(v);
          const wIndex = indices.get(w);
          if (vLow !== undefined && wIndex !== undefined) {
            lowlink.set(v, Math.min(vLow, wIndex));
          }
        }
      } else {
        // All neighbours explored; finalise this node.
        const v = frame.node;
        if (lowlink.get(v) === indices.get(v)) {
          const scc: string[] = [];
          while (true) {
            const w = stack.pop();
            if (w === undefined) break;
            onStack.delete(w);
            scc.push(w);
            if (w === v) break;
          }
          if (scc.length >= 2) sccs.push(scc);
        }
        callStack.pop();
        // Propagate lowlink up to the parent frame.
        const parent = callStack[callStack.length - 1];
        if (parent) {
          const parentLow = lowlink.get(parent.node);
          const vLow = lowlink.get(v);
          if (parentLow !== undefined && vLow !== undefined) {
            lowlink.set(parent.node, Math.min(parentLow, vLow));
          }
        }
      }
    }
  }

  const cycles: Cycle[] = sccs.map((scc) => ({
    nodes: [...scc].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  }));
  cycles.sort((a, b) => {
    const A = a.nodes[0] ?? "";
    const B = b.nodes[0] ?? "";
    return A < B ? -1 : A > B ? 1 : 0;
  });
  return cycles;
}
