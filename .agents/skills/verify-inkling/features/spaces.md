# Spaces

A Space is a saved search shown as a collection. A Smart Space keeps working after it is created: the query is stored and re-evaluated as items arrive, which is why the sidebar shows a live count for the selected Space. Spaces can be created empty, created from the current search, renamed, recolored, reordered, and deleted.

## Sub-features

- `spaces-list` shows the Spaces with their color and live count.
- `spaces-open` selects a Space and filters the library to it.
- `spaces-create-empty` creates an empty Space that matches everything.
- `spaces-create-from-search` saves the current query as a Space named after it.
- `spaces-rename` renames in place, committing on Enter or blur.
- `spaces-reorder` moves a Space up or down.
- `spaces-delete` removes a Space while keeping its items.

## How to get to it (user POV)

- Choose `Add a Space` next to the Spaces heading.
- Search first, then choose `Save as Space` in the toolbar.
- Click a Space in the sidebar to open it.
- Hover a Space row and use its rename, move, and delete controls.

## Driving it with harness.mjs

Preconditions:

- A healthy run per [SKILL.md](../SKILL.md), `doctor` passing.
- The seeded Spaces in sidebar order: `Design references` (6), `Read later` (0, so it opens on the empty state), `Top picks` (3).
- The seeded library has 12 items tagged `photography`, which makes the counts below unambiguous.

- **Create from a search.** Run `type --selector '[aria-label="Search your mind"]' --text "photography"` and `wait --expr 'document.querySelector(".result-count")?.textContent === "12"'`. Then `click --selector ".save-space-link"` and `wait --selector '[aria-label="Space name"]'`. The form is prefilled with `photography` and its hint reads `A Smart Space that updates automatically as items match this search.`
- **Commit it.** Run `click --within ".space-form" --text "Create Space"` and `wait --selector ".space-item.selected"`. The new Space appears in the sidebar, is selected, and its `.space-count` reads `12`, matching `.result-count`.
- **Create empty.** Clear the search box, choose `[aria-label="Add a Space"]`, and read `[aria-label="Space name"]` (empty) with the hint `An empty Smart Space matches everything you have saved.` Type a name, choose `Create Space`, and confirm the new Space is selected with `.result-count` back at the full library total (`28`).
- **Open a seeded Space.** Run `click --within ".space-list" --text "Design references"` and `wait --selector ".space-item.selected"`. The grid narrows to the 6 items tagged `reference` and the row's `.space-count` agrees. The other seeds are `Read later` (`{ tag: "essay" }`, which matches 0 items here, so the empty state is correct) and `Top picks` (`{ favorite: true }`, 3 items).
- **Rename.** Run `click --selector '[aria-label="Rename photography"]'` and `wait --selector ".space-rename-input"`. The row turns into an input (its accessible name is `Rename photography`). Run `type --selector ".space-rename-input" --text "Photo picks"` and `key --key Enter`. The sidebar row reads `Photo picks` with its count.
- **Reorder.** Run `click --selector '[aria-label="Move Top picks up"]'` and read the row order with `eval --expr '[...document.querySelectorAll(".space-item")].map(s => s.textContent.trim().replace(/\s+/g, " "))'`: `Top picks` swaps one place up and the other rows keep their relative order. `[aria-label="Move Top picks down"]` puts it back.
- **Delete.** Run `click --selector '[aria-label="Delete Photo picks"]'` and `wait --expr '![...document.querySelectorAll(".space-item")].some(s => s.textContent.includes("Photo picks"))'`. The Space is gone, the library total is unchanged, and no items were deleted.
- **Proof.** Screenshot the sidebar with the new Space selected next to its filtered grid, and keep the asserted counts.

## Gotchas

- Space tools (rename, move up, move down, delete) are invisible until the row is hovered or focused: `.space-delete` sits at `opacity: 0`. A screenshot without hover will not show them. Do not read a missing control in a screenshot as a bug.
- Do not click a Space row at its center. The row is a `role="button"` wrapping the color dot, the name, the count, and the four tool buttons, and those invisible tools sit exactly at the center: a center click lands on `Move <name> up` and silently reorders the sidebar instead of selecting. Click the name — `click --within ".space-list" --text "<name>"` resolves to the childless name span, which is what a user aims at.
- The rename input's accessible name is `Rename <space name>`, the same as the button that opened it. Target `.space-rename-input` instead.
- Blur commits a rename by design, so clicking away mid-edit saves the draft. Press Escape to abandon it.
- `Delete <name>` labels are also used by archived cards in Settings. Scope a Space delete with `--within ".space-list"` when both surfaces are on screen.
- Deleting a Space keeps its items. The proof is that the library count does not move.
- While a Space is selected the search field is empty and `.result-count` is the Space's own count, so clearing the field does nothing. Choose `Everything` to read the library total again.
- In the preview, Spaces live in memory: creating, renaming, and deleting change nothing on disk, and the seeded three come back on reload. In the desktop app the same actions write to the `spaces` table.
- A Space created from a search stores the query text only (`{ text: "..." }`). The structured seeds (`{ tag: "essay" }`, `{ favorite: true }`) exist only in the demo data, so a Space rename will not change what it matches.
