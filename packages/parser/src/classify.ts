import type { Classification } from "@depmod/types";
import { isConfigFilePath, isTestFilePath } from "@depmod/types";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";

const HTTP_VERBS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]);

/**
 * Classify a source file by architectural role. Precedence-ordered:
 *   test > config > api > page > hook > component > lib
 *
 * Test and config are checked first because their file-name conventions
 * (`*.test.ts`, `*.config.ts`, `*.d.ts`) are the strongest signal; a file
 * named `vite.config.ts` is config even if it happens to export an HTTP-verb
 * identifier or a PascalCase symbol.
 *
 * `relPath` must be a forward-slash POSIX path relative to the project root.
 */
export function classify(relPath: string, sourceFile: SourceFile): Classification {
  if (isTestFilePath(relPath)) return "test";
  if (isConfigFilePath(relPath)) return "config";
  if (isApi(relPath, sourceFile)) return "api";
  if (isPage(relPath)) return "page";
  if (isHook(relPath, sourceFile)) return "hook";
  if (isComponent(relPath, sourceFile)) return "component";
  return "lib";
}

function isPage(relPath: string): boolean {
  // App Router: app/**/page.{ts,tsx}, app/**/layout.{ts,tsx}
  if (/(^|\/)app\/.*\/(page|layout)\.(tsx?|jsx?)$/.test(relPath)) return true;
  if (/(^|\/)app\/(page|layout)\.(tsx?|jsx?)$/.test(relPath)) return true;
  // Pages Router: pages/**/*.{ts,tsx} but NOT pages/api/**
  if (/(^|\/)pages\/api\//.test(relPath)) return false;
  if (/(^|\/)pages\/.*\.(tsx?|jsx?)$/.test(relPath)) return true;
  return false;
}

function isApi(relPath: string, sourceFile: SourceFile): boolean {
  // App Router route handlers: app/**/route.{ts,tsx}
  if (/(^|\/)app\/.*\/route\.(tsx?|jsx?)$/.test(relPath)) return true;
  // Pages Router API: pages/api/**
  if (/(^|\/)pages\/api\/.*\.(tsx?|jsx?)$/.test(relPath)) return true;
  // Server-only convention: *.server.{ts,tsx}
  if (/\.server\.(tsx?|jsx?)$/.test(relPath)) return true;
  // Heuristic: a module that exports any HTTP-verb function
  if (exportsHttpVerb(sourceFile)) return true;
  return false;
}

function isHook(relPath: string, sourceFile: SourceFile): boolean {
  if (isHookFileName(relPath)) return true;
  return exportsUseHook(sourceFile);
}

function isHookFileName(relPath: string): boolean {
  const base = relPath.split("/").pop() ?? "";
  return /^use[A-Z][A-Za-z0-9]*\.(tsx?|jsx?)$/.test(base);
}

function exportsUseHook(sourceFile: SourceFile): boolean {
  for (const [name] of sourceFile.getExportedDeclarations()) {
    if (/^use[A-Z]/.test(name)) return true;
  }
  return false;
}

function isComponent(relPath: string, sourceFile: SourceFile): boolean {
  // Only .tsx / .jsx files can host React components
  if (!/\.(tsx|jsx)$/.test(relPath)) return false;
  return exportsPascalCaseIdentifier(sourceFile);
}

function exportsHttpVerb(sourceFile: SourceFile): boolean {
  for (const [name] of sourceFile.getExportedDeclarations()) {
    if (HTTP_VERBS.has(name)) return true;
  }
  return false;
}

function exportsPascalCaseIdentifier(sourceFile: SourceFile): boolean {
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name === "default") {
      // For `export default`, check the default-export expression for a usable name
      for (const decl of declarations) {
        const text = decl.getText();
        if (/^function\s+[A-Z]/.test(text)) return true;
        const declKind = decl.getKind();
        if (
          declKind === SyntaxKind.ClassDeclaration ||
          declKind === SyntaxKind.FunctionDeclaration
        ) {
          // ts-morph types these as NamedDeclaration with getName()
          const named = decl as { getName?: () => string | undefined };
          const declName = named.getName?.();
          if (declName && /^[A-Z]/.test(declName)) return true;
        }
      }
      // Bare `export default <Identifier>` reaches here without a useful name.
      // Fall back to filename below.
      continue;
    }
    if (/^[A-Z]/.test(name)) return true;
  }
  // Fallback: filename itself is PascalCase (`Header.tsx`, `UserCard.tsx`).
  const base = sourceFile.getBaseName().replace(/\.(tsx|jsx)$/, "");
  return /^[A-Z]/.test(base);
}
