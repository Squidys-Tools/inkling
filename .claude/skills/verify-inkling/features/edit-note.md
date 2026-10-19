# Edit a note

## Sub-features

- Open a note in the item overlay, choose Edit note, save, close.

## How to get to it (user POV)

Click a note card to open it in the overlay. Choose Edit note in the toolbar, change the text, and press Save. The overlay closes with the X button, Escape, or Save.

## Driving it with `scripts/drive.mjs`

Mapped but not yet driven. Open the card by clicking its article, then `button[aria-label='Edit note']`. Exits are `button` with the close affordance, `key` Escape, or Save. End state: the `items.body` row has the new text and `updated_at` moved forward.

## Gotchas

- Not yet proven on a Linux run.
