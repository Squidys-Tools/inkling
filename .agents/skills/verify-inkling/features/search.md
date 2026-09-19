# Search the library

Search is the organizer: the user describes what they want and the library answers with cards. Typing filters the grid live, the toolbar says what is being shown, and a search can be turned into a Smart Space that keeps matching new items.

## Sub-features

- `search-focus` focuses the field, including from the `/` shortcut.
- `search-match` narrows the grid as the query is typed.
- `search-context` reports the count and the active query, and offers `Save as Space`.
- `search-empty` shows the empty state for a query that matches nothing.
- `search-clear` restores the full library.

## How to get to it (user POV)

- Type in the search field in the capture bar.
- Press `/` while no text field has focus.
- Open a Space in the sidebar, which is a saved search.

## Driving it with harness.mjs

Preconditions:

- A healthy run per [SKILL.md](../SKILL.md), `doctor` passing, `.result-count` reading `28`.
- Run in dev mode so the seeded tags are present. Counts the recipes below rely on: `photography` 12, `reference` 6, `japan` 3, `research` 1, `note` 1, and 3 favorites.

- **Focus by shortcut.** Press `/`. Run `key --key Slash` then `eval --expr 'document.activeElement?.getAttribute("aria-label")'`. The result is `Search your mind`.
- **Match on a tag word.** Run `type --selector '[aria-label="Search your mind"]' --text "photography"` and `wait --expr 'document.querySelector(".result-count")?.textContent === "12"'`. The grid holds only matching cards, and `.result-context` holds `12 items in libraryfor “photography”` followed by `Save as Space`. `innerText` glues `items in library` to `for “…”` and the quotes are typographic, so match on `for “` plus the query rather than on one exact string.
- **Match on a kind word.** Run `type --selector '[aria-label="Search your mind"]' --text "note"` and `wait --expr 'document.querySelector(".result-count")?.textContent === "1"'`. The grid drops to the seeded note card, because the preview matches the kind label as a word. This is the closest thing to a type filter here.
- **Empty state.** Run `type --selector '[aria-label="Search your mind"]' --text "zzzznothing"' and `wait --selector ".empty-state"`. The count reads `0` and the empty state explains there is nothing to show; it is not a blank screen. Its `Clear search` button (`click --within ".empty-state" --text "Clear search"`) empties the field and brings the library back to `28`, which is the no-keyboard way to leave the state.
- **Clear.** Run `type --selector '[aria-label="Search your mind"]' --text ""` and `wait --expr 'document.querySelector(".result-count")?.textContent === "28"'`. `type` with an empty string replaces the field content, which is the harness's way to clear a field.
- **Leave a Space back to the library.** With `photography` in the field, run `click --within ".space-list" --text "Design references"`. Selecting a Space clears the typed query and `.result-count` becomes the Space's own count (`6`), so the previous query is gone, not preserved. Then `click --within 'nav[aria-label="Main navigation"]' --text "Everything"` and wait for `.result-count` to read `28`: the Space deselects and nothing is filtered. Restore the query by typing it again.
- **Proof.** Screenshot the populated result with the query visible (`shot --out "$RUN/shots/search-hit.png"`) and screenshot the empty state, and keep both asserted counts in the transcript.

## Gotchas

- The field updates after a 200 ms debounce. Wait on `.result-count`, never on a fixed delay.
- The counts above describe the seeded baseline. A captured note makes the kind word `note` match 2 instead of 1, and a captured quote changes nothing about `photography` but moves every total. `navigate` back to the run URL before relying on a count.
- There is no query syntax. `type:image`, `tag:research`, quotes, and `-exclude` are treated as literal text and will usually match nothing, in both the preview and the full app, even though the README advertises them. Verify what the README claims before believing it.
- In the full app the box sends the raw string to the backend (`search_items`, FTS5 `MATCH` with a `LIKE` fallback over title, description, source label, OCR text, and metadata). In the preview it is a case-insensitive substring test over title, description, source, kind, and tags. A query that works in one is not evidence for the other.
- OCR text, article body text, authors, and semantics are searchable only in the full app, where those fields exist.
- Pressing `/` while a field has focus types a slash into that field instead.
- Selecting a Space sets `activeSpaceId` and clears the typed query, so a "library total" read after opening a Space is the Space's count, not the library's.
