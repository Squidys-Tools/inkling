# Search

Search narrows the library to items matching a query, shows an empty state with Clear search when nothing matches, and can save the query as a Smart Space. Status: **driven** on 2026-11-13. Not driven on Windows: the `/` shortcut (agent-desktop has no key name for `/` there; the Linux instabox driver's xdotool path sends it and it is covered there).

## Sub-features

- `search-focus` Ctrl+K focuses the search field.
- `search-match` shows only matching cards.
- `search-empty` shows no cards and a `Clear search` button for a nonsense query.
- `search-clear` restores the card set.
- `search-save` Save as Space creates a Smart Space holding the query.

## How to get to it (user POV)

- Click the search pill, or press Ctrl+K. The pill shows the current view's name at rest (`Everything`); its accessible name is `Search your mind`.

## Driving it with agent-desktop

Preconditions: seeded library, Everything selected.

- **Focus by key.** `$I ad press ctrl+k --window-id '{window}'`; `$I tree | grep 'Search your mind'` shows `states=focused`.
- **Match.** `$I ad set-value "$($I ref textfield 'Search your mind')" hundred`; results debounce about 220 ms but wait ~3 s before asserting (semantic ranking can still be resolving; it can legally take ~5 s plus a cold model load when embeddings exist — on the seeded library there are none, so text alone answers), then `$I tree | grep -E '(article|group) "(Article|Note|Image|Post|Quote|Video|PDF|File):'` shows only `Article: The Hundred-Year Language` (assert the card-kind prefix: the tree also carries landmark groups like `View options` and `Window controls`; on Linux the card role is `article`, on Windows it may read `group`). `$I shot s1`.
- **Empty.** `set-value` `zzzzqqqq`; no card groups remain and a button `Clear search` appears. `$I shot s2`.
- **Clear.** `$I ad click "$($I ref button 'Clear search')"`; card groups return (the rendered window of the virtualized grid, offscreen groups included; do not assert a number).
- **Save as Space.** Search `hundred` again, then blur the field by checking the view switch: `$I ad check "$($I ref switch 'List view')"`. A button `Save as Space` appears (it only shows once the field is unfocused). Click it, `set-value` the textfield `Space name` to `Hundred Smart`, click `Create Space`.
- **Proof.** `$I db "SELECT name,kind,query FROM spaces WHERE name='Hundred Smart'"` → kind `smart`, query `{"text":"hundred"}`; the sidebar link reads `Hundred Smart 1` and the Space shows the one article. Search alone stores nothing: `db "SELECT COUNT(*) n FROM items"` is unchanged around the query steps.

## Gotchas

- `set-value` on the search field does drive the app's search. `click` on a switch does not blur the field; `check` does. The view toggles are `button`s with `aria-pressed` in source: agent-desktop may surface them as `switch` or `button`, so if `ref switch 'List view'` finds nothing, try `ref button 'List view'`. The toggle row only renders while the query has results — there is nothing to blur with on a zero-result page.
- Once the field blurs with a non-matching query, two controls named `Clear search` exist — the empty-state action and the filter row's chip — so `ref button 'Clear search'` reports 2 matches; resolve one from `tree` or re-focus the field first. `Save as Space` opens the same inline draft form the sidebar's `Add a Space` uses, not a dialog.
- Results update after a ~220 ms debounce; give it ~3 s, and up to ~5 s when embeddings exist, since semantic ranking resolves behind the FTS results.
- Full-app search is whole-token text (FTS) plus optional semantic ranking: `hund` will not match `hundred`; a semantic match may add unrelated cards once embeddings exist. Search never downloads the model (`embedQuery` may not use the network): without it the semantic pass quietly contributes nothing (`embedQuery` fails fast on missing model assets) and text ranking alone answers.
- Typing in the field while a Space or the Archive is selected navigates to Everything — search is always library-wide, there is no in-space filter. Escape in the focused field clears the query and blurs. Saving a Smart Space with Save as Space clears the search and lands you in the new Space.
- `check` on `List view` leaves the app in List view; check `Grid view` to go back.
