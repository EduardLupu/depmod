# depmod benchmarks

End-to-end harness that clones real OSS TypeScript / JavaScript repositories, runs `@depmod/parser` `analyze()`, and writes comparable metrics to [`results/`](results/).

**67 targets** are configured in [`targets.json`](targets.json). Tiers are chosen from measured graph size and parse time (see below), not from hype.

## Quick start

```bash
# List configured targets
pnpm bench:list

# Fast smoke run (primary tier only — 7 small repos, ~1–2 min with warm cache)
pnpm bench:quick

# Full suite (clones + analyzes every target; needs network, can take 30–60+ min)
pnpm bench

# Subset
pnpm bench -- --only vercel-commerce,depmod
pnpm bench -- --tier medium
pnpm bench -- --runs 3   # median wall time over 3 cold parses (cache off)
```

Clones are cached under `.targets-cache/` (gitignored). Reuse is the default; pass `--fresh` to refuse an existing cache dir, or `--update` to `git fetch` before analyzing.

## Tier buckets

Tiers group targets for `pnpm bench:quick`, `--tier`, and plot colours. They reflect **parser cost**, not code quality.

| Tier | Typical scale | Parse (cold, indicative) | Use |
| --- | --- | --- | --- |
| **primary** | &lt; ~100 files, &lt; ~15k LOC | &lt; ~1 s | CI smoke / regression |
| **medium** | ~100–500 files or mid monorepos | ~0.3–3 s | Everyday OSS apps & libraries |
| **stress** | ~500–4k files or heavy LOC | ~3–10 s | Large product monorepos |
| **stretch** | 4k+ files or platform repos | 10 s+ | Upper bound / torture tests |

After changing tiers or adding targets, re-run `pnpm bench` and commit `results/*` if you want the README snapshot table on the repo root to stay current.

### Corrections (vs older configs)

Measured runs moved several repos to heavier tiers:

| Target | Was | Now | Why |
| --- | --- | --- | --- |
| `unkey`, `react-email` | medium | **stress** | ~1.1k–1.9k files, 180k+ LOC |
| `create-t3-turbo` | medium | **primary** | ~74 files, ~3.4k LOC |
| `music.eduardlupu.com` | stretch | **primary** | ~41 files |
| `depmod` | stretch | **medium** | ~180 files |
| `Vercel` | stretch | **`vercel-monorepo`** | Renamed; still stretch (~5k files) |

### Shared clones

Multiple targets can share one git cache via `cacheName` + optional `subdir`:

| Cache | Targets |
| --- | --- |
| `cal.com` | `cal.com`, `cal-web` → `apps/web`, `calcom-api` → `apps/api` |
| `plane` | `plane` (root), `plane-web` → `apps/web` |
| `supabase` | `supabase` (root), `supabase-studio` → `apps/studio` |

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
- **cacheName**: share one clone across multiple targets (see table above).
- **ref**: pin a tag or SHA for reproducible numbers; `null` uses default branch at clone time.

## Metrics

Each run records graph stats plus harness-derived fields:

- **parseMs** — median wall-clock for `analyze()` (`--runs` > 1)
- **parserMs** — `graph.stats.parseMs` (parser-internal timing)
- **unusedDeps** / **deadModules** / **workspaces** — same signals as `depmod-ui check` and the dashboard health panel

Incremental cache is **disabled** during benchmarks so timings reflect a full parse.

## Target inventory

Run `pnpm bench:list` for the live table. Summary by tier:

| Tier | Count | Examples |
| --- | ---: | --- |
| primary | 7 | `vercel-commerce`, `create-t3-app`, `hono`, `zustand` |
| medium | 19 | `depmod`, `shadcn-taxonomy`, `trpc`, `drizzle-orm`, `langfuse` |
| stress | 22 | `unkey`, `dub`, `payload`, `cal-web`, `vite`, `immich` |
| stretch | 19 | `cal.com`, `supabase`, `nx`, `typescript`, `posthog` |

Some stretch targets (`typescript`, `backstage`, `expo`) are intentionally extreme; skip them for day-to-day runs with `--tier` or `--only`.
