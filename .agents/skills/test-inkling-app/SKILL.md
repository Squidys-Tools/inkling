---
name: test-inkling-app
description: Launch, keep, and test the inkling desktop app in an isolated run, with preview or tauri dev, demo seed or safe SQLite copy, and harness screenshots. Use when an agent needs to run inkling locally, check UI behavior with a human, or prepare test data without touching the live library.
---

# Test inkling app

Use this skill to run inkling for manual checks with a human. It covers the web preview and the full Tauri app on Windows.

Subagents never start their own dev servers. Only the main agent starts a run, tracks the terminal handle, and reuses it across turns. Ask the user for permission before driving a browser or the desktop.

## Start an isolated run

1. Run commands from the repository root.
2. Check Bun first. It must match `.bun-version` (1.4.2). Run `bun run check:bun-version` and fix the install before you continue.
3. Run `bun install` if module resolution looks stale.
4. Pick one run type for the task at hand.
   - Use `bun run preview` for UI only layout work. It skips the Rust build and it has no native OCR, embeddings, or file access.
   - Use `bun run tauri dev` for anything native, such as OCR, embeddings, file access, capture, jobs, or SQLite behavior. It needs the Rust toolchain. The README lists the MSVC and GNU paths.
5. Read the actual terminal output for the URL or window state. Do not assume a port. Vite uses port 1420 with strict port mode for `tauri dev`, so it fails instead of moving when the port is busy.
6. Confirm the server is yours. This machine runs several dev servers at once, and another worktree can already own the port you asked for. Start preview with `bun run preview -- --port <free-port> --strictPort`, then check the listener's command line mentions your worktree before trusting anything it serves. A 200 from the wrong server proves nothing.
7. Never point a run at the developer live library. Keep test state isolated from real data.

Treat the run as disposable unless you created it for the current test. Prefer a fresh isolated run over clearing state of unclear ownership.

## Keep the run alive across turns

Treat the full testing loop, not one assistant turn or one check, as the life of the run.

- Keep the dev process, selected URL or app window, and seeded data alive while the user may look at the result or ask for changes.
- Do not stop the server because one check finished or because you yield a response.
- On a later turn, check that the tracked process still runs and reuse the same URL or window. If it exited, restart it the same way and reseed only if needed.
- Tell the user when a run stays available, and include the local URL when it helps.

## Seed with demo data or a safe copy

An empty library hides most bugs, so seed each run before you check behavior.

- For UI work, rely on the committed demo seed in `public/seed-demo` plus `src/seedPersonal.ts`. It shuffles with a fixed seed, so order stays mixed but stable. Prefer it when it covers the case.
- For ingestion work, copy a SQLite database into your sandbox and bring only the assets your flow needs. Copy the data in, never symlink it, and never write test edits back to the source.
- Copy the database with SQLite backup semantics so the copy stays valid while the source app runs. Bring the `-wal` and `-shm` files when you copy raw files, or back up through the engine.
- Never commit a copied database, a real user item, a model file, or a full capture URL with real content.

## Inspect SQLite read only

- Read the test copy with read only queries.
- Do not open the developer live database read write, delete from it, or clean it up.
- When behavior looks wrong, confirm the row state in the copy before you change code.

## Take screenshots the user must see

- Take one real pass in the running app before you call UI work done. Use preview for layout and the full app for anything native.
- Save screenshots with `screenshot_out_file` to `C:\Users\$USER$\AppData\Local\Temp\$HARNESS$\chat-images\`. Create that folder if missing.
- Embed the saved file in your reply so the user sees it. Tool results alone do not show the user an image.
- Prefer full window shots unless the user asked for one section. Wipe only that chat images subfolder.
- Ask for permission before you drive a browser or the desktop on your own.

## Tear down only when finished

Tear down when the user asks, confirms the round is done, or the task is complete with no pending review. Do not infer completion from the end of one turn.

When teardown fits:

1. Stop only the process you started, with the handle you tracked. Never stop a process by name match.
2. Keep the isolated copy when it holds useful proof for a likely follow up.
3. Otherwise remove only a path you created for this test, after you resolve and check the exact target.

When unsure, keep the run alive and say that it stays ready for more checks.

## Prove library and perf changes

For storage, jobs, or refresh work, run this set before calling it done. Each one covers a layer the others cannot see.

1. `bun run typecheck` for the frontend scope you touched.
2. `bun test <files>` for the tests you touched, then the full `bun test` when the change is broad.
3. `cargo test --manifest-path src-tauri/Cargo.toml storage::` and `jobs::` for Rust changes, plus `cargo fmt` when you edited Rust.
4. When you claim a speedup, run the benchmark that measures the changed path (`benchmark_library_refresh` needs `-- --ignored --nocapture`) and report the raw numbers with the build type. An ignored test that never runs proves nothing.
5. Serve your built output and check it answers, following step 6 above so you know it is your server. Serving proves the bundle loads. It does not prove rendering. Open it in a browser and look at the changed flow at least once.

## Fix common problems

| Symptom | What to do |
| --- | --- |
| Preview answers but shows the wrong build | Another worktree owns that port. Pick a free port, restart with `--strictPort`, and check the listener command line before trusting the page. |
| `tauri dev` opens the real library | The dev app uses the same data folder as the shipped app. Label test items clearly, remove exactly what you created when done, and confirm the counts are back to what you found. |
| Library looks blank | Confirm the demo seed loads, or confirm your copied database and assets reached the sandbox. Check that you seeded the run you actually opened. |
| Native features do nothing in preview | Move the check to `bun run tauri dev`. Preview has no OCR, embeddings, or file access. |
| Port already in use | Read the terminal output. Do not hardcode a localhost port. Stop only your tracked process, then restart. Never stop a process you found by name. |
| Stale or mixed state | Restart the same run, reseed from a clean source, and check that no other run points at the same copy. |
