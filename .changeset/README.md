# Changesets

This folder holds changeset files created with `pnpm changeset`. Each file
describes a semver bump for a published package.

When changesets are merged to `main`, the release workflow opens a "Version
Packages" PR that updates versions and the changelog. Merging that PR publishes
`depmod-ui` to npm.

Only `depmod-ui` is published. Internal packages (`@depmod/parser`, `@depmod/types`,
`web`, `@depmod/bench`) are listed in `config.json` → `ignore`.
