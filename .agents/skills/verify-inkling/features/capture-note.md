# Capture a note

Capture a note saves typed text as a note card in Everything immediately, with a stored `note` row. Status: **driven** (run `mvz69480-dfac`).

## Sub-features

- `note-open` opens the note editor from the Add menu.
- `note-save` saves the text and returns to Everything with a new card.
- `note-store` persists the body in the library.

## How to get to it (user POV)

- Choose **Add** in the sidebar, then **Note**. Ctrl+Enter also saves.
- Paste, drag and drop, and the extension create other kinds; not this feature.

## Driving it with agent-desktop

Preconditions: seeded library, `doctor` all PASS, sidebar reads `Everything 32`.

- **Before.** `$I shot 01-before`; `$I tree | grep Everything` shows `Everything 32`.
- **Open Add.** `$I ad expand "$($I ref menubutton Add)"`. The result lists a `menu` surface "Add to your library". A semantic `click` on Add does nothing; use `expand`.
- **Choose Note.** `$I ad click "$($I ref menuitem Note)"`. The document value becomes `app://local/index.html#/add/note`; a textfield named `Note` exists with buttons `Cancel`, `Save to library`.
- **Enter text.** `$I ad set-value "$($I ref textfield Note)" 'verify probe alpha'` → `post_state.value` equals the text. `$I shot 02-typed`.
- **Save.** `$I ad click "$($I ref button 'Save to library')"`.
- **Proof.** `$I tree | grep -E 'Everything|Note:'` shows `Everything 33` and a group `Note: Untitled note`; `$I shot 03-saved`; `$I db "SELECT kind,title,body,body_format,archived,metadata FROM items ORDER BY created_at DESC LIMIT 1"` returns kind `note`, title `null`, body `verify probe alpha`, body_format `md`, archived `0`, metadata `{"captureSource":"quick note"}`.
- **Keyboard save.** Repeat open and enter text with body `shortcut note`, then `$I ad press ctrl+return --window-id '{window}'` instead of clicking Save: same row (`kind note`, body `shortcut note`), `Everything` +1.

## Gotchas

- Notes store a null title; the card is always `Note: Untitled note`. Don't search the grid for the body text.
- `set-value` reports `application_commit: not_verified` but the app did commit it (the saved row proves it). Always read the row.
- The `Everything` count includes only active items; the seed also has archived rows.
- Empty text is refused; text that is only a URL is saved as a link, not a note.
- `ref group 'Note: Untitled note'` reports multiple matches if you capture twice; the seed's other note is `Note: Books to reread this fall`.
