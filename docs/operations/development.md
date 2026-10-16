# Development

How to set up, run, check, and troubleshoot inkling. Contribution scope and PR expectations live in `CONTRIBUTING.md`; this is the command and check reference.

## First-time setup

1. Install Bun 1.4.2 (pinned in `.bun-version` and `package.json#packageManager`).
2. `bun install` — plain install, no hooks and no lifecycle scripts.

## Running

| Goal | Command |
|---|---|
| Web look with sample data | `bun run dev` |
| Electron desktop app (dev) | `bun run dev:app` |
| Serve the last production build | `bun run preview` (run `bun run build` first) |
| Production frontend build (keeps demo seed) | `bun run build` |
| Shipped app build (drops demo seed) | `bun run build:app` |
| Electron directory build (unpacked) | `bun run build:dir` |
| Windows NSIS installer | `bun run build:installer` |
| Ingestion smoke | `bun run ingest:smoke` |
| UI smoke (Electron, scratch profile) | `bun run ui:smoke` |
| PDF smoke | `bun run test:pdf` |
| Extraction benchmark | `bun run bench` |

`build` keeps the committed demo seed, because the web look and `preview` need
it. `build:app` drops it — both `public/seed-demo/` and the `src/seedPersonal.ts`
bundle — and then runs `scripts/assert-no-demo-seed.ts`, which fails the build if
either is still present. `build:dir` and `build:installer` use it, so a shipped
installer never carries the ~9.7 MB seed. Changing what the app ships means
changing that mode, not `build`.

The Electron release package includes the pinned embedding models under its
resources directory. In development, missing model files are downloaded and
SHA-256 verified when an embedding job first needs them.

`ui:smoke` builds the preview bundle, launches the Electron app with the demo seed
against a throwaway user-data directory, and drives the core library flows over
the Chrome DevTools protocol. It writes screenshots to `.artifacts/ui-smoke/`,
fails on any console error, and exits non-zero with a PASS/FAIL line per check.
It needs a display; on Linux without one it runs under `xvfb-run`.

## Checks

| Goal | Command | Notes |
|---|---|---|
| Everything | `bun run check` | Bun pin, frozen install (`--ignore-scripts`), typecheck of every workspace, tests, Knip, lint, both builds, ingestion smoke, extension build. CI runs the same steps as separate jobs |
| Typecheck | `bun run typecheck` | App + benchmark harness |
| Tests | `bun test` | |
| Unused code | `bun run knip` | Hard gate in CI; `knip.json` owns entry/project patterns. To clean up locally, run `bunx knip --fix` then `bun install` (re-syncs the lockfile if deps were pruned), fix any `noUnusedLocals` fallout, and re-run `bun run check` |
| Lint and format | `bun run lint` (`bun run lint:fix` to apply) | Biome |
| Bun pin | `bun run check:bun-version` | `.bun-version` vs `packageManager` vs running Bun must agree |
| Extension build | `bun run --cwd extension build` | Three bundles behind two manifests; catches manifest and bundler breakage |

For early signal, run `bun run check`. `noUnusedLocals` / `noUnusedParameters` are on — the compiler catches dead locals; Knip catches dead exports and dependencies.

## Git hooks

None — there are no local hooks by policy. Formatting, linting, and all other gates run in CI.

## CI behavior (what runs where)

- `ci.yml`: docs-only pushes skip; otherwise the frontend job verifies the Bun version pin, typechecks every workspace, runs tests, `knip`, builds the app and extension, and runs ingestion smoke tests.
- `security.yml`: JavaScript/TypeScript CodeQL on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only.
- `knip.yml`: scheduled `knip --fix` (every other day) opens a cleanup PR. It strips unused `export` keywords and prunes dependencies; it never deletes files.
- `links.yml`: weekly markdown link check, opens an issue on failures. New custom schemes (`inkling://`) or local hosts go in `.lycheeignore`.
- `electron-preview.yml`: when a same-repository PR has the `preview:win` label, builds and uploads the Windows Electron installer. Electron changes also build the Linux directory package and launch it under Xvfb; pinned model files are cached only in GitHub Actions.
- Automation config (`.entire/`) never skips checks.

## Troubleshooting

- `Expected Bun X, found Y`: install the pinned Bun from `.bun-version`; don't edit the check to match your install.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
