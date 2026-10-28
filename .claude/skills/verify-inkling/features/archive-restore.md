# Archive and restore

## Sub-features

- Archive an item from the overlay; restore it from the archive panel, one tile or a selected batch.

## How to get to it (user POV)

Open an item and press Archive in the footer (right-clicking a card also offers Archive). The card leaves Everything and a "Forgotten from your library" toast offers Undo. Archived items appear in Settings, under the Archive tab. Restore on a tile returns one item; Select, picking tiles, then Restore returns a batch.

## Driving it with `scripts/drive.mjs`

Needs a note whose text is `bravo probe` (see `capture-note.md`). Driven as one run; for the batch path, replace the "restore tile" and "tile gone" steps with the batch steps below.

```json
[
  {"label": "open card", "expect": "(() => { const a = [...document.querySelectorAll('article.library-card')].find(a => a.textContent.includes('bravo probe')); if (!a) return false; a.click(); return true; })()"},
  {"label": "footer Archive", "wait": "section[role='dialog'] footer button[aria-label='Archive']"},
  {"label": "archive", "click": "button[aria-label='Archive']"},
  {"label": "card leaves", "expect": "![...document.querySelectorAll('article')].some(a => a.textContent.includes('bravo probe'))", "timeoutMs": 10000},
  {"label": "toast", "expect": "document.body.textContent.includes('Forgotten from your library')", "timeoutMs": 5000},
  {"label": "open Settings", "click": "button[aria-label='Settings']"},
  {"label": "settings modal", "wait": "#settings-modal"},
  {"label": "Archive tab", "clickText": {"selector": "[role='tab']", "text": "Archive"}},
  {"label": "tile present", "wait": "#settings-modal article[data-library-item-id]"},
  {"label": "restore tile", "click": "#settings-modal article[data-library-item-id] button[data-tooltip='Restore to library']"},
  {"label": "tile gone", "expect": "!document.querySelector('#settings-modal article[data-library-item-id]')", "timeoutMs": 8000},
  {"label": "empty state", "expect": "document.querySelector('#settings-modal').textContent.includes('Your archive is empty')"},
  {"label": "close settings", "key": "Escape"},
  {"label": "card returns", "expect": "[...document.querySelectorAll('article')].some(a => a.textContent.includes('bravo probe'))", "timeoutMs": 8000}
]
```

Batch path, in place of "restore tile" and "tile gone":

```json
[
  {"label": "Select mode", "click": "button[aria-label='Select archived items']"},
  {"label": "select tile", "click": "#settings-modal article[data-library-item-id]"},
  {"label": "1 selected", "expect": "document.querySelector('#settings-modal').textContent.includes('1 selected')"},
  {"label": "batch Restore", "clickText": {"selector": "fieldset button", "text": "Restore"}},
  {"label": "tile gone", "expect": "!document.querySelector('#settings-modal article[data-library-item-id]')", "timeoutMs": 8000}
]
```

End state: after archive, the `items` row has `archived = 1` and `updated_at` moved; after restore it is `archived = 0` and the card is back in Everything.

## Gotchas

- Archive is a soft flag in `items.archived` (no `archived_at`), and there is no Trash. Delete forever is separate: it works only on archived items, after a 10 second Undo window, and also removes `assets/items/<id>/`. Not driven here.
- The tile Restore button has no `aria-label` and is invisible until hover, but `click` works on it. In selection mode the tile buttons disappear and only the header Restore remains, disabled until a tile is selected.
- The Archive tab label carries a count, so match it with `clickText`, not equality.
- Archiving animates the overlay away, so it needs a visible window (see the occlusion note in `SKILL.md`).
