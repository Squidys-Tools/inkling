// Based on Chris's merged PR233: fade out, switch layout, stagger the new cards in.
import { flushSync } from "react-dom";
import { setEntering, setListMode, viewState } from "./viewState.ts";
const easeIn = "cubic-bezier(0.55, 0.085, 0.68, 0.53)";
const easeOut = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const gridElement = () => document.querySelector<HTMLElement>('[data-bench="grid"]');
export const entranceDelay = (list: boolean, down: number, across: number) =>
  Math.min(160, Math.max(0, (list ? down * 0.28 : (down + across) * 0.2) * 1000));
export const inViewport = (
  card: { top: number; bottom: number },
  view: { top: number; bottom: number },
) => card.bottom > view.top && card.top < view.bottom;

export function animateArrival(element: HTMLElement, list: boolean) {
  if (reduced()) return [];
  const holdUntilGroupSettles = viewState.get().entering;
  const view = (element.parentElement ?? element).getBoundingClientRect();
  return [...element.querySelectorAll<HTMLElement>('[data-bench="card"]')]
    .filter((card) => inViewport(card.getBoundingClientRect(), view))
    .map((card) => {
      const rect = card.getBoundingClientRect();
      const animation = card.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 240,
          delay: entranceDelay(
            list,
            (rect.top - view.top) / view.height,
            (rect.left - view.left) / view.width,
          ),
          easing: easeOut,
          fill: "both",
        },
      );
      void animation.finished.then(
        () => {
          if (!holdUntilGroupSettles) animation.cancel();
        },
        () => {},
      );
      return animation;
    });
}

let run = 0;
let requested: boolean | null = null;
let fade: Animation | null = null;
let entrance: Animation[] = [];
export function switchView(list: boolean) {
  if (list === (requested ?? viewState.get().list)) return;
  requested = list;
  const thisRun = ++run;
  const element = gridElement();
  const opacity = element ? getComputedStyle(element).opacity : "1";
  fade?.cancel();
  entrance.forEach((animation) => animation.cancel());
  entrance = [];
  if (!element || reduced()) {
    setEntering(false);
    setListMode(list);
    requested = null;
    return;
  }
  fade = element.animate([{ opacity }, { opacity: 0 }], {
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
      setListMode(list);
      waitForCards(thisRun, list, 0);
    },
    () => {},
  );
}
function waitForCards(thisRun: number, list: boolean, frames: number) {
  requestAnimationFrame(() => {
    if (thisRun !== run) return;
    const element = gridElement();
    if (frames < 2 || (frames < 8 && element && !element.querySelector('[data-bench="card"]'))) {
      waitForCards(thisRun, list, frames + 1);
      return;
    }
    entrance = element ? animateArrival(element, list) : [];
    void Promise.allSettled(entrance.map((animation) => animation.finished)).then(() => {
      if (thisRun !== run) return;
      // Earlier cards must keep their finished fill until every stagger ends.
      // Commit removal of the CSS hidden marker before releasing those fills.
      flushSync(() => setEntering(false));
      entrance.forEach((animation) => animation.cancel());
      entrance = [];
      requested = null;
    });
  });
}
