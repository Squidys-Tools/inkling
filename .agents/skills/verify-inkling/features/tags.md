# Tags

The item view's Info panel lists the Regular Spaces an item is filed in as chips, then its tags as plain text with a remove button each. A field adds more. Status: **driven** on 2026-11-12.

## Sub-features

- `tag-add` adds a tag from the field; Enter keeps the field open for the next one.
- `tag-cancel` Escape closes the field, not the item view, and returns focus to `Add tag`.
- `tag-remove` removes a tag from its chip.

## How to get to it (user POV)

- Open an item card. Choose **Add tag**, type, press Enter. Choose the × next to a tag to remove it (the × is the `Remove tag <name>` button).

## Driving it with agent-desktop

Preconditions: seeded library, Everything shown. Item `5` (`Post: The first post on Twitter`) has tags `twitter`, `history`, `post` and is filed in `Weekend reading`.

- **Open.** `$I ad click "$($I ref group 'Post: The first post on Twitter')"`. Buttons `Remove tag twitter`, `Remove tag history`, `Remove tag post` and `Add tag` appear.
- **Add.** `$I ad click "$($I ref button 'Add tag')"`, then `$I ad set-value "$($I ref textfield 'New tag name')" '#Launch'` and `$I ad press enter --window-id '{window}'`. `Remove tag launch` appears and the textfield stays, focused.
- **Cancel.** `$I ad press escape --window-id '{window}'`. The textfield goes, `Add tag` is `focused`, and `Close` is still there.
- **Remove.** `$I ad click "$($I ref button 'Remove tag history')"`. That button goes and `Add tag` is `focused`.
- **Proof.** `$I db "SELECT json_extract(metadata,'$.tags') AS tags FROM items WHERE id='5'"` → `["twitter","post","launch"]`.

## Gotchas

- The stored tag is lowercased with its leading `#` stripped, so the remove button's name is `Remove tag launch`, not `#Launch`.
- The row is `list "Spaces and tags"`; on Windows `tree` prints its entries as `option`s (so `option "Add tag"` sits beside `button "Add tag"`), and each tag's `Remove tag <name>` button sits in its own entry. `ref button 'Add tag'` is still unique.
- In bash, escape the `$` in `'$.tags'` when the query sits in double quotes.
