// Adapted from Rare UI's Grid Reveal (https://rareui.com/components/gridreveal),
// swamimalode07/rare-ui @ becb1a2 components/ui/grid-reveal.tsx. Copyright (c)
// 2026 Swami Malode. MIT + Commons Clause v1.0 + Attribution, as the repo's LICENSE
// @ 32b7b52 grants it; see LICENSE-rare-ui.md in this directory.

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../ui/reducedMotion";
import { coverRect, drawScene, type Scene, smoothstep } from "./gridRevealScene";
import { buildTree, type Cell, measureTree, orderByDetail } from "./gridRevealTree";

// Trimmed for the welcome screen: no captions, always
// dark, self-paced. While `src` is null the card waits as a quiet grey grid;
// once it is set the grid splits along the photo's detail, takes on its
// colors, and settles into the photo.

// hold short of the end so the run can never finish before the image does
const HOLD = 0.9;
// the grid stops splitting here while waiting, leaving arrival somewhere to go
const WAIT_CAP = 0.72;
const SAMPLE = 128;
const COLOR_MS = 525;

// never reaches its ceiling, so a run that outlasts the estimate keeps creeping
function selfPaced(elapsedMs: number, durationMs: number) {
  return HOLD * (1 - Math.exp(-elapsedMs / durationMs));
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
