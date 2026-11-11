# Product behavior

## Product principles

- Capture must be faster than deciding where something belongs.
- Search is the primary organizing system.
- Every saved item should receive a visual treatment appropriate to its content.
- AI classification is invisible implementation detail. Do not label tags as AI-generated.
- Do not provide tag correction flows, confidence scores, or AI-management workflows. Any tag can be removed from an item, the same way whoever added it.
- Manual tags and Spaces are available for intentional projects, not required maintenance.
- Local processing is explained during onboarding and settings, not repeatedly in the main interface.
- User-authored notes and content must never be silently rewritten by AI.
- When AI processing fails, search falls back to metadata and text.
- Processing runs after capture, and the app stays usable while it is incomplete.
- The library should encourage rediscovery, not only storage.

## Capture behavior

### URL capture

When a user pastes or saves a URL, the item and its card appear at once, titled with the domain unless the capture supplied a title. A video link shows as a video card from the start. A background job then fetches the page, extracts the article, sanitizes it, and stores its text, author, date, images and safe embeds; an X post link becomes a post card once that job has run. The page's title replaces the domain unless the user renamed the card first, and a description the user wrote is kept.

If extraction fails, retain the URL, title, domain, and any metadata that was successfully found.

### Image capture

Images can be added by file picker, drag-and-drop into the main library grid view, clipboard, screenshot capture, or the Chrome extension.

[extension/README.md](../extension/README.md) describes the Chrome extension's popup and right-click menu. The popup draws its preview with the library's own card components, and a title left blank there lets the app take the page's own. The app downloads a saved image itself; if that fails, it keeps the page instead.

Background jobs read an image's text with OCR, take its color palette for the item view's details, and embed it for semantic and similar-image search. None of this is shown as AI output.

### Notes and quotes

A quick note opens at once and stays lightweight. A note can expand into Focus Mode for longer writing or reading.

A quote keeps its source URL when it has one and shows as a quote card.

## Card types

The card kinds are the `ItemKind` values in `packages/ingestion/src/item-kind.ts`, which `apps/renderer/src/library/cardModel.ts` re-exports:

- Article, which also covers general web pages
- Image, which also covers screenshots
- PDF
- Video, for links and embeds as well as local files
- Note
- Quote
- Post, for X posts
- File, for anything else

Product, Recipe and Book cards are planned.

Each card may show a title, source, preview, date, tags, summary, and relevant metadata. The exact fields depend on the type.

## Search

Search takes plain words, with no operators or filters. It runs after a pause in typing or on Enter, never on each keystroke. Text matches show at once: titles, descriptions, note and article text, OCR text, domains, and metadata such as authors and tags. Matches by meaning, over text and image embeddings, join them when the query's embedding is ready, so a query finds items that never use its words. Text matches rank first. If the models are unavailable, text search still answers. Concepts and colors drawn from images and articles are planned to feed search and Smart Spaces too.

The item view's Similar tab shows images that look like an image, or articles, notes and quotes close in meaning to a text item.

## Spaces

A Space is a collection in the sidebar. Users can create, rename, reorder, recolor and delete Spaces, and deleting a Space never deletes its items. Whether a Space is Smart or Regular is chosen when it is created and does not change afterwards.

### Smart Spaces

A Smart Space saves the search that was in the field when Save as Space was chosen, and runs it each time it loads, matching items the way search does. Its stored query can also hold an item kind and a tag, which no control in the app sets yet. Removing an item from a Smart Space excludes it there; the item's right-click menu then offers to allow it back in.

A Smart Space with no item kind filter whose search text names only photo subjects, or with no filters at all whose name does ("Cats", "Photos of dogs and horses"), shows images of those subjects instead of everything. The subjects are cat, dog, bird, horse, car, bicycle, flower, tree, mountain and beach, in English, with their plurals and a few synonyms (kitten, puppy, bike, pony). Each analyzed image is labelled by the nearest of these, a screenshot, or about ninety other common subjects, so a lion or a screenshot of a chat about cats stays out; close look-alikes such as a truck for a car can still get in. An image the user tagged with a subject always counts. An image that is not analyzed yet, or every image while the search model cannot answer (not downloaded yet, or the worker busy), counts when its title, description or OCR text name a subject; the preview, which has no image model, always works this way. Any other name leaves an unfiltered Smart Space listing everything, and the saved query never changes.

### Regular Spaces

Regular Spaces hold items the user adds by hand, from the item view's Keep in a Space button or a card's right-click menu. The item view lists the Regular Spaces an item is in beside its tags.

Archiving an item hides it from a Regular Space without removing it, so restoring the item returns it to the Space it was filed in. Deleting an item for good removes it from every Space.

## Item view

Opening a card grows it into the library frame, and the item view replaces the library until it closes. The library stays where it was underneath, so closing flies the item back into its card.

- The item's media sits on a dotted stage. Images zoom and pan, and show their pixels when zoomed far in.
- An inspector on the right holds the title, note, Spaces, tags, and details, with a Similar tab beside Info. Tags are added and removed there.
- An action bar files the item in a Regular Space, opens the original, shows a file in its folder, and archives it. An archived item can be restored or deleted for good.
- The view closes only from Close or Escape. Mouse side buttons and Alt+Left/Right step back and forward through opened items.

## Reading and writing

Articles open in a distraction-free reader with clean typography, images, headings and links, code blocks, footnotes where available, safe supported video embeds, and an original source link at the bottom.

Focus Mode is a sparse writing view with headings, bold text, links and interactive todos, in the same WYSIWYG Markdown editor as notes.

## Onboarding

The first-run welcome, which Settings → General can show again, explains that:

- The library is local-first.
- Search, including reading text in images, runs on the device.
- inkling goes online to fetch the links the user saves.
- The user can export a full copy of the library.

## Explicit non-goals

The first releases should not include social feeds, likes, public profiles, collaboration, complex project-management features, manual AI tag administration, mobile applications, mandatory cloud accounts, or cloud-only processing.
