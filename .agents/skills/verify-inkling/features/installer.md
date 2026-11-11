# Windows setup window

`inkling-setup-<version>-win-<arch>.exe` (`apps/setup`, packed by `tools/installer/pack.ts`) shows a branded window over the silent NSIS installer: Install, a progress bar, "You're all set" with a 3 s countdown that opens inkling, or "Setup didn't finish" with Try again and Copy details. Status: **driven** on 2026-11-11 on Windows 11, every screen. Windows only.

## Sub-features

- `setup-welcome` the window opens on Install; only the visible screen's buttons are in the accessibility tree.
- `setup-progress` the bar tracks the install's real duration (`$I progress`).
- `setup-ready` success shows "You're all set" and the countdown sends `open`.
- `setup-failed` an install that leaves no `inkling.exe` shows "Setup didn't finish" with the reason.
- `setup-close` the page's Close button closes the window on every screen except installing, where it is gone.

## How to get to it (user POV)

- Run the downloaded setup exe. `/S` skips the window and runs NSIS silently; with no WebView2 the stub falls back to the stock NSIS UI. Updates never show it (`quitAndInstall` is silent).

## Driving it with instance.ts

Preconditions: `.artifacts/electron/win-unpacked` from `bun run dist` (any recent build; the payload's content does not matter), Rust with the MSVC toolchain.

- `$I launch --installer` builds a test-identity NSIS from `win-unpacked` once (about 2 min; cached in `.artifacts/setup-verify/` until `app.asar`, `build/installer.nsh` or `instance.ts` changes), packs the current stub and UI around it, and opens the window with `/D=<run>/install`. `$I doctor` checks the window.
- `$I ad click "$($I ref button Install)"`. Screens are asserted with `ref`: `Install` on welcome, `Open now` on ready, `Try again` on failed; each is found only while its screen shows.
- `$I progress` reads the stub's samples: the bar at each tenth of the real duration. An even pace climbs about 10 points a row; a 13 s install ends at 99% with no row more than ~20 points off.
- Wait for `ref button "Open now"`, then `$I shot`: the countdown fires `open` 3 s later. Under the harness the stub logs `open` to `progress.log` and starts nothing, then closes.
- Proof of install: `<run>/install/inkling.exe` exists, and `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\bbf65adc-c826-4291-bfd0-9e266345089d` names `inkling setup verify`.
- `$I launch --installer --fail` puts a file where the install folder goes. `build/installer.nsh` finds no `inkling.exe`, deletes the keys NSIS just wrote and exits 3; the window shows "Setup didn't finish" / "Setup couldn't write inkling's files to <dir>". Proof: both `reg query` keys under the guid (Uninstall and `HKCU\Software\<guid>`) are missing while that screen shows.
- Close: `$I ad click "$($I ref button Close --in "$($I ref group 'Chrome Legacy Window')")"`. The hidden native title bar also has Minimize and Close, so unscoped `ref button Close` finds several.

## Isolation

The test identity has its own appId, package name, NSIS guid, uninstall name and shortcut name, no `inkling://` handler and no shortcuts, and installs under `.dev`, so the user's install, link handler, shortcuts and updater cache (`%LOCALAPPDATA%\inkling-updater`) are untouched. The names matter: a failed install deletes `<shortcutName>.lnk` from the Start Menu and desktop, and every install copies itself into `<package name>-updater`. `INKLING_SETUP_DEV` (set only by `launch --installer`) keeps the countdown from starting the installed app, which would open the user's real library. `cleanup` runs the test uninstaller in place, refuses if either of the guid's keys survives, and removes the test identity's own `inkling-setup-verify-updater` folder. It never deletes them itself: a key left by a failed install is a regression in `build/installer.nsh`. The test NSIS rebuilds when `app.asar`, `build/installer.nsh` or `instance.ts` changes.

## Gotchas

- `tree` on this window sometimes lists another Chromium window's controls (an agent-desktop mix-up between Chromium content panes). `ref` is not affected; trust `ref` and screenshots.
- `tree` and doctor use `--max-depth 25`: WebView2 nests the page past agent-desktop's default of 10.
- A launch right after repacking can wait on an antivirus scan of the 330 MB exe; `launch` allows 90 s.
- Copy details (clipboard) and Minimize are not driven.
- The bar sits at 0% for the first seconds after Install while the stub copies the 330 MB NSIS to temp; that copy is not counted yet.
- The ready screen closes ~3 s after `Open now` appears, faster than a `ref` then a separate `shot` can run (each command is a process spawn). Poll `ref button "Open now"` in a loop and take the shot in the same iteration — or read `open` in `progress.log`, which only the ready countdown writes.
