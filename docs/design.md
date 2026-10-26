# inkling visual direction

## Direction

A thoughtful canvas companion: a clean, modern workspace where the bloub mascot exists as a responsive companion, anchored but alive, enhancing the library experience through subtle, purposeful interactions while maintaining organized precision and Apple-esque animation craft. The interface balances mascot presence with UI cleanliness, never letting the companion dominate the workspace.

## Composition

- A left sidebar anchors navigation and Spaces with icon-based navigation.
- Search is the primary surface at the top with the mascot enveloping it on focus.
- Our mascot lives in the upper-right corner as a constant but unobtrusive presence.
- The library grid is the center of attention: notes, quotes, images, articles, documents, videos, etc. have disctint card treatments.
- The header is compact; the mascot provides personality without needing hero statements or dashboard metrics.
- An open item replaces the library frame: its media sits on a dotted stage, with an inspector on the right.

## Materials and tokens

Tokens live in the `@theme` block of `src/index.css`. Use their Tailwind names (`bg-surface`, `text-muted`, `rounded-card`) rather than raw values.

- Ground: dark and warm. App `#0a0a09`, canvas `#0c0c0b`, library frame `#0d0c0b`.
- Surfaces: `#161412`, raised `#1b1917`, borders `#262221`.
- Ink: `#e5ddd2`, soft `#c9c1b6`, muted `#8d867c`.
- Accent: copper `#b0714f` (soft `#241c16`) for focus rings, selection and the primary action. Green `#7fa08d` marks processing that is going well.
- Paper tints for notes and quotes: blue `#243136`, green `#26332c`, yellow `#3a3524`.
- Space colors: orange (the accent), green `#7f9a8c`, blue `#8e9bbf`, pink `#c98b8b`, purple `#a88ab5`, yellow `#c9b27a`.
- Type: the system UI stack for body text, DM Sans for display, DM Mono for sizes and counts, Libre Baskerville for quotes and note headings.
- Radii: 9px buttons and rows, 12px toggles and tiles, 14px sidebar, 16px library frame, 20px cards and search, 24px overlays.
- Glass: floating controls over the library are glass. In the desktop app it is liquid glass refracting the library through WebGPU. The web preview and machines without WebGPU get a blurred CSS glass. Card surfaces never get glass.

## mascot behavior

- Home base: upper-right corner, in sidebar header paired with the app name "inkling"
- States: idle (flowy, wavy animation), observing (eyes follow cursor), processing (slightly faster waviness, eyes closed to look like a furrowed brow), delighted (bounce, eyes rotated upwards to look like smiling), sleeping (eyes close after inactivity, slowed down wavyness)
- (This is still being considered and may not be a part of the product) Content-type reactions: mascot morphs based on viewed content (reading posture for articles, wider eyes for images, thoughtful shape for notes, playful tilt for quotes)
- Contextual surfacing: leans toward search on focus, moves to center for empty states, celebrates successes, droops slightly on errors
- Movement: Physics-based drift within zone, 200-400ms transitions, never obscures content
- Accessibility: mascot never sole indicator of state, can be disabled in settings, respects motion preferences

## Interaction grammar

- Search is the primary action and remains visible, with mascot enhancing the experience through contextual reactions.
- Motion follows Apple-like principles: purposeful (communicates something), subtle (never draws attention), consistent (similar timing), performant (60fps).
- Timing standards: 150ms for micro-interactions, 200-300ms for mascot morphs, 300ms for layout transitions, 400ms for delight moments.
- Easing: Default `cubic-bezier(0.4, 0.0, 0.2, 1)`, mascot movement `cubic-bezier(0.25, 0.1, 0.25, 1)` for organic feel.
