# Capture an item

Capture is how anything enters the library. The Add menu writes a note, quote, link, or file; pasting, dropping, the screenshot picker, and the `inkling://capture` deep link reach the same pipeline without the menu. The card is supposed to appear immediately, and a failed save is supposed to keep what the user typed.

## Sub-features

- `capture-open` opens the Add menu and its five choices.
- `capture-note` saves a typed note and shows its card first in the library.
- `capture-quote` saves a quote with attribution and an optional source URL.
- `capture-link` fetches a URL, extracts an article, and drops an Article or Video card.
- `capture-file` saves an image, PDF, or video through the picker.
- `capture-counts` moves `.result-count` and `.nav-count` together.
- `capture-failure` keeps the menu open and shows the reason when a save fails.
- `capture-cancel` closes the menu without saving.

## How to get to it (user POV)

- Choose `Add` in the capture bar.
- Paste from the clipboard while focus is outside a text field.
- Drag a file or a URL onto the window.
- Choose `Screenshot` in the Add menu and pick a window or display.
- Follow `inkling://capture?url=...` from the browser extension.

## Driving it with harness.mjs

Preconditions:

- A healthy run per [SKILL.md](../SKILL.md), `doctor` passing, `.result-count` reading `28`.
- Nothing typed in the search box: the search box filters the grid, so a stale query sends the count in the wrong direction.

- **Open the menu.** Choose `Add`. Run `text --selector ".result-count"` (expect `28`), then `click --selector ".add-button"` and `wait --selector ".capture-modal"`. The dialog `Add to your library` appears with `Note`, `Link`, `File`, `Quote`, and `Screenshot`.
- **Choose a kind.** Select `Note`. Run `click --within ".capture-modal" --text "Note"` and `wait --selector '[aria-label="New note"]'`. The modal's text now ends with `New note Back Save to library` (its own heading stays `Add to your library`) and the field has focus.
- **Enter content.** Type a title unique to this run, for example `verification note 9f3a`. Run `type --selector '[aria-label="New note"]' --text "verification note 9f3a"`. The field value is the typed text; before capture the library count is unchanged.
- **Save.** Choose `Save to library`. Run `click --selector ".capture-save"` and `wait --expr '!document.querySelector(".capture-modal")'`. The menu closes.
- **Confirm the card.** Run `text --selector ".result-count"` (expect `29`), `eval --expr 'document.querySelector(".nav-item .nav-count").textContent'` (expect `29`, so the sidebar agrees), and `eval --expr 'document.querySelector(".library-card").textContent.includes("verification note 9f3a")'` (expect `true`, the new card is first). `eval --expr 'document.querySelector(".capture-error")?.textContent ?? null'` stays `null`.
- **Confirm it is searchable.** Run `type --selector '[aria-label="Search your mind"]' --text "verification note 9f3a"` and `wait --expr 'document.querySelector(".result-count")?.textContent === "1"'`. `.result-context` holds `1 items in libraryfor “verification note 9f3a”` plus `Save as Space`: `innerText` glues `items in library` to `for “…”`, and the quotes are typographic, so assert on `for “` and the token, not on one exact sentence.
- **Cancel.** Open the menu, choose `Note`, type `discard me`, then `click --within ".capture-modal" --text "Back"` followed by `click --selector '[aria-label="Close add menu"]'`. No `discard me` card exists and the count is unchanged.
- **Quote shape.** Repeat with `Quote`: fill `[aria-label="Quote text"]`, `[aria-label="Quote attribution"]`, and optionally `[aria-label="Quote source URL"]`, save, and read the new card's `.card-kicker span` for the `Quote` label (the kicker also holds the relative date, so its own `textContent` reads `QuoteJust now`).
- **Failed save.** Clear the search box first (`type --selector '[aria-label="Search your mind"]' --text ""`, then `wait --expr 'document.querySelector(".result-count")?.textContent === "29"'`), then capture a link: `click --within ".capture-modal" --text "Link"`, `type --selector '[aria-label="URL to save"]' --text "https://example.com"`, `click --selector ".capture-save"`. The menu stays open, `.capture-error` reads `Couldn’t save this yet: The page could not be downloaded.` (typographic apostrophe), the same string is inside the modal's `[role="alert"]`, and the count does not move.
- **Proof.** Screenshot before and after with `shot --out "$RUN/shots/capture-before.png"` and `shot --out "$RUN/shots/capture-after.png"`, and keep the asserted counts in the transcript.

## Gotchas

- Capture does not touch the database in the preview; the proof is the in-memory count and card, not SQLite.
- `type` replaces the field's content, so capturing the same title twice is fine. Clear the search box with `type --selector '[aria-label="Search your mind"]' --text ""` before re-reading a library total.
- The card assertion must run right after the save: the grid re-sorts, and a card that scrolled out of the rendered window is missing from the DOM even though the item exists.
- Link capture downloads over the page's own `fetch` in the preview, so most sites fail on CORS with `The page could not be downloaded.`. This is expected here and is not a regression — verify URL capture in the desktop app, and treat the failure state itself as the preview-verifiable behavior.
- `Screenshot` needs a real display picker and the keyboard `/` shortcut is inactive while a field has focus; neither is scripted by this harness. Exercise them by hand and say so.
- A paste proof needs OS clipboard content. Set the clipboard yourself, put focus outside the capture and search fields, and press Ctrl+V, or report paste as not covered.
