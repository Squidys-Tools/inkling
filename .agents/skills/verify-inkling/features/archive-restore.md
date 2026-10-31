# Archive and restore

## User flow

Open an active item and choose **Archive** in the footer. The item view closes and the item leaves Everything. Choose **Archive** in the sidebar to see archived items. Focus or hover an archive tile to reveal **Restore**; choosing it returns the item to the active library. Permanent deletion is a separate action available only for archived items.

## Driving it with `scripts/drive.mjs`

Needs one active note. The archive tile's action is revealed when the button receives focus; the driver focuses visible controls before clicking.

```json
[
  {"label":"open note","click":"article[aria-label='Note: Untitled note']"},
  {"label":"item view","wait":"button[aria-label='Close']"},
  {"label":"Archive action","wait":"button[aria-label='Archive']"},
  {"label":"archive","click":"button[aria-label='Archive']"},
  {"label":"item view closes","expect":"!document.querySelector(\"button[aria-label='Close']\")","timeoutMs":10000},
  {"label":"open Archive","clickText":{"selector":"a","text":"Archive"}},
  {"label":"archived tile","wait":"article[aria-label^='Archived Note:']"},
  {"label":"restore","click":"button[title='Restore to library']"},
  {"label":"empty archive","expect":"document.body.textContent.includes('Nothing archived.')","timeoutMs":8000},
  {"label":"return to Everything","clickText":{"selector":"a","text":"Everything"}},
  {"label":"restored note is active","expect":"window.location.hash === '#/' && document.querySelectorAll(\"article[aria-label^='Note:']\").length > 0"}
]
```

Read the scratch `items` row before and after restore to prove `archived` changes from `1` to `0` and `updated_at` changes. The visible archive tile and its disappearance prove the route behavior.

## Gotchas

- Archive is a sidebar destination, not a Settings tab. There is no batch selection or Undo toast in the current renderer.
- The archive tile is an `article` named `Archived <kind>: <title>`; its Restore button has `title="Restore to library"` and no aria-label.
- Permanent delete uses a native confirmation in the full app and is not part of this reversible drive.
