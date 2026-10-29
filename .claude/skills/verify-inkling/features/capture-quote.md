# Capture a quote from the Add menu

## Sub-features

- Quote tile in the Add menu, with optional attribution and source URL.

## How to get to it (user POV)

Click Add at the foot of the sidebar and choose Quote. Type the quote, optionally add who said it and a source link, and press Save to library. The new card lands at the top of Everything.

## Driving it with `scripts/drive.mjs`

```json
[
  {"label": "open Add", "click": "button.add-button"},
  {"label": "choose Quote", "clickText": {"selector": ".add-menu-tile", "text": "Quote"}},
  {"label": "quote field", "wait": "textarea[aria-label='Quote text']"},
  {"label": "type quote", "fill": "textarea[aria-label='Quote text']", "text": "verify quote text"},
  {"label": "attribution", "fill": "input[aria-label='Quote attribution']", "text": "Ada Probe, Notes"},
  {"label": "save", "click": "button.add-menu-save"},
  {"label": "card shows", "expect": "[...document.querySelectorAll('article')].some(a => a.textContent.includes('verify quote text'))", "timeoutMs": 10000},
  {"label": "dialog closed", "expect": "!document.querySelector('.add-menu-panel')"},
  {"label": "shot", "shot": "quote-saved.png"}
]
```

End state: the card is in the grid, and `items` has one row with `kind = 'quote'`, `title = 'verify quote text'`, `description = 'Ada Probe, Notes'`, `body = ''`, `source_label = 'Ada Probe'`, `archived = 0`, and `metadata.quoteText` equal to the quote.

## Gotchas

- The quote text is stored in `title` and the attribution in `description`, the reverse of a note, which keeps its text in `body`.
- Leave the source URL empty. A URL is normalised and becomes the `source_label` host, and the quote can then depend on external state.
- Same Add-menu rules as `capture-note.md`: the sidebar must be open.
