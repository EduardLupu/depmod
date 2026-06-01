---
"depmod-ui": patch
---

Add `--include`, `--exclude`, `--no-gitignore`, and `--exclude-tests` to `depmod-ui check` (same as `analyze` / `serve`) for scoped CI gates in monorepos. Document GitHub Actions setup in `docs/ci.md` with a copy-paste workflow under `examples/github-actions/`.
