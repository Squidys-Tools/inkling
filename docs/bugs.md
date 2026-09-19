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

### Medium — one unreadable asset file throws away the whole export

**Where.** `finish_export` in `src-tauri/src/storage.rs`, with the cleanup in the `export_library` command.

**What goes wrong.** `copy_directory` stops at the first error and the command then deletes the half-written export folder, so a single file that cannot be read — locked by a virus scanner, open in another program, odd permissions — costs the user the entire export after however long it has been copying. The toast shows the OS message alone, because `StorageError::Io` forwards only that, so it does not even name the file that failed.

**Fix.** Add the path to the error at each `fs::copy` and `read_dir` call. Then decide what a partial export should do: keep what did copy and list the skipped item ids in the manifest, or fail only after walking everything so the message at least names every problem. Keeping partial results matches how capture treats a failed extraction.

### Low — the export name fallback can delete an earlier export

**Where.** `unique_export_directory` in `src-tauri/src/storage.rs`.

**What goes wrong.** When every name from `inkling-export-<stamp>` to `inkling-export-<stamp>-999` is taken, it returns `base`, which exists by definition. `VACUUM INTO` refuses to write to an existing file, the export fails, and the failure cleanup removes that folder — an earlier export. Reaching it needs 999 exports inside one second, so this is a bad fallback rather than a live risk, but the fallback is the one path where cleanup can touch files it did not create.

**Fix.** Return an error once the loop runs out instead of handing back `base`.
