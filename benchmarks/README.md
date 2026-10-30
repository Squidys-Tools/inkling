# Benchmarks

This directory contains the representative corpus and evaluation notes used to choose OCR, extraction, embedding, vision, and local language models.

The corpus should contain only files and URLs that we are allowed to use for local testing. Do not commit private or copyrighted material to the repository unless we have permission.

## Corpus

[corpus/README.md](corpus/README.md) lists what the corpus holds and where each kind of fixture lives. `manifest.json` records every item and its expected values.

## Adding an item

1. Add the file to `corpus/`.
2. Record it in `manifest.json` with a stable `id`, its `path`, `type` and `language`, an optional `similarity_group`, `notes` on known edge cases, and the `expected` values the harness scores: title, author, search terms that must and must not match, an OCR text file, and image and embed counts. `harness/manifest.ts` defines the shape.
3. Put expected OCR text in `expected/ocr/`.
4. Run `bun run bench`.

## What it measures

The harness scores extraction against the expected values and OCR by token recall and precision, and records OCR and PDF latency with the machine it ran on. It does not measure semantic search relevance or image similarity yet, so the eight vision and similarity items are skipped. Summaries, memory, model download size, cold-start time and batch time still need measuring before the next model choice.

## Running the harness

Requires [Bun](https://bun.sh) (the harness and the ingestion pipeline are
TypeScript). From the repo root:

```sh
bun benchmarks/harness/index.ts   # or: bun run bench
```

On Windows, the harness also compares the built-in Windows OCR engine with
Tesseract for image and screenshot fixtures. The PDF path uses the same local
PDF.js extraction and OCR engines as the Electron app on every platform.

What it does:

1. Serves `corpus/` over a local HTTP server (`harness/server.ts`) so the
   fixture pages are fetched exactly like live pages.
2. For `article` / `recipe` / `video` items, runs the production extraction
   pipeline (`ingestUrl` → Defuddle → sanitize) via `harness/extract.ts`.
3. For PDFs, runs page-by-page extraction and scanned-page OCR through the
   production PDF.js pipeline in `electron/pdf.ts`. The corpus-only stream
   parser in `harness/pdf.ts` counts embedded images and remains covered by a
   smoke test.
4. For image and screenshot OCR, tries **every available engine** in
   `harness/ocr.ts` and keeps the best-scoring result: **Windows built-in OCR**
   (`Windows.Media.Ocr`, invoked via `harness/win-ocr.ps1` — zero-install on
   Windows) and **tesseract.js** (multi-PSM 3/6/7 with selective contrast and
   deskew fallbacks). Scanned PDFs use Tesseract on rendered pages.
5. Scores each item against `expected` (title/author/search terms/must-not
   match/embeds/image counts) and writes `results/results-latest.json`, a
   timestamped copy, and `results/summary.md`.

Scoring notes: search terms are matched across the extracted
title + description + text (whitespace-normalized on both sides), mirroring
how a saved item would be searched. OCR items are scored with token recall +
precision against `expected/ocr/`.

## Initial findings

Baseline run on the 42-item corpus with the `windows-ocr` engine:

- **25 pass, 8 partial, 1 fail, 8 skip — overall 0.940.**
- 8 skips: vision / similarity items (photos, design refs, similar pairs,
  distractor, low-res) — these need the embeddings benchmark.

After fixes (JSON-LD article metadata, `<noscript>` fallback text, author
byline heuristics, a multi-engine OCR harness, and more legible generated
meme/scanned-PDF fixtures), the same 42 items plus 6 live MacRumors pages:

- **36 pass, 4 partial, 0 fail, 8 skip — overall 0.992.**
- All 6 live-article fixtures pass at 1.000, verifying extraction against
  real-world macrumors.com markup (title, author, and search terms all match;
  authors come from the articles' own JSON-LD).
- Fixed by the above:
  - `article-news-01` / `article-recipe-01` (byline authors now recognized),
    `article-js-heavy-01` (noscript fallback text restored), `image-meme-01`
    (0.93, was fail), `pdf-scanned-01` (full memo OCR'd in order).
- Remaining partials are genuine engine limits, not fixture errors:
  - `screenshot-large-text-01` 0.97 and `screenshot-small-text-01` 0.86
    (Windows OCR misses a few dense tokens; the small-text one is a dense
    table, 110 tokens).
  - `image-rotated-01` 0.92 (Windows OCR misses 6 of 36 rotated tokens).
  - `image-meme-01` 0.93 (OCR merges some words; stylized Impact text).
- Engine split observed: tesseract.js wins on the two-column layout and the
  scanned PDF; Windows OCR wins on the meme, handwriting, rotated image, and
  screenshots. Best-of-multi-engine is therefore the right default.

Fixtures deliberately model realistic pages; these residual gaps are
documented as findings.

## Refreshing fixtures

```sh
# Regenerate deterministic images/screenshots/PDFs and expected/ocr/*.txt
pwsh -File benchmarks/generate-corpus.ps1

# Fetch the N (default 6) newest MacRumors articles as live fixtures
bun benchmarks/fetch-macrumors.ts 6
```

`fetch-macrumors.ts` re-runs are incremental: it skips articles already in
the manifest, rewrites only the `article-live-macrumors-*` entries, and
verifies every fixture through the production ingestion pipeline before
updating the manifest. Delete the `corpus/live/macrumors/*.html` files and
the `article-live-macrumors-*` manifest entries to drop them.
