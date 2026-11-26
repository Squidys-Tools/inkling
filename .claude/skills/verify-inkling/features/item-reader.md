# Item reader

A `Read` control opens a clean reading view of a url item's extracted article at `/item/<id>/read` (`pages/ReaderPage.tsx`, `reader/`). The view shows the title, a `site · author · N min read` byline whose site name is a link to the original, the article body, a closing `Saved from <site>` line with an `Open original` link, a `Back (Esc)` button top-left, and a floating controls pill over the article's lower edge carrying the `Typeface` picker and the `Text size` buttons (`reader/ReaderControls.tsx`; the pill steps out while scrolling down and returns on scroll-up, at the end, or on hover/focus-within over its spot). Status: **driven** on 2026-11-22 (item-view `Read`, document view, Typeface pick, `Larger (text size)` step to 110%, Escape exit; earlier: in-content and footer links). Not driven: the controls pill's fade on scroll-down, the external navigation of the site and `Open original` links, `Smaller (text size)`, and media embeds inside the article (a `Play “<title>” from YouTube` button — curly quotes — renders for embedded videos; playing needs the network). The reader does not remember scroll position; nothing to drive there.

## Sub-features

- `reader-open` `Read` on a card or in the item view opens the reading view.
- `reader-typeface` the `Typeface` combobox retypesets the article.
- `reader-exit` Escape or `Back (Esc)` returns to the page under it.

## How to get to it (user POV)

- Choose **Read** on an article card's footer (always rendered there — no hover needed), or open the item and choose **Read** in its Info actions. Escape leaves.

## Driving it with agent-desktop

Preconditions: an item with readable content — the card's `Read` is `states=disabled` when there is nothing to read (seen on an unextracted seed article). A freshly captured link works once `enrich_url` has run.

- **Open.** `$I ad click "$($I ref button Read)"` on the card or in the item view — on the grid several readable cards can expose `Read` at once, so open the item first or scope with `--in <card>` (the item view's `Read` is unique). The view is `document "<title>"` with `heading "<title>"`, a `site · author · N min read` byline and body paragraphs — there is no `Saved <date>` line (that lives on the item view's Details).
- **Typeface.** `$I ad expand "$($I ref combobox Typeface)"` (the accessible name is `Typeface`, not `TYPEFACE`), then pick an `option "<name>"`. Options below the fold are `states=offscreen` and refuse a semantic click — the open list takes arrow keys: `ad press down …` then `ad press return --window-id '{window}'`. The picked `option` gains `selected`; `Quiet Classic` is the default. On Linux the open list is a `menu` of `menuitem`s (the combobox `value` reads `￼`), so assert the `selected` state on the picked `menuitem`. The full list: Quiet Classic, Bookplate, Print Shop, Bold Editorial, Statement, Web Standard, Casual Web.
- **Exit.** `$I ad press escape --window-id '{window}'` returns to the page under it; the `Back (Esc)` button does the same.
- **Proof.** The title/byline/body nodes plus `link "<site>"` in the byline and `link "Open original"` after the body exist under `document`; the combobox `get`/`tree` value changes after a pick; `$I shot`. The choice persists in renderer `localStorage` (`reader-font-set`, `reader-text-size`) — not `app_settings` — so it survives reopening within the run.

## Gotchas

- The `Typeface` combobox opens on `click` (DoDefaultAction) or `expand` — `expand` on an open popup reports `AlreadyInState`/`not_delivered` with `retry:safe`, so re-snapshot rather than retry blindly.
- Only `Article`-kind cards render `Read` at all; on one it is `states=disabled` when there is no extracted text. Other kinds show no `Read` anywhere — not on the card, not in its context menu, not in the item view — so `ref button Read` on an item view means it will open. The reader's byline `N min read` is recomputed from the sanitized text and need not equal the card's `N min` (`metadata.readingMinutes`).
- `Escape`/`Back (Esc)` is a single `history.back()` — the same step `Alt+Left` takes: opened from a card it lands on the grid, opened from the item view it lands on the item view. With no history to go back to (a fresh load straight onto the read route) it navigates to the item view instead.
- The byline's `·` separators render `"  ·  "` under `pre-wrap`, so the accessible text can carry doubled spaces around the `·` — don't exact-match `site · author · N min read`.
