# inkling verification map

The maintained source for verifying inkling's user-facing behavior with the `verify-inkling` skill. Read this index, then drive the matching feature file.

## Baseline preconditions

- Launch with `instance.ts launch` (seeded demo library: Everything shows 32 active items; Spaces `Design references`, `Read later`, `Weekend reading`; 5 archived items). Run `doctor` and require all PASS.
- Every recipe starts from that state and uses `$I` for `bun .claude/skills/verify-inkling/scripts/instance.ts`.
- Never drive an instance this run did not launch.

## Driving conventions

- Look up controls by exact accessible name: `$I ref <role> "<name>"` prints a fresh ref; act with `$I ad click|set-value|expand '<ref>'`. Re-resolve after every UI change; refs die with their snapshot.
- Quote refs in PowerShell (`'@s…:e1'`).
- The grid is virtualized: counting visible card groups is not counting items. Use the sidebar link `Everything <n>` and `db` for counts.
- Text goes in with `set-value` (accessibility ValuePattern); it is not keystroke typing. Keys go through `$I ad press <combo> --window-id '{window}'`: they reach our window without taking focus and report `delivered_unverified`, so confirm the effect with `tree` or `db`.
- Native menus and confirm dialogs are reachable: a menu through `$I tree --surface menu`, a dialog as a second window listed by `$I windows`.
- Cards are only in the tree on Everything with no item open. If `ref group '<Kind>: <title>'` finds nothing, you are on an item view (`#/item/<id>`), a form (`#/add/…`) or a Space: go to Everything with `$I ad click "$($I ref link Everything --contains)"`.
- After every mutation read the stored row with `$I db "<SELECT>"` and take `$I shot <name>`.

## Proof and skip reporting

- Capture the action and the resulting state: before screenshot, each command, after screenshot, and the row.
- Record the feature ID and entry point with every artifact in `PROOF.md`.
- Report an unreachable path with the command tried and the error code. Do not call it verified through another path.

## Features

Every feature was executed end to end with agent-desktop on 2026-11-02 unless its file says otherwise.

- [Capture a note](./capture-note.md): Add > Note > Save to library, Ctrl+Enter.
- [Edit a note](./edit-note.md): item view > Edit note > Save note.
- [Capture a quote](./capture-quote.md): Add > Quote.
- [Capture a link](./capture-link.md): Add > Link (uses the network for the URL you type).
- [Search](./search.md): `Search your mind`, Ctrl+K, empty state, Clear search, Save as Space.
- [Spaces](./spaces.md): create Smart and Regular, rename, file an item (native menu), delete (native confirm).
- [Archive and restore](./archive-restore.md): item Archive, Archive view, Restore.

## Not covered, with the reason

- Deep link `inkling://capture?url=...`: only a packaged build registers the scheme; an OS link opens the installed app on the real library.
- File and Screenshot capture (native pickers), paste, drag and drop, clipboard: OS input this driver does not reach.
- Card right-click menu: `right-click` needs `--headed` (real cursor and focus). Use the item view's `Keep in a Space` instead, which is the same menu.
- The `/` shortcut: agent-desktop has no key name for it. Ctrl+K reaches the same field.
- Space color and move up/down, permanent delete from Archive, Settings, Reader: not driven. Unmapped is unverified, not passing.
