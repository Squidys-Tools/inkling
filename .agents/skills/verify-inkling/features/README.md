# inkling verification map

This directory is the maintained source for verifying inkling's user-facing behavior. Read this index before driving the app, then open the matching feature file.

## Baseline preconditions

- Launch per [SKILL.md](../SKILL.md): run `serve`, then `start`, into a fresh `--run-dir`, then run `doctor`.
- The web preview shows the committed demo library: 28 items, fixed shuffle, and `[data-testid="web-preview-badge"]`. Mutations stay in browser memory and disappear when the run ends.
- Use `serve --mode dev`. A dev build includes three archived items. A production build starts with an empty archive.
- Settings has Archive, Data, and Extension tabs. Data contains the export boundary, and Extension contains the browser pairing boundary.
- The seed has no Article and no PDF with a local file. The reader, PDF viewer, and successful URL capture are not reachable from it. See [library-browse.md](./library-browse.md) and [capture.md](./capture.md).
- OCR, thumbnails, embeddings, file access, SQLite, export, the deep link, and the extension receiver exist only in the desktop app. A preview proves only the panel boundary. See [export.md](./export.md) and [extension.md](./extension.md).
- Never drive an instance this run did not start. Other run dirs and the developer's dev server may be live.

## Driving conventions

- Start each recipe from the baseline unless its preconditions say otherwise.
- Prefer ARIA labels, `data-library-item-id`, and stable class names over position. Read the handle table in [SKILL.md](../SKILL.md).
- Scope text clicks with `--within` when a label can appear in more than one surface.
- Wait with `wait --selector` or `wait --expr`. The native request waits 200 ms, while the preview filter updates immediately.
- Assert totals through `.result-count` and `.nav-count`, never a `.library-card` count. The virtualized grid only mounts its current window.
- Reset `.library-grid[data-testid="virtuoso-scroller"]` before addressing a card by id. Setting `.library-grid.scrollTop` does nothing.
- Use `textContent` for content that may be offscreen.
- Restore a mutated preview with `navigate --url <run url>`.

## Proof and skip reporting

- Capture the user action and resulting state: before count, filled form, after count, and changed view.
- Pair each screenshot with an asserted value.
- Pair a mutation with a second read, such as `.result-count` after recovery or the card and search result after capture.
- Record the entry point used. Add-menu capture does not prove paste, drag and drop, clipboard, screenshot, the deep link, or the extension.
- Report a route the harness cannot drive, including its prerequisite and attempted path. Do not substitute another route and call the feature verified.

## Feature entry contract

Each feature file starts with an H1 and one paragraph describing visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with harness.mjs`, and `Gotchas`. The driving section starts with `Preconditions:` and pairs each user action with an exact command and observable result.

## Features

- [Capture an item](./capture.md): Add menu, note, quote, link, file, screenshot, and ambient capture boundaries.
- [Search the library](./search.md): focus, matching, empty state, clearing, and saved-search entry points.
- [Browse and open items](./library-browse.md): grid, list, navigation views, card types, overlays, and reader or PDF boundaries.
- [Spaces](./spaces.md): creating, selecting, coloring, renaming, reordering, and deleting Spaces.
- [Archive and recover](./archive-restore.md): forgetting, Undo, archive selection, recovery, and permanent deletion.
- [Export the library](./export.md): Settings Data, the native picker boundary, and the exported folder.
- [Pair the browser extension](./extension.md): Settings Extension and the extension's preview and native boundaries.
- [Roaming mascot](./mascot.md): spontaneous walks, expressions, safe lanes, yielding, and return home.
