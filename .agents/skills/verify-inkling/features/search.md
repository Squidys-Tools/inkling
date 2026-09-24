# Search the library

Search is the organizer: the user describes what they want and the library answers with cards. Typing filters the preview immediately, the toolbar names the active query, and a search can become a Smart Space that keeps matching new items.

## Sub-features

- `search-focus` focuses the field, including through the `/` shortcut.
- `search-match` narrows the grid as the query changes.
- `search-context` reports the count and active query and offers `Save as Space`.
- `search-empty` shows `Nothing surfaced yet.` for a query with no matches.
- `search-clear` restores the full library.
- `search-space` opens a saved search from the sidebar and clears the ad-hoc query.

## How to get to it (user POV)

- Type in the search field in the capture bar.
- Press `/` when focus is not on an `<input>`.
- Open a Space in the sidebar to run its saved query.
- Choose `Clear search` in the empty state to return to Everything.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- The seeded preview contains 12 `photography` matches, 6 `reference` matches, 3 `japan` matches, 1 `research` match, and 1 `note` match. These are seed-data expectations, not query syntax rules.

- **Focus by shortcut.** Run `key --key Slash`, then `eval --expr 'document.activeElement?.getAttribute("aria-label")'`. Expect `Search your mind`.
- **Match text.** Run `type --selector '[aria-label="Search your mind"]' --text "photography"` and wait for `.result-count` to equal `12`. Assert that `.search-context` contains `photography` and that `.save-space-link` exists.
- **Match metadata.** Replace the query with `note` and wait for `.result-count` to equal `1`. The preview uses a case-insensitive substring over title, description, source, kind, and tags; this result is a property of the seed data, not a type filter.
- **Show the empty state.** Replace the query with `zzzznothing`, wait for `.result-count` to equal `0`, and wait for `.empty-state`. Read `Nothing surfaced yet.` and the `Clear search` action.
- **Clear.** Choose `Clear search` with `click --within ".empty-state" --text "Clear search"`, then wait for an empty input and `.result-count` to equal `28`. You can also clear a populated field with `type --selector '[aria-label="Search your mind"]' --text ""`; the empty-state button is the deterministic user path.
- **Open a Space.** Type `photography` and wait for `12`. Choose `Design references` with `click --within ".space-list" --text "Design references"`. The input clears, the Space becomes selected, and `.result-count` becomes `6`. Choose `Everything` in `nav[aria-label="Main navigation"]` and wait for `28`.
- **Proof.** Save `search-hit.png` and `search-empty.png` in the run's `shots` directory, and keep the asserted counts and query text in the transcript.

## Gotchas

- The preview filters immediately. Only the native backend request uses the 200 ms debounce, so wait on the value rather than a fixed delay.
- There is no query parser. `type:`, `tag:`, quotes, and exclusion syntax are plain text here. Do not present them as supported filters.
- The preview searches title, description, source, kind, and tags. Native search uses the backend's FTS, fallback text matching, and semantic results. A preview match does not prove OCR, article-body, author, or semantic search.
- The `/` handler suppresses the shortcut only when the active element is an `<input>`. A focused `<textarea>` can have its slash intercepted, so do not describe the shortcut as active on every text field.
- Selecting a Space sets its query and clears the search box. `.result-count` then describes the Space, not the whole library.
- Every preview mutation is in memory. Navigate back to the run URL before relying on the baseline count.
