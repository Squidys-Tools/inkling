# Item reader

A `Read` control opens a clean reading view of a url item's extracted article at `/item/<id>/read` (`pages/ReaderPage.tsx`, `reader/`). The view shows the title, `Saved <date>`, the article body and a `Continue reading at <domain>` link, and carries a `TYPEFACE` picker over the article text. Status: **driven** on 2026-11-16 (card `Read`, document view, typeface switch, `ESC` exit). Not driven: scroll position memory, images and embeds inside the article, the `Continue reading` external navigation.

## Sub-features

- `reader-open` `Read` on a card or in the item view opens the reading view.
- `reader-typeface` the `TYPEFACE` combobox retypesets the article.
- `reader-exit` `ESC` (shown as a hint) returns to the page under it.

## How to get to it (user POV)

- Hover or focus a link/article card and choose **Read**, or open the item and choose **Read** in its toolbar. Escape leaves.

## Driving it with agent-desktop

Preconditions: an item with readable content — the card's `Read` is `states=disabled` when there is nothing to read (seen on an unextracted seed article). A freshly captured link works once `enrich_url` has run.

- **Open.** `$I ad click "$($I ref button Read)"` on the card or in the item view. The view is `document "<title>"` with `heading "<title>"`, `Saved <date>` and body paragraphs.
- **Typeface.** `$I ad click "$($I ref combobox TYPEFACE)"`, then `$I ad click "$($I ref menuitem 'Bold Editorial')"`. The picked `menuitem` gains `selected`; `Quiet Classic` is the default. The full list: Quiet Classic, Bookplate, Print Shop, Bold Editorial, Statement, Web Standard, Casual Web.
- **Exit.** `$I ad press escape` returns to the grid; an `ESC` statictext hints at it.
- **Proof.** The title/date/body nodes plus `link "Continue reading at <domain>"` exist under `document`; `$I shot`. The typeface choice is not stored in `app_settings`.

## Gotchas

- The `TYPEFACE` menu's unchosen `menuitem`s sit in a `states=hidden` `menu` — ref finds them whether or not the popup is open; click the combobox first so the choice is real.
- `Read` is disabled on items with no extracted text, so `ref button Read` resolving does not mean it opens — check `states` for `disabled` first.
- The reader is a full route (`/item/<id>/read`), so `Alt+Left` inside it goes back to the item view, not straight to the grid — `ESC` is the direct exit.
