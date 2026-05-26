import { defineConfig } from "tsup";

/**
 * The CLI ships as a single bundled entry. Two workspace-internal packages
 * (`@depmod/parser`, `@depmod/types`) are inlined so the published tarball has
 * no `@depmod/*` runtime references — the registry never sees those names.
 *
 * Heavy runtime deps stay `external` so they install fresh and de-dupe with
 * whatever else the user has globally. Anything inlined would also bloat the
 * sourcemap and break `--inspect`-style tooling.
 *
 * The shebang banner doubles as a hard Node-version gate: anyone on < 20.18
 * gets a clear error instead of a cryptic ESM/loader stack trace.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  dts: false,
  shims: false,
  treeshake: true,
  noExternal: ["@depmod/parser", "@depmod/types"],
  external: [
    "chokidar",
    "commander",
    "kleur",
    "ts-morph",
    "typescript",
    "ignore",
    "picomatch",
    "yaml",
  ],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "if (Number(process.versions.node.split('.')[0]) < 20) {",
      "  console.error('depmod-ui requires Node.js >= 20.18. Detected ' + process.version + '.');",
      "  process.exit(1);",
      "}",
    ].join("\n"),
  },
});
