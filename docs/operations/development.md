# Development

How to set up, run, build, check and release inkling. [CONTRIBUTING.md](../../CONTRIBUTING.md) says which contributions we take.

## First-time setup

1. Install Bun (pinned in `.bun-version`).
2. Run `bun install`. It installs no Git hooks and runs no lifecycle scripts; CI runs every gate.

## Layout

- `apps/desktop`: Electron main process and preload. Windows, menus, dialogs,
  the `app://` protocol, capture intake, updates, and the two processes below. It never opens the database.
- `apps/renderer`: the React app. Routes, pages and stores, styled only with StyleX.
- `packages/library`: the library process, the only owner of the SQLite file.
  It runs the job queue and writes every job's result.
- `packages/jobs`: the worker process. OCR, embeddings, thumbnails, PDF and URL
  extraction as stateless calls the library process makes over Effect RPC.
- `packages/ingestion`: URL extraction, HTML sanitizing and the embed allowlist,
  shared by the worker and the renderer.
- `packages/contracts`: the Effect RPC groups the renderer and the library
  process call, the preload bridge type, the shortcut table, and the capture
  payload the browser extension sends.
- `packages/rpc-electron`: Effect RPC over Electron message ports.
- `packages/ui`: design tokens (`tokens.stylex.ts`, the only file with color
  values) and shared components.
- `tools/`: the packaged and launch smokes (`smoke/`), the frame and first-page
  benchmarks (`bench/`), model staging (`models/`), the lint plugin
  (`oxlint-plugin/`), repository checks (`repo/`) and release staging (`release/`).
- `extension/`: the Chrome extension. `benchmarks/`: the extraction and OCR corpus and harness.

## Running

| Goal | Command |
|---|---|
| Web preview with the demo seed | `bun run dev` |
| Desktop app from source, on a real library | `bun run dev:app` |
| Static web preview build (keeps the demo seed) | `bun run build:web` |
| App build (drops the demo seed) | `bun run build:app` |
| Electron directory build (unpacked) | `bun run build:dir` |
| Windows NSIS installer | `bun run build:win` |
| Linux Debian package and AppImage | `bun run build:linux` |
| macOS disk image (on an Apple silicon Mac) | `bun run build:mac` |
| Ingestion smoke | `bun run ingest:smoke` |
| Frame-time benchmark | `bun run bench` |
| Generate the 1,000-item benchmark library | `bun run bench:library` |
| First-page benchmark | `bun run bench:first-page` |
| Extraction and OCR quality benchmark | `bun run bench:quality` |

The web preview serves the demo seed in `apps/renderer/src/library/preview/` from
memory, only in `dev` and in `build:web`'s preview mode, which writes `dist/web`.
`build:app` writes `dist/renderer` and `dist/desktop`, then runs
`tools/repo/assert-no-demo-seed.ts`, which fails the build if any seed file or
reference reached them. electron-builder packs only those two folders, and every
packaging command goes through `build:app`, so no shipped package carries the
~9.7 MB seed.

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

`bun tools/smoke/packaged-backend.mjs` runs the unpacked build's PDF chunk, OCR worker, sharp and CPU models on Electron's Node runtime, with no GUI and no user library, on Windows, Linux or macOS. Run `bun run build:dir` first, or pass another unpacked app directory. It does not replace checking features in the installed app.

`bun tools/smoke/launch.ts` launches the `build:app` output against a scratch library and checks the window reached the library process; pass a packaged executable to launch that instead. On Linux without a display, run it under `xvfb-run -a`.

`bun tools/smoke/media.mjs source <output>` records thumbnail and poster sizes, warm median timings and pixel error. Pass the unpacked app directory instead of `source` to measure the packaged runtime.

## macOS app

`bun run build:mac` on an Apple silicon Mac writes an arm64 disk image to `.artifacts/electron/`.

- Intel Macs get no build: onnxruntime-node ships no macOS x64 binary, so embeddings and semantic search could not run.
- The app is ad-hoc signed (`mac.identity` is `-`) without the hardened runtime, because there is no Developer ID. An arm64 bundle without a valid signature does not launch at all; `codesign --verify --deep --strict` on the `.app` catches that.
- Gatekeeper blocks the first launch of a downloaded copy. The user allows it once in System Settings → Privacy & Security → Open Anyway.
- In-app updates are off; [tech-stack.md](../tech-stack.md#update-checks) says why and what turning them on takes.
- Screen capture uses the system picker on macOS 15 and later, and asks for Screen Recording permission on older versions.
- The top-level `files` in `package.json` keeps only the build machine's `onnxruntime-node/bin/napi-v6/${platform}` directory, so build each package on its own system. Keep `files` out of the `win`, `mac` and `linux` blocks: electron-builder 26 prepends `**/*` to a list that holds only exclusions and packs the whole repository; `tools/smoke/packaged-backend.mjs` fails if it does.
- `isbinaryfile` is overridden to 5.x in `package.json`: the 4.x that `@electron/osx-sign` asks for crashes while sniffing the bundled ONNX models during signing.

## Updates and releases

Settings → General → Updates offers two channels:

- **Stable / Beta** (`latest`) is the regular product. There is no separate beta feed.
- **Nightly** (`nightly`) accepts only newer `X.Y.Z-nightly.YYYYMMDD.N` versions. Switching back to Stable / Beta never downgrades the app.

Checking, downloading, canceling and installing are separate actions the user takes; nothing downloads or installs on its own. On Debian, PolicyKit runs the root-owned helper `apps/desktop/src/updates/update-helper.py`, installed as `update-helper.py` in the app's resources. It copies the downloaded `.deb` into private staging, verifies the feed's SHA512, package name, version and architecture on that copy, and only then runs `dpkg --install` on it, so a rewrite of the download cache during the authorization prompt cannot change what gets installed. Do not add silent dependency repair or a way around the authorization prompt. After a restart, the app compares its version with the one it tried to install before it reports the update as applied.

To cut a release:

1. Push a `vX.Y.Z` tag, or run the Release workflow with the `stable` channel and a version. Nightlies run daily on a schedule, or run the workflow with the `nightly` channel; their version is the next patch with a `-nightly.YYYYMMDD.<run>` suffix.
2. The workflow builds the Windows installer, the Linux `.deb` and AppImage, and the macOS disk image, runs the packaged smoke checks and launches each build, and creates a draft GitHub release. A run dispatched from any branch other than `main` stops after the builds and drafts nothing.
3. Review the draft and publish it. Until a channel has a published release, update checks on it show an error.

To test the updater locally, run `bun tools/smoke/update-feed.mjs`, or pass `.artifacts/electron/linux-unpacked` to run it on the packaged runtime. It downloads from loopback feeds, verifies SHA512, replaces a scratch AppImage and checks Debian metadata, and never installs as root.

Never add signing secrets or publish automatically. The Windows installer is not Authenticode-signed, so SmartScreen warns on install.

## Checks

| Goal | Command | Notes |
|---|---|---|
| Everything | `bun run check` | Every gate CI runs, in one command |
| Changed files | `bun run check:changed [ref]` | Lint, format, related tests, Knip and typecheck for what changed since `origin/main` or `ref`. Run it before pushing; it does not replace CI |
| Typecheck | `bun run typecheck` | Every app, package and tool, the extension, and the benchmarks |
| Tests | `bun run test` | |
| Unused code | `bun run knip` | To clean up, run `bunx knip --fix`, then `bun install` to re-sync the lockfile, then fix any `noUnusedLocals` errors |
| Lint and format | `bun run lint` (`bun run lint:fix` to apply) | oxlint, with inkling rules in `tools/oxlint-plugin/`, then oxfmt |
| Bun pin | `bun run check:bun-version` | running Bun must match `.bun-version` |
| Documented commands | `bun run check:refs` | every `bun run` in the docs and `t3.json` exists |
| Extension build | `bun run --cwd extension build` | |

## CI

Pushes and PRs that change only Markdown, `docs/` or `AGENTS.md` skip CI and the security scans.

- `ci.yml` runs the checks on `windows-latest`, and builds and launches the app from source on Windows, Linux and macOS.
- `security.yml` runs CodeQL when a PR opens or reopens and on about every fourth push to it, and dependency review on every PR push.
- The `preview:win` label builds the Windows installer for a same-repository PR, launches it and links it in a comment (`electron-preview.yml`). App changes in a same-repository PR also build the Linux directory package, run the backend smoke and launch it under Xvfb, and build the macOS app bundle, verify its signature, run the backend smoke and launch it.
- The `preview:web` label deploys the web preview to Vercel and comments its URL (`web-preview.yml`). `vercel.json` makes Vercel run `bun run build:web` and serve `dist/web`.
- `pr-size.yml` labels each PR by the size of its diff.
- `knip.yml` runs `knip --fix` every other day and opens a cleanup PR. It strips unused exports and prunes dependencies but never deletes files; if its PRs get noisy, tune the patterns in `knip.json` rather than disabling it.
- `links.yml` checks Markdown links weekly and fails the workflow when links are broken. Add custom schemes such as `inkling://` and local hosts to `.lycheeignore`.
- `release.yml` builds releases; see [Updates and releases](#updates-and-releases).

## Troubleshooting

- `Expected Bun X, found Y`: install the Bun in `.bun-version`; don't edit the check to match your install.
