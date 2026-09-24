# inkling verification map

This directory is the maintained source for verifying inkling's user-facing behavior. Read this index before driving the app, then open the matching feature file for the recipe.

## Baseline preconditions

- Launch per [SKILL.md](../SKILL.md): `serve` then `start` into a fresh `--run-dir`, and run `doctor` before driving.
- The web preview shows the committed demo library: **28 items**, fixed shuffle, `[data-testid="web-preview-badge"]` visible. Mutations live in browser memory only and vanish when the run stops.
- Use `serve --mode dev`. The archive ships 3 seeded items only in a dev build; a production build (`--mode preview`) starts with an empty archive.
- The current source has Settings tabs for **Archive** and **Extension**. It has no Data tab or export command. Do not use an export recipe until that implementation exists in the checked-out source.
- The demo library contains **no Article card** (the four keepers are an X post, a PDF, a note, and a quote) and no PDF file behind the PDF card. Reader, PDF viewer, and successful URL capture are therefore not reachable from the seed. See [library-browse.md](./library-browse.md) and [capture.md](./capture.md).
- Native behavior, including OCR, thumbnails, embeddings, file access, SQLite, the deep link, and the extension receiver, exists only in the desktop app. A preview run proves the panel boundary, not the native operation.
- Never drive an instance this run did not start. Other run dirs and the developer's own dev server may be live on this machine.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer the app's own handles, such as ARIA labels, `data-library-item-id`, and stable class names, over position. The table lives in [SKILL.md](../SKILL.md).
- Scope text clicks with `--within` when a label can appear in more than one surface.
- Wait on the observable value with `wait --selector` or `wait --expr` instead of inserting a delay. The native search request waits 200 ms; the preview filter updates immediately.
- Assert totals through `.result-count` and `.nav-count`, never a `.library-card` count. The masonry grid is virtualized, so any card count is only the current rendered window.
- The real scroll container is `.library-grid[data-testid="virtuoso-scroller"]`. Reset that element before addressing a card by id. Setting `.library-grid.scrollTop` does nothing.
- Assert bodies through `textContent`, not `innerText`, for anything that may be offscreen.
- Every mutation in the preview is in memory. Restore the baseline with `navigate --url <run url>` rather than expecting a discard button.

## Proof and skip reporting

- Capture the user action and the resulting state: the before count, the filled form, the after count, and the changed view.
- A UI proof is a screenshot plus the asserted value, not either alone.
- Mutation proof pairs the visible change with a second read of the same fact, such as `.result-count` after recovering an archive item or the card in the grid after a capture.
- Record which entry point you exercised. Add-menu capture does not prove paste, drag and drop, clipboard, screenshot, the deep link, or the browser extension.
- Report an entry point this harness cannot drive, with its prerequisite and route attempted. Do not substitute a different entry point and call the feature verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with harness.mjs`, `Gotchas`. `Driving it with harness.mjs` starts with `Preconditions:` and pairs each user action with the exact command and the observable result.

## Features

- [Capture an item](./capture.md): Add menu, note, quote, link, file, screenshot, and ambient capture boundaries.
- [Search the library](./search.md): search focus, matching, empty state, clearing, and saved-search entry points.
- [Browse and open items](./library-browse.md): grid and list views, navigation views, card types, overlays, and reader/PDF boundaries.
- [Spaces](./spaces.md): creating, selecting, coloring, renaming, reordering, and deleting Spaces.
- [Archive and recover](./archive-restore.md): forgetting, Undo, the Settings archive, selection, recover, and permanent delete.
- [Pair the browser extension](./extension.md): the Settings pairing panel and the extension's preview/native boundary.
