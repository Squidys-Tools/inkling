# AGENTS.md

T3 Code instructions:
- Screenshots the user must SEE: tool-result images never render in chat — always save via `screenshot_out_file` to `C:\Users\$USER$\AppData\Local\Temp\$HARNESS$\chat-images\` (create it if missing) and embed with `![what](C:\...\chat-images\name.png)`; only that subfolder may ever be wiped. Fullscreen screenshots or full desktop screenshots are preferred unless the user asks to only see a specific app, window, or specified section of ui.
- You have the tauri-plugin-mcp-bridge as an option to control the native desktop app alongide any other computer use tools you have access too.
- When in T3 Code you will most likely have browser use tools available to you to control the web ui counter part of the app.
- While completing work you are required to continually update the changelog file in the docs/ for transparency on the progression of the app.

## Project snapshot

inkling is a Windows-first Tauri 2 desktop app (React + TypeScript + Vite frontend, Rust native core, SQLite storage). Bun 1.4.0 is the package manager — the pinned version lives in `.bun-version` and `package.json#packageManager`. Never use npm/pnpm/yarn here; use `bun.lock` and Bun commands.

Docs layout (t3code-inspired split: product docs, operations, planning):

- Product and behavior: `docs/product.md`, `docs/product-behavior.md`, `docs/design.md`, `docs/expanded-item-overlay.md`, `docs/models.md`
- Architecture: `docs/tech-stack.md`
- Planning: `docs/roadmap.md`, `docs/changelog.md`
- Contributor operations: `docs/operations/development.md` (setup, commands, checks, troubleshooting), `CONTRIBUTING.md` (short entry point)
- `docs/README.md` is the index — keep it current when adding or moving docs.

## Commands

- Install: `bun install` (no hooks, no lifecycle scripts — CI owns all gates)
- Web preview (no Rust compile): `bun run preview`
- Desktop app: `bun run tauri dev`
- Fast local gate (optional): `bun run check` (typecheck + unit tests)
- CI parity: `bun run check:frontend` (also runs knip, build + ingestion smoke; this is what CI runs — no local check/test hooks exist by policy, CI owns all gates)
- Native checks (needs Rust toolchain): `cargo fmt`, `cargo check --locked`, `cargo test --locked` from `src-tauri/`
- Single-purpose: `bun test`, `bun run build`, `bun run ingest:smoke`, `bun run typecheck`, `bun run knip:check`

## Checks and quality gates

- `bun run check:bun-version` fails when `.bun-version`, `packageManager`, or the running Bun disagree — fix the version, don't delete the check.
- `noUnusedLocals` / `noUnusedParameters` are on (`tsconfig.json`); `knip.json` entry/project patterns plus the scheduled `knip --fix` workflow own unused-export/dependency cleanup. `bun run knip:check` is a hard gate in CI — keep `knip.json` accurate when adding entry points.
- CI (`ci.yml`) and Security (`security.yml`) skip docs-only pushes and path-gate frontend vs. native jobs. Automation config (`.entire/`) never skips checks. Match that behavior when touching workflows.
- Markdown link checks run weekly (`links.yml`, `.lycheeignore`). Add new custom schemes or local hosts to `.lycheeignore`.

## Windows toolchains (pick one per machine)

- MSVC (admin rights): VS Build Tools with C++ workload, then `rustup default stable-x86_64-pc-windows-msvc`.
- GNU (no admin): `scoop install gcc`, then `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` in the checkout. The `export ordinal too large` workaround lives in `src-tauri/.cargo/config.toml` (target-gated rustflags) — don't move it back into `build.rs`.

## Working conventions

- Small, focused diffs. Match existing style; run `cargo fmt` for Rust (CI enforces `cargo fmt --check`).
- Never commit secrets, local model caches, databases, or build output. Check `git status` before committing.
- PRs: fill in `What Changed` / `Why`, add before/after screenshots or video for UI changes, tick the checklist (checks run + changelog entry where applicable).
- Changelog (`docs/changelog.md`): append under `Unreleased` grouped as `Added`/`Changed`/`Fixed`/`Removed`; one human-readable line per entry, no AI-agent mentions, skip trivial typo/format-only changes. See the header of that file for the full format.
