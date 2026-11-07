# Search

Search narrows the library to items matching a query, shows an empty state with Clear search when nothing matches, and can save the query as a Smart Space. Status: **driven** on 2026-11-02. Not driven: the `/` shortcut (agent-desktop has no key name for `/`).

## Sub-features

- `search-focus` Ctrl+K focuses the search field.
- `search-match` shows only matching cards.
- `search-empty` shows no cards and a `Clear search` button for a nonsense query.
- `search-clear` restores the card set.
- `search-save` Save as Space creates a Smart Space holding the query.

## How to get to it (user POV)

- Click the field `Search your mind`, or press Ctrl+K.

## Driving it with agent-desktop

Preconditions: seeded library, Everything selected.

- **Focus by key.** `$I ad press ctrl+k --window-id '{window}'`; `$I tree | grep 'Search your mind'` shows `states=focused`.
- **Match.** `$I ad set-value "$($I ref textfield 'Search your mind')" hundred`; wait about 2 s for the debounce, then `$I tree | grep 'group  "'` shows only `Article: The Hundred-Year Language`. `$I shot s1`.
- **Empty.** `set-value` `zzzzqqqq`; no card groups remain and a button `Clear search` appears. `$I shot s2`.
- **Clear.** `$I ad click "$($I ref button 'Clear search')"`; card groups return (the first screenful, 8).
- **Save as Space.** Search `hundred` again, then blur the field by checking the view switch: `$I ad check "$($I ref switch 'List view')"`. A button `Save as Space` appears (it only shows once the field is unfocused). Click it, `set-value` the textfield `Space name` to `Hundred Smart`, click `Create Space`.
- **Proof.** `$I db "SELECT name,kind,query FROM spaces WHERE name='Hundred Smart'"` → kind `smart`, query `{"text":"hundred"}`; the sidebar link reads `Hundred Smart 1` and the Space shows the one article. Search alone stores nothing: `db "SELECT COUNT(*) n FROM items"` is unchanged around the query steps.

## Gotchas

- `set-value` on the search field does drive the app's search. `click` on a switch does not blur the field; `check` does.
- Results update after a debounce; re-run `tree` and look for the expected group or the `Clear search` button.
- Full-app search is whole-token text (FTS) plus optional semantic ranking: `hund` will not match `hundred`; a semantic match may add unrelated cards once embeddings exist (the model may download on first use).
- Search covers the whole library even while a Space is selected.
- `check` on `List view` leaves the app in List view; check `Grid view` to go back.
