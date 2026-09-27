# Roaming mascot

The ink blot leaves the sidebar on its own schedule and wanders the library. It does not travel: it steers, turning toward whatever it has decided to drift toward at a limited turn rate, with the speed easing down as it closes and a slow wander layered on the heading, so the path is curved and never repeats. It wears a different face at each stop, looks toward cards and toward recent pointer activity, and drifts back to its slot at the end. It appears and disappears with a squash, never a move, and the sidebar keeps a dashed silhouette the whole time it is away.

It goes wherever it likes in the library, including over cards. The overlay is `pointer-events: none` and `aria-hidden`, so it cannot take a click; that is the only rule it has, and it is why there is no obstacle list, no lattice of candidate spots, and nothing the geometry can refuse.

## Sub-features

- `roam-schedule` - the first outing starts 90 to 180 s after the app opens, and each later one after a cooldown of the same size. Nothing waits for inactivity.
- `roam-drift` - continuous steering, not travel. A turn-rate ceiling, an acceleration ceiling, a per-leg ease so it arrives rather than stops, and two slow sines on the heading so the path is curved and never repeats. It moves every frame and never teleports.
- `roam-squash` - appearing and disappearing are the only two moments it is not drifting: 280 ms down, 460 ms up with a slight overshoot. The position and the scale are separate elements, and the body mounts at zero size so the frame it is created in shows nothing.
- `roam-freedom` - the room is the library panel inset off the window edges. A preference shapes where in the room it drifts - near, across, the margins, or anywhere - but no preference is ever refused.
- `roam-gaze` - the mascot turns toward a card it can see, or toward the last pointer position when the user has been active in the last four seconds.
- `roam-slot` - the dashed silhouette (`.mascot-home-empty`) stays in the sidebar while it is away.
- `roam-yields` - Serendipity, an in-flight drag, an open dialog, a reader, and the expanded item all make it hold still without spending the awake time it has left. Background indexing deliberately does not: a mascot that vanished every time an item finished processing would read as broken.
- `roam-failure` - a failed capture is the only thing that ends an outing early, and the mascot spends one sad walk home on it.
- `roam-clock` - decisions and frames both ride the mascot engine's existing clock, so a hidden tab and reduced motion pause it for free.
- `roam-dev` - `?mascot-roam` opens a board with controls to leave now, step one decision, change speed, and reseed.

## How to get to it (user POV)

- Open inkling and leave it alone. Within three minutes the mascot leaves the slot and wanders, and drifts back on its own.
- Keep working while it is out: type a search, scroll the grid, open an item. The wander continues and only its gaze follows.
- Open Settings or an item mid-outing. The mascot stops where it is and resumes when the surface closes.
- Open Serendipity, or drag a file over the window. The mascot waits.
- Fail a capture - save an unreachable URL. The outing ends and the mascot goes home wearing the sad face.
- For a fast repeatable pass open `?mascot-roam`, but it is a skeleton and proves the model rather than the integration.

## Driving it with harness.mjs

Preconditions:

- The first outing is on a 90-180 s schedule and there is no way to force one in the real app. Install the audit *before* waiting for `.mascot-roam`, and give the wait a `--timeout` past 180000.
- The overlay is a fixed layer above the library and below every modal, so it is asserted by its rectangle and its computed style, not by a z-index number.

- **Audit a whole outing in the real app.** Install a `requestAnimationFrame` audit that records, for every frame the mascot is at least partly visible, the rounded position of `.mascot-roam`, its rendered width divided by 44 as a scale, and whether it intersects anything:

  ```
  eval --expr '(() => { const o = { frames: 0, path: [], scales: [], over: 0, done: false, sawAway: false }; window.__a = o; const step = () => { const el = document.querySelector(".mascot-roam-body"); if (!el) { if (o.sawAway) { o.done = true; return; } requestAnimationFrame(step); return; } o.sawAway = true; o.frames++; const r = el.getBoundingClientRect(); o.path.push(Math.round(r.left * 10) / 10 + "," + Math.round(r.top * 10) / 10); o.scales.push(+(r.width / 44).toFixed(3)); if (r.width / 44 > 0.9 && document.querySelector(".library-card, .capture-bar, .search-field, .add-button")) o.over++; requestAnimationFrame(step); }; requestAnimationFrame(step); return "installed"; })()'
  ```

  Then `wait --selector ".mascot-roam" --timeout 200000`, `wait --expr 'window.__a.done' --timeout 200000`, and read `frames`, `path.length`, and `Math.min(...scales)`.
- **Prove it moves continuously rather than jumping.** The property that matters now is that it changes position on *every* frame and never takes a large step. Read `eval --expr '(() => { const a = window.__a; const p = a.path.map((k) => k.split(",").map(Number)); const s = []; for (let i = 2; i < p.length; i++) { if (a.scales[i] < 0.9 || a.scales[i-1] < 0.9) continue; s.push(Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1])); } s.sort((x, y) => x - y); return { frames: a.frames, positions: new Set(a.path).size, median: +s[s.length>>1].toFixed(2), p95: +s[Math.floor(s.length*0.95)].toFixed(2), max: +s[s.length-1].toFixed(1), minScale: Math.min(...a.scales) }; })()'`. Expect `positions` equal to `frames` (it moved every single frame), `max` under 5px (a teleport or a hop would be hundreds), `median` around 1 to 2px, and `minScale` of `0` (it really does squash away).
  - This is the check that catches the failure modes this feature has actually had. An earlier straight-line travel version showed `max` of 1453px on the first frame, and a version whose position and scale shared one `transform` transition measured 82px per frame at full size while every still in the run looked correct.
  - Skip the first two frames after mount: the node exists for a frame before the store has placed it.
- **Prove the squash is the only transition.** `eval --expr 'getComputedStyle(document.querySelector(".mascot-roam")).transitionProperty'` (expect `all`, i.e. nothing) and the same on `.mascot-roam-body` (expect `transform`).
- **Prove it takes no input.** `eval --expr 'getComputedStyle(document.querySelector(".mascot-roam")).pointerEvents'` (expect `none`) and `eval --expr 'document.querySelector(".mascot-roam").closest("[role=dialog]") === null'` (expect `true`).
- **Prove it roams the whole room.** Bucket `path` into a 60px grid and read `new Set(...)` size, plus the min and max x. A version confined to a single margin by a clear-path rule reported an x range of 27 to 274 in a 1440px window; free roaming should span most of the panel.
- **Prove the slot keeps a silhouette.** While away, `eval --expr 'document.querySelector(".mascot-home-empty") !== null'` (expect `true`); after it returns, expect `false`.
- **Prove a layout change does not strand it.** Set `[data-testid="virtuoso-scroller"].scrollTop = 600`, then assert it still exists and its x is inside the panel. A resize is the same test; skip and report it if the harness cannot resize.
- **Prove Serendipity holds it still.** Navigate to Serendipity, `wait --selector ".serendipity-art"`, and assert the mascot's opacity is `0` while frames keep recording.
- **Prove a failed capture sends it home sad.** Capture an unreachable URL, then assert the mascot returns to its slot. The web preview cannot fail a capture on demand, so if no failure route is reachable, report it rather than substituting another error.
- **Step the model on the dev board.** `navigate --url "<run url>?mascot-roam"`, `wait --selector ".mascot-roam"`, then `click --text "Leave now"`. Confirm each line of the decision log is one of the five kinds, and that two seeds give different routes. `Step` only advances when `Step mode` is on.
- **Proof.** `shot --out <run-dir>/shots/mascot-roaming.png` while it is away, and `mascot-home.png` after it returns. Keep the audit result and the decision log in the transcript.
- **Focused code tests.** `bun test src/components/mascot` covers the controller, the drift steering (speed and turn ceilings, containment, a curved path, frame-time spikes) and the space picking, none of which need a browser.

## Gotchas

- `?mascot-roam` replaces the app with a skeleton library, so the dev board proves the model and not the integration. Real cards, real gutters, and real modal layers only exist in the real app.
- The board's `Leave now` and `Step` are the same call: the controller has no notion of a step, only of a due time.
- Being over a card is allowed and is not a regression. `fractionOverContent` sits at about 1.0, because a four-column grid fills the panel and the only free space is the thin margins. Assert smoothness and coverage instead.
- The mascot is `opacity: 0` while it holds still, not unmounted. A harness waiting for `.mascot-roam` to disappear is waiting for the walk to end, not for a yield.
- A background tab throttles `requestAnimationFrame`, which correctly pauses the shared mascot loop. Drive this feature in a visible or headless run, not a backgrounded tab.
- The shared engine is what the sidebar figure and the search-field eyes also draw from. If the search field shows eyes while the mascot is out in the library, both are wearing the roam face at once.
- `prefers-reduced-motion: reduce` is covered by the controller test; the default harness cannot emulate it.
- The full app shares this behaviour exactly. No native OCR, embedding, or capture path is needed to verify roaming.
