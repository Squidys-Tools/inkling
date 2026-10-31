# inkling feature map

The files below cover the core library flows. Each file names the user-visible route, current accessible controls, a live recipe, and the stored result to inspect in the scratch database.

- [Capture a note from Add](capture-note.md)
- [Capture a quote from Add](capture-quote.md)
- [Search your library](search.md)
- [Spaces](spaces.md)
- [Edit a note](edit-note.md)
- [Archive and restore](archive-restore.md)

Not covered by the CDP feature drives, with the reason:

- Deep-link capture (`inkling://capture?url=...`): only a packaged build registers `inkling://`, so an OS link opens the installed app on the real library, not the scratch instance.
- Link capture and article reading depend on fetching a saved URL. The Reader route appears for items with article content (`apps/renderer/src/item/InfoPanel.tsx`), so it needs a captured article and network state.
- File and Screenshot capture open native pickers that the CDP driver cannot reach.
- Filing an item in a Space from the detail view or a card's right-click menu opens Electron's native context menu (`apps/renderer/src/menu/contextMenu.tsx` calls `desktop.showContextMenu`). CDP can open the menu but cannot inspect or select its native entries.
