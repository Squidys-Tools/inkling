# Changelog

All notable development phases and changes are recorded here. See also [roadmap.md](roadmap.md) for what comes next.

The best times to update this file so as to minimize friction while working with a developer or contributor are:
1. When completing a medium-large implementation pass of features, bug fixes, performance enhancements, refactoring updates, or likewise changes
2. The user indicates, whether directly or indirectly through their actions, they want to or are going to finish up the local work and merge the changes afterwards
3. Before starting a new, unrelated task — close out the entry for the work just finished rather than letting it blur or get jumbled into the next thing
4. When a change alters public behavior: API contracts, CLI flags, config options, env vars; anything a user of the project depends on being stable

Changelog entry format: 

- Follow [Keep a Changelog](https://keepachangelog.com/): group entries under `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated`, `Security`.
- Each entry is one line, written for a human reader — what changed in simple technical terms that someone could understand with simple google searches, not a commit message or file diff summary.
- Reference issue/PR numbers or ticket IDs when they exist
- Keep an `Unreleased` section at the top; move entries under a version heading at release time

Guardrails:
- Never mention that changes were made by an AI agent or even a developer — write entries as if the changes were just made
- Don't editorialize or pad entries to look more substantial than the change was
- If a change is trivial (typo fix, formatting, comment-only), skip the changelog — not every commit needs an entry
- Ask before rewriting or reordering existing changelog history when you notice it is drifting from the required structure; only append.
- When restructuring this document NO important/crucial/technical details should be lost



## Unreleased

### Added

- Article cards without an Open Graph image get a host-derived placeholder: a deterministic hue tinted by the source hostname, and a seal badge that shows the site favicon when the capture pipeline found one (else the host initial) instead of a fixed letter (`src/components/ItemMedia.tsx`, `src/App.css`, `src/App.tsx`, `src/lib/ingestion/`, `packages/ingestion-shared/`, `extension/`, `src-tauri/src/capture_server.rs`, `src-tauri/src/storage.rs`)
- Library export from Settings (Data tab): writes a dated folder with a consistent SQLite snapshot, the asset files the saved items reference, and a manifest of counts and sizes, after picking a destination folder in a native dialog.
- Browser extension store prep: Firefox MV3 manifest, local mascot icons, options token field, and store copy draft (`extension/`).
- Portable Windows PR previews build a self-contained review folder with pinned ONNX Runtime and embedding models, isolated database/assets/models, and a `preview:win` artifact link.
- Serendipity now walks through older saves one at a time, with Keep and recoverable Forget actions, session-safe batching, and a clear end state (SQU-3).
- Rich note editing with a lazy-loaded Tiptap Markdown editor inside the note detail overlay, plain-text search projection, body-aware FTS, and background re-embedding (SQU-1)
- Unit tests for the note card word-count logic, run via `bun test` in CI and the local frontend check (`src/components/ItemMedia.test.ts`)
- Inkling mascot engine vendored from the MIT-licensed bloub avatar project (framework-free SVG morph engine only, no Vue shell) with a Paper-derived ink-blot shape (`inkling-splash`), a React mascot component wired into the sidebar brand mark (slow drift live, gentle sway under reduced motion, notification pastille while background work runs, sad eyes on capture errors), a dev-only board at `?mascot`, and frozen-frame SVGs under `docs/assets/mascots/` (`src/components/mascot/`, `scripts/mascot-board.ts`)
- Sidebar mascot now commutes into the search field on focus (attentive, curious with a bob while typing) through one shared engine while the sidebar slot collapses so the wordmark slides over; the focused field shows only the mascot's eyes and the old static field equalizer is retired (`src/App.tsx`, `src/App.css`)
- Five sidebar aliveness variations on a dev-only board at `?mascot-alive` (slow sway, jelly and slow spin as new looping engine states, a social state-cycler, and a cursor-tracking watcher), all reusing the vendored engine without touching measured states; drift stirs live wave amplitudes under a gaze pinned still, and all splash faces hold extra eye margin (`src/components/mascot/AliveBoard.tsx`)
- Contributor reference: `docs/operations/development.md` setup/checks/troubleshooting guide and a `docs/README.md` index mapping product, architecture, and operations docs
- Unified check scripts: `bun run check` (typecheck + unit tests), plus standalone `bun run typecheck` and `bun run knip:check`
- GitHub issue templates for bug reports and feature requests (`.github/ISSUE_TEMPLATE/`)
- Unused-code backlog cleared and gated: dead exports stripped, unused `plugin-opener`/`regenerator-runtime` frontend dependencies pruned, orphaned helpers removed, and `knip:check` promoted to a hard gate in the CI frontend job
- Scheduled unused-code cleanup: `knip --fix` runs every other day on GitHub runners and opens a PR when it strips exports or prunes dependencies (file deletion stays manual, `knip.json` holds entry/project patterns) (`.github/workflows/knip.yml`, `knip.json`)
- Weekly markdown link check on GitHub runners, opening an issue on broken links (local dev hosts and the `inkling://` scheme excluded) (`.github/workflows/links.yml`, `.lycheeignore`)
- Committed web-preview demo library: 24 personal items (photos, art, UI references, one clip) plus four keepers from the original set, shuffled with a fixed seed so the order is mixed but stable; images live compressed by hand in `public/seed-demo/` with titles in `src/seedPersonal.ts` (`src/seedPersonal.ts`, `src/App.tsx`, `public/seed-demo/`)
- README screenshots of the visual library grid and the expanded item detail view (`docs/assets/screenshots/library.png`, `docs/assets/screenshots/detail.png`), plus reserved slots for demo clips (`docs/assets/demo/`) and upcoming mascots (`docs/assets/mascots/`)
- README shows the inkling mascot (idle, wink, wide, notify states sampled from the live engine via `bun scripts/mascot-board.ts`), and the desktop app icon is the idle mascot (`README.md`, `src-tauri/icons/`)
- The README mascot is a creature rather than a pose: a looping SVG whose turn and lobe drift come from a new `inkling-drift-loop` state, whose eyes track and blink on the engine's own irregular calendar, and which moves through curious, happy, sleepy and attentive expressions, the sidebar drift re-timed onto a period it can actually repeat, with a `prefers-reduced-motion` fallback that leaves the still (`src/components/mascot/readmeMascot.ts`, `src/components/mascot/bot/states.ts`, `docs/assets/mascots/inkling-splash-loop.svg`)
- Fixed the README mascot drifting off the page and disappearing mid-turn on some browsers: the turn is now baked into the path keyframes instead of a CSS `rotate()` on an ambiguous `transform-box: view-box` origin, and the loop point repeats the first outline so the seam stays invisible (`src/components/mascot/readmeMascot.ts`, `docs/assets/mascots/inkling-splash-loop.svg`) (#93)

- "Find similar" now works for text items, not just images: notes, quotes, articles, and saved links rank by their text embeddings across kinds, with the button offered in the expanded item view and a dedicated empty state while indexing finishes (`src/App.tsx`, `src/components/ExpandedItemOverlay.tsx`, `src/lib/libraryApi.ts`, `src-tauri/src/storage.rs`) (#55)
- Regular Spaces: manual collections alongside saved searches. The Space create form chooses Smart or Regular, a Regular Space holds only the items you file into it from the expanded item view, and the chips there show current membership and take an item back out. Deleting a Space still leaves its items alone (SQU-4, `src-tauri/src/storage.rs`, `src/App.tsx`, `src/components/ExpandedItemOverlay.tsx`)
- Top of Mind: items can be pinned and unpinned from their details view, and the Top of mind view collects them. That view explains itself when nothing is pinned yet, and the main library stays a plain list of everything (SQU-9) (`src/App.tsx`, `src/components/ExpandedItemOverlay.tsx`)

### Changed

- GitHub Actions moved off paid Blacksmith runners to the free GitHub-hosted ones (`.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`)
- CI now lints Rust with `cargo clippy --all-targets -- -D warnings`, typechecks the extension and shared package workspaces, builds the browser extension, and verifies the Bun version pin; frontend paths under `extension/` and `packages/` trigger the frontend job (`.github/workflows/ci.yml`)
- Toasts restyled as a catalog drawer slip for Undo actions and a compact ink-slip chip for success/error (shared palette, plain content, HugeIcons close control, top-right entry/exit, 5s status auto-dismiss, persistent Undo) (SQU-6, `src/App.tsx`, `src/App.css`)
- CI, CodeQL, dependency review, and labeled preview builds now skip documentation-only and demo-data-only follow-up pushes while still running for mixed changes.
- Desktop window enforces a 1000 × 800 minimum size so the library layout remains usable when resized.
- README rewritten as a user-facing overview (tour, screenshots, demo/mascot placeholders, FAQ) with the developer setup and docs index moved to a short section at the end (`README.md`)
- CI and security workflows skip docs-only changes and run only the jobs whose paths changed (frontend vs. native vs. dependencies), cutting redundant check runs on documentation pushes (`.github/workflows/ci.yml`, `.github/workflows/security.yml`)
- `bun run check:frontend` now includes `knip:check` (same order as the CI frontend job), so unused-code failures surface locally before push
- Local hooks removed by policy: `lefthook.yml`, the `lefthook` dependency, `scripts/setup-hooks.ts`, and the dead `.githooks/` shims are gone — `bun install` is hook- and script-free, and CI (including `cargo fmt --check`) owns all gates
- Roadmap Milestone 3 notes the already-registered `update_space`, `enqueue_ocr_job`, and `count_active_jobs` Tauri commands waiting for UI
- Pull request template checklist now asks for checks run and a changelog entry alongside UI screenshots/video
- README documentation links point at the docs index, contributing guide, and development reference
- Security scans stay fail-closed on pull requests: CodeQL runs on open/reopen and roughly every 4th push, dependency review on every PR; path gating applies to push-to-main only; the path-filter action is pinned to a commit SHA and automation config (`.entire/`) never skips checks (`.github/workflows/security.yml`)
- Note cards reuse the PDF thumbnail artwork (pointillism texture, label/mark/title/legend geometry), showing the note title and description word count where PDFs show the document title and page count (`src/components/ItemMedia.tsx`, `src/App.tsx`)
- Faster cold boot with no visual changes: the PDF viewer, reader, item overlay, and dev-only mascot boards now load on first open instead of at startup (boot JavaScript down from ~1269 kB to ~808 kB), shell fonts load via parallel stylesheet links instead of a render-blocking import, search waits 200 ms after typing before querying, and background refresh pauses while the window is hidden (`src/App.tsx`, `src/App.css`, `index.html`, `vite.config.ts`)
- Library refresh is now push-driven: the background job worker emits a job event when work starts, progresses, or finishes, and the UI refreshes on those events instead of re-fetching the whole library every second (a 30-second fallback and refresh-on-restore survive a missed event); captures, deletes, and archive actions already updated instantly from local state (`src-tauri/src/jobs.rs`, `src-tauri/src/lib.rs`, `src/App.tsx`)
- Spaces can be renamed (inline), recolored (click the dot to cycle), and reordered (hover up/down controls), closing the one-way door on a misspelled Space name; reorder runs through a new atomic `swap_space_positions` command so it can never half-apply (`src/App.tsx`, `src/App.css`, `src/lib/libraryApi.ts`, `src-tauri/src/storage.rs`)
- Library opens faster on large libraries: the full-text index is built once on first run instead of being wiped and rebuilt every launch, and background job restarts no longer pay a reindex on their 5-second wake cycle (measured ~655 ms to ~16 ms to reopen a 1,000-item database) (`src-tauri/src/storage.rs`)
- Library refresh costs two backend round trips instead of one per item: a new `get_jobs_for_items` command returns every item's processing jobs in a single query, and resolved asset URLs are cached so unchanged paths skip the repeat resolve (`src-tauri/src/jobs.rs`, `src/lib/libraryApi.ts`, `src/lib/assetUrlCache.ts`, `src/App.tsx`)
- Archive now lives in Settings instead of the sidebar, and the settings modal uses theme variables instead of hardcoded colors (`src/App.tsx`, `src/App.css`)

### Removed

- Unused Penpot design folder (`pen/`); CI/security path filters no longer ignore it
- Lefthook dependency, hook installer, and local formatting and frontend-check Git hooks. Entire continues to manage its own hooks.
- Dead `note-art` / `note-pin` / `note-scribble` card styles left over from the note thumbnail reuse (`src/App.css`)
- WiX MSI installer target. Windows releases build the NSIS installer only, which is the one Tauri's updater can replace in place (SQU-80).

### Fixed

- An image the app could not finish saving now says so on the item instead of looking like a saved picture. A capture is acknowledged before its slow work runs, so a failed download or a full image queue used to leave a card holding nothing and no way to tell (`src-tauri/src/capture_server.rs`, `src-tauri/src/storage.rs`, `src/App.tsx`, `src/components/ExpandedItemOverlay.tsx`)
- A capture the app permanently rejects is no longer retried forever. A media save whose image host answers with something that is not an image used to be queued as if delivery were merely delayed, so every flush retried it, held the queue lock, and eventually pushed older pending captures out of the bounded queue; the extension now reports it failed instead (`extension/src/transport.ts`, `extension/src/background.ts`)
- A page can no longer forge a capture. The extractor used to mirror its result into the page's DOM as a fallback, and a page could plant that node to make the extension save a URL of its choosing; extraction now travels only over the isolated world, which page script cannot reach
- The capture server no longer moves to a different port when its saved one is taken. The extension keeps posting the bearer token to the stored address, so it refused to start and reports "not running" instead of handing the token to whatever is listening there
- A selection, image, or video captured while the app is closed is queued for delivery instead of being discarded, like a page capture
- Video background enrichment no longer overwrites a title the user has already edited: it only fills fields the capture originally stored
- Article cards render only the locally cached favicon, so opening the library no longer contacts the saved site's server and discloses what is being viewed
- A quote saved from the browser context menu keeps the page title as its attribution instead of plain text alone
- Deleting an item while its favicon is downloading no longer recreates the deleted item's asset directory
- Captures work on networks that intercept TLS. The fetcher trusted only Mozilla's bundled certificate list, so any host outside that snapshot failed with `UnknownIssuer` and image saves were rejected; it now trusts the OS certificate store, the same one the browser uses, with chain validation unchanged (`src-tauri/Cargo.toml`, `src-tauri/src/http_fetch.rs`)
- Images saved from the browser extension are OCR'd like images saved in the app, so text inside a saved picture is indexed and searchable again. The extension path enqueued only an embedding job (`src-tauri/src/capture_server.rs`, `src-tauri/src/jobs.rs`)
- Saved video cards show the video's own thumbnail again. A video page's `og:image` is the provider's logo, so the card was rendering the YouTube wordmark; the poster derived from the video id now outranks the page image (`src/lib/ingestion/video-links.ts`, `src/App.tsx`)
- A rejected extension capture now says why. A failed image download answered a bare `422` that the extension reported as `HTTP 422`, and the app's body claimed unavailable storage; the real reason (host refused, non-image content type, over the size cap) travels back to the popup (`src-tauri/src/capture_server.rs`, `extension/src/transport.ts`)
- Extension and deep-link URL captures no longer fail with "The page could not be downloaded": the desktop app downloads pages through Rust instead of the webview (avoiding CORS), keeps a provisional URL card when download or extraction still fails, and preserves the extension title on that card (`src-tauri/src/http_fetch.rs`, `src/lib/tauriFetch.ts`, `src/App.tsx`, `src/lib/deepLink.ts`)
- Captured article favicons are cached as local assets in the background, so the card seal loads reliably without depending on the remote site (`src-tauri/src/http_fetch.rs`, `src-tauri/src/storage.rs`, `src-tauri/src/capture_server.rs`, `src/App.tsx`, `src/lib/libraryApi.ts`)
- Browser page captures no longer fall back to an `inkling://` deep link when the local receiver is unavailable, avoiding the operating system confirmation prompt; failed deliveries stay queued for a later retry (`extension/src/background.ts`, `extension/src/transport.ts`)
- The local extension receiver now supports a native in-app connection test and answers Private Network Access preflights, so paired browser saves can reach the running companion without relaxing browser origin checks (`src-tauri/src/capture_server.rs`, `src/App.tsx`)
- Source links in the expanded item overlay and reader footer open in the system browser again (webview `window.open` was a no-op; now routed through the opener plugin) (`src/lib/openExternalUrl.ts`)
- Browser extension pairing survives app restarts: the capture server rebinds its last successful loopback port when that port is free (when the saved port is taken it refuses to start instead of moving to a new one, as above), and Settings → Extension now shows a copyable app address for the extension's base URL field (`src-tauri/src/capture_server.rs`, `src/App.tsx`, `src/lib/libraryApi.ts`)
- Restoring an item from the Archive within the ten-second undo window no longer destroys its files. The permanent delete removed an item's assets before checking whether the row was still archived, so a recovered item kept its row while losing its thumbnail, image, PDF or video from disk with no error shown. The check now runs first, and restoring cancels any delete still pending (`src-tauri/src/storage.rs`, `src/App.tsx`).
- Note previews and card word counts no longer mangle note text. The plain-text projection decoded no HTML entities, so a note containing pasted HTML showed `&lt;div&gt;` literally, which is exactly what the editor stores; it also deleted the words between angle brackets in ordinary prose, dropped the URL from autolinks, and stripped the underscores from identifiers like `foo_bar_baz`. It now agrees with that projection for entities, autolinks, angle brackets in prose and intraword underscores; block-level raw HTML and entities inside code spans still differ, as the code comments record (`src/lib/notes.ts`).
- `bun run preview:win` no longer fails partway through packaging the portable Windows folder. Extracting the shared ONNX Runtime provisioning had left the portable script copying its bundled `onnxruntime.dll` from a path it had just deleted, so the build either failed on a fresh checkout or produced a folder missing its runtime.
- Shipped Windows builds no longer carry the ~9.7 MB committed demo seed: a new `bun run build:app` drops `public/seed-demo/` and the `src/seedPersonal.ts` bundle at build time and fails if either is still present, and the Tauri build uses it. The demo seed remains the default for the web preview and UI work (SQU-81).
- Tagged Windows releases now fetch and SHA-256 verify the pinned `onnxruntime.dll` before the installer is built, so a release no longer bundles without it and ships with embeddings and OCR that cannot load (SQU-78).
- Saved Spaces now restore reliably on a fresh app start instead of disappearing when their first read races storage initialization (SQU-7).
- Portable Windows previews use the same Cargo output directory for building and packaging, even when `CARGO_TARGET_DIR` is set (#53).
- Tags added in item details now persist after restarting the app, keep the rest of the item's metadata intact, and no longer render twice in the detail overlay.
- Windows GNU toolchain can now build the app end to end (`export ordinal too large` in `tauri-plugin-mcp-bridge` fixed): the `--exclude-libs` linker workaround moved from `build.rs` (which only covered the top crate) to target-gated rustflags in `src-tauri/.cargo/config.toml` so it applies to every crate; verified with a full `cargo build --target x86_64-pc-windows-gnu` producing a working exe with the Common-Controls v6 manifest and `WebView2Loader.dll` beside it, and the README documents the no-admin GNU setup (`src-tauri/.cargo/config.toml`, `src-tauri/build.rs`, `README.md`)
- Pre-push frontend check installs dependencies with lifecycle scripts skipped, so pushing no longer triggers a nested `lefthook install` that clashed with the Entire hook wrapper and blocked `git push`
- Hook setup is now idempotent (`scripts/setup-hooks.ts` via `prepare`): routine installs leave Entire-wrapped lefthook hooks untouched, and linked worktrees share the main checkout's hooks so they need no setup
- Restoring an item from the archive is now silent: the card returning to the library is the confirmation, so no extra success toast appears
- Library export now keeps a completed snapshot when an asset cannot be copied, continues with the remaining files, and records each skipped path and error in `manifest.json`; the result card and toast show the skipped count.
- Browser extension parses untrusted extraction HTML with `DOMParser` instead of `innerHTML`, and the pending-capture queue is bounded by both entry count and byte budget so it cannot exhaust the browser storage quota
- Browser extension page save no longer fails with "page extraction produced no usable content": the isolated-world extractor parks its payload promise where the background can await it, so a successful extraction surfaces the page instead of `undefined` (#60)
- Pairing token now lives beside the library via the same directory resolver as `initialize_storage`, instead of only when `library.sqlite3` already exists — moving or deleting the database no longer silently regenerates the token in a different folder
- `inkling://` deep links are registered with the OS at startup so extension Save can hand off to a running desktop app (previously only installer builds registered the scheme, leaving dev sessions with no protocol handler) (`src-tauri/src/lib.rs`)
- Library reopen now detects and rebuilds a partial full-text index and recreates missing search triggers instead of trusting table existence; a healthy reopen still writes nothing (`src-tauri/src/storage.rs`)
- Bulk archive restore fetches processing summaries in one batched query instead of one per item, and the asset URL cache now evicts least-recently-used entries so frequently viewed covers survive large imports (`src/App.tsx`, `src/lib/assetUrlCache.ts`)
- Note bodies are only derived from legacy fields once per schema upgrade instead of on every app start, a failed note save no longer leaves an unsaved draft in the in-memory body cache, and switching away from a note while its content is loading no longer leaves the note stuck on "Loading note…" (SQU-1)
- Search and preview text built from Markdown no longer loses inline spacing, so bold, links, and inline code sit in words the way they were written, task markers are removed by the Markdown parser instead of by string matching so a note that writes `[x]` or `[ ]` as prose keeps its brackets, and a line broken with a raw `<br>` no longer welds the words on either side together (SQU-1)
- The note editor drops its duplicate title block and the green content panel for one quiet `Editing · title` line and a single control lane beside Save, with icon controls for quote, code block, undo, and redo, and a link field that can edit or remove a link instead of a system prompt; the control lane is pinned to the bottom of the frame while the writing surface takes the space above it and scrolls on its own (SQU-1)
- While a note is being written, scrolling, resizing, and a click on the library — empty space or another card — no longer throw the draft away: the press is absorbed rather than cancelling the note, moving the panel to another card, or pressing whatever sits behind it, so the close button, Escape and Save are the ways out (SQU-1)
- Escape inside the note editor's link field, or inside the detail view's new-tag field, now cancels only that field instead of leaving the note editor or closing the panel (SQU-1)
- Deleting from the archive, one item or a selection, now hides the cards immediately and keeps them recoverable for ten seconds behind an Undo action before the delete is finalized (`src/App.tsx`)

---

## Phase 5 -- Reading and Writing (Aug 25, 2026)

### Added

- Video link cards: saved YouTube and Vimeo links are recognized at capture time, promoted to Video items with provider-canonicalized embeds and derived poster images (`src/lib/ingestion/video-links.ts`)
- Play overlay, scrim, and provider badge on video cards in the library grid
- Click-to-play embed player in the item inspector for YouTube/Vimeo links; native `<video>` playback for uploaded video files

---

## Phase 4 -- PDF, Embeddings, CI (Aug 17-18, 2026)

**PR #10** -- PDF pipeline, embeddings, CI automation, Windows fixes.

### Added

- Nomic Embed Text v1.5 and Vision v1.5 local ONNX inference with shared 768-dimensional search space
- Automatic first-run download and cache of the published INT8 Nomic model artifacts
- PDF text extraction and scanned-page OCR on Windows (`src-tauri/src/pdf.rs`)
- Local deterministic text and image embeddings (`src-tauri/src/embeddings.rs`)
- Job progress tracking with UI feedback
- GitHub Actions CI, release, and security workflows (`.github/workflows/`)
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

- Benchmark corpus harness with 48-item test set (`benchmarks/harness/`)
- Corpus of articles, images, screenshots, PDFs, notes, and videos (`benchmarks/corpus/`)
- Expected outputs for extraction and OCR scoring (`benchmarks/expected/`)
- Baseline results: 0.992 overall score (`benchmarks/results/summary.md`)
- Benchmark harness typecheck in build pipeline

---

## Phase 1 -- Bootstrap (Aug 13-14, 2026)

### Added

- Project initialization with Tauri 2, React, TypeScript, Vite
- Local library shell inspired by mymind UI
- SQLite storage with FTS5 full-text search (`src-tauri/src/storage.rs`)
- URL and file capture pipeline with article extraction (Defuddle + fallback)
- File picker, drag-and-drop, clipboard, and screenshot capture
- Browser-extension deep link (`inkling://capture?url=<url>`)
- Background job queue for async processing (`src-tauri/src/jobs.rs`)
- Thumbnail generation and content-addressed asset storage
- Safe embed allowlists (YouTube, Vimeo, direct media)
- Ingestion pipeline with HTML sanitization (`src/lib/ingestion/`)
- MIT License
