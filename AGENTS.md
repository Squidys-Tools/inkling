# inkling

inkling is a home for everything worth keeping. Articles, images, screenshots, PDFs, notes, quotes, video links. A Tauri 2 desktop app on Windows. React, TypeScript and Vite in the frontend, Rust and SQLite for backend. Everything stays on the machine.

Think of it as a private visual library with semantic search as the only organizer. No folders to maintain. Save abitrary media in seconds, find it later by describing it.

## What makes inkling special

People keep things here they do not want to lose, things that are important to them, or that give them inspiration or creative ideas. These are the things that we must never compromise on.

### 1. Capture is instant and seamless

Saving must be faster than deciding where something belongs. The card appears right away. OCR, embeddings, fetching and/or indexing run in the background while the user keeps browsing or continues on with something else. A change that blocks capture on processing is a bug, no matter how correct the processing is.

### 2. Performance

Lots of apps have gotten bogged down with bad tech decisions and "slop". We regularly audit for performance regressions, often caused by passing full content over Tauri IPC instead of summaries/thumbnails, rendering the card grid without virtualization, loading full assets where a thumbnail would do, blocking capture on extraction/OCR/embeddings, and running FTS + vector + Smart Space re-evaluation on every keystroke. Keep capture instant and processing in background jobs. Make sure all changes are considerate of performance impact.

### 3. Local first, forever

The library lives in SQLite on the user's disk, with files kept as content addressed assets beside it. No account, no feed, no tracking. Network is only for fetching data in a URL the user asked to save like video embed links, the one time model download, or when a user plays a video embed link but that is handled by the embed. Do not add calls home, analytics, or silent uploads.

### 4. Quiet intelligence

AI helpers stay invisible. They make search better. Never surface confidence scores, AI labels, tag correction flows, or model management chores in the main interface. Never rewrite a user title, note, or tag. When AI fails, fall back to plain metadata and text search. Our mascot is an ink-blot that stays out of the way. Calm at rest, subtly alive while work runs, sad only when capture fails. It never talks, never explains AI, never interrupts, it just chills in the background and gives some life to the app.

### 5. Visual by type

An article, a photo, a PDF, a quote and a note should not all look like generic bookmarks. Each media type gets its own card treatment and its own thumbnail. Keep it that way when adding types.

## A note on taste

Simple software that feels obvious beats impressive machinery. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here. Most work in this repo will be done by agents, sometimes remote. Be careful with data, dev servers, and anything that could damage the session you are working from.

If a rule here fights the task in front of you, say so plainly and get a human sign off before breaking it.

## Glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing inkling.
- **we and maintainers** mean the people building inkling. That is who you are talking to now.
- **user** means the person using inkling, saving things and searching them later.
- **item** means one saved thing in the library, whatever its type. Data, not UI.
- **card** means how an item looks in the grid and in detail. UI, not data.
- **library** means the SQLite database plus the asset store on disk.
- **capture** means getting something into the library. Paste a URL, pick a file, drag in, paste from clipboard, screenshot, or deep link.
- **job** means one unit of background work. OCR, extraction, embeddings, indexing. Runs on a persisted queue with leases.
- **embedding** means the local vector for text or image search. Nomic text and vision share one 768-dimension space.
- **Space** means a saved search shown as a collection. Smart Spaces update themselves. Regular Spaces hold manually user curated items.
- **deep link** means the companion path into the app, `inkling://capture?url=...`.
- **preview** means `bun run preview`, the web-only look without the Rust build.
- **full app** means `bun run tauri dev`, the real Windows desktop app.

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree's path in its argv, and this machine runs several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port from `ss -H -ltnp` after confirming `/proc/<pid>/cwd` is your worktree.

2. **Writing to the live library.** The developer's real data is the SQLite file and asset store the running app owns. Reading it is fine. Copying from it for test fixtures is good. Never start a server against it, never open it read-write, never clean it up.

3. **Baking in local paths and ports.** Never hardcode a localhost port, an absolute user path, or a machine specific model cache path into source or committed config. Preview and the full app must keep working from a fresh clone on another Windows machine. Never commit a database file, a model artifact, a downloaded embedding, or a benchmark output besides the two tracked files. Never commit a pairing secret, token, or full capture URL with real content.

## Hit every surface

The common defect here is a change that works on the path tested and is missing everywhere else. Before calling ingestion or display work done, walk this list and say which entries applied.

- **Entry points.** A behavior reachable from the Add button is usually also reachable from paste, drag and drop, clipboard, screenshot capture, and the deep link. Fixing one is not fixing the feature.
- **Capture paths.** URL, article extraction, image file, screenshot, PDF, note, quote, video link, X post, misc file. An extractor change needs a decision per path, even if the decision is not supported here.
- **Search paths.** Titles, notes, article text, OCR text, domains, authors, manual tags, derived concepts, colors, semantic similarity, dates, types. If you index a new field, say how search reaches it.
- **Card types.** Image, screenshot, article, general website, product, recipe, book, PDF, video, note, quote. Shared thumbnail logic lives in one place. Keep the set coherent.
- **Reverse states.** If you added a way in, add the way out and a way to see it. Trash needs restore. A Space needs rename and delete that keeps its items. A one way door is a bug.
- **App modes.** Preview and the full app behave differently. Native OCR, embeddings, and file access only run in the full app. Do not ship a feature that silently does nothing in one mode.
- **Docs.** Check whether the change makes existing guidance inaccurate. Apply the [documentation rules](#documentation) before adding anything.

## Dev servers

- `bun install` installs. If module resolution looks broken, check the Bun version first. It must match `.bun-version` (1.4.2). `bun run check:bun-version` says so in one line.
- `bun run preview` is the quick web look at the UI. No Rust build, no native OCR or embeddings.
- `bun run tauri dev` is the full Windows desktop app. Needs the Rust toolchain. One toolchain per machine. MSVC when you have admin rights, GNU via scoop when you do not. The README has the exact commands.
- Ports and state come from the dev setup, not from memory. Read the actual terminal output. Do not assume a port.
- Stop what you started, by the handle you tracked. See rule 1.
- Never `Start-Sleep` (or any blocking wait) after launching a server. Start it detached, do other work, then poll its log or port. A sleep blocks you from doing anything else while you wait.

## Test data

An empty library is a bad test. Seed your run with a copy of real data instead of pointing at live state.

- Copy the database file with SQLite backup semantics so the copy is consistent even if the source app is open. A raw file copy of a live database is a corrupt copy. Bring the `-wal` and `-shm` siblings when you copy raw, or better, back up through the engine.
- Data flows one way. Into your sandbox, never back out. Copy in, never symlink. Never write your test edits back to the source.
- Bring assets only for the items your flow needs. Do not copy the whole asset store to test one card.
- The committed demo seed in `public/seed-demo/` plus `src/seedPersonal.ts` is the safe default for UI work. It shuffles with a fixed seed so the order is mixed but stable. Prefer it over real data when it covers your case.
- Never commit a copied database, a real user item, or a downloaded model. The gitignore already excludes run artifacts. Keep it that way.

## Verifying

- Smallest proof that the change works. `bun test <files>` for the tests you touched, targeted lint and typecheck for the scope you changed. The full frontend check is `bun run check:frontend`, which is what CI runs. Do not run it unless you changed something broad or the user asked.
- **Do not run repo-wide checks.** No full `bun test` sweep, no full `tsc`, no full Rust `cargo test` unless asked. CI owns the full suite.
- Test meaningful logic or observable behavior. Do not render components to static markup just to assert props, and do not add tests that mirror the implementation or assert wiring with no behavior.
- Ingestion and background changes ship with focused tests for that behavior. Extraction, OCR scoring, queue leases, recovery. A behavior change with no test is unfinished.
- Background work is async. Wait on real completion, job drains and lease states, never on fixed sleeps. A test that needs a timeout to pass is wrong.
- UI changes need one real pass in the running app before you call them done. Preview for layout, full app for anything native. Take a screenshot through the harness so the user can see it. Ask permission before driving a browser or the desktop on your own.
- Rust changes get `cargo fmt` and the focused test for the module. There are no local hooks — CI runs `cargo fmt --check` and the frontend check.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(reader): code blocks keep line breaks`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as `.github/pr-assets/`.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Linear issues

- One Linear issue owns one task (e.g. `SQU-6`). That issue is the tracker — not `roadmap.md`, not a plan file.
- Before starting: read the issue + comments, move it to In Progress, branch from its `gitBranchName`.
- While working: post major progress as issue comments, never rewrite the description. Keep scratch outside the worktree.
- Monitor by reading status + comments only. Don't start work on an issue already In Review unless asked.
- Before finishing: link the PR to the issue at the top of the description before all content, move it to In Review, tick the `roadmap.md` box and add a changelog line referencing the issue ID in the same PR.
- If merged: move the issue to Done. A merged PR is the implementation record, don't keep a second checklist.

## Documentation

Most code changes need no docs change. Agents can read the code.

- Product intent lives in `docs/product.md` and `docs/product-behavior.md`. Architecture reasons live in `docs/tech-stack.md`. Standing goes in `docs/roadmap.md`. What changed goes in `docs/changelog.md`. Do not invent a second place for the same fact.
- Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the relevant code answers the question, leave it out.
- Do not document every feature, enumerate fields or methods, narrate control flow, maintain file catalogs, or append PR summaries. Types, tests, and code already record the implementation. The glossary defines shared vocabulary; it is not a feature index.
- Keep a local implementation explanation in a nearby code comment. Use an internal doc when the reasoning crosses boundaries or needs context the code cannot carry well. Link to the relevant source instead of copying it.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not append another account of the new behavior. A new internal page needs a distinct, durable reason to exist.
- Keep user docs in the shipped product's voice, without implementation details or contributor tooling. Update the relevant feature section when how to use it changes. A UI tweak does not need a documentation entry, and a new control does not need its own page. A settings path is useful; descriptions of visible buttons, icons, layouts, animations, or every UI state are not. Before adding text, ask what task or decision it helps the user with.
- The changelog rules live at the top of `docs/changelog.md` and still apply. One line per entry, grouped under Added, Changed, Fixed, Removed, Deprecated, Security. Trivial edits skip the changelog. Never write that an agent did the work.
- `docs/operations/` holds maintainer setup, release, and debugging procedures. Keep instructions for operating an installed inkling version in the user guides.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree. `.plans/` is gitignored only as a safety net for legacy tooling.
- Track active maintainer work in the GitHub issue or project item that owns it. External proposals follow `CONTRIBUTING.md` and belong in Ideas discussions.
- A merged PR is the implementation record. Close or update its tracking item when the work lands; do not preserve a second checklist in the repository.
- While completing work, keep `docs/changelog.md` current per its own header rules. Close out the entry before starting an unrelated task so entries do not blur together. Organize details in the Unreleased section as you work or if you notice that changes are piling up so it doesn't become messy. Always ask the developer before making those types of changes but do not ask after every change, only after important or large amounts of work are done.

## How it works

Capture creates the item immediately, then background jobs do the slow parts. Normalize, extract text and metadata, run OCR or PDF extraction or article parsing, generate embeddings, update the FTS and vector indexes, recalculate Space membership. The user keeps browsing or does something else while jobs run. A job can be retried, its lease can expire, and interrupted jobs recover on restart.

Search combines exact FTS over content, notes, and OCR text with semantic similarity over local embeddings. Smart Spaces are saved searches that reevaluate as items arrive.

The Tauri core owns files, the job queue, the database, and model execution. The webview never gets raw filesystem or shell access. Fetched HTML is untrusted. It gets sanitized, embeds pass an allowlist, scripts and event handlers are stripped.

Full reasoning in `docs/tech-stack.md`. Behavior contract in `docs/product-behavior.md`.

## Where code lives

- `src/` is the React and TypeScript frontend. Entry at `src/main.tsx`.
- `src/lib/ingestion/` is the capture and extraction pipeline. Defuddle, metadata fallback, sanitizing, video link handling.
- `src/components/` holds cards, grid, reader, and Spaces UI. Shared card art lives with the media component.
- `src-tauri/src/` is the Rust core. Storage, jobs, PDF, OCR bridges, embeddings, assets.
- `benchmarks/` holds the 48 item corpus, the harness, expected outputs, and results. Only `results-latest.json` and `summary.md` are tracked.
- `public/seed-demo/` plus `src/seedPersonal.ts` is the committed demo library for UI work.
- `docs/` holds product, behavior, stack, roadmap, and changelog. No other docs home exists yet.

## Taste

- Complexity belongs at the adapter boundary. Ingestion stays explicit, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users should never notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations(with a slight execption for the mascot); they peg the GPU on high-refresh displays.
- Capture paths stay fast and forgiving. Keep partial results when extraction fails. A URL with a title and domain beats an error card.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Working in this harness

These apply whenever you run inside T3 Code only, and they override nothing above.

- Screenshots the user must see never render from tool results. Save with `screenshot_out_file` to `C:\Users\$USER$\AppData\Local\Temp\agents\chat-images\$TASK$`, create it if missing, and embed with `![what](C:\...\chat-images\$TASK$\name.png)`. Only that subfolder may be wiped. Prefer full window shots unless asked to show one section.
- You can drive the native desktop app through the tauri-plugin-mcp-bridge alongside any other computer use tools you have in your harness.
- Browser tools drive the web counterpart of the app when it is running.

## Additional tips

- Do not verify with browsers or computer use unless the user agrees or asks.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features. The threat model is untrusted web content rendered locally, per `docs/tech-stack.md`. Keep sanitizing and allowlists strict. Keep dev ergonomics simple.
