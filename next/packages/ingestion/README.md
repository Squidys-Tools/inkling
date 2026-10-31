# Ingestion

The URL capture pipeline and the helpers around it. `ingestUrl` in
`url-ingestion.ts` fetches a page through `http.ts`, runs Defuddle on it, cleans
the result with `cleanCapturedHtml`, and passes embeds through the allowlist in
`embeds.ts`.

The worker process (`packages/jobs`, which runs `ingestUrl` as the
`enrich_url` job), the library process (which saves a note's
`markdownToPlainText` projection as its description and embedding text) and the
renderer (helpers such as `file-classification.ts`, `video-links.ts` and
`x-post.ts`) import this package, so it parses HTML with linkedom and imports
nothing from Electron or the browser DOM.

`cleanCapturedHtml` keeps scripts, styles and handlers out of storage and
extracted text, but it runs on linkedom and is not the security boundary: the
renderer must sanitize stored HTML again before it reaches the DOM, applying
the same link and embed policy from `embeds.ts`.

`bun packages/ingestion/src/ingestion.smoke.ts` runs the pipeline on inline
fixtures with a stubbed fetch.
