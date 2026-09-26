# Spaces

A Space is a saved search shown as a collection. A Smart Space stores its query and reevaluates it as items arrive. The selected row shows its current count; inactive rows leave the count blank. Spaces can be created empty or from the current search, recolored, renamed, reordered, and deleted without deleting their items.

## Sub-features

- `spaces-list` shows seeded Spaces and their color dots.
- `spaces-open` selects a Space and filters the library to it.
- `spaces-create-empty` creates a Space that matches everything.
- `spaces-create-from-search` saves the current query as a Space named after it.
- `spaces-color` cycles a Space through five color tokens.
- `spaces-rename` commits on Enter or blur and abandons on Escape.
- `spaces-reorder` swaps a Space with its neighbor.
- `spaces-delete` removes a Space while keeping its items.

## How to get to it (user POV)

- Choose `Add a Space` beside the Spaces heading.
- Search first, then choose `Save as Space` in the toolbar.
- Click a Space name in the sidebar to open it.
- Use the color dot, rename button, move buttons, or delete button on a row.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- Seeded Spaces are `Design references` (6), `Read later` (0), and `Top picks` (3), in that order. Inactive rows have empty `.space-count` text.

- **Create from a search.** Type `photography` into `[aria-label="Search your mind"]` and wait for `.result-count` to equal `12`. Click `.save-space-link`, wait for `[aria-label="Space name"]`, and read the prefilled value `photography` and hint `A Smart Space that updates automatically as items match this search.` Press Enter with the field focused. Wait for `.space-item.selected` and its `.space-count` to equal `12`.
- **Change color.** Click `[aria-label="Change color of photography"]` and wait for the selected row's `.space-dot` to have the next color class. The new Space starts pink and cycles to purple. Read the dot's accessible label or `title`.
- **Rename.** Click `[aria-label="Rename photography"]`, wait for `.space-rename-input`, type `Photo picks`, and press Enter. Wait for the selected row to contain `Photo picks` and keep its count at `12`.
- **Select a seeded Space.** Focus `.space-item:nth-child(1)` and press Enter. Wait for the selected row to contain `Design references`, its count to equal `6`, and every inactive `.space-count` to be empty. Assert `.result-count` is `6`.
- **Reorder.** Focus `[aria-label="Move Top picks up"]` and press Enter. Read the row names and expect `Design references | Top picks | Read later | Photo picks`. Focus `[aria-label="Move Top picks down"]` and press Enter to restore the original order.
- **Delete the temporary Space.** Focus `[aria-label="Delete Photo picks"]` and press Enter. Wait for three rows, no `Photo picks`, and `.result-count` back at `28`.
- **Create and remove an empty Space.** Click `[aria-label="Add a Space"]`, type `Empty hold`, and click `Create Space`. Wait for the selected row and `.result-count` to equal `28`. Delete `Empty hold` and wait for the three seeded rows.
- **Proof.** Save the selected Space beside its filtered grid. Keep the row order and counts in the transcript.

## Gotchas

- Only the selected row fills `.space-count`. Do not assert counts on inactive rows.
- The color dot is a nested `role="button"` with the label `Change color of <name>`.
- Space tools are transparent until the row is hovered or focused. They sit at the row's right edge inside `.space-actions`, not its center. A screenshot without focus may not show them. Click the childless name with `click --within ".space-list" --text "<name>"`.
- The rename input has the same accessible name as its opener. Target `.space-rename-input` while editing. Blur commits; Escape abandons.
- A Space created from search stores plain text. All three seeded rows use demo-only structured queries, not just `Read later` and `Top picks`.
- Preview Space mutations live in memory. Navigate back to the run URL to restore the seed. The desktop app persists changes in SQLite.
- Native `list_space_items` asks for at most 100 rows and the backend clamps to 200, so a large Space under-reports and truncates in the full app. Preview has no cap.
