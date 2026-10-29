# inkling feature map

One file per user-facing feature. Each file names the entry points, the driving steps, and the observable end state. Drive one feature per run.

- [Capture a note from the Add menu](capture-note.md)
- [Capture a quote from the Add menu](capture-quote.md)
- [Search your library](search.md)
- [Spaces](spaces.md)
- [Edit a note](edit-note.md)
- [Archive and restore](archive-restore.md)

Not mapped, with the reason:

- Deep-link capture (`inkling://capture?url=...`) needs the capture server, which this run does not start.
- Link capture fetches the URL over the network, so a run would depend on external state.
- File and Screen capture open native pickers that the CDP driver cannot reach.
