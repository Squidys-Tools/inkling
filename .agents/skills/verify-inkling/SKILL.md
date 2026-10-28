---
name: verify-inkling
description: Drive the inkling Electron desktop app as a user would and prove a feature works. Use when a change touches capture, search, Spaces, note editing, archive or restore, or any user-visible behavior, and you need launch, doctor, drive, evidence, and cleanup on Windows or Linux (Linux runs under Xvfb). Uses CDP against an isolated scratch library; never the real user library.
---

# verify-inkling

Proves inkling behavior by driving the real Electron app over Chrome DevTools Protocol against a scratch data dir. The feature map lives in `features/`; start at `features/README.md` and drive one feature per run.

## Rules

- Use only the scratch library under `<tmpdir>/verify-inkling-run/<NAME>/library` (override the parent with `INKLING_VERIFY_DIR`). Never point at the developer's real library, never copy from it.
- Stop only the pid this run recorded in `electron.pid` after confirming its cmdline. Never `pkill`, never match processes by name.
- Run one integrated pass per change. Do not run the full suite; CI owns it.
- Linux cannot verify Windows-only behavior (OCR through Windows.Media, WebView2). Report those as unverified.
- Drive through the UI handles below, not internal setters or test-only endpoints.

## Setup

Use the Bun version in `.bun-version`; `bun run check:bun-version` says if it is wrong.

```sh
bun install
bun run build:app      # produces dist/; prints "No demo seed in N built files"
```

Bun skips Electron's download script, so a fresh install has no `node_modules/electron/dist`. Run `node node_modules/electron/install.js` once from the repo root before the first launch.

## Launch

Same commands on Windows and Linux. Launch starts Electron detached and returns once the app page is listed:

```sh
bun .claude/skills/verify-inkling/scripts/instance.mjs launch
```

It runs `node_modules/electron/dist/electron .` with `--remote-debugging-port=9333 --user-data-dir=<tmpdir>/verify-inkling-run/default/library`, writing `electron.pid` and `electron.log` beside the library. On Linux with no `DISPLAY` it wraps Electron in `xvfb-run -a` and adds `--no-sandbox`. It also passes `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows` and `--disable-features=CalculateNativeWinOcclusion`: an occluded window reports `visibilityState` "hidden" and stops firing animation frames, which strands the item overlay mid-close and hangs motion-gated steps. Ready means `app://local/index.html` is listed at `http://127.0.0.1:9333/json/list`, which takes about 10 seconds. Launch refuses when the port already has an owner. Other dev servers on the machine often hold 9333, so set `INKLING_VERIFY_PORT` to a free port and pass it to doctor, drive, and cleanup as well. The first launch against an empty dir shows "0 items in library".

Two instances side by side: give each its own name and port, `INKLING_VERIFY_NAME=b INKLING_VERIFY_PORT=9334 bun .claude/skills/verify-inkling/scripts/instance.mjs launch`, then pass the same two variables to doctor, drive, and cleanup.

## Doctor

Read-only. Run it first whenever anything looks off:

```sh
bun .claude/skills/verify-inkling/scripts/instance.mjs doctor
```

Every line must read PASS and the exit code must be 0: pidfile present, pid alive, pid runs our scratch dir, CDP port owned by that pid, app page loaded, library database exists, renderer build present. Doctor cannot see a hidden window. If a step stalls on an animation, check `document.visibilityState`; anything but "visible" means relaunch.

## Drive

`scripts/drive.mjs` runs an ordered list of steps against the page and writes evidence. Steps are JSON objects with one key each:

- `click`: CSS selector, clicks the first match.
- `clickText`: `{selector, text}`, clicks the first match whose text contains `text`.
- `fill`: CSS selector plus `text`, focuses, selects the field's text (inputs and textareas only), and inserts text. For a contenteditable, first run an `expect` that calls `getSelection().selectAllChildren(el)`, or `fill` inserts at the caret.
- `key`: `Enter`, `Escape`, or a single character.
- `wait`: selector that must appear.
- `expect`: JavaScript expression that must become true.
- `shot`: PNG filename written into the evidence dir.

Each step may set `label`, and `timeoutMs` (default 8000). `clickText` does not wait; it fails at once if nothing matches yet. A failed step writes `failure.png` and stops the run, and a page that stops answering for 20 seconds fails the step instead of hanging the run.

```sh
bun .claude/skills/verify-inkling/scripts/drive.mjs 9333 <steps.json> .artifacts/verify-inkling/<run-name>
```

Selectors come from `src/App.tsx` and `src/features/item-view/`. Prefer the aria-label, title, and class names listed in each feature file over coordinates. Every feature file carries a step list that was driven end to end on Windows. Compose them in order when a feature needs state: capture-note creates the cards the others use.

## Evidence

Every run writes to `.artifacts/verify-inkling/<run-name>/` (gitignored):

- `steps.log`: one PASS or FAIL line per step.
- `console.log`: renderer console, exceptions, and log entries captured during the run.
- Numbered screenshots from `shot` steps, plus `failure.png` on a failed step.
- Database proof: read the scratch `library.sqlite3` with bun's `bun:sqlite` in readonly mode, for example `items` rows with `kind`, `body`, `archived`. Include the query output in the run notes.

A proof must show the user action, the visible result, and the stored side effect. A card on screen with no row in `items` is not a pass, and neither is a row with no card.

## Cleanup

Run this after every run, including failed ones:

```sh
bun .claude/skills/verify-inkling/scripts/instance.mjs cleanup
```

It stops only the recorded pid, then removes that instance's scratch library and pidfile. It confirms the pid's command line names the scratch library first, so a recycled pid is never touched. It never touches `.artifacts/`. Confirm afterwards with `ls .artifacts/verify-inkling/<run-name>/` that the evidence survived, and that `<tmpdir>/verify-inkling-run/<NAME>/library` is gone.

## Known platform noise

On Linux, Xvfb has no dbus session, so dbus and dconf errors in `electron.log` are environment noise, not app errors. The sharp Linux warning is also environment-only. Packaged Linux PDF.js worker failure is pre-existing and not caused by this skill.

## Keeping the map current

When a feature's selectors or flow change, update its file in `features/`. `/maintain-verification-skill` is the maintenance loop for keeping this map honest.
