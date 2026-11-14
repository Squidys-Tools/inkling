# Welcome tour

The first launch over an unfinished library opens a five-screen welcome (`#/welcome`) that demos the app's core moves. `Continue` advances, `Back` returns, `Skip` leaves at any point, and the last screen's `Open my library` enters the library. Finishing writes `app_settings.onboarding_completed = '1'`, so the next launch goes straight to the library. Status: **driven** on 2026-11-14 (all five screens, `Open my library`, the persisted flag). Not driven: each screen's animated demo (motion is asserted only by watching the tree settle).

## Sub-features

- `welcome-screens` five screens, each advancing on `Continue`; `Back` appears from screen two.
- `welcome-skip` `Skip` or Escape leaves the tour and finishes onboarding the same way.
- `welcome-finish` the last screen's `Open my library` completes the flag and lands on `#/`.
- `welcome-replay` Settings > General > "Welcome tour" > `Show the welcome again` replays it; finishing a replay returns to the page it sat over.

## How to get to it (user POV)

- The app's first launch (when `onboardingCompleted` is false). In a verification run: `launch --empty` — the seeded run has completed onboarding, so it never shows the tour. Settings > General replays it.

## Driving it with agent-desktop

Preconditions: `$I launch --empty` (unseeded library). `doctor` accepts `Skip` as the ready marker on an unseeded run — the whole app shell is `inert` under the welcome, so the sidebar's `Everything` link is not the marker here.

- **Screens.** `$I tree` shows `group "Welcome to inkling"` with `Continue` and `Skip` on screen one; from screen two a `Back` button joins. `$I ad click "$($I ref button Continue)"` four times walks all five; on the last screen `Continue` is replaced by `Open my library`.
- **Finish.** `$I ad click "$($I ref button 'Open my library')"` lands on `document …#/` with `Everything 0`. `$I db "SELECT value FROM app_settings WHERE key='onboarding_completed'"` → `1`. `$I shot`.
- **Skip.** `Skip` on any screen finishes identically (same flag, same landing); Escape does the same. To prove Skip instead of finishing, click it on screen one and check the flag.

## Gotchas

- A seeded run never shows the tour — its library already carries `onboarding_completed`. Verify only on `--empty`.
- The tour is not reachable in the web preview (`useFirstRun` is desktop-only) and a failed `onboardingCompleted` check counts as complete, so the welcome can't trap the user.
- While `#/welcome` is shown, all shortcuts are suppressed (`useCommands` returns early), so Ctrl+K etc. do nothing — don't diagnose that as a broken search.
- Screen transitions animate; the button names stay stable (`Continue`/`Back`/`Skip`), so ref-lookup still works mid-transition.
