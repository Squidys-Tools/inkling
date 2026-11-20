# Settings sheet

The `Settings` button or `Ctrl+,` opens a settings sheet over the current page (`?settings=<section>` in the URL): a rail of section buttons (General, Appearance, Library, Browser extension, Screenshots, Updates) beside the open section's panel. Status: **driven** on 2026-11-20 (open via button and `Ctrl+,`, rail and General/Appearance/Browser extension panels, welcome replay, `Close settings`, Escape close). Not driven: the other panels' controls and every setting mutation except the Appearance readback in [grid-zoom](./grid-zoom.md).

## Sub-features

- `settings-open` sidebar `Settings` or `Ctrl+,` opens the sheet on General.
- `settings-sections` rail buttons switch the section panel (named `region "<Section>"` on Linux — Library opens `region "Your library"`, and `Open source licenses` inside General opens `region "Open source licenses"` — the other rail labels match their regions); the selection is `aria-current="page"`.
- `settings-welcome-replay` General > `Show again` (on the "Welcome tour" row) replays the tour (see [welcome](./welcome.md)).
- `settings-close` `Close settings` or Escape closes the sheet.

## How to get to it (user POV)

- Choose **Settings** in the sidebar or press **Ctrl+,**. Pick a section on the left; close with **Close settings** or Escape.

## Driving it with agent-desktop

Preconditions: any launched run.

- **Open.** `$I ad expand "$($I ref menubutton Settings)"` (the button carries `aria-expanded`, so it resolves as `menubutton`, and `expand` opens the sheet; `click` also works through DoDefaultAction) or the `Ctrl+,` binding — `ad press` has no `,` key on Windows, so use the SendKeys fallback: `$I press ctrl+comma`. The sheet opens on General: `ref button <Section>` resolves on both platforms (on Windows each rail `<li>` also shows an `option` twin and the sheet exposes no `dialog`/`complementary`/`region` roles — those names are the Linux AT-SPI rendering, where the tree reads `dialog "Settings"`, `complementary "Settings sections"`, `region "<Section>"`). The signal that works everywhere is `?settings=` in the `document "inkling"` value. The `inkling <version>` line sits inside the General panel's About row, not the rail.
- **Replay.** `$I ad click "$($I ref button 'Show again')"` — the "Welcome tour" row's button — closes the sheet and lands on `#/welcome`; finish or Escape returns.
- **Close.** `$I ad press escape --window-id '{window}'` or `$I ad click "$($I ref button 'Close settings')"`; the dialog leaves the tree.

## Gotchas

- The sheet is a modal dialog: while it is open the keyboard shortcut handler is suppressed. `useCommands.ts` special-cases `settings-sheet` so back/forward from the mouse side-buttons or menus can still close and reopen the sheet by history, but Base UI keeps keyboard `Alt+Left`/`Alt+Right` inside the sheet — proven 2026-11-20 on Windows and Linux: `ad press alt+Left` with it open left it open, same section. Don't diagnose other dead keys as broken either.
- `Open source licenses` is a card button inside the General panel, not a rail entry: opening it keeps `General` selected.
- The section lives in the URL: opening pushes one history entry on General, switching sections replaces it, and closing goes back to the page — the sheet counts as a single history entry no matter how many sections you visit.
- Panel contents are mostly form controls and transfer actions; nothing in them was mutated in this pass — extend only with a proven drive.
