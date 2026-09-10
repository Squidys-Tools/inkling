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

- Unit tests for the note card word-count logic, run via `bun test` in CI and the local frontend check (`src/components/ItemMedia.test.ts`)

### Changed

- CI and security workflows skip docs-only changes and run only the jobs whose paths changed (frontend vs. native vs. dependencies), cutting redundant check runs on documentation pushes (`.github/workflows/ci.yml`, `.github/workflows/security.yml`)
- Security scans stay fail-closed on pull requests: CodeQL and dependency review always run the full matrix there, with path gating applied to push-to-main only; the path-filter action is pinned to a commit SHA and automation config (`.entire/`) never skips checks (`.github/workflows/security.yml`)
- Note cards reuse the PDF thumbnail artwork (pointillism texture, label/mark/title/legend geometry), showing the note title and description word count where PDFs show the document title and page count (`src/components/ItemMedia.tsx`, `src/App.tsx`)

### Removed

- Dead `note-art` / `note-pin` / `note-scribble` card styles left over from the note thumbnail reuse (`src/App.css`)
### Fixed

- Pre-push frontend check installs dependencies with lifecycle scripts skipped, so pushing no longer triggers a nested `lefthook install` that clashed with the Entire hook wrapper and blocked `git push`
- Hook setup is now idempotent (`scripts/setup-hooks.ts` via `prepare`): routine installs leave Entire-wrapped lefthook hooks untouched, and linked worktrees share the main checkout's hooks so they need no setup

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
- Browser-extension deep link (`inkling://capture?url=<url>`; earlier `mymind://` links remain supported)
- Background job queue for async processing (`src-tauri/src/jobs.rs`)
- Thumbnail generation and content-addressed asset storage
- Safe embed allowlists (YouTube, Vimeo, direct media)
- Ingestion pipeline with HTML sanitization (`src/lib/ingestion/`)
- MIT License
