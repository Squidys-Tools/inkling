# Capture a note from the Add menu

## Sub-features

- Note tile in the Add menu.
- Save to library button; the card appears before any processing finishes.

## How to get to it (user POV)

Click Add at the foot of the sidebar. It opens into a menu of Note, Link, Quote, File, and Screen (screenshot). Choose Note, type a line, and press Enter or Save to library. The new card lands at the top of Everything.

## Driving it with `scripts/drive.mjs`

Save as `steps.json`, then run with a fresh evidence dir:

```json
[
  {"label": "open Add", "click": "button.add-button"},
  {"label": "choose Note", "clickText": {"selector": ".add-menu-tile", "text": "Note"}},
  {"label": "note field", "wait": "textarea[aria-label='New note']"},
  {"label": "type note", "fill": "textarea[aria-label='New note']", "text": "verify-inkling probe note"},
  {"label": "save", "click": "button.add-menu-save"},
  {"label": "card shows", "expect": "[...document.querySelectorAll('article')].some(a => a.textContent.includes('verify-inkling probe note'))", "timeoutMs": 10000},
  {"label": "shot", "shot": "note-saved.png"}
]
```

End state proof: the card with the text is in the grid, and `items` has one row with `kind = 'note'`, `body = 'verify-inkling probe note'`, `body_format = 'md'`, `archived = 0`. The title stays null for notes.

## Gotchas

- Note title is null; the text lives in `body`. Check `body`, not `title`.
- The menu only appears on Add, which lives in the sidebar. Opening Add another way (the N shortcut) opens the sidebar too.
- Link, File, Quote, and Screenshot are not driven by this map yet.
