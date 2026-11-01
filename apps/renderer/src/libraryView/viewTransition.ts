import { setEntering, setListMode, viewState } from "./viewState.ts";

// The easings of the transition this restores: power1.in out, power2.out in.
const easeIn = "cubic-bezier(0.55, 0.085, 0.68, 0.53)";
const easeOut = "cubic-bezier(0.215, 0.61, 0.355, 1)";

const gridElement = () => document.querySelector<HTMLElement>('[data-bench="grid"]');
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A card's entrance delay in ms, staggered by where it sits in the scroll viewport (0–1). */
export function entranceDelay(list: boolean, down: number, across: number) {
  return (list ? down * 0.28 : (down + across) * 0.2) * 1000;
}

/** Only cards intersecting the scroll viewport take part in the entrance. */
export function inViewport(
  card: { top: number; bottom: number },
  view: { top: number; bottom: number },
) {
  return card.bottom > view.top && card.top < view.bottom;
}

let run = 0;
let requested: boolean | null = null;
let fade: Animation | null = null;
let entrance: Animation[] = [];

/** The grid↔list toggle: fade the grid out, flip the layout, stagger the new cards in. */
export function switchView(list: boolean) {
  if (list === (requested ?? viewState.get().list)) return;
  requested = list;
  const thisRun = ++run;
  const element = gridElement();
  // Read the shown opacity before canceling, so a mid-fade toggle falls from it.
  const shown = element ? getComputedStyle(element).opacity : "1";
  fade?.cancel();
  for (const animation of entrance) animation.cancel();
  entrance = [];
  if (!element || reducedMotion()) {
    setEntering(false);
    setListMode(list);
    return;
  }
  fade = element.animate([{ opacity: shown }, { opacity: 0 }], {
    duration: 160,
    easing: easeIn,
    fill: "forwards",
  });
  void fade.finished.then(
    () => {
      if (thisRun !== run) return;
      setEntering(true);
      fade?.cancel();
      fade = null;
      // A flip remounts the masonry; toggling back keeps the view already shown.
      if (list !== viewState.get().list) setListMode(list);
      waitForCards(thisRun, list, 0);
    },
    () => {},
  );
}

// The remounted grid lays out over two frames; give its cards a bounded wait after.
const mountFrames = 8;

function waitForCards(thisRun: number, list: boolean, frames: number) {
  requestAnimationFrame(() => {
    if (thisRun !== run) return;
    const element = gridElement();
    if (
      frames < 2 ||
      (frames < mountFrames && element && !element.querySelector('[data-bench="card"]'))
    ) {
      waitForCards(thisRun, list, frames + 1);
      return;
    }
    play(thisRun, list);
  });
}

function play(thisRun: number, list: boolean) {
  const element = gridElement();
  if (!element) return finish();
  const view = element.getBoundingClientRect();
  const from: Keyframe = list
    ? { opacity: 0, transform: "translateY(-6px)" }
    : { opacity: 0, transform: "scale(0.96)" };
  for (const card of element.querySelectorAll<HTMLElement>('[data-bench="card"]')) {
    const rect = card.getBoundingClientRect();
    if (!inViewport(rect, view)) continue;
    const down = Math.max(0, rect.top - view.top) / view.height;
    const across = Math.max(0, rect.left - view.left) / view.width;
    entrance.push(
      card.animate([from, { opacity: 1, transform: "none" }], {
        duration: 300,
        delay: entranceDelay(list, down, across),
        easing: easeOut,
        fill: "both",
      }),
    );
  }
  if (entrance.length === 0) return finish();
  void Promise.allSettled(entrance.map((animation) => animation.finished)).then(() => {
    if (thisRun === run) finish();
  });
}

// Back to the stylesheets: a left fill would outrank the cards' hover transform.
function finish() {
  for (const animation of entrance) animation.cancel();
  entrance = [];
  setEntering(false);
}
