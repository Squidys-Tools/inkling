import { savedItems } from "./items.ts";
import { createScene } from "./scene.ts";

const stillProgress = 0.085;

export function play(
  element: HTMLCanvasElement,
  area: HTMLElement,
  calm: boolean,
  onReady: () => void,
) {
  let frame = 0;
  let visible = false;
  let started = 0;
  const pointer: [number, number] = [0, 0];
  const aim: [number, number] = [0, 0];

  const scrolled = () => {
    if (calm) return stillProgress;
    const box = area.getBoundingClientRect();
    const run = box.height - window.innerHeight;
    return run > 0 ? Math.min(1, Math.max(0, -box.top / run)) : 0;
  };

  let progress = scrolled();
  let scene: ReturnType<typeof createScene> = null;
  const still = () =>
    scene?.render({ time: 18, progress: stillProgress, pointer: [0, 0], still: true });
  try {
    scene = createScene(element, savedItems, () => {
      onReady();
      if (calm) still();
    });
  } catch {
    scene = null;
  }
  if (!scene) return;

  let last = performance.now();
  const tick = (now: number) => {
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ease = 1 - Math.exp(-delta * 2.6);
    progress += (scrolled() - progress) * ease;
    pointer[0] += (aim[0] - pointer[0]) * ease;
    pointer[1] += (aim[1] - pointer[1]) * ease;
    scene?.render({ time: (now - started) / 1000 + 4, progress, pointer, still: false });
    frame = visible ? requestAnimationFrame(tick) : 0;
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (calm) {
      if (visible) still();
      return;
    }
    if (visible && !frame) {
      if (!started) started = performance.now();
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });
  observer.observe(area);

  const point = (event: PointerEvent) => {
    aim[0] = (event.clientX / window.innerWidth) * 2 - 1;
    aim[1] = -((event.clientY / window.innerHeight) * 2 - 1);
  };
  const resized = () => {
    if (calm) still();
  };
  window.addEventListener("pointermove", point, { passive: true });
  window.addEventListener("resize", resized);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("pointermove", point);
    window.removeEventListener("resize", resized);
    scene?.dispose();
  };
}
