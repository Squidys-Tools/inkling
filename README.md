# inkling

### Save anything cool or worth remembering. Find it later without organizing.

inkling is a quiet little home for everything you want to keep: articles, images, screenshots, PDFs, notes, quotes, and video links. No folders to maintain, no manually tagging documents. You save something in a couple of seconds; inkling helps you find it again later.

Your library lives on your own computer. The app checks GitHub for updates once when it opens; GitHub sees the app version, but no library data is sent.

The interface uses [Paper Mono](https://github.com/paper-design/paper-mono) by Paper Design, bundled locally under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL). Paper Mono is based on Geist Mono by Vercel and basement.studio; the font's copyright and license notice is included in [public/fonts/OFL.txt](public/fonts/OFL.txt).

<img src="docs/assets/mascots/inkling-splash-loop.svg" alt="inkling mascot, a small ink blot that drifts, blinks and changes expression" width="160">

![Your inkling library — a visual grid of saved articles, images, quotes, and videos](docs/assets/screenshots/library.png)

## Why you'll like it

**You don't have to micromanage it.** Like actaully. Just save things and let it do its shit. The search is the organizer. inkling indexes what you saved in the background so you can find it later by describing it.

**It's visual.** Your library's displayed as a beautiful grid, not some ugly list of item details or some random, hastily made, scrapbook looking ideaboard. Articles, photos, PDFs, quotes, notes, videos, and posts each either show their contents in full or have their own custom little thumbnail made.

**It's private.** Your library is stored locally in SQLite on your Windows machine, with your files kept as content-addressed assets beside it. No cloud account required, feed, social features, or usage analytics. Update checks contact GitHub at launch but never send library data.


## Take the tour

### 1. Save in seconds

Paste a URL, drag in a file, paste from your clipboard, take a screenshot, or save from your browser with the companion extension(soon). inkling creates the card immediately and does the heavy lifting quietly in the background.

![Opening a saved video — the detail view with preview, source, and tags](docs/assets/screenshots/detail.png)

Supported media:

- URLs and articles (with a clean, readable copy extracted automatically)
- Images, screenshots, and PDFs (yes, even scanned ones)
- Quick notes and quotes with source attribution
- YouTube / Vimeo links and local video files
- Posts from X, plus files, clippings, and references

### 2. Find anything, even inside pictures

Search for any word including words *inside* your images and scanned documents. inkling reads text out of pictures (OCR) so a screenshot of a recipe, a photo of a whiteboard, or a scanned PDF is just as searchable as a note you typed.

It also understands meaning, not just exact words, and can find images that look similar to another image. Something like `shoes blue`, `type:image`, `tag:research`, or `red honeycrisp apple` just works.

### 3. Browse, read, and rediscover

- **Visual library** — masonry grid with thumbnails generated automatically.
- **Distraction-free reader** — saved articles open with clean typography and styling, without ads or page clutter.
- **PDF viewer** — page navigation built in.
- **Video cards** — YouTube and Vimeo links get previews with click-to-play; uploaded videos play natively.
- **Quote cards** — save a qoute with where it came from.
- **Smart Spaces** — Bascially saved search queries, Spaces update themselves. Save a search once (say, `tag:essay` or your favorite pieces) and new saves show up on their own.
- **Serendipity** — take a slow, one-at-a-time walk through older saves, keeping what still feels useful or forgetting what you do not need to carry.
- **Pins** — pin anything worth keeping in reach, then find it again in Top of mind.

### 4. Your stuff stays yours

- Local-first: database + assets on your disk, exportable together.
- Background processing: capture is instant; OCR, embeddings, and indexing happen while you look around.
- No social features, no cloud required, no AI-management chores. AI-derived helpers stay invisible. They just make search better.

## See it in action

Short clips say more than paragraphs. (Placeholders for now, real ones soon.)

- *Coming soon:* save a page, then find it by a word inside it.
- *Coming soon:* slow scroll through the visual library + opening the reader.

## Meet the mascot

A small ink blot lives in the sidebar and pops into the search bar while you type. It drifts when idle, perks up when there's background work, looks sad when a save fails, and now takes quiet walks around the library on its own. It's also the app icon.

<p>
  <img src="docs/assets/mascots/inkling-splash-idle.svg" alt="inkling mascot idling" width="120">
  <img src="docs/assets/mascots/inkling-splash-wink.svg" alt="inkling mascot winking" width="120">
  <img src="docs/assets/mascots/inkling-splash-wide.svg" alt="inkling mascot surprised" width="120">
  <img src="docs/assets/mascots/inkling-splash-notify.svg" alt="inkling mascot with a notification dot" width="120">
</p>

## What's next

Little by little, inkling is growing toward:

- On-device summaries, automatic concept extraction, and structured analysis
- First-run onboarding, an accessibility audit, and web-version portability
- Performance and refactoring work as the feature set settles
- Possibly cross platform support in the future if I can get money for a macbook and find some time to test it on linux. Likely distros will be Ubuntu, Arch, and Debain for the widest range of support up-front.

See [the Roadmap](docs/roadmap.md) for the honest, checkbox-level status, and [open bugs](docs/bugs.md) for what is known to be broken.

## Status

Early development, but the core already works: capture, storage, keyword search (including OCR text), thumbnails, the reader, video cards, and Smart Spaces. Expect rough edges and missing pieces and please file issues for the ones that bug you. I'm trying to make this into a product that you and I can use day-to-day.


## FAQ

**Do I need to file things into folders?**
Nope. Save it and move on. Smart Spaces collect items that match saved searches, and Regular Spaces let you curate collections by hand.

**Is my stuff uploaded somewhere?**
Nope. Processing and storage are local. Network access is used to fetch indexing models on first run, fetch URLs or remote media you choose to save, and check GitHub for an update when the app opens. The update check shares the app version, not library data.

**What can I save?**
Articles, general web pages, images, screenshots, PDFs, notes, quotes, video links, X posts, and miscellaneous files.

**Does it work offline?**
Well no duh. Saving a fresh URL needs internet though, obviously.


## For developers

### Working with the source

**Windows** (that's the only platform for now).

1. Install [Bun](https://bun.sh) 1.4.2 (the version in `.bun-version`).
2. Clone this repo, then:

```powershell
bun install
bun run dev:app
```

For a quick browser-only look at the UI, run the web preview instead:

```powershell
bun install
bun run dev
```

Save from your browser too: the companion extension talks to the app through an `inkling://capture?url=...` deep link.

This part is for people who want to build, tinker, or contribute. Everyone else can stop here. 🙂

**Stack:** Electron 44 + React + TypeScript + Vite on the front, Node.js + SQLite (FTS5) in the back. Article extraction with Defuddle, OCR with Tesseract, local Nomic text/vision embeddings through ONNX Runtime. Full reasoning in the [tech stack](docs/tech-stack.md).

**Start here:**

- [docs/README.md](docs/README.md) — index of all project docs
- [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/operations/development.md](docs/operations/development.md) — setup, commands, checks, troubleshooting
- [docs/product.md](docs/product.md) — who it's for and why it exists
- [docs/product-behavior.md](docs/product-behavior.md) — how each feature should behave
- [docs/tech-stack.md](docs/tech-stack.md) — architecture choices and reasoning
- [docs/roadmap.md](docs/roadmap.md) — where things stand
- [docs/changelog.md](docs/changelog.md) — what changed recently
- `benchmarks/` — 48-item corpus + harness for extraction/OCR quality

**Prereqs:** Bun 1.4.2 (see `.bun-version`).

**Commands:**

```powershell
bun install
bun run dev              # quick browser preview of the UI
bun run dev:app          # full Windows desktop app
bun run build:installer  # build the Windows installer
bun run check            # same checks CI runs before pushing changes
```

License: MIT
