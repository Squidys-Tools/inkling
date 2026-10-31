# Capture a note from Add

## User flow

Choose **Add → Note**, enter text in the multiline **Note** editor, then choose **Save to library**. Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS also saves. Empty notes are refused. Text that is only a URL or bare domain is saved as a link. A regular note appears at the top of Everything while background processing continues.

## Driving it with `scripts/drive.mjs`

Start in Everything. Use words with spaces so the input is saved as a note. Current note cards are named **Untitled note** because the text is stored in `body`, not `title`; List view also shows the body description.

```json
[
  {"label":"count notes","expect":"(window.notesBefore = document.querySelectorAll(\"article[aria-label='Note: Untitled note']\").length, true)"},
  {"label":"open Add","clickText":{"selector":"button","text":"Add"}},
  {"label":"choose Note","clickText":{"selector":"[role=menuitem]","text":"Note"}},
  {"label":"editor","wait":"[role=textbox][aria-label='Note']"},
  {"label":"type note","fill":"[role=textbox][aria-label='Note']","text":"alpha probe"},
  {"label":"save","clickText":{"selector":"button","text":"Save to library"}},
  {"label":"note card appears","expect":"document.querySelectorAll(\"article[aria-label='Note: Untitled note']\").length > window.notesBefore","timeoutMs":10000},
  {"label":"shot","shot":"note-saved.png"}
]
```

The UI proof is the new note card in Everything. Read the scratch `items` row to prove `kind = 'note'`, `title IS NULL`, `body` equals the entered text, `body_format = 'md'`, `description` equals the plain text, `metadata = '{"captureSource":"quick note"}'`, and `archived = 0`.

## Gotchas

- The Add menu items are menu roles, not `.add-menu-tile` elements. The note editor is a contenteditable textbox named **Note**, not a textarea.
- Plain Enter inserts a line break; use the Save button or Ctrl/Cmd+Enter.
- In grid view, a note card shows **Untitled note** and a word count. Do not expect the body text on the card itself.
- The full-app library stores a null title. Preview may derive a title from the first body line.
