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

Tokens live in the `@theme` block of `src/index.css`. Use their Tailwind names (`bg-surface`, `text-muted`, `rounded-card`) rather than raw values.

- The ground and surfaces are dark and warm, and text is a warm off-white ink.
- The copper accent marks focus rings, selection and the primary action. Green marks processing that is going well.
- Notes and quotes sit on blue, green or yellow paper tints.
- Spaces pick one of six colors: the accent orange, green, blue, pink, purple and yellow.
- Body text uses the system UI stack, display text DM Sans, sizes and counts DM Mono, and quotes and note headings Libre Baskerville.
- Floating controls over the library are glass; card surfaces never are. [tech-stack.md](tech-stack.md#styling) explains the liquid glass and its CSS fallback.

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
- Timing: 150ms for micro-interactions, 200-300ms for mascot changes, 300ms for layout transitions, 400ms for moments of delight.
- The default easing is `cubic-bezier(0.4, 0.0, 0.2, 1)`.
