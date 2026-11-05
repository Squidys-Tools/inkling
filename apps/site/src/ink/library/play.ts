import { savedItems } from "./items.ts";
import { createScene } from "./scene.ts";

const stillProgress = 0;
const budgetMs = 20;
const window30 = 30;

export function play(
  element: HTMLCanvasElement,
  area: HTMLElement,
  calm: boolean,
  onReady: () => void,
  onLost: () => void,
) {
  let frame = 0;
  let visible = false;
  let shown = document.visibilityState === "visible";
  let started = 0;
  const pointer: [number, number] = [0, 0];
  const aim: [number, number] = [0, 0];
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;

  let top = 0;
  let run = 1;
  let target = stillProgress;
  const measure = () => {
    const box = area.getBoundingClientRect();
    top = box.top + window.scrollY;
    run = box.height - window.innerHeight;
  };
  const scrolled = () => {
    if (calm) return;
    target = run > 0 ? Math.min(1, Math.max(0, (window.scrollY - top) / run)) : 0;
  };
  measure();
  scrolled();

  let progress = target;
  let scene: ReturnType<typeof createScene> = null;
  const still = () =>
    scene?.render({ time: 18, progress: stillProgress, pointer: [0, 0], still: true });
  const build = () => {
    try {
      scene = createScene(
        element,
        savedItems,
        () => {
          onReady();
          if (calm) still();
        },
        mobile,
      );
    } catch {
      scene = null;
    }
  };
  build();
  if (!scene) return;

  let last = performance.now();
  let spent = 0;
  let counted = 0;
  const tick = (now: number) => {
    const elapsed = now - last;
    last = now;
    spent += elapsed;
    counted += 1;
    if (counted === window30) {
      if (spent / counted > budgetMs) scene?.lower();
      spent = 0;
      counted = 0;
    }
    const delta = Math.min(0.1, elapsed / 1000);
    const ease = 1 - Math.exp(-delta * 2.6);
    progress += (target - progress) * ease;
    pointer[0] += (aim[0] - pointer[0]) * ease;
    pointer[1] += (aim[1] - pointer[1]) * ease;
    scene?.render({ time: (now - started) / 1000 + 4, progress, pointer, still: false });
    frame = visible && shown && scene ? requestAnimationFrame(tick) : 0;
  };
  const resume = () => {
    if (calm || frame || !visible || !shown || !scene) return;
    if (!started) started = performance.now();
    last = performance.now();
    spent = 0;
    counted = 0;
    frame = requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (calm && visible) still();
    resume();
  });
  observer.observe(area);

  const point = (event: PointerEvent) => {
    aim[0] = (event.clientX / window.innerWidth) * 2 - 1;
    aim[1] = -((event.clientY / window.innerHeight) * 2 - 1);
  };
  const resized = () => {
    measure();
    scrolled();
    if (calm) requestAnimationFrame(still);
  };
  const toggled = () => {
    shown = document.visibilityState === "visible";
    resume();
  };
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    scene = null;
    onLost();
  };
  const restored = () => {
    build();
    if (calm) still();
    resume();
  };
  window.addEventListener("pointermove", point, { passive: true });
  window.addEventListener("scroll", scrolled, { passive: true });
  window.addEventListener("resize", resized);
  document.addEventListener("visibilitychange", toggled);
  element.addEventListener("webglcontextlost", lost);
  element.addEventListener("webglcontextrestored", restored);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("pointermove", point);
    window.removeEventListener("scroll", scrolled);
    window.removeEventListener("resize", resized);
    document.removeEventListener("visibilitychange", toggled);
    element.removeEventListener("webglcontextlost", lost);
    element.removeEventListener("webglcontextrestored", restored);
    scene?.dispose();
  };
}
