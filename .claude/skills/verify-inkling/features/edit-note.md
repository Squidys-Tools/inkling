# Edit a note

Edit note reopens a saved note's body in the full-page editor and saves the change in place. Status: **driven** on 2026-11-19 (note card opens the item view; `Edit note` reaches the write page; saving stays on the write page).

## Sub-features

- `edit-open` opens the editor with the existing body.
- `edit-save` replaces the body in place; `Back`/`Details` then returns to the item view.
- `edit-store` updates `body` and `description`, keeps `title` and `created_at`.

## How to get to it (user POV)

- Open a note card — it lands on the item view; choose **Edit note** there to reach the write page.
- Leaving with unsaved edits (`Back`, `Details`, Escape, other navigation) asks "Discard your changes to this note?" through the shared confirm (`Cancel`/`Discard`; not driven). Inside the editor, Escape on a dirty buffer asks to revert in place.

## Driving it with agent-desktop

Preconditions: a note with body `verify probe alpha` exists (run capture-note first), Everything is shown.

- **Open the note.** `$I ad click "$($I ref group 'Note: Untitled note')"` lands on the item view: `Info`, `Similar`, `Close`, `Edit note`, `Keep in a Space`, `Archive` (plus the title button, the `Add a tag` combobox, a `Remove tag <name>` button per tag, and `Saved`/`From` rows; `Keep in a Space` renders only while at least one Regular Space exists); `$I shot 04-open`.
- **Open the editor.** `$I ad click "$($I ref button 'Edit note')"` lands on `#/item/<id>/write`: textfield `Note` has value `verify probe alpha`; buttons `Back` and `Details` only — `Discard`/`Save` render only while dirty.
- **Replace the body.** `$I ad set-value "$($I ref textfield Note)" 'verify probe edited'`; `Discard`/`Save` appear with the `Edited` status. `$I shot 05-typed`.
- **Save.** `$I ad click "$($I ref button Save)"` — the button is named `Save`, not `Save note`. Saving does not navigate: the route stays `#/item/<id>/write` and `Discard`/`Save` disappear. `$I ad click "$($I ref button Back)"` (or `Details`) returns to the item view (`Edit note` visible again).
- **Proof.** `$I shot 06-saved`; `$I db "SELECT title,body,description,created_at,updated_at FROM items WHERE body LIKE 'verify probe%'"` returns body and description `verify probe edited`, title `null`, `created_at` unchanged, `updated_at` later.

## Gotchas

- After capture-note's keyboard step there are two `Note: Untitled note` cards and `ref group` refuses. A twin's ref read from `tree` cannot be clicked either — the click is refused `AMBIGUOUS_TARGET` because the ref was not captured unique. Search a unique body token (`alpha`) so only that card remains in the grid, then click it.
- After a click that opens a view, the first snapshot may fail with `atomic replace failed … retry: safe`; take a fresh one (`ref` and `tree` retry for you or can be re-run). Do not repeat the click.
- The editor is a full-page route, not a dialog; the Save button's name is `Save` — `Save to library` only exists on the new-note form.
- The editable field is a contenteditable body: `set-value` replaces it whole.
