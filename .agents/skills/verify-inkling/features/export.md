# Export the library

Export writes a dated copy of the library into a folder the user picks in the native dialog. The copy contains a consistent SQLite snapshot, the asset files the snapshot references, and a manifest describing both. If an asset cannot be copied, the export still completes and the manifest records the skipped path and error. It is a copy, never a move: the library keeps running while the export writes. The picker and the writer live in the Rust core, so this feature is only fully reachable in the desktop app.

## Sub-features

- `export-panel` — the `Data` tab in Settings: a panel headed `Your library` that explains in `.settings-panel-note` that the library stays on this machine and an export writes a copy elsewhere.
- `export-button` — `Choose folder and export` (`.settings-data-button`), disabled outside the desktop app and while an export runs.
- `export-picker` — the native folder dialog (`@tauri-apps/plugin-dialog`, `dialog:allow-open`), titled `Choose where to save the export`.
- `export-progress` — busy state: the label becomes `Exporting…`, the icon spins (`.settings-data-button.is-busy`), the button disables, and a `Exporting library…` toast shows `Copying the database and its files`.
- `export-result` — after a success, `.settings-data-result` (`role="status"`) shows `.settings-data-summary` (`<items> items · <files> files · <size>`) and `.settings-data-path` (the chosen folder), plus a `Library exported` toast for 4 s. If files were skipped, the summary includes the count and the toast says `Library exported with skipped assets`. In-session only: nothing about the last export is persisted.
- `export-failure` — `Could not open the folder picker` when the dialog itself fails; `Export failed` (no auto-dismiss, close button) with the core's message when the snapshot or manifest cannot be written.
- `export-folder` — what lands in the chosen destination: `inkling-export-<YYYY-MM-DD-HHMMSS>/` holding `library.sqlite3` (a `VACUUM INTO` snapshot), readable `assets/items/<id>/…` for the items the snapshot references, and `manifest.json` (`format`, `formatVersion`, `appVersion`, `schemaVersion`, `exportedAt`, `counts`, `bytes`, `skippedAssets`, `regenerable`).

## How to get to it (user POV)

- Choose `Settings` in the sidebar footer, then the `Data` tab.
- Choose `Choose folder and export` and pick a destination folder in the native dialog.
- Read the result card in the panel, and the toast.
- Reopen Settings later: it comes back on the `Archive` tab, with the last export's card still visible until the app reloads.

## Driving it with harness.mjs

Preconditions:

- A healthy dev-mode run per [SKILL.md](../SKILL.md), `doctor` passing, `.result-count` reading `28`.
- The export panel is reachable in the preview, but the export itself is not: `shouldUseSeedLibrary()` is true, so `canUseTauriBackend` is false and `exportLibraryToFolder` returns before the picker. The preview proves the panel, the boundary note, and the tab behavior only.

- **Open the panel.** Run `click --selector '[aria-label="Settings"]'`, `wait --selector ".settings-modal"`, then `click --within ".settings-modal-sidebar" --text "Data"`. The `Data` tab takes `aria-current="page"`, the heading becomes `Your library`, and `.settings-data-card` shows `Export a copy` with the dated-folder description.
- **Read the boundary.** Run `text --selector ".settings-data-button"` (expect `Choose folder and export`) and `text --selector ".settings-data-hint"` (expect `Export runs in the desktop app.`). Then `eval --expr 'document.querySelector(".settings-data-button").disabled'` (expect `true`) and `eval --expr '!document.querySelector(".settings-data-result")'` (expect `true`: no export has run).
- **Confirm the click is inert.** Run `click --selector ".settings-data-button"` and then `eval --expr '!document.querySelector(".settings-data-result")'`. A disabled button swallows the click; no toast appears.
- **Check the tab reset.** Close settings (`click --selector '[aria-label="Close settings"]'`), reopen it, and assert the panel is the archive again: `eval --expr 'document.querySelector(".settings-modal-sidebar")?.innerText.replace(/\s+/g, " ")'` reads `Settings Archive 3 Data`, and `.settings-panel-count` reads `3 items in archive`. This is the reverse state of the new tab — a panel that cannot be left is a bug.
- **Proof (preview).** Screenshot the Data panel with the disabled button and the hint, and keep the asserted strings. Report the export and the result card as unverified from the preview.
- **Full app.** `bun run tauri dev` (or a `bun run preview:win` review build, which uses its own `data\` directory) with the desktop harness. Click the button, choose a destination, then assert `.settings-data-summary` and `.settings-data-path` in the panel and the `Library exported` or `Library exported with skipped assets` toast. The visible result is not the proof: read the folder back, including `manifest.json` counts and `skippedAssets`, and open the snapshot through `sqlite3 library.sqlite3 "select count(*) from items"` (read-only), or use whatever the desktop harness offers to inspect files.
- **Focused code test.** `cargo test export` in `src-tauri/` covers the phases without a UI: a readable snapshot with assets and a manifest, a locked asset skipped while the snapshot and other files survive, earlier exports kept and a missing destination refused, and the calendar stamp. These run against a temporary storage, never the live library.

## Gotchas

- The folder picker is native, so Chrome/CDP cannot reach it. Do not substitute `invoke("export_library", ...)` in the preview and call the feature verified: without the picker it is not the user's path.
- The destination must already exist and must sit outside inkling's asset store; the core refuses both cases (`choose an existing folder to export into`, `choose a folder outside inkling's own asset store`) and the message arrives in the `Export failed` toast.
- Asset copy failures do not discard the snapshot. The result card and toast show how many files were skipped; `manifest.json` lists each export-root-relative path and error. A failed snapshot or manifest write still removes the incomplete export folder.
- Exports never overwrite: a second export inside the same second lands beside the first as `-2`, `-3`, and so on.
- The panel's result card is session state. A reload forgets it, so a proof that reloads before screenshotting shows the pristine panel.
- Never export into the live asset store and never point a verification run at the live library.
