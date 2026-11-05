import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { quadMatrix } from "./homography.ts";
import { search } from "./items.ts";
import { app, camera, span } from "./scene.ts";

gsap.registerPlugin(ScrollTrigger);

const pick = <T extends Element = HTMLElement>(scope: Element, name: string) =>
  scope.querySelector<T & HTMLElement>(`[data-plains-${name}]`)!;

/** Types the query and lifts the match, writing to the DOM only when a value changes. */
function searchBeat(scope: Element) {
  const query = pick(scope, "query");
  const placeholder = pick(scope, "placeholder");
  const caret = pick(scope, "caret");
  const cards = [...scope.querySelectorAll<HTMLElement>("[data-plains-card]")];
  const ring = pick(scope, "ring");
  let typed = -1;
  let lifted = -1;
  return (typing: number, lift: number) => {
    const letters = Math.round(typing * search.query.length);
    if (letters !== typed) {
      typed = letters;
      query.textContent = search.query.slice(0, letters);
      placeholder.style.opacity = letters > 0 ? "0" : "1";
    }
    caret.style.visibility = typing > 0 && lift === 0 ? "visible" : "hidden";
    if (lift === lifted) return;
    lifted = lift;
    for (const card of cards) {
      const role = card.dataset.plainsCard;
      if (role === "match") {
        card.style.transform = `translate3d(0,${-8 * lift}px,0) scale(${1 + 0.035 * lift})`;
        card.style.zIndex = lift > 0 ? "1" : "";
      } else card.style.opacity = String(1 - (role === "near" ? 0.45 : 0.75) * lift);
    }
    ring.style.opacity = String(lift);
  };
}

function deskFrame(scope: Element) {
  const back = pick(scope, "back");
  const front = pick(scope, "front");
  const screen = pick(scope, "app");
  const fill = pick(scope, "fill");
  const blur = pick(scope, "blur");
  const laptop = pick(scope, "laptop");
  const drift = pick(scope, "drift");
  const hero = pick(scope, "hero");
  const copy = pick(scope, "copy");
  const beat = searchBeat(scope);
  return (progress: number, width: number, height: number) => {
    const { stage, quad } = camera(width, height, progress);
    back.style.transform = stage;
    front.style.transform = stage;
    screen.style.transform = quadMatrix(app.width, app.height, quad);
    screen.style.opacity = "1";
    // Until the screen starts to flatten it sits under the bezel, which hides its edge;
    // from then on the bezel would cut into it, so it moves above the laptop and the laptop fades.
    screen.style.zIndex = progress >= 0.2 ? "4" : "2";
    fill.style.opacity = String(1 - span(progress, 0.18, 0.3));
    blur.style.opacity = String(span(progress, 0.22, 0.55));
    laptop.style.opacity = String(1 - span(progress, 0.3, 0.56));
    drift.style.opacity = String(1 - span(progress, 0.08, 0.36));
    const out = span(progress, 0, 0.14);
    hero.style.opacity = String(1 - out);
    hero.style.transform = `translate3d(0,${-48 * out}px,0)`;
    const shown = span(progress, 0.6, 0.68);
    copy.style.opacity = String(shown);
    copy.style.transform = `translate3d(0,${(1 - shown) * 14}px,0)`;
    beat(span(progress, 0.68, 0.86), span(progress, 0.86, 0.95));
  };
}

function phoneFrame(scope: Element) {
  const hero = pick(scope, "hero");
  const phone = pick(scope, "device");
  const copy = pick(scope, "copy");
  const beat = searchBeat(scope);
  return (progress: number, _width: number, _height: number) => {
    const out = span(progress, 0, 0.22);
    hero.style.opacity = String(1 - out);
    hero.style.transform = `translate3d(0,${-36 * out}px,0)`;
    const rise = span(progress, 0, 0.32);
    const eased = rise * rise * (3 - 2 * rise);
    phone.style.transform = `translate3d(0,${(1 - eased) * 46}%,0) scale(${0.94 + 0.06 * eased})`;
    const shown = span(progress, 0.3, 0.4);
    copy.style.opacity = String(shown);
    copy.style.transform = `translate3d(0,${(1 - shown) * 12}px,0)`;
    beat(span(progress, 0.42, 0.72), span(progress, 0.74, 0.88));
  };
}

/** Fits the still, finished frames shown instead of the scroll under reduced motion. */
function calmFrames(root: Element) {
  const still = pick(root, "still");
  searchBeat(still)(1, 1);
  const flat = pick(still, "flat");
  const fit = () => {
    flat.style.transform = `scale(${flat.parentElement!.clientWidth / app.width})`;
  };
  fit();
  window.addEventListener("resize", fit);
  return () => window.removeEventListener("resize", fit);
}

/** Starts the scroll for whichever layout the viewport shows; returns its cleanup. */
export function dive(root: HTMLElement, calm: boolean) {
  const stopCalm = calm ? calmFrames(root) : () => {};
  const media = gsap.matchMedia();
  media.add({ desk: "(min-width: 768px)", phone: "(max-width: 767px)" }, (context) => {
    const desk = Boolean(context.conditions?.desk);
    const scope = pick(root, desk ? "desk" : "phone");
    let width = window.innerWidth;
    let height = window.innerHeight;
    const frame = desk ? deskFrame(scope) : phoneFrame(scope);
    const state = { progress: 0 };
    const render = () => frame(state.progress, width, height);
    render();
    if (calm) {
      // One still frame on a phone: the headline over the finished search.
      if (!desk) searchBeat(scope)(1, 1);
      return;
    }
    const tween = gsap.to(state, {
      progress: 1,
      ease: "none",
      onUpdate: render,
      scrollTrigger: {
        trigger: scope,
        pin: pick(scope, "pin"),
        start: "top top",
        end: desk ? "+=260%" : "+=210%",
        scrub: 0.5,
        onRefresh: () => {
          width = window.innerWidth;
          height = window.innerHeight;
          render();
        },
      },
    });
    return () => tween.kill();
  });
  return () => {
    media.revert();
    stopCalm();
  };
}
