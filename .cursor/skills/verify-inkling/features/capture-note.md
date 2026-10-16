# Capture a note from the Add menu

## Sub-features

- Note tile in the Add to your library dialog.
- Save to library button; the card appears before any processing finishes.

## How to get to it (user POV)

Click Add in the top bar. The dialog offers Note, Link, File, Quote, and Screenshot. Choose Note, type a line, and press Save to library. The new card lands at the top of Everything.

## Driving it with `scripts/drive.mjs`

Save as `steps.json`, then run with a fresh evidence dir:

```json
[
  {"label": "open Add", "click": "button[title='Add something to your library']"},
  {"label": "choose Note", "clickText": {"selector": "button", "text": "Write something to remember"}},
  {"label": "note field", "wait": "input[aria-label='New note']"},
  {"label": "type note", "fill": "input[aria-label='New note']", "text": "verify-inkling probe note"},
  {"label": "save", "click": "button.capture-save[type='submit']"},
  {"label": "card shows", "expect": "[...document.querySelectorAll('article')].some(a => a.textContent.includes('verify-inkling probe note'))", "timeoutMs": 10000},
  {"label": "shot", "shot": "note-saved.png"}
]
```

End state proof: the card with the text is in the grid, and `items` has one row with `kind = 'note'`, `body = 'verify-inkling probe note'`, `body_format = 'md'`, `archived = 0`. The title stays null for notes.

## Gotchas

- Note title is null; the text lives in `body`. Check `body`, not `title`.
- The dialog only appears on Add. The Add button has a title, not visible text.
- Link, File, Quote, and Screenshot are not driven by this map yet.
