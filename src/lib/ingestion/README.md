# Ingestion

The URL capture pipeline and the helpers around it. `ingestUrl` in
`url-ingestion.ts` fetches a page through `http.ts`, runs Defuddle on it,
sanitizes the result, and passes embeds through the allowlist in
`safe-embeds.ts`.

Three places import this folder, so it parses HTML with linkedom and imports
nothing from Electron or the browser DOM:

- the main process, where `electron/ai-jobs.ts` runs `ingestUrl` as a
  background job;
- the renderer, which uses helpers such as `file-classification.ts`,
  `video-links.ts` and `x-post.ts`;
- the benchmark harness in `benchmarks/harness/`.

`bun run ingest:smoke` runs the pipeline on inline fixtures with a stubbed fetch.
