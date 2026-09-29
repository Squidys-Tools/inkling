# Development

How to set up, run, check, and troubleshoot inkling. Contribution scope and PR expectations live in `CONTRIBUTING.md`; this is the command and check reference.

## First-time setup

1. Install Bun 1.4.2 (pinned in `.bun-version` and `package.json#packageManager`) and the Rust toolchain.
2. On Windows, pick one Rust toolchain per machine:
   - MSVC (admin rights): VS Build Tools with the C++ workload, then `rustup default stable-x86_64-pc-windows-msvc`.
   - GNU (no admin): `scoop install gcc`, then `rustup toolchain install stable-x86_64-pc-windows-gnu` and `rustup override set stable-x86_64-pc-windows-gnu` inside the checkout.
3. `bun install` — plain install, no hooks and no lifecycle scripts.

## Running

| Goal | Command |
|---|---|
| Web preview (no Rust compile, fastest UI loop) | `bun run preview` |
| Desktop app | `bun run tauri dev` |
| Portable Windows review build | `bun run preview:win` |
| Fetch the pinned ONNX Runtime DLL | `bun run provision:ort` |
| Production frontend build (with demo seed, for preview) | `bun run build` |
| Shipped app build (excludes the demo seed) | `bun run build:app` |
| Ingestion smoke | `bun run ingest:smoke` |

`bun run preview:win` builds a self-contained review folder under
`.artifacts/inkling-preview-win`. It downloads and verifies the pinned ONNX
Runtime DLL and embedding models, then places the database, assets, and models
under that folder's `data\` directory. Run `inkling.exe` there; deleting the
folder deletes the preview library. Windows WebView2 is assumed to be installed.

`bun run build` keeps the committed demo seed, because the web preview and
`vite preview` need it. `bun run build:app` drops it — both `public/seed-demo/`
and the `src/seedPersonal.ts` bundle — and then runs
`scripts/assert-no-demo-seed.ts`, which fails the build if either is still
present. The Tauri build uses it, so a shipped installer never carries the
~9.7 MB seed. Changing what the app ships means changing that mode, not `build`.

`onnxruntime.dll` is a gitignored download that `bun tauri build` and the
release workflow need before bundling, because `bundle.resources` lists it and
`ort` loads it dynamically. `bun run provision:ort` downloads and SHA-256
verifies the pinned build from `scripts/native-preview-runtime.json` into
`src-tauri\`. It is safe to re-run: an existing copy that already matches the pin
is left alone, and one that does not is reported rather than silently replaced.

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
| Native | `cargo fmt` / `cargo clippy` / `cargo check --locked` / `cargo test --locked` | Run from `src-tauri/` |

For early signal, run `bun run check:frontend` for frontend changes or the native checks for Rust changes. `noUnusedLocals` / `noUnusedParameters` are on — the compiler will catch dead locals; Knip catches dead exports and dependencies.

## Git hooks

None — there are no local hooks by policy. Formatting (`cargo fmt --check`), linting (`cargo clippy -- -D warnings`), and all other gates run in CI.

## CI behavior (what runs where)

- `ci.yml`: docs-only pushes skip; otherwise path-gated `frontend` vs `native` jobs. `frontend` verifies the Bun version pin, typechecks every workspace, runs tests, `knip:check`, build, ingestion smoke, and the extension build. `native` runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo check --locked`, and `cargo test --locked`.
- `security.yml`: CodeQL (JS/TS + Rust) on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only.
- `knip.yml`: scheduled `knip --fix` (every other day) opens a cleanup PR. It strips unused `export` keywords and prunes dependencies; it never deletes files.
- `links.yml`: weekly markdown link check, opens an issue on failures. New custom schemes (`inkling://`) or local hosts go in `.lycheeignore`.
- `native-preview.yml`: when a same-repository PR has the `preview:win` label, builds the portable folder and uploads it as a three-day artifact. Model files are downloaded for the build but are not stored in GitHub Actions cache. It does not launch the app in CI; verify the downloaded folder locally.
- Automation config (`.entire/`) never skips checks.

## Troubleshooting

- `Expected Bun X, found Y`: install the pinned Bun from `.bun-version`; don't edit the check to match your install.
- `export ordinal too large` (GNU toolchain): the workaround is target-gated rustflags in `src-tauri/.cargo/config.toml`. Don't move it back into `build.rs`.
- `WebView2Loader.dll` / blank window on GNU builds: do a full `cargo build` so the DLL is placed beside the exe, and confirm the Common-Controls v6 manifest is embedded.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
