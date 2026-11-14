# inkling visual direction

## Direction

A clean, dark workspace where the library grid gets the attention. The ink-blot
mascot adds personality from a fixed spot and never covers content.

## Composition

- A left sidebar holds navigation and Spaces, with the mascot and the inkling wordmark in its header.
- Search sits at the top of the library. While it has focus, the mascot leaves the sidebar and its eyes appear in the search field.
- The library grid is the center of attention. Notes, quotes, images, articles, documents and videos each have their own card treatment.
- The header stays compact: no hero statements or dashboard metrics.
- An open item replaces the library frame: its media sits on a dotted stage, with an inspector on the right.

## Materials and tokens

Tokens live in `packages/ui/src/tokens.stylex.ts`, the only file with color values. Use them through `stylex.create` and `stylex.props` rather than raw values.

- The ground and surfaces are dark and warm, and text is a warm off-white ink.
- The copper accent marks focus rings, selection and the primary action. Green marks processing that is going well.
- Notes and quotes sit on the dark surface, notes in a grey-green ink and quotes in a warm yellow.
- Spaces pick one of six colors: the accent orange, green, blue, pink, purple and yellow. The color draws the Space's kind on its cover: a dashed outline around a Regular Space's newest picture, and a seam splitting a Smart Space's two latest matches corner to corner.
- Body text uses the system UI stack, display text DM Sans, sizes and counts DM Mono, and quotes and note headings Libre Baskerville. Note and Focus Mode text is Source Serif 4, and the reader offers font sets of its own.
- Floating controls over the library are glass, the one `Glass` component in `packages/ui`; cards never are. [tech-stack.md](tech-stack.md#styling) gives the limit on glass and why.

## Mascot

- It lives in the sidebar header, beside the wordmark.
- At rest it drifts slowly; under reduced motion it sways gently instead.
- While background jobs run, it shows a notification dot.
- With search focused it looks attentive, and curious while the user types.
- When a capture fails, it looks sad.
- It is never the only sign of a state.

## Interaction grammar

- Search is the primary action and stays visible.
- Motion communicates something and never draws attention to itself.
- Durations and easings come from the `motion` tokens, whose durations drop to zero under reduced motion.
