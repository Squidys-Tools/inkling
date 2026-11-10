# Development

How to set up, run, build, check and release inkling. [CONTRIBUTING.md](../../CONTRIBUTING.md) says which contributions we take.

## First-time setup

1. Install Bun (pinned in `.bun-version`).
2. Run `bun install`. It installs no Git hooks and runs no lifecycle scripts; CI runs every gate.

## Layout

- `apps/desktop`: Electron main process and preload. Windows, menus, dialogs,
  the `app://` protocol, capture intake, updates, and the two processes below.
- `apps/renderer`: the React app. Routes, pages and stores.
- `apps/site`: the marketing site, a TanStack Start app prerendered to static
  HTML. It imports the renderer's cards, mascot, welcome-screen demos and demo
  seed instead of copying them.
- `packages/library`: the library process, the only owner of the SQLite file.
  It runs the job queue and writes every job's result.
- `packages/jobs`: the worker process. OCR, embeddings, thumbnails, PDF and URL
  extraction as stateless calls the library process makes over Effect RPC.
- `packages/ingestion`: URL extraction, HTML sanitizing and the embed allowlist,
  shared by the worker and the renderer.
- `packages/contracts`: the Effect RPC groups the renderer and the library
  process call, the preload bridge type, the shortcut table, and the capture
  payloads the browser extension sends.
- `packages/rpc-electron`: Effect RPC over Electron message ports.
- `packages/ui`: design tokens (`tokens.stylex.ts`) and shared components.
- `tools/`: CI scripts (`ci/`), the packaged and launch smokes (`smoke/`), the frame and first-page
  benchmarks (`bench/`), the `dev:app` launcher and its seeded library (`dev/`),
  the README mascot animation (`mascot/`), model staging (`models/`), the lint
  plugin (`oxlint-plugin/`), repository checks (`repo/`) and release staging
  (`release/`).
- `extension/`: the Chrome extension. `benchmarks/`: the extraction and OCR corpus and harness.

## Running

| Goal | Command |
|---|---|
| Web preview with the demo seed | `bun run dev` |
| Desktop app from source, on the seeded demo library | `bun run dev:app` |
| Static web preview build (keeps the demo seed) | `bun run build:web` |
| Marketing site | `bun run dev:site` |
| Marketing site, also at a public address | `bun run dev:site:tunnel` |
| Static marketing site build | `bun run build:site` |
| App build (drops the demo seed) | `bun run build:app` |
| Electron directory build (unpacked) | `bun run dist` |
| Windows NSIS installer | `bun run dist win` |
| Linux Debian package and AppImage | `bun run dist linux` |
| macOS disk image (on an Apple silicon Mac) | `bun run dist mac` |
| Frame-time benchmark | `bun run bench` |
| Generate the 1,000-item benchmark library | `bun run bench library` |
| First-page benchmark | `bun run bench first-page` |
| Extraction and OCR quality benchmark | `bun run bench quality` |

The web preview serves the demo seed in `apps/renderer/src/library/preview/` from
memory, only in `dev` and in `build:web`'s preview mode, which writes `dist/web`.
The site's interactive library at `/demo/` is the same preview built in `site`
mode: the site's `dev` and `build` scripts build it into `apps/site/public/demo`
first. It swaps in the seed in `preview/site/`: Unsplash photos whose credits the
site's `/credits` page lists, which the dev seed's photos do not have. The build
fails if a dev seed file still reaches it.
`dev:app` runs the app on `.dev-library/` in the worktree, which
`tools/dev/seeded-library.ts` fills with the same seed on first run, so both dev
modes show the same library and a dev run can never touch or stamp the real one.
Delete `.dev-library/` to reseed. The worktree's settle action (`Clean up worktree`
in `t3.json`) deletes it too, with `dist/` and `node_modules/`. Passing `dev:app` a
`--user-data-dir=<dir>` points at another library instead and never seeds it.
`build:app` writes `dist/renderer` and `dist/desktop`, then runs
`tools/repo/assert-no-demo-seed.ts`, which fails the build if any seed file or
reference reached them. electron-builder packs only those two folders, and every
packaging command goes through `build:app`, so no shipped package carries the
~9.7 MB seed.

The marketing site deploys from a Vercel project whose root directory is
`apps/site`; `apps/site/vercel.json` installs the Bun in `.bun-version` and
serves `apps/site/dist/client`. Its download buttons link the installers of the
latest GitHub release, looked up once per build. Build it with
`bun run build:site`, which runs Vite on Node: under the Bun runtime, StyleX's
production media-query parser fails.

The `/waitlist` page needs `VITE_CLERK_PUBLISHABLE_KEY` in the Vercel project's
environment variables and in `apps/site/.env.local` for local runs (`*.local` is
ignored by git). Without it the page says the waitlist is not open. In the Clerk
dashboard, set the access mode to Waitlist and keep email enabled, since
invitation emails need it.

Iterate on the site with `bun run dev:site` (hot reload; read the port from its
output). At start it rebuilds `/demo/` only if something the demo is built from changed, so restart it to see renderer changes there. To open it from another machine, press `t + enter` in its terminal, or start it with `bun run dev:site:tunnel`: it prints a trycloudflare.com address served through `cloudflared` (`winget install Cloudflare.cloudflared`). The address is public and a dev server hands out the worktree's source, so close the tunnel (`t + enter` again) when done. Vercel's automatic Git deployments are disabled in
`apps/site/vercel.json`. The `Site preview` workflow invokes Vercel only for a
same-repository PR targeting `main` that changes `apps/site`,
`apps/renderer`, the site's imported `packages/contracts`, `packages/ingestion`,
`packages/rpc-electron` or `packages/ui`, or a shared dependency or toolchain file. It runs
`tools/ci/site-deploy.ts preview`, which deploys with the Vercel CLI and updates
one PR comment with the preview URL. Fork PRs do not get Vercel secrets or
previews.

The `Deploy site` workflow (`.github/workflows/site-deploy.yml`) is the only
path to the production domain. It runs on every push to `main` whose paths match
the preview filter above; keep the two lists in sync. The Release workflow dispatches it after each nightly publishes (the
workflow token emits no release event, so a `release` trigger would not fire);
after publishing a stable release, run `gh workflow run site-deploy.yml` to pick
up the new installers. On the `site-production` GitHub environment, which
deploys only from `main`, `tools/ci/site-deploy.ts production` builds a
production deployment with no domain, promotes it through the Vercel API, and
fails unless getinkling.dev then points at that deployment. A failed build leaves the previous site live. A newer push replaces a
deploy still waiting in the queue. Both environments hold the `VERCEL_TOKEN`,
`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets; `site-staging`, used only by
previews, allows `main` plus `refs/pull/*/merge`.

Packaged builds bundle the embedding models; [models.md](../models.md) covers how
development builds fetch them. `bun run dist` runs electron-builder on Node,
which loads the TypeScript `afterPack` hook (`apps/desktop/after-pack.ts`) only
on Node 22.18 or later in the 22 line, or 23.6 and later: the releases that strip
types by default.

## Linux packages

`bun run dist linux` writes a `.deb` and an AppImage to `.artifacts/electron/`.

- Install the `.deb` with `sudo apt install ./<package>.deb`. Its install scripts set up Chromium's sandbox and Ubuntu's AppArmor profile. Never work around a sandbox startup error with `--no-sandbox`.
- An AppImage runs only on a host that lets Chromium's sandbox start.
- The `.deb` depends on FFmpeg for local-video posters, and on `pkexec` and `python3` for the update helper. An AppImage on a host without `/usr/bin/ffmpeg` shows the typed video card instead of a poster.
- On Wayland, Screen capture goes through the system screen-sharing portal. If the user denies it, they can take a screenshot with the system tool and paste it.
- A pinned patch makes sharp use its WASM backend in Linux Electron, because the native libvips collides with Electron's GLib. When upgrading sharp, update the patch and `@img/sharp-wasm32` (a Knip runtime exception) together.
- PDF rendering uses the bundled PDF.js fonts, character maps and WASM decoders, because the system-font scan crashes Linux Electron.

`bun tools/smoke/packaged-backend.ts` runs the unpacked build's PDF chunk, OCR worker, sharp and CPU models on Electron's Node runtime, with no GUI and no user library, on Windows, Linux or macOS. Run `bun run dist` first, or pass another unpacked app directory. It does not replace checking features in the installed app.

`bun tools/smoke/launch.ts` launches the `build:app` output against a scratch library and checks the window reached the library process; pass a packaged executable to launch that instead. On Linux without a display, run it under `xvfb-run -a`.

`bun tools/smoke/gl-paint.ts` runs the renderer's WebGL painters in Electron and fails when a frame differs from the CPU painter it replaces, or when WebGL was never used. It accepts software WebGL, which the app refuses, so CI checks the shaders without a GPU. On Linux without a display, run it under `xvfb-run -a`.

`bun tools/smoke/media.ts` makes WebP thumbnails of the demo seed's photos and a poster of its clip with the system FFmpeg, and checks that the poster refuses unsupported files, a missing decoder, URLs and remote playlists. Pass the unpacked Linux app directory to run the packaged worker's modules on its Electron runtime.

## macOS app

`bun run dist mac` on an Apple silicon Mac writes an arm64 disk image to `.artifacts/electron/`.

- Intel Macs get no build: onnxruntime-node ships no macOS x64 binary, so embeddings and semantic search could not run.
- The app is ad-hoc signed (`mac.identity` is `-`) without the hardened runtime, because there is no Developer ID. An arm64 bundle without a valid signature does not launch at all; `codesign --verify --deep --strict` on the `.app` catches that.
- Gatekeeper blocks the first launch of a downloaded copy. The user allows it once in System Settings → Privacy & Security → Open Anyway.
- In-app updates are off; [tech-stack.md](../tech-stack.md#update-checks) says why and what turning them on takes.
- Screen capture uses the system picker on macOS 15 and later, and asks for Screen Recording permission on older versions.
- The top-level `files` in `package.json` keeps only the build machine's `onnxruntime-node/bin/napi-v6/${platform}` directory, so build each package on its own system. Keep `files` out of the `win`, `mac` and `linux` blocks: electron-builder 26 prepends `**/*` to a list that holds only exclusions and packs the whole repository; `tools/smoke/packaged-backend.ts` fails if it does.
- `isbinaryfile` is overridden to 6.x in `package.json`: the 4.x that `@electron/osx-sign` asks for crashes while sniffing the bundled ONNX models during signing. 6.x is ESM-only, and `@electron/osx-sign` and `app-builder-lib` load it with `require()`, so electron-builder needs a Node that can `require()` an ES module: 20.19, 22.12 or later.

## Updates and releases

Settings → Updates offers two channels:

- **Alpha** (`latest`) is the regular product. There is no separate beta feed.
- **Nightly** (`nightly`) accepts only newer `X.Y.Z-nightly.YYYYMMDD.N` versions. Switching back to Alpha never downgrades the app.
- An unpackaged build (`bun run dev:app`) always runs Nightly and ignores the saved channel, because the installed app shares `updates.json`.

Checking, downloading, canceling and installing are separate actions the user takes; nothing downloads or installs on its own. On Debian, PolicyKit runs the root-owned helper `apps/desktop/src/updates/update-helper.py`, installed as `update-helper.py` in the app's resources. It copies the downloaded `.deb` into private staging, verifies the feed's SHA512, package name, version and architecture on that copy, and only then runs `dpkg --install` on it, so a rewrite of the download cache during the authorization prompt cannot change what gets installed. Do not add silent dependency repair or a way around the authorization prompt. After a restart, the app compares its version with the one it tried to install before it reports the update as applied.

To cut a release:

1. Push a `vX.Y.Z` tag, or run the Release workflow with the `stable` channel; a dispatched stable builds the latest published nightly's commit, so stable only ever ships a build nightly users already ran (`version` overrides the nightly-derived version). Nightlies have no schedule: run the workflow with the `nightly` channel to ship one from `main`, whether or not `main` has changed since the last nightly. Their version is the next patch with a `-nightly.YYYYMMDD.<run>` suffix. The `preview` channel exercises the whole flow from any branch and releases nothing.
2. The workflow runs the same typecheck, lint, unit-test and web-build gates as CI, builds the Windows installer, the Linux `.deb` and AppImage, and the macOS disk image, runs the packaged smoke checks and launches each build, creates the release tag at the built commit, then a draft GitHub release. Nothing is published unless every gate passes. A nightly publishes itself once every asset is attached; a stable release stays a draft, with its tag already in place. If you discard a stable draft, delete its tag too.
3. For stable, review the draft, which holds notes generated from merged PR titles, and publish it. Until a channel has a published release, update checks on it show an error.
4. For a stable release, add its section to `docs/changelog.md` from those notes, following the rules at the top of that file.

To test the updater locally, run `bun tools/smoke/update-feed.ts`, or pass `.artifacts/electron/linux-unpacked` to run it on the packaged runtime. It downloads from loopback feeds, verifies SHA512, replaces a scratch AppImage and checks Debian metadata, and never installs as root.

Never add signing secrets. Nightlies publish themselves; a stable release is published by hand. The Windows installer is not Authenticode-signed, so SmartScreen warns on install.

## Checks

| Goal | Command | Notes |
|---|---|---|
| Everything | `bun run check` | Every gate CI runs, in one command |
| Changed files | `bun run check:changed [ref]` | Lint, format, related tests, Knip and typecheck for what changed since `origin/main` or `ref`. Run it before pushing; it does not replace CI |
| Typecheck | `bun run typecheck` | Every app, package and tool, the extension, and the benchmarks |
| Tests | `bun run test` | Includes the ingestion pipeline smoke |
| Unused code | `bun run knip` | To clean up, run `bunx knip --fix`, then `bun install` to re-sync the lockfile, then fix any `noUnusedLocals` errors |
| Lint and format | `bun run lint` (`bun run lint:fix` to apply) | oxlint, with inkling rules in `tools/oxlint-plugin/`, then oxfmt |
| Bun pin | `bun tools/repo/check-bun-version.ts` | running Bun must match `.bun-version` |
| Documented commands | `bun tools/repo/command-refs.ts` | every `bun run` in the docs and `t3.json` exists |
| Extension build | `bun run build:extension` | |

## CI

Workflow logic lives in TypeScript under `tools/ci/` and `tools/release/`; the YAML only wires it
up. Scripts that import only `tools/ci/github.ts` run without `bun install`. Each third-party
`uses:` pins the commit of a release tag, with the tag in a comment (`@<sha> # v7.0.1`), and
Dependabot updates the two together.

- `ci.yml` runs on every push to `main` and every PR. It calls `checks.yml` (typecheck, lint,
  Knip, web and extension builds on Linux, unit tests on Windows and Linux) and `package.yml` (package the
  unpacked app on Windows and Linux, run the packaged smoke checks and launch it). A PR skips
  either when its diff cannot affect it; every commit on `main` runs both, each in its own run
  that no later merge cancels. macOS packages only on a PR that changes its `macos` paths and in
  every release run: hosted macOS runners queue for long enough that GitHub cancels jobs, and a
  cancelled job marks the commit failed. CI also runs CodeQL, and dependency review on PRs. A
  same-repository PR's Windows and Linux builds are uploaded as 3-day artifacts. `CI result`
  passes only when every job it needs passed or was skipped, so it is the check to require.
- `release.yml` runs the same `checks.yml` and `package.yml` on the commit it ships; see
  [Updates and releases](#updates-and-releases).
- `pr-size.yml` labels each PR by its changed lines (`tools/ci/pr-size.ts`).
- `knip.yml` runs `knip --fix` every other day and opens a cleanup PR. It strips unused exports and prunes dependencies but never deletes files; if its PRs get noisy, tune the patterns in `knip.json` rather than disabling it. GitHub starts no workflows for a PR the workflow token opens, so close and reopen it to run CI.
- `dependabot-lockfile.yml` rebuilds a Dependabot Bun PR's `bun.lock` with the Bun in
  `.bun-version`, starting from the lockfile the PR branched from, and pushes it with
  `[dependabot skip]` so Dependabot can still rebase. Dependabot's own Bun drops the `libc` and
  `hasInstallScript` fields from every entry and keeps orphaned ones; the rebuild keeps the
  entries main already has and writes the changed ones as Bun 1.4 does. The pushed commit gets no
  CI run, because workflow-token pushes start none; main's CI covers it after the merge. The job
  fails instead when the rebuild would lose an update (a transitive-only bump) or a `patches/`
  file stops applying; fix those by hand.
- `links.yml` checks Markdown links weekly. Add custom schemes such as `inkling://` and local hosts to `.lycheeignore`.

## Troubleshooting

- `Expected Bun X, found Y`: install the Bun in `.bun-version`; don't edit the check to match your install.
