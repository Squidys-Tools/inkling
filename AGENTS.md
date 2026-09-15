# inkling

inkling is a quiet home for everything worth keeping. Articles, images, screenshots, PDFs, notes, quotes, video links. A Tauri 2 desktop app on Windows. React, TypeScript and Vite in front, Rust and SQLite behind. Everything stays on the machine.

Think of it as a private visual library with search as the organizer. No folders to maintain. Save in seconds, find it later by describing it.

## What makes inkling special

People keep things here they do not want to lose. These are the parts we never trade away.

### 1. Capture is instant

Saving must be faster than deciding where something belongs. The card appears right away. OCR, embeddings and indexing run in the background while the user keeps browsing. A change that blocks capture on processing is a bug, no matter how correct the processing is.

### 2. Local first, for real

The library lives in SQLite on the user's disk, with files kept as content addressed assets beside it. No account, no feed, no tracking. Network is only for fetching a URL the user asked to save, or the one time model download. Do not add calls home, analytics, or silent uploads.

### 3. Quiet intelligence

AI helpers stay invisible. They make search better. Never surface confidence scores, AI labels, tag correction flows, or model management chores in the main interface. Never rewrite a user title, note, or tag. When AI fails, fall back to plain metadata and text search.

### 4. Visual by type

An article, a photo, a PDF, a quote and a note do not all look like generic bookmarks. Each type gets its own card treatment and its own thumbnail. Keep it that way when adding types.

## A note on taste

Simple systems that feel obvious beat impressive machinery. Do not keep complexity because it already exists. Do not add layers because they look architectural. Find the real constraint, then pick the smallest change that makes the behavior unsurprising.

Measure twice, cut once, and do not build what is not asked for. Honor the intent in a minimal and realistic way. Fight scope creep.

The rest of this file is good defaults, not hard law. Explicit user direction overrides anything here. Most work in this repo will be done by agents, sometimes remote. Be careful with data, dev servers, and anything that could damage the session you are working from.

If a rule here fights the task in front of you, say so plainly and get a human sign off before breaking it.

## Glossary

Use these words when you talk about the work.

- you means the agent reading this file and changing inkling.
- we and maintainers mean the people building inkling. That is who you are talking to.
- user means the person saving things and searching them later.
- item means one saved thing in the library, whatever its type.
- capture means getting something into the library. Paste a URL, pick a file, drag in, paste from clipboard, take a screenshot, or use the deep link.
- card means how an item looks in the grid and in detail.
- Space means a saved search shown as a collection. Smart Spaces update themselves. Regular Spaces hold picked items.
- job means one unit of background work. OCR, extraction, embeddings, indexing. Jobs run on a persisted queue with leases.
- embedding means the local vector for text or image search. Nomic text and vision share one 768 dimension space.
- library means the SQLite database plus the asset store on disk.
- deep link means the companion path into the app, `inkling://capture?url=...`. Older `mymind://` links still work.
- preview means `bun run preview`, the web only look at the UI without the Rust build.
- full app means `bun run tauri dev`, the real Windows desktop app.

## The three ways to hurt yourself

1. Killing by pattern. Never `pkill`, `taskkill /IM`, or stop a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree path in its argv, and this machine runs several dev servers at once. Stop only a process you started and tracked, or confirm ownership first.

2. Writing to the live library. The developer's real data is the SQLite file and asset store the running app owns. Reading it is fine. Copying from it for test fixtures is good. Never open it read write, never point a dev build at it, never delete from it, never clean it up.

3. Baking in local paths and ports. Never hardcode a localhost port, an absolute user path, or a machine specific model cache path into source or committed config. Preview and the full app must keep working from a fresh clone on another Windows machine. Never commit a database file, a model artifact, a downloaded embedding, or a benchmark output besides the two tracked files. Never commit a pairing secret, token, or full capture URL with real content.

## Hit every surface

The common defect here is a change that works on the path tested and is missing everywhere else. Before calling ingestion or display work done, walk this list and say which entries applied.

- Entry points. A behavior reachable from the Add button is usually also reachable from paste, drag and drop, clipboard, screenshot capture, and the deep link. Fixing one is not fixing the feature.
- Capture paths. URL, article extraction, image file, screenshot, PDF, note, quote, video link, X post, misc file. An extractor change needs a decision per path, even if the decision is not supported here.
- Search paths. Titles, notes, article text, OCR text, domains, authors, manual tags, derived concepts, colors, semantic similarity, dates, types. If you index a new field, say how search reaches it.
- Card types. Image, screenshot, article, general website, product, recipe, book, PDF, video, note, quote. Shared thumbnail logic lives in one place. Keep the set coherent.
- Reverse states. If you added a way in, add the way out and a way to see it. Trash needs restore. A Space needs rename and delete that keeps its items. A one way door is a bug.
- App modes. Preview and the full app behave differently. Native OCR, embeddings, and file access only run in the full app. Do not ship a feature that silently does nothing in one mode.
- Docs. Check whether the change makes existing guidance wrong. Apply the documentation rules below before adding anything.

## Dev servers

- `bun install` installs. If module resolution looks broken, check the Bun version first. It must match `.bun-version` (1.4.0). `bun run check:bun-version` says so in one line.
- `bun run preview` is the quick web look at the UI. No Rust build, no native OCR or embeddings.
- `bun run tauri dev` is the full Windows desktop app. Needs the Rust toolchain. One toolchain per machine. MSVC when you have admin rights, GNU via scoop when you do not. The README has the exact commands.
- Ports and state come from the dev setup, not from memory. Read the actual terminal output. Do not assume a port.
- Stop what you started, by the handle you tracked. See rule 1.

## Test data

An empty library is a bad test. Seed your run with a copy of real data instead of pointing at live state.

- Copy the database file with SQLite backup semantics so the copy is consistent even if the source app is open. A raw file copy of a live database is a corrupt copy. Bring the `-wal` and `-shm` siblings when you copy raw, or better, back up through the engine.
- Data flows one way. Into your sandbox, never back out. Copy in, never symlink. Never write your test edits back to the source.
- Bring assets only for the items your flow needs. Do not copy the whole asset store to test one card.
- The committed demo seed in `public/seed-demo/` plus `src/seedPersonal.ts` is the safe default for UI work. It shuffles with a fixed seed so the order is mixed but stable. Prefer it over real data when it covers your case.
- Never commit a copied database, a real user item, or a downloaded model. The gitignore already excludes run artifacts. Keep it that way.

## Verifying

- Smallest proof the change works. `bun test <files>` for the tests you touched. Targeted typecheck for the scope you changed. The full frontend check is `bun run check:frontend`, which is what CI runs. Do not run it unless you changed something broad or the user asked.
- Do not run repo wide checks by default. No full `bun test` sweep, no full `tsc`, no full Rust `cargo test` unless asked. CI owns the full suite.
- Test meaningful logic or observable behavior. Do not render components to static markup just to assert props, and do not add tests that mirror the implementation or assert wiring with no behavior.
- Ingestion and background changes ship with focused tests for that behavior. Extraction, OCR scoring, queue leases, recovery. A behavior change with no test is unfinished.
- Background work is async. Wait on real completion, job drains and lease states, never on fixed sleeps. A test that needs a timeout to pass is wrong.
- UI changes need one real pass in the running app before you call them done. Preview for layout, full app for anything native. Take a screenshot through the harness so the user can see it. Ask permission before driving a browser or the desktop on your own.
- Rust changes get `cargo fmt` and the focused test for the module. The pre commit hook runs fmt on staged Rust files. The pre push hook runs the frontend check.

## Pull requests

- Never open a PR unless asked.
- Keep it small. One concern per PR. If the description says also, split it.
- Title in plain language with a scope. `fix(reader): code blocks keep line breaks`.
- Body states the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before and after images. Motion or timing needs a short video. Upload evidence to the PR. Never commit PR only screenshots or assets.
- When babysitting a PR, check what is newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when checks are green on the latest commit.

## Documentation

Most code changes need no docs change. Agents can read the code.

- Product intent lives in `docs/product.md` and `docs/product-behavior.md`. Architecture reasons live in `docs/tech-stack.md`. Standing goes in `docs/roadmap.md`. What changed goes in `docs/changelog.md`. Do not invent a second place for the same fact.
- Before adding a paragraph, ask what someone would get wrong without it. If reading the code answers the question, leave it out.
- Do not document every feature, list fields or methods, narrate control flow, keep file catalogs, or paste PR summaries. Types, tests, and code already record the implementation.
- Put a usage note near the code when the reasoning fits in a comment. Reach for a docs page only when the reasoning crosses boundaries or the code cannot carry it.
- When a documented decision changes, rewrite the affected text. Do not append a second account of the new behavior.
- User facing wording stays in the product voice, without implementation detail or contributor tooling. A UI tweak needs no docs entry. A new control needs no page of its own.
- The changelog rules live at the top of `docs/changelog.md` and still apply. One line per entry, grouped under Added, Changed, Fixed, Removed, Deprecated, Security. Trivial edits skip the changelog. Never write that an agent did the work.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep working material outside the worktree. `.plans/` is gitignored as a safety net for tooling that writes there.
- Track active work in the issue or task that owns it. A merged PR is the implementation record. Update the roadmap and changelog when work lands. Do not keep a second checklist in the repo.
- While completing work, keep `docs/changelog.md` current per its own header rules. Close out the entry before starting an unrelated task so entries do not blur together.

## How it works

Capture creates the item immediately, then background jobs do the slow parts. Normalize, extract text and metadata, run OCR or PDF extraction or article parsing, generate embeddings, update the FTS and vector indexes, recalculate Space membership. The user keeps browsing while jobs run. A job can be retried, its lease can expire, and interrupted jobs recover on restart.

Search combines exact FTS over content, notes, and OCR text with semantic similarity over local embeddings. Smart Spaces are saved searches that reevaluate as items arrive.

The Tauri core owns files, the job queue, the database, and model execution. The webview never gets raw filesystem or shell access. Fetched HTML is untrusted. It gets sanitized, embeds pass an allowlist, scripts and event handlers are stripped.

Full reasoning in `docs/tech-stack.md`. Behavior contract in `docs/product-behavior.md`.

## Where code lives

- `src/` is the React and TypeScript frontend. Entry at `src/main.tsx`.
- `src/lib/ingestion/` is the capture and extraction pipeline. Defuddle, metadata fallback, sanitizing, video link handling.
- `src/components/` holds cards, grid, reader, and Spaces UI. Shared card art lives with the media component.
- `src-tauri/src/` is the Rust core. Storage, jobs, PDF, OCR bridges, embeddings, assets.
- `benchmarks/` holds the 48 item corpus, the harness, expected outputs, and results. Only `results-latest.json` and `summary.md` are tracked.
- `scripts/` holds repo tooling, including the idempotent hook installer.
- `public/seed-demo/` plus `src/seedPersonal.ts` is the committed demo library for UI work.
- `docs/` holds product, behavior, stack, roadmap, and changelog. No other docs home exists yet.

## Taste

- Complexity belongs at the adapter edge. Ingestion stays explicit, UI stays plain.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. Use them for functions, not for narrating each line.
- Users notice a dropped frame, a lying spinner, and a stale label. No constantly repainting animation. It burns the GPU on high refresh displays.
- Capture paths stay fast and forgiving. Keep partial results when extraction fails. A URL with a title and domain beats an error card.

## Working in this harness

These apply whenever you run inside T3 Code, and they override nothing above.

- Screenshots the user must see never render from tool results. Save with `screenshot_out_file` to `C:\Users\$USER$\AppData\Local\Temp\$HARNESS$\chat-images\`, create it if missing, and embed with `![what](C:\...\chat-images\name.png)`. Only that subfolder may be wiped. Prefer full window shots unless asked to show one section.
- You can drive the native desktop app through the tauri-plugin-mcp-bridge alongside any other computer use tools you have.
- Browser tools drive the web counterpart of the app when it is running.
- Keep `docs/changelog.md` current as you work, per its header rules.

## Additional tips

- Do not verify with browsers or computer use unless the user agrees or asks.
- Security matters, but do not over index on it for local only dev paths. The threat model is untrusted web content rendered locally, per `docs/tech-stack.md`. Keep sanitizing and allowlists strict. Keep dev ergonomics simple.
