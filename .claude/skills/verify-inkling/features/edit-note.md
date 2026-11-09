# Edit a note

Edit note reopens a saved note's body in the full-page editor and saves the change in place. Status: **driven** (run `mw8z6zu6-9df7`, after capture-note).

## Sub-features

- `edit-open` opens the editor with the existing body.
- `edit-save` replaces the body and returns to the item view.
- `edit-store` updates `body` and `description`, keeps `title` and `created_at`.

## How to get to it (user POV)

- Open a note card, choose **Edit note** in the Info panel.
- Leaving with unsaved edits (Cancel, Close, Escape, Back) asks "Discard your changes to this note?" through the shared confirm (not driven).

## Driving it with agent-desktop

Preconditions: a note with body `verify probe alpha` exists (run capture-note first), Everything is shown.

- **Open the note.** `$I ad click "$($I ref group 'Note: Untitled note')"`. Tabs `Info`/`Similar` and buttons `Close`, `Edit note`, `Keep in a Space`, `Archive` appear (plus the title button, `Add tag`, and `Saved`/`From` options); `$I shot 04-open`.
- **Open the editor.** `$I ad click "$($I ref button 'Edit note')"`. The route is `#/item/<id>/write`; textfield `Note` has value `verify probe alpha`; buttons `Cancel`, `Save note`, `Close focus mode`.
- **Replace the body.** `$I ad set-value "$($I ref textfield Note)" 'verify probe edited'`; `$I shot 05-typed`.
- **Save.** `$I ad click "$($I ref button 'Save note')"`. The item view returns (`Edit note` button visible again).
- **Proof.** `$I shot 06-saved`; `$I db "SELECT title,body,description,created_at,updated_at FROM items WHERE body LIKE 'verify probe%'"` returns body and description `verify probe edited`, title `null`, `created_at` unchanged, `updated_at` later.

## Gotchas

- After a click that opens a view, the first snapshot may fail with `atomic replace failed … retry: safe`; take a fresh one (`ref` and `tree` retry for you or can be re-run). Do not repeat the click.
- The editor is a full-page route, not a dialog; the Save button's name is `Save note`, not `Save to library`.
- The editable field is a contenteditable body: `set-value` replaces it whole.
