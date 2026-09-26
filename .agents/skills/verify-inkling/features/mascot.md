# Roaming mascot

The ink blot lives in the sidebar, commutes into the search field on focus, and on its own schedule leaves home to wander through free space beside the library grid, look toward visible cards, change expression, and fade back. Input never ends an outing. Dialogs and readers pause it in place, and reduced motion freezes every mascot surface.

## Sub-features

- `roam-schedule` starts an outing 90 to 180 seconds after the app opens or returns home, without waiting for inactivity. A start that lands while blocked or without safe spots defers 15 to 30 seconds.
- `roam-wander` chooses its own stop count, route, and direction through weighted random decisions.
- `roam-expression` holds one randomly chosen expression at each stop.
- `roam-look` turns toward a visible card, recent pointer activity, or, while travelling with neither, the next route waypoint.
- `roam-safe-lanes` keeps the body outside the grid bounds, capture bar, toolbar, toasts, and window edges. The sidebar is excluded by the main-content frame, not by an obstacle list.
- `roam-yield` pauses under modals, readers, detail overlays, background work, and narrow or blocked layouts.
- `roam-return` fades out at a safe gate and restores the sidebar mascot.
- `mascot-commute` moves the mascot's eyes into the search field on focus and restores the sidebar slot on blur.
- `mascot-reduced-motion` freezes the sidebar mark, the search eyes, and roaming together when the OS preference is on.
- `roam-dev` adds force, time-skip, reseed, and return-home controls at `?mascot-roam=<seed>`.

## How to get to it (user POV)

- Leave the seeded preview open. The first outing starts on its own within three minutes.
- Keep typing, searching, scrolling, or opening items. The outing continues.
- Open Settings or an item while it is away. The mascot yields and resumes afterward.
- For a repeatable check, open `?mascot-roam=2026` and use the dev controls.

## Driving it with harness.mjs

Preconditions:

- Start a fresh `serve` and `start` run, then run `doctor` with `.result-count` reading `28`.
- Navigate to `<run url>?mascot-roam=2026` and wait for `.mascot-roam-dev`.
- Use a headless run. A background browser tab may throttle `requestAnimationFrame`, which correctly pauses the shared mascot loop.

- **Check the search commute at rest.** Press `/` (`key --key Slash`) to focus the search field. Assert `.search-field` has `is-mascot`, `.brand-mark` has `is-away`, and `.field-mascot svg` is visible. The harness `focus` command sets DOM focus without the pointer event React needs here; use the shortcut or a real click. Blur with `eval --expr 'document.querySelector("[aria-label=\"Search your mind\"]").blur()'` and wait for `is-mascot` to disappear and `is-away` to clear.
- **Force an outing.** Run `click --text "Roam now"`, then `wait --selector .mascot-roamer`. Assert `.brand-mark` has `is-roaming`, the overlay has `pointer-events: none`, and the search field does not have `is-mascot`.
- **Audit the whole route.** Install a `requestAnimationFrame` audit that compares `.mascot-roamer` with each `.library-card` clipped to `.library-scroll`, plus `.capture-bar`, `.library-toolbar`, `.search-field`, `.add-button`, and `[data-sonner-toast]`. The sidebar needs no overlap selector: candidates are bounded by the `.main-content` frame. Wait until `.brand-mark` loses `is-roaming`. Expect zero overlaps, zero out-of-viewport frames, several state changes, more than one expression in the dev state text, and a different stop count on another seed.
- **Prove input does not cancel.** Force a fresh outing, type `note` into `[aria-label="Search your mind"]`, and wait for `for “note”`. Assert the mascot is still mounted and `.brand-mark` still has `is-roaming`. Clear the query and wait for `28 items in library`.
- **Prove layout changes keep it safe.** Force a fresh outing, wait for `.mascot-roamer`, set `[data-testid="virtuoso-scroller"].scrollTop = 500`, then assert `.mascot-roamer` still exists and its rectangle does not intersect `.library-grid`.
- **Prove overlays pause it.** Force a fresh outing, open Settings, and wait for `#settings-modal`. Assert `.mascot-roamer` is mounted with computed opacity `0`. Click `Skip 10s`; the dev state text must not change. Close Settings, click `Skip 10s`, and assert the state advances or the mascot returns home.
- **Return home.** Wait until `.brand-mark` loses `is-roaming` and `.mascot-roamer` is absent.
- **Proof.** Save `mascot-roam.png` and keep the audit result and dev state sequence in the transcript.

## Gotchas

- `Roam now`, `Skip 10s`, `Reseed`, and `Home` exist only at `?mascot-roam`. They are not product UI.
- User activity changes where the mascot looks; it never calls the outing's return path. Only the awake-time budget, capture failure, reduced motion, or a missing safe layout ends it. A `keydown` re-arms the look window using the last pointer position, so recent input is not limited to pointer movement.
- Force a fresh outing before each independent check. An outing can finish during search typing, and the next scroll or modal step would then prove nothing.
- Reduced motion is global, not roam-only: the shared store refuses to start its loop, the sidebar mark and search eyes freeze, and the controller returns home. It is covered by unit tests. Drive it in a browser only when the harness can emulate `prefers-reduced-motion: reduce`; the default run cannot.
- The safe lanes are derived from `.library-grid` bounds, not main-panel padding. A masonry relayout can move the lanes.
- The preview badge and dev controls sit above the page with `pointer-events: none` except for their buttons.
- The full app shares the same frontend behavior. No native capture, OCR, or embedding path is required to verify roaming.
