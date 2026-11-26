# Rename an item's title

The item view's title is a `button "<title>"`; choosing it opens an inline `textfield "Title"` focused on the current value, and Enter writes `items.title` (`item/TitleField.tsx`). Status: **driven** on 2026-11-19 (field opens, Enter commits, row and card update). Not driven: Escape cancel, clearing to empty (a silent no-op revert), the 500-char limit and paste flattening.

## Sub-features

- `title-edit` the title button opens the inline field with the value focused.
- `title-save` Enter commits the edit to `items.title` and the card retitles.

## How to get to it (user POV)

- Open an item card, choose the title, edit it, press Enter.

## Driving it with agent-desktop

Preconditions: a non-Quote item with a title (a note with no title shows `Untitled note`; Quote items have no title control — their `title` is the quote text).

- **Open.** `$I ad click "$($I ref group 'Article: <title>')"` then `$I ad click "$($I ref button '<title>')"` → `textfield "Title"` focused with `value="<title>"` (a title ending in a file extension opens with only the stem selected).
- **Save.** `$I ad set-value <field> "<new title>"` then `$I ad press return --window-id '{window}'`. `$I db "SELECT title FROM items WHERE id='<id>'"` → the new title (poll it — the write lands after the field's short exit animation, so an instant read can still show the old title); closing the item shows `group "<Kind>: <new title>"` in the grid (`article` on Linux).
- **Proof.** The row's `title` plus the retitled card; `$I shot`.

## Gotchas

- The title button's accessible name IS the title, so after a rename the next `ref` must use the new name.
- Blur commits the edit (`onBlur` saves like Enter): take no focus-moving action between `set-value` and `return`, or the edit saves on the blur instead.
- `TitleField` is single-line: pasted text flattens newlines and clips to the room left under the 500-char cap, and `beforeinput` refuses inserts that would not fit — but a `set-value` write past the cap trips the `input` handler's snapshot restore, so it lands as *no change*, not a clipped title. Assert on `db`, not on the value you sent.
- A user's title is theirs: enrichment can still replace a non-empty title while it equals the placeholder the pending capture wrote (the auto-derived domain title), but it never rewrites a title the user renamed — a manual rename survives later enrichment jobs.
- Escape inside the field cancels the edit and stays — the key is stopped before the page sees it. A rename bumps `updated_at`, enqueues `generate_embedding` and reindexes FTS, so search reaches the new title. The shown card is retitled in place — `placeCards` keeps an already-loaded card in its slot and the `updated_at DESC` order only applies on a fresh scope load — so assert the row and the card name, not the grid position.
