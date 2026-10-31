import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { coverRect, drawScene, type Scene, smoothstep } from "./gridRevealScene.ts";
import { buildTree, type Cell, measureTree, orderByDetail } from "./gridRevealTree.ts";

// Rare UI's Grid Reveal, trimmed for the welcome screen: no captions, always
// dark, self-paced. While `src` is null the card waits as a quiet grey grid;
// once it is set the grid splits along the photo's detail, takes on its
// colors, and settles into the photo.

// Held short of the end, so the run can never finish before the image does.
const HOLD = 0.9;
// The grid stops splitting here while it waits, leaving arrival somewhere to go.
const WAIT_CAP = 0.72;
const SAMPLE = 128;
const COLOR_MS = 525;

// Never reaches its ceiling, so a run that outlasts the estimate keeps creeping.
function selfPaced(elapsedMs: number, durationMs: number) {
  return HOLD * (1 - Math.exp(-elapsedMs / durationMs));
}

function readAverages(image: HTMLImageElement, root: Cell, branches: Cell[], at: number) {
  const buffer = new OffscreenCanvas(SAMPLE, SAMPLE);
  const ctx = buffer.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const fit = coverRect(image.naturalWidth, image.naturalHeight, SAMPLE, SAMPLE);
  ctx.drawImage(image, fit.dx, fit.dy, fit.dw, fit.dh);
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
  reducedMotion,
  style,
}: {
  src: string | null;
  /** Width over height of the frame the canvas fills. */
  aspect: number;
  /** Milliseconds the wait is paced for; the photo arriving ends it. */
  estimatedDuration: number;
  reducedMotion: boolean;
  style?: stylex.StyleXStyles;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef(src);
  const loadNow = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

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
      if (!reducedMotion) return render(scene.split, performance.now());
      // Reduced motion has no loop, so it jumps straight to the settled frame.
      const settled = loadedAt < 0 ? performance.now() : loadedAt + COLOR_MS;
      render(scene.image ? 1 : WAIT_CAP, settled);
    };

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(entry.contentRect.width * ratio));
      const h = Math.max(1, Math.round(entry.contentRect.height * ratio));
      scene.scale = ratio;
      if (w === scene.width && h === scene.height) return;
      scene.width = w;
      scene.height = h;
      canvas.width = w;
      canvas.height = h;
      // Resizing a canvas clears it.
      repaint();
    });
    observer.observe(canvas);

    // The tree outlives `src`, so a photo arriving mid-wait carries on from
    // the grid already on screen instead of snapping back to four cells.
    let requested: string | null = null;
    const load = () => {
      const url = srcRef.current;
      if (!url || url === requested) return;
      requested = url;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
        scene.image = image;
        loadedAt = performance.now();
        scene.hasColors = readAverages(image, root, branches, scene.split);
        if (reducedMotion) repaint();
      };
      image.src = url;
    };
    load();

    if (reducedMotion) {
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
      // The image landing finishes the run, not the clock.
      const target = ready ? 1 : selfPaced(elapsed * 1000, estimatedDuration);
      eased += (target - eased) * (1 - Math.exp(-dt * 4.4));
      const wanted = Math.min(eased, ready ? 1 : WAIT_CAP);
      split += (wanted - split) * (1 - Math.exp(-dt * 3.2));
      render(split, now);
      // Nothing moves after this, so the loop stops.
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
  }, [aspect, estimatedDuration, reducedMotion]);

  // Reduced motion has no loop to notice a new photo, so it is handed over directly.
  useEffect(() => {
    srcRef.current = src;
    loadNow.current?.();
  }, [src]);

  return <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.canvas, style)} />;
}

const styles = stylex.create({
  canvas: { display: "block" },
});
