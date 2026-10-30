# Roadmap

The checked items reflect shipped work. See [changelog.md](changelog.md) for completed work and [bugs.md](bugs.md) for defects that are still open.

## Milestone 0 -- Capture and storage

**Status: Complete**

Local library with capture, extraction, and text search.

- [x] Project scaffold (Electron, React, TypeScript, Vite, SQLite)
- [x] URL capture with Defuddle article extraction + fallback metadata
- [x] File picker, drag-and-drop, clipboard, screenshot capture
- [x] Browser-extension deep link (`inkling://capture?url=...`)
- [x] SQLite storage with FTS5 full-text search
- [x] Thumbnail generation and per-item asset storage
- [x] Background job queue with lease management and recovery
- [x] Safe embed allowlists (YouTube, Vimeo, direct media)
- [x] HTML sanitization and security

## Milestone 1 -- Vision and semantics

**Status: Complete**

Vertical slice from capture through semantic understanding and search.

- [x] Benchmark corpus (48 items, articles/images/screenshots/PDFs/notes/videos)
- [x] Multi-engine OCR scoring (Windows OCR + tesseract.js)
- [x] Background image OCR processing
- [x] PDF text extraction and scanned-page OCR
- [x] CI, release, and security automation
- [x] Nomic learned embedding models through ONNX Runtime
- [x] Semantic search over text and images
- [x] Image similarity search
- [x] Smart Spaces (auto-updating saved searches)

## Milestone 2 -- Reading and writing

**Status: Complete**

Content consumption and creation experiences.

- [x] Distraction-free article reader with clean typography
- [x] Focus Mode for long-form writing
- [x] Rich note editor (headings, bold, links, todos)
- [x] Quote cards with source attribution
- [x] Video link cards with previews
- [x] PDF viewer with page navigation

## Milestone 3 -- Rediscovery

**Status: Complete**

Surfacing forgotten material through browsing and curation.

- [x] Trash and recoverable archive
- [x] Space management (create, rename, reorder, recolor, delete)
- [x] Regular Spaces (manual collections)
- [x] Surface background OCR for existing images and PDFs in the UI (SQU-5)
- [x] Export and backup (database snapshot + referenced assets + manifest)
- [x] Import and restore from an export (SQU-119)

## Milestone 4 -- Local intelligence

**Status: Not Started**

On-device AI for summaries and deeper understanding.

- [ ] llama.cpp integration for local summaries
- [ ] Automatic concept extraction from images and articles
- [ ] Structured analysis of saved content
- [ ] Model selection across CPU, standard, and GPU modes

## Milestone 5 -- Polish and distribution

**Status: In Progress**

Production readiness and first release.

- [x] First-run onboarding (local-first, AI, export)
- [x] Keyboard-first operation across all surfaces
- [ ] Accessibility audit (contrast, focus indicators, screen readers)
- [x] Windows installer and update mechanism (SQU-16)
- [ ] Web version portability (frontend + domain boundaries)
- [ ] Performance and refactoring pass, then establish the frontend bundle-size baseline and add a bundle-size PR comment check (deferred until the bundle is feature-complete; `pdfjs-dist` / `tesseract.js` chunking is the main risk)
