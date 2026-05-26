import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const ClassificationSchema = z.enum([
  "page",
  "component",
  "hook",
  "api",
  "lib",
  "test",
  "config",
]);
export type Classification = z.infer<typeof ClassificationSchema>;

export const EdgeKindSchema = z.enum(["import", "type-only", "dynamic"]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const ExportSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
});
export type Export = z.infer<typeof ExportSchema>;

export const MetricsSchema = z.object({
  Ca: z.number().int().nonnegative(),
  Ce: z.number().int().nonnegative(),
  instability: z.number().min(0).max(1),
});
export type Metrics = z.infer<typeof MetricsSchema>;

export const NodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  classification: ClassificationSchema,
  loc: z.number().int().nonnegative(),
  // On-disk size in bytes. Optional for backward-compatibility with v1 graphs
  // emitted before this field existed; consumers should treat absence as unknown.
  bytes: z.number().int().nonnegative().optional(),
  exports: z.array(ExportSchema),
  // Coupling metrics computed over the full directed multigraph, counting every
  // edge kind (import, type-only, dynamic). Required for v1 disk format.
  metrics: MetricsSchema,
  // Coupling metrics computed over only the edges that survive at runtime
  // (default: excludes `type-only`). Optional so older v1 graphs still
  // validate; consumers must fall back to `metrics` when absent.
  metricsRuntimeOnly: MetricsSchema.optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  kind: EdgeKindSchema,
});
export type Edge = z.infer<typeof EdgeSchema>;

export const CycleSchema = z.object({
  nodes: z.array(z.string().min(1)).min(2),
});
export type Cycle = z.infer<typeof CycleSchema>;

export const StatsSchema = z.object({
  files: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  cycles: z.number().int().nonnegative(),
  parseMs: z.number().nonnegative(),
});
export type Stats = z.infer<typeof StatsSchema>;

// Auto-detected monorepo workspaces. Optional + additive so older v1 graphs
// still validate; consumers fall back to the empty list when absent.
export const WorkspaceSchema = z.object({
  /** Workspace package name (`@scope/foo`) or its directory name as a fallback. */
  name: z.string().min(1),
  /** Workspace path relative to `Graph.rootDir`, POSIX form. */
  path: z.string().min(1),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

// Bare-module specifiers per source file. Used downstream to detect unused
// npm dependencies. Optional + additive: older graphs simply omit it and
// consumers treat the map as empty.
export const ExternalDependenciesSchema = z.record(z.string(), z.array(z.string()));
export type ExternalDependencies = z.infer<typeof ExternalDependenciesSchema>;

// npm dependencies declared in package.json but not imported by any source
// file. Pre-computed during `analyze()` so the web UI can render it without
// filesystem access.
export const UnusedDependencySchema = z.object({
  workspace: z.string(),
  name: z.string().min(1),
  kind: z.enum(["dependencies", "devDependencies"]),
});
export type UnusedDependency = z.infer<typeof UnusedDependencySchema>;

export const GraphSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  rootDir: z.string().min(1),
  stats: StatsSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  cycles: z.array(CycleSchema),
  workspaces: z.array(WorkspaceSchema).optional(),
  externalDependencies: ExternalDependenciesSchema.optional(),
  unusedDependencies: z.array(UnusedDependencySchema).optional(),
});
export type Graph = z.infer<typeof GraphSchema>;

export function parseGraph(value: unknown): Graph {
  return GraphSchema.parse(value);
}

export function safeParseGraph(value: unknown) {
  return GraphSchema.safeParse(value);
}
