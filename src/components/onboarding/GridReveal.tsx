import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../ui/reducedMotion";
import { buildTree, type Cell, measureTree, MORPH, orderByDetail } from "./gridRevealTree";

// Rare UI's Grid Reveal, trimmed for the welcome screen: no captions, always
// dark, self-paced. While `src` is null the card waits as a quiet grey grid;
// once it is set the grid splits along the photo's detail, takes on its
// colors, and settles into the photo.

// hold short of the end so the run can never finish before the image does
const HOLD = 0.9;
// the grid stops splitting here while waiting, leaving arrival somewhere to go
const WAIT_CAP = 0.72;
const SAMPLE = 128;
const COLOR_MS = 525;
const GUTTER_FROM = 0.35;
const GUTTER_TO = 0.75;
const PHOTO_FROM = 0.93;

type Patch = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  tone: number;
};

type Scene = {
  ctx: CanvasRenderingContext2D;
  root: Cell;
  width: number;
  height: number;
  scale: number;
  clock: number;
  split: number;
  fade: number;
  hasColors: boolean;
  image: HTMLImageElement | null;
};

// written as comparisons so NaN falls through to 0
const clamp01 = (n: number) => (n > 0 ? (n < 1 ? n : 1) : 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// never reaches its ceiling, so a run that outlasts the estimate keeps creeping
function selfPaced(elapsedMs: number, durationMs: number) {
  return HOLD * (1 - Math.exp(-elapsedMs / durationMs));
}

function coverRect(iw: number, ih: number, w: number, h: number) {
  const s = Math.max(w / iw, h / ih);
  return { dx: (w - iw * s) / 2, dy: (h - ih * s) / 2, dw: iw * s, dh: ih * s };
}

function greyOf(tone: number, clock: number) {
  return 30 + tone * 13 + Math.sin(clock * 1.5 + tone * 6.28) * 3;
}

function drawScene(s: Scene) {
  const { ctx, root, width, height, split } = s;
  // without pixel access the grid stays grey, but the photo still fades in below
  const tint = s.hasColors ? s.fade : 0;
  const shade = (grey: number, target: number) => Math.round(mix(grey, target, tint));
  const base = greyOf(root.tone, s.clock);

  // gutters recess into this instead of cutting through to the surface behind
  ctx.fillStyle = `rgb(${Math.round(shade(base, root.r) * 0.92)},${Math.round(
    shade(base, root.g) * 0.92,
  )},${Math.round(shade(base, root.b) * 0.92)})`;
  ctx.fillRect(0, 0, width, height);

  const soft = 1 - smoothstep(GUTTER_FROM, GUTTER_TO, split);
  const gutter = s.scale * soft;
  const rounded = soft > 0.01;

  const paint = (p: Patch) => {
    // snap to whole pixels so neighbouring cells stay flush with no seam
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const w = Math.round(p.x + p.w) - x;
    const h = Math.round(p.y + p.h) - y;

    const onLeft = x <= 0;
    const onTop = y <= 0;
    const onRight = x + w >= width;
    const onBottom = y + h >= height;

    // only interior edges get a gutter, so the outer silhouette stays the frame
    const left = onLeft ? 0 : gutter;
    const top = onTop ? 0 : gutter;
    const innerW = w - left - (onRight ? 0 : gutter);
    const innerH = h - top - (onBottom ? 0 : gutter);
    if (innerW <= 0 || innerH <= 0) return;

    const grey = greyOf(p.tone, s.clock);
    ctx.fillStyle = `rgb(${shade(grey, p.r)},${shade(grey, p.g)},${shade(grey, p.b)})`;

    if (rounded) {
      const radius = Math.min(innerW, innerH) * 0.12 * soft;
      ctx.beginPath();
      ctx.roundRect(x + left, y + top, innerW, innerH, [
        !onLeft && !onTop ? radius : 0,
        !onRight && !onTop ? radius : 0,
        !onRight && !onBottom ? radius : 0,
        !onLeft && !onBottom ? radius : 0,
      ]);
      ctx.fill();
    } else {
      ctx.fillRect(x + left, y + top, innerW, innerH);
    }
  };

  const walk = (cell: Cell, p: Patch) => {
    if (!cell.kids || split < cell.splitAt) {
      paint(p);
      return;
    }
    // children start on the parent's rect and separate into their own
    const t = easeOut(clamp01((split - cell.splitAt) / MORPH));
    for (const kid of cell.kids) {
      walk(kid, {
        x: mix(p.x, kid.x * width, t),
        y: mix(p.y, kid.y * height, t),
        w: mix(p.w, kid.w * width, t),
        h: mix(p.h, kid.h * height, t),
        r: mix(p.r, kid.r, t),
        g: mix(p.g, kid.g, t),
        b: mix(p.b, kid.b, t),
        tone: mix(p.tone, kid.tone, t),
      });
    }
  };

  walk(root, { x: 0, y: 0, w: width, h: height, r: root.r, g: root.g, b: root.b, tone: root.tone });

  if (!s.image) return;
  const photo = s.hasColors ? smoothstep(PHOTO_FROM, 1, split) * s.fade : s.fade;
  if (photo <= 0.002) return;

  const fit = coverRect(s.image.naturalWidth, s.image.naturalHeight, width, height);
  ctx.globalAlpha = photo;
  ctx.drawImage(s.image, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.globalAlpha = 1;
}

function readAverages(el: HTMLImageElement, root: Cell, branches: Cell[], at: number) {
  const buffer = document.createElement("canvas");
  buffer.width = SAMPLE;
  buffer.height = SAMPLE;
  const ctx = buffer.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  const fit = coverRect(el.naturalWidth, el.naturalHeight, SAMPLE, SAMPLE);
  ctx.drawImage(el, fit.dx, fit.dy, fit.dw, fit.dh);

  try {
    measureTree(root, ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE);
    orderByDetail(branches, at);
    return true;
  } catch {
    return false;
  }
}

export function GridReveal({
  src,
  aspect,
  estimatedDuration,
  className,
}: {
  src: string | null;
  /** Width over height of the frame the canvas fills. */
  aspect: number;
  /** Milliseconds the wait is paced for; the photo arriving ends it. */
  estimatedDuration: number;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef(src);
  const loadNow = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !frame || !ctx) return;

    const reduce = prefersReducedMotion();
    const { root, branches } = buildTree(aspect);
    const scene: Scene = {
      ctx,
      root,
      width: 0,
      height: 0,
      scale: 1,
      clock: 0,
      split: 0,
      fade: 0,
      hasColors: false,
      image: null,
    };

    let loadedAt = -1;
    let cancelled = false;

    const render = (split: number, now: number) => {
      scene.split = split;
      scene.fade = loadedAt < 0 ? 0 : smoothstep(0, COLOR_MS, now - loadedAt);
      drawScene(scene);
    };

    const repaint = () => {
      if (!reduce) return render(scene.split, performance.now());
      // reduced motion has no loop, so jump straight to the settled frame
      const settled = loadedAt < 0 ? performance.now() : loadedAt + COLOR_MS;
      render(scene.image ? 1 : WAIT_CAP, settled);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = frame.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      scene.scale = dpr;
      if (w === scene.width && h === scene.height) return;
      scene.width = w;
      scene.height = h;
      canvas.width = w;
      canvas.height = h;
      // resizing the canvas clears it, so always paint again
      repaint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);

    // The tree outlives `src`, so a photo arriving mid-wait carries on from
    // the grid already on screen instead of snapping back to four cells.
    let requested: string | null = null;
    const load = () => {
      const url = srcRef.current;
      if (!url || url === requested) return;
      requested = url;
      const el = new Image();
      el.decoding = "async";
      el.onload = () => {
        if (cancelled || !el.naturalWidth || !el.naturalHeight) return;
        scene.image = el;
        loadedAt = performance.now();
        scene.hasColors = readAverages(el, root, branches, scene.split);
        if (reduce) repaint();
      };
      el.src = url;
    };
    load();

    if (reduce) {
      repaint();
      loadNow.current = load;
      return () => {
        cancelled = true;
        loadNow.current = null;
        observer.disconnect();
      };
    }

    let frameId = 0;
    let last = 0;
    let elapsed = 0;
    let eased = 0;
    let split = 0;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (!last) last = now;
      load();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      scene.clock = elapsed;

      const ready = scene.image !== null;
      // the image landing is what finishes the run, not the clock
      const target = ready ? 1 : selfPaced(elapsed * 1000, estimatedDuration);
      eased += (target - eased) * (1 - Math.exp(-dt * 4.4));
      const wanted = Math.min(eased, ready ? 1 : WAIT_CAP);
      split += (wanted - split) * (1 - Math.exp(-dt * 3.2));
      render(split, now);

      // nothing moves after this, so stop burning frames
      if (ready && eased > 0.995 && now - loadedAt > COLOR_MS && split > 0.9995) {
        render(1, now);
        cancelAnimationFrame(frameId);
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [aspect, estimatedDuration]);

  // Reduced motion has no loop to notice a new photo, so hand it over directly.
  useEffect(() => {
    srcRef.current = src;
    loadNow.current?.();
  }, [src]);

  return (
    <div ref={frameRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
