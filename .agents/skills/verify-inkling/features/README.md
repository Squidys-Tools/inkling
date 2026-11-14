# inkling verification map

The maintained source for verifying inkling's user-facing behavior with the `verify-inkling` skill. Read this index, then drive the matching feature file.

## Baseline preconditions

- Launch with `instance.ts launch` (seeded demo library: Everything shows 32 active items; Spaces `Design references`, `Read later`, `Weekend reading`; 3 seeded archived copies, ids `archive-5`, `archive-10`, `archive-12`). Run `doctor` and require all PASS.
- Every recipe starts from that state and uses `$I` for `bun .claude/skills/verify-inkling/scripts/instance.ts`.
- Never drive an instance this run did not launch.

## Driving conventions

- Look up controls by exact accessible name: `$I ref <role> "<name>"` prints a fresh ref; act with `$I ad click|set-value|expand '<ref>'`. Re-resolve after every UI change; refs die with their snapshot.
- Quote refs in PowerShell (`'@s…:e1'`).
- The grid is virtualized: counting visible card groups is not counting items. Use the sidebar link `Everything <n>` and `db` for counts.
- Text goes in with `set-value` (accessibility ValuePattern); it is not keystroke typing. Keys go through `$I ad press <combo> --window-id '{window}'`: they reach our window without taking focus and report `delivered_unverified`, so confirm the effect with `tree` or `db`.
- Menus are reachable through `$I tree --surface menu`. Confirmations are an in-app dialog in the main window's tree (`alertdialog` on Windows, `alert` on Linux).
- Cards are only in the tree on Everything with no item open. If `ref group '<Kind>: <title>'` finds nothing, you are on an item view (`#/item/<id>`), a form (`#/add/…`) or a Space: go to Everything with `$I ad click "$($I ref link Everything --contains)"`.
- A ref found with `--in <ref>` still can't be clicked when sibling elements share the accessible name (`AMBIGUOUS_TARGET`): open the item and use a uniquely named control instead.
- After every mutation read the stored row with `$I db "<SELECT>"` and take `$I shot <name>`.

## Proof and skip reporting

- Capture the action and the resulting state: before screenshot, each command, after screenshot, and the row.
- Record the feature ID and entry point with every artifact in `PROOF.md`.
- Report an unreachable path with the command tried and the error code. Do not call it verified through another path.

## Features

Every feature was executed end to end with agent-desktop on 2026-11-13 unless its file says otherwise.

- [Capture a note](./capture-note.md): Add > Note > Save to library, Ctrl+Enter.
- [Edit a note](./edit-note.md): item view > Edit note > Save note.
- [Capture a quote](./capture-quote.md): Add > Quote.
- [Capture a link](./capture-link.md): Add > Link (uses the network for the URL you type).
- [Capture by deep link](./capture-deep-link.md): `inkling://capture?url=...` as a launch argument, no GUI.
- [Capture by the extension receiver](./capture-extension.md): POST to the loopback receiver, no GUI.
- [Search](./search.md): `Search your mind`, Ctrl+K, empty state, Clear search, Save as Space.
- [Spaces](./spaces.md): create Smart and Regular, rename, file an item (in-app menu), delete (in-app confirm).
- [Archive and restore](./archive-restore.md): item Archive, Archive view, Restore.
- [Tags](./tags.md): item view > Add tag, Enter, Escape, Remove tag.
- [Similar items](./item-similar.md): item view > Similar, empty state and populated tiles.
- [Windows setup window](./installer.md): `launch --installer`, Install, progress pacing, ready, failed. Driven 2026-11-13.

## Not covered, with the reason

- The OS-level deep link (a browser or the shell opening `inkling://`): only a packaged build registers the scheme, and that build opens the real library. The app's own intake is covered by [capture-deep-link](./capture-deep-link.md).
- File and Screenshot capture (native pickers) and drag and drop: OS input this driver does not reach. Paste is driven on the Linux instabox box (`ad paste` saves a `note`/`clipboard` item); on Windows it needs `--headed`.
- Card right-click menu: driven on the Linux instabox box (opens `Item actions` with the `Keep in a Space` submenu); on Windows `right-click` needs `--headed` (real cursor and focus). The item view's `Keep in a Space` offers a flat `Add to`/`Remove from <space>` list; the card's own menu wraps the same Space actions in a submenu (adding `Allow in <smart>` entries) among other card actions, plus a top-level `Remove from <current>` when opened inside a Space.
- The `/` shortcut: driven on the Linux instabox box (its xdotool path sends the key); on Windows agent-desktop has no key name for it. Ctrl+K reaches the same field.
- Permanent delete from Archive, Settings, Reader: not driven. Unmapped is unverified, not passing.
- Item-view media wheel zoom and pan (`ZoomableMedia`): needs `--headed` wheel input.
- The sidebar update row (`apps/renderer/src/shell/UpdateRow.tsx`): only an installed release build with an `app-update.yml` feed can update, so an unpackaged run never shows it.
- The compact sidebar rail (collapsed sidebar): Space rows become their covers, whose context menu is the expanded rows' `Actions for <name>` menu. It opens only by right-click or Shift+F10, so the rail's menu is not driven.
- Custom window controls (`Minimize`, `Maximize window`, `Close window` buttons) and toast notifications (the `Notifications` group; archive/restore toasts carry Undo): visible in the tree, not driven.
