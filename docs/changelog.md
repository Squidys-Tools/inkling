# Changelog

Notable changes to inkling. [roadmap.md](roadmap.md) holds what comes next.

Rules for entries:

- Add an entry for a change someone using or building inkling would notice: features, fixes, performance, and anything others depend on staying stable, such as commands, config, environment variables or the IPC contract. Skip typo, formatting and comment-only changes.
- Group entries under `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated` or `Security` in the `Unreleased` section, following [Keep a Changelog](https://keepachangelog.com/). Move them under a version heading at release time.
- Write one line per entry, in plain technical terms, for a human reader. It is not a commit message or a list of files.
- End the entry with its issue, PR or ticket ID when there is one.
- Do not say who or what made the change, and do not make an entry sound bigger than the change.
- Append. Ask a maintainer before rewriting or reordering existing entries.

## Unreleased

### Added

- macOS disk images for Apple silicon Macs, with native window buttons, the standard app menu, `inkling://` links that reopen a closed window, screen capture through the system picker, and ⌘ in shortcut hints. They do not update themselves yet.
- Local-video posters on Debian/Ubuntu through the system decoder, with bounded background WebP compression and thumbnail cache revalidation.
- Stable / Beta and Nightly update channels, with separate verified download, cancellation and explicit installation on Windows and supported Linux packages.
- Linux `.deb` and AppImage builds with desktop/protocol integration, consent-based screen capture, and packaged native OCR/PDF/model checks.
- Right-click a card to read, open its link, copy its link, show it in its folder, or archive it, from a menu in the library's glass (#170)
- Buttons show a short label on hover or keyboard focus, in the same glass as the controls around them (#170)
- Settings → General → Open source licenses lists every shipped dependency, vendored component, and bundled model with its license text and source, searchable and filterable by license (#170)
- Settings → Appearance switches components between alternative looks while we compare them, the grid/list toggle as the current pill or a coss ui segmented control, and the sidebar button as buttons in the sidebar header and toolbar or a grip on the library frame's edge (#170)
- Ctrl+\ (⌘+\ on a Mac) shows or hides the sidebar (#170)
- First-run welcome flow on first launch of the installed app, replayable from Settings → General
- PDF cards now show page-one thumbnails generated in the background after capture; existing PDFs are backfilled one at a time when the job queue is idle.
- Chrome MV3 extension saves a page or right-clicked link through inkling's local capture receiver, with the existing capture link as fallback.
- `bun run ui:smoke` drives the core library flows in Electron against a scratch profile and fails on console errors
- Electron desktop shell alongside Tauri, with scoped `app://` assets, an IPC command allowlist, and `inkling://` capture links.
- Electron now opens the shared schema-v8 SQLite library with search, Spaces, archive, backup/restore, and a persisted job queue running local OCR, PDF extraction, and Nomic embeddings.
- Electron now accepts authenticated browser-extension saves over a loopback server and stores URL deep links before processing runs.
- Electron now ships with a Windows NSIS installer, bundled local models, and a generic GitHub Release update feed; unsigned installers and updates may trigger SmartScreen warnings.
- The packaged Tauri Windows app checks GitHub for signed updates at launch and offers user-controlled installation from the sidebar; its NSIS installer remains unsigned and may trigger a SmartScreen warning (SQU-16).
- Keyboard shortcuts for search, new-note capture, and shortcut help, with contained dialog focus and keyboard-operated Spaces and cards (SQU-19).
- Background OCR for older images and PDFs when first opened, with the mascot's quiet activity state reflecting the full job queue (SQU-5).
- Library export from Settings (Data tab): writes a dated folder with a consistent SQLite snapshot, the asset files the saved items reference, and a manifest of counts and sizes, after picking a destination folder in a native dialog.
- Library restore from Settings (Data tab) imports items, assets, and Spaces without replacing existing items, verifies hashes in new exports, and flags assets in older exports that cannot be verified (SQU-119).
- Browser extension store prep: Firefox MV3 manifest, local mascot icons, options token field, and store copy draft.
- Portable Windows PR previews build a self-contained review folder with pinned ONNX Runtime and embedding models, isolated database/assets/models, and a `preview:win` artifact link.
- Focus Mode for note writing expands the existing Tiptap Markdown editor into a full-screen, long-form surface with a fixed formatting and save bar; drafts and storage remain in the same note editor (SQU-2).
- Rich note editing with a lazy-loaded Tiptap Markdown editor inside the note detail overlay, plain-text search projection, body-aware FTS, and background re-embedding (SQU-1)
- Unit tests for the note card word-count logic, run via `bun test` in CI and the local frontend check
- Inkling mascot engine vendored from the MIT-licensed bloub avatar project (framework-free SVG morph engine only, no Vue shell) with a Paper-derived ink-blot shape (`inkling-splash`), a React mascot component wired into the sidebar brand mark (slow drift live, gentle sway under reduced motion, notification pastille while background work runs, sad eyes on capture errors), a dev-only board at `?mascot`, and frozen-frame SVGs under `docs/assets/mascots/`
- Sidebar mascot now commutes into the search field on focus (attentive, curious with a bob while typing) through one shared engine while the sidebar slot collapses so the wordmark slides over; the focused field shows only the mascot's eyes and the old static field equalizer is retired
- Five sidebar aliveness variations on a dev-only board at `?mascot-alive` (slow sway, jelly and slow spin as new looping engine states, a social state-cycler, and a cursor-tracking watcher), all reusing the vendored engine without touching measured states; drift stirs live wave amplitudes under a gaze pinned still, and all splash faces hold extra eye margin
- Contributor reference: `docs/operations/development.md` setup/checks/troubleshooting guide and a `docs/README.md` index mapping product, architecture, and operations docs
- Unified check scripts: `bun run check` (typecheck + unit tests), plus standalone `bun run typecheck` and `bun run knip:check`
- GitHub issue templates for bug reports and feature requests
- Unused-code backlog cleared and gated: dead exports stripped, unused `plugin-opener`/`regenerator-runtime` frontend dependencies pruned, orphaned helpers removed, and `knip:check` promoted to a hard gate in the CI frontend job
- Scheduled unused-code cleanup: `knip --fix` runs every other day on GitHub runners and opens a PR when it strips exports or prunes dependencies (file deletion stays manual, `knip.json` holds entry/project patterns)
- Weekly markdown link check on GitHub runners, opening an issue on broken links (local dev hosts and the `inkling://` scheme excluded)
- Committed web-preview demo library: 24 personal items (photos, art, UI references, one clip) plus four keepers from the original set, shuffled with a fixed seed so the order is mixed but stable; images live compressed by hand in `public/seed-demo/` with titles in `src/seedPersonal.ts`
- README screenshots of the visual library grid and the expanded item detail view, plus reserved slots for demo clips and upcoming mascots
- README shows the inkling mascot (idle, wink, wide, notify states sampled from the live engine via `bun scripts/mascot-board.ts`), and the desktop app icon is the idle mascot
- The README mascot is a creature rather than a pose: a looping SVG whose turn and lobe drift come from the sidebar's own drift state, whose eyes track and blink on the engine's own irregular calendar, and which moves through curious, happy, sleepy and attentive expressions, with a `prefers-reduced-motion` fallback that leaves the still
- Fixed the README mascot drifting off the page and disappearing mid-turn on some browsers: the turn is now baked into the path keyframes instead of a CSS `rotate()` on an ambiguous `transform-box: view-box` origin, and the loop point repeats the first outline so the seam stays invisible (#93)
- "Find similar" now works for text items, not just images: notes, quotes, articles, and saved links rank by their text embeddings across kinds, with the button offered in the expanded item view and a dedicated empty state while indexing finishes (#55)
- Regular Spaces: manual collections alongside saved searches. The Space create form chooses Smart or Regular, a Regular Space holds only the items you file into it from the expanded item view, and the chips there show current membership and take an item back out. Deleting a Space still leaves its items alone (SQU-4)
- The item count above the library rolls up when it first appears and replays when hovered, using the React Bits CountUp in compact format
- Liquid glass in the desktop app: the library toolbar, search chip and image zoom control refract what is behind them through WebGPU and Chromium's HTML-in-Canvas, and fall back to the CSS glass when either is unavailable (#170)
- File pickers, paste, and drag-and-drop import every selected file through one serial queue with progress and per-file errors, instead of keeping only the first; the pickers accept files of any type (#218)

### Fixed

- The desktop window stays frameless with rounded corners on Linux and relies on the in-app minimize/maximize/close controls instead of a competing native caption overlay (#212)
- Card clicks, right-clicks and the keyboard menu key reach cards again on runtimes where the experimental liquid-glass canvas swallows input: those runtimes keep the DOM/CSS glass (#205)
- The item details open and close as one motion: the item, its patterned background and the right panel move together instead of flying then settling separately (#205)
- Linux Electron image processing uses the supported sharp WASM backend, and PDF rendering loads bundled fonts without the native system-font scan that can crash the app.
- An open item takes over the whole library frame instead of floating inside it, so the grid/list toggle and the selected card no longer show around its edges, and its stage fills the frame with an even margin (#170)
- List view thumbnails fill rows that grow taller than the artwork, instead of leaving a strip at the bottom (#170)
- List view rows size to their text, so a tall photo or a short description no longer leaves a band of empty space above the footer (#170)
- The library's first row rests at the top of the frame, under the search chip, instead of scrolling down to a gap below the toolbar, and liquid glass starting up no longer resets the library's scroll position (#170)
- URL captures from Add, paste, deep links, and the browser extension now appear immediately and enrich the same item through the retryable local job queue.
- Image captures appear immediately: files travel to the backend as binary data instead of a number array, and the thumbnail is made by a background job that survives restarts instead of blocking the save.
- Local videos get a poster frame from a background job, so video cards no longer load the video file to show a frame, and a video without one shows the typed video card instead of an empty tile.
- Library files are streamed with byte-range support instead of being read whole into memory, so large videos and PDFs start sooner and videos can seek.
- The Settings Archive tab reads the archive only when it is opened and renders only the cards near the scroll position.
- Item processing status asks for only the latest job of each kind and no longer fails on very large libraries.
- When background work finishes, the library updates only the cards it touched instead of reloading every item, and the periodic safety refresh skips the reload when nothing in the library has changed.
- The installed app no longer crashes with "Cannot find module 'regenerator-runtime/runtime'" when OCR starts.
- A corrupt image now fails its OCR job quietly instead of opening a main-process error dialog.
- Finishing OCR no longer moves an image to the top of the library.
- The app no longer contacts Google Fonts or Twitter/X at startup: reader fonts are bundled with the app and the content security policy no longer allows Google Fonts requests
- X post embeds load the X widget only when the user clicks to load the post, so cards and saved links no longer contact X or Twitter on open
- The library bottom fade no longer shows a hard edge where the blur band starts or where it meets the padding below the grid: one blur layer feathers out through an eased mask, and a canvas-colored scrim dissolves content into the background at the grid's clip line (#149)
- A background job that hangs now fails after its type's time limit instead of stalling every job behind it
- Quitting while a job runs hands the job back without spending one of its retries, and a job that already finished is never redone
- Saving a URL retries rate limits and brief server errors, waiting at least as long as the site's Retry-After header asks, within the same 15-second budget
- The + Add tag button in the expanded item view meets the 24×24 px minimum touch target size (SQU-102).
- The "Web preview — sample data" badge no longer appears in the desktop app; it shows only in the browser preview.
- Window controls on Windows use the dark app palette instead of the system's light overlay strip in the top-right corner.
- Library export and restore use one parented native picker at a time and return focus to the main window after dismissal (SQU-120).
- Library export now returns an error when all available dated export directory names are taken, preserving earlier exports.
- Space and sidebar action failures now show action-specific, dismissible alerts beside the Spaces list without exposing backend error text (SQU-101).
- Restoring an item from the Archive within the ten-second undo window no longer destroys its files. The permanent delete removed an item's assets before checking whether the row was still archived, so a recovered item kept its row while losing its thumbnail, image, PDF or video from disk with no error shown. The check now runs first, and restoring cancels any delete still pending.
- Note previews and card word counts no longer mangle note text. The plain-text projection decoded no HTML entities, so a note containing pasted HTML showed `&lt;div&gt;` literally, which is exactly what the editor stores; it also deleted the words between angle brackets in ordinary prose, dropped the URL from autolinks, and stripped the underscores from identifiers like `foo_bar_baz`. It now agrees with that projection for entities, autolinks, angle brackets in prose and intraword underscores; block-level raw HTML and entities inside code spans still differ, as the code comments record.
- `bun run preview:win` no longer fails partway through packaging the portable Windows folder. Extracting the shared ONNX Runtime provisioning had left the portable script copying its bundled `onnxruntime.dll` from a path it had just deleted, so the build either failed on a fresh checkout or produced a folder missing its runtime.
- Shipped Windows builds no longer carry the ~9.7 MB committed demo seed: a new `bun run build:app` drops `public/seed-demo/` and the `src/seedPersonal.ts` bundle at build time and fails if either is still present, and the Tauri build uses it. The demo seed remains the default for the web preview and UI work (SQU-81).
- Tagged Windows releases now fetch and SHA-256 verify the pinned `onnxruntime.dll` before the installer is built, so a release no longer bundles without it and ships with embeddings and OCR that cannot load (SQU-78).
- Saved Spaces now restore reliably on a fresh app start instead of disappearing when their first read races storage initialization (SQU-7).
- The README mascot's body now moves exactly like the sidebar mascot's. It was running a separate copy of the sidebar drift with every period snapped to a divisor of 24 so the state would close on itself, which made the silhouette recur every 12s while the body took twice as long to come round. The loop never needed that — an SVG keyframe track already interpolates its last keyframe to the opening one — so both states now share one body (`inkling-drift-faced`) and the loop closes where it always was. The gaze wander stops being a second hand-rolled copy of `liveliness` for the same reason
- Portable Windows previews use the same Cargo output directory for building and packaging, even when `CARGO_TARGET_DIR` is set (#53).
- Tags added in item details now persist after restarting the app, keep the rest of the item's metadata intact, and no longer render twice in the detail overlay.
- Windows GNU toolchain can now build the app end to end (`export ordinal too large` in `tauri-plugin-mcp-bridge` fixed): the `--exclude-libs` linker workaround moved from `build.rs` (which only covered the top crate) to target-gated rustflags in `src-tauri/.cargo/config.toml` so it applies to every crate; verified with a full `cargo build --target x86_64-pc-windows-gnu` producing a working exe with the Common-Controls v6 manifest and `WebView2Loader.dll` beside it, and the README documents the no-admin GNU setup
- Pre-push frontend check installs dependencies with lifecycle scripts skipped, so pushing no longer triggers a nested `lefthook install` that clashed with the Entire hook wrapper and blocked `git push`
- Hook setup is now idempotent (`scripts/setup-hooks.ts` via `prepare`): routine installs leave Entire-wrapped lefthook hooks untouched, and linked worktrees share the main checkout's hooks so they need no setup
- Restoring an item from the archive is now silent: the card returning to the library is the confirmation, so no extra success toast appears
- Library export now keeps a completed snapshot when an asset cannot be copied, continues with the remaining files, and records each skipped path and error in `manifest.json`; the result card and toast show the skipped count.
- Browser extension parses untrusted extraction HTML with `DOMParser` instead of `innerHTML`, and the pending-capture queue is bounded by both entry count and byte budget so it cannot exhaust the browser storage quota
- Library reopen now detects and rebuilds a partial full-text index and recreates missing search triggers instead of trusting table existence; a healthy reopen still writes nothing
- Bulk archive restore fetches processing summaries in one batched query instead of one per item, and the asset URL cache now evicts least-recently-used entries so frequently viewed covers survive large imports
- Note bodies are only derived from legacy fields once per schema upgrade instead of on every app start, a failed note save no longer leaves an unsaved draft in the in-memory body cache, and switching away from a note while its content is loading no longer leaves the note stuck on "Loading note…" (SQU-1)
- Search and preview text built from Markdown no longer loses inline spacing, so bold, links, and inline code sit in words the way they were written, task markers are removed by the Markdown parser instead of by string matching so a note that writes `[x]` or `[ ]` as prose keeps its brackets, and a line broken with a raw `<br>` no longer welds the words on either side together (SQU-1)
- The note editor drops its duplicate title block and the green content panel for one quiet `Editing · title` line and a single control lane beside Save, with icon controls for quote, code block, undo, and redo, and a link field that can edit or remove a link instead of a system prompt; the control lane is pinned to the bottom of the frame while the writing surface takes the space above it and scrolls on its own (SQU-1)
- While a note is being written, scrolling, resizing, and a click on the library — empty space or another card — no longer throw the draft away: the press is absorbed rather than cancelling the note, moving the panel to another card, or pressing whatever sits behind it, so the close button, Escape and Save are the ways out (SQU-1)
- Escape inside the note editor's link field, or inside the detail view's new-tag field, now cancels only that field instead of leaving the note editor or closing the panel (SQU-1)
- Deleting from the archive, one item or a selection, now hides the cards immediately and keeps them recoverable for ten seconds behind an Undo action before the delete is finalized
- The Electron Windows desktop app window can now be resized below 1000×800; its minimum size is now 320×360, the narrowest width the stylesheet supports
- Free-text search returns only items whose text matches or whose meaning is close to the query, instead of every item in the library; semantic matches below a 0.55 cosine similarity are dropped
- List view rows for notes, quotes, and videos sit in the same thumbnail column as other items, the quote text no longer overlaps itself, and the video play control sits on the thumbnail.
- The browser extension's failure badge is no longer cleared by an earlier save's success timer

### Changed

- Linting and formatting moved from Biome to oxlint and oxfmt, with a lint rule that rejects over-long comments, section dividers, and suppressions without a reason.
- The interface is rebuilt on Tailwind CSS and Base UI primitives, split into feature folders with no visible change; tabs and menus now take one Tab stop and move with the arrow keys, and Escape in a menu closes only that menu (SQU-124)
- Add opens in place into a small menu of Note, Link, Quote, File and Screen, after Viora UI's Create New Disclosure, replacing the capture dialog and the extra Add button in the library toolbar (#170)
- The sidebar closes from a button beside the inkling wordmark, shown while the pointer is over it, and reopens from a glass button at the left of the library toolbar, replacing the tab on the frame's edge (#170)
- Library list IPC sends card fields only; reader content is loaded from SQLite when opened.
- Library cards load remote images in CORS mode and the desktop app adds a CORS header to image responses, so the liquid glass canvas can draw them; no extra requests are made (#170)
- Switching between grid and list fades the cards out and pops the new view in, list rows top to bottom and grid cards from the top left, instead of morphing each card between layouts (#170)
- Add moves to the foot of the sidebar, with a round + in the toolbar while the sidebar is closed, and the grid/list toggle floats at the bottom centre of the library. The back and forward buttons are gone; the mouse side buttons and Alt+Left/Right still step through history (#170)
- Electron defers canvas system-font loading until PDF work runs; BMP and ICO thumbnails use canvas without loading system fonts.
- Library cards form a denser masonry grid with tighter gutters and natural media proportions; note and quote previews stay readable, while list and Archive views keep their existing geometry.
- Desktop window opens at 1280 × 720 instead of 1000 × 800; the 320 × 360 minimum size is unchanged.
- Developer experience: `tsc-rs` is the blocking typecheck gate for the root, benchmark, extension, and ingestion-shared projects, including the build scripts, and real `tsc` runs as a non-blocking CI canary (`typecheck:tsc`).
- Developer commands share one namespace: `dev:app` runs the desktop app, `build:installer` builds the Windows installer, and `check` runs every gate; the old `electron:*`, `check:frontend`, and `knip:check` names are removed.
- Biome now formats and lints project files locally, and frontend CI enforces those checks (#109).
- Paper Mono is now the default interface typeface, bundled locally under the SIL Open Font License.
- GitHub Actions moved off paid Blacksmith runners to the free GitHub-hosted ones
- CI now lints Rust with `cargo clippy --all-targets -- -D warnings`, typechecks the extension and shared package workspaces, builds the browser extension, and verifies the Bun version pin; frontend paths under `extension/` and `packages/` trigger the frontend job
- Toasts restyled as a catalog drawer slip for Undo actions and a compact ink-slip chip for success/error (shared palette, plain content, HugeIcons close control, top-right entry/exit, 5s status auto-dismiss, persistent Undo) (SQU-6)
- CI, CodeQL, dependency review, and labeled preview builds now skip documentation-only and demo-data-only follow-up pushes while still running for mixed changes.
- Desktop window enforces a 1000 × 800 minimum size so the library layout remains usable when resized.
- README rewritten as a user-facing overview (tour, screenshots, demo/mascot placeholders, FAQ) with the developer setup and docs index moved to a short section at the end
- CI and security workflows skip docs-only changes and run only the jobs whose paths changed (frontend vs. native vs. dependencies), cutting redundant check runs on documentation pushes
- `bun run check:frontend` now includes `knip:check` (same order as the CI frontend job), so unused-code failures surface locally before push
- Local hooks removed by policy: `lefthook.yml`, the `lefthook` dependency, `scripts/setup-hooks.ts`, and the dead `.githooks/` shims are gone — `bun install` is hook- and script-free, and CI (including `cargo fmt --check`) owns all gates
- Roadmap Milestone 3 notes the already-registered `update_space`, `enqueue_ocr_job`, and `count_active_jobs` Tauri commands waiting for UI
- Pull request template checklist now asks for checks run and a changelog entry alongside UI screenshots/video
- README documentation links point at the docs index, contributing guide, and development reference
- Security scans stay fail-closed on pull requests: CodeQL runs on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only; the path-filter action is pinned to a commit SHA and automation config (`.entire/`) never skips checks
- Note cards reuse the PDF thumbnail artwork (pointillism texture, label/mark/title/legend geometry), showing the note title and description word count where PDFs show the document title and page count
- Faster cold boot with no visual changes: the PDF viewer, reader, item overlay, and dev-only mascot boards now load on first open instead of at startup (boot JavaScript down from ~1269 kB to ~808 kB), shell fonts load via parallel stylesheet links instead of a render-blocking import, search waits 200 ms after typing before querying, and background refresh pauses while the window is hidden
- Library refresh is now push-driven: the background job worker emits a job event when work starts, progresses, or finishes, and the UI refreshes on those events instead of re-fetching the whole library every second (a 30-second fallback and refresh-on-restore survive a missed event); captures, deletes, and archive actions already updated instantly from local state
- Spaces can be renamed (inline), recolored (click the dot to cycle), and reordered (hover up/down controls), closing the one-way door on a misspelled Space name; reorder runs through a new atomic `swap_space_positions` command so it can never half-apply
- Library opens faster on large libraries: the full-text index is built once on first run instead of being wiped and rebuilt every launch, and background job restarts no longer pay a reindex on their 5-second wake cycle (measured ~655 ms to ~16 ms to reopen a 1,000-item database)
- Library refresh costs two backend round trips instead of one per item: a new `get_jobs_for_items` command returns every item's processing jobs in a single query, and resolved asset URLs are cached so unchanged paths skip the repeat resolve
- Archive now lives in Settings instead of the sidebar, and the settings modal uses theme variables instead of hardcoded colors
- `bun run check` installs dependencies with the lockfile frozen first, so lockfile drift fails locally the way it fails in the CI frontend job
- Library grid and list views soften into a progressive blur at the top edge, under the search bar, and the bottom edge, down to the window's last pixel; both stay in place while scrolling
- The desktop storage layer is split into one module per domain (items, jobs, Spaces, search, enrichment, import and export) with no change to the library file or its schema (SQU-125)
- The desktop backend is TypeScript built on Effect: storage runs on Effect's SQLite client, background jobs on Effect workers, URL downloads on Effect's HTTP client, and every IPC command is checked against one shared schema before it reaches storage
- Restarting the app hands back every job the previous run left in progress, instead of waiting out its five-minute lease
- The desktop shell runs on Electron 45 (Chromium 156, Node 24.22) instead of Electron 44 (#186)

### Removed

- Tauri and Rust desktop shell/build removed; Electron is now the only desktop app.
- Unused Penpot design folder (`pen/`); CI/security path filters no longer ignore it
- Lefthook dependency, hook installer, and local formatting and frontend-check Git hooks. Entire continues to manage its own hooks.
- Dead `note-art` / `note-pin` / `note-scribble` card styles left over from the note thumbnail reuse
- WiX MSI installer target. Windows releases build the NSIS installer only, which is the one Tauri's updater can replace in place (SQU-80).
- Entire session-tracking setup: `.entire/` config, agent hooks for Claude Code, Codex and OpenCode, and the Git hooks it installed.

### Security

- Source links must be HTTP or HTTPS: edits reject other values, imports drop them, and the reader only links web addresses.

---

## Phase 5 -- Reading and Writing (Aug 25, 2026)

### Added

- Video link cards: saved YouTube and Vimeo links are recognized at capture time, promoted to Video items with provider-canonicalized embeds and derived poster images
- Play overlay, scrim, and provider badge on video cards in the library grid
- Click-to-play embed player in the item inspector for YouTube/Vimeo links; native `<video>` playback for uploaded video files

---

## Phase 4 -- PDF, Embeddings, CI (Aug 17-18, 2026)

**PR #10** -- PDF pipeline, embeddings, CI automation, Windows fixes.

### Added

- Nomic Embed Text v1.5 and Vision v1.5 local ONNX inference with shared 768-dimensional search space
- Automatic first-run download and cache of the published INT8 Nomic model artifacts
- PDF text extraction and scanned-page OCR on Windows
- Local deterministic text and image embeddings
- Job progress tracking with UI feedback
- GitHub Actions CI, release, and security workflows
- Windows PDF pipeline integration tests
- Dependabot configuration

### Fixed

- Windows PDF loading from file streams
- WinRT lifetime management for PDF rendering on Windows
- OCR decoder stream kept open during processing
- Search prioritization for pending jobs and FTS match qualification

---

## Phase 3 -- Background OCR (Aug 15, 2026)

**PR #3** -- Background image OCR processing.

### Added

- Background image OCR processing pipeline
- Persisted job queue with worker lease management
- Recovery of interrupted OCR jobs

### Fixed

- OCR lease renewal during long-running processing
- Worker lease protection for concurrent OCR jobs

---

## Phase 2 -- Benchmarks and Extraction Quality (Aug 14, 2026)

**PR #2** -- Extraction fixes, multi-engine OCR, live fixtures.

### Added

- Multi-engine OCR scoring (Windows OCR + tesseract.js, best result kept)
- Live MacRumors article fixtures
- Legible meme and scanned-PDF benchmark fixtures

### Fixed

- JSON-LD metadata extraction for articles
- Noscript fallback text extraction
- Byline author extraction
- Token multiplicity counting in OCR scoring

**PR #1** -- Benchmark corpus and harness.

### Added

- Benchmark corpus harness with 48-item test set
- Corpus of articles, images, screenshots, PDFs, notes, and videos
- Expected outputs for extraction and OCR scoring
- Baseline results: 0.992 overall score
- Benchmark harness typecheck in build pipeline

---

## Phase 1 -- Bootstrap (Aug 13-14, 2026)

### Added

- Project initialization with Tauri 2, React, TypeScript, Vite
- Local library shell inspired by mymind UI
- SQLite storage with FTS5 full-text search
- URL and file capture pipeline with article extraction (Defuddle + fallback)
- File picker, drag-and-drop, clipboard, and screenshot capture
- Browser-extension deep link (`inkling://capture?url=<url>`)
- Background job queue for async processing
- Thumbnail generation and content-addressed asset storage
- Safe embed allowlists (YouTube, Vimeo, direct media)
- Ingestion pipeline with HTML sanitization
- MIT License
