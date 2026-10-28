# Search your library

## Sub-features

- Text search across notes and titles; "/" focuses the field.

## How to get to it (user POV)

Type in the Search your mind field at the top of the library. Results narrow as you type; clearing the field restores the grid.

## Driving it with `scripts/drive.mjs`

Mapped but not yet driven. Use `input[aria-label='Search your mind']` with `fill`, then an `expect` that the card count drops to the matching notes. Clear with `fill` of an empty string after selecting the field.

## Gotchas

- Not yet proven on a Linux run. Mark it unverified until a run covers it.
- The field has a `/ to search` hint; the `/` shortcut is not yet driven.
