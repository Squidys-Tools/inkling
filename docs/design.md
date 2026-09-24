# inkling visual direction

## Direction

A thoughtful canvas companion: a clean, modern workspace where the bloub mascot exists as a responsive companion, anchored but alive, enhancing the library experience through subtle, purposeful interactions while maintaining organized precision and Apple-esque animation craft. The interface balances mascot presence with UI cleanliness, never letting the companion dominate the workspace.

## Composition

- A left sidebar anchors navigation and Spaces with icon-based navigation.
- Search is the primary surface at the top with the mascot enveloping it on focus.
- Our mascot lives in the upper-right corner as a constant but unobtrusive presence.
- The library grid is the center of attention: notes, quotes, images, articles, documents, videos, etc. have disctint card treatments.
- The header is compact; the mascot provides personality without needing hero statements or dashboard metrics.
- The detail inspector appears only when an item is selected, with the mascot moving to the inspector's upper-right corner.

## Materials and tokens

- Canvas ground: `#faf9f6` (warm off-white)
- Ink primary: `#1a1a1a` (near-black for main content)
- Ink secondary: `#6b6b6b` (muted gray for supporting text)
- Rule/subtle: `#e8e6e1` (soft dividers and borders)
- Mascot body: `#1a1a1a` (same as ink primary for seamless integration)
- Mascot eyes: `#ffffff` (pure white for contrast)
- Mascot accent: `#ff7e5f` (soft coral for eye highlights/active states)
- Content-type accents: blue `#4a90e2`, orange `#f5a623`, green `#7ed321`, purple `#bd10e0`, red `#e74c3c`
- Card surface: `#ffffff` (pure white cards on canvas ground)
- Typography: System UI font stack (Inter/SF Pro/Segoe UI) at 15px body, 18px headlines, 13px secondary
- Radii: 14px for content surfaces (matching mascot's organic curves), 8px for controls
- Elevation: Single soft shadow `0 2px 8px rgba(0,0,0,0.06)` on floating surfaces

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
