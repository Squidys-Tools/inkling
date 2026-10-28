# Edit a note

## Sub-features

- Open a note in the item overlay, choose Edit note, save, close.

## How to get to it (user POV)

Click a note card to open it in the overlay. On the Info tab, choose Edit note, change the text in the editor, and press Save note. Saving returns to the Info tab with the overlay still open. Cancel, Close, and Escape discard the edit and only leave the editor; close the overlay afterwards with Close or Escape.

## Driving it with `scripts/drive.mjs`

Needs a note whose text is `alpha probe` (see `capture-note.md`). Record its `updated_at` first.

```json
[
  {"label": "open card", "expect": "(() => { const a = [...document.querySelectorAll('article.library-card')].find(a => a.textContent.includes('alpha probe')); if (!a) return false; a.click(); return true; })()", "timeoutMs": 10000},
  {"label": "overlay open", "wait": "section[role='dialog'] button[aria-label='Close details']"},
  {"label": "Edit note", "clickText": {"selector": "button", "text": "Edit note"}},
  {"label": "editor shown", "wait": "div[aria-label='Note content']"},
  {"label": "body loaded", "expect": "document.querySelector(\"div[aria-label='Note content']\").textContent.includes('alpha probe')", "timeoutMs": 10000},
  {"label": "select all", "expect": "(() => { const e = document.querySelector(\"div[aria-label='Note content']\"); e.focus(); document.getSelection().selectAllChildren(e); return true; })()"},
  {"label": "replace text", "fill": "div[aria-label='Note content']", "text": "alpha edited"},
  {"label": "typed", "expect": "document.querySelector(\"div[aria-label='Note content']\").textContent.trim() === 'alpha edited'"},
  {"label": "Save", "click": "button[aria-label='Save note']"},
  {"label": "editor gone", "expect": "!document.querySelector(\"div[aria-label='Note content']\")", "timeoutMs": 10000},
  {"label": "close overlay", "click": "button[aria-label='Close details']"},
  {"label": "overlay closed", "expect": "!document.querySelector(\"button[aria-label='Close details']\")", "timeoutMs": 10000},
  {"label": "card shows new text", "expect": "[...document.querySelectorAll('article.library-card')].some(a => a.textContent.includes('alpha edited'))", "timeoutMs": 10000}
]
```

End state: the `items` row has `body = 'alpha edited'`, `description` the same, `body_format = 'md'`, `title` still null, `created_at` unchanged and `updated_at` moved forward.

## Gotchas

- The editor is a rich-text contenteditable (`div[aria-label='Note content']`), not a textarea, so `fill` needs the select-all step first or it inserts at the caret.
- Edit note is a plain button with no `aria-label`; find it with `clickText`. It lives in the Info tab, not a toolbar.
- The Close button reads "Close details", or "Close editor" while editing. There is no autosave and an empty note is refused.
- Closing animates, so it needs a visible window (see the occlusion note in `SKILL.md`).
