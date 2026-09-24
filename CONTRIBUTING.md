# Contributing

## Developer setup

See the "For developers" section in README.md for install steps and commands. You need Bun 1.4.2 (see .bun-version) and a Rust toolchain on Windows.

The usual commands are:

```powershell
bun install
bun run preview      # quick web look at the UI, no Rust build
bun run tauri dev    # full Windows desktop app
bun run check:frontend  # same frontend checks CI runs
```

Start with docs/product-behavior.md for the behavior contract, docs/roadmap.md for status, and docs/changelog.md for recent changes.

## Read this first

We are not actively accepting contributions right now.

You can still report a bug or open a PR, but please do so knowing there is a high chance we close it, defer it, or never look at it.

This project is early and solo built. It is a Tauri plus React plus Rust desktop app, and we try to keep scope, quality, and direction under control.

## What we are most likely to accept

Small, focused bug fixes.

Small reliability fixes.

Small performance improvements.

Tightly scoped maintenance work that clearly improves the project without changing its direction.

## What we are least likely to accept

Large PRs.

Drive-by feature work.

Opinionated rewrites.

Anything that expands product scope without us asking for it first.

If you open a 1,000+ line PR full of new features, we will probably close it quickly and remember that you ignored the clearly written instructions.

## If you still want to open a PR

Keep it small.

Explain exactly what changed.

Explain exactly why the change should exist.

Check docs/product-behavior.md before you change behavior. Follow the changelog rules at the top of docs/changelog.md, and keep docs changes minimal per AGENTS.md.

Do not mix unrelated fixes together.

Run the focused checks for what you touched, such as bun test for changed tests or bun run check:frontend for frontend changes.

If the PR makes anything resembling a UI change, include clear before and after images.

If the change depends on motion, timing, transitions, or interaction details, include a short video.

If we have to guess what changed, we are much less likely to review it.

## Discuss changes first

If you are thinking about a non-trivial change, open an issue first and describe the problem and the planned approach.

That still does not mean we will want the PR, but it gives you a chance to avoid wasting your time.

## Be realistic

Opening a PR does not create an obligation on our side.

We may close it. We may ignore it. We may ask you to shrink it. We may reimplement the idea ourselves later.

If you are fine with that, proceed.
