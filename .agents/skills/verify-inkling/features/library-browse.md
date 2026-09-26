# Browse and open items

The library is a virtualized card grid with kind-aware artwork and a single-column list view. Opening a card shows a modeless detail overlay. The overlay can start a reader, PDF viewer, or video playback when the item has the needed data.

## Sub-features

- `browse-grid` shows the masonry grid and its card art.
- `browse-list` switches to the list and back.
- `browse-open` opens the detail overlay for a mounted card.
- `browse-overlay-actions` shows available actions. A disabled `Read` appears only for an Article that has saved text and a source URL; an Article with neither shows no `Read` action at all.
- `browse-switch` retargets a settled overlay to another mounted card.
- `browse-top-of-mind` filters to favorite items.
- `browse-serendipity` walks through one unseen older item at a time from a capped discovery batch, with Keep and Forget actions.
- `browse-serendipity-complete` explains when the walk has no unseen items left.
- `browse-reader` opens a reader for an Article with `articleHtml`.
- `browse-pdf` opens the PDF viewer for a PDF with a local `fileUrl`.
- `browse-similar` is a desktop-only action that replaces the library with semantic results.

## How to get to it (user POV)

- Scroll the home library grid.
- Choose `Grid view` or `List view`.
- Click a card, or focus it and press Enter.
- Choose `Top of mind` or `Serendipity` in the main navigation.
- In Serendipity, choose `Keep` to advance or `Forget` to archive the current item.
- Choose `Read` in the overlay for an Article with saved text, or `Open PDF` for a PDF with a local file.
- In the desktop app, choose `Find similar` on an eligible item.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- The masonry is virtualized. Assert `.result-count` for totals, never `.library-card` count. The real scroll element is `.library-grid[data-testid="virtuoso-scroller"]`.
- The seed has no Article with `articleHtml`, and its PDF has no `fileUrl`.

- **Switch views.** Click `[aria-label="List view"]` and wait for `.library-grid.list-mode`. Return to `[aria-label="Grid view"]` and wait until `.library-grid.list-mode` is absent. Save a screenshot of the list view.
- **Inspect card art.** Run `eval --expr '[...document.querySelectorAll(".library-card")].map(c => c.querySelector(".card-kicker span")?.textContent.trim())'`. The initial window can include Image, Note, PDF, and Video art. Quote and Post cards may require scrolling or a direct search. To inspect the seeded Post without guessing masonry positions, search `The first post on Twitter`, wait for `.result-count` to equal `1`, and read the mounted card with `data-library-item-id="5"`. Clear the search before continuing. Read the kind from the childless `.card-kicker span`; the parent also contains the date.
- **Open and close an overlay.** Reset the scroller with `eval --expr 'document.querySelector(".library-grid[data-testid=\"virtuoso-scroller\"]").scrollTop = 0'`, then click `.library-card[data-library-item-id="12"]` and wait for `.expanded-overlay:not(.is-flying)`. Read its title, tags, and button text, then press `Escape` and wait for the overlay to disappear.
- **Check a PDF boundary.** Open `[data-library-item-id="10"]` after resetting the scroller. Read the overlay actions and assert that `Open PDF` is absent. Close it with Escape.
- **Switch cards.** Open item `12`, choose another card that is mounted and hit-testable, and wait until the overlay title changes. If the second card is not mounted, reset the scroller first; a missing virtualized card is not a failed switch.
- **Open Top of mind.** Click `Top of mind` within `nav[aria-label="Main navigation"]` and wait for `.result-count` to equal `3`. Return to `Everything` and wait for `28`.
- **Open Serendipity.** Click `Serendipity` within the main navigation and wait for `.result-count` to equal `12`. Assert `[data-testid="serendipity-view"]` and `[data-testid="serendipity-item"]` are visible, then read the current title and Keep/Forget labels.
- **Keep one item.** Read the current item ID from `.serendipity-art .library-card`, click `[data-testid="serendipity-keep"]`, and wait for the title to change. The kept item should remain active in Everything.
- **Forget one item.** Read the next item ID, click `[data-testid="serendipity-forget"]`, and wait for the title to change plus the `Forgotten from your library` toast. Use its `Undo` action and confirm the item is active again. Return to `Everything` and wait for `28`.
- **Finish the walk.** When no unseen active items remain, assert `[data-testid="serendipity-complete"]` and use `Back to Everything`.
- **Native reader and PDF paths.** In an isolated desktop app, open an Article with saved text and choose `Read`, or a PDF with a local `fileUrl` and choose `Open PDF`. Wait for `[aria-label="Close reader (Escape)"]` or `[aria-label="Next page"]`. The preview cannot prove either path.
- **Native similar path.** In the desktop app, choose `Find similar` on an eligible card and verify that the overlay closes and the library changes to semantic results. The preview has no such button.

## Gotchas

- There is no related-items section in the current overlay. Do not describe a hidden insertion point as user-facing.
- Clicking a second mounted card is supported. Virtualization can still make an unmounted card impossible to click.
- `Find similar` is native-only and replaces the library results. The button is gated on `isTauriRuntime()`, while the handler also needs `canUseTauriBackend`, so a Tauri webview running with `?preview=1` can show the button and then error. The web preview shows no button.
- The reader and PDF viewer are React components, but native storage normally supplies their data. A seeded PDF without `fileUrl` cannot open the viewer.
- Serendipity does not render the Grid/List control, so a view-switch step there is a silent no-op. Leave Serendipity before asserting list mode.
- Closing a reader opened from an overlay returns to that overlay. A list-card Read action returns to the grid.
- Video cards are thumbnails in the grid. Playback controls appear in the overlay.
- `click` scrolls its target into view, but the Virtuoso scroller can unmount other cards. Reset `.library-grid[data-testid="virtuoso-scroller"]`, not the outer `.library-scroll`, before addressing a card by id.
