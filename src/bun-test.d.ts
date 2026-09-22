// Loads Bun's test-runner types directly: the `@types/bun` stub references
// the `bun-types` package via `/// <reference types="..." />`, which only
// resolves `@types/*` packages, so `bun:test` declarations would otherwise
// never reach the program and `tsc` fails with TS2307.
// `bun-types` must stay a root devDependency — workspaces install it under
// the isolated store, and only a direct dep is linked at `node_modules/bun-types`.
/// <reference path="../node_modules/bun-types/test.d.ts" />
