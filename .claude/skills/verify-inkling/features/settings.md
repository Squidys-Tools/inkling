# Settings sheet

The `Settings` button or `Ctrl+,` opens a settings sheet over the current page: `dialog "Settings"` with a `complementary "Settings sections"` rail (General, Appearance, Library, Browser extension, Screenshots, Updates) and a `region "<Section>"` panel; the open section lives in the URL search params. Status: **driven** on 2026-11-19 (open via button and `Ctrl+,`, rail and General/Appearance/Browser extension panels, welcome replay, Escape close). Not driven: `Close settings`, the other panels' controls and every setting mutation except the Appearance readback in [grid-zoom](./grid-zoom.md).

## Sub-features

- `settings-open` sidebar `Settings` or `Ctrl+,` opens the sheet on General.
- `settings-sections` rail buttons switch the `region "<Section>"` panel (Library opens `region "Your library"`, and `Open source licenses` inside General opens `region "Open source licenses"` — the other rail labels match their regions); the selection is `aria-current="page"`.
- `settings-welcome-replay` General > `Show again` (on the "Welcome tour" row) replays the tour (see [welcome](./welcome.md)).
- `settings-close` `Close settings` or Escape closes the sheet.

## How to get to it (user POV)

- Choose **Settings** in the sidebar or press **Ctrl+,**. Pick a section on the left; close with **Close settings** or Escape.

## Driving it with agent-desktop

Preconditions: any launched run.

- **Open.** `$I ad expand "$($I ref menubutton Settings)"` (the button carries `aria-expanded`, so it resolves as `menubutton`, and `expand` opens the sheet; `click` also works through DoDefaultAction) or the `Ctrl+,` binding — `ad press` has no `,` key on Windows, so use the SendKeys fallback: `$I press ctrl+comma`. `dialog "Settings"` contains `complementary "Settings sections"` with buttons `General`, `Appearance`, `Library`, `Browser extension`, `Screenshots`, `Updates`, and `region "General"` to start — the `inkling <version>` line sits inside that region's About row, not the rail.
- **Replay.** `$I ad click "$($I ref button 'Show again')"` — the "Welcome tour" row's button — closes the sheet and lands on `#/welcome`; finish or Escape returns.
- **Close.** `$I ad press escape --window-id '{window}'` or `$I ad click "$($I ref button 'Close settings')"`; the dialog leaves the tree.

## Gotchas

- The sheet is a modal dialog (`dialog`): while it is open the shortcut handler lets only `Alt+Left`/`Alt+Right` through, and those close/reopen the sheet by history because the section is in the URL (`useCommands.ts` special-cases `settings-sheet`) — don't diagnose other dead keys as broken.
- `Open source licenses` is a card button inside the General panel, not a rail entry: opening it keeps `General` selected.
- The section lives in the URL, so `ad press alt+Left` while it is open leaves the sheet rather than switching back a panel.
- Panel contents are mostly form controls and transfer actions; nothing in them was mutated in this pass — extend only with a proven drive.
