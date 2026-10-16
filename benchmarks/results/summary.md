# Benchmark results
Generated: 2026-10-16T17:42:24.760Z
Machine: linux 6.1.158+ x64, AMD EPYC, 1 cores, 4 GB RAM, Bun 1.4.3

## Overall: score 0.990 — pass 36, partial 4, fail 0, skip 8

| Type | Score | Pass | Partial | Fail | Skip | Total |
| --- | --- | --- | --- | --- | --- | --- |
| article | 1.000 | 17 | 0 | 0 | 0 | 17 |
| recipe | 1.000 | 1 | 0 | 0 | 0 | 1 |
| screenshot | 0.886 | 0 | 2 | 0 | 0 | 2 |
| image | 0.954 | 2 | 2 | 0 | 8 | 12 |
| pdf | 1.000 | 6 | 0 | 0 | 0 | 6 |
| video | 1.000 | 4 | 0 | 0 | 0 | 4 |
| note | 1.000 | 4 | 0 | 0 | 0 | 4 |
| quote | 1.000 | 2 | 0 | 0 | 0 | 2 |

Scores average non-skipped items only; skipped items are excluded.

## Latency
Image OCR: median 799 ms, p90 1969 ms (6 items).
PDF processing: median 34 ms, p90 3922 ms (6 items).
PDF OCR total per document: median 2096 ms, p90 3807 ms (2 PDFs).

## Items
- [PASS] article-short-01 (score 1.000, production:ingestUrl)
- [PASS] article-long-essay-01 (score 1.000, production:ingestUrl)
- [PASS] article-news-01 (score 1.000, production:ingestUrl)
- [PASS] article-recipe-01 (score 1.000, production:ingestUrl)
- [PASS] article-docs-01 (score 1.000, production:ingestUrl)
- [PASS] article-footnotes-01 (score 1.000, production:ingestUrl)
- [PASS] article-codeblocks-01 (score 1.000, production:ingestUrl)
- [PASS] article-gallery-01 (score 1.000, production:ingestUrl)
- [PASS] article-js-heavy-01 (score 1.000, production:ingestUrl)
- [PASS] article-ads-01 (score 1.000, production:ingestUrl)
- [PASS] article-paywalled-01 (score 1.000, production:ingestUrl)
- [PARTIAL] screenshot-large-text-01 (score 0.971, tesseract.js)
- [PARTIAL] screenshot-small-text-01 (score 0.802, tesseract.js)
- [SKIP] image-photo-01 (score 0.000, none)
- [SKIP] image-design-ref-01 (score 0.000, none)
- [SKIP] image-similar-01 (score 0.000, none)
- [SKIP] image-similar-02 (score 0.000, none)
- [SKIP] image-similar-03 (score 0.000, none)
- [SKIP] image-similar-04 (score 0.000, none)
- [SKIP] image-distractor-01 (score 0.000, none)
- [SKIP] image-lowres-01 (score 0.000, none)
- [PARTIAL] image-meme-01 (score 0.929, tesseract.js)
- [PASS] image-handwriting-01 (score 1.000, tesseract.js)
- [PARTIAL] image-rotated-01 (score 0.886, tesseract.js)
- [PASS] image-columns-01 (score 1.000, tesseract.js)
- [PASS] pdf-native-text-01 (score 1.000, pdf-text)
- [PASS] pdf-scanned-01 (score 1.000, pdf-text+tesseract.js)
- [PASS] pdf-multicolumn-01 (score 1.000, pdf-text)
- [PASS] pdf-tables-01 (score 1.000, pdf-text)
- [PASS] pdf-images-captions-01 (score 1.000, pdf-text+tesseract.js)
- [PASS] pdf-bad-metadata-01 (score 1.000, pdf-text)
- [PASS] video-youtube-01 (score 1.000, production:ingestUrl)
- [PASS] video-vimeo-01 (score 1.000, production:ingestUrl)
- [PASS] video-article-embed-01 (score 1.000, production:ingestUrl)
- [PASS] video-unsupported-iframe-01 (score 1.000, production:ingestUrl)
- [PASS] video-no-media-01 (score 1.000, production:ingestUrl)
- [PASS] note-quick-01 (score 1.000, raw-file)
- [PASS] note-long-01 (score 1.000, raw-file)
- [PASS] note-markdown-01 (score 1.000, raw-file)
- [PASS] note-todo-01 (score 1.000, raw-file)
- [PASS] quote-source-01 (score 1.000, raw-file)
- [PASS] quote-nosource-01 (score 1.000, raw-file)
- [PASS] article-live-macrumors-the-macrumors-show-where-does-the-apple-watch-go-next (score 1.000, production:ingestUrl)
- [PASS] article-live-macrumors-new-things-your-iphone-can-do-ios-27 (score 1.000, production:ingestUrl)
- [PASS] article-live-macrumors-iphone-18-pro-next-month-12-rumored-features (score 1.000, production:ingestUrl)
- [PASS] article-live-macrumors-iphone-17-vs-iphone-18-buying (score 1.000, production:ingestUrl)
- [PASS] article-live-macrumors-best-apple-deals-of-the-week-8-14-26 (score 1.000, production:ingestUrl)
- [PASS] article-live-macrumors-apple-trained-own-ai-model-for-china (score 1.000, production:ingestUrl)

## Details
### screenshot-large-text-01 — partial (0.971)
- OCR precision 0.94

### screenshot-small-text-01 — partial (0.802)
- OCR recall 0.76 (110 expected tokens)
- missing tokens (sample): 4, 2, field, mark, png, 27, 11, 22
- OCR precision 0.84

### image-photo-01 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-design-ref-01 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-similar-01 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-similar-02 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-similar-03 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-similar-04 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-distractor-01 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-lowres-01 — skip (0.000)
- vision/similarity scoring not implemented (embeddings benchmark)

### image-meme-01 — partial (0.929)
- OCR recall 0.93 (14 expected tokens)
- missing tokens (sample): i
- OCR precision 0.93

### image-rotated-01 — partial (0.886)
- OCR recall 0.81 (36 expected tokens)
- missing tokens (sample): field, report, appendix, b, rotation, tolerance, check
- OCR precision 0.97
