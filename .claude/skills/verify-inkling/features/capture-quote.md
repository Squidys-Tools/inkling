# Capture a quote from Add

## User flow

Choose **Add → Quote**, enter the required quote text, optionally enter an attribution and source URL, then choose **Save to library**. Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS also submits. Saving returns to Everything and selects the new quote card.

## Driving it with `scripts/drive.mjs`

Leave Source URL empty to keep the drive independent of the network.

```json
[
  {"label":"open Add","clickText":{"selector":"button","text":"Add"}},
  {"label":"choose Quote","clickText":{"selector":"[role=menuitem]","text":"Quote"}},
  {"label":"quote field","wait":"textarea[aria-label='Quote text']"},
  {"label":"type quote","fill":"textarea[aria-label='Quote text']","text":"Small steps cross oceans"},
  {"label":"attribution","fill":"input[aria-label='Attribution']","text":"Ada Probe, Notes"},
  {"label":"save","clickText":{"selector":"button","text":"Save to library"}},
  {"label":"quote card appears","expect":"document.querySelectorAll(\"article[aria-label^='Quote:']\").length > 0","timeoutMs":10000},
  {"label":"shot","shot":"quote-saved.png"}
]
```

The card is the visible proof. Read the scratch `items` row to prove `kind = 'quote'`, `title` is the quote, `description` is the attribution, `body = ''`, `source_label` is the attribution before its comma when no URL is set, `metadata.quoteText` is the quote, and `archived = 0`.

## Gotchas

- Add opens a menu and then a full-page form; there is no `.add-menu-panel` or `.add-menu-save` element.
- The attribution field is labeled **Attribution**.
- Quote text is stored in `title` and `metadata.quoteText`; attribution is stored in `description`.
