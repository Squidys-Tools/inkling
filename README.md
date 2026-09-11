# inkling

Save anything worth remembering and find it later. inkling is a Windows desktop app that keeps articles, images, screenshots, PDFs, notes, quotes, and video links in one private visual library stored on your own machine.

There is nothing to organize. Saving takes a couple of seconds, then the app reads what you saved in the background so you can find it later by searching for any word in it, including words inside images and scanned documents.

## What it does now

- Capture URLs, files, clipboard contents, and screenshots, or use drag and drop
- Save pages with the companion browser extension
- Read saved articles in a clean view without ads and page clutter
- Search everything by keyword, including text read out of images and scanned PDFs
- Browse visually with automatic thumbnails

Everything is processed and stored locally. Nothing leaves your computer.

## What's next

Search that understands meaning instead of matching exact words, finding images similar to another image, and Spaces: collections that update themselves based on what you save. See the [roadmap](docs/roadmap.md) for where things stand.

## Status

Early development. The core capture, storage, and keyword search work well enough to try, but expect rough edges and missing pieces.

## Running it from source

You need [Bun](https://bun.sh) 1.4.0 and the Rust toolchain installed. The required Bun version is recorded in `.bun-version`; Bun is the project's package manager, so use `bun.lock` and Bun commands when installing dependencies or running scripts.

On Windows, pick one Rust toolchain (per machine — the repo builds with both):

- MSVC (recommended when you have admin rights): install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the C++ workload, then `rustup default stable-x86_64-pc-windows-msvc`.
- GNU (no admin rights needed): `scoop install gcc`, then `rustup toolchain install stable-x86_64-pc-windows-gnu` and, inside the repo checkout, `rustup override set stable-x86_64-pc-windows-gnu` so `bun run tauri dev` uses it. The `export ordinal too large` linker failure this toolchain used to hit is already worked around in the repo (`src-tauri/.cargo/config.toml`).

```powershell
bun install
bun run preview
```
This starts the web preview of the app. Just basically to see the ui without doing a heavy and long rust compilation.


```powershell
bun install
bun run tauri dev
```

This starts the Windows desktop app.

Before pushing frontend changes, run the same checks used by CI:

```powershell
bun run check:frontend
```


## More documentation

- [Product definition](docs/product.md): who it's for and why it exists
- [Behavior specification](docs/product-behavior.md): how each feature should behave
- [Tech stack](docs/tech-stack.md): architecture choices and reasoning
- [Roadmap](docs/roadmap.md) and [changelog](docs/changelog.md)
