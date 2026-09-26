# Roaming mascot

The ink blot leaves the sidebar on its own schedule, walks a route of glances, short hops, crossings and margin drifts, wears a different face at each stop, and fades back into its slot. Nothing in an outing has to repeat the last one. The user is something to watch, not a reason to stop: input only picks what the mascot looks at. A view or a dialog that owns the screen makes it hold still without spending the awake time it has left, a failed capture sends it home sad, and under `prefers-reduced-motion` it never leaves. It stands only in measured free space, never over a card, a control, a toast or the window edge, takes no pointer or keyboard input, and sits under every modal.

## Sub-features

- `roam-schedule` — the first outing starts 90 to 180 s after the app opens, and each later one after a cooldown of the same size. Nothing waits for inactivity.
- `roam-decide` — the stop count, route, direction, mood, face, and awake-time budget all fall out of weighted random choices, so no two walks follow the same line.
- `roam-hop` - the mascot never travels. Every move is two halves on a `position: fixed` layer mounted only while it is away: it shrinks to nothing in 150 ms, moves while invisible, then swells back up over 260 ms with a slight overshoot. Because it is gone in between, the route is irrelevant and only the landing has to be free, which is what lets it use the whole library instead of one lane. The position and the scale sit on separate elements on purpose: sharing one transform makes the browser interpolate the translate too, and the mascot slides across the grid while growing.
- `roam-look` — the mascot turns toward a visible card, or toward the last pointer position when the user has been active in the last four seconds.
- `roam-safe-spots` — candidates are measured against the body footprint, not the 44 px drawing box, and refused when they would touch a card, the capture bar, the toolbar, the sidebar, a toast, a modal, or a window edge. Roomier spots weigh more, so it favours margins and wide gutters.

- `roam-slot` — while it is away the sidebar keeps a dashed silhouette (`.mascot-home-empty`) so the library has not simply lost its mascot.
- `roam-return` — the last stretch of a walk home fades out, so the hand-off to the sidebar figure is not a jump cut.
- `roam-yields` — Serendipity, an in-flight drag, an open dialog, a reader, and the expanded item all make it hold still. Background indexing deliberately does not: a mascot that vanished every time an item finished processing would read as broken.
- `roam-failure` — a failed capture is the only thing that ends an outing early, and the mascot spends one sad walk home on it.
- `roam-clock` — decisions ride the mascot engine's existing clock, so a hidden tab and reduced motion pause the wandering for free.
- `roam-dev` — `?mascot-roam` opens a board with a skeleton library and controls to leave now, step one decision, change speed, and reseed.

## How to get to it (user POV)

- Open inkling and leave it alone. Within three minutes the mascot walks out of the sidebar, wanders, and drifts back on its own.
- Keep working while it is out: type a search, scroll the grid, open an item. The walk continues and only its gaze follows.
- Open Settings or an item mid-outing. The mascot stops where it is and resumes when the surface closes.
- Open Serendipity, or drag a file over the window. The mascot waits.
- Fail a capture — save an unreachable URL. The outing ends and the mascot goes home wearing the sad face.
- For a repeatable check with a sped-up clock, open `?mascot-roam` and use the board controls.

## Driving it with harness.mjs

Preconditions:

- A healthy run per [SKILL.md](../SKILL.md): `serve`, then `start` into a fresh `--run-dir`, then `doctor` with `.result-count` reading `28`.
- The overlay is mounted on a fixed layer above the library and below every modal, so it is asserted by its rectangle and its computed style, not by a z-index number.
- The first outing is on a 90–180 s schedule and there is no way to force one in the real app. Install the audit *before* waiting for `.mascot-roam`, and give the wait a `--timeout` past 180000. For a fast repeatable pass use the dev board, but audit the real app at least once: the board is a skeleton and the real grid is what the geometry has to fit.

- **Audit a whole outing in the real app.** Run `navigate --url <run url>`, then install the audit:

  ```
  eval --expr '(() => { const o = { frames: 0, overlaps: [], outside: [], path: [], scales: [], done: false, sawAway: false }; window.__roamAudit = o; const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; }; const ink = (m) => { const i = m.w * 0.34 / 2; return { l: m.l + i, t: m.t + i, r: m.r - i, b: m.b - i }; }; const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; const step = () => { const el = document.querySelector(".mascot-roam-body"); if (!el) { if (o.sawAway) { o.done = true; return; } requestAnimationFrame(step); return; } o.sawAway = true; o.frames++; const m = box(el), k = ink(m), scale = m.w / 44; o.path.push(Math.round(m.l) + "," + Math.round(m.t)); o.scales.push(+scale.toFixed(3)); if (m.w > 2) { if (m.l < -2 || m.t < -2 || m.r > innerWidth + 2 || m.b > innerHeight + 2) o.outside.push([Math.round(m.l), Math.round(m.t)]); if (scale > 0.34) { for (const c of document.querySelectorAll(".library-card, .capture-bar, .library-toolbar, .search-field, .add-button, [data-sonner-toast]")) { if (hit(k, box(c))) o.overlaps.push([String(c.className).trim().slice(0, 28), Math.round(m.l), Math.round(m.t)]); } } } requestAnimationFrame(step); }; requestAnimationFrame(step); return "installed"; })()'
  ```

  The audit has to be installed before the mascot leaves, so it starts with no `.mascot-roam-body` to look at. It keeps polling until it has seen the mascot and then lost it: an audit that stopped at the first missing element would finish instantly and report a clean walk it never saw. Check `frames` is non-zero before trusting `overlaps: 0`.

  Three details decide whether the result means anything. It measures `.mascot-roam-body`, not `.mascot-roam`, because the outer element carries the position and never scales. It measures the **ink** rather than the drawing box, inset by a third of the rendered width, because the body covers about 66% of the box it is drawn in and the rest is transparent padding; the inset is proportional because a hop scales the mascot down. And it skips overlap checks below a third of full size, where the mascot is a speck mid-hop and cannot meaningfully cover anything.

  Then `wait --selector ".mascot-roam" --timeout 200000`, `wait --expr 'window.__roamAudit.done' --timeout 200000`, and read `eval --expr '({ frames: window.__roamAudit.frames, overlaps: window.__roamAudit.overlaps.length, outside: window.__roamAudit.outside.length, minScale: Math.min(...window.__roamAudit.scales) })'`. Expect `overlaps: 0`, `outside: 0`, `minScale: 0`, and `frames` in the hundreds. A single overlap is a regression, not noise.
- **Prove it hops rather than slides.** This is the check that catches a mascot creeping across the grid while growing. Read `eval --expr '(() => { const a = window.__roamAudit; let worst = 0, slides = 0; for (let i = 1; i < a.path.length; i++) { const p = a.path[i - 1].split(",").map(Number), q = a.path[i].split(",").map(Number); if (a.scales[i] < 0.9 || a.scales[i - 1] < 0.9) continue; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d > 2) slides++; worst = Math.max(worst, d); } return { worstPx: +worst.toFixed(1), slides }; })()'`. Expect `worstPx` under 10 and `slides` in the single digits: every real jump happens at scale 0, so at full size the mascot should be standing still. While the position and the scale shared one `transform` transition the browser interpolated the translate as well and the mascot slid the length of the library — every still in that run looked perfect, and only this per-frame step gave it away.

- **Prove the mascot left the slot rather than appearing in the grid.** The first recorded state in `window.__roamAudit.path` is the sidebar mark's rectangle. Read it with `eval --expr 'window.__roamAudit.path[0]'` and assert its x is inside the sidebar's own box: `eval --expr '(() => { const s = document.querySelector(".brand-mark").getBoundingClientRect(); const first = window.__roamAudit.path[0].split(",").map(Number); return first[0] + 22 >= s.left - 2 && first[0] + 22 <= s.right + 2; })()'` (expect `true`). A first state out in the library is the teleport bug: the walk starts by appearing where it was going.
- **Prove it takes no input and sits under modals.** `eval --expr 'getComputedStyle(document.querySelector(".mascot-roam")).pointerEvents'` (expect `none`) and `eval --expr 'document.querySelector(".mascot-roam").closest("[role=dialog]") === null'` (expect `true`).
- **Prove the slot keeps a silhouette.** While away, `eval --expr 'document.querySelector(".mascot-home-empty") !== null'` (expect `true`); after it returns, expect `false`.
- **Prove input does not cancel the walk.** While `.mascot-roam` exists, run `type --selector '[aria-label="Search your mind"]' --text "note"`, then `wait --text "for 「note」"`. Assert `eval --expr 'document.querySelector(".mascot-roam") !== null'` (expect `true`). Clear the query with `type --selector '[aria-label="Search your mind"]' --text ""` and `wait --text "28 items in library"`.
- **Prove a scroll keeps it clear of the cards.** `eval --expr 'document.querySelector(".library-grid[data-testid=virtuoso-scroller]").scrollTop = 600'`, wait for the grid to settle, then re-read the audit's `overlaps` (expect still `0`) and assert the mascot is still mounted. This is the case that revalidates the spot under a moving obstacle, and it is where a stale layout shows up.
- **Prove a resize does not strand it.** `resize --width 900 --height 700` if the harness exposes it, otherwise skip and report it; then assert the audit's `outside` is still `0`.
- **Prove Serendipity holds it still.** Navigate to Serendipity, `wait --selector ".serendipity-art"`, and assert the mascot's `opacity` is `0` while the audit keeps recording frames without overlaps. This is the check that fails if the card query is scoped to `.library-grid`: that view has no grid ancestor, so the whole stage reads as free space and the mascot lands on the Keep and Forget buttons.
- **Prove a failed capture sends it home sad.** In the preview, capture an unreachable URL so the capture fails, then assert the mascot returns to its slot and the slot is no longer `.mascot-home-empty`. The web preview cannot fail a capture on demand, so if no failure route is reachable, report it rather than substituting another error.
- **Step the model on the dev board.** `navigate --url "<run url>?mascot-roam"`, `wait --selector ".mascot-roam"`, then `click --text "Leave now"`. Read the decision log and confirm each line is one of the five kinds, and that two runs with different seeds produce different stop counts. `Step` only advances when `Step mode` is on; `Step mode` freezes the clock so a decision can be read before it is taken.
- **Proof.** `shot --out <run-dir>/shots/mascot-roaming.png` while it is away, and `mascot-home.png` after it returns. Keep the audit result and the decision log in the transcript.
- **Focused code tests.** `bun test src/components/mascot` covers the controller (schedule, budget, moods, no-repeats, reduced motion, hidden tab, capture failure) and the geometry (real measured library rectangles, narrow margins, large windows) without a browser.

## Gotchas

- `?mascot-roam` replaces the app with a skeleton library, so the dev board proves the model and not the integration. Real cards, real gutters, and real modal layers only exist in the real app.
- The board's `Leave now` and `Step` are the same call: the controller has no notion of a step, only of a due time.
- Nothing about the first-hop teleport, the Serendipity walkable stage, the stuck activity clock, or a hop that slides instead of hopping is visible in a still. The audit, the first-state assertion and the at-full-size step check are the only things that catch them.
- The mascot is `opacity: 0` while it holds still, not unmounted. A harness waiting for `.mascot-roam` to disappear is waiting for the walk to end, not for a yield.
- A background tab throttles `requestAnimationFrame`, which correctly pauses the shared mascot loop. Drive this feature in a visible or headless run, not a backgrounded tab.
- The shared engine is what the sidebar figure and the search-field eyes also draw from. If the search field shows eyes while the mascot is out in the library, both are wearing the roam face at once.
- `prefers-reduced-motion: reduce` is covered by the controller test; the default harness cannot emulate it.
- The full app shares this behaviour exactly. No native OCR, embedding, or capture path is needed to verify roaming.




