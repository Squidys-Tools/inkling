# Roadmap

Current status as of August 2026. See [changelog.md](changelog.md) for completed work.

## Milestone 0 -- Capture and Storage

**Status: Complete**

Local library with capture, extraction, and text search.

- [x] Project scaffold (Tauri 2, React, TypeScript, Vite, SQLite)
- [x] URL capture with Defuddle article extraction + fallback metadata
- [x] File picker, drag-and-drop, clipboard, screenshot capture
- [x] Browser-extension deep link (`mymind://capture?url=...`)
- [x] SQLite storage with FTS5 full-text search
- [x] Thumbnail generation and content-addressed asset storage
- [x] Background job queue with lease management and recovery
- [x] Safe embed allowlists (YouTube, Vimeo, direct media)
- [x] HTML sanitization and security

## Milestone 1 -- Vision and Semantics

**Status: Complete**

Vertical slice from capture through semantic understanding and search.

- [x] Benchmark corpus (48 items, articles/images/screenshots/PDFs/notes/videos)
- [x] Multi-engine OCR scoring (Windows OCR + tesseract.js)
- [x] Background image OCR processing
- [x] PDF text extraction and scanned-page OCR on Windows
- [x] Local deterministic text and image embeddings
- [x] CI, release, and security automation
- [x] Nomic learned embedding models through ONNX Runtime
- [x] Semantic search over text and images
- [x] Image similarity search
- [x] Smart Spaces (auto-updating saved searches)

## Milestone 2 -- Reading and Writing

**Status: Not Started**

Content consumption and creation experiences.

- [x] Distraction-free article reader with clean typography
- [ ] Focus Mode for long-form writing
- [ ] Rich note editor (headings, bold, links, todos)
- [ ] Quote cards with source attribution
- [ ] Video link cards with previews
- [ ] PDF viewer with page navigation

## Milestone 3 -- Rediscovery

**Status: Not Started**

Surfacing forgotten material through browsing and curation.

- [ ] Serendipity mode (slow visual browsing with keep/forget)
- [ ] Top of Mind (pinned items on library open)
- [ ] Trash and recoverable archive
- [ ] Space management (create, rename, reorder, recolor, delete)
- [ ] Export and backup (database + assets + metadata)

## Milestone 4 -- Local Intelligence

**Status: Not Started**

On-device AI for summaries and deeper understanding.

- [ ] llama.cpp integration for local summaries
- [ ] Automatic concept extraction from images and articles
- [ ] Structured analysis of saved content
- [ ] Model selection across CPU, standard, and GPU modes

## Milestone 5 -- Polish and Distribution

**Status: Not Started**

Production readiness and first release.

- [ ] First-run onboarding (local-first, AI, export)
- [ ] Keyboard-first operation across all surfaces
- [ ] Accessibility audit (contrast, focus indicators, screen readers)
- [ ] Windows installer and update mechanism
- [ ] Web version portability (frontend + domain boundaries)

## TBD

**Status: unknown**

Future features under consideration

- [ ] Regular Spaces (manual collections)