# Browse and open items

The library is a visual grid of cards, one treatment per content type, with a list view for scanning. Opening a card shows the item's detail overlay, which is where the reader, the PDF viewer, and playback start.

## Sub-features

- `browse-grid` shows the masonry grid with per-kind card art.
- `browse-list` switches to the single-column list view and back.
- `browse-open` opens the detail overlay for a card.
- `browse-overlay-actions` shows only the actions the item can actually perform.
- `browse-related` offers related items inside the overlay.
- `browse-reader` opens the distraction-free reader for an Article with saved text.
- `browse-pdf` opens the PDF viewer for an item with a local file.

## How to get to it (user POV)

- Scroll the library grid on the home view.
- Choose `Grid view` or `List view` in the library toolbar.
- Click or press Enter on a card to open its detail overlay.
- Choose `Read` inside the overlay for an article, or `Open PDF` for a PDF.

## Driving it with harness.mjs

Preconditions:

- A healthy run per [SKILL.md](../SKILL.md), `doctor` passing.
- The seeded library: 28 items. The grid is virtualized, so card counts are rendered windows that move with the scroll: 15 cards in grid view at 1440×900, and 4 or 19 in list mode across runs. Never assert a card count; assert `.library-grid.list-mode` and `.result-count`.
- An Article with saved text is required for `browse-reader` and is not in the seed; see the gotcha below.

- **Switch views.** Run `click --selector '[aria-label="List view"]'`, `wait --selector ".library-grid.list-mode"`, and read the mode class back; `eval --expr 'document.querySelectorAll(".library-card").length'` answers a rendered window (4 and 19 both showed up across runs), never the item count. Run `click --selector '[aria-label="Grid view"]'` then `wait --expr '!document.querySelector(".library-grid.list-mode")'` to return; the grid reuses the scroll position, so reset it to `0` before addressing a card by id.
- **Read the card kinds.** Run `eval --expr '[...document.querySelectorAll(".library-card")].map(c => c.querySelector(".card-kicker span")?.textContent.trim())'`. `.card-kicker` holds the kind label and the relative date in two spans, so the kicker's own `textContent` reads `ImageYesterday`; the label alone is `Image`. The seeded visible set is `Image`, `Note`, `Video`, `Quote`, and `PDF` cards, each with its own art treatment.
- **Open an overlay.** Pick a card by its own id, for example `click --selector '.library-card[data-library-item-id="12"]'`, then `wait --selector ".expanded-overlay"`. Ids are the seed's own strings — numeric for the four keepers (`10` PDF, `12` note, `13` quote) and `me-*` for the personal imports — so read them from the rendered cards instead of assuming a range, and reset the grid scroll when a card is not rendered. The overlay carries the title, kind, saved date, tags, `.expanded-overlay-media`, and the actions the item supports.
- **Close it.** Run `key --key Escape` and `wait --expr '!document.querySelector(".expanded-overlay")'`. `[aria-label="Close details"]` does the same.
- **Check the action set.** Run `eval --expr '[...document.querySelectorAll(".expanded-overlay button")].map(b => b.innerText.trim()).filter(Boolean)'`. The note (`12`) answers `["Add"]`; the PDF (`10`) and the quote (`13`) add one more labelled with where the item came from (`["Add", "arxiv.org"]`, `["Add", "en.wikisource.org"]`), and the file-backed image and video answer `["Add", "Downloads"]`. That source button carries no `aria-label`: its visible text is the host or folder, and its tooltip is `title="Open <label>"`. The overlay's icon-only controls (`Close details`, `Copy link to original`, `Forget this item`) have no text, so they drop out of this list. An article with saved text would add `Read` and a PDF with a local file `Open PDF`; neither exists in the seed.
- **Reader path (desktop app).** With an Article that has saved text: open its card, run `click --within ".expanded-overlay" --text "Read"`, then `wait --selector '[aria-label="Close reader (Escape)"]'`. The reader replaces the overlay, and `[aria-label="Close reader (Escape)"]` or Escape returns to the library.
- **PDF path (desktop app).** With a PDF that has a local file: open its card, run `click --within ".expanded-overlay" --text "Open PDF"`, then `wait --selector '[aria-label="Next page"]'`. Page navigation, zoom, and `[aria-label="Page number"]` live in the viewer.
- **Proof.** Screenshot the list view, the opened overlay, and — in the desktop app — the reader and the PDF viewer.

## Gotchas

- The seeded library has no Article card and no PDF with a local file, so `Read` and `Open PDF` never appear in the web preview. URL capture in the preview is blocked by CORS for most sites, so you cannot conjure an article that way either. Verify the reader and the PDF viewer in the desktop app (or with a same-origin page that has real article text) and report them as unverified from the preview, not as failing.
- `.library-card` is virtualized: the DOM count is not the item count. Use `.result-count` for totals and `data-library-item-id` to address one card.
- Card text may not appear in `innerText` while offscreen. Assert with `textContent` or through the overlay after opening.
- Clicking a second card while an overlay is open is not a supported path: close it first.
- `click` calls `scrollIntoView({ block: "center" })` on its target, and the virtualized grid unmounts cards the scroll leaves behind. Fixing a card by id, clicking it, then clicking another card by id can therefore fail on the second one. Reset the scroll with `eval --expr 'document.querySelector(".library-grid").scrollTop = 0'` before addressing a card, and read `.result-count` if you need to know the grid is at its top (a full grid at the top renders 15 cards).
- The overlay's `Find similar` action exists only in the desktop app, and only for Image, Article, Note, and Quote items. In the preview the card shows no such button, which is correct.
- Video cards are thumbnail affordances in the grid by design; playback happens inside the overlay.
- Opening the overlay captures the card's box for the open animation, so the card must be rendered and in view. A card that was never scrolled into the rendered window cannot be addressed by id.
