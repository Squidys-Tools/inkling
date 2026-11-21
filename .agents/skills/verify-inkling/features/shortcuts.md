# Keyboard shortcuts

`?` or `Ctrl+/` opens `dialog "Keyboard shortcuts"`, a reference of every command with its binding, rendered from `packages/contracts/src/shortcuts.ts` — the same table that drives the key handler (`shell/useCommands.ts`) and the macOS menu. Status: **driven** on 2026-11-21 on the Linux box (the dialog — all nine rows — `Ctrl+/` via `ad press ctrl+slash`, `Close keyboard shortcuts`, `n`, `Ctrl+Shift+N`, `/` via `ad press slash`, `Ctrl+,`, `Alt+Left`/`Alt+Right` between grid and item view). Earlier passes: `Ctrl+K` in the search pass, `Alt+Left` inside the Settings sheet kept the sheet open (the claim it passed through was wrong), `Alt+Left` blocked inside the shortcuts dialog. Not driven: `Ctrl+N` (same command as `n`), `Ctrl+O` (native picker), `Ctrl+\` (`$I press` reaches it), the macOS menu path and mouse side-buttons.

## Sub-features

- `shortcuts-dialog` `?`/`Ctrl+/` opens the binding reference; `Close keyboard shortcuts` or Escape leaves.
- `shortcut-search` `Ctrl+K` or `/` focuses `Search your mind` (see [search](./search.md)).
- `shortcut-add` `Ctrl+N` or `n` opens the note editor, `Ctrl+Shift+N` the quote form. Links have no shortcut: they go in the add tile.
- `shortcut-nav` `Alt+Left`/`Alt+Right` move history back/forward, `Ctrl+,` opens [settings](./settings.md).

## How to get to it (user POV)

- Press **?** anywhere outside a field. The dialog lists: Search `Ctrl+K` or `/`, New note `Ctrl+N` or `N`, New quote `Ctrl+Shift+N`, Add files `Ctrl+O`, sidebar `Ctrl+\`, this dialog `Ctrl+/` or `?`, Settings `Ctrl+,`, Back `Alt+Left`, Forward `Alt+Right` (Cmd-mod on macOS). Grid-zoom keys (`Ctrl+=`/`-`/`0`, [grid-zoom](./grid-zoom.md)), PDF page arrows and sidebar row arrows exist too but are not commands, so they are not listed.

## Driving it with agent-desktop

Preconditions: any launched run; focus off a text field for bare keys (`ad press tab --window-id '{window}'` once if a field was just used).

- **Dialog.** Punctuation keys have no `ad press` name on Windows — use the SendKeys fallback: `$I press 'shift+?'` (or `$I press ctrl+slash`). `dialog "Keyboard shortcuts"` lists an `option "<command>"` per row on Windows (`term "<command>"` on Linux) (Search, New note, New quote, Add files, Show or hide the sidebar, Keyboard shortcuts, Settings, Back, Forward) with `button "Close keyboard shortcuts"` focused. Escape or that button closes it.
- **Commands.** Each binding is proven by its effect: `$I press ctrl+comma` → `dialog "Settings"`; `$I ad press n --window-id '{window}'` → the note editor (leave with `Back` or Escape — the editor has no `Cancel`); `$I ad press alt+Left|alt+Right --window-id '{window}'` → back/forward between grid and item view; `$I ad press ctrl+shift+n --window-id '{window}'` → the quote form (leave with `Back`; `Discard` and `Save to library` appear only once it is dirty, and the discard dialog's `Cancel` is the only `Cancel` — see [capture-quote](./capture-quote.md)).

## Gotchas

- Bare keys (`n`, `/`, `?`) only fire outside editable fields — `useHotkeys` `ignoreInputs` applies unless the binding has `mod` or `alt`. A paste-probe tab order can leave focus in `Search your mind`.
- On Windows, `ad press` names only letters, digits and named keys — `,`, `/`, `?`, `\`, `-`, `=` all fail `INVALID_ARGS`. `$I press <combo>` sends them via SendKeys after activating the run's window by pid; it accepts the same modifier+key spelling (and names like `comma`, `slash`, `question`). On Linux `ad press` takes xdotool names (`ctrl+comma`, `ctrl+slash`, `shift+slash`) directly.
- While `/welcome` shows, every shortcut is suppressed (`useCommands` returns early); while a dialog is open all commands are blocked — `useCommands.ts` special-cases `settings-sheet` only so back/forward still run for the mouse side-buttons and menus, because Base UI keeps keyboard Alt+arrows inside the sheet (proven 2026-11-20 on Windows and Linux: `ad press alt+Left` with the sheet open left it open, same section). The Keyboard shortcuts dialog and the confirm dialogs block them outright (proven 2026-11-19: `alt+Left` inside the shortcuts dialog left the dialog open and did not navigate).
- The handler runs commands, not text: `ad press n` while a form's field is focused types `n` instead of opening the note editor.
- macOS gives Cmd shortcuts to the menu, not the key handler — verify that path on a Mac, not here.
