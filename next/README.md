# inkling (rebuild)

The ground-up rebuild of inkling. It replaces the app at the repository root
once it reaches feature parity; until then the root app ships and this folder
is its own Bun workspace with its own lockfile and checks.

```sh
bun install
bun run dev:app      # build and open the desktop app
bun run dev          # renderer only, in a browser
bun run check        # typecheck, lint, test, build
```

## Layout

- `apps/desktop`: Electron main process and preload. Windows, menus, dialogs,
  the `app://` protocol, and the processes below. It never opens the database.
- `apps/renderer`: the React app. Routes, pages and stores, styled only with StyleX.
- `packages/library`: the library process, the only owner of the SQLite file.
  It runs the job queue and writes every job's result.
- `packages/jobs`: the worker process. OCR, embeddings, thumbnails, PDF and URL
  extraction as stateless calls the library process makes over Effect RPC.
- `packages/ingestion`: URL extraction, HTML sanitizing and the embed allowlist,
  shared by the worker and the renderer.
- `packages/contracts`: the Effect RPC groups the renderer and the library
  process call, the preload bridge type, and the shortcut table.
- `packages/rpc-electron`: Effect RPC over Electron message ports.
- `packages/ui`: design tokens (`tokens.stylex.ts`, the only file with color
  values) and shared components.
- `tools/smoke`: launches the built app and checks it reaches the library process.
- `tools/models`: `bun tools/models/prepare.ts` stages the pinned embedding
  models for a packaged build. Without them the app downloads them once into
  the library's `models` folder.
