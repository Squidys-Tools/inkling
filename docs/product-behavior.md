# Product behavior

## Product definition

This is a private, visual personal library for saving anything worth remembering. The primary behavior is:

> Save without organizing; retrieve through memory, search, and visual association.

The product should feel quiet, immediate, and visual. Organization happens automatically in the background. Users should not be asked to manage AI output.

## Product principles

- Capture must be faster than deciding where something belongs.
- Search is the primary organizing system.
- Every saved item should receive a visual treatment appropriate to its content.
- AI classification is invisible implementation detail. Do not label tags as AI-generated.
- Do not provide tag correction, tag deletion, confidence scores, or AI-management workflows.
- Manual tags and Spaces are available for intentional projects, not required maintenance.
- Local processing is explained during onboarding and settings, not repeatedly in the main interface.
- User-authored notes and content must never be silently rewritten by AI.
- When AI processing fails, search falls back to metadata and text.
- Processing runs after capture, and the app stays usable while it is incomplete.
- The library should encourage rediscovery, not only storage.

## Supported content

The initial product should support:

- URLs and web pages
- Articles
- Images and screenshots
- PDFs
- Quick notes
- Longer notes
- Quotes and text clippings
- Video links and selected local video files

Content types are first-class item types. A product, article, image, quote, PDF, and note should not all render as generic bookmarks.

## Capture behavior

### URL capture

When a user pastes or saves a URL:

1. Create the item immediately.
2. Display a provisional card using the URL.
3. Fetch metadata and page content in the background.
4. Classify the page type.
5. Extract readable content when appropriate.
6. Generate the final card presentation.
7. Index extracted text and derived concepts.

If extraction fails, retain the URL, title, domain, and any metadata that was successfully found.

### Image capture

Images can be added by file picker, drag-and-drop into the main library grid view, clipboard, or screenshot capture. The Chrome browser extension captures page URLs from the toolbar or a link/page context menu; it does not capture images or read page content.

The system should automatically process images for searchable text, concepts, colors, and semantic similarity. The resulting metadata should improve search and Spaces without exposing an AI-management surface.

### Notes and quotes

Quick Notes should open instantly and remain lightweight. A note can expand into Focus Mode for longer forms of writing or reading.

Quoted text should be stored with its source URL when available and displayed as a quote card.

## Card types

The card kinds are the `ItemKind` values in `src/lib/types.ts`:

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

Search should support natural-language-like queries and structured filters. Examples:

```text
shoes
shoes blue
object:car
text:invoice
type:image
format:pdf
site:youtube
tag:research
red honeycrisp apple
```

Pressing Enter after a term creates a deeper search step. Search should combine:

- Titles and descriptions
- Notes and article text
- OCR text
- Domains and authors
- Manual and auto-generated tags
- Derived image concepts through semantic embeddings
- Colors
- Semantic similarity
- Dates and item types

Search results should be useful even when the query does not exactly match the saved content.

## Spaces

Spaces are saved searches presented as visual collections.

### Smart Spaces

Smart Spaces update automatically whenever an item matches their query. They can use type, date, tag, domain, search terms, OCR text, image concepts, colors, or semantic criteria.

### Regular Spaces

Regular Spaces hold items the user adds by hand. Opening an item shows its Regular Spaces as chips; choosing one files the item in, and choosing it again takes the item back out. Whether a Space is Smart or Regular is chosen when it is created and does not change afterwards.

Archiving an item hides it from a Regular Space without removing it, so restoring the item returns it to the Space it was filed in. Deleting an item for good removes it from every Space.

Users should be able to create, rename, reorder, recolor, and delete Spaces. Deleting a Space must not delete its items.

## Item view

Opening a card grows it into the library frame, and the item view replaces the library until it closes. The library stays where it was underneath, so closing flies the item back into its card.

- The item's media sits on a dotted stage. Images zoom and pan, and show their pixels when zoomed far in.
- An inspector on the right holds the title, note, Spaces, tags, and details, with a Similar tab beside Info.
- An action bar moves the item to a Space, opens the original, shows a file in its folder, and archives it. An archived item can also be deleted for good.
- The view closes only from Close or Escape. Mouse side buttons and Alt+Left/Right step back and forward through opened items.

## Reading and writing

Articles should open in a distraction-free reader with clean typography, cached images, headings and links, code blocks, footnotes where available, safe supported video embeds, and an original source link at the bottom.

Focus Mode provides a sparse writing environment with headings, bold text, links, and simple interactive todos, using the existing WYSIWYG Markdown editor.

## Onboarding

First-run onboarding should explain:

- The library is local-first.
- AI processing runs on the device where supported.
- Content may still require network access when fetching a URL or remote media.
- The user can export and back up their library.

After onboarding, this information should not dominate the main experience.

## Explicit non-goals

The first releases should not include social feeds, likes, public profiles, collaboration, complex project-management features, manual AI tag administration, mobile applications, mandatory cloud accounts, or cloud-only processing.
