# Item reader

A `Read` control opens a clean reading view of a url item's extracted article at `/item/<id>/read` (`pages/ReaderPage.tsx`, `reader/`). The view shows the title, `Saved <date>`, the article body and a `Open the page in your browser` link, and a quiet top bar with `Back (Esc)`, `Details`, text-size buttons and a `Typeface` picker over the article text. Status: **driven** on 2026-11-17 (item-view `Read`, document view, typeface switch, Escape exit). Not driven: scroll position memory, the `Open the page …` external navigation, text-size buttons, and media embeds inside the article (a `Play "<title>" from YouTube` button renders for embedded videos; playing needs the network).

## Sub-features

- `reader-open` `Read` on a card or in the item view opens the reading view.
- `reader-typeface` the `Typeface` combobox retypesets the article.
- `reader-exit` Escape or `Back (Esc)` returns to the page under it.

## How to get to it (user POV)

- Hover or focus a link/article card and choose **Read**, or open the item and choose **Read** in its toolbar. Escape leaves.

## Driving it with agent-desktop

Preconditions: an item with readable content — the card's `Read` is `states=disabled` when there is nothing to read (seen on an unextracted seed article). A freshly captured link works once `enrich_url` has run.

- **Open.** `$I ad click "$($I ref button Read)"` on the card or in the item view. The view is `document "<title>"` with `heading "<title>"`, `Saved <date>` and body paragraphs.
- **Typeface.** `$I ad expand "$($I ref combobox Typeface)"` (the accessible name is `Typeface`, not `TYPEFACE`), then pick an `option "<name>"`. Options below the fold are `states=offscreen` and refuse a semantic click — the open list takes arrow keys: `ad press down …` then `ad press return --window-id '{window}'`. The picked `option` gains `selected`; `Quiet Classic` is the default. The full list: Quiet Classic, Bookplate, Print Shop, Bold Editorial, Statement, Web Standard, Casual Web.
- **Exit.** `$I ad press escape --window-id '{window}'` returns to the page under it; the `Back (Esc)` button does the same.
- **Proof.** The title/date/body nodes plus `link "Open the page in your browser"` exist under `document`; the combobox `get`/`tree` value changes after a pick; `$I shot`. The typeface choice is not stored in `app_settings`.

## Gotchas

- The `Typeface` combobox opens on `click` (DoDefaultAction) or `expand` — `expand` on an open popup reports `AlreadyInState`/`not_delivered` with `retry:safe`, so re-snapshot rather than retry blindly.
- `Read` is disabled on items with no extracted text, so `ref button Read` resolving does not mean it opens — check `states` for `disabled` first.
- The reader is a full route (`/item/<id>/read`), so `Alt+Left` inside it goes back to the item view, not straight to the grid — `Escape`/`Back (Esc)` is the direct exit.
- `Details` in the top bar goes to the item view too, but through navigation rather than close.
