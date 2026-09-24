---
name: verify-inkling
description: Launch inkling, check that the instance is worth driving, and prove user-facing behavior in the running UI through the seeded web preview and, when needed, the full desktop app.
---

# Verify inkling

inkling is a Tauri 2 Windows desktop app: React, TypeScript, and Vite in front, Rust and SQLite behind. One frontend has two surfaces to drive:

- **Web preview.** `bun run dev` serves the same frontend in Chrome, Edge, or Chromium with the committed demo seed of 28 items in a fixed shuffle. No Tauri internals are available, so `shouldUseSeedLibrary()` is true and mutations stay in browser memory. This is fast, deterministic, and isolated.
- **Full app.** `bun run tauri dev` loads the same frontend with the Rust core. OCR, PDF extraction, embeddings, file access, SQLite, export, the extension receiver, and the `inkling://capture` deep link exist only here.

`docs/tech-stack.md` owns the architecture. This file owns how to prove behavior.

Use the web preview for client-side behavior. Use the full app for Rust-backed behavior. If the session cannot drive the full app, report that path as unverified.

## Launch

Run from the repository root. Bun must match `.bun-version`.

```powershell
$RUN = Join-Path $env:TEMP ("inkling-verify\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $RUN | Out-Null
bun run check:bun-version

# Server first. It picks a free port and waits until it answers.
bun .agents/skills/verify-inkling/harness.mjs serve --run-dir $RUN > (Join-Path $RUN "serve.out") 2>&1
Get-Content (Join-Path $RUN "serve.out")

# Browser second. It picks a free debug port, navigates, and waits for the app.
bun .agents/skills/verify-inkling/harness.mjs start --run-dir $RUN > (Join-Path $RUN "start.out") 2>&1
Get-Content (Join-Path $RUN "start.out")
```

Both commands print `ready: <url>`. Ports, process ids, and URLs live in `<run-dir>/server.json` and `<run-dir>/browser.json`.

**Redirect both launch commands, then read their output files.** They leave detached children running. On Windows, those children inherit the caller's output pipe, so a piped launch can look unfinished after the app is ready. Other harness commands exit normally and can be piped.

Neither launch command assumes a port. A developer's `bun run dev` may hold port 1420, and other worktrees may run their own servers. `serve` and `start` request free ports, record them, and refuse to reuse a run dir with a live process.

Modes:

- `serve --mode preview` serves `dist/`. Run `bun run build` first. Use it to verify the production bundle.
- `serve --port <n>` pins a port when the URL must stay stable.
- `start --headful` shows the browser window. Ask the user before driving it. Headless mode is the default.

## Doctor

```powershell
bun .agents/skills/verify-inkling/harness.mjs doctor --run-dir $RUN
```

The doctor prints one PASS or FAIL line per check and exits non-zero on failure. Run it after launch and whenever a drive result looks wrong.

| Check | What a failure means |
| --- | --- |
| Bun matches `.bun-version` | Fix the Bun version before trusting the run. |
| Dev server process alive / answers | The recorded server exited or stopped answering. Start a fresh run. |
| Browser process alive | The recorded browser exited. Start a fresh run. |
| Browser debug port is ours | Another browser owns the debug port, or no browser does. Start a fresh run. |
| Drive target is the app page | The page target is missing or belongs to another run. |
| Seed library is active | `[data-testid="web-preview-badge"]` is missing, so this is not the seeded preview. |
| Library rendered results | `.result-count` is missing even though the app shell rendered. Read `<run-dir>/server.log` and page errors. |
| Page reported no runtime errors | The page recorded an `error` or `unhandledrejection` event. |

The doctor also reports live processes in other run dirs. Never drive an instance this run did not start.

## Drive

`bun .agents/skills/verify-inkling/harness.mjs <command> --run-dir $RUN [options]`

| Command | Behavior |
| --- | --- |
| `wait --selector`, `wait --text`, `wait --expr` | Poll until the condition holds. `--timeout <ms>` defaults to 30000. |
| `click --selector`, `click --text "<label>"` | Press and release a real pointer event at the target center. Scope repeated labels with `--within <selector>`. |
| `type --selector --text "<value>"` | Focus the field, select its content, and insert through the real editing pipeline. Typing again replaces the value. |
| `focus --selector` | Focus an element without clicking it. |
| `key --key <Escape\|Enter\|Tab\|Slash>` | Press one key on the focused element. |
| `text --selector` | Print the element's `innerText`, or `(not found)`. |
| `eval --expr "<js>"` | Evaluate JavaScript in the page and print the JSON result. |
| `shot --out <path.png>` | Save a viewport screenshot. Use `.jpg` for JPEG. |
| `navigate --url <url>` | Navigate and wait for `document.readyState === "complete"`. |
| `stop` | Stop the recorded browser and server. |

Use the app's own handles:

| Surface | Handle |
| --- | --- |
| App shell / seed marker | `.app-shell`, `[data-testid="web-preview-badge"]` |
| Result count and context | `.result-count`, `.result-context`, `.search-context`, `.save-space-link` |
| Search field | `[aria-label="Search your mind"]`; `/` focuses it |
| Add menu | `.add-button`, `.capture-modal`, `[aria-label="Close add menu"]` |
| Capture kinds | `Note`, `Link`, `File`, `Quote`, `Screenshot` |
| Capture fields | `[aria-label="New note"]`, `[aria-label="URL to save"]`, `[aria-label="Quote text"]`, `[aria-label="Quote attribution"]`, `[aria-label="Quote source URL"]` |
| Capture submit / failure | `.capture-save`, `.capture-cancel`, `.capture-error`, modal `[role="alert"]` |
| Navigation | `nav[aria-label="Main navigation"]`, `.nav-count` |
| Spaces | `[aria-label="Add a Space"]`, `.space-list`, `.space-item`, `.space-dot`, `.space-count`, `[aria-label="Space name"]`, `.space-rename-input` |
| View switch | `[aria-label="Grid view"]`, `[aria-label="List view"]`, `.library-grid.list-mode` |
| Cards | `.library-card`, `[data-library-item-id]`, `.card-kicker`; only the virtualized window is mounted |
| Item overlay | `[aria-label="Close details"]`, `[aria-label="Forget this item"]`, `[aria-label="New tag name"]`, `[aria-label="Copy link to original"]` |
| Reader | `[aria-label="Close reader (Escape)"]`, `.reader-font-picker` |
| PDF viewer | `[aria-label="Next page"]`, `[aria-label="Previous page"]`, `[aria-label="Page number"]`, `[aria-label="Zoom in"]`, `[aria-label="Close viewer"]` |
| Settings tabs | `[aria-label="Settings"]`, `[aria-label="Close settings"]`, `.settings-modal-sidebar`, `Archive`, `Data`, `Extension` |
| Archive | `[aria-label="Archive actions"]`, `.settings-panel-count`, `.settings-selected-count`, `.settings-archive-actions`, `.settings-archive-grid`, `.settings-empty-state` |
| Export | `.settings-panel-note`, `.settings-data-card`, `.settings-data-button.is-busy`, `.settings-data-hint`, `.settings-data-result`, `.settings-data-summary`, `.settings-data-path` |
| Extension | `[aria-label="Pairing token"]`, `[aria-label="Pairing token hidden"]` |
| Mascot | `[aria-label="inkling mascot"]` |
| Empty library state | `.empty-state` |

Keep assertions honest:

- Wait for the value. Do not sleep for the search debounce, card animation, or background state.
- Use `.result-count` and `.nav-count` for totals. A `.library-card` count is only the mounted virtualized window.
- Use `textContent` for content that may be offscreen. `innerText` can be empty for a mounted but off-screen card.
- Before addressing a card by id, reset `.library-grid[data-testid="virtuoso-scroller"]` to `scrollTop = 0`, then wait for the card. Setting `scrollTop` on the outer `.library-grid` does nothing.
- Use compound selectors when the same label appears in more than one surface.

## Evidence

A proof lives in `<run-dir>`:

```text
<run-dir>/
  serve.out  start.out  doctor.out
  server.json  browser.json
  server.log
  shots/*.png
  transcript.jsonl
  chrome-profile/
```

- Drive the user path with real clicks, keys, and typed text. Do not call `invoke` handlers or reach into React state.
- Capture the action and resulting state. For capture, keep the before screenshot, filled form, after screenshot, and asserted counts.
- Verify the state change, not only the screenshot. Check totals, the new or restored card, and a second read such as search.
- The preview cannot prove OCR, thumbnail generation, embeddings, PDF extraction, jobs, export, the extension receiver, or the deep link. Report those paths as unverified unless the full app was driven.
- Save screenshots shown to the user under `C:\Users\$USER$\AppData\Local\Temp\$HARNESS$\chat-images\` and embed them in the reply. Copies under `<run-dir>/shots/` preserve the proof after teardown.

Read [features/README.md](./features/README.md) before driving. Its feature contracts define the entry points, user path, observable result, and known limits for each area.

## Cleanup

```powershell
bun .agents/skills/verify-inkling/harness.mjs stop --run-dir $RUN
```

`stop` kills only the process ids recorded by this run, then confirms the debug port is released. Never match processes by name or path.

Keep the screenshots, transcript, and launch logs until the user finishes reviewing the proof. `stop` leaves a disposable `chrome-profile/` of about 100 MB. Delete only that folder after the round:

```powershell
Get-ChildItem -Directory (Join-Path $env:TEMP "inkling-verify") -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath (Join-Path $_.FullName "chrome-profile") -Recurse -Force -ErrorAction SilentlyContinue }
```

Never point a run at the live library. The preview uses `public/seed-demo/` and `src/seedPersonal.ts`. Read a real database only through a consistent copy.

## The full desktop app

`bun run tauri dev` needs the Rust toolchain and free port 1420. If another process owns that port, do not kill it. In order of cost:

1. Verify non-native behavior in the web preview.
2. Use `bun run preview:win` for a self-contained review app under `.artifacts/inkling-preview-win` with its own `data\` directory. The first build needs network access and time for the pinned ONNX Runtime files and models.
3. Use `bun run tauri dev` when port 1420 is free.

Native behavior is driven through `tauri-plugin-mcp-bridge`. The plugin is registered in `src-tauri/src/lib.rs` and granted `mcp-bridge:default` in `src-tauri/capabilities/default.json`. It uses the first free port from 9223 through 9322 and binds to `0.0.0.0`, which exposes webview script execution to the local network while the app runs. Use it only when the session has the native tools and an isolated app.

## Helpers

`harness.mjs` is the complete harness. It is a Chrome DevTools Protocol client built on `fetch` and `WebSocket`, with no added dependency or install step. It is plain `.mjs` so the frontend TypeScript and dependency checks do not include it. Resolve the browser through `CHROME_PATH`, standard Chrome, Edge, Brave, or Chromium locations, or pass `--chrome <path>`.

Use a separate `--run-dir` for each concurrent run.
