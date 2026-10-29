# Capture a note from the Add menu

## Sub-features

- Note tile in the Add menu.
- Save to library button, or Enter; the card appears before any processing finishes.

## How to get to it (user POV)

Click Add at the foot of the sidebar. It opens into a menu of Note, Link, Quote, File, and Screen (screenshot). Choose Note, type a line, and press Enter or Save to library. Shift+Enter adds a line break. The new card lands at the top of Everything.

## Driving it with `scripts/drive.mjs`

Save as `steps.json`, then run with a fresh evidence dir. Swap the save step for `{"key": "Enter"}` to drive the Enter path; both were driven:

```json
[
  {"label": "open Add", "click": "button.add-button"},
  {"label": "choose Note", "clickText": {"selector": ".add-menu-tile", "text": "Note"}},
  {"label": "note field", "wait": "textarea[aria-label='New note']"},
  {"label": "type note", "fill": "textarea[aria-label='New note']", "text": "verify-inkling probe note"},
  {"label": "save", "click": "button.add-menu-save"},
  {"label": "card shows", "expect": "[...document.querySelectorAll('article')].some(a => a.textContent.includes('verify-inkling probe note'))", "timeoutMs": 10000},
  {"label": "dialog closed", "expect": "!document.querySelector('.add-menu-panel')"},
  {"label": "shot", "shot": "note-saved.png"}
]
```

End state proof: the card with the text is in the grid, and `items` has one row with `kind = 'note'`, `title` null, `body = 'verify-inkling probe note'`, `body_format = 'md'`, `description` equal to the body, `metadata = '{"captureSource":"quick note"}'`, `archived = 0`.

## Gotchas

- Note title is null; the text lives in `body`. Check `body`, not `title`. The card shows "Untitled note" with the text in the DOM.
- Add is only clickable while the sidebar is open (the default at 1280 wide). N, pressed outside a text field, opens the sidebar and goes straight to the Note form, skipping the tile menu.
- Text that is only a URL or a bare domain (`example.com`) is saved as a link item, not a note. Keep probe text to words with spaces.
- Quote has its own file, `capture-quote.md`. Link (`input[aria-label='URL to save']`) fetches the URL over the network, so it is not driven. File and Screen open native pickers that `drive.mjs` cannot reach, so they cannot be driven.
