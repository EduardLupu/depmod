# depmod-ui

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
