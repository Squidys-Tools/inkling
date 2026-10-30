# Development

How to set up, run, build, check and release inkling. [CONTRIBUTING.md](../../CONTRIBUTING.md) says which contributions we take.

## First-time setup

1. Install Bun (pinned in `.bun-version`).
2. Run `bun install`. It installs no Git hooks and runs no lifecycle scripts; CI runs every gate.

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
| Extraction benchmark | `bun run bench` |

`build` keeps the committed demo seed, because the web preview and `preview` need
it. `build:app` drops `public/seed-demo/` and the `src/seedPersonal.ts` bundle, then
runs `scripts/assert-no-demo-seed.ts`, which fails the build if either is still
present. `build:dir`, `build:installer` and `build:linux` all go through
`build:app`, so no shipped package carries the ~9.7 MB seed. To change what the
app ships, change `build:app`, not `build`.

Packaged builds bundle the embedding models; [models.md](../models.md) covers how
development builds fetch them.

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
| Everything | `bun run check` | Every gate CI runs, in one command |
| Changed files | `bun run check:changed [ref]` | Lint, format, related tests, Knip and typecheck for what changed since `origin/main` or `ref`. Run it before pushing; it does not replace CI |
| Typecheck | `bun run typecheck` | App, `electron/`, and the benchmarks, scripts and lint plugin |
| Tests | `bun run test` | |
| Unused code | `bun run knip` | To clean up, run `bunx knip --fix`, then `bun install` to re-sync the lockfile, then fix any `noUnusedLocals` errors |
| Lint and format | `bun run lint` (`bun run lint:fix` to apply) | oxlint, with inkling rules in `oxlint-plugin-inkling/`, then oxfmt |
| Bun pin | `bun run check:bun-version` | running Bun must match `.bun-version` |
| Extension build | `bun run --cwd extension build` | |

## CI

Pushes and PRs that change only Markdown, `docs/` or `AGENTS.md` skip CI and the security scans.

- `ci.yml` runs the checks on `windows-latest`.
- `security.yml` runs CodeQL when a PR opens or reopens and on about every fourth push to it, and dependency review on every PR push.
- The `preview:win` label builds the Windows installer for a same-repository PR and links it in a comment (`electron-preview.yml`). Electron changes in a same-repository PR also build the Linux directory package and launch it under Xvfb.
- The `preview:web` label deploys the web preview to Vercel and comments its URL (`web-preview.yml`).
- `pr-size.yml` labels each PR by the size of its diff.
- `knip.yml` runs `knip --fix` every other day and opens a cleanup PR. It strips unused exports and prunes dependencies but never deletes files; if its PRs get noisy, tune the patterns in `knip.json` rather than disabling it.
- `links.yml` checks Markdown links weekly and opens an issue on failures. Add custom schemes such as `inkling://` and local hosts to `.lycheeignore`.
- `release.yml` builds releases; see [Updates and releases](#updates-and-releases).

## Troubleshooting

- `Expected Bun X, found Y`: install the Bun in `.bun-version`; don't edit the check to match your install.
