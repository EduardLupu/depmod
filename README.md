<div align="center">
  <img src="https://raw.githubusercontent.com/EduardLupu/depmod/refs/heads/main/docs/img/logo.png" alt="depmod logo" width="240" />

  # depmod

  **See the shape of your codebase.** A terminal-launched, browser-rendered dependency graph explorer for TypeScript and JavaScript projects.

  [![npm version](https://img.shields.io/npm/v/depmod-ui?color=4f7fdf&label=depmod-ui)](https://www.npmjs.com/package/depmod-ui)
  [![npm downloads](https://img.shields.io/npm/dm/depmod-ui?color=4f7fdf)](https://www.npmjs.com/package/depmod-ui)
  [![CI](https://img.shields.io/github/actions/workflow/status/EduardLupu/depmod/ci.yml?branch=main&color=4f7fdf&label=CI)](https://github.com/EduardLupu/depmod/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/license-MIT-4f7fdf)](LICENSE)
  [![Node](https://img.shields.io/badge/node-%E2%89%A520.18-4f7fdf)](https://nodejs.org)

  <p>
    <a href="https://depmod.eduardlupu.com/">Live demo</a> ·
    <a href="#quickstart">Quickstart</a> ·
    <a href="#features">Features</a> ·
    <a href="#commands">CLI</a> ·
    <a href="#development">Develop</a> ·
    <a href="#how-it-works">Architecture</a> ·
    <a href="#contributing">Contribute</a>
  </p>
</div>

---

## What is depmod?

depmod is a small CLI that reads your TypeScript or JavaScript project, builds an import graph, and opens an interactive dashboard in your browser. It works on single apps, monorepos, and most setups that [ts-morph](https://ts-morph.com) can parse. Nothing is uploaded anywhere; parsing and the UI stay on your machine.

(Not the Linux `depmod` command, and not Depeche Mode, though I do love them :D)

Try the **[live demo](https://depmod.eduardlupu.com/)** — the dashboard exploring depmod's own dependency graph, updated on every release.

It is meant for the moment you land in a repo and need answers quickly:

- **Who sits in the middle of the graph?** Martin coupling (`Ca`, `Ce`, instability)
- **If I change this file, what breaks?** Blast radius (reverse reachability on the import graph)
- **What does this module actually pull in?** Focus mode around a node
- **Where are the import cycles?** Tarjan SCCs, with isolation per cycle
- **What looks unused?** Unreferenced files, type-only imports, thin stubs
- **What is declared in package.json but never imported?** Per-workspace static check

## Quickstart

### Install

**Global** (recommended if you reach for it often):

```sh
npm install -g depmod-ui
# or: pnpm add -g depmod-ui
# or: yarn global add depmod-ui
```

**One-off** (no install):

```sh
npx depmod-ui
```

### Run

After a global install, `depmod-ui` is on your `PATH`. With `npx`, prefix commands the same way.

```sh
# Current directory
depmod-ui

# Any project path
depmod-ui /path/to/project

# Re-parse when files change
depmod-ui . --watch
```

By default the dashboard listens on `http://127.0.0.1:45455`. If that port is busy, depmod-ui tries the next one so you can run several projects side by side.

## Features

| | |
| --- | --- |
| **Two canvases** | 2D Cytoscape (WebGL) for large graphs; 3D force-directed view for exploration. Switch with one click. |
| **Classification** | Modules tagged as `page`, `api`, `hook`, `component`, `lib`, `test`, or `config`. Filter, dim, solo, or hide by class. |
| **Path mask** | Comma-separated globs on the canvas, e.g. `**/*.tsx,!**/*.test.*` |
| **Inspector** | LOC, size, `Ca` / `Ce`, instability, exports, dependents, dependencies, rough bundle hint, cycle membership |
| **Blast radius** | Press `B` on a selection to highlight everything that depends on it |
| **Focus mode** | Press `F` to keep only an N-hop neighbourhood (even across hidden classes) |
| **Cycle isolation** | List cycles and isolate one to trace the loop |
| **Dead-code hints** | No importers, no exports, type-only usage, near-empty files |
| **Unused-deps report** | Compares `package.json` to real imports; respects monorepo `paths` |
| **Code viewer** | Press `C` or open source in a Monaco panel |
| **Live reload** | With `--watch`, saves trigger a re-parse over SSE; filters and selection stick |
| **Layout cache** | First layout can take a moment; later loads reuse cached positions per graph version |

## Commands

| Command | Purpose |
| --- | --- |
| `depmod-ui [path]` | Parse, serve, open browser (default) |
| `depmod-ui serve [path]` | Same as default |
| `depmod-ui analyze <path>` | Write `graph.json` and `metrics.json` to disk |
| `depmod-ui check <path> --fail-on <rules>` | Exit non-zero when rules fail (CI-friendly) |

**CI / GitHub Actions:** copy [`examples/github-actions/depmod.yml`](examples/github-actions/depmod.yml) or follow [`docs/ci.md`](docs/ci.md) for check gates, JSON artifacts, and branch protection.

### Useful flags

```sh
depmod-ui .
depmod-ui /repo --watch
depmod-ui /repo --port 51000
depmod-ui /repo --no-open
depmod-ui /repo --include "src/**"
depmod-ui /repo --exclude "**/*.test.*"
depmod-ui /repo --no-gitignore
depmod-ui /repo --exclude-tests
depmod-ui /repo --no-cache

depmod-ui check .
depmod-ui check . --fail-on cycles,unused-deps
depmod-ui check . --fail-on instability:>0.7
depmod-ui check . --exclude "bench/**" --exclude-tests
```

## Development

### Requirements

- Node 20.18 or newer (`.nvmrc` pins 24.14)
- pnpm 10+ (`corepack enable` is enough)

### Setup

```sh
nvm use
corepack enable
pnpm install
pnpm build
pnpm depmod-ui .
```

### Daily loop

```sh
pnpm -r test
pnpm typecheck
pnpm lint
pnpm format
pnpm --filter web dev
```

### GitHub Pages static demo

Build the static export locally (same pipeline as release deploy):

```sh
pnpm build:pages
npx serve apps/web/out -p 3000
# open http://localhost:3000/
```

Deploy to [the live demo](https://depmod.eduardlupu.com/) manually from **Actions → Deploy Pages → Run workflow** (uses whatever is on `main`). It also runs automatically after each npm release.

### Workspace layout

| Path | Role | Published? |
| --- | --- | --- |
| [`packages/types`](packages/types) | Zod `Graph` schema shared by CLI and web | private |
| [`packages/parser`](packages/parser) | Static analysis, metrics, cycles, dead-code, unused-deps | private |
| [`packages/cli`](packages/cli) | `depmod-ui` command; bundles parser and dashboard | **npm: `depmod-ui`** |
| [`apps/web`](apps/web) | Next.js dashboard (Cytoscape, three.js, inspector) | bundled in the CLI tarball |
| [`bench`](bench) | Benchmarks on OSS repos | private |

## How it works

```
┌────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────┐
│      depmod-ui         │     │   Next.js server        │     │       browser       │
│  (CLI process)         │     │   (spawned by CLI)      │     │                     │
│                        │     │                         │     │                     │
│  1. parse (ts-morph)   │────▶│  /api/graph reads       │────▶│  Cytoscape / 3D     │
│  2. write session file │     │     session JSON        │     │  Inspector, etc.    │
│  3. spawn server       │     │  /api/events (watch)    │────▶│  live updates       │
└────────────────────────┘     └─────────────────────────┘     └─────────────────────┘
```

The parser is a pure function: `(rootDir) -> Graph`. The web app does not re-parse; it only reads what the CLI wrote. Same input should match between the terminal summary and the dashboard.

A few implementation details:

- **Path aliases**: each workspace `tsconfig` `paths` map is applied when resolving imports ([`workspace-aliases.ts`](packages/parser/src/workspace-aliases.ts)).
- **Externals**: imports resolved to `node_modules` types are tracked for the unused-deps report, not dropped.
- **Focus / blast**: out-of-scope nodes use `display: none`, not opacity, so the view matches the question you asked.
- **Incremental cache**: per-file slices in `.depmod-cache`; bump `PARSER_VERSION` in the parser to invalidate.

More design notes: [`docs/specs/`](docs/specs).

## Benchmark snapshot

**67** open-source targets in [`bench/targets.json`](bench/targets.json) (tiers: **primary** → **stretch**). Cold `analyze()`, cache off.

```bash
pnpm bench:list          # all targets
pnpm bench:quick         # primary tier smoke (~7 repos)
pnpm bench -- --tier stress
```

Committed numbers in [`bench/results/`](bench/results/) may lag the target list — run `pnpm bench` locally to refresh. Tier definitions and the full inventory: [`bench/README.md`](bench/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, changesets, and the release flow. Before a PR:

1. `pnpm typecheck`, `pnpm -r test`, and `pnpm lint` should pass.
2. Add or update tests next to the code you change.
3. User-visible CLI changes need a changeset (`pnpm changeset`).

For larger ideas, open an issue first.

## License

MIT © [Eduard Lupu](https://github.com/eduardlupu)
