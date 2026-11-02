# Archive and restore

Archiving moves an item out of Everything into the Archive view; Restore brings it back. Status: **driven** on 2026-11-02 (Archive and Restore). Permanent delete is deliberately not driven.

## Sub-features

- `archive-item` archives from the item view.
- `archive-view` lists archived items with Restore and Delete controls.
- `archive-restore` restores an item to Everything.

## How to get to it (user POV)

- Open an item card, choose **Archive** in the item footer; open the sidebar link **Archive**; choose **Restore** on a tile.

## Driving it with agent-desktop

Preconditions: seeded library. The seed already holds archived copies (ids `archive-<id>`, same titles as some active items), so those titles appear twice in the Archive view.

- **Archive.** `$I ad click "$($I ref group 'Note: Books to reread this fall')"` opens the item view; `$I ad click "$($I ref button Archive)"` archives it and closes the item view. `$I db "SELECT id,title,archived FROM items WHERE title='Books to reread this fall'"` → id `12` archived `1`; `Everything` drops by 1.
- **View.** `$I ad click "$($I ref link Archive)"`; `$I tree` lists groups `Archived <Kind>: <title>` and, at the bottom, a status like `4 items`. `$I shot`.
- **Restore.** `Restore` buttons repeat per tile, so scope by tile: `G=$($I ref group 'Archived Post: The first post on Twitter')` then `$I ad click "$($I ref button Restore --in "$G")"`. Before: `db "SELECT id,archived FROM items WHERE title='The first post on Twitter'"` → `archive-5` archived `1`. After: `archive-5` archived `0`, the tile leaves the Archive view, and `Everything` rises by 1.

## Gotchas

- Titles repeat (seed copies and the item you archived): use `ref group` only with a unique title like the Post above, and identify rows by `id` in `db`. `Archived Note: Books to reread this fall` has two tiles and `ref` will say so.
- The item-view footer `Archive` is a *button*; the sidebar `Archive` is a *link*. The role disambiguates.
- Permanent delete (`Delete <title>`) opens a native confirm and is irreversible: not part of this journey.
