# Development

How to set up, run, check, and troubleshoot inkling. Short version lives in `CONTRIBUTING.md`; this is the full reference.

## First-time setup

1. Install Bun 1.4.0 (pinned in `.bun-version` and `package.json#packageManager`) and the Rust toolchain.
2. On Windows, pick one Rust toolchain per machine:
   - MSVC (admin rights): VS Build Tools with the C++ workload, then `rustup default stable-x86_64-pc-windows-msvc`.
   - GNU (no admin): `scoop install gcc`, then `rustup toolchain install stable-x86_64-pc-windows-gnu` and `rustup override set stable-x86_64-pc-windows-gnu` inside the checkout.
3. `bun install` — plain install, no hooks and no lifecycle scripts.

## Running

| Goal | Command |
|---|---|
| Web preview (no Rust compile, fastest UI loop) | `bun run preview` |
| Desktop app | `bun run tauri dev` |
| Production frontend build | `bun run build` |
| Ingestion smoke | `bun run ingest:smoke` |

## Checks

| Goal | Command | Notes |
|---|---|---|
| Fast local gate | `bun run check` | `typecheck` + `bun test` |
| CI parity (frontend) | `bun run check:frontend` | Version pin + locked install + tests + knip + build + ingestion smoke — exactly what the CI frontend job runs |
| Typecheck only | `bun run typecheck` | App + benchmark harness |
| Unused code | `bun run knip:check` | Hard gate in CI; `knip.json` owns entry/project patterns. To clean up locally, run `bunx knip --fix` then `bun install --ignore-scripts` (re-syncs the lockfile if deps were pruned), fix any `noUnusedLocals` fallout, and re-run `bun run check:frontend` |
| Bun pin | `bun run check:bun-version` | `.bun-version` vs `packageManager` vs running Bun must agree |
| Native | `cargo fmt` / `cargo check --locked` / `cargo test --locked` | Run from `src-tauri/` |

For early signal, run `bun run check:frontend` for frontend changes or the native checks for Rust changes. `noUnusedLocals` / `noUnusedParameters` are on — the compiler will catch dead locals; Knip catches dead exports and dependencies.

## Git hooks

None — there are no local hooks by policy. Formatting (`cargo fmt --check`) and all other gates run in CI.

## CI behavior (what runs where)

- `ci.yml`: docs-only pushes skip; otherwise path-gated `frontend` vs `native` jobs. `frontend` runs tests, `knip:check`, build, and ingestion smoke.
- `security.yml`: CodeQL (JS/TS + Rust) on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only.
- `knip.yml`: scheduled `knip --fix` (every other day) opens a cleanup PR. It strips unused `export` keywords and prunes dependencies; it never deletes files.
- `links.yml`: weekly markdown link check, opens an issue on failures. New custom schemes (`inkling://`, `mymind://`) or local hosts go in `.lycheeignore`.
- Automation config (`.entire/`) never skips checks.

## Troubleshooting

- `Expected Bun X, found Y`: install the pinned Bun from `.bun-version`; don't edit the check to match your install.
- `export ordinal too large` (GNU toolchain): the workaround is target-gated rustflags in `src-tauri/.cargo/config.toml`. Don't move it back into `build.rs`.
- `WebView2Loader.dll` / blank window on GNU builds: do a full `cargo build` so the DLL is placed beside the exe, and confirm the Common-Controls v6 manifest is embedded.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
