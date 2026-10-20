# Spaces

## Sub-features

- Add a Space, rename it, delete it. Items are kept when a Space is deleted.

## How to get to it (user POV)

Click the plus beside SPACES in the sidebar to add one. Name it in the Space name field. Rename and delete live on the Space row.

## Driving it with `scripts/drive.mjs`

Mapped but not yet driven. Start with `button[aria-label='Add a Space']`, then `input[aria-label='Space name']` with `fill`, then `button[title='Delete Space']`. End state: the Space row exists in the sidebar, and its items are still in `items`.

## Gotchas

- Not yet proven on a Linux run. The Space name field may need an explicit Enter key; verify when driven.
