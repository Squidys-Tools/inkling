# Benchmarks

The corpus and harness that score inkling's article extraction and OCR, and the evidence for choosing models.

Commit only files and URLs we may use for local testing, and no private or copyrighted material without permission.

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

From the repository root, run `bun run bench`. It serves `corpus/` over a local HTTP server so fixture pages are fetched like live pages, then:

- runs article, recipe and video items through the production URL pipeline (`ingestUrl`, Defuddle, sanitizing);
- runs PDFs through the app's PDF.js extraction and scanned-page OCR in `electron/pdf.ts`;
- runs image and screenshot OCR through every available engine and keeps the best-scoring result. Tesseract.js, with the app's settings from `electron/ocr.ts`, runs everywhere; Windows also runs the built-in `Windows.Media.Ocr` through `harness/win-ocr.ps1`.

Search terms match against the extracted title, description and text with whitespace normalized, the way a saved item is searched. OCR is scored by token recall and precision against `expected/ocr/`. Each run writes `results/results-latest.json` and `results/summary.md`, which are tracked, and a timestamped JSON copy, which git ignores.

## Findings

[results/summary.md](results/summary.md) has the latest scores. What earlier runs established:

- On Windows, JSON-LD article metadata, `<noscript>` fallback text, byline heuristics, multi-engine OCR and more legible generated fixtures took the score from 0.940 on 42 items to 0.992 on 48. The six live MacRumors articles pass at 1.000, with authors from their own JSON-LD.
- The remaining partials are OCR engine limits, not fixture errors: dense screenshot text, rotated text and stylized meme text.
- Neither OCR engine wins everywhere. Tesseract.js won on the two-column layout and the scanned PDF; Windows OCR won on the meme, handwriting, rotated image and screenshots. The harness keeps the best of both for that reason; the app runs Tesseract only.

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
