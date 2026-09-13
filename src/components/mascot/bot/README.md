# Vendored bloub engine (`src/components/mascot/bot/`)

Source: https://github.com/jeremy-prt/bloub by Jérémy Perret, MIT licensed.
Not affiliated with, endorsed by, or connected to x.ai.

## What this is

`src/bot/` from bloub is framework-free and clock-free: `BotEngine.sample(t)`
is a pure function of time. Only this directory was vendored — the Vue shell
(`BloubBot.vue`, views, i18n, export pipeline) was deliberately left behind and
re-implemented in React as `../InklingMascot.tsx`.

## Rules for this directory

- Keep it pure: no `Date.now()`, no React/Vue imports. React adapters live
  one level up. This preserves frozen-frame rendering and DOM-less testing.
- `profiles.ts` is measured reference data — never edit by hand.
- `skins.ts` is the sanctioned extension point for inkling shapes and colors
  (marked `INKLING EXTENSION`). Adding a shape there also registers it in the
  `eyefit.ts` correction table built at import.
- New animations go in `states.ts` as new `StateDef` entries; never rewrite
  measured states. Blocks hold or cut time, never scale it (`cycles.ts`).
- Test files (`*.test.ts`) were not vendored (vitest + happy-dom); equivalent
  coverage for inkling shapes lives in `../inklingSkins.test.ts` (bun:test).
