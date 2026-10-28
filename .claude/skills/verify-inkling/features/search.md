# Search your library

## Sub-features

- Text search across notes and titles; "/" focuses the field, Escape clears it.

## How to get to it (user POV)

Press `/` (or Ctrl+K) outside any text field and type in the Search your mind field. The grid updates a moment after typing stops. Escape clears the search and restores the grid.

## Driving it with `scripts/drive.mjs`

Needs two notes, `alpha probe` and `bravo probe` (see `capture-note.md`). Driven in this order:

```json
[
  {"label": "two cards", "expect": "[...document.querySelectorAll('article')].filter(a => /alpha probe|bravo probe/.test(a.textContent)).length === 2"},
  {"label": "slash", "key": "/"},
  {"label": "focused", "expect": "document.activeElement?.getAttribute('aria-label') === 'Search your mind'"},
  {"label": "type", "fill": "input[aria-label='Search your mind']", "text": "alpha"},
  {"label": "only alpha", "expect": "(() => { const t = [...document.querySelectorAll('article')].map(a => a.textContent); return t.some(x => x.includes('alpha probe')) && !t.some(x => x.includes('bravo probe')); })()", "timeoutMs": 5000},
  {"label": "escape clears", "key": "Escape"},
  {"label": "both back", "expect": "document.querySelectorAll('article').length === 2", "timeoutMs": 5000},
  {"label": "slash", "key": "/"},
  {"label": "no match", "fill": "input[aria-label='Search your mind']", "text": "zzzzqqqq"},
  {"label": "empty state", "expect": "document.body.textContent.includes('Nothing surfaced yet.') && document.querySelectorAll('article').length === 0", "timeoutMs": 5000},
  {"label": "clear", "clickText": {"selector": "button", "text": "Clear search"}},
  {"label": "restored", "expect": "document.querySelectorAll('article').length === 2", "timeoutMs": 5000}
]
```

End state: nothing is stored by a search, so the proof is the visible card set at each step; read `items` once to show both notes were present and `archived = 0`.

## Gotchas

- Matching is whole-token full-text search over title, description, body, OCR text and metadata. `alp` does not match `alpha`; use full words. It works in a scratch library with no embedding model, where it is lexical only.
- Results update about 200 ms after typing stops, so give `expect` a timeout of a few seconds.
- The field is hidden at rest and expands on focus. `/` is ignored while an input has focus; press Escape first.
- The expanded field's hint reads `esc to close`. The result count and the "Save as Space" pill only show while the field is unfocused with a query set; not driven here.
