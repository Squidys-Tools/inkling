# Contributing

## Read this first

We are not actively accepting major contributions right now.

You can still report a bug or open a PR, but please know there is a high chance we close it, defer it, or not look at it for some time.

This project is early stage and growing fast. Its an Electron + React desktop app, and we try to keep scope, quality, and direction under control.

## What we are most likely to accept

- Small, focused bug fixes
- Small reliability fixes
- Small performance improvements
- Tightly scoped maintenance work that clearly improves the project without changing its direction(or breaking anything obv)

## What we are least likely to accept

- Large PRs
- Drive-by feature work
- Opinionated rewrites or redesigns
- Anything that expands product scope without us asking or signing off on it first

If you open a 1,000+ line PR full of new features, it will either sit stale or get closed quickly and remember that you ignored our clear instructions.

## If you still want to open a PR

- Keep it small, and do not mix unrelated fixes together
- Explain exactly what changed and why the change should exist
- Check docs/product-behavior.md before you change behavior. Give the PR a conventional title such as `fix(reader): code blocks keep line breaks`; maintainers write the changelog when they cut a release, so do not edit docs/changelog.md
- Run `bun run check:changed` before you push. docs/operations/development.md covers setup and the other checks
- If the PR makes anything resembling a UI change, include clear before and after images
- If the change depends on motion, timing, transitions, or interaction details, include a short video in your pr

If we have to guess what changed, we are much less likely to review it.

## Discuss changes first

If you are thinking about a non-trivial change, open an issue first and describe the problem and planned approach.

That still does not mean we will assuredly merge the pr, but it gives you a chance to avoid wasting your time.

## Be realistic

Opening a PR does not create an obligation on our side.

We may close it. We may ignore it. We may ask you to shrink it. We may reimplement the idea ourselves later.

If you are fine with that, proceed.
