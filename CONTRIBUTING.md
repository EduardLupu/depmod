# Contributing to depmod

Thanks for taking the time. depmod is small enough that one careful PR can move it noticeably, and we'd rather merge a polished change than half-merge a sprawling one.

## Code of Conduct

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing you agree to uphold it. Reports go to `lupu.eduard.adrian@gmail.com`.

## Development setup

```sh
nvm use            # pins Node via .nvmrc (24.14 currently; 20.18 is the floor)
corepack enable    # turns on the bundled pnpm
pnpm install
pnpm build         # types → parser → web (Next standalone) → CLI (tsup)
pnpm depmod-ui .   # smoke-run the CLI against the monorepo itself
```

## Daily loop

| Command | Purpose |
| --- | --- |
| `pnpm -r test` | Vitest in every workspace |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm lint` / `pnpm format` | Biome check / write |
| `pnpm --filter web dev` | HMR dev server for the dashboard |
| `pnpm --filter depmod-ui pack` | Produce the local tarball |

## Branches & commits

- Branch off `main`. Name branches `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, etc.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org). Examples:
  - `feat(cli): add --port flag`
  - `fix(parser): tolerate type-only re-exports`
  - `chore(deps): bump ts-morph to 24.1`
- Keep commits small and reviewable. Squash-merge is fine; describe the *why* in the PR body, not the *what*.

## Adding a changeset

Every PR that affects published behaviour needs a changeset. The release workflow uses them to bump versions and write the changelog.

```sh
pnpm changeset
```

Pick `depmod-ui` as the bumped package (it's the only published one) and pick `patch` / `minor` / `major` according to [semver](https://semver.org). Commit the generated file in `.changeset/`.

PRs that only touch internal packages (`@depmod/parser`, `@depmod/types`, `web`, `bench`) don't need a changeset — they're not published, and their changes will roll into the CLI's next release.

## Pull-request checklist

Before opening the PR:

- [ ] `pnpm lint && pnpm typecheck && pnpm -r test` — all green
- [ ] Tests cover the change (or you wrote a `WHY:` line in the PR explaining why they don't)
- [ ] If the change is user-visible, README + relevant docs updated
- [ ] If the change affects the published CLI, `.changeset/*.md` added

CI runs the same checks on each PR; if it goes red, push a follow-up commit rather than force-pushing — easier to review.

## Reporting bugs and proposing features

Use the issue templates. Bug reports need a repro and the depmod-ui + Node version; feature requests need a problem statement before a proposed solution.

## Releasing (maintainers)

1. Merge PRs as usual; each one includes a changeset.
2. The `release` workflow opens a "Version Packages" PR that bumps versions and prepends the changelog.
3. Review and merge the Version Packages PR. The workflow then `pnpm publish`es with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

`NPM_TOKEN` must be configured as a repo secret with `publish` scope. Provenance requires `id-token: write` in the workflow (already set).
