import { createScene, plateDensity, type Plates, type Pointer } from "./scene.ts";

const plates = {
  still: "/media/ink/ocr/still.webp",
  clean: "/media/ink/ocr/clean.webp",
  mask: "/media/ink/ocr/mask.webp",
};
const query = "ramen";
const faces = [
  ["/media/red-hat-500.ttf", "500"],
  ["/media/red-hat-700.ttf", "700"],
] as const;
// Sim grid long side, then canvas scale, per quality step; the governor only ever steps down, sim first.
const levels = [
  [192, 1],
  [160, 1],
  [128, 1],
  [112, 0.85],
  [96, 0.7],
] as const;
const phoneLevel = 2;

function loadFaces() {
  for (const [url, weight] of faces) {
    const face = new FontFace("Red Hat", `url(${url}) format("truetype")`, { weight });
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}

async function loadPlates(): Promise<Plates> {
  const [still, clean, mask] = await Promise.all(
    [plates.still, plates.clean, plates.mask].map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    }),
  );
  return { still, clean, mask };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (x: number) => x * x * (3 - 2 * x);

type Parts = {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  typed: HTMLSpanElement;
  found: HTMLSpanElement;
};

/** Runs the section while it is on screen; returns its teardown. */
export function startOcr({ section, canvas, image, typed, found }: Parts) {
  loadFaces();
  const showStill = () => {
    image.src = plates.still;
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
  let loaded: Plates | undefined;
  let disposed = false;
  let lost = false;
  let onScreen = false;
  let frame = 0;
  let count = 0;
  let progress = 0;
  let target = 0;
  let letters = 0;
  let lastKey = 0;
  let hit = 0;
  let shownHit = "";
  let last = performance.now();
  let level = -1;
  let pointer: Pointer | undefined;
  let pointerAt = 0;
  let pointerX = 0;
  let pointerY = 0;
  let spent = 0;
  let sampled = 0;
  let top = 0;
  let span = 1;
  let cssWidth = 1;
  let cssHeight = 1;
  const start = last;

  const measure = () => {
    top = section.getBoundingClientRect().top + window.scrollY;
    span = section.offsetHeight - window.innerHeight;
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;
  };
  const scrolled = () => {
    target = span > 0 ? clamp((window.scrollY - top) / span) : 0.6;
  };

  const resize = () => {
    measure();
    scrolled();
    if (!scene) return;
    const phone = cssWidth < 640;
    if (level < 0) level = phone ? phoneLevel : 0;
    const ceiling = Math.min(window.devicePixelRatio || 1, phone ? 1 : 1.5);
    const ratio = Math.min(ceiling, Math.max(0.6, plateDensity(cssWidth, cssHeight) * 1.1));
    const [simLong, scale] = levels[level];
    scene.resize(cssWidth, cssHeight, ratio * scale, simLong);
  };

  const govern = (dt: number) => {
    if (level < 0 || level === levels.length - 1) return;
    spent += dt;
    sampled += 1;
    if (sampled < 30) return;
    if (spent / sampled > 20) {
      level += 1;
      resize();
    }
    spent = 0;
    sampled = 0;
  };

  const tick = (now: number) => {
    frame = 0;
    if (!scene) return;
    const elapsed = now - last;
    last = now;
    if (count > 2) govern(elapsed);
    count += 1;
    const dt = Math.min(0.05, elapsed / 1000);
    progress += (target - progress) * (1 - Math.exp(-dt * 3.2));

    const wanted = progress > 0.56 ? query.length : progress < 0.5 ? 0 : letters;
    if (wanted !== letters && now - lastKey > (wanted > letters ? 120 : 60)) {
      letters += Math.sign(wanted - letters);
      lastKey = now;
      typed.textContent = query.slice(0, letters);
    }
    const goal = letters === query.length && now - lastKey > 260 ? 1 : 0;
    hit += (goal - hit) * (1 - Math.exp(-dt * (goal ? 2.4 : 6)));
    const opacity = hit.toFixed(2);
    if (opacity !== shownHit) {
      shownHit = opacity;
      found.style.opacity = opacity;
    }

    scene.render({
      progress,
      time: (now - start) / 1000,
      dt: elapsed / 1000,
      hit,
      pour: 0.35 + 0.65 * (1 - ease(clamp((progress - 0.55) / 0.45))),
      guide: 0.15 + 0.85 * ease(clamp((progress - 0.05) / 0.4)),
      pointer,
    });
    pointer = undefined;
    frame = requestAnimationFrame(tick);
  };

  const running = () => onScreen && !document.hidden && !lost;
  const play = () => {
    if (!frame && running() && scene) {
      last = performance.now();
      count = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  const pause = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const update = () => (running() ? play() : pause());

  const build = () => {
    if (!loaded || disposed) return;
    try {
      scene = createScene(canvas, loaded);
      progress = target;
      resize();
      play();
    } catch {
      showStill();
    }
  };

  void loadPlates().then(
    (result) => {
      loaded = result;
      build();
    },
    () => {
      if (!disposed) showStill();
    },
  );

  const moved = (event: PointerEvent) => {
    const x = event.offsetX / Math.max(1, cssWidth);
    const y = event.offsetY / Math.max(1, cssHeight);
    const seconds = Math.max(0.008, (event.timeStamp - pointerAt) / 1000);
    const fresh = event.timeStamp - pointerAt < 200;
    pointer = {
      x,
      y,
      dx: fresh ? (x - pointerX) / seconds : 0,
      dy: fresh ? (y - pointerY) / seconds : 0,
    };
    pointerAt = event.timeStamp;
    pointerX = x;
    pointerY = y;
  };
  canvas.addEventListener("pointermove", moved, { passive: true });

  const contextLost = (event: Event) => {
    if (disposed) return;
    event.preventDefault();
    lost = true;
    pause();
    scene = undefined;
    showStill();
  };
  const contextRestored = () => {
    if (disposed) return;
    lost = false;
    image.hidden = true;
    canvas.hidden = false;
    build();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  });
  observer.observe(section);
  const sizer = new ResizeObserver(resize);
  sizer.observe(canvas);
  window.addEventListener("scroll", scrolled, { passive: true });
  document.addEventListener("visibilitychange", update);

  return () => {
    disposed = true;
    observer.disconnect();
    sizer.disconnect();
    window.removeEventListener("scroll", scrolled);
    document.removeEventListener("visibilitychange", update);
    canvas.removeEventListener("pointermove", moved);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    pause();
    scene?.dispose();
  };
}
