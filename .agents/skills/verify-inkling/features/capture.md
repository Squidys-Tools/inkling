# Capture an item

Capture is how anything enters the library. The Add menu writes a note, quote, link, or file. Pasting, dropping a file or URL, the screenshot picker, the browser extension, and the `inkling://capture` deep link reach the same capture pipeline without the menu. A successful menu capture adds an item; link capture waits for extraction before it adds the card.

## Sub-features

- `capture-open` opens the Add menu and its five choices.
- `capture-note` saves a typed note and shows its card in the library.
- `capture-quote` saves quote text, attribution, and an optional source URL.
- `capture-link` extracts a URL into an Article, Video, or Post card when the source is readable.
- `capture-file` offers an image, PDF, or video file picker.
- `capture-counts` moves `.result-count` and the active navigation count together.
- `capture-failure` keeps a failed form open and shows the reason.
- `capture-cancel` returns to the choices and closes the menu without saving.
- `capture-ambient` handles clipboard paste, drag and drop, screenshot selection, the deep link, and extension delivery.

## How to get to it (user POV)

- Choose `Add` in the capture bar, then choose a kind.
- Paste outside an input, textarea, or editable element.
- Drag a file or URL onto the library window.
- Choose `Screenshot` and pick a window or display.
- Use the browser extension's page-save action or follow its fallback deep link.
- Follow `inkling://capture?url=...` from the desktop app's registered protocol handler.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- Run the steps in order. Search filters the grid, and the Add menu closes after a successful save.
- The preview keeps captures in memory. Use a new navigation to reset them.

- **Open the menu.** Run `text --selector ".result-count"` (expect `28`), `click --selector ".add-button"`, and `wait --selector ".capture-modal"`. Read the five choices: `Note`, `Link`, `File`, `Quote`, and `Screenshot`.
- **Capture a note.** Run `click --within ".capture-modal" --text "Note"`, wait for `[aria-label="New note"]`, and type `verification note 9f3a` with `type --selector '[aria-label="New note"]' --text "verification note 9f3a"`. Choose `Save to library` with `click --selector ".capture-save"`, then wait for `!document.querySelector(".capture-modal")` and `.result-count` to equal `29`. Read `.nav-count` and assert that a rendered card contains `verification note 9f3a`.
- **Find the new card.** Type `verification note 9f3a` into `[aria-label="Search your mind"]` and wait for `.result-count` to equal `1`. Clear the field with `type --selector '[aria-label="Search your mind"]' --text ""` and wait for `29`.
- **Cancel.** Reopen Add, choose `Note`, type `discard me`, and choose `Back`. The editor disappears but the choices remain. Choose `Close add menu`, wait for the modal to disappear, and assert that the count is still `29` and no card contains `discard me`.
- **Capture a quote.** Reopen Add and choose `Quote`. Fill `[aria-label="Quote text"]`, `[aria-label="Quote attribution"]`, and `[aria-label="Quote source URL"]`, then choose `Save to library`. Wait for the modal to close and `.result-count` to equal `30`. Read the first rendered `.card-kicker span` and expect `Quote`; the parent kicker also contains the relative date.
- **Capture a failed link.** Clear the search field with `type --selector '[aria-label="Search your mind"]' --text ""` and wait for `30`. Reopen Add, choose `Link`, type `https://example.com` into `[aria-label="URL to save"]`, and choose `Save to library`. Wait for `.capture-error`. The form stays open, the count stays `30`, and the alert says the page could not be downloaded. This CORS failure is the expected preview result.
- **Proof.** Save `capture-before.png` before the first save and `capture-after.png` after the note. Keep the count and card assertions in the transcript.

## Gotchas

- Preview capture never writes SQLite. Prove the in-memory count, card, and search result.
- `type` replaces the field content. If clearing with an empty string does not update the controlled input, use the visible `Clear search` action in the empty state and record that route instead.
- A link can become an Article, Video, or Post. The preview's browser `fetch` commonly fails on CORS; do not call that a product failure without a native run.
- Screenshot selection needs a real display picker, and the menu closes before that picker opens. The browser harness cannot choose a display.
- Paste needs OS clipboard content and Ctrl+V. Drag and drop needs a native file or `DataTransfer`; the file picker needs `DOM.setFileInputFiles`. The harness has none of those commands.
- Deep-link setup is skipped in seed mode, and the harness launches the browser with extensions disabled. Verify those paths in the desktop app and a separately extension-enabled browser.
- The extension tries its local receiver first and falls back to a queued payload plus a deep link. Its selection, image, and video context-menu collectors are not loaded by the current manifest, so report those paths as unavailable rather than verified.
