# Expanded item overlay

Status: draft feature spec

## Purpose

When someone clicks a library card, inkling should enlarge that item without taking them out of the library. The card should grow from its original position into an expanded overlay. The user can inspect the item, open the original, or find related items. The surrounding cards remain visible so another selection is one click away.

This is a quick triage view. It is not a replacement for the article reader, PDF viewer, or a full editing screen.

## User outcome

The user should be able to answer two questions quickly:

1. Is this the item I meant to open?
2. Should I open it, or look for something related?

The overlay should make those answers easier without hiding the visual library or forcing a second navigation step.

## Interaction model

- Clicking a card opens its expanded overlay.
- The source card stays in the grid and gets a quiet selected state. The grid does not reflow.
- The overlay behaves as a modeless dialog. Cards and the visible library remain interactive.
- Clicking another visible card switches the overlay to that item. The current overlay returns toward its source card while the new card grows into the same destination.
- Clicking empty library space closes the overlay.
- Clicking inside the overlay does not close it.
- Escape closes the overlay and returns focus to the source card when that card still exists in the DOM.
- A close button remains available in the overlay header.
- The overlay keeps its scroll position when the user changes only the selected item if the new content has the same section structure. Opening a new item from the grid starts at the top.

## Overlay layout

The expanded item keeps the source card's outer aspect ratio while it grows. The browser should clamp the final rectangle to the available viewport instead of stretching it. The media area keeps its item-specific aspect ratio, and the text remains normal document flow.

The first viewport of the overlay should contain:

1. The media or artwork preview.
2. Type, date, and title.
3. A short description or excerpt.
4. The primary action, usually `Open original`, `Read`, `Play`, or `Open PDF`.
5. `Find similar` for images, or `Find related` for other item types when supported.

Source, tags, capture details, and secondary actions should follow in a compact metadata area. Archive, delete, edit, Add to Space, Favorite, and Copy link belong in an overflow or utility row. They should not compete with the two triage actions.

The overlay body has its own scroll container. Related items can appear below the metadata without changing the opening geometry. If there are no related items yet, the section should not reserve a large empty block.

## Placement

The final rectangle should be chosen before the opening animation starts.

- Prefer a centered position when the item is not close to an edge and the available content area can hold the overlay.
- Prefer a side position when the source card is close to the left or right edge, or when centering would cover too much of the visible library.
- Expand toward the side with more free space. The destination should stay inside the visual viewport and account for the navigation rail, window insets, and a usable margin.
- If the viewport is too small for a side position, use a centered, nearly full-width overlay with an internal scroll area.
- On narrow screens, use a single-column expanded overlay. Do not attempt a side-by-side card and detail layout.

The overlay should have a stable destination for the duration of one open state. It should not move merely because the cursor moves or because another item finishes loading.

## Motion

The motion has four states:

- Opening: source card to expanded overlay.
- Open: overlay remains still while its body scrolls.
- Switching: outgoing item returns to its card while the incoming item grows into the same overlay destination.
- Closing: overlay returns to the source card, then the overlay is removed.

The opening animation should animate the overlay rectangle, border radius, shadow, and media size as one visual object. Text and secondary details can reveal after the rectangle has started growing. The media must not stretch independently of its frame.

When switching items, use two temporary visual representations if both source cards are mounted:

```text
current overlay -> previous card
new card        -> current overlay
```

The live grid cards should not receive layout transforms. They remain in Virtuoso's layout and only show selection styling. If a source card is no longer mounted, use a short crossfade from the current overlay to the new source rather than trying to recover a missing rectangle.

GSAP should own rectangle and transition geometry for this feature. React should own selected-item state and content. No second animation library should write transforms or dimensions to the same overlay element.

## Content states

The overlay needs to handle these states without changing its basic shape:

- Normal item with image or artwork.
- Article with a saved reader action.
- Video with a play action.
- PDF with an open action.
- Note or quote with text-first content.
- X post with a native embed or fallback artwork.
- Loading metadata or embed.
- Missing preview or failed embed.
- No related items.
- Related items loading, failed, or ready.

Third-party embeds must stay inside a stable frame. Do not scale an X iframe with a transform. Do not duplicate a live iframe during the transition unless the duplicate is replaced with a non-interactive placeholder.

## Related items

The first overlay version can ship with the related section hidden or with an empty state. It should reserve a clear insertion point below the metadata so later work does not require another layout redesign.

The existing app has image similarity through `search_similar_images`, and the roadmap marks semantic and image similarity as complete. The current UI only exposes image similarity in the Windows app and replaces the library results with the similarity set. The overlay should eventually keep the selected item visible and render related results below it.

Suggested labels:

- `Find similar` for image-to-image results.
- `Find related` for semantic results across articles, notes, quotes, PDFs, and other text-bearing items.

Each related item should show its card treatment, title, and a short reason when the reason is reliable, such as `Similar image`, `Same source`, or `Shared tag`. Do not expose model scores or AI management controls.

## Accessibility

- Use modeless dialog semantics because the library remains interactive.
- Give the overlay an accessible name from the item title.
- Move focus to the close control or overlay heading when it opens.
- Keep the close control keyboard reachable at all times.
- Restore focus to the originating card on close when possible.
- Keep visible focus indicators on cards and overlay controls.
- Respect reduced-motion preferences with a direct placement or short opacity transition.
- Do not make the close action depend on clicking outside the overlay.

## Technical boundaries

- Keep the Virtuoso grid mounted and stable while the overlay is open.
- Use a separate fixed overlay layer. Do not animate the live virtualized card into a fixed position.
- Read source rectangles before changing selected-item state when the source is still mounted.
- Give rapid card clicks an interruptible transition. A new click should cancel the previous timeline and start from the current visual state, not wait for a stale animation to finish.
- Keep the overlay content separate from the grid card renderer so card changes do not create duplicate business logic.
- Test image cards, article cards, notes, quotes, video cards, PDFs, and X posts. Embedded content is the highest-risk case.

## Delivery plan

### PR 1: overlay foundation

- Extract reusable item detail content from the current inspector.
- Add the expanded overlay shell and modeless interaction behavior.
- Add primary and secondary action slots.
- Add scroll containment, focus behavior, Escape handling, outside-click handling, and responsive layout.
- Use a simple open and close transition while the structure is reviewed.

### PR 2: card-to-overlay motion

- Measure source and destination rectangles.
- Add centered and side placement selection.
- Add the four-sided expansion while preserving the source aspect ratio.
- Add the two-representation switch between adjacent cards.
- Add interruption handling and fallbacks for unmounted cards and third-party embeds.

### PR 3: related items

- Define a related-item result type and ranking contract.
- Keep image similarity inside the overlay instead of replacing the library view.
- Add semantic related results when the service returns them.
- Add loading, empty, and failure states.

## Acceptance criteria

- A selected card expands into an overlay without causing the grid to reflow.
- The opening and closing rectangles preserve the source card's aspect ratio.
- The overlay can be centered or placed beside the source card without clipping.
- Another visible card can be selected while the overlay is open.
- The previous item returns to its card as the next item expands into the same destination.
- The overlay body scrolls independently when content exceeds the available height.
- Opening the original and the relevant read, play, or PDF action are easy to find.
- Image similarity does not remove the user from the detail context.
- X and other iframe content do not stretch, flash, or reload because of the transition.
- Escape, close, outside click, keyboard focus, and reduced motion work in every supported layout.

## Open decisions before implementation

- Whether the expanded overlay should show the full original card content or a tighter triage-specific summary.
- Whether `Find related` replaces the current library contents or appends a related section below the item. This spec assumes the latter.
- The maximum desktop overlay size after the source rectangle has grown.
- Whether keyboard arrows should move through nearby library items while the overlay is open.
