# Changelog

All notable development phases and changes are recorded here. See also [roadmap.md](roadmap.md) for what comes next.

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
- Browser-extension deep link (`mymind://capture?url=<url>`)
- Background job queue for async processing (`src-tauri/src/jobs.rs`)
- Thumbnail generation and content-addressed asset storage
- Safe embed allowlists (YouTube, Vimeo, direct media)
- Ingestion pipeline with HTML sanitization (`src/lib/ingestion/`)
- MIT License
