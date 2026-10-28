# Development

How to set up, run, check, and troubleshoot inkling. Contribution scope and PR expectations live in `CONTRIBUTING.md`; this is the command and check reference.

## First-time setup

1. Install Bun (pinned in `.bun-version`).
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
| Linux Debian package and AppImage | `bun run build:linux` |
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

On Debian/Ubuntu, `bun run build:linux` writes a `.deb` and AppImage to
`.artifacts/electron/`. Install the `.deb` with `sudo apt install ./<package>.deb`,
then open inkling from the app launcher. The standard electron-builder install
scripts configure Chromium's sandbox and Ubuntu AppArmor integration. Do not
work around a sandbox startup error with `--no-sandbox`; install the package
normally. AppImages require a host that permits Chromium's sandbox to start.

`bun scripts/linux-backend-smoke.mjs` checks the unpacked package's real PDF
module, OCR worker and CPU model using Electron's Node runtime without a GUI or
a user library. It is not a substitute for installed-app feature checks.
The pinned sharp patch selects its supported WASM backend only in Linux
Electron, avoiding the native libvips/GLib collision. Keep `@img/sharp-wasm32`
(the Knip runtime exception) and the patch in sync when upgrading sharp.
PDF rendering avoids Linux Electron's crashing system-font scan and uses the
bundled PDF.js fonts, character maps and WASM decoders instead.
On Wayland, Screen uses the system screen-sharing portal; if capture is denied
or unavailable, use the system screenshot tool and paste or import the image.
Linux currently retains typed artwork for local videos without a shell poster
provider.

Settings → General → Updates selects Stable / Beta (`latest`) or experimental
Nightly (`nightly`). Stable / Beta is the regular beta product, not a third
prerelease feed. Nightlies require strictly newer dated `-nightly.YYYYMMDD.N`
versions; switching back never silently downgrades a library. Check, download,
cancel and install are separate actions. Installation requires explicit native
confirmation; Debian uses PolicyKit to run its fixed root-owned Python helper.
After authorization the helper copies the cache archive into private root-owned
staging, verifies the feed-pinned SHA512 and package/version/architecture there,
then runs `dpkg --install` only on that copy. Cache rewrites during consent or
authentication cannot substitute installed bytes. No silent dependency repair
or authentication bypass is used. A canceled
prompt or dependency failure remains retryable; a successful new process checks
the version before treating the update as applied.

The release workflow stages Windows and Linux assets into a **draft** GitHub
release. A maintainer must review and publish it; unconfigured/unpublished
channels show a check error, not a fictitious update. GitHub-hosted runners and
Releases need no new service, but remain subject to account limits. Unsigned
Windows installers have no Authenticode publisher trust. Never add signing
secrets or auto-publish as part of local verification. `bun scripts/update-feed-smoke.mjs`
uses real updater downloads and SHA512 verification from loopback feeds, with
scratch-only AppImage replacement and Debian metadata checks, never a root
installation. Pass `.artifacts/electron/linux-unpacked` to use the packaged
Electron Node runtime instead of source.

`ui:smoke` builds the preview bundle, launches the Electron app with the demo seed
against a throwaway user-data directory, and drives the core library flows over
the Chrome DevTools protocol. It writes screenshots to `.artifacts/ui-smoke/`,
fails on any console error, and exits non-zero with a PASS/FAIL line per check.
It needs a display; on Linux without one it runs under `xvfb-run`.

## Checks

| Goal | Command | Notes |
|---|---|---|
| Everything | `bun run check` | Bun pin, frozen install (`--ignore-scripts`), typecheck of every workspace, tests, Knip, lint, both builds, ingestion smoke, extension build. CI runs the same steps as separate jobs |
| Changed files | `bun run check:changed [ref]` | Pre-push subset for what the branch changed since `origin/main` (or `ref`): oxlint, oxfmt, related tests, Knip, typecheck. Not a CI substitute |
| Typecheck | `bun run typecheck` | App, benchmark harness, and `electron/` |
| Tests | `bun run test` | |
| Unused code | `bun run knip` | Hard gate in CI; `knip.json` owns entry/project patterns. To clean up locally, run `bunx knip --fix` then `bun install` (re-syncs the lockfile if deps were pruned), fix any `noUnusedLocals` fallout, and re-run `bun run check` |
| Lint and format | `bun run lint` (`bun run lint:fix` to apply) | oxlint, with inkling rules in `oxlint-plugin-inkling/`, then oxfmt |
| Bun pin | `bun run check:bun-version` | running Bun must match `.bun-version` |
| Extension build | `bun run --cwd extension build` | Builds the Chrome MV3 extension and its service worker |

For early signal, run `bun run check`. `noUnusedLocals` / `noUnusedParameters` are on — the compiler catches dead locals; Knip catches dead exports and dependencies.

## Git hooks

None — there are no local hooks by policy. Formatting, linting, and all other gates run in CI.

## CI behavior (what runs where)

- `ci.yml`: docs-only pushes skip; otherwise the frontend job runs on `windows-latest` (inkling ships on Windows only) and verifies the Bun version pin, typechecks every workspace, runs tests, `knip`, builds the app and extension, and runs ingestion smoke tests.
- `security.yml`: JavaScript/TypeScript CodeQL on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only.
- `knip.yml`: scheduled `knip --fix` (every other day) opens a cleanup PR. It strips unused `export` keywords and prunes dependencies; it never deletes files.
- `links.yml`: weekly markdown link check, opens an issue on failures. New custom schemes (`inkling://`) or local hosts go in `.lycheeignore`.
- `electron-preview.yml`: when a same-repository PR has the `preview:win` label, builds and uploads the Windows Electron installer. Electron changes also build the Linux directory package and launch it under Xvfb; pinned model files are cached only in GitHub Actions.
- Automation config (`.entire/`) never skips checks.

## Troubleshooting

- `Expected Bun X, found Y`: install the Bun in `.bun-version`; don't edit the check to match your install.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
