import { createScene, plateDensity, type Plates } from "./scene.ts";

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
// Canvas scale, then flow-field scale, per quality step; the governor only ever steps down.
const levels = [
  [1, 0.4],
  [0.8, 0.32],
  [0.62, 0.25],
] as const;

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
  let level = 0;
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
    const ceiling = Math.min(window.devicePixelRatio || 1, phone ? 1 : 1.5);
    const ratio = Math.min(ceiling, Math.max(0.6, plateDensity(cssWidth, cssHeight) * 1.1));
    const [scale, flowScale] = levels[level];
    scene.resize(cssWidth, cssHeight, ratio * scale, flowScale);
  };

  const govern = (dt: number) => {
    if (level === levels.length - 1) return;
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
      hit,
      pour: clamp(0.08 + progress / 0.5),
      flow: count % 2 === 0,
    });
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
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    pause();
    scene?.dispose();
  };
}
