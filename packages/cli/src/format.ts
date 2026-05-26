import type { Graph, Node as GraphNode } from "@depmod/types";
import kleur from "kleur";

const TOP_N = 5;
const CLASSIFICATION_ORDER = ["page", "api", "hook", "component", "lib", "test", "config"] as const;

export interface FormatOptions {
  /** Disable ANSI colours regardless of TTY detection (useful for tests). */
  noColor?: boolean;
}

/**
 * Render a human-readable summary table of an analyzed Graph. The output mirrors
 * the structure thesis evaluators will quote in Chapter 4: stats block,
 * classification breakdown, top-instability nodes, top-afferent-coupling nodes.
 */
export function summarize(graph: Graph, options: FormatOptions = {}): string {
  const k = options.noColor ? noColor() : kleur;
  const lines: string[] = [];

  lines.push(k.bold("Stats"));
  lines.push(`  ${pad("Files", 8)} ${k.cyan(String(graph.stats.files))}`);
  lines.push(`  ${pad("Nodes", 8)} ${k.cyan(String(graph.stats.nodes))}`);
  lines.push(`  ${pad("Edges", 8)} ${k.cyan(String(graph.stats.edges))}`);
  lines.push(
    `  ${pad("Cycles", 8)} ${graph.stats.cycles > 0 ? k.red(String(graph.stats.cycles)) : k.cyan("0")}`,
  );
  lines.push(`  ${pad("Parse", 8)} ${k.cyan(`${graph.stats.parseMs}ms`)}`);

  lines.push("");
  lines.push(k.bold("Classification"));
  const counts = countByClassification(graph.nodes);
  for (const cls of CLASSIFICATION_ORDER) {
    const count = counts.get(cls) ?? 0;
    lines.push(`  ${pad(cls, 12)} ${k.cyan(String(count))}`);
  }

  const topInstability = pickTop(
    graph.nodes,
    (a, b) => b.metrics.instability - a.metrics.instability,
  );
  if (topInstability.length > 0) {
    lines.push("");
    lines.push(k.bold(`Top instability (${topInstability.length})`));
    for (const n of topInstability) {
      const i = n.metrics.instability.toFixed(3);
      lines.push(
        `  ${k.yellow(i)}  ${pad(n.id, 44)} ${k.dim(`Ce=${n.metrics.Ce}  Ca=${n.metrics.Ca}`)}`,
      );
    }
  }

  const topAfferent = pickTop(graph.nodes, (a, b) => b.metrics.Ca - a.metrics.Ca);
  if (topAfferent.length > 0 && (topAfferent[0]?.metrics.Ca ?? 0) > 0) {
    lines.push("");
    lines.push(k.bold(`Top afferent coupling (${topAfferent.length})`));
    for (const n of topAfferent) {
      lines.push(`  ${k.yellow(`Ca=${pad(String(n.metrics.Ca), 3)}`)}  ${n.id}`);
    }
  }

  if (graph.cycles.length > 0) {
    lines.push("");
    lines.push(k.bold(k.red(`Cycles (${graph.cycles.length})`)));
    for (const cycle of graph.cycles.slice(0, TOP_N)) {
      lines.push(`  ${k.red("●")} ${cycle.nodes.join(" → ")} → ${cycle.nodes[0]}`);
    }
    if (graph.cycles.length > TOP_N) {
      lines.push(k.dim(`  …and ${graph.cycles.length - TOP_N} more`));
    }
  }

  return lines.join("\n");
}

function countByClassification(nodes: readonly GraphNode[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const n of nodes) out.set(n.classification, (out.get(n.classification) ?? 0) + 1);
  return out;
}

function pickTop(
  nodes: readonly GraphNode[],
  cmp: (a: GraphNode, b: GraphNode) => number,
): GraphNode[] {
  return [...nodes].sort(cmp).slice(0, TOP_N);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function noColor() {
  const passthrough = (s: string) => s;
  return new Proxy(kleur, {
    get() {
      return passthrough;
    },
  }) as typeof kleur;
}
