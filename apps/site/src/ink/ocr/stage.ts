import { drawReceipt } from "./receipt.ts";
import { createScene } from "./scene.ts";

const still = "/media/ink/ocr/still.webp";
const query = "ramen";
const faces = [
  ["/media/red-hat-500.ttf", "500"],
  ["/media/red-hat-700.ttf", "700"],
] as const;

// The receipt is painted once into a texture, so its face has to be loaded before that paint.
async function loadFaces() {
  await Promise.all(
    faces.map(async ([url, weight]) => {
      const face = new FontFace("Red Hat", `url(${url}) format("truetype")`, { weight });
      document.fonts.add(face);
      await face.load();
    }),
  ).catch(() => {});
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type Parts = {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  typed: HTMLSpanElement;
  found: HTMLSpanElement;
};

/** Runs the section while it is on screen; returns its teardown. */
export function startOcr({ section, canvas, image, typed, found }: Parts) {
  const fonts = loadFaces();
  const showStill = () => {
    image.src = still;
    image.hidden = false;
    canvas.hidden = true;
    typed.textContent = query;
    found.style.opacity = "1";
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showStill();
    return;
  }

  let scene: ReturnType<typeof createScene> | undefined;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let progress = 0;
  let letters = 0;
  let lastKey = 0;
  let hit = 0;
  let last = performance.now();
  const start = last;

  const resize = () =>
    scene?.resize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio, 1.5));

  const scrollTarget = () => {
    const rect = section.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    return span > 0 ? clamp(-rect.top / span) : 0.6;
  };

  const tick = (now: number) => {
    frame = 0;
    if (!scene) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    progress += (scrollTarget() - progress) * (1 - Math.exp(-dt * 3.2));

    const wanted = progress > 0.3 ? query.length : progress < 0.24 ? 0 : letters;
    if (wanted !== letters && now - lastKey > (wanted > letters ? 120 : 60)) {
      letters += Math.sign(wanted - letters);
      lastKey = now;
      typed.textContent = query.slice(0, letters);
    }
    const goal = letters === query.length && now - lastKey > 260 ? 1 : 0;
    hit += (goal - hit) * (1 - Math.exp(-dt * (goal ? 2.4 : 6)));
    found.style.opacity = hit.toFixed(3);

    scene.render({ progress, time: (now - start) / 1000, hit });
    if (visible) frame = requestAnimationFrame(tick);
  };

  const play = () => {
    if (!frame && visible && scene) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  void fonts.then(() => {
    if (disposed) return;
    try {
      const receipt = document.createElement("canvas");
      scene = createScene(canvas, receipt, drawReceipt(receipt));
      progress = scrollTarget();
      resize();
      play();
    } catch {
      showStill();
    }
  });

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
    else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  observer.observe(section);
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);

  return () => {
    disposed = true;
    observer.disconnect();
    sizer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    scene?.dispose();
  };
}
