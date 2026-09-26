# Roaming mascot

The ink blot leaves the sidebar on its own schedule, wanders through free space beside the library grid, looks toward visible cards, changes expression, and fades back into the sidebar. Input never ends an outing. Dialogs and readers pause it in place, and reduced motion keeps it home.

## Sub-features

- `roam-schedule` starts an outing 90 to 180 seconds after the app opens or returns home, without waiting for inactivity.
- `roam-wander` chooses its own stop count, route, and direction through weighted random decisions.
- `roam-expression` holds one randomly chosen expression at each stop.
- `roam-look` turns toward a visible card or recent pointer activity.
- `roam-safe-lanes` keeps the body outside the grid bounds, capture bar, toolbar, sidebar, toasts, and window edges.
- `roam-yield` pauses under modals, readers, detail overlays, background work, and narrow or blocked layouts.
- `roam-return` fades out at a safe gate and restores the sidebar mascot.
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

- **Force an outing.** Run `click --text "Roam now"`, then `wait --selector .mascot-roamer`. Assert `.brand-mark` has `is-roaming`, the overlay has `pointer-events: none`, and the search field does not have `is-mascot`.
- **Audit the whole route.** Install a `requestAnimationFrame` audit that compares `.mascot-roamer` with each `.library-card` clipped to `.library-scroll`, plus `.capture-bar`, `.library-toolbar`, `.search-field`, `.add-button`, `.nav-item`, and `[data-sonner-toast]`. Wait until `.brand-mark` loses `is-roaming`. Expect zero overlaps, zero out-of-viewport frames, several state changes, more than one expression in the dev state text, and a different stop count on another seed.
- **Prove input does not cancel.** While `.mascot-roamer` exists, type `note` into `[aria-label="Search your mind"]` and wait for `for “note”`. Assert the mascot is still mounted and `.brand-mark` still has `is-roaming`. Clear the query and wait for `28 items in library`.
- **Prove layout changes keep it safe.** Set `[data-testid="virtuoso-scroller"].scrollTop = 500`, then assert `.mascot-roamer` still exists and its rectangle does not intersect `.library-grid`.
- **Prove overlays pause it.** Force an outing, open Settings, and wait for `#settings-modal`. Assert `.mascot-roamer` is mounted with computed opacity `0`. Click `Skip 10s`; the dev state text must not change. Close Settings, click `Skip 10s`, and assert the state advances or the mascot returns home.
- **Return home.** Wait until `.brand-mark` loses `is-roaming` and `.mascot-roamer` is absent.
- **Proof.** Save `mascot-roam.png` and keep the audit result and dev state sequence in the transcript.

## Gotchas

- `Roam now`, `Skip 10s`, `Reseed`, and `Home` exist only at `?mascot-roam`. They are not product UI.
- User activity changes where the mascot looks; it never calls the outing's return path. Only the awake-time budget, capture failure, reduced motion, or a missing safe layout ends it.
- The safe lanes are derived from `.library-grid` bounds, not main-panel padding. A masonry relayout can move the lanes.
- The preview badge and dev controls sit above the page with `pointer-events: none` except for their buttons.
- Reduced motion is covered by the controller test. Drive it in a browser only when the harness can emulate `prefers-reduced-motion: reduce`; the default run cannot.
- The full app shares the same frontend behavior. No native capture, OCR, or embedding path is required to verify roaming.
