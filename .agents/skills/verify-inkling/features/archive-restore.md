# Archive and restore

## Sub-features

- Archive an item; restore it from the archive panel.

## How to get to it (user POV)

Archive from an item's actions. Archived items leave the library and appear in the archive panel in Settings. Restore returns them to the library.

## Driving it with `scripts/drive.mjs`

Mapped but not yet driven. Settings opens the archive panel; the batch restore button is `.settings-batch-recover`. End state: the row's `archived` flips between 1 and 0 and the card leaves and returns to Everything.

## Gotchas

- Not yet proven on this Linux run. Restore in the archive panel was seen in the source only.
