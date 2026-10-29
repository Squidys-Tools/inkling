# Search your library

## Sub-features

- Text search across notes and titles; "/" focuses the field, Escape clears it.
- Result count, and Save as Space, which turns the search into a Smart Space.

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

Save as Space, driven as a separate run (blurring keeps the query; Escape would clear it):

```json
[
  {"label": "slash", "key": "/"},
  {"label": "type", "fill": "input[aria-label='Search your mind']", "text": "alpha"},
  {"label": "only alpha", "expect": "document.querySelectorAll('article').length === 1 && document.querySelector('article').textContent.includes('alpha probe')", "timeoutMs": 5000},
  {"label": "blur", "expect": "(() => { document.activeElement.blur(); return true; })()"},
  {"label": "count", "expect": "document.querySelector('.capture-bar').textContent.includes('1 result')", "timeoutMs": 5000},
  {"label": "Save as Space", "clickText": {"selector": "button", "text": "Save as Space"}},
  {"label": "name prefilled", "expect": "document.querySelector(\"input[aria-label='Space name']\")?.value === 'alpha'", "timeoutMs": 5000},
  {"label": "create", "clickText": {"selector": "button[type=submit]", "text": "Create Space"}},
  {"label": "row exists", "wait": "button[aria-label='Rename alpha']"}
]
```

End state: `spaces` has one row with `kind = 'smart'` and `query = '{"text":"alpha"}'`. The new Space opens showing only the matching card.

## Gotchas

- Matching is whole-token full-text search over title, description, body, OCR text and metadata. `alp` does not match `alpha`; use full words. It works in a scratch library with no embedding model, where it is lexical only.
- Results update about 200 ms after typing stops, so give `expect` a timeout of a few seconds.
- The field is hidden at rest and expands on focus. `/` is ignored while an input has focus; press Escape first.
- The expanded field's hint reads `esc to close`. The filter row (query chip, result count, Save as Space) shows only while the field is unfocused with a query set.
- The count is an animated digit roll, so `.result-count` text reads like `01231`. Assert on the bar text (`1 result`) instead.
- Save as Space opens the sidebar Space form with the query as the name and Smart selected; nothing is saved until Create Space.
