# Ingestion

The URL capture pipeline and the helpers around it. `ingestUrl` in
`url-ingestion.ts` fetches a page through `http.ts`, runs Defuddle on it, cleans
the result with `cleanCapturedHtml`, and passes embeds through the allowlist in
`embeds.ts`.

Three places import this folder, so it parses HTML with linkedom and imports
nothing from Electron or the browser DOM:

- the main process, where `electron/ai-jobs.ts` runs `ingestUrl` as a
  background job and storage saves a note's `markdownToPlainText`
  projection as its description;
- the renderer, which uses helpers such as `file-classification.ts`,
  `video-links.ts` and `x-post.ts`;
- the benchmark harness in `benchmarks/harness/`.

`cleanCapturedHtml` keeps scripts, styles and handlers out of storage and
extracted text, but it runs on linkedom and is not the security boundary: the
renderer passes stored HTML through `src/lib/purifyHtml.ts` before it reaches
the DOM. Both apply the link and embed policy in `embeds.ts`.

`bun run ingest:smoke` runs the pipeline on inline fixtures with a stubbed fetch.
