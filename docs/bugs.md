# Bugs

Open defects, one entry each, worst first. [roadmap.md](roadmap.md) holds what is planned, [changelog.md](changelog.md) holds what is fixed.

Rules for entries:

- Say where the code is, what the user loses, and what the fix is, so a session can pick one up cold.
- Delete the entry in the same change that fixes it, and record the fix in the changelog.
- Severity is about the user's data and whether a normal path works, not about how the code reads:
  - **Critical** — data loss, corruption, or a crash on a normal path.
  - **High** — a normal path is broken, wrong, or unresponsive.
  - **Medium** — a real failure with a workaround.
  - **Low** — an edge case, or a failure mode that wastes the user's time.

Nothing critical is open right now.

## Open

### Low — the export name fallback can delete an earlier export

**Where.** `unique_export_directory` in `src-tauri/src/storage.rs`.

**What goes wrong.** When every name from `inkling-export-<stamp>` to `inkling-export-<stamp>-999` is taken, it returns `base`, which exists by definition. `VACUUM INTO` refuses to write to an existing file, the export fails, and the failure cleanup removes that folder — an earlier export. Reaching it needs 999 exports inside one second, so this is a bad fallback rather than a live risk, but the fallback is the one path where cleanup can touch files it did not create.

**Fix.** Return an error once the loop runs out instead of handing back `base`.
