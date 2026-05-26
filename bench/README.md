# depmod benchmarks

End-to-end harness that clones real OSS TypeScript / Next.js repositories, runs `@depmod/parser` `analyze()`, and writes comparable metrics to [`results/`](results/).

## Quick start

```bash
# List configured targets
pnpm bench:list

# Fast smoke run (primary tier only — vercel-commerce today)
pnpm bench:quick

# Full suite (clones + analyzes every target; needs network, ~minutes)
pnpm bench

# Subset
pnpm bench -- --only vercel-commerce,shadcn-taxonomy
pnpm bench -- --tier medium
pnpm bench -- --runs 3   # median wall time over 3 cold parses (cache off)
```

Clones are cached under `.targets-cache/` (gitignored). Reuse is the default; pass `--fresh` to refuse an existing cache dir, or `--update` to `git fetch` before analyzing.

## Outputs

| File | Contents |
| --- | --- |
| `results/results.csv` | Flat summary per target (diff-friendly) |
| `results/results.json` | Full rows + classification breakdown + per-run timings |
| `results/index.html` | Summary table + links to SVG charts |
| `results/parser-perf.svg` | Parse time vs LOC scatter |
| `results/degree-<name>.svg` | Node-degree histogram per target |

## Adding a target

Edit [`targets.json`](targets.json):

```json
{
  "name": "my-app",
  "repo": "https://github.com/org/repo.git",
  "ref": null,
  "tier": "medium",
  "subdir": "apps/web",
  "description": "Optional note for --list",
  "cacheName": "shared-clone-name"
}
```

- **tier**: `primary` · `medium` · `stress` · `stretch` — buckets plots and `pnpm bench:quick`.
- **subdir**: analyze a monorepo sub-tree instead of the repo root.
- **cacheName**: share one clone across multiple targets (see `cal.com` / `cal-web`).
- **ref**: pin a tag or SHA for reproducible thesis numbers; `null` uses default branch at clone time.

## Metrics

Each run records graph stats plus harness-derived fields:

- **parseMs** — median wall-clock for `analyze()` (`--runs` > 1)
- **parserMs** — `graph.stats.parseMs` (parser-internal timing)
- **unusedDeps** / **deadModules** / **workspaces** — same signals as `depmod-ui check` and the dashboard health panel

Incremental cache is **disabled** during benchmarks so timings reflect a full parse.

## Targets (current)

| Name | Tier | Notes |
| --- | --- | --- |
| vercel-commerce | primary | Small Next.js storefront |
| shadcn-taxonomy | medium | shadcn taxonomy demo |
| create-t3-turbo | medium | T3 + Turborepo template |
| unkey | medium | API key platform monorepo |
| react-email | medium | React Email monorepo |
| documenso | stress | Large signing platform |
| dub | stress | Large link platform |
| cal.com | stretch | Full Cal.com monorepo |
| cal-web | stress | `apps/web` only (shared clone) |
| music.eduardlupu.com | stretch | Small personal Next app |

Commit updated `results/*` after a full local run if you want the README snapshot table on the repo root to stay current.
