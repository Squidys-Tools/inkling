# Archive and recover

Forgetting an item takes it out of the library without destroying it: the row moves to the Settings archive, a toast offers Undo, and the archive offers recover and permanent delete. A one-way door here would be a bug, so every recipe ends by putting the item back.

## Sub-features

- `archive-in` takes an item out of the library with `Forget this item` in the detail overlay.
- `archive-undo` restores it from the toast, before it scrolls away or the run ends.
- `archive-list` lists archived items with a count in Settings.
- `archive-select` enters selection mode and selects archived items.
- `archive-recover` returns selected items to the library.
- `archive-delete` permanently deletes one archived item, or a selection of them.
- `archive-data` switches to the Data panel, which expects to reset to this archive tab on reopen; the export itself is [export.md](./export.md).

## How to get to it (user POV)

- Open an item and choose `Forget this item` in the overlay.
- Choose `Undo` in the `Forgotten from your library` toast.
- Choose `Settings` in the sidebar footer, then the `Archive` tab.
- Choose `Select` in the archive panel, pick items, then `Recover` or `Delete`.

## Driving it with harness.mjs

Preconditions:

- A healthy dev-mode run per [SKILL.md](../SKILL.md), `doctor` passing, `.result-count` reading `28`.
- The archive holds 3 seeded items — demo items 5, 10, and 12 re-keyed as `archive-5` (the X post), `archive-10` (the PDF), and `archive-12` (the note) — and exists only in a dev build. `serve --mode preview` starts with an empty archive.
- Item `12` is the seeded note and is safe to forget and recover.

- **Forget an item.** Run `text --selector ".result-count"` (expect `28`), then `click --selector '.library-card[data-library-item-id="12"]'`, `wait --selector ".expanded-overlay"`, `click --selector '[aria-label="Forget this item"]'`, and `wait --expr '!document.querySelector(".expanded-overlay")'`. The count drops to `27` and the card is gone from the grid.
- **Read the toast.** Run `eval --expr 'document.querySelector("[data-sonner-toast]")?.innerText.replace(/\\s+/g, " ")'`. It reads `Forgotten from your library` with the item title and an `Undo` action.
- **Undo.** Run `click --within "[data-sonner-toast]" --text "Undo"` and `wait --expr 'document.querySelector(".result-count")?.textContent === "28"'`. The item is back in the library. The forget toast is dismissed by the click and a `Restored to your library` toast takes its place for 3 s: assert it with `eval --expr '[...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText.replace(/\s+/g, " "))'` and screenshot it while it is up, then leave it to expire.
- **Open the archive.** Run `click --selector '[aria-label="Settings"]'` and `wait --selector ".settings-modal"`. The `Archive` tab is selected and `.settings-panel-count` reads `3 items in archive`, matching the three cards in `.settings-archive-grid`.
- **Recover through selection.** Run `click --selector '[aria-label="Select archived items"]'`. The select button becomes `[aria-label="Exit multi-select mode"]` and `.settings-archive-actions` reads `0 selected Recover Delete Select`. Then `click --selector '[aria-label="Select Attention Is All You Need"]'` and `text --selector ".settings-selected-count"` (expect `1 selected`). Then `click --within ".settings-archive-actions" --text "Recover"` and `wait --expr 'document.querySelector(".settings-panel-count")?.textContent?.trim().startsWith("2 ")'` (the header reads `2 items in archive`), which also leaves selection mode. Close settings and read `.result-count` (expect `29`): the item left the archive and rejoined the library keeping its `archive-10` id, so two cards titled `Attention Is All You Need` now sit in the library.
- **Delete one permanently.** Run `click --selector '[aria-label="Delete The first post on Twitter"]'` and `wait --expr 'document.querySelector(".settings-panel-count")?.textContent?.trim() === "1 item in archive"'`. The header switches to the singular and one card stays. Note the two `Delete <title>` controls are different actions: in the archive panel it deletes forever, while the same label on a Space row deletes the Space.
- **Check the Data panel.** Run `click --within ".settings-modal-sidebar" --text "Data"`. The tab takes `aria-current="page"` and the heading becomes `Your library`, with the export card [export.md](./export.md) drives in full. Leaving and reopening Settings must come back to `Archive`.
- **Proof.** Screenshot the library after forgetting, the toast with `Undo`, the archive in selection mode, and the library after recovering. Keep the asserted counts.

## Gotchas

- Everything above is in-memory in the preview. The seeded archive and the items come back on reload, so the proof is the count transition, not a persisted row.
- A destructive verification should use a seeded item you can restore. Do not delete the developer's real items — the preview never touches them, but the desktop app will.
- Sonner keeps the forget toast open on purpose (`duration: Infinity`), so it does not need racing. If it was dismissed, recover from the archive instead and say which path you used.
- The archive card buttons carry `Delete <title>` outside selection mode and `Select <title>` inside it. Clicking the wrong one deletes the item, and the label check is not enough: scope with `--within ".settings-panel"` and confirm the control's own `aria-label`.
- The archive grid is the same virtualized card component as the library, so its card count is a rendered-window count. The panel header is the total, and it is singular at one: `3 items in archive`, `2 items in archive`, `1 item in archive`.
- The archived seed re-keys three demo items that also exist in the library, so titles repeat across surfaces: forgetting library item `12` adds a second `Books to reread this fall` card, and recovering `archive-10` puts it beside library item `10`. Address archive cards by `data-library-item-id` (or scope with `--within ".settings-panel"`) whenever both surfaces can show the same title.
- Export needs the native folder picker and the Rust core. The preview only shows the disabled control and the note; [export.md](./export.md) owns that recipe and the open export bugs in `docs/bugs.md`.
