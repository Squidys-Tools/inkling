# Keyboard shortcuts

`?` or `Ctrl+/` opens `dialog "Keyboard shortcuts"`, a reference of every command with its binding, rendered from `packages/contracts/src/shortcuts.ts` — the same table that drives the key handler (`shell/useCommands.ts`) and the macOS menu. Status: **driven** on 2026-11-16 (the dialog, `Ctrl+,`, `n`, `Alt+Left`/`Alt+Right`, plus `Ctrl+K` and `/` in the search pass). Not driven: `Ctrl+N`, `Ctrl+Shift+N`, `Ctrl+O` (native picker), `Ctrl+\`, card arrow-key navigation, the macOS menu path and mouse side-buttons.

## Sub-features

- `shortcuts-dialog` `?`/`Ctrl+/` opens the binding reference; `Close keyboard shortcuts` or Escape leaves.
- `shortcut-search` `Ctrl+K` or `/` focuses `Search your mind` (see [search](./search.md)).
- `shortcut-add` `Ctrl+N` or `n` opens the note editor, `Ctrl+Shift+N` the quote form. Links have no shortcut: they go in the add tile.
- `shortcut-nav` `Alt+Left`/`Alt+Right` move history back/forward, `Ctrl+,` opens [settings](./settings.md).

## How to get to it (user POV)

- Press **?** anywhere outside a field. The dialog lists: Search `Ctrl+K` or `/`, New note `Ctrl+N` or `N`, New quote `Ctrl+Shift+N`, Add files `Ctrl+O`, sidebar `Ctrl+\`, this dialog `Ctrl+/` or `?`, Settings `Ctrl+,`, Back `Alt+Left`, Forward `Alt+Right` (Cmd-mod on macOS).

## Driving it with agent-desktop

Preconditions: any launched run; focus off a text field for bare keys (`ad press tab` once if a field was just used).

- **Dialog.** `$I ad press shift+slash` (or `ctrl+slash`) → `dialog "Keyboard shortcuts"` with a `term`/`statictext` pair per command and `button "Close keyboard shortcuts"` focused. Escape closes it.
- **Commands.** Each binding is proven by its effect: `$I ad press ctrl+comma` → `dialog "Settings"`; `n` → the note editor (`Cancel` out of it); `alt+Left`/`alt+Right` → back/forward between grid and item view.

## Gotchas

- Bare keys (`n`, `/`, `?`) only fire outside editable fields — `useHotkeys` `ignoreInputs` applies unless the binding has `mod` or `alt`. A paste-probe tab order can leave focus in `Search your mind`.
- `xdo`-style combos go through `ad press <combo>` with xdotool names on Linux (`shift+slash` for `?`, `ctrl+comma`, `ctrl+shift+n`); `Alt+Left` is `alt+Left`.
- While `/welcome` shows, every shortcut is suppressed (`useCommands` returns early); while a dialog is open only back/forward still run — and through the Settings sheet they navigate its URL section.
- The handler runs commands, not text: `ad press n` while a form's field is focused types `n` instead of opening the note editor.
- macOS gives Cmd shortcuts to the menu, not the key handler — verify that path on a Mac, not here.
