---
name: verify-inkling
description: Drive the real inkling Electron desktop app as a user would (agent-desktop accessibility automation, no CDP) on a throwaway seeded library under the worktree's .dev/, and prove a feature with screenshots plus read-only database rows. Use when a change touches capture, note editing, search, Spaces, archive, or any user-visible behavior and you need launch, doctor, drive, evidence and cleanup on Windows.
---

# verify-inkling

Launches `bun run dev:app`'s app (build + Electron) against a scratch library, drives it through the OS accessibility tree with the `agent-desktop` CLI, and records evidence. Start at [features/README.md](features/README.md) and drive one feature per run. Written and proven on Windows 11; macOS and Linux are untested (the helpers have untested POSIX branches).

## Rules

- All verification-only state lives under `<worktree>/.dev/` (library, agent-desktop state, logs). Evidence lives in `<worktree>/.artifacts/verify-inkling/<run>/`, outside `.dev`. Never put evidence under `.dev`.
- One instance per worktree. Cleanup deletes the whole `.dev`, so a second concurrent run would lose its state. `launch` refuses while one is live.
- Never drive an app you did not launch with `launch`: other inkling windows (the user's, other worktrees') are also `electron.exe`. `.dev-library/` (the plain `dev:app` library) is not this skill's and is never touched.
- Never kill by process name or path pattern. The helpers stop only the pids `launch` recorded, after confirming each pid's command line still names our `.dev` path.
- Drive through visible controls. `set-value` is an accessibility ValuePattern write on a text field, not an internal setter; say so in the report. Key combos use `ad press <combo> --window-id '{window}'` (headless, no focus change). Never add `--headed` (physical cursor/keyboard, takes the user's focus) without the user's say-so.
- What cannot be reached (file pickers, deep link, card right-click) is listed in `features/README.md`; report it as unverified.

## Operational requirement: settle cleanup (T3)

`t3.json` has an action "Clean verification scratch (.dev)" with `runOnSettle: true` that runs `bun .claude/skills/verify-inkling/scripts/clean-dev.ts --settle`. T3 runs `runOnSettle` actions only for threads with their own worktree (main-checkout threads skip them), **and actions in `t3.json` only take effect after they are imported into the project's Settings > Actions**. If that action is not imported for this project, nothing cleans up on settle: tell the user. Settle runs while terminals may still be alive, so it never kills anything: if a recorded app pid (or any process naming our `.dev`) is still alive it exits 1 and leaves `.dev` alone. Always run the normal `cleanup` below yourself first; settle cleanup is the backstop, not the plan.

## Prerequisites

- Bun per `.bun-version` (`bun tools/repo/check-bun-version.ts`), `bun install` done, `node_modules/electron/dist` present. `agent-desktop` on PATH (`agent-desktop --version`; verified with 1.0.2).
- An interactive, unlocked desktop session. The app window may be behind others but not minimized (minimized windows are not drivable).

## Launch

```sh
bun .claude/skills/verify-inkling/scripts/instance.ts launch            # seeded demo library (32 items, 3 Spaces)
bun .claude/skills/verify-inkling/scripts/instance.ts launch --empty    # empty library: opens on Welcome, no seed
bun .claude/skills/verify-inkling/scripts/instance.ts launch --skip-build   # reuse dist/ when you know it is current
```

(All commands below take the same `bun .claude/skills/verify-inkling/scripts/instance.ts` prefix.) Run from inside the worktree.

It clears stale `.dev`, creates `.dev/verify-inkling/<run>/{library,agent-desktop}`, seeds the library with `seedLibrary` from `tools/dev/seeded-library.ts` (the same seed `dev:app` uses; it marks onboarding complete), runs `bun run build:app` (about 10 s warm), then starts `bun tools/dev/dev-app.ts --user-data-dir=<run>/library` detached (this is `dev:app` with an explicit, un-seeded data dir that we seeded ourselves). Ready means: Electron main found, its window listed by `agent-desktop list-windows`, `library.sqlite3` present, and the window snapshot shows the sidebar link "Everything" (or "Skip" with `--empty`). It prints a JSON object with `windowId`, `library`, `evidenceDir`, pids. About 15 s total. Logs: `.dev/verify-inkling/<run>/build.log`, `electron.log`.

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
```

Loop: `ref` (or `tree`) → act on the returned ref → `tree`/`find` again to verify. Refs are valid for one snapshot only; after any UI change take a new one. Prefer `ref <role> <exact accessible name>` over reading refs out of `tree`; it fails on 0 or 2+ matches. `--contains` matches part of a name (`ref link Everything --contains`, since the link is `Everything <count>`); `--in <ref>` searches only inside that element (`ref button Restore --in "$GROUP"`). Compose it inline: `$I ad click "$($I ref button "Save to library")"` (bash) or `$I ad click (bun … ref button "Save to library")` in PowerShell.

Handles that hold in this app (from the live run):

- Sidebar: link `Everything <count>`, links per Space (`Design references`, `Read later`, `Weekend reading <n>`), per-Space buttons `Rename|Delete|Move … up|down|Change color of <name>`, menubutton `Add a Space`, menubutton `Add`, link `Archive`, menubutton `Settings`.
- The `Add` menubutton opens its menu only through `expand` (a semantic `click` does nothing). Then `tree --surface menu` or `find --role menuitem --name Note --exact`; menu items: Note, Link, Quote, File, Screenshot.
- Cards are groups named `<Kind>: <title>` (`Note: Untitled note`, `Image: …`, `Article: …`, `Post: …`); search box is textfield `Search your mind`; switches `Grid view`/`List view`.
- Routes show as link/document values: `app://local/index.html#/`, `#/add/note`, `#/space/<id>`, `#/archive`.
- A note's body is a textfield named `Note` (contenteditable, `set-value` works); buttons `Save to library`, `Save note`, `Cancel`, `Edit note`, `Archive`, `Keep in a Space`.
- Native Electron menus (`Keep in a Space`) appear via `$I tree --surface menu`; native confirms (delete a populated Space) open a second window of ours: `$I windows`, then `$I tree --window <id>` and `$I ref button '<name>' --window <id>`. Radio `Regular` in the Add-a-Space form cannot be clicked; use keyboard (see features/spaces.md).

Retries: a snapshot or find can fail with `atomic replace failed ... os error 1175` and `disposition: {delivery: not_delivered, retry: safe}`. A fresh snapshot/find is the fix. Never repeat an action whose `disposition.retry` is `unsafe` (all successful click/set-value results say so): read state instead. With several `electron.exe` windows only the id from `$I window` is ours.

## Evidence

Per run, in `.artifacts/verify-inkling/<run>/` (gitignored; cleanup never touches it):

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

Settle form (what T3 runs; never kills, fails safely if the app is alive): `bun .claude/skills/verify-inkling/scripts/clean-dev.ts --settle`. Standalone stopping form: `clean-dev.ts --stop`. Both refuse unless run with cwd inside this worktree, and operate only on the exact `<worktree>/.dev` (refused if it is a symlink).

## Helpers

| Script | What |
|---|---|
| `scripts/instance.ts` | `launch [--empty] [--skip-build]`, `doctor`, `window`, `windows`, `ref <role> <name> [--contains] [--in <ref>]`, `tree [snapshot args]`, `ad <agent-desktop args>`, `shot <name>`, `db "<SELECT>"`, `cleanup` |
| `scripts/clean-dev.ts` | `--settle` / `--stop`: delete the worktree's `.dev`; shared guards and process logic |

Run with bun (they import `tools/dev/seeded-library.ts` and use `bun:sqlite`). Seed is the source for expected counts; if `seed-data.ts` changes, update the numbers in the feature files.

## Keeping the map current

When a control's accessible name or flow changes, update its file in `features/`. `/maintain-verification-skill` is the loop for keeping the map honest.
