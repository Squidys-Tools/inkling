import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { liquidGlassSupport, type LiquidGpu, useLiquidGlassEnabled } from "./liquidGlassSupport";
import { type GlassShape, glassShape, type ShapeBox } from "./liquidGlassShape";
import { LiquidSurface } from "./liquidSurface";

// The backdrop renders inside a `<canvas layoutsubtree>`, and liquid-dom draws
// refracting glass under each `.glass` element in `targetRoots`. Without WebGPU or
// Chromium's HTML-in-Canvas API (web preview, old GPU, lost device), the backdrop
// stays plain DOM and the CSS glass remains.

// HTML-in-Canvas paints opaque cross-origin images blank, so remote card images
// load with CORS. The desktop shell (the only app:// page) adds the CORS header
// to image responses; anywhere else most hosts send none and the image would fail.
export function canvasImageCrossOrigin(src: string | undefined) {
  return location.protocol === "app:" && src?.startsWith("https:") ? "anonymous" : undefined;
}

// Transitions and keyframes on the targets move them without resizing them,
// so shapes follow by polling rects for a little longer than the longest one.
const SETTLE_MS = 600;
// The backdrop returns to the canvas this long after the last scroll event.
const SCROLL_IDLE_MS = 180;

function boxOf(element: HTMLElement, origin: DOMRect): ShapeBox | null {
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: rect.left - origin.left,
    y: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
    radii: [
      Number.parseFloat(style.borderTopLeftRadius),
      Number.parseFloat(style.borderTopRightRadius),
      Number.parseFloat(style.borderBottomRightRadius),
      Number.parseFloat(style.borderBottomLeftRadius),
    ],
  };
}

// Moving the content in or out of the canvas resets every scroller inside it,
// which would throw the library back to its top, so their offsets carry over.
function keepingScroll<T>(content: HTMLElement, move: () => T) {
  const scrolled = [...content.querySelectorAll<HTMLElement>("*")]
    .filter((element) => element.scrollTop || element.scrollLeft)
    .map((element) => [element, element.scrollTop, element.scrollLeft] as const);
  const result = move();
  for (const [element, top, left] of scrolled) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  return result;
}

function glassTargets(roots: RefObject<HTMLElement | null>[]) {
  const targets: HTMLElement[] = [];
  for (const { current: root } of roots) {
    if (!root) continue;
    if (root.classList.contains("glass")) targets.push(root);
    targets.push(...root.querySelectorAll<HTMLElement>(".glass"));
  }
  return targets;
}

/**
 * Renders `children` as the backdrop of liquid glass drawn under every `.glass`
 * element in `targetRoots`. `shadow` is off for a lens that clips to its own
 * glass, where the CSS shadow on the target stays.
 */
export function LiquidGlass({
  className,
  targetRoots,
  shadow = true,
  children,
}: {
  className?: string;
  targetRoots: RefObject<HTMLElement | null>[];
  shadow?: boolean;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Portal target. It sits in the wrapper until the canvas is ready, then moves
  // into the canvas, so switching modes never remounts the children.
  const [content] = useState(() => {
    const element = document.createElement("div");
    element.className = "liquid-glass-content absolute inset-0";
    return element;
  });
  const [gpu, setGpu] = useState<LiquidGpu | null>(null);
  const enabled = useLiquidGlassEnabled();
  const rootsRef = useRef(targetRoots);
  useLayoutEffect(() => {
    rootsRef.current = targetRoots;
  });

  useLayoutEffect(() => {
    wrapRef.current?.append(content);
    let live = true;
    if (enabled) {
      void liquidGlassSupport().then((found) => {
        if (live && found) setGpu(found);
      });
    }
    return () => {
      live = false;
      content.remove();
    };
  }, [content, enabled]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!gpu || !enabled || !wrap || !canvas) return;
    let live = true;
    let scrollMode = false;
    let scrollIdle = 0;
    const marked = new Set<HTMLElement>();
    // The content lays out at the wrapper's size. The canvas can be larger (see
    // LibraryStage), so the content no longer fills its parent.
    const sizeContent = (width: number, height: number) => {
      // oxlint-disable-next-line react/immutability -- content is a DOM element held in state to portal into; it is sized imperatively.
      content.style.width = `${width}px`;
      content.style.height = `${height}px`;
    };
    sizeContent(wrap.clientWidth, wrap.clientHeight);
    const surface = keepingScroll(
      content,
      () =>
        new LiquidSurface(
          gpu,
          canvas,
          content,
          wrap,
          () => {
            // A painted frame is up, so the CSS glass can step aside.
            for (const element of marked) element.dataset.liquid = "";
          },
          shadow,
        ),
    );

    const syncShapes = () => {
      const origin = canvas.getBoundingClientRect();
      const shapes = new Map<HTMLElement, GlassShape>();
      for (const element of glassTargets(rootsRef.current)) {
        const box = boxOf(element, origin);
        const shape = box && glassShape(box, origin.width, origin.height);
        if (!shape) {
          if (marked.delete(element)) delete element.dataset.liquid;
          continue;
        }
        shapes.set(element, shape);
        if (!marked.has(element)) {
          marked.add(element);
          if (!scrollMode) element.dataset.liquid = "";
        }
      }
      for (const element of marked) {
        if (shapes.has(element)) continue;
        marked.delete(element);
        delete element.dataset.liquid;
      }
      surface.setShapes(shapes);
    };

    let frame = 0;
    let settleUntil = 0;
    const tick = () => {
      frame = 0;
      syncShapes();
      if (performance.now() < settleUntil) frame = requestAnimationFrame(tick);
    };
    const scheduleSync = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const settle = () => {
      settleUntil = performance.now() + SETTLE_MS;
      scheduleSync();
    };

    // The host rides out a scroll gesture in the wrapper (native render, CSS
    // glass) and moves back SCROLL_IDLE_MS after the last event. Reparenting
    // emits its own scroll events, so onScroll ignores events while moving.
    let moving = false;
    let movingClear = 0;
    const setScrollMode = (mode: boolean) => {
      if (mode === scrollMode) return;
      scrollMode = mode;
      if (mode) for (const element of marked) delete element.dataset.liquid;
      moving = true;
      keepingScroll(content, () => surface.setScrolling(mode));
      window.clearTimeout(movingClear);
      movingClear = window.setTimeout(() => {
        moving = false;
      }, 60);
      if (!mode) syncShapes();
    };
    // Virtuoso emits scroll events ~10x a second without the position moving;
    // only a real offset change means the user is scrolling.
    const lastScroll = new WeakMap<EventTarget, { top: number; left: number }>();
    const onScroll = (event: Event) => {
      if (moving) return;
      const el = event.target;
      if (!(el instanceof HTMLElement)) return;
      const last = lastScroll.get(el);
      const moved = el.scrollTop !== last?.top || el.scrollLeft !== last?.left;
      lastScroll.set(el, { top: el.scrollTop, left: el.scrollLeft });
      if (!moved) return;
      setScrollMode(true);
      window.clearTimeout(scrollIdle);
      scrollIdle = window.setTimeout(() => setScrollMode(false), SCROLL_IDLE_MS);
    };
    content.addEventListener("scroll", onScroll, { capture: true, passive: true });

    const sizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentBoxSize[0];
        if (!box) continue;
        if (entry.target === wrap) sizeContent(box.inlineSize, box.blockSize);
        if (entry.target !== canvas) continue;
        const device = entry.devicePixelContentBoxSize?.[0];
        surface.resize(
          box.inlineSize,
          box.blockSize,
          Math.round(device?.inlineSize ?? box.inlineSize * devicePixelRatio),
          Math.round(device?.blockSize ?? box.blockSize * devicePixelRatio),
        );
      }
      // Layout is fresh here and the canvas paints after this callback, so the
      // shapes keep up with a resizing stage (the sidebar sliding) frame by frame.
      syncShapes();
    });
    sizeObserver.observe(canvas);
    sizeObserver.observe(wrap);
    const mutationObserver = new MutationObserver(() => {
      for (const element of glassTargets(rootsRef.current)) sizeObserver.observe(element);
      scheduleSync();
    });
    const roots = rootsRef.current.flatMap(({ current }) => (current ? [current] : []));
    for (const root of roots) {
      mutationObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      root.addEventListener("transitionrun", settle);
      root.addEventListener("animationstart", settle);
    }
    for (const element of glassTargets(rootsRef.current)) sizeObserver.observe(element);
    window.addEventListener("resize", settle);

    void gpu.device.lost.then(() => {
      if (live) setGpu(null);
    });

    return () => {
      live = false;
      window.clearTimeout(scrollIdle);
      window.clearTimeout(movingClear);
      content.removeEventListener("scroll", onScroll, { capture: true });
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      mutationObserver.disconnect();
      for (const root of roots) {
        root.removeEventListener("transitionrun", settle);
        root.removeEventListener("animationstart", settle);
      }
      window.removeEventListener("resize", settle);
      for (const element of marked) delete element.dataset.liquid;
      surface.destroy();
      // Back to plain DOM in the wrapper.
      content.style.width = "";
      content.style.height = "";
      keepingScroll(content, () => wrap.append(content));
    };
  }, [gpu, content, shadow, enabled]);

  return (
    <div ref={wrapRef} className={className}>
      {gpu && enabled && (
        <canvas
          ref={canvasRef}
          className="liquid-glass-canvas absolute top-0 left-0 block size-full"
        />
      )}
      {createPortal(children, content)}
    </div>
  );
}
