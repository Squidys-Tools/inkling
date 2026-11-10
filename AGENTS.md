# inkling

inkling is a private visual library: an Electron app for Windows, macOS and Linux with a React, TypeScript, StyleX and Vite renderer, and Node.js processes on SQLite. Users save articles, images, screenshots, PDFs, notes, quotes and video links, and find them later by describing them. Search is the only organizer; there are no folders.

## Product rules

Users keep things here they do not want to lose. A change that breaks one of these rules is a bug, however correct its code is.

1. **Capture is instant.** The card appears at once. OCR, extraction, embeddings and indexing run as background jobs while the user keeps working.
2. **Performance.** Send summaries and thumbnails over IPC, not full content. Keep the card grid virtualized. Load a thumbnail where one will do. FTS, vector search and Smart Space evaluation do not run on every keystroke. Nothing repaints continuously except the mascot, the sidebar's ring while an upgrade builds the search index, and the card of a newly captured item while its first jobs run, within a cap of 8 canvases and 16 beams moving at once. The sidebar's download bar, while a download runs, is also allowed to repaint and sits outside that cap.
3. **Local first.** The library is a SQLite file plus assets under `assets/items/<id>/`. The network is used only for URLs the user saves, the one-time model download, update checks, and video embeds the user plays. No accounts, analytics or uploads.
4. **Quiet intelligence.** AI improves search and stays out of the interface: no confidence scores, AI labels, tag correction flows or model management. Never rewrite a user's title, note or tag. When AI fails, fall back to metadata and text search. The ink-blot mascot never talks: calm at rest, subtly alive while jobs run, sad only when capture fails.
5. **Visual by type.** Each `ItemKind` in `apps/renderer/src/library/cardModel.ts` has its own card and thumbnail treatment. Keep that when adding a kind.

Find the real constraint, then build the smallest thing that makes the correct behavior unsurprising. Remove complexity that does not earn its place and add none for show. If a rule here fights the task, say so and get a maintainer's sign-off.

## Vocabulary

- **we** and **maintainers** are the people you work for. The **user** is the person using inkling.
- An **item** is one saved thing, as data. A **card** is how an item looks, as UI.
- The **library** is the SQLite database plus the asset store.
- **Capture** is getting something in: the Add button, paste, drag and drop, clipboard, screenshot, or the **deep link** `inkling://capture?url=...`. The Chrome extension in `extension/` uses the deep link or the loopback receiver in `apps/desktop/src/capture/server.ts`.
- A **job** is one unit of background work on the persisted queue with leases. Jobs retry, leases expire, and interrupted jobs recover on restart.
- A **Space** is a collection. A Smart Space is a saved search that runs each time it loads; a regular Space holds items the user picked.
- **Preview** is `bun run dev`, or its static build `bun run build:web`: the demo seed in memory and no desktop backend. The **full app** is `bun run dev:app` (unpackaged, on the seeded `.dev-library/` scratch library in the worktree) or the packaged build from `bun run dist`. OCR, embeddings and file access run only in the full app.

## Safety

- Kill only a PID you captured at spawn, or the owner of your port after checking that its command line or cwd is your worktree. Never kill by name or path pattern (`pkill -f`, `pgrep | kill`): your own agent process has this worktree's path in its argv, and other dev servers run on this machine.
- The developer's real library, the database and assets the installed app owns, is read-only to you. Never start a server against it or open it read-write. To test with real data, back the database up through SQLite into a scratch directory (a raw copy of a live database is corrupt without its `-wal` and `-shm` files) and copy only the assets your flow needs. Data flows into the sandbox, never back.
- Source and committed config carry no localhost ports, absolute user paths or machine-specific cache paths; a fresh clone on another Windows machine must work. Never commit a database, model, embedding, real user item, pairing secret, token, or capture URL with real content. Of `benchmarks/results/`, only `results-latest.json` and `summary.md` are tracked.
- Start servers detached, read the port from their output, and poll the log or port instead of sleeping. Stop what you started.

## Hit every surface

The usual defect works on the tested path and is missing elsewhere. Before calling capture or display work done, check each entry that applies and name it in your report:

- **Entry points.** Add button, paste, drag and drop, clipboard, screenshot, deep link.
- **Capture paths.** URL, article, image, screenshot, PDF, note, quote, video link, X post, other file. An extractor change needs a decision for each.
- **Search.** Say how search reaches a newly indexed field.
- **Card kinds.** Every `ItemKind`. Shared thumbnail logic stays in one place.
- **Reverse states.** A way in needs a way out and a way to see it: trash needs restore, and a Space needs rename and a delete that keeps its items.
- **Modes.** A feature must not silently do nothing in preview or in the full app.

## Code

- `apps/renderer` is the React renderer. It reaches the library only through the Effect RPC client in `apps/renderer/src/library/connection.ts`, whose groups live in `packages/contracts`, and the desktop only through the preload bridge typed in `packages/contracts/src/desktop.ts`.
- `apps/site` is the marketing site. It imports renderer modules (cards, mascot, welcome demos, demo seed), which therefore must not touch `window` or `document` at import: the site prerenders them on a server.
- `apps/desktop` is the Electron main process and preload: windows, menus, dialogs, the `app://` protocol, capture intake and updates. It never opens the database.
- `packages/library` runs in the library utility process, the only owner of the SQLite file and the job queue. `packages/jobs` is the stateless worker process it calls for OCR, embeddings, thumbnails, PDF and URL extraction. `packages/ingestion` is shared by the worker and the renderer. `packages/rpc-electron` carries Effect RPC over Electron message ports.
- The processes are written with Effect 4, whose API differs a lot from the Effect 3 most models remember. Read `node_modules/effect/AGENTS.md` and `node_modules/effect/ai-docs/` before writing Effect code. Effect stops at the UI edge: React code calls the promise client from `packages/rpc-electron/src/promise-client.ts`. Reusable functions use `Effect.fnUntraced`, inline programs and layers use `Effect.gen`.
- Style with StyleX only. Colors live only in `packages/ui/src/tokens.stylex.ts`, and there are no CSS files; `inkling/no-color-literals` and `inkling/no-css-imports` enforce both.
- Fetched HTML is untrusted: sanitize it, pass embeds through the allowlist, strip scripts and event handlers. Keep the preload bridge narrow. Dev-only and maintainer tooling can stay simple.
- Keep partial results when extraction fails. A card with a title and domain beats an error card.
- Let TypeScript infer types, and never use `any`.
- Write a comment only where a reader would likely break something without it: an ordering or race guarantee, a security check, a Chromium, Electron, WebGPU or OS quirk, or an invariant another file relies on. One line where you can, four at most. `inkling/no-low-value-comments` (in `tools/oxlint-plugin/`) enforces part of this, and every `oxlint-disable` needs a `-- reason`.
- Merging to `main` deploys the marketing site to production when the merge changes anything the site builds from, through the `Deploy site` workflow. Treat a merge of site, renderer or shared UI code as a release of the site. See `docs/operations/development.md`.
- When a package.json script is renamed or removed, or its command changes, update `t3.json` in the same change.

## Tests and checks

- While iterating, run `bun test <files>`. Before pushing, run `bun run check:changed`. Leave `bun run check`, a full `bun test` and a full `tsc` to CI unless asked. If module resolution looks broken, run `bun tools/repo/check-bun-version.ts`.
- Test what breaks quietly: extraction and sanitizing, embed allowlists, OCR scoring, queue leases and recovery, migrations, asset path containment and range requests, deep link and external-format parsing, and ordering and races. Leave out tests of what the types prove, trivial logic, static renders, mock-call mirrors, smoke tests and timing.
- A logic, data, state or protocol bug gets a test that fails on `main`, then the fix; mark it `// regression: #NNN` if its name does not say so. A visual bug gets before and after screenshots instead. Capture and background changes ship with focused tests.
- Add a row or assertion to an existing test before writing a new `it`, at the lowest layer that fails.
- Wait for the real signal of async work: a job drain, a lease state, an event. No sleeps, retries, polling or clock deltas.
- A UI change is not done until you have driven it once in the running app with the `verify-inkling` skill (preview for layout, the full app for anything native), run its cleanup, and put the screenshot in your report. Subagents do not launch the app, since a worktree has one harness instance: after integrating a subagent's work, run the check yourself, even when the subagent reports success. If the check cannot run here, say so in the report instead of skipping it.
- The demo seed in `apps/renderer/src/library/preview/seed.ts` and `seed-demo/` beside it is the default data for UI work.

## Docs

Most code changes need no docs change. Product intent lives in `docs/product.md` and `docs/product-behavior.md`, architecture reasons in `docs/tech-stack.md`, maintainer procedures in `docs/operations/`, milestone status in `docs/roadmap.md`, and what shipped in each release in `docs/changelog.md`. Keep each fact in one place. Write down only what a maintainer would get wrong without it, and when a decision changes, rewrite the text that described it. Keep plans and scratch notes outside the worktree.

## Pull requests

- Open a PR only when asked, one per request. Use a conventional commit title such as `fix(reader): code blocks keep line breaks`, because release notes are drafted from PR titles. The body gives the problem, the fix, and the model and harness that did the work. UI changes need before and after images and motion needs a short video, uploaded to GitHub rather than committed.
- When a GitHub issue tracks the task, read it and its comments before starting and put `Closes #N` in the PR body. If the PR finishes a roadmap item, tick its box in `docs/roadmap.md` in the same PR.
- Do not add a changelog entry in a PR. The changelog is written when a release is cut; its rules are at the top of `docs/changelog.md`.
