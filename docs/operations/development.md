# Development

How to set up, run, check, and troubleshoot inkling. Short version lives in `CONTRIBUTING.md`; this is the full reference.

## First-time setup

1. Install Bun 1.4.0 (pinned in `.bun-version` and `package.json#packageManager`) and the Rust toolchain.
2. On Windows, pick one Rust toolchain per machine:
   - MSVC (admin rights): VS Build Tools with the C++ workload, then `rustup default stable-x86_64-pc-windows-msvc`.
   - GNU (no admin): `scoop install gcc`, then `rustup toolchain install stable-x86_64-pc-windows-gnu` and `rustup override set stable-x86_64-pc-windows-gnu` inside the checkout.
3. `bun install` — the `prepare` script runs `scripts/setup-hooks.ts`, which installs lefthook hooks idempotently and preserves the Entire wrapper. Never run bare `lefthook install`.

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
| CI parity (frontend) | `bun run check:frontend` | Version pin + locked install + tests + build + ingestion smoke. Same as CI and the pre-push hook |
| Typecheck only | `bun run typecheck` | App + benchmark harness |
| Unused code (advisory) | `bun run knip:check` | `knip.json` owns entry/project patterns; currently reports a backlog, so CI treats it as advisory until the scheduled `knip --fix` PRs clear it |
| Bun pin | `bun run check:bun-version` | `.bun-version` vs `packageManager` vs running Bun must agree |
| Native | `cargo fmt` / `cargo check --locked` / `cargo test --locked` | Run from `src-tauri/` |

Before pushing frontend changes, run `bun run check:frontend`. Before pushing Rust changes, run the native checks. `noUnusedLocals` / `noUnusedParameters` are on — the compiler will catch dead locals; Knip catches dead exports and dependencies.

## Git hooks

- Pre-commit: `cargo fmt` on `src-tauri/*.rs` (staged fixes are re-staged).
- Pre-push: `bun run check:frontend`.
- Hook installs happen through `bun install` / `scripts/setup-hooks.ts`. Linked worktrees share the main checkout's hooks directory and need no setup; if a worktree complains about damaged hooks, repair from the main checkout.

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
- Push blocked by a nested `lefthook install`: update and use `bun install --frozen-lockfile --ignore-scripts` semantics from `check:frontend` — lifecycle scripts are skipped there on purpose.
- `knip --fix` PR is noisy: tune `knip.json` entry/project patterns instead of disabling the workflow.
