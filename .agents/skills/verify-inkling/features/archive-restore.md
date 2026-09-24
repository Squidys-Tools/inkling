# Archive and recover

Forgetting an item removes it from the active library. The desktop app archives the row and shows a persistent Undo toast. Settings lists archived items for recovery or permanent deletion. The web preview keeps active and archived items in memory, and forgetting there does not add a fourth archive row.

## Sub-features

- `archive-in` removes an item with `Forget this item` in the detail overlay.
- `archive-undo` restores the item from its toast.
- `archive-list` shows archived items and their total in Settings.
- `archive-select` enters selection mode and selects archived cards.
- `archive-recover` returns selected items to the active library.
- `archive-delete` permanently deletes one archived item or a selected batch.

## How to get to it (user POV)

- Open an item and choose `Forget this item`.
- Choose `Undo` in the `Forgotten from your library` toast.
- Open `Settings`, then `Archive`.
- Choose `Select`, choose cards, then choose `Recover` or `Delete`.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- A dev preview has 28 active items and three archived seeds: `archive-5`, `archive-10`, and `archive-12`. A production preview has no seeded archive.
- The library is virtualized. Search for the note title before addressing item `12` if it is not mounted.

- **Forget and undo.** Search for `Books to reread this fall`, wait for `.result-count` to equal `1`, and click `.library-card[data-library-item-id="12"]`. Wait for `.expanded-overlay`, choose `[aria-label="Forget this item"]`, and wait for the overlay to disappear and `.result-count` to equal `27`. Read `[data-sonner-toast]`, choose `Undo` within it, then wait for `.result-count` to equal `28` and a `Restored to your library` toast. The preview does not add the forgotten item to the archive.
- **Read the archive.** Click `[aria-label="Settings"]`, wait for `.settings-modal`, and assert `.settings-panel-count` reads `3 items in archive`. Read `.settings-archive-grid .library-card` and expect `archive-10`, `archive-12`, and `archive-5`.
- **Select and recover.** Click `[aria-label="Select archived items"]`, then click `.settings-panel .library-card[data-library-item-id="archive-10"] [aria-label="Select Attention Is All You Need"]`. Wait for `.settings-selected-count` to read `1 selected`. Choose `Recover` within `.settings-archive-actions` and wait for `2 items in archive`, no `archive-10` card, and an `item recovered` toast. Close Settings and wait for `.result-count` to equal `29`.
- **Delete one permanently.** Reopen Settings, wait for `2 items in archive`, and click `.settings-panel .library-card[data-library-item-id="archive-5"] [aria-label="Delete The first post on Twitter"]`. Wait for `1 item in archive`, no `archive-5` card, and a `Deleted permanently` toast. There is no confirmation.
- **Delete a batch.** Enter selection mode, select `archive-12` with its card's `Select` button, and choose `Delete` within `.settings-archive-actions`. Wait for `.settings-empty-state` and `0 items in archive`. Save the empty archive.
- **Reset the preview.** Close Settings, run `navigate --url <run url>`, and wait for 28 active items. Reopen Settings and assert the three archive seeds returned.
- **Check the adjacent panels.** Open `Data` and `Extension` from the Settings sidebar. Return to `Archive`, close Settings, and reopen it. Assert that `Archive` is selected again. [export.md](./export.md) and [extension.md](./extension.md) own those panel recipes.

## Gotchas

- Preview Forget removes only from `items`; it does not append to `archivedItems`. The seeded archive stays at three until recovery or deletion changes it.
- The archive grid maps every archived item. Its card count is not a virtualized window count.
- `Delete <title>` is also used by Space rows. Use a compound `.settings-panel` selector for archive controls.
- An archive card changes from `Delete <title>` to `Select <title>` in selection mode. Confirm the mode before clicking.
- The forget toast has `duration: Infinity`. If Undo is gone, recover from the archive and record that route.
- Native Forget, recovery, and deletion write SQLite. Permanent deletion also removes assets. Use an isolated database and asset copy for a desktop destructive check.
- Reloading a preview only resets in-memory state. It does not prove native persistence.
