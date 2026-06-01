# Continuous integration with depmod

Use [depmod-ui](https://www.npmjs.com/package/depmod-ui) in GitHub Actions to run architectural checks on every push and pull request, and optionally publish `graph.json` / `metrics.json` artifacts for the team.

## What you get

| Approach | Command | Best for |
| --- | --- | --- |
| **Gate** | `depmod-ui check` | Fail CI when cycles, dead code, unused deps, or instability thresholds are violated |
| **Artifacts** | `depmod-ui analyze` | Downloadable JSON on `main` (history, custom dashboards, tooling) |
| **Interactive UI** | `depmod-ui serve` | Local only — not suited for shared CI URLs |

Everyone with repo access sees check output in the **Actions** job log. For a browsable dashboard on the web you need a separate publish step (for example GitHub Pages); see [Hosted dashboard](#hosted-dashboard) below.

## Copy-paste workflow

A ready-made workflow lives at [`examples/github-actions/depmod.yml`](../examples/github-actions/depmod.yml). Copy it to `.github/workflows/depmod.yml` in your repository.

Minimal version (install from npm, gate on PRs and `main`):

```yaml
name: depmod

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install depmod
        run: npm install -g depmod-ui@latest

      - name: Architectural checks
        env:
          NO_UPDATE_NOTIFIER: "1"
        run: |
          depmod-ui check . \
            --fail-on cycles,unused-deps,instability:>0.7
```

Tune `--fail-on` to match your policy (see [Check rules](#check-rules)).

## Analyze + artifacts on main

Add a second step (or job) to write JSON and upload it when `main` moves:

```yaml
      - name: Analyze dependency graph
        run: |
          mkdir -p .depmod
          depmod-ui analyze . \
            -o .depmod/graph.json \
            --metrics-out .depmod/metrics.json \
            --exclude-tests

      - name: Upload graph artifacts
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: actions/upload-artifact@v4
        with:
          name: depmod-graph-${{ github.sha }}
          path: .depmod/
          retention-days: 30
```

Artifacts appear under **Actions → workflow run → Artifacts**. They are JSON files, not the interactive graph UI.

## Check rules

`--fail-on` accepts a comma-separated list:

| Rule | Meaning |
| --- | --- |
| `cycles` | At least one import cycle (Tarjan SCC) |
| `dead-code` | Modules with no importers / type-only usage / near-empty stubs |
| `unused-deps` | `package.json` dependencies never imported |
| `instability` | Any module with instability &gt; 0.9 (default threshold) |
| `instability:>N` | Custom instability ceiling, `N` in `[0, 1]` |

If you omit `--fail-on`, the default is `cycles,dead-code,unused-deps`.

Machine-readable output for later steps:

```sh
depmod-ui check . --fail-on cycles --json > depmod-report.json
```

## Scoping a monorepo

`check` and `analyze` share the same file-selection flags as `serve`:

```sh
depmod-ui check apps/web --fail-on cycles,unused-deps
depmod-ui check . --exclude "bench/**,**/fixtures/**" --fail-on cycles
depmod-ui check . --include "packages/**" --exclude-tests
```

- `--include` — allow-list globs (repo-relative)
- `--exclude` — applied after `.gitignore`
- `--no-gitignore` — parse ignored paths too
- `--exclude-tests` — drop `*.test.*` / `*.spec.*` from the graph

## Required status checks

1. Add the workflow file under `.github/workflows/`.
2. In GitHub: **Settings → Branches → Branch protection** → enable **Require status checks**.
3. Select the job name (for example `architecture` or `depmod`).

Failed checks block merges when the job is required.

## CI tips

- Set `NO_UPDATE_NOTIFIER=1` (or use a non-TTY runner) to silence npm update notices.
- Use `--no-cache` for fully cold parses when debugging cache issues.
- Pin `depmod-ui@<version>` instead of `@latest` if you want reproducible CI.
- Large monorepos: scope with `--include` / `--exclude`, or point `check` at a single workspace path.

## Hosted dashboard

`depmod-ui serve` starts a local server; it does not produce a permanent URL in CI.

To host an interactive graph for the team (like the [live demo](https://depmod.eduardlupu.com/)), you need a static export pipeline: analyze the repo, embed `graph.json` (and optional source snippets), then deploy with GitHub Pages or similar. The depmod project itself does this via `pnpm build:pages` and [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) — use that as a reference, not as a one-line consumer command.

## This repository

[`.github/workflows/depmod.yml`](../.github/workflows/depmod.yml) dogfoods depmod on every PR and push: it builds the workspace CLI, runs `check` (informational while known graph debt remains), writes analysis artifacts, and uploads them on pushes to `main`.
