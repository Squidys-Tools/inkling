# inkling

inkling is a private visual library: a Windows Electron app with a React, TypeScript and Vite renderer and a Node.js main process on SQLite. Users save articles, images, screenshots, PDFs, notes, quotes and video links, and find them later by describing them. Search is the only organizer; there are no folders.

## Product rules

Users keep things here they do not want to lose. A change that breaks one of these rules is a bug, however correct its code is.

1. **Capture is instant.** The card appears at once. OCR, extraction, embeddings and indexing run as background jobs while the user keeps working.
2. **Performance.** Send summaries and thumbnails over IPC, not full content. Keep the card grid virtualized. Load a thumbnail where one will do. FTS, vector search and Smart Space evaluation do not run on every keystroke. Nothing repaints continuously except the mascot.
3. **Local first.** The library is a SQLite file plus assets under `assets/items/<id>/`. The network is used only for URLs the user saves, the one-time model download, update checks, and video embeds the user plays. No accounts, analytics or uploads.
4. **Quiet intelligence.** AI improves search and stays out of the interface: no confidence scores, AI labels, tag correction flows or model management. Never rewrite a user's title, note or tag. When AI fails, fall back to metadata and text search. The ink-blot mascot never talks: calm at rest, subtly alive while jobs run, sad only when capture fails.
5. **Visual by type.** Each `ItemKind` in `src/lib/types.ts` has its own card and thumbnail treatment. Keep that when adding a kind.

Find the real constraint, then build the smallest thing that makes the correct behavior unsurprising. Remove complexity that does not earn its place and add none for show. If a rule here fights the task, say so and get a maintainer's sign-off.

## Vocabulary

- **we** and **maintainers** are the people you work for. The **user** is the person using inkling.
- An **item** is one saved thing, as data. A **card** is how an item looks, as UI.
- The **library** is the SQLite database plus the asset store.
- **Capture** is getting something in: the Add button, paste, drag and drop, clipboard, screenshot, or the **deep link** `inkling://capture?url=...`. The Chrome extension in `extension/` uses the deep link or the loopback receiver in `electron/capture-server.ts`.
- A **job** is one unit of background work on the persisted queue with leases. Jobs retry, leases expire, and interrupted jobs recover on restart.
- A **Space** is a collection. A Smart Space is a saved search that runs each time it loads; a regular Space holds items the user picked.
- **Preview** is `bun run dev` or `bun run dev:app`: sample data and no desktop backend. The **full app** is the packaged build from `bun run build:dir`. OCR, embeddings and file access run only in the full app.

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

- `src/` is the renderer; it reaches the main process only through `src/lib/libraryApi.ts` and the IPC contract in `packages/contracts/`. `src/lib/ingestion/` also runs in the main process, imported by `electron/ai-jobs.ts`.
- The main process in `electron/` owns files, the job queue, the database and models, and is written with Effect 4, whose API differs a lot from the Effect 3 most models remember. Read `node_modules/effect/AGENTS.md` and `node_modules/effect/ai-docs/` before writing Effect code. Effect stops at the IPC edge; the renderer's one use is `src/lib/ingestion/http.ts`. Reusable functions use `Effect.fnUntraced`, inline programs and layers use `Effect.gen`.
- Fetched HTML is untrusted: sanitize it, pass embeds through the allowlist, strip scripts and event handlers. Keep the preload bridge narrow. Dev-only and maintainer tooling can stay simple.
- Keep partial results when extraction fails. A card with a title and domain beats an error card.
- Let TypeScript infer types, and never use `any`.
- Write a comment only where a reader would likely break something without it: an ordering or race guarantee, a security check, a Chromium, Electron, WebGPU or OS quirk, or an invariant another file relies on. One line where you can, four at most. `inkling/no-low-value-comments` enforces part of this, and every `oxlint-disable` needs a `-- reason`.
- When a package.json script is renamed or removed, or its command changes, update `t3.json` in the same change.

## Tests and checks

- While iterating, run `bun test <files>`. Before pushing, run `bun run check:changed`. Leave `bun run check`, a full `bun test` and a full `tsc` to CI unless asked. If module resolution looks broken, run `bun run check:bun-version`.
- Test what breaks quietly: extraction and sanitizing, embed allowlists, OCR scoring, queue leases and recovery, migrations, asset path containment and range requests, deep link and external-format parsing, ordering and races, and `liquidGlassShape`. Leave out tests of what the types prove, trivial logic, static renders, mock-call mirrors, smoke tests and timing.
- A logic, data, state or protocol bug gets a test that fails on `main`, then the fix; mark it `// regression: #NNN` if its name does not say so. A visual bug gets before and after screenshots instead. Capture and background changes ship with focused tests.
- Add a row or assertion to an existing test before writing a new `it`, at the lowest layer that fails.
- Wait for the real signal of async work: a job drain, a lease state, an event. No sleeps, retries, polling or clock deltas.
- Check a UI change once in the running app with the `verify-inkling` skill, preview for layout and the full app for native behavior, and include a screenshot. Subagents leave this to the primary agent.
- The demo seed in `public/seed-demo/` and `src/seedPersonal.ts` is the default data for UI work.

## Docs

Most code changes need no docs change. Product intent lives in `docs/product.md` and `docs/product-behavior.md`, architecture reasons in `docs/tech-stack.md`, maintainer procedures in `docs/operations/`, milestone status in `docs/roadmap.md`, and changes in `docs/changelog.md`, whose rules are at its top. Keep each fact in one place. Write down only what a maintainer would get wrong without it, and when a decision changes, rewrite the text that described it. Keep plans and scratch notes outside the worktree.

## Pull requests and Linear

- Open a PR only when asked, one per request. Use a conventional commit title such as `fix(reader): code blocks keep line breaks`. The body gives the problem, the fix, and the model and harness that did the work. UI changes need before and after images and motion needs a short video, uploaded to GitHub rather than committed.
- A Linear issue such as `SQU-6` tracks one task. Before starting, read it and its comments, move it to In Progress, and branch from its `gitBranchName`. Post progress as comments and leave the description alone. Leave an issue in In Review alone unless asked. When done, link the PR at the top of its description, move the issue to In Review, and in the same PR tick its box in `docs/roadmap.md` and add a changelog line with the issue ID. Move it to Done once the PR merges.
