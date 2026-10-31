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
- `packages/contracts`: the Effect RPC group the renderer calls, the preload
  bridge type, and the shortcut table.
- `packages/rpc-electron`: Effect RPC over Electron message ports.
- `packages/ui`: design tokens (`tokens.stylex.ts`, the only file with color
  values) and shared components.
- `tools/smoke`: launches the built app and checks it reaches the library process.
