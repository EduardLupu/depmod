# depmod-ui

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
