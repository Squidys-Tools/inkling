# Grid column zoom

The library grid zooms between the `Grid columns` choices in Settings > Appearance: **Ctrl+=** / **Ctrl++** shows fewer columns, **Ctrl+-** shows more, **Ctrl+0** resets to the default. **Ctrl+wheel** (pinch on a trackpad) steps the same way after enough travel. The choice is the same `gridColumns` appearance value the segmented control edits, so it persists across restarts. Status: **driven** on 2026-11-20 on the Linux box (`Ctrl+-` 4→5, `Ctrl+=` 5→4, `Ctrl+0` back to default — each read back on the Appearance panel). Not driven: the wheel path (needs `--headed` wheel input), the `+` alias (same handler as `=`), and the ignore-rules (editable fields, open dialogs, inert pages).

## Sub-features

- `grid-zoom-more` `Ctrl+-` steps to the next higher column count.
- `grid-zoom-fewer` `Ctrl+=` (or `Ctrl++`) steps to the next lower.
- `grid-zoom-reset` `Ctrl+0` returns to the default `4`.
- `grid-zoom-wheel` `Ctrl+wheel`/`Ctrl+pinch` accumulates deltas into one step at a time.
- `grid-zoom-ignore` keys inside editable fields, open modal dialogs or inert pages do not zoom.

## How to get to it (user POV)

- On a grid view (Everything, search results, a Space or Archive), hold **Ctrl** — **Cmd** on macOS — and press **-**/**+**/**=**/**0**, or scroll while holding it (the wheel handler takes Ctrl or Cmd on every platform). The columns step between `3` and `6`; the same value shows under Settings > Appearance > **Grid columns**.

## Driving it with instance.ts

Preconditions: seeded library, on `#/` (the listener lives in `Grid.tsx`, so a grid view must be mounted — an item view or a form does not zoom, and neither does an empty/error scope, which mounts a placeholder instead of `Grid`; a covered page's grid stays mounted underneath, blocked by `inert`, which also does not zoom).

- **Zoom.** `-`/`=`/`+`/`0`: on Windows `-`/`=`/`+` are punctuation keys `ad press` cannot name — use the SendKeys fallback `$I press ctrl+minus`, `$I press ctrl+equal`. `ctrl+0` works through either there. On Linux `ad press` takes xdotool names directly (`$I ad press ctrl+minus`); `press` is the Windows fallback and refuses to run there.
- **Read the result.** Open Settings (`$I ad expand "$($I ref button Settings)"` — the row is a plain `<button>` carrying `aria-expanded`; platforms that map that to `menubutton` resolve it too via `ref`'s role fallback), `$I ad click "$($I ref button Appearance)"`, then `$I tree | grep radiobutton`: exactly one of `3`/`4`/`5`/`6` carries the checked state (`states=checked` on the Linux box's AT-SPI; UIA may report `selected`) — that is the live `gridColumns`. Escape closes the sheet.
- **Proof.** Baseline `4` → `press ctrl+minus` → `5` selected; `press ctrl+equal` → `4`; `press ctrl+minus` then `press ctrl+0` → `4` (reset is only distinct when the value is off default). `$I shot` of the grid between steps also shows the cards resizing.

## Gotchas

- The handler is a `keydown` listener on the window inside `Grid.tsx`; send the keys while a grid view is mounted, not while the Settings sheet reads the value back.
- Steps clamp at the ends of `appearanceOptions.gridColumns` (3..6) — a `ctrl+minus` at `6` changes nothing; don't read a no-change as failure.
- Bare `+` needs Shift on a US layout, so the `Ctrl++` binding arrives as `ctrl+shift+=`; `zoomKey` maps it to the same `fewer` step. `$I press ctrl+shift+equal` reaches it if a proof is ever needed.
- `accumulateWheel` folds wheel deltas into one step after a threshold, so a single wheel tick may do nothing by design.
- The value lives in renderer `localStorage` (the `appearance` blob), not `app_settings`, and the whole path is DOM-level — zoom works in the web preview too.
