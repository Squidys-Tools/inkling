# Search your library

## User flow

Press `/` or Ctrl+K (Cmd+K on macOS) to focus **Search your mind**. Results update after typing pauses; Enter runs the query immediately. Escape clears the query and blurs the field. A no-match query shows **Nothing surfaced yet.** with **Clear search**. After a query is unfocused, the filter row shows its result count and **Save as Space**.

Search covers active items and indexed title, description, source label, OCR text, metadata, and body. Semantic ranking may contribute when available; text search remains the fallback. It searches the whole library, including while a Space is selected.

## Driving it with `scripts/drive.mjs`

Needs notes with bodies `alpha probe` and `bravo probe` in Everything. The query results replace the visible card set. The driver focuses controls before clicking, so click **List view** to blur the search field and reveal the filter row before choosing **Save as Space**.

```json
[
  {"label":"focus search","key":"/"},
  {"label":"field focused","expect":"document.activeElement?.getAttribute('aria-label') === 'Search your mind'"},
  {"label":"search alpha","fill":"input[aria-label='Search your mind']","text":"alpha"},
  {"label":"only alpha result","expect":"document.querySelectorAll('article').length === 1","timeoutMs":5000},
  {"label":"search no match","fill":"input[aria-label='Search your mind']","text":"zzzzqqqq"},
  {"label":"empty state","expect":"document.body.textContent.includes('Nothing surfaced yet.') && document.querySelectorAll('article').length === 0","timeoutMs":5000},
  {"label":"clear search","clickText":{"selector":"button","text":"Clear search"}},
  {"label":"results restored","expect":"document.querySelectorAll('article').length >= 2","timeoutMs":5000},
  {"label":"search alpha again","fill":"input[aria-label='Search your mind']","text":"alpha"},
  {"label":"one match","expect":"document.querySelectorAll('article').length === 1","timeoutMs":5000},
  {"label":"blur search","click":"button[aria-label='List view']"},
  {"label":"save as Space","clickText":{"selector":"button","text":"Save as Space"}},
  {"label":"Space form","wait":"input[aria-label='Space name']"},
  {"label":"query in placeholder","expect":"document.querySelector(\"input[aria-label='Space name']\").placeholder.includes('alpha')"},
  {"label":"name Space","fill":"input[aria-label='Space name']","text":"Alpha Smart"},
  {"label":"create","clickText":{"selector":"button[type=submit]","text":"Create Space"}},
  {"label":"Space opens with match","wait":"button[aria-label='Rename Alpha Smart']"},
  {"label":"one matching card","expect":"document.querySelectorAll('article').length === 1"}
]
```

Read `spaces` to prove the new row has `kind = 'smart'` and `query = '{"text":"alpha"}'`. Search itself stores no data; the visible card set proves its result behavior.

## Gotchas

- The query is not prefilled into the Space name. It appears in the placeholder **Save “alpha” as…**; enter the actual name before creating.
- Escape clears the query. To show the filter row without clearing it, move focus away from Search your mind.
- In the full app, matching uses whole-token FTS: `alp` does not match `alpha`, so search for full words. If SQLite lacks FTS5, it falls back to substring matching. Preview mode always uses substring matching and has no semantic results.
- A development build downloads the text model into the scratch library on first use. Once notes have embeddings, any item at least 0.55 similar to the query joins the results, so the exact counts above hold only for lexical results. If a count is off by an unrelated note, read `item_embeddings` before calling it a regression.
- The result count is plain text in the filter row, not an animated digit roll.
