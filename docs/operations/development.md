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

`ui:smoke` builds the preview bundle, launches the Electron app with the demo seed
against a throwaway user-data directory, and drives the core library flows over
the Chrome DevTools protocol. It writes screenshots to `.artifacts/ui-smoke/`,
fails on any console error, and exits non-zero with a PASS/FAIL line per check.
It needs a display; on Linux without one it runs under `xvfb-run`.

## Linux packages

`bun run build:linux` writes a `.deb` and an AppImage to `.artifacts/electron/`.

- Install the `.deb` with `sudo apt install ./<package>.deb`. Its install scripts set up Chromium's sandbox and Ubuntu's AppArmor profile. Never work around a sandbox startup error with `--no-sandbox`.
- An AppImage runs only on a host that lets Chromium's sandbox start.
- The `.deb` depends on FFmpeg for local-video posters, and on `pkexec` and `python3` for the update helper. An AppImage on a host without `/usr/bin/ffmpeg` shows the typed video card instead of a poster.
- On Wayland, Screen capture goes through the system screen-sharing portal. If the user denies it, they can take a screenshot with the system tool and paste it.
- A pinned patch makes sharp use its WASM backend in Linux Electron, because the native libvips collides with Electron's GLib. When upgrading sharp, update the patch and `@img/sharp-wasm32` (a Knip runtime exception) together.
- PDF rendering uses the bundled PDF.js fonts, character maps and WASM decoders, because the system-font scan crashes Linux Electron.

`bun scripts/linux-backend-smoke.mjs` runs the unpacked build's PDF module, OCR worker and CPU model on Electron's Node runtime, with no GUI and no user library. Run `bun run build:dir` first, or pass another unpacked app directory. It does not replace checking features in the installed app.

`bun scripts/media-smoke.mjs source <output>` records thumbnail and poster sizes, warm median timings and pixel error. Pass the unpacked app directory instead of `source` to measure the packaged runtime.

## Updates and releases

Settings → General → Updates offers two channels:

- **Stable / Beta** (`latest`) is the regular product. There is no separate beta feed.
- **Nightly** (`nightly`) accepts only newer `X.Y.Z-nightly.YYYYMMDD.N` versions. Switching back to Stable / Beta never downgrades the app.

Checking, downloading, canceling and installing are separate actions the user takes; nothing downloads or installs on its own. On Debian, PolicyKit runs the root-owned helper `electron/update-helper.py`. It copies the downloaded `.deb` into private staging, verifies the feed's SHA512, package name, version and architecture on that copy, and only then runs `dpkg --install` on it, so a rewrite of the download cache during the authorization prompt cannot change what gets installed. Do not add silent dependency repair or a way around the authorization prompt. After a restart, the app compares its version with the one it tried to install before it reports the update as applied.

To cut a release:

1. Push a `vX.Y.Z` tag, or run the Release workflow with the `stable` channel and a version. Nightlies run daily on a schedule, or run the workflow with the `nightly` channel; their version is the next patch with a `-nightly.YYYYMMDD.<run>` suffix.
2. The workflow builds the Windows installer and the Linux `.deb` and AppImage, runs the packaged Linux smoke checks, and creates a draft GitHub release.
3. Review the draft and publish it. Until a channel has a published release, update checks on it show an error.

To test the updater locally, run `bun scripts/update-feed-smoke.mjs`, or pass `.artifacts/electron/linux-unpacked` to run it on the packaged runtime. It downloads from loopback feeds, verifies SHA512, replaces a scratch AppImage and checks Debian metadata, and never installs as root.

Never add signing secrets or publish automatically. The Windows installer is not Authenticode-signed, so SmartScreen warns on install.

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

## Troubleshooting

- `Expected Bun X, found Y`: install the Bun in `.bun-version`; don't edit the check to match your install.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
