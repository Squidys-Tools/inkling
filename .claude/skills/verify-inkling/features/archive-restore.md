# Archive and restore

Archiving moves an item out of Everything into the Archive view; Restore brings it back. Status: **driven** on 2026-11-19 (Archive from the item view, the view's card controls incl. the `Archived <when>` line, Restore from the item view, both toasts). Permanent delete and `Delete all…` are deliberately not driven.

## Sub-features

- `archive-item` archives from the item view.
- `archive-view` lists archived items as ordinary cards with an `Archived <when>` line and `Restore`/`Delete <title>` on hover, plus a `Delete all…` header action.
- `archive-restore` restores an item to Everything.

## How to get to it (user POV)

- Open an item (a note card lands on its item view like any card), choose **Archive**; open the sidebar link **Archive**; choose **Restore** on a card.

## Driving it with agent-desktop

Preconditions: seeded library. The seed already holds 3 archived copies (`archive-5`, `archive-10`, `archive-12`, same titles as the active items), so each of those titles appears once in Everything (the active copy) and once in the Archive view (the archived copy).

- **Archive.** A note card's click lands on its item view: `$I ad click "$($I ref group 'Note: Books to reread this fall')"` (search `reread` first if earlier captures pushed it out of the tree; see README). `$I ad click "$($I ref button Archive)"` archives it and closes the item view. `$I db "SELECT id,title,archived FROM items WHERE title='Books to reread this fall'"` → id `12` archived `1` (plus the seed's `archive-12`, also `1`); `Everything` drops by 1. A toast `Archived` naming the item, with its subject tile and an `Undo` button, shows.
- **View.** `$I ad click "$($I ref link Archive)"`. The header reads `Archive` with a count line `<n> item(s), kept until you restore or delete them` and a `Delete all…` button. `$I tree` lists cards under their ordinary names `<Kind>: <title>` — `Note:`, `Post:`, `PDF:` — no `Archived` prefix (role `group` on Windows, `article` on Linux); each card carries an `Archived <when>` line (`Archived just now`, `Archived Nov 18`) and exposes `Restore` and `Delete <title>` on hover/focus. `$I shot`.
- **Restore.** `Restore` buttons repeat per card, and a `--in`-scoped ref cannot be re-identified at click time when sibling cards share the name (`AMBIGUOUS_TARGET`): open the card instead — `$I ad click "$($I ref group 'Post: The first post on Twitter' --contains)"` — its item view shows `Restore to library` and `Delete permanently`. On the Linux box, `$I ad right-click` on an archived card opens `Item actions` with the same `Restore to library`/`Delete permanently` entries — each unique in that menu, so `ref menuitem` drives it. Click `Restore to library`; the view stays open. Before: `db "SELECT id,archived FROM items WHERE title='The first post on Twitter'"` → `archive-5` archived `1`. After: `archive-5` archived `0`, the card leaves the Archive view, and `Everything` rises by 1.

## Gotchas

- Titles repeat (seed copies and the item you archived): use `ref group` only with a unique title like the Post above, and identify rows by `id` in `db`. After archiving `Books to reread this fall` and restoring the seed copy, the active and archived twins share one name and `ref` will say so.
- The item-view `Archive` is a *button*; the sidebar `Archive` is a *link*. The role disambiguates.
- A card's `Restore`/`Delete <title>` controls are visually hidden until the card is hovered or focused; the accessibility tree exposes them, but every card carries the same `Restore`, so even a scoped `ref` result refuses a click on name twins. The card's own item view (or the right-click `Item actions` menu on Linux) has the uniquely named `Restore to library`/`Delete permanently` — drive restore from there.
- The same twin guard blocks toast buttons: when the `Archived` and `Restored to library` toasts are stacked in `region "Notifications"`, their two `Undo` buttons are identical twins — `ad click` returns `AMBIGUOUS_TARGET`, and `--headed` fails `sibling_overlap` while they cover each other. Each toast also carries an identical `Dismiss notification`, and twin cards twin the per-card `Delete <title>` too. Assert the toasts' presence in `tree`, don't drive their Undo.
- Permanent delete (`Delete <title>`) asks in an in-app confirm (`Delete`) and is irreversible; `Delete all…` wipes every archived item the same way: neither is part of this journey.
