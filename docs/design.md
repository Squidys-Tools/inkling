# mymind library visual direction

## Direction

A thoughtful canvas companion: a clean, modern workspace where the Bloub character exists as a responsive companion—anchored but alive, enhancing the library experience through subtle, purposeful interactions while maintaining organized precision and Apple-like animation craft. The interface balances character presence with UI cleanliness, never letting the companion dominate the workspace.

## Composition

- A narrow left rail (64px) anchors navigation and Spaces with icon-based navigation.
- Search is the primary surface at the top (48px height), with the character leaning toward it on focus.
- The Bloub character lives in the upper-right corner (80px size) as a constant but unobtrusive presence.
- The item field is the first visual priority: notes, quotes, images, articles, and documents use distinct card treatments with content-type color strips.
- The header is compact; the character provides personality without needing hero statements or dashboard metrics.
- The detail inspector appears only when an item is selected, with the character moving to the inspector's upper-right corner.

## Materials and tokens

- Canvas ground: `#faf9f6` (warm off-white)
- Ink primary: `#1a1a1a` (near-black for main content)
- Ink secondary: `#6b6b6b` (muted gray for supporting text)
- Rule/subtle: `#e8e6e1` (soft dividers and borders)
- Character body: `#1a1a1a` (same as ink primary for seamless integration)
- Character eyes: `#ffffff` (pure white for contrast)
- Character accent: `#ff7e5f` (soft coral for eye highlights/active states)
- Content-type accents: blue `#4a90e2`, orange `#f5a623`, green `#7ed321`, purple `#bd10e0`, red `#e74c3c`
- Card surface: `#ffffff` (pure white cards on canvas ground)
- Typography: System UI font stack (Inter/SF Pro/Segoe UI) at 15px body, 18px headlines, 13px secondary
- Radii: 14px for content surfaces (matching character's organic curves), 8px for controls
- Elevation: Single soft shadow `0 2px 8px rgba(0,0,0,0.06)` on floating surfaces

## Character behavior

- Home base: upper-right corner, 80px from edges, with 120px movement zone
- States: idle (breathing animation), observing (eyes follow cursor), processing (thinking morph), delighted (bounce), sleeping (eyes close after inactivity)
- Content-type reactions: character morphs based on viewed content (reading posture for articles, wider eyes for images, thoughtful shape for notes, playful tilt for quotes)
- Contextual surfacing: leans toward search on focus, moves to center for empty states, celebrates successes, droops slightly on errors
- Movement: Physics-based drift within zone, 200-400ms transitions, never obscures content
- Accessibility: Character never sole indicator of state, can be disabled in settings, respects motion preferences

## Interaction grammar

- Search is the primary action and remains visible, with character enhancing the experience through contextual reactions.
- Add opens a compact capture action without a heavy modal; character acknowledges with subtle movement.
- Hover reveals media actions without obscuring the card; character's eyes follow cursor to hovered items.
- Selection opens an inspector; Escape closes it; character moves between views with smooth transitions.
- Motion follows Apple-like principles: purposeful (communicates something), subtle (never draws attention), consistent (similar timing), performant (60fps).
- Timing standards: 150ms for micro-interactions, 200-300ms for character morphs, 300ms for layout transitions, 400ms for delight moments.
- Easing: Default `cubic-bezier(0.4, 0.0, 0.2, 1)`, character movement `cubic-bezier(0.25, 0.1, 0.25, 1)` for organic feel.
