---
name: verify-inkling
description: Launch inkling, check that the instance is worth driving, and prove user-facing behavior in the running UI — the seeded web preview through a headless Chrome CDP harness, with the full desktop app and its native paths called out. Use when a change needs evidence from the running app instead of a test run.
---

# Verify inkling

inkling is a Tauri 2 Windows desktop app: React + TypeScript + Vite in front, Rust + SQLite behind. One frontend, two surfaces to drive:

- **Web preview.** `bun run dev` serves the same frontend the desktop window loads, in plain Chrome, with the committed demo seed (28 items, fixed shuffle). No Tauri internals, so `shouldUseSeedLibrary()` is true and every mutating path falls back to in-memory browser state instead of SQLite. This is the harness below. Fast, deterministic, isolated.
- **Full app.** `bun run tauri dev` compiles the Rust core and loads the same frontend at a fixed Vite port. Native OCR, PDF extraction, embeddings, file access, the library database, export, and the `inkling://capture` deep link only exist here.

`docs/tech-stack.md` owns the architecture reasoning; this file owns how to prove behavior.

Drive the web preview for anything presentational or client-side. Anything that needs the Rust core gets verified in the full app, and if this session cannot drive a window you say so instead of proving it in the preview and calling it done.

## Launch

Run from the repository root. Bun must match `.bun-version`.

```bash
RUN="$TEMP/inkling-verify/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN"
bun run check:bun-version

# Server first: picks a free port, waits until it answers.
bun .agents/skills/verify-inkling/harness.mjs serve --run-dir "$RUN" > "$RUN/serve.out" 2>&1
cat "$RUN/serve.out"

# Then the browser: picks a free debug port, navigates, waits for the app to render.
bun .agents/skills/verify-inkling/harness.mjs start --run-dir "$RUN" > "$RUN/start.out" 2>&1
cat "$RUN/start.out"
```

Both print `ready: <url>`; the URL and ports live in `<run-dir>/server.json` and `<run-dir>/browser.json`.

**Redirect the two launch commands, then read the file back.** They leave a detached child running, and on Windows that child inherits the caller's stdout pipe, so a launch whose output is piped never looks finished even though the app is up. Every other harness command exits on its own and can be piped freely.

Neither command assumes a port. A developer's own `bun run dev` holds the fixed port 1420 (`strictPort`, so a second Vite fails instead of moving), and other worktrees may hold their own servers — both `serve` and `start` ask the OS for free ports, record them, and refuse to double-drive a run dir that already has a live process.

Modes, when `dev` is not what you need:

- `serve --mode preview` serves the production bundle from `dist/`, so `bun run build` has to have run. Good for verifying what ships; `dev` is good for verifying behavior.
- `serve --port <n>` pins a port when you need a stable URL across restarts.
- `--headful` on `start` shows the Chrome window. Ask the user before driving the desktop this way; headless is the default because the point is evidence, not watching.

## Doctor

```bash
bun .agents/skills/verify-inkling/harness.mjs doctor --run-dir "$RUN"
```

Prints one PASS/FAIL line per check and exits non-zero if any fail. Run it after launch and again whenever a drive result looks wrong — it separates "the app is broken" from "this instance is not what I think it is".

| Check | What a failure means |
| --- | --- |
| Bun matches `.bun-version` | Fix the install before trusting anything else. |
| Dev server process alive / answers | The recorded pid is gone or the port stopped answering. Run `serve` again; do not reuse the run dir's stale state. |
| Browser process alive | Chrome from this run exited. Run `start` again. |
| Browser debug port is ours | The recorded debug port answers with a different Chrome, or none. Stop and start a fresh run. |
| Drive target is the app page | The page target is missing or is not this run's URL. |
| Seed library is active | `[data-testid="web-preview-badge"]` is absent: the page is not the seeded preview, so a drive here would not mean what you think. |
| Library rendered results | `.result-count` is missing: the app shell rendered but the library did not. Read `<run-dir>/server.log` and the page errors. |
| Page reported no runtime errors | Errors captured from `window.onerror` and `unhandledrejection` since `start`. |

The doctor also notes live processes in other run dirs so you never drive an instance this run did not start.

## Drive

`bun .agents/skills/verify-inkling/harness.mjs <command> --run-dir "$RUN" [options]`

| Command | Does |
| --- | --- |
| `wait --selector/--text/--expr` | Polls until the condition holds. `--timeout <ms>` defaults to 30000. |
| `click --selector` / `--text "<label>"` | Real mouse press and release at the element's center. `--text` matches a childless span, button, `[role=button]`, link, input, textarea, or card whose trimmed text starts with the label; add `--within <selector>` to scope it. |
| `type --selector --text "<value>"` | Focuses the field, selects its existing content, then inserts through the real editing pipeline (`Input.insertText`), so a React controlled input sees a user edit. Typing twice replaces rather than appends. |
| `focus --selector` | Focuses an element without clicking it, for keyboard paths such as Enter on a Space row. |
| `key --key <Escape\|Enter\|Tab\|Slash>` | One key press on the focused element. |
| `text --selector` | Prints `innerText` of one element, or `(not found)`. |
| `eval --expr "<js>"` | Evaluates in the page and prints the JSON result. Throws on a page exception. |
| `shot --out <path.png>` | Viewport screenshot, PNG by default, `.jpg` for jpeg. |
| `navigate --url <url>` | Navigates and waits for `document.readyState === "complete"`. |
| `stop` | Stops the tracked browser and server. |

Selectors are the app's own handles. Read them here, not off a screenshot:

| Surface | Handle |
| --- | --- |
| App shell / seed marker | `.app-shell`, `[data-testid="web-preview-badge"]` |
| Result count and context | `.result-count` (`28`), `.result-context` (`1 items in library`, `for "<query>"`, `Save as Space`) |
| Search field | `[aria-label="Search your mind"]`; pressing `/` focuses it (`key --key Slash`) |
| Add menu | `.add-button`, dialog `.capture-modal`, close `[aria-label="Close add menu"]` |
| Capture kinds | Buttons labelled `Note`, `Link`, `File`, `Quote`, `Screenshot` |
| Capture fields | `[aria-label="New note"]`, `[aria-label="URL to save"]`, `[aria-label="Quote text"]`, `[aria-label="Quote attribution"]`, `[aria-label="Quote source URL"]` |
| Capture submit | `.capture-save` (`Save to library`), `.capture-cancel` (`Back`) |
| Save failure | `.capture-error`, or `[role="alert"]` inside the modal |
| Navigation | `nav[aria-label="Main navigation"]`: `Everything`, `Top of mind`, `Serendipity`; count in `.nav-count` |
| Spaces | `[aria-label="Add a Space"]`, `.space-list`, `.space-item`, `.space-count`, `[aria-label="Space name"]`, `.space-rename-input`, `.save-space-link` |
| View switch | `[aria-label="Grid view"]`, `[aria-label="List view"]`, `.library-grid.list-mode` |
| Cards | `.library-card`, `[data-library-item-id]`, `.card-kicker` (kind label and relative date in two spans); the grid is virtualized, so only rendered cards are in the DOM |
| Item overlay | `[aria-label="Close details"]`, `[aria-label="Forget this item"]`, `[aria-label="New tag name"]`, `[aria-label="Copy link to original"]` |
| Reader | `[aria-label="Close reader (Escape)"]`, `.reader-font-picker` |
| PDF viewer | `[aria-label="Next page"]`, `[aria-label="Previous page"]`, `[aria-label="Page number"]`, `[aria-label="Zoom in"]`, `[aria-label="Close viewer"]` |
| Settings | `[aria-label="Settings"]`, `[aria-label="Close settings"]`, `.settings-modal-sidebar`, `[aria-label="Archive actions"]`, `.settings-panel-count`, `.settings-selected-count`, `.settings-archive-actions`, `.settings-panel-note`, `.settings-data-card`, `.settings-data-button` (with `.is-busy` while exporting), `.settings-data-hint`, `.settings-data-result` (`.settings-data-summary`, `.settings-data-path` after an export) |
| Mascot | `[aria-label="inkling mascot"]` |
| Empty library state | `.empty-state` |

A `click --text` match prefers a childless span over the control that wraps it, because a label is what a user aims at and some rows put invisible hover controls over their own center. Add `--within` whenever a label can appear in more than one surface, and prefer `--selector` when the app offers a stable one.

Two habits that keep assertions honest:

- **Wait for state, never sleep.** `wait --expr` on the value you are about to assert (for example `document.querySelector(".result-count")?.textContent === "29"`). The capture bar, the search box, and the job poller all update on their own schedule.
- **Assert `textContent`, not `innerText`,** when the element may be offscreen. `.library-card` content sits inside a virtualized masonry, so `innerText` can be empty for a card that exists. `document.body.textContent.includes(...)` and `.library-card` counts are reliable; `.result-count` is the reliable total.
- **Reset the grid's scroll before addressing a card by id.** `click` scrolls its target into view (`block: "center"`), and the virtualized grid unmounts whatever the scroll leaves behind, so a card rendered a moment ago can be gone by the next command. Run `eval --expr 'document.querySelector(".library-grid").scrollTop = 0'` first and `wait` for the card's selector.

## Evidence

A proof is an artifact, in `<run-dir>`:

```
<run-dir>/
  serve.out  start.out  doctor.out   launch and health output
  server.json  browser.json          recorded pids, ports, urls (the tracked handles)
  server.log                         Vite output, including build errors
  shots/*.png                        screenshots
  transcript.jsonl                   one line per harness command
  chrome-profile/                    disposable browser profile
```

Proof standards for this app:

- Exercise the user path: real clicks and typed text through the harness, on the seeded library. Do not drive `invoke` handlers directly, and do not reach into React state.
- Capture the action and the resulting state. For a capture, the before screenshot, the filled form, and the after screenshot all belong in the run — a picture of the finished grid alone does not show what the user did.
- Verify the state change, not just the pixels: `.result-count` and `.nav-count` before and after, the new card in the grid, and the item found again through search. A card that renders but never enters the library is the bug this catches.
- Native-only behavior cannot be proven from the preview. OCR text, thumbnail generation, embeddings, PDF extraction, the job queue, export, and the deep link need the full app; if you cannot drive it, report the feature as unverified rather than substituting a preview result.
- Screenshots meant for the user go to `C:\Users\$USER$\AppData\Local\Temp\$HARNESS$\chat-images\` (create it if missing) and are embedded in your reply. The copies in `<run-dir>/shots/` are the proof that survives teardown.

Feature-by-feature recipes, entry points, and end states are in [features/README.md](./features/README.md). That map is the maintained source: a proof that drives one convenient entry point is incomplete when the map lists others, so say which entry points you actually exercised.

## Cleanup

```bash
bun .agents/skills/verify-inkling/harness.mjs stop --run-dir "$RUN"
```

Stops the browser and the server it recorded, then confirms the debug port is released. It kills the tracked pids only — `taskkill /T` on a recorded root, never a name or path match, because the developer's own dev server and other agents' runs share this machine.

Teardown removes instances, not evidence. `<run-dir>/shots/`, `transcript.jsonl`, and the launch logs stay until the user is done with the round. Remove a run dir only when you created it and the user has finished looking.

`stop` leaves `<run-dir>/chrome-profile/` behind, and it is roughly 100 MB per run of disposable browser state. Delete that folder — not the run dir — once the round is over, and `rm -rf /tmp/inkling-verify/*/chrome-profile` (or the `$TEMP` equivalent) to clear past runs.

Never point a run at the live library. The preview uses the committed seed in `public/seed-demo/` plus `src/seedPersonal.ts`; leave it that way, and read a real database only through a copy if a feature ever needs one.

## The full desktop app

`bun run tauri dev` needs the Rust toolchain and the fixed port 1420 free. If the developer's own dev server already holds 1420, that is not a reason to kill it. Options, in order of cost:

- Verify the behavior in the web preview when it is not native-only.
- `bun run preview:win` builds a self-contained review app under `.artifacts/inkling-preview-win` with its own `data\` directory, so it never touches the live library. It downloads and verifies the pinned ONNX Runtime DLL and models on first build, so it needs network and a few minutes.
- `bun run tauri dev` itself, once 1420 is free.

Native behavior is driven through the `tauri-plugin-mcp-bridge` plugin, which is already registered in `src-tauri/src/lib.rs` and granted `mcp-bridge:default` in `src-tauri/capabilities/default.json`. It binds the first free TCP port from 9223 on `0.0.0.0` (the crate default in `tauri-plugin-mcp-bridge`'s `config.rs`), scanning upward to 9322, and the MCP server that talks to it is a separate client-side package. Use it only when this session actually has those tools; a doctor check for the native path is a listener in that port range plus a window that answers. Note the `0.0.0.0` bind exposes webview script execution on the LAN while the app runs.

## Helpers

`harness.mjs` is the only helper, and it is the whole harness: a Chrome DevTools Protocol client over `fetch` and the built-in `WebSocket`, so it adds no dependency and needs no `bun install` step. It is plain `.mjs` on purpose — `tsconfig.json` includes `src/` and `knip.json` projects `src/**` and `benchmarks/**`, so nothing in the frontend toolchain picks it up. Chrome is resolved from `CHROME_PATH` or the standard install locations; pass `--chrome <path>` to override.

Keep runs side by side: give each run its own `--run-dir`, or reuse `$TEMP/inkling-verify/latest` when you only ever run one at a time.
