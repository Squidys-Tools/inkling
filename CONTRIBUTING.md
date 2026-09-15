# Contributing

Small, focused PRs. Bug fixes merge fastest; 1,000+ line multi-feature PRs will likely be closed.

## Setup

You need Bun 1.4.0 (see `.bun-version`) and the Rust toolchain. On Windows pick MSVC (admin) or GNU (no admin) — details in `docs/operations/development.md`.

```powershell
bun install
bun run preview
```

## Before you push

For early signal:

```powershell
bun run check:frontend
```

For Rust changes, from `src-tauri/`: `cargo fmt`, `cargo check --locked`, `cargo test --locked`.

Full command reference, CI behavior, and troubleshooting: [`docs/operations/development.md`](docs/operations/development.md).

## PRs

- Fill in `What Changed` / `Why`.
- UI changes need before/after screenshots (video for motion/interaction).
- Add a `docs/changelog.md` entry under `Unreleased` for anything that changes behavior — see that file's header for the format.
