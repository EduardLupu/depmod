export {
  analyze,
  type AnalyzeOptions,
  type CacheStats,
  type FileFilter,
} from "./parser.js";
export { classify } from "./classify.js";
export { extractEdges, packageNameOf, type ExtractResult } from "./imports.js";
export { extractExports } from "./exports.js";
export { computeMetrics, type ComputeMetricsOptions } from "./metrics.js";
export { findCycles } from "./cycles.js";
export {
  buildFileFilter,
  parseGlobList,
  type BuildFileFilterOptions,
} from "./file-filter.js";
export { buildGitignore, type GitignoreMatcher } from "./gitignore.js";
export { detectWorkspaces, type DetectedWorkspace } from "./workspaces.js";
export {
  deadKindLabel,
  findDeadCode,
  findDeadCodeIds,
  type DeadKind,
  type DeadModule,
  type FindDeadCodeOptions,
} from "./dead-code.js";
export {
  findUnusedDependencies,
  type FindUnusedDepsOptions,
  type UnusedDependency,
} from "./unused-deps.js";
/**
 * Public parser version. Bump on every algorithm change; the incremental
 * cache uses this string as a whole-cache invalidation key, so a stale value
 * silently breaks correctness when consumers add a new field to the slice.
 */
export const PARSER_VERSION = "0.3.0";
