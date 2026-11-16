# Settings sheet

The `Settings` button or `Ctrl+,` opens a settings sheet over the current page: `dialog "Settings"` with a `complementary "Settings sections"` rail (General, Appearance, Library, Browser extension, Screenshots, Updates) and a `region "<Section>"` panel; the open section lives in the URL search params. Status: **driven** on 2026-11-16 (open via button and `Ctrl+,`, rail and General panel, welcome replay, `Close settings`/Escape). Not driven: the other panels' controls and every setting mutation.

## Sub-features

- `settings-open` sidebar `Settings` or `Ctrl+,` opens the sheet on General.
- `settings-sections` rail buttons switch the `region "<Section>"` panel; the selection is `aria-current="page"`.
- `settings-welcome-replay` General > `Show the welcome again` replays the tour (see [welcome](./welcome.md)).
- `settings-close` `Close settings` or Escape closes the sheet.

## How to get to it (user POV)

- Choose **Settings** in the sidebar or press **Ctrl+,**. Pick a section on the left; close with **Close settings** or Escape.

## Driving it with agent-desktop

Preconditions: any launched run.

- **Open.** `$I ad click "$($I ref button Settings)"` or `$I ad press ctrl+comma --window-id '{window}'`. `dialog "Settings"` contains `complementary "Settings sections"` with buttons `General`, `Appearance`, `Library`, `Browser extension`, `Screenshots`, `Updates`, an `inkling <version>` line, and `region "General"` to start.
- **Replay.** `$I ad click "$($I ref button 'Show the welcome again')"` closes the sheet and lands on `#/welcome`; finish or Escape returns.
- **Close.** `$I ad click "$($I ref button 'Close settings')"` or `$I ad press escape`; the dialog leaves the tree.

## Gotchas

- The sheet is a modal dialog (`dialog`): while it is open the shortcut handler lets only `Alt+Left`/`Alt+Right` through, and those close/reopen the sheet by history because the section is in the URL (`useCommands.ts` special-cases `settings-sheet`) — don't diagnose other dead keys as broken.
- `Licenses` is a General sub-page, not a rail entry: opening it keeps `General` selected.
- The section lives in the URL, so `ad press alt+Left` while it is open leaves the sheet rather than switching back a panel.
- Panel contents are mostly form controls and transfer actions; nothing in them was mutated in this pass — extend only with a proven drive.
