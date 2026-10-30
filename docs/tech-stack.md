# Tech Stack

## Status

Current Windows desktop implementation.

## Decision summary

Build a local-first Windows desktop application with Electron, React, TypeScript, Node.js, and SQLite. Keep the frontend portable enough for a future web application, while the Electron main process owns local storage, background processing, asset management, and model execution.

## Application stack

| Area | Decision | Reason |
|---|---|---|
| Desktop shell | Electron 45 | Windows desktop packaging with a reusable web frontend and a narrow preload bridge |
| UI | React + TypeScript + Vite | Mature component ecosystem and future web portability |
| Styling | Tailwind CSS v4 utilities, Base UI headless primitives, and a WebGPU liquid glass layer | Fast iteration without locking the product to a heavy component theme |
| UI state | React hooks per feature, composed in `App` | The renderer's state is small and local; library rows are patched by item id instead of cached and invalidated |
| Application core | Electron main process and Node.js, in TypeScript on Effect | File, job queue, database, and model-process orchestration |
| IPC contract | `@inkling/contracts` command list and Effect Schemas | Preload, main process, and renderer share one command list; arguments are decoded before storage sees them |
| Database | SQLite through `@effect/sql-sqlite-node`, with migrations on `node:sqlite` | Typed queries and transactions over one serialized connection; migrations and FTS5 stay plain SQL |
| Exact search | SQLite FTS5 | Local full-text search across content, notes, OCR, and summaries |
| Asset storage | Plain files beside the database, one folder per item under `assets/items/<id>/` | An item's files export, restore and delete together |
| Background work | Effect workers over a job queue persisted in SQLite | Retryable processing without blocking the UI |

## Effect in the main process

The main process is built on [Effect](https://effect.website) so leases, timeouts, retries, and shutdown come from one tested runtime instead of hand-rolled timers and flags. `electron/main.ts` builds a single `ManagedRuntime` holding the library, the job queue, and two workers; quitting disposes it, which interrupts running jobs and hands them back as pending. Each job kind has a timeout in `electron/ai-jobs.ts`, so a hung model or decoder fails its job instead of stalling the queue. Effect stops at the IPC edge: handlers call storage through a Promise facade, and the renderer never imports Effect at runtime.

URL ingestion downloads through Effect's HTTP client, which retries rate limits, gateway errors, and dropped connections, waits at least as long as a `Retry-After` header asks, and stays inside the 15-second capture budget. Redirects stay manual so each hop passes the private-network check before it is followed.

The main process, preload, and snapshot worker are bundled by `scripts/build-electron.ts`; `bun run build:app` and `bun run dev:app` run it through `bun run build:electron`.

## Styling

Components style themselves with Tailwind utilities against the tokens in `src/index.css`. Base UI supplies behavior and accessibility for dialogs, tabs, menus and buttons, with no theme of its own. Plain CSS files are kept only where utilities can't reach: `reader.css` and the note editor style HTML they don't render themselves, onboarding runs on keyframes, and Sonner's toasts are styled through its data attributes. Those files sit next to the component that owns them.

Floating controls over the library are glass. In the desktop app, `LiquidGlass` renders the library inside a `<canvas layoutsubtree>`, Chromium's HTML-in-Canvas copies it into a WebGPU texture, and refracting glass is drawn under every `.glass` element. `.glass` and `.css-glass` both start as a blurred CSS glass. `LiquidGlass` marks a `.glass` element with `data-liquid` once its canvas draws it, which clears the CSS glass. `.css-glass` is for surfaces outside a canvas, and always stays CSS. The web preview, machines without WebGPU, and a lost GPU device keep the CSS glass. Each liquid surface costs GPU time, so glass stays on a few floating controls and never on card surfaces.

## Article extraction

Use Defuddle as the initial article extraction engine rather than implementing a new readability parser or forking Defuddle.

Defuddle was created for Obsidian Web Clipper and provides cleaned HTML or Markdown plus metadata such as title, author, domain, favicon, image, publication date, and schema.org data. It also exposes configurable extraction steps and a Node bundle.

The URL job fetches the page, runs Defuddle, sanitizes the result, passes embeds through the allowlist in `src/lib/ingestion/safe-embeds.ts`, and stores the cleaned HTML, text and metadata on the item. Article images stay remote URLs; nothing caches them locally yet.

Do not modify Defuddle until real corpus testing shows a repeatable problem. Prefer configuration, site-specific extractors, and a post-processing layer.

## OCR

Use Tesseract as the default OCR engine. OCR output is stored as searchable text and is not presented as a separately managed AI artifact. The user should simply be able to search for words that appear in an image or screenshot.

The OCR interface should remain replaceable so language packs, preprocessing, or a future alternative engine can be added without changing the item model.

## Local AI architecture

AI is a background service, not a frontend concern.

```text
Capture (writes the item and queues its jobs)
  -> Article extraction / OCR / PDF text / thumbnails and posters
  -> Text and image embeddings
```

SQLite triggers keep the FTS5 index in step with each write, so no job updates it. Smart Spaces are evaluated when they load, not when an item changes.

### Runtime choices

| Capability | Initial choice |
|---|---|
| OCR | Tesseract |
| Text embeddings | Nomic Embed Text v1.5 through local ONNX Runtime; use `search_document:` for stored content and `search_query:` for user queries |
| Image embeddings | Nomic Embed Vision v1.5 through local ONNX Runtime; shares the text model's 768-dimensional space |
| Image concepts | Deterministic image analysis plus vision/embedding model |
| Summaries | Optional quantized local LLM through llama.cpp |
| PDF extraction | Local PDF text extraction, followed by Tesseract for scanned pages |
| Vector search | Start with a simple local implementation; evaluate sqlite-vec after benchmarking |

ONNX Runtime is appropriate for Windows CPU/GPU inference. llama.cpp is appropriate for a bundled or downloaded quantized local language model and provides Windows builds and a local server interface.

`sqlite-vec` is worth evaluating, but should not be a hard dependency before benchmarking because it is pre-1.0 and may introduce breaking changes.

## AI behavior rules

- AI-derived concepts are invisible implementation details.
- Do not label tags as AI-generated.
- Do not show confidence scores.
- Do not expose tag correction or deletion workflows.
- Do not overwrite user-authored titles, notes, or tags.
- AI failures should degrade gracefully to ordinary metadata and text search.
- Processing should happen asynchronously after capture.
- A user should be able to use the app while processing is incomplete.

## Model selection policy

Nomic Embed Text v1.5 and Nomic Embed Vision v1.5 are the initial learned embedding pair. They are downloaded as pinned INT8 ONNX artifacts into the app model cache on the first indexing run, with SHA-256 verification before use. Models will still be evaluated using a representative local test corpus, not by reputation alone. Revisit the choice if semantic search relevance, image similarity relevance, CPU time, RAM usage, GPU acceleration, download size, cold-start time, or batch processing time is not acceptable.

Support three operating modes:

1. Baseline CPU mode.
2. Standard mode for typical 16 GB machines.
3. Accelerated mode when a supported GPU is available.

## Data, backup, and security

The database and asset store should be exportable together. Backups should include the SQLite database, local assets, original source URLs, cleaned article content, user notes and tags, and Spaces. Derived AI data may be regenerated, but exporting it is useful for faster restore and future migration.

Treat all fetched HTML as untrusted. Sanitize article HTML before rendering, allowlist iframe providers, strip scripts/event handlers/unsafe URLs/untrusted `srcdoc`, keep remote content isolated from Electron's privileged main process, and do not expose arbitrary filesystem or shell commands through the preload bridge.

The app session adds `Access-Control-Allow-Origin: *` to remote image responses so library cards, loaded with `crossorigin`, can be drawn into the liquid glass canvas. That lets the renderer read pixels of images it already displays and nothing more; it changes no request and applies to no other resource type.

## Update checks

The packaged app checks GitHub Releases only when the user selects Check for updates in Settings; it never checks at launch or on a schedule. GitHub receives the request from the device and the app name and installed version in its HTTP user agent, but no library data. An available update then appears in the sidebar and downloads only when the user selects it; the download checks the feed once more first. The feed's SHA512 hashes protect downloads over HTTPS but do not establish publisher trust. [development.md](operations/development.md#updates-and-releases) covers channels and releases.
