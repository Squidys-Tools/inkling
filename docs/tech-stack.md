# Tech stack

## Decision summary

inkling is a local-first desktop app built with Electron, React, TypeScript, Node.js and SQLite. The main process owns windows and the operating system; a library process owns the database, search and the job queue; a worker process runs OCR, embeddings and extraction. The renderer stays portable enough for a future web version.

## Application stack

| Area | Decision | Reason |
|---|---|---|
| Desktop shell | Electron | The same Chromium on Windows, macOS and Linux, so one design renders the same everywhere, with a narrow preload bridge |
| UI | React + TypeScript + Vite, with the React Compiler | Mature component ecosystem and future web portability; components re-render only when their inputs change |
| Styling | StyleX tokens and atomic CSS, Base UI headless primitives | One token set, no hand-written stylesheets, no theme to fight |
| UI state | Small external stores read through `useSyncExternalStore` | The library store keeps cards by id and applies change events from the library process, so one finished job re-renders one card |
| Routing | TanStack Router with hash history | Typed routes that work on `app://` and in the web preview |
| Processes | Main, plus a library and a worker `utilityProcess` | A long OCR or embedding run cannot slow a search, and queries never wait behind window events |
| IPC contract | Effect RPC groups in `packages/contracts`, over Electron message ports (`packages/rpc-electron`) | One typed, Schema-checked contract for every call and push event; the renderer gets a promise client |
| Database | SQLite through `@effect/sql-sqlite-node`, with migrations on `node:sqlite` | Typed queries and transactions over one serialized connection; migrations and FTS5 stay plain SQL |
| Exact search | SQLite FTS5 | Local full-text search across titles, descriptions, note bodies, OCR text and metadata |
| Asset storage | Plain files beside the database, one folder per item under `assets/items/<id>/` | An item's files export, restore and delete together |
| Background work | A job queue persisted in SQLite with leases, run by the library process | Retryable processing without blocking the UI |

## Processes and Effect

Main owns only what Electron requires: windows, the native menu, dialogs, context menus, the `app://` protocol, deep links, the capture receiver and updates. It never opens the database. At startup it spawns the library and worker processes and hands each the message ports it needs: the renderer talks to the library process directly, and the library process calls the worker. Both restart on a crash, and the queue's leases recover the jobs a crash interrupted.

The library and worker processes are built on [Effect](https://effect.website) so leases, timeouts, retries, and shutdown come from one tested runtime instead of hand-rolled timers and flags. Each job kind has a timeout, so a hung model or decoder fails its job instead of stalling the queue. Effect stops at the UI edge: the renderer calls the library through a promise client generated from the RPC groups.

URL ingestion downloads through Effect's HTTP client, which retries rate limits, gateway errors, and dropped connections, waits at least as long as a `Retry-After` header asks, and stays inside the 15-second capture budget. Redirects stay manual so each hop passes the private-network check before it is followed.

## Styling

Components style themselves with `stylex.create` against the tokens in `packages/ui/src/tokens.stylex.ts`, the only file with color values. There are no hand-written stylesheets: global resets go on `<html>` and `<body>` through `stylex.props`, the reader turns sanitized article HTML into React elements with a StyleX style per tag, TipTap nodes get StyleX class names through their extensions, and fonts register through the `FontFace` API. The lint rules `inkling/no-color-literals` and `inkling/no-css-imports` keep it that way, so the only CSS shipped is what StyleX generates. Base UI supplies behavior and accessibility for dialogs, menus and buttons, with no theme of its own.

Floating controls over the library are glass: one `Glass` component in `packages/ui`, a CSS `backdrop-filter`. At most three glass surfaces are on screen, none resizing while it animates, and card surfaces never are.

## Article extraction

inkling extracts articles with Defuddle, the extractor behind Obsidian Web Clipper, instead of writing or forking a readability parser. Defuddle returns cleaned HTML plus metadata such as title, author, domain, image, publication date and schema.org data, and runs in Node.

The URL job fetches the page, runs Defuddle, sanitizes the result, passes embeds through the allowlist in `packages/ingestion/src/embeds.ts`, and stores the cleaned HTML, text and metadata on the item. Article images stay remote URLs; nothing caches them locally yet.

Do not modify Defuddle until real corpus testing shows a repeatable problem. Prefer configuration, site-specific extractors, and a post-processing layer.

## OCR

Tesseract is the OCR engine. Its output is stored as searchable text on the item, not shown as a separate AI artifact, so the user can search for words in an image or screenshot.

Keep the OCR interface replaceable, so language packs, preprocessing or another engine can be added without changing the item model.

## Local AI architecture

AI is a background service, not a frontend concern.

```text
Capture (writes the item and queues its jobs)
  -> Article extraction / OCR / PDF text / thumbnails and posters
  -> Text and image embeddings
```

SQLite triggers keep the FTS5 index in step with each write, so no job updates it. Smart Spaces are evaluated when they load, not when an item changes.

### Runtime choices

| Capability | Choice |
|---|---|
| OCR | Tesseract |
| Text and image embeddings | Nomic Embed Text and Vision v1.5 through local ONNX Runtime; [models.md](models.md) has the details |
| PDF extraction | PDF.js text extraction, then Tesseract on rendered pages for scanned PDFs |
| Vector search | A linear scan over stored vectors; evaluate `sqlite-vec` after benchmarking |
| Image concepts (planned) | Deterministic image analysis plus a vision or embedding model |
| Summaries (planned) | An optional quantized local LLM through llama.cpp |

ONNX Runtime runs the models on CPU or GPU on every platform inkling ships for. llama.cpp suits a bundled or downloaded quantized language model and has Windows builds and a local server.

Do not make `sqlite-vec` a hard dependency before benchmarking it: it is pre-1.0 and may break between releases.

## Model selection policy

Evaluate models on the benchmark corpus in `benchmarks/`, not by reputation. Revisit the Nomic pair if semantic search relevance, image similarity relevance, CPU time, RAM use, GPU acceleration, download size, cold-start time or batch processing time falls short.

The planned model selection supports three modes:

1. Baseline CPU mode.
2. Standard mode for typical 16 GB machines.
3. Accelerated mode when a supported GPU is available.

## Data, backup, and security

An export is a SQLite snapshot, the asset files its items reference, and a manifest, so it carries source URLs, cleaned article content, notes, tags and Spaces. A restore queues OCR, thumbnail and embedding jobs again for the items it imports instead of trusting the derived data in the snapshot.

Treat all fetched HTML as untrusted. Sanitize article HTML before rendering, allowlist iframe providers, strip scripts/event handlers/unsafe URLs/untrusted `srcdoc`, keep remote content isolated from Electron's privileged main process, and do not expose arbitrary filesystem or shell commands through the preload bridge.

## Update checks

The packaged app checks GitHub Releases only when the user selects Check for updates in Settings; it never checks at launch or on a schedule. GitHub receives the request from the device and the app name and installed version in its HTTP user agent, but no library data. An available update then appears in the sidebar and downloads only when the user selects it; the download checks the feed once more first. The feed's SHA512 hashes protect downloads over HTTPS but do not establish publisher trust. [development.md](operations/development.md#updates-and-releases) covers channels and releases. The macOS app is ad-hoc signed rather than signed with an Apple Developer ID, so it never checks for updates: Squirrel.Mac installs only an update signed by the running app's Developer ID. Turning them on takes a Developer ID signature, the `zip` target that Squirrel.Mac downloads, and removing the macOS cases from `updateDisabledReason` and from the release workflow's uploaded update feeds.
