# inkling verification map

This directory is the maintained source for verifying inkling's user-facing behavior. Read this index before driving the app, then open the matching feature file for the recipe.

## Baseline preconditions

- Launch per [SKILL.md](../SKILL.md): `serve` then `start` into a fresh `--run-dir`, and run `doctor` before driving.
- The web preview shows the committed demo library: **28 items**, fixed shuffle, `[data-testid="web-preview-badge"]` visible. Mutations live in browser memory only and vanish when the run stops.
- Use `serve --mode dev`. The archive ships 3 seeded items only in a dev build; a production build (`--mode preview`) starts with an empty archive.
- The demo library contains **no Article card** (the four keepers are an X post, a PDF, a note, and a quote) and no PDF file behind the PDF card. Reader, PDF viewer, and URL capture are therefore not reachable from the seed — see [library-browse.md](./library-browse.md) and [capture.md](./capture.md).
- Native behavior — OCR, thumbnails, embeddings, job queue, export, the `inkling://capture` deep link — only exists in the desktop app. A preview run says nothing about it beyond the panel that offers it; see [export.md](./export.md) for where that boundary sits.
- Never drive an instance this run did not start. Other run dirs and the developer's own dev server may be live on this machine.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer the app's own handles (ARIA labels, `data-library-item-id`, stable class names) over position. The table lives in [SKILL.md](../SKILL.md).
- Scope text clicks with `--within` when a label can appear in more than one surface.
- Wait on the observable value with `wait --selector/--expr` instead of inserting a delay. The 200 ms search debounce and the card enter animation both need waiting, not sleeping.
- Assert totals through `.result-count` and `.nav-count`, never a `.library-card` count. The masonry grid is virtualized: at 1440×900 the grid rendered 15 cards for the 28 seeded items, and list mode rendered 4 in one run and 19 in another. Any card count is a rendered window that moves with the scroll, so a recipe must not assert one.
- Reset the grid's scroll before addressing a card by id. The harness scrolls a click target into view and the grid keeps one scroll position across view modes, so a card rendered a moment ago can be unmounted now. Run `eval --expr 'document.querySelector(".library-grid").scrollTop = 0'`, then `wait --selector '.library-card[data-library-item-id="<id>"]'`.
- Assert bodies through `textContent`, not `innerText`, for anything that may be offscreen.
- Every mutation in the preview is in-memory. Restore the baseline by navigating (`navigate --url <run url>`) rather than expecting a discard button.

## Proof and skip reporting

- Capture the user action and the resulting state: the before count, the filled form, the after count, and the changed view.
- A UI proof is a screenshot plus the asserted value, not either alone.
- Mutation proof pairs the visible change with a second read of the same fact (`.result-count` after opening the archive, the card in the grid after a capture).
- Record which entry point you exercised. "Capture works" is not proven by the Add button alone when the map lists paste, drag and drop, clipboard, screenshot, and the deep link.
- Report an entry point this harness cannot drive, with the reason, instead of substituting a different one and calling the feature verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with harness.mjs`, `Gotchas`. `Driving it with harness.mjs` starts with `Preconditions:` and pairs each user action with the exact command and the observable result.

## Features

- [Capture an item](./capture.md) — Add menu, note/quote/link/file/screenshot entry points, the immediate card, and the failed-save state.
- [Search the library](./search.md) — the search box, matching, the empty state, and clearing a query.
- [Browse and open items](./library-browse.md) — grid and list views, card types, the detail overlay, and the reader and PDF viewer boundaries.
- [Spaces](./spaces.md) — creating a Smart Space from a search, selecting it, renaming, reordering, and deleting.
- [Archive and recover](./archive-restore.md) — the Settings archive, selection mode, recover, and permanent delete.
- [Export the library](./export.md) — the Settings Data panel, the native picker boundary, and the exported folder's shape.
