# Development

How to set up, run, check, and troubleshoot inkling. Contribution scope and PR expectations live in `CONTRIBUTING.md`; this is the command and check reference.

## First-time setup

1. Install Bun 1.4.2 (pinned in `.bun-version` and `package.json#packageManager`).
2. `bun install` — plain install, no hooks and no lifecycle scripts.

## Running

| Goal | Command |
|---|---|
| Web preview | `bun run preview` |
| Electron desktop app | `bun run electron:dev` |
| Windows NSIS installer | `bun run electron:build:nsis` |
| Electron directory build | `bun run electron:build:dir` |
| Production frontend build (with demo seed, for preview) | `bun run build` |
| Shipped app build (excludes the demo seed) | `bun run build:app` |
| Ingestion smoke | `bun run ingest:smoke` |

`bun run build` keeps the committed demo seed, because the web preview and
`vite preview` need it. `bun run build:app` drops it — both `public/seed-demo/`
and the `src/seedPersonal.ts` bundle — and then runs
`scripts/assert-no-demo-seed.ts`, which fails the build if either is still
present. The Electron package build uses it, so a shipped installer never carries the
~9.7 MB seed. Changing what the app ships means changing that mode, not `build`.

The Electron release package includes the pinned embedding models under its
resources directory. In development, missing model files are downloaded and
SHA-256 verified when an embedding job first needs them.

## Checks

| Goal | Command | Notes |
|---|---|---|
| Fast local gate | `bun run check` | `typecheck` + `bun test` |
| CI parity (frontend) | `bun run check:frontend` | Version pin + locked install + tests + knip + build + ingestion smoke. Matches the CI frontend job except the workspace typechecks and extension build below |
| Typecheck only | `bun run typecheck` | App + benchmark harness |
| Workspace typecheck | `bun run --cwd extension typecheck` and `bun run --cwd packages/ingestion-shared typecheck` | The root `tsconfig.json` includes only `src`, so the extension and shared package need their own pass |
| Extension build | `bun run --cwd extension build` | Three bundles behind two manifests; catches manifest and bundler breakage |
| Unused code | `bun run knip:check` | Hard gate in CI; `knip.json` owns entry/project patterns. To clean up locally, run `bunx knip --fix` then `bun install` (re-syncs the lockfile if deps were pruned), fix any `noUnusedLocals` fallout, and re-run `bun run check:frontend` |
| Bun pin | `bun run check:bun-version` | `.bun-version` vs `packageManager` vs running Bun must agree |

For early signal, run `bun run check:frontend`. `noUnusedLocals` / `noUnusedParameters` are on — the compiler catches dead locals; Knip catches dead exports and dependencies.

## Git hooks

None — there are no local hooks by policy. Formatting, linting, and all other gates run in CI.

## CI behavior (what runs where)

- `ci.yml`: docs-only pushes skip; otherwise the frontend job verifies the Bun version pin, typechecks every workspace, runs tests, `knip:check`, builds the app and extension, and runs ingestion smoke tests.
- `security.yml`: JavaScript/TypeScript CodeQL on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only.
- `knip.yml`: scheduled `knip --fix` (every other day) opens a cleanup PR. It strips unused `export` keywords and prunes dependencies; it never deletes files.
- `links.yml`: weekly markdown link check, opens an issue on failures. New custom schemes (`inkling://`) or local hosts go in `.lycheeignore`.
- `electron-preview.yml`: when a same-repository PR has the `preview:win` label, builds and uploads the Windows Electron installer. Electron changes also build the Linux directory package and launch it under Xvfb; pinned model files are cached only in GitHub Actions.
- Automation config (`.entire/`) never skips checks.

## Troubleshooting

- `Expected Bun X, found Y`: install the pinned Bun from `.bun-version`; don't edit the check to match your install.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
