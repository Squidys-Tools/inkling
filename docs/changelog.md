# Changelog

Notable changes to inkling, one section per release. [roadmap.md](roadmap.md) holds what comes next.

Rules for entries:

- Write the changelog when a release is cut, not in each PR. The person cutting the release starts from the notes `gh release create --generate-notes` drafts from merged PR titles, keeps what someone using or building inkling would notice, and adds the section here above the previous one.
- Cover features, fixes, performance, and anything others depend on staying stable, such as commands, config, environment variables or the IPC contract. Skip refactors, CI, typos, formatting and comment-only changes. Nightlies get no entry.
- Group entries under `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated` or `Security`, following [Keep a Changelog](https://keepachangelog.com/).
- Write one line per entry, in plain technical terms, for a human reader. It is not a commit message or a list of files. End it with its PR number when there is one.
- Do not say who or what made the change, and do not make an entry sound bigger than the change.
- A release section is a record. Do not rewrite or reorder it after the release is published.

Nothing has been published yet, so everything so far sits under `Unreleased`. Rename it to the version and date when the first release goes out. Detail older than this summary is in `git log` and the merged PRs.

## Unreleased

### Added

- Electron desktop app for Windows, macOS (Apple silicon) and Linux (`.deb` and AppImage), with `inkling://` capture links, a scoped `app://` asset protocol and an IPC allowlist. Windows gets an NSIS installer, Linux gets desktop and protocol integration and consent-based screen capture, and macOS gets native window buttons and screen capture through the system picker.
- Alpha and Nightly update channels with verified download, cancellation and explicit installation on Windows and supported Linux packages. macOS builds do not update themselves yet.
- First-run welcome flow on first launch of the installed app, replayable from Settings → General.
- Capture from the Add menu (Note, Link, Quote, File, Screen), paste, drag and drop, the `inkling://capture` deep link, and the Chrome MV3 extension through a local loopback receiver. Files from pickers, paste and drop import through one serial queue with progress and per-file errors.
- Video link cards for YouTube and Vimeo with click-to-play embeds, and local video posters, including on Debian/Ubuntu through the system decoder.
- PDF cards with page-one thumbnails generated in the background, and background OCR and indexing of older images and PDFs.
- Rich note editing in a Tiptap Markdown editor with a full-screen Focus Mode, plain-text search projection, body-aware search and background re-embedding.
- Regular Spaces next to Smart Spaces, with rename, recolor and reorder. Deleting a Space keeps its items.
- "Find similar" for text items as well as images, across kinds.
- Smart Spaces named for photo subjects, such as "Cats", show photos of those subjects.
- Library export and restore from Settings → Data: export writes a dated folder with a consistent SQLite snapshot, the referenced assets and a manifest, and restore merges items, assets and Spaces without replacing existing items and verifies hashes in new exports.
- Right-click menu on cards, hover labels on buttons, Ctrl+\ (⌘+\ on a Mac) to show or hide the sidebar, and keyboard shortcuts for search, new note and shortcut help.
- Settings → Your library shows what the library holds as a bar and a legend with each card kind's count and share (#248).
- Settings → General → Open source licenses lists every shipped dependency, vendored component and bundled model with its license and source.
- The ink-blot mascot in the sidebar and README, with calm, busy and sad states, and eyes that move into the search field on focus.
- A marketing site in `apps/site` with home, features, privacy and download pages.
- Benchmark corpus and harness for extraction and OCR quality (`bun run bench`).

### Changed

- The app runs as three processes, main, library and worker, so a long OCR or embedding job no longer slows a search. The library file and asset layout are unchanged.
- Search returns only items whose text matches or whose meaning is close to the query, instead of every item; semantic matches below a 0.55 cosine similarity are dropped.
- Images become searchable about three times faster: four jobs run at once and share a pool of two to four OCR workers that shuts down after 30 idle seconds, using a few hundred megabytes more memory while indexing (#224).
- The library opens faster and refreshes less: the full-text index is built once instead of every launch, list IPC sends card fields only, reader content loads when opened, and the UI refreshes from job events instead of re-fetching every second.
- Cold start loads less: the PDF viewer, reader and item overlay load on first open, and background refresh pauses while the window is hidden.
- The library is a denser masonry grid with natural media proportions, a progressive blur at its edges, and a grid/list toggle that animates between views. Archive lives in Settings.
- The grid/list toggle and the sidebar button moved into the library's floating glass controls, and an open item takes over the whole library frame (#170).
- Paper Mono is the default interface typeface, bundled locally under the SIL Open Font License.
- Restarting hands back every job the previous run left in progress instead of waiting out its five-minute lease.
- The back and forward buttons are gone; the mouse side buttons and Alt+Left/Right still step through history.
- Note cards reuse the PDF thumbnail artwork and show the note's word count.
- The window opens at 1280 × 720 and can be resized down to 320 × 360.
- Developer commands were consolidated to 15 scripts: `dev:app` runs the desktop app, `dist [dir|win|linux|mac]` builds installers, `bench [frames|library|first-page|quality]` runs the benchmarks, `check` runs every gate, and `build:web` builds the web preview.

### Fixed

- Embedded videos in the reader and item view play in the desktop app: the `app://` page cannot send an http(s) Referer, which YouTube answers with error 153, so the main process names the app's site on player requests that carry no referrer of their own (#241).
- Captures appear immediately: URLs and images show up at once and are enriched or thumbnailed by retryable background jobs that survive restarts, and videos get their poster frame from a background job.
- A hung background job fails after its type's time limit instead of stalling every job behind it. Quitting while a job runs hands the job back without spending a retry, and a finished job is never redone.
- Restoring an item from the Archive within the ten-second undo window no longer deletes its files, and archive deletes stay recoverable behind Undo for ten seconds.
- Library files are streamed with byte-range support, so large videos and PDFs start sooner and videos can seek.
- The library reopens safely: a partial full-text index is detected and rebuilt, missing search triggers are recreated, and a healthy reopen writes nothing.
- Library export keeps a completed snapshot when an asset cannot be copied and records each skipped path in `manifest.json`.
- Note text is no longer mangled: previews and word counts decode HTML entities, keep angle brackets, autolinks and intraword underscores, and keep Markdown inline spacing.
- The note editor keeps a draft through scrolling, resizing and clicks on the library, and Escape inside the link or tag field cancels only that field.
- Tags added in item details persist across restarts and no longer render twice.
- Saving a URL retries rate limits and brief server errors, honoring the site's Retry-After header within a 15-second budget.
- The app no longer contacts Google Fonts or Twitter/X on open: reader fonts are bundled and X post embeds load only when the user clicks.
- The search field shows both of the mascot's eyes while jobs run, after a failed capture and with reduced motion (#227), and the README mascot animates in Safari and iOS (#232).
- Card clicks, right-clicks and the menu key reach cards on runtimes where the experimental liquid-glass canvas swallowed input (#205).
- Linux uses the supported sharp WASM image backend and loads bundled PDF fonts without the system-font scan that could crash the app (#212).
- Windows window controls use the dark app palette, and the installed app no longer crashes with "Cannot find module 'regenerator-runtime/runtime'" when OCR starts.
- A corrupt image fails its OCR job quietly instead of opening an error dialog, and finishing OCR no longer moves an image to the top of the library.
- A `updates.json` holding unexpected JSON uses the default update preferences instead of turning updates off.
- Library exports record the version of inkling that wrote them in `manifest.json`.

### Removed

- The Tauri and Rust desktop shell. Electron is the only desktop app.
- The WiX MSI target. Windows builds the NSIS installer only.

### Security

- Source links must be HTTP or HTTPS: edits reject other values, imports drop them, and the reader only links web addresses.
- Browser extension parses untrusted extraction HTML with `DOMParser`, and its pending-capture queue is bounded by entry count and byte budget.

## Early development (Aug 13–25, 2026)

The first builds, on Tauri 2, React and SQLite. Everything here was rebuilt on Electron later.

- Local library shell with SQLite storage and FTS5 search, content-addressed asset storage and thumbnails.
- Capture from the file picker, drag and drop, clipboard, screenshot and the `inkling://capture?url=` link, with article extraction, HTML sanitizing and a safe embed allowlist for YouTube, Vimeo and direct media.
- A persisted background job queue with leases and recovery of interrupted jobs.
- Local OCR on Windows scored across engines, PDF text extraction with scanned-page OCR, and Nomic Embed Text and Vision v1.5 embeddings in one 768-dimensional search space, downloaded on first run.
- A 48-item benchmark corpus with expected outputs, scoring 0.992 overall at baseline.
- Video link cards for YouTube and Vimeo, with an embed player in the item view.
- GitHub Actions CI, release and security workflows. MIT license.
