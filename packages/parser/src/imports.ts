import type { Edge, EdgeKind } from "@depmod/types";
import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode, ts } from "ts-morph";
import { type AliasPattern, resolveAliasSpecifier } from "./workspace-aliases.js";

export interface ExtractResult {
  /** Internal edges; only specifiers that resolve to a file inside the project. */
  edges: Edge[];
  /**
   * Bare-module specifiers that did NOT resolve to a project-internal file;
   * the package names imported by this source file. Used by Track F to detect
   * unused dependencies. Excludes relative paths (`./`, `../`) and absolute
   * paths (`/`).
   */
  externals: string[];
}

/**
 * Extract edges and external specifiers for every import (static + type-only +
 * dynamic) reachable from `sourceFile`. Edges represent internal references;
 * externals are bare-module specifiers (e.g. `react`, `@fanduel/ui`) for
 * dependency-usage analysis.
 *
 * `aliasPatterns` is the union of `compilerOptions.paths` aliases from the
 * root tsconfig and every workspace tsconfig. ts-morph only honours the
 * single root tsconfig, so monorepo workspaces that declare their own
 * `@/*` alias would otherwise lose every internal import they make. The
 * fallback here resolves those specifiers manually.
 */
export function extractEdges(
  sourceFile: SourceFile,
  project: Project,
  toId: (absPath: string) => string | undefined,
  aliasPatterns: readonly AliasPattern[] = [],
): ExtractResult {
  const out: Edge[] = [];
  const externals: string[] = [];
  const sourceAbs = String(sourceFile.getFilePath());
  const sourceId = toId(sourceAbs);
  if (!sourceId) return { edges: out, externals };

  const seenEdge = new Set<string>();
  const seenExternal = new Set<string>();
  const addEdge = (target: SourceFile | undefined, kind: EdgeKind) => {
    if (!target) return;
    const targetId = toId(String(target.getFilePath()));
    if (!targetId || targetId === sourceId) return;
    const key = `${targetId} ${kind}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    out.push({ source: sourceId, target: targetId, kind });
  };
  const addExternal = (specifier: string) => {
    const name = packageNameOf(specifier);
    if (!name || seenExternal.has(name)) return;
    seenExternal.add(name);
    externals.push(name);
  };
  // Manual alias fallback for the edge side: when ts-morph's resolution
  // returned a node_modules `.d.ts` (or nothing), try to map the specifier
  // onto an internal source file using the workspace tsconfig `paths`.
  const aliasLookup = (specifier: string): SourceFile | undefined => {
    if (aliasPatterns.length === 0) return undefined;
    const resolvedAbs = resolveAliasSpecifier(sourceAbs, specifier, aliasPatterns);
    if (!resolvedAbs) return undefined;
    return project.getSourceFile(resolvedAbs);
  };
  // True if the specifier matches a known workspace alias prefix (e.g. `@/`),
  // even when the alias target couldn't be resolved this run. Lets us avoid
  // mis-classifying `@/missing-file` as an npm package.
  const matchesAliasPrefix = (specifier: string): boolean => {
    for (const a of aliasPatterns) {
      if (a.hasWildcard) {
        if (specifier.startsWith(a.prefix)) return true;
      } else if (specifier === a.prefix) {
        return true;
      }
    }
    return false;
  };
  // Resolve a specifier into either an internal SourceFile (for edges) or
  // null when it points outside the project. The key trick that fixes the
  // unused-deps false positives: ts-morph resolves npm bare-module
  // specifiers like `react` to their `.d.ts` files inside `node_modules`,
  // and the resulting SourceFile is NOT in the internal set — so the old
  // code dropped both the edge AND the external. Here we explicitly check
  // whether the resolved file is internal; if not, we treat the import as
  // unresolved-for-edge-purposes and let the external bookkeeping below
  // capture the package name.
  const resolveInternal = (
    target: SourceFile | undefined,
    specifier: string | undefined,
  ): SourceFile | undefined => {
    if (target) {
      const tid = toId(String(target.getFilePath()));
      if (tid) return target;
    }
    if (!specifier) return undefined;
    return aliasLookup(specifier);
  };
  // Anything that isn't a relative/absolute path and isn't an alias is an
  // npm bare-module specifier — even if ts-morph successfully resolved it
  // to a `.d.ts` file. Record it under the workspace so the unused-deps
  // report sees real usage instead of reporting `react` / `cytoscape` /
  // every UI-library import as unused.
  const recordExternalIfPackage = (specifier: string | undefined) => {
    if (!specifier) return;
    if (specifier.startsWith(".") || specifier.startsWith("/")) return;
    if (matchesAliasPrefix(specifier)) return;
    addExternal(specifier);
  };

  // Static imports (incl. `import type`).
  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    const target = resolveInternal(decl.getModuleSpecifierSourceFile(), specifier);
    if (target) {
      addEdge(target, decl.isTypeOnly() ? "type-only" : "import");
    } else {
      recordExternalIfPackage(specifier);
    }
  }

  // Re-exports: `export { x } from "./y"`, `export * from "./y"`.
  for (const decl of sourceFile.getExportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    const target = resolveInternal(decl.getModuleSpecifierSourceFile(), specifier);
    if (target) {
      addEdge(target, decl.isTypeOnly() ? "type-only" : "import");
    } else {
      recordExternalIfPackage(specifier);
    }
  }

  // Dynamic imports: `import("./foo")` expressions.
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const first = call.getArguments()[0];
    if (!first || !TsNode.isStringLiteral(first)) continue;
    const specifier = first.getLiteralValue();
    const target = resolveInternal(resolveSpecifier(sourceFile, specifier, project), specifier);
    if (target) {
      addEdge(target, "dynamic");
    } else {
      recordExternalIfPackage(specifier);
    }
  }

  externals.sort();
  return { edges: out, externals };
}

function resolveSpecifier(
  fromFile: SourceFile,
  specifier: string,
  project: Project,
): SourceFile | undefined {
  const compilerOptions = project.getCompilerOptions();
  const resolved = ts.resolveModuleName(
    specifier,
    String(fromFile.getFilePath()),
    compilerOptions,
    ts.sys,
  );
  const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
  if (!resolvedFileName) return undefined;
  return project.getSourceFile(resolvedFileName);
}

/**
 * Extract the npm-package portion of a bare-module specifier. Returns
 * `undefined` for relative (`./`, `../`), absolute (`/`), or workspace alias
 * specifiers we shouldn't surface as external deps.
 *
 *   "react"               -> "react"
 *   "react-dom/client"    -> "react-dom"
 *   "@scope/pkg"          -> "@scope/pkg"
 *   "@scope/pkg/sub/x"    -> "@scope/pkg"
 *   "./local"             -> undefined
 *   "/abs/path"           -> undefined
 *   ""                    -> undefined
 */
export function packageNameOf(specifier: string): string | undefined {
  if (!specifier) return undefined;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
  // Node builtins (`node:fs`, `fs`); surface the full builtin name; callers
  // can decide whether to treat them as deps.
  if (specifier.startsWith("node:")) return specifier;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length < 2) return undefined;
    return `${parts[0]}/${parts[1]}`;
  }
  return specifier.split("/")[0];
}
