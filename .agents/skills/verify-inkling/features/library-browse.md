# Browse and open items

The library is a virtualized card grid with kind-aware artwork and a single-column list view. Opening a card shows a modeless detail overlay. The overlay can start a reader, PDF viewer, or video playback when the item has the needed data.

## Sub-features

- `browse-grid` shows the masonry grid and its card art.
- `browse-list` switches to the list and back.
- `browse-open` opens the detail overlay for a mounted card.
- `browse-overlay-actions` shows available actions, including a disabled `Read` action for an Article without saved text.
- `browse-switch` retargets a settled overlay to another mounted card.
- `browse-top-of-mind` filters to favorite items.
- `browse-serendipity` shows the first 12 non-archived items in discovery order.
- `browse-reader` opens an Article with `articleHtml`.
- `browse-pdf` opens a PDF with a local `fileUrl`.
- `browse-similar` is a desktop action that replaces the library with semantic results.

## How to get to it (user POV)

- Scroll the home library grid.
- Choose `Grid view` or `List view`.
- Click a card, or focus it and press Enter.
- Choose `Top of mind` or `Serendipity` in the main navigation.
- Choose `Read` for an Article with saved text, or `Open PDF` for a PDF with a local file.
- In the desktop app, choose `Find similar` on an eligible item.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- The masonry is virtualized. Assert `.result-count` for totals, never `.library-card` count. The real scroll element is `.library-grid[data-testid="virtuoso-scroller"]`.
- The seed has no Article with `articleHtml`, and its PDF has no `fileUrl`.

- **Switch views.** Click `[aria-label="List view"]` and wait for `.library-grid.list-mode`. Return to `[aria-label="Grid view"]` and wait until that class is absent. Save the list view.
- **Inspect card art.** Evaluate `[...document.querySelectorAll(".library-card")].map(c => c.querySelector(".card-kicker span")?.textContent.trim())`. The initial window can include Image, Note, PDF, and Video art. Search `The first post on Twitter`, wait for `.result-count` to equal `1`, and read mounted card `data-library-item-id="5"` for the Post. Clear search. Read the kind from the childless `.card-kicker span`; the parent also contains the date.
- **Open and close an overlay.** Reset the scroller, click `.library-card[data-library-item-id="12"]`, and wait for `.expanded-overlay:not(.is-flying)`. Read the title, tags, and button text. Press `Escape` and wait for the overlay to disappear.
- **Check the PDF boundary.** Reset the scroller, open `[data-library-item-id="10"]`, read its overlay actions, and assert `Open PDF` is absent. Close it with Escape.
- **Switch cards.** Open item `12`, choose another mounted and hit-testable card, and wait for the overlay title to change. Reset the scroller first if the second card is not mounted.
- **Open Top of mind.** Click it within `nav[aria-label="Main navigation"]` and wait for `.result-count` to equal `3`. Return to `Everything` and wait for `28`.
- **Open Serendipity.** Click it within the main navigation and wait for `.result-count` to equal `12`. Return to `Everything` and wait for `28`.
- **Native reader and PDF paths.** In an isolated desktop app, open an Article with saved text and choose `Read`, or a PDF with a local `fileUrl` and choose `Open PDF`. Wait for `[aria-label="Close reader (Escape)"]` or `[aria-label="Next page"]`.
- **Native similar path.** In the desktop app, choose `Find similar` on an eligible card. Assert the overlay closes and the library changes to semantic results.

## Gotchas

- There is no related-items section in the current overlay. Do not describe a hidden insertion point as user-facing.
- Clicking a second mounted card is supported. Virtualization can still make an unmounted card impossible to click.
- `Find similar` is native-only and replaces the library results.
- The reader and PDF viewer are React components, but native storage normally supplies their data. A seeded PDF without `fileUrl` cannot open the viewer.
- Closing a reader opened from an overlay returns to that overlay. A list-card Read action returns to the grid.
- Video cards are thumbnails in the grid. Playback controls appear in the overlay.
- `click` scrolls its target into view, but the Virtuoso scroller can unmount other cards. Reset `.library-grid[data-testid="virtuoso-scroller"]`, not the outer `.library-scroll`, before addressing a card by id.
