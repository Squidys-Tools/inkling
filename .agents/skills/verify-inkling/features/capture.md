# Capture an item

Capture is how anything enters the library. The Add menu writes a note, quote, link, or file. Paste, drag and drop, the screenshot picker, the browser extension, and `inkling://capture` use the same pipeline. Link capture waits for extraction before adding its card.

## Sub-features

- `capture-open` opens the Add menu and its five choices.
- `capture-note` saves a typed note and shows its card in the library.
- `capture-quote` saves quote text, attribution, and an optional source URL.
- `capture-link` extracts a readable URL into an Article, Video, or Post card.
- `capture-file` offers an image, PDF, or video file picker.
- `capture-counts` raises the total `.nav-count`; `.result-count` follows it only when no search or Space filter is active.
- `capture-failure` keeps a failed form open and shows the reason.
- `capture-cancel` returns to the choices and closes the menu without saving.
- `capture-ambient` handles paste, drag and drop, screenshot selection, the deep link, and extension delivery.

## How to get to it (user POV)

- Choose `Add` in the capture bar, then choose a kind.
- Paste outside an input, textarea, or editable element.
- Drag a file or URL onto the library window.
- Choose `Screenshot` and pick a window or display.
- Use the extension's page-save action or its fallback deep link.
- Follow `inkling://capture?url=...` from the desktop app's protocol handler.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve --mode dev` and `start` run, then run `doctor` with `.result-count` reading `28`.
- Run the steps in order. Search filters the grid, and Add closes after a successful save.
- The preview keeps captures in memory. Use `navigate` to reset them.

- **Open the menu.** Run `text --selector ".result-count"` and expect `28`. Click `.add-button`, wait for `.capture-modal`, and read `Note`, `Link`, `File`, `Quote`, and `Screenshot`.
- **Capture a note.** Click `Note` within `.capture-modal`, wait for `[aria-label="New note"]`, and type `verification note 9f3a` with `type`. Click `.capture-save`, then wait for the modal to disappear and `.result-count` to equal `29`. Read `.nav-count` and assert a mounted card contains `verification note 9f3a`.
- **Find the new card.** Type `verification note 9f3a` into `[aria-label="Search your mind"]` and wait for `.result-count` to equal `1`. Assert `.nav-count` stays `29`: the toolbar count is filtered, the sidebar count is the library total. Clear the field and wait for `29`.
- **Cancel.** Reopen Add, choose `Note`, type `discard me`, and choose `Back`. The editor disappears but the choices remain, and re-entering `Note` brings the draft back. Choose `Close add menu`, wait for the modal to disappear, and assert the count is still `29` with no `discard me` card.
- **Capture a quote.** Reopen Add and choose `Quote`. Fill `[aria-label="Quote text"]`, `[aria-label="Quote attribution"]`, and `[aria-label="Quote source URL"]`. Save and wait for `.result-count` to equal `30`. Read the first mounted `.card-kicker span` and expect `Quote`.
- **Capture a failed link.** Clear search and wait for `30`. Reopen Add, choose `Link`, enter `https://example.com`, and save. Wait for `.capture-error`. The form stays open, the count stays `30`, and the alert says the page could not be downloaded. This CORS failure is expected in the preview.
- **Proof.** Save `capture-before.png` before the note and `capture-after.png` after it. Keep the count, card, and search assertions.

## Gotchas

- Preview capture never writes SQLite. Prove the in-memory count, card, and search result.
- `type` replaces the field content. If clearing with an empty string does not update the controlled input, use `Clear search` and record that route.
- A readable link can become an Article, Video, or Post. The preview's browser `fetch` commonly fails on CORS. A native run is required to assess successful extraction.
- Screenshot selection needs a real display picker, and the menu closes before it opens. The harness cannot choose a display.
- Paste needs OS clipboard content and Ctrl+V. Drag and drop needs a native file or `DataTransfer`. The file picker needs `DOM.setFileInputFiles`. This harness has none of those commands.
- Deep-link setup is skipped in seed mode, and the harness disables extensions. Verify these paths in the desktop app and an extension-enabled browser.
- A note whose text looks like a URL is captured as a link card, not a Note. Use plain prose for Note assertions.
- The extension tries its local receiver first, then a queued payload and deep link. The background registers selection, image, and video context-menu items, but the current manifest loads no `content_scripts` and never injects the collector, so report those routes as unavailable.
