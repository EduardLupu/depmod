# depmod-ui

## 0.4.4

### Patch Changes

- [`7caef5a`](https://github.com/EduardLupu/depmod/commit/7caef5a9e13e6c8b4b97400177f1cd5771b609f9) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Add `--include`, `--exclude`, `--no-gitignore`, and `--exclude-tests` to `depmod-ui check` (same as `analyze` / `serve`) for scoped CI gates in monorepos. Document GitHub Actions setup in `docs/ci.md` with a copy-paste workflow under `examples/github-actions/`.

## 0.4.3

### Patch Changes

- [`d6d5435`](https://github.com/EduardLupu/depmod/commit/d6d5435b98bce75781351abe90eeadb8c816f379) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Fix keyboard shortcut hints on Windows: show Ctrl instead of the Mac ⌘ symbol in the search box and legend panel.

## 0.4.2

### Patch Changes

- [`c0f8f33`](https://github.com/EduardLupu/depmod/commit/c0f8f33500cf310b815b84d11fcdfd277d959ccf) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Fix `--watch` live reload: atomic session/progress writes so the dashboard's file watcher fires, directory-based `fs.watch`, tighter chokidar source globs, SSE + poll fallback for graph updates, and CI integration tests for the watch pipeline.

## 0.4.1

### Patch Changes

- [`ebb2ec8`](https://github.com/EduardLupu/depmod/commit/ebb2ec823550c46f579eb0a81f7ddda4cab28f88) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Fix npm installs: the published tarball was missing `dist/index.js` because `prepack` did not run the CLI build (`tsup`) before packing. `prepack` now runs `build` then `prepare-package`, and `prepublishOnly` runs the full monorepo build.

## 0.4.0

### Minor Changes

- [`ec1de63`](https://github.com/EduardLupu/depmod/commit/ec1de636b0dc2472eb9fa7508a9a04e1a6f85d5a) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Add a daily background check for new `depmod-ui` versions. Print a one-line
  notice on the user's next invocation when an upgrade is available. Uses
  [`update-notifier`](https://github.com/yeoman/update-notifier) — the same
  pattern npm itself uses ("New minor version of npm available!").

  Respects `NO_UPDATE_NOTIFIER=1` and `--no-update-notifier` for CI scripts
  and self-suppresses in non-TTY contexts. Cached at the OS-standard config
  dir (e.g. `~/.config/configstore/update-notifier-depmod-ui.json`).

## 0.3.0

### Minor Changes

- [`c6dc270`](https://github.com/EduardLupu/depmod/commit/c6dc27046429951b13a1a7412604bf73cea67672) Thanks [@EduardLupu](https://github.com/EduardLupu)! - Cross-platform install (Windows / Linux / macOS x64 + arm64). The tarball no
  longer bundles a `node_modules` tree from Next.js's standalone output;
  instead, `next`, `react`, `react-dom`, and `sharp` are declared as runtime
  dependencies so npm installs the correct platform binaries per user.

  Why: the previous tarball baked in macOS arm64 native binaries
  (`@img/sharp-darwin-arm64`, `@swc/core-darwin-arm64`) and hit Windows
  `MAX_PATH` limits on deeply nested pnpm-style paths inside
  `web/node_modules/.pnpm/…`. Installs failed silently on Windows and would
  have crashed at runtime on Linux x64.

  Effects:

  - Tarball size drops from ~28 MB to ~1.4 MB (5,576 files → 115 files).
  - `npm install -g depmod-ui` now pulls Next + React + sharp from the
    registry on first install; subsequent runs reuse npm's cache.
  - Node's standard module resolution walks up from the bundled `server.js`
    and finds the deps in `depmod-ui`'s own `node_modules`, so no `NODE_PATH`
    manipulation is needed at runtime.

## 0.2.0

### Minor Changes

- [`2bc93f8`](https://github.com/EduardLupu/depmod/commit/2bc93f8a0b2e9929249d95a54adc71ff91087403) Thanks [@EduardLupu](https://github.com/EduardLupu)! - First public release: terminal-launched dependency graph dashboard for TypeScript and JavaScript projects.
