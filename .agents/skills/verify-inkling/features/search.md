# Search the library

Search is the organizer: the user describes what they want and the library answers with cards. Typing filters the preview immediately, the toolbar names the query, and a search can become a Smart Space that keeps matching new items.

## Sub-features

- `search-focus` focuses the field through the `/` shortcut.
- `search-match` narrows the grid as the query changes.
- `search-context` reports the count and query and offers `Save as Space`.
- `search-empty` shows `Nothing surfaced yet.` when nothing matches.
- `search-clear` restores the full library.
- `search-space` opens a saved search and clears the ad-hoc query.

## How to get to it (user POV)

- Type in the search field in the capture bar.
- Press `/` when focus is not on an `<input>`.
- Open a Space in the sidebar to run its saved query.
- Choose `Clear search` in the empty state to return to Everything.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- The seed has 12 `photography` matches, 6 `reference` matches, 3 `japan` matches, 1 `research` match, and 1 `note` match. These are fixture expectations, not query syntax rules.

- **Focus by shortcut.** Run `key --key Slash`, then evaluate `document.activeElement?.getAttribute("aria-label")`. Expect `Search your mind`.
- **Match text.** Type `photography` into `[aria-label="Search your mind"]` and wait for `.result-count` to equal `12`. Assert `.search-context` contains `photography` and `.save-space-link` exists.
- **Match metadata.** Replace the query with `note` and wait for `.result-count` to equal `1`. The preview uses case-insensitive substring matching over title, description, source, kind, and tags. This result depends on the seed.
- **Show the empty state.** Replace the query with `zzzznothing`, wait for `.result-count` to equal `0`, and wait for `.empty-state`. Read `Nothing surfaced yet.` and `Clear search`.
- **Clear.** Click `Clear search` within `.empty-state`, then wait for an empty input and `.result-count` to equal `28`. `type --selector '[aria-label="Search your mind"]' --text ""` is the alternate clear path.
- **Open a Space.** Type `photography` and wait for `12`. Click `Design references` within `.space-list`. The input clears, the Space is selected, and `.result-count` becomes `6`. Click `Everything` within the main navigation and wait for `28`.
- **Proof.** Save `search-hit.png` and `search-empty.png`. Keep the counts and query text in the transcript.

## Gotchas

- The preview filters immediately. Only the native request uses the 200 ms debounce, so wait for the value.
- There is no query parser. `type:`, `tag:`, quotes, and exclusion syntax are plain text here. Do not present them as supported filters.
- The preview searches title, description, source, kind, and tags. Native search uses backend FTS, fallback text matching, and semantic results. A preview match does not prove OCR, article body, author, or semantic search.
- The `/` handler suppresses the shortcut only for `<input>`. A focused `<textarea>` can have its slash intercepted.
- Selecting a Space sets its query and clears the search box. `.result-count` then describes the Space, not the whole library.
- Every preview mutation is in memory. Navigate back to the run URL before relying on baseline counts.
