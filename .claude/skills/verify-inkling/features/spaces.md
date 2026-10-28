# Spaces

## Sub-features

- Add a Space (Smart or Regular), rename it, delete it. Items are kept when a Space is deleted.
- File an item into a Regular Space from the item overlay.

## How to get to it (user POV)

Click the plus beside Spaces in the sidebar. Name it, choose Smart (the default, stores the current search as its query) or Regular (holds items you file by hand), and press Create Space. The new Space opens at once and a Regular one is empty. To file an item, open it and use Move to Space in the footer; that menu appears only when a Regular Space exists. Rename (pencil) and delete (X) sit on the Space row.

## Driving it with `scripts/drive.mjs`

Needs two notes (see `capture-note.md`). Driven in three runs; the Space name field alone does nothing until Create Space is clicked.

```json
[
  {"label": "add Space", "click": "button[aria-label='Add a Space']"},
  {"label": "name field", "wait": "input[aria-label='Space name']"},
  {"label": "name", "fill": "input[aria-label='Space name']", "text": "Verify A"},
  {"label": "Regular", "clickText": {"selector": "label", "text": "Regular"}},
  {"label": "create", "clickText": {"selector": "button[type=submit]", "text": "Create Space"}},
  {"label": "row exists", "wait": "button[aria-label='Rename Verify A']"},
  {"label": "back to Everything", "clickText": {"selector": "button", "text": "Everything"}},
  {"label": "open a card", "expect": "(() => { const a = [...document.querySelectorAll('article.library-card')].find(a => a.textContent.includes('bravo probe')); if (!a) return false; a.click(); return true; })()"},
  {"label": "overlay", "wait": "section[role='dialog'] button[aria-label='Close details']"},
  {"label": "Move to Space", "click": "button[aria-label='Move to Space']"},
  {"label": "file it", "clickText": {"selector": "[role='menuitemcheckbox']", "text": "Verify A"}},
  {"label": "close menu", "key": "Escape"},
  {"label": "close overlay", "click": "button[aria-label='Close details']"},
  {"label": "rename", "click": "button[aria-label='Rename Verify A']"},
  {"label": "rename input", "wait": "input[aria-label='Rename Verify A']"},
  {"label": "new name", "fill": "input[aria-label='Rename Verify A']", "text": "Verify B"},
  {"label": "commit", "key": "Enter"},
  {"label": "renamed", "expect": "[...document.querySelectorAll('button[aria-pressed]')].some(b => b.textContent.includes('Verify B'))"},
  {"label": "delete", "click": "button[aria-label='Delete Verify B']"},
  {"label": "gone", "expect": "![...document.querySelectorAll('button[aria-pressed]')].some(b => b.textContent.includes('Verify'))"},
  {"label": "items kept", "expect": "document.querySelectorAll('article').length === 2", "timeoutMs": 5000}
]
```

Split the file after "create" and after "close overlay" to read the database between runs. End state, read from `library.sqlite3` readonly: after create, `spaces` has one row with `kind = 'regular'` and `query = '{}'`; after filing, `space_items` has one row linking the Space `id` to the item id; after delete, `spaces` and `space_items` are empty and both `items` rows still have `archived = 0`.

## Gotchas

- Everything and Space rows are different: a Space row is `button[aria-pressed]`, the Everything row has no `aria-pressed`, so select it with `clickText` on `button`.
- Rename and delete are hover-revealed but `click` works on them without hovering. There is no delete confirmation. Delete is `button[aria-label='Delete <name>']`; `data-tooltip='Delete Space'` matches the first row only.
- `Rename <name>` is both the pencil button's and the input's `aria-label`; prefix the selector with `button` or `input`.
- A Smart Space cannot hold hand-filed items, so Move to Space lists Regular Spaces only. A Smart Space made while the search box has text takes that text as its query.
