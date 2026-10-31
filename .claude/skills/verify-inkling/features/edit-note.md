# Edit a note

## User flow

Open a note card and choose **Edit note** on its Info panel. The full-page Focus Mode editor loads the existing body. Change the text and choose **Save note** to return to the item view. Cancel, Close, or Escape with unsaved changes asks whether to discard them; empty note content cannot be saved.

## Driving it with `scripts/drive.mjs`

Needs an active note whose body contains `alpha probe`. Search for it first so the same accessible card name works in grid and List view.

```json
[
  {"label":"focus search","key":"/"},
  {"label":"search target note","fill":"input[aria-label='Search your mind']","text":"alpha"},
  {"label":"one note result","expect":"document.querySelectorAll(\"article[aria-label='Note: Untitled note']\").length === 1","timeoutMs":5000},
  {"label":"open note","click":"article[aria-label='Note: Untitled note']"},
  {"label":"item view","wait":"button[aria-label='Close']"},
  {"label":"Edit note","clickText":{"selector":"button","text":"Edit note"}},
  {"label":"Focus Mode editor","wait":"[role=textbox][aria-label='Note']"},
  {"label":"select existing body","expect":"(() => { const e = document.querySelector(\"[role=textbox][aria-label='Note']\"); if (!e) return false; e.focus(); document.getSelection().selectAllChildren(e); return true; })()"},
  {"label":"replace body","fill":"[role=textbox][aria-label='Note']","text":"alpha edited"},
  {"label":"new body visible","expect":"document.querySelector(\"[role=textbox][aria-label='Note']\").textContent.trim() === 'alpha edited'"},
  {"label":"save","clickText":{"selector":"button","text":"Save note"}},
  {"label":"item view returns","wait":"button[aria-label='Close']"}
]
```

Read the scratch `items` row to prove `body = 'alpha edited'`, `description` equals it, `body_format = 'md'`, `title` and `created_at` are unchanged, and `updated_at` is at least its prior value. A same-millisecond save can keep the timestamp equal.

## Gotchas

- The editor is a full-page Focus Mode route, not an editor inside a dialog.
- The editable control is a multiline textbox named **Note**. The Save button has visible text **Save note**, not an aria-label.
- The item view close control is labeled **Close**. Dirty Close, Cancel, and Escape use a discard confirmation.
