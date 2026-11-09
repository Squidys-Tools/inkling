# Spaces

Spaces are named collections in the sidebar: Smart (a saved search) or Regular (hand-filed). Status: **driven** on 2026-11-09 (create Smart and Regular, rename, file an item, delete empty and populated). Not driven: Space color and move up/down, the card right-click menu (needs `--headed`).

## Sub-features

- `space-create-smart` creates a Smart Space from the form.
- `space-create-regular` creates a Regular Space (keyboard-selected, see below).
- `space-rename` renames a Space.
- `space-file` files an item into a Regular Space through the **Keep in a Space** menu (an in-app DOM menu that still surfaces through `--surface menu`).
- `space-delete` deletes a Space (populated Regular Spaces confirm in a native window) and keeps the items.

## How to get to it (user POV)

- Sidebar menubutton **Add a Space**; each row has `Rename|Delete|Move … up|down|Change color of <name>` buttons.
- Search > Save as Space (see search.md).
- Item view > **Keep in a Space** (card right-click wraps the same Space actions in a `Keep in a Space` submenu of a bigger menu; not driven).

## Driving it with agent-desktop

Preconditions: seeded library (Spaces `Design references`, `Read later`, `Weekend reading` exist).

- **Open the form.** `$I ad expand "$($I ref menubutton 'Add a Space')"`. Textfield `Space name`, radiobuttons `Smart`/`Regular`, buttons `Cancel`/`Create Space` (disabled until a name is set).
- **Smart (default).** `$I ad set-value "$($I ref textfield 'Space name')" 'Verify Smart'`, then `$I ad click "$($I ref button 'Create Space')"`. A link `Verify Smart <n>` appears. `$I db "SELECT name,kind,query FROM spaces WHERE name='Verify Smart'"` → kind `smart`, query `{}` (an empty Smart Space matches everything, so `n` is the library size).
- **Regular.** The radios cannot be clicked headless. After `set-value` on the name (which focuses that field) run `$I ad press tab --window-id '{window}'` then `$I ad press right --window-id '{window}'`; `$I tree | grep radiobutton` must show `Regular` with `states=focused|selected`. Then click `Create Space`. `db` → kind `regular`, query `{}`; the link reads `Verify Regular 0`.
- **Rename.** `$I ad click "$($I ref button 'Rename Verify Regular')"`; a focused textfield `Rename Verify Regular` appears. `$I ad set-value "$($I ref textfield 'Rename Verify Regular')" 'Verify Renamed'` then `$I ad press return --window-id '{window}'`. `db` → name `Verify Renamed`; the sidebar link and its `Rename/Delete/Move` buttons carry the new name.
- **File an item.** Go to Everything (`$I ad click "$($I ref link Everything --contains)"`), open `Note: Books to reread this fall` (click its group), `$I ad click "$($I ref button 'Keep in a Space')"`, then `$I tree --surface menu`: the menu is `Item actions`, an in-app popup listing only Regular Spaces — menuitems `Add to Weekend reading`, `Add to Verify Renamed` (a member Space shows `Remove from …`; Smart Spaces never appear). `$I ad click '<ref of Add to Verify Renamed from that tree>'`. `db "SELECT s.name, si.item_id FROM space_items si JOIN spaces s ON s.id=si.space_id WHERE s.name='Verify Renamed'"` → item `12`; sidebar link `Verify Renamed 1`.
- **Delete populated Space.** `$I ad click "$($I ref button 'Delete Verify Renamed')"`. A second window of ours opens (a native confirm): `D=$($I windows | grep other | awk '{print $1}')`. `$I tree --window $D` lists buttons `Delete Space` and `Cancel`; `$I ad click "$($I ref button 'Delete Space' --window $D)"`. `db` → no `spaces` row named `Verify Renamed`, `items` row `12` still present.
- **Evidence.** `$I shot` after create, after file (sidebar count), and after delete; plus the `db` rows above.

## Gotchas

- Do not `click`/`select`/`check`/`set-value` the `Regular` radio: its input is visually hidden and every action returns `TIMEOUT … actionability_timeout`. The keyboard route is the working one; always read `kind` from `db`, since a skipped step silently creates a Smart Space.
- `press` goes to our window by `--window-id` without taking focus; its result is `delivered_unverified`, so verify the effect with `tree`.
- Empty `Space name` keeps `Create Space` disabled.
- While the item view is open the grid cards leave the tree; return to Everything first. The window's close button is `Close window`, the item view's is `Close` — the names differ, but don't confuse them anyway.
- `ref` and `tree` always use the main window; after any native dialog opens, `$I windows` tells you the dialog's id; pass it as `--window <id>` to `tree` or `ref`. Resolve the dialog before continuing.
- Only a populated Regular Space asks before delete; an empty Regular Space and every Smart Space delete immediately. Rename commits on blur as well as Return.
- The filing menu closes if the window loses it; read `tree --surface menu` immediately after opening.
