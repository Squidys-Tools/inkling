# Tags

The item view's Info panel lists the Regular Spaces an item is filed in (`In` and a swatch per Space), then one `Tags` field: each tag is a token with a remove button, and you type new ones into the field. Typing suggests tags already in the library, most used first. Status: recipe rewritten for the one-field box in Nov 2026; the earlier `Add tag` flow was driven on 2026-11-15.

## Sub-features

- `tag-add` adds what was typed on Enter; the field stays focused for the next one.
- `tag-suggest` typing lists up to five library tags the item lacks (`listbox "Tags you use"`); ArrowDown/ArrowUp pick one, Enter adds it.
- `tag-cancel` Escape clears a draft; Escape on an empty field leaves it. Neither closes the item view.
- `tag-remove` removes a tag from its token, and focus stays in the field.

## How to get to it (user POV)

- Open an item card. Click the `Add a tag…` field, type, press Enter. Choose the × on a tag to remove it (the × is the `Remove tag <name>` button).

## Driving it with agent-desktop

Preconditions: seeded library, Everything shown. Item `5` (`Post: The first post on Twitter`) has tags `twitter`, `history`, `post` and is filed in `Weekend reading`.

- **Open.** `$I ad click "$($I ref group 'Post: The first post on Twitter')"`. Buttons `Remove tag twitter`, `Remove tag history`, `Remove tag post` and the combobox `Add a tag` appear.
- **Add.** `$I ad set-value "$($I ref combobox 'Add a tag')" '#Launch'` and `$I ad press enter --window-id '{window}'`. `Remove tag launch` appears and the field stays focused and empty.
- **Cancel.** Type `zz` into the field, then `$I ad press escape --window-id '{window}'`: the draft clears and nothing is saved. A second Escape blurs the field; `Close` is still there.
- **Remove.** `$I ad click "$($I ref button 'Remove tag history')"`. That button goes and the field is `focused`.
- **Proof.** `$I db "SELECT json_extract(metadata,'$.tags') AS tags FROM items WHERE id='5'"` → `["twitter","post","launch"]`.

## Gotchas

- The stored tag is trimmed, lowercased and stripped of leading `#`s (`##x` saves as `x`), so `  MiXeD Case  ` saves as `mixed case` and the remove button's name is `Remove tag launch`, not `#Launch`. A tag the item already has is silently ignored.
- Blurring the field with a draft (clicking away, Tab) commits it as a tag, so a driver that clicks away mid-edit ends up with an extra tag. Escape first to clear.
- Enter adds what was typed, not the first suggestion; a suggestion is used only once it is highlighted with the arrows or clicked.
- With the field blurred, a further Escape closes the item view as usual.
- In bash, escape the `$` in `'$.tags'` when the query sits in double quotes.
