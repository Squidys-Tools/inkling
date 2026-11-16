# Rename an item's title

The item view's title is a `button "<title>"`; choosing it opens an inline `textfield "Title"` focused on the current value, and Enter writes `items.title` (`item/TitleField.tsx`). Status: **driven** on 2026-11-16 (field opens, Enter commits, row and card update). Not driven: Escape cancel, clearing to empty, the character limit and paste flattening.

## Sub-features

- `title-edit` the title button opens the inline field with the value focused.
- `title-save` Enter commits the edit to `items.title` and the card retitles.

## How to get to it (user POV)

- Open an item card, choose the title, edit it, press Enter.

## Driving it with agent-desktop

Preconditions: an item with a title (a note with no title shows `Untitled note`).

- **Open.** `$I ad click "$($I ref group 'Article: <title>')"` then `$I ad click "$($I ref button '<title>')"` → `textfield "Title"` focused with `value="<title>"`.
- **Save.** `$I ad set-value <field> "<new title>"` then `$I ad press enter`. `$I db "SELECT title FROM items WHERE id='<id>'"` → the new title; closing the item shows `article "<Kind>: <new title>"` in the grid.
- **Proof.** The row's `title` plus the retitled card; `$I shot`.

## Gotchas

- The title button's accessible name IS the title, so after a rename the next `ref` must use the new name.
- `TitleField` is single-line: pasted text flattens newlines and a character cap trims the field — `set-value` over the cap is clipped, so assert on `db`, not on the value you sent.
- A user's title is theirs: AI enrichment never rewrites a non-empty `title` (product rule), so a manual rename survives later enrichment jobs.
