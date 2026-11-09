---
name: verify-inkling
description: Drive the real inkling Electron desktop app as a user would (agent-desktop accessibility automation, no CDP) on a throwaway seeded library under the worktree's .dev/, and prove a feature with screenshots plus read-only database rows. Use for any change the user can see or operate, including visual-only ones (layout, styling, card treatment, controls) that no feature file names, and for flows such as capture, note editing, search, Spaces or archive. Needs launch, doctor, drive, evidence and cleanup on Windows.
---

# verify-inkling

Launches `bun run dev:app`'s app (build + Electron) against a scratch library, drives it through the OS accessibility tree with the `agent-desktop` CLI, and records evidence. Start at [features/README.md](features/README.md) and drive one feature per run. If no feature file covers the surface you changed, drive that surface with the same launch, drive, evidence and cleanup steps, and record its entry point in `PROOF.md` where a feature ID would go. Written and proven on Windows 11; macOS and Linux are untested (the helpers have untested POSIX branches).

## Rules

- All verification-only state lives under `<worktree>/.dev/` (library, agent-desktop state, logs). Evidence lives in `<worktree>/.artifacts/verify-inkling/<run>/`, outside `.dev`. Never put evidence under `.dev`.
- One instance per worktree. Cleanup deletes the whole `.dev`, so a second concurrent run would lose its state. `launch` refuses while one is live.
- Never drive an app you did not launch with `launch`: other inkling windows (the user's, other worktrees') are also `electron.exe`. `cleanup` never touches `.dev-library/` (the plain `dev:app` library); the worktree's settle action does delete it, with the other generated scratch.
- Never kill by process name or path pattern. The helpers stop only the pids `launch` recorded, after confirming each pid's command line still names our `.dev` path.
- Drive through visible controls. `set-value` is an accessibility ValuePattern write on a text field, not an internal setter; say so in the report. Key combos use `ad press <combo> --window-id '{window}'` (headless, no focus change). Never add `--headed` (physical cursor/keyboard, takes the user's focus) without the user's say-so.
- What cannot be reached (file pickers, paste, drag and drop, card right-click) is listed in `features/README.md`; report it as unverified. Before calling a path unreachable, check whether the app has its own intake for it: the deep link and the extension receiver are driven without the GUI.
- The scratch library is seeded, not captured. `seedLibrary` (`tools/dev/seeded-library.ts`) writes `items` rows straight into SQLite: no ingestion, no OCR text, no `item_embeddings`, and one failed thumbnail job. Its FTS row comes from a trigger, so text search works on it. A claim that depends on the pipeline (OCR, embeddings, enrichment, job states) needs a real capture through an entry point, and the proof must name that entry point. Put fixtures in through the seed before `launch`. Never write to the scratch library while the app runs: the library utility process owns the SQLite file.

## Operational requirement: settle cleanup (T3)

`t3.json` has an action "Clean up worktree" (`bun tools/repo/clean-worktree.ts`) with `runOnSettle: true`. It removes what this worktree generated: the `.dev/` verification state (its recorded processes stop first, and their logs are kept in `.artifacts/`), `.dev-library/` (the plain `dev:app` library, so data typed into it is lost), `dist/`, and every `node_modules` (root, `extension/`, `apps/*`, `packages/*`, `tools/*`). It keeps source, git state and `.artifacts/`. It refuses and deletes nothing while a process this worktree did not record still references `.dev`, or while an Electron app from this worktree still runs. T3 runs `runOnSettle` actions only for threads with their own worktree (main-checkout threads skip them), **and actions in `t3.json` only take effect after they are imported into the project's Settings > Actions**. Import "Clean up worktree" and remove any older settle action; until then nothing cleans up on settle, so tell the user. Settling closes a running app, so anything you still need from a run must already be in `.artifacts/`. A later run needs the dependency install again (Prerequisites). Stop any dev server you started in this worktree (`bun run dev`, `dev:site`) first: a file it holds open can stop the deletion partway and leave `node_modules` half removed.

## Prerequisites

- Bun per `.bun-version` (`bun tools/repo/check-bun-version.ts`), `bun install` done, `node_modules/electron/dist` present. `agent-desktop` on PATH (`agent-desktop --version`; verified with 1.1.0 — do not take 1.2.0: headless it reads popup menuitems as offscreen and `press` demands OS-focus the window never has).
- An interactive, unlocked desktop session. The app window may be behind others but not minimized (minimized windows are not drivable).

## Launch

```sh
bun .claude/skills/verify-inkling/scripts/instance.ts launch            # seeded demo library (32 items, 3 Spaces)
bun .claude/skills/verify-inkling/scripts/instance.ts launch --empty    # empty library: opens on Welcome, no seed
bun .claude/skills/verify-inkling/scripts/instance.ts launch --skip-build   # reuse dist/ when you know it is current
bun .claude/skills/verify-inkling/scripts/instance.ts launch --link "inkling://capture?url=https://example.com/"   # the app saves the link at startup
```

`--link` passes a plain `inkling://capture?url=...` value to Electron as a launch argument, so it needs no OS registration. Other values are refused.

(All commands below take the same `bun .claude/skills/verify-inkling/scripts/instance.ts` prefix.) Run from inside the worktree.

It clears stale `.dev`, creates `.dev/verify-inkling/<run>/{library,agent-desktop}`, seeds the library with `seedLibrary` from `tools/dev/seeded-library.ts` (the same seed `dev:app` uses; it marks onboarding complete), runs `bun run build:app` (about 10 s warm), then starts `bun tools/dev/dev-app.ts --user-data-dir=<run>/library` detached (this is `dev:app` with an explicit, un-seeded data dir that we seeded ourselves). Ready means: Electron main found, its window listed by `agent-desktop list-windows`, `library.sqlite3` present, and the window snapshot shows the sidebar link "Everything" (or "Skip" with `--empty`). It prints a JSON object with `windowId`, `library`, `evidenceDir`, pids. About 15 s total. Logs: `.dev/verify-inkling/<run>/build.log`, `electron.log`. Cleanup copies both into the run's evidence folder before it deletes `.dev`, failed launches included.

`--empty` opens on the Welcome screen; skip it once (`find --role button --name Skip`, `click`) to reach an empty Everything; that marks onboarding complete in the scratch library.

## Doctor

Read-only. Run it first whenever anything looks off:

```sh
bun .claude/skills/verify-inkling/scripts/instance.ts doctor
```

Every line must be PASS (exit 0): launcher pid alive and owning our `.dev` path, Electron main pid alive and owning it, library opens read-only with an item count, `dist/desktop` built (shows when), window found for our Electron pid, snapshot shows the ready marker. FAIL means relaunch (`cleanup`, then `launch`).

## Drive

The helper wraps `agent-desktop` with `AGENT_DESKTOP_HOME` pointed under `.dev` (so ref/snapshot state is isolated and removed by cleanup). `{window}` expands to our app's window id, resolved from `list-windows` by our Electron pid.

```sh
I="bun .claude/skills/verify-inkling/scripts/instance.ts"
$I tree                                   # flat list: ref role "name" value [actions]; prints the snapshot id
$I tree --surface menu                    # same, while a menu is open
$I ref button "Save to library"          # prints one fresh ref for an exact role + accessible name (retries only retry:safe errors)
$I ad click '@<snapshot>:e<N>'            # quote refs in PowerShell: a bare @token is the splatting operator
$I ad set-value '@<snapshot>:e<N>' 'text'
$I ad expand '@<snapshot>:e<N>'
$I window                                 # prints the main window id
$I windows                                # all our windows; a native dialog shows up as `other`
$I ad press ctrl+k --window-id '{window}' # key combo to our window, no focus change (result is delivered_unverified: check the effect)
$I capture https://example.org/          # POSTs to the extension receiver with this run's token, no GUI (features/capture-extension.md)
```

Loop: `ref` (or `tree`) → act on the returned ref → `tree`/`find` again to verify. Refs are valid for one snapshot only; after any UI change take a new one. Prefer `ref <role> <exact accessible name>` over reading refs out of `tree`; it fails on 0 or 2+ matches. `--contains` matches part of a name (`ref link Everything --contains`, since the link is `Everything <count>`); `--in <ref>` searches only inside that element (`ref button Restore --in "$GROUP"`). Compose it inline: `$I ad click "$($I ref button "Save to library")"` (bash) or `$I ad click (bun … ref button "Save to library")` in PowerShell.

Handles that hold in this app (from the live run):

- Sidebar: link `Everything <count>`, links per Space (`Design references`, `Read later`, `Weekend reading <n>`), per-Space buttons `Rename|Delete|Move … up|down|Change color of <name>`, menubutton `Add a Space`, menubutton `Add`, link `Archive`, menubutton `Settings`.
- The `Add` menubutton opens its menu only through `expand` (a semantic `click` does nothing). Then `tree --surface menu` or `find --role menuitem --name Note --exact`; menu items: Note, Link, Quote, File, Screenshot.
- Cards are groups named `<Kind>: <title>` (`Note: Untitled note`, `Image: …`, `Article: …`, `Post: …`); search box is textfield `Search your mind`; switches `Grid view`/`List view`.
- Routes show as link/document values: `app://local/index.html#/`, `#/add/note`, `#/space/<id>`, `#/archive`.
- A note's body is a textfield named `Note` (contenteditable, `set-value` works); buttons `Save to library`, `Save note`, `Cancel`, `Edit note`, `Archive`, `Keep in a Space`.
- In-app DOM menus (base-ui popups like the `Item actions` menu behind `Keep in a Space`, and the card context menu) appear via `$I tree --surface menu` with role `menu`/`menuitem`; the native `Menu.popup` bridge exists but no renderer calls it. Native confirms (delete a populated Space, delete forever) open a second window of ours: `$I windows`, then `$I tree --window <id>` and `$I ref button '<name>' --window <id>`. Radio `Regular` in the Add-a-Space form cannot be clicked; use keyboard (see features/spaces.md).

Retries: a snapshot or find can fail with `atomic replace failed ... os error 1175` and `disposition: {delivery: not_delivered, retry: safe}`. A fresh snapshot/find is the fix — `ref` and `tree` already retry it a few times, so re-run the command when it still fails. `doctor`'s snapshot check does not retry, so a healthy run can report a transient FAIL there; re-run `doctor` before relaunching. Never repeat an action whose `disposition.retry` is `unsafe` (all successful click/set-value results say so): read state instead. With several `electron.exe` windows only the id from `$I window` is ours.

## Evidence

Per run, in `.artifacts/verify-inkling/<run>/` (gitignored; cleanup and settle never delete it). This is where the run's logs end up too:

```sh
$I shot 01-before          # PNG of our window only -> prints the path
$I db "SELECT kind, title, body, archived FROM items ORDER BY created_at DESC LIMIT 1"   # read-only SQLite
```

A proof shows (1) state before, (2) each user action with the command that did it, (3) the visible result, (4) the stored side effect from `db`, (5) any unexpected `error` envelopes. Write the sequence into `PROOF.md` beside the screenshots. A card without a row, or a row without a card, is not a pass. `db` opens the scratch `library.sqlite3` read-only; it can only be our library. Never write to it, never open the user's real library.

## Cleanup

Run after every run, including failed ones and before you finish:

```sh
bun .claude/skills/verify-inkling/scripts/instance.ts cleanup
```

It stops the recorded pids (graceful `taskkill /T`, then `/F /T` after 4 s; only pids from `run.json` whose command line still names our `.dev`), verifies nothing referencing `.dev` remains, then deletes the whole `.dev` directory. If something unrecorded still references `.dev` it refuses and lists the pids: close those yourself. It takes about 15 s. Afterwards confirm: `.dev` gone, `ls .artifacts/verify-inkling/<run>/` still lists your evidence, other inkling windows untouched. Idempotent: with no `.dev` it says so and exits 0.

The settle action (`tools/repo/clean-worktree.ts`, see the operational requirement above) does this same `.dev` cleanup, then removes `.dev-library/`, `dist/` and the `node_modules` folders. Both refuse unless run with cwd inside this worktree, and operate only on the exact `<worktree>/.dev` (refused if it is a symlink).

## Helpers

| Script | What |
|---|---|
| `scripts/instance.ts` | `launch [--empty] [--skip-build] [--link <inkling:// link>]`, `doctor`, `window`, `windows`, `ref <role> <name> [--contains] [--in <ref>]`, `tree [snapshot args]`, `ad <agent-desktop args>`, `shot <name>`, `db "<SELECT>"`, `capture <url>`, `cleanup` |
| `scripts/clean-dev.ts` | Library, no CLI: stop the run's recorded processes, keep their logs, delete `.dev`; shared guards and process logic for `cleanup` and the settle action |
| `../../../tools/repo/clean-worktree.ts` | The worktree settle action (`Clean up worktree` in `t3.json`): the `.dev` cleanup, then `.dev-library/`, `dist/` and every `node_modules` |

Run with bun (they import `tools/dev/seeded-library.ts` and use `bun:sqlite`). Seed is the source for expected counts; if `seed-data.ts` changes, update the numbers in the feature files.

## Keeping the map current

When a control's accessible name or flow changes, update its file in `features/`. `/maintain-verification-skill` is the loop for keeping the map honest.
