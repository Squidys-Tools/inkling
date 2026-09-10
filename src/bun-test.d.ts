// Loads Bun's test-runner types directly: the `@types/bun` stub references
// the `bun-types` package via `/// <reference types="..." />`, which only
// resolves `@types/*` packages, so `bun:test` declarations would otherwise
// never reach the program and `tsc` fails with TS2307.
/// <reference path="../node_modules/bun-types/test.d.ts" />
