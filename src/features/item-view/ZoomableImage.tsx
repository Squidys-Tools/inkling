import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { canvasImageCrossOrigin, LiquidGlass } from "../../components/LiquidGlass";
import { cx } from "../../ui/cx";
import {
  BUTTON_ZOOM_FACTOR,
  clampPan,
  clampZoom,
  MAX_ZOOM,
  type Offset,
  PIXEL_ZOOM,
  panAround,
  type Size,
  wheelZoomFactor,
} from "./imageZoom";

const IMAGE_SHADOW = "shadow-[0_24px_60px_rgba(0,0,0,0.55)]";

const ZOOM_BUTTON =
  "inline-flex size-[26px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-soft disabled:cursor-default disabled:text-[#5e5850]";

// Zoom and pan live here, not in the item view, so panning re-renders only this
// stage. The key on the caller resets zoom when the shown item changes.
export function ZoomableImage({
  src,
  originalSrc,
  alt,
}: {
  src: string;
  /** The full-size file. Swapped in once the image is zoomed past fit. */
  originalSrc?: string;
  alt: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const lensStageRef = useRef<HTMLDivElement>(null);
  const lensImageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; origin: Offset } | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  // The thumbnail's size. It fixes the layout box, so the original can swap in
  // without the picture moving or resizing.
  const [natural, setNatural] = useState<Size | null>(null);
  const [original, setOriginal] = useState<{ url: string; width: number } | null>(null);
  // null means fit, which follows the frame as the window resizes.
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [pan, setPan] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setFrame((previous) =>
        previous && previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = frame !== null && natural !== null;
  // Never above 1: an image smaller than the frame rests at its own size, so
  // drawing, panning and the pixel grid all scale from the same base.
  const fit =
    ready && frame.width > 0 && frame.height > 0
      ? Math.min(1, frame.width / natural.width, frame.height / natural.height)
      : 1;
  const zoom = clampZoom(zoomLevel ?? fit, fit);
  const isZoomed = zoom > fit;
  const shown = natural ? { width: natural.width * zoom, height: natural.height * zoom } : null;
  const offset = ready && shown ? clampPan(pan, shown, frame) : { x: 0, y: 0 };
  const showPixels = ready && zoom >= PIXEL_ZOOM;
  // How many original pixels sit in one thumbnail pixel. The pixel grid draws
  // one cell per original pixel, so it lines up with what is on screen.
  const sourceScale = original && natural ? original.width / natural.width : 1;
  const displayedSrc = original?.url ?? src;
  // The layout box is the thumbnail's fitted size, set explicitly so a larger
  // original cannot change it.
  const base =
    ready && natural ? { width: natural.width * fit, height: natural.height * fit } : null;

  // Past fit, load the original. It is decoded before the swap, so the picture
  // never flashes back to empty.
  useEffect(() => {
    if (!isZoomed || original || !originalSrc || originalSrc === src) return;
    let cancelled = false;
    const probe = new Image();
    probe.src = originalSrc;
    probe.decode().then(
      () => {
        if (!cancelled) setOriginal({ url: originalSrc, width: probe.naturalWidth });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [isZoomed, original, originalSrc, src]);

  const canZoomIn = zoom < MAX_ZOOM;

  // The pill's liquid glass refracts a copy of what sits behind it: the stage's
  // dots and the thumbnail, placed to match after every zoom, pan or resize. A
  // pill-sized canvas stays cheap while panning, and the full-size original
  // never goes under glass.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const stage = frameRef.current?.parentElement;
    const image = imageRef.current;
    const lensStage = lensStageRef.current;
    const lensImage = lensImageRef.current;
    if (!pill || !stage || !image || !lensStage || !lensImage) return;
    const pillRect = pill.getBoundingClientRect();
    const place = (element: HTMLElement, rect: DOMRect) => {
      element.style.left = `${rect.left - pillRect.left - pill.clientLeft}px`;
      element.style.top = `${rect.top - pillRect.top - pill.clientTop}px`;
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
    };
    place(lensStage, stage.getBoundingClientRect());
    place(lensImage, image.getBoundingClientRect());
  });

  // Scales by `factor`, keeping the image point under `anchor` (frame-centre
  // coordinates) still. Back at fit, zoom returns to following the frame.
  function zoomBy(factor: number, anchor: Offset = { x: 0, y: 0 }) {
    if (!ready) return;
    const next = clampZoom(zoom * factor, fit);
    if (next === zoom) return;
    const moved = panAround(offset, anchor, zoom, next);
    setPan(clampPan(moved, { width: natural.width * next, height: natural.height * next }, frame));
    setZoomLevel(next <= fit * 1.001 ? null : next);
  }
  const zoomByOnWheel = useEffectEvent(zoomBy);

  // Ctrl+wheel zooms at the cursor. React's wheel listener is passive, so this
  // one is attached by hand to stop the page zooming instead.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomByOnWheel(wheelZoomFactor(event.deltaY), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    };
    // Middle-click would otherwise start Chromium's autoscroll instead of a pan.
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("mousedown", onMouseDown);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Left or middle button drags the zoomed image.
    if (!isZoomed || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, origin: offset };
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !shown || !frame) return;
    setPan(
      clampPan(
        {
          x: drag.origin.x + event.clientX - drag.pointerX,
          y: drag.origin.y + event.clientY - drag.pointerY,
        },
        shown,
        frame,
      ),
    );
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <>
      <div
        ref={frameRef}
        className={cx(
          "relative size-full group-data-flying/item:pointer-events-none",
          isZoomed && "touch-none",
          isZoomed && (isDragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imageRef}
          src={displayedSrc}
          alt={alt}
          className={cx(
            "absolute top-1/2 left-1/2 block max-h-full max-w-full -translate-1/2 rounded-[4px]",
            // A drop shadow would be recomputed over the whole scaled image on every pan.
            !isZoomed && cx(IMAGE_SHADOW, "group-data-flying/item:shadow-none"),
          )}
          draggable={!isZoomed}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            // Only the first load sets the layout; the original leaves it alone.
            if (naturalWidth > 0 && naturalHeight > 0) {
              setNatural((previous) => previous ?? { width: naturalWidth, height: naturalHeight });
            }
          }}
          style={{
            width: base?.width,
            height: base?.height,
            transform: isZoomed
              ? `translate(${offset.x}px, ${offset.y}px) scale(${zoom / fit})`
              : undefined,
            imageRendering: showPixels ? "pixelated" : undefined,
          }}
        />
        {showPixels && shown && (
          // Screen-space overlay sized to the image, so its lines stay one pixel wide.
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] group-data-flying/item:hidden"
            style={{
              width: shown.width,
              height: shown.height,
              translate: `calc(-50% + ${offset.x}px) calc(-50% + ${offset.y}px)`,
              backgroundSize: `${zoom / sourceScale}px ${zoom / sourceScale}px`,
            }}
          />
        )}
      </div>
      {ready && (
        <div
          ref={pillRef}
          // Its liquid glass is its own pill-sized canvas, so it keeps the CSS
          // shadow that `.glass[data-liquid]` drops elsewhere.
          className="glass absolute bottom-4 left-1/2 z-1 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1 data-liquid:shadow-[0_8px_24px_rgba(0,0,0,0.5)]! group-data-flying/item:pointer-events-none group-data-flying/item:opacity-0"
        >
          <LiquidGlass
            // Until the canvas takes the copy, it would show unblurred inside the CSS glass.
            className="pointer-events-none absolute inset-0 -z-1 overflow-hidden rounded-[inherit] [&>.liquid-glass-content]:hidden"
            targetRoots={[pillRef]}
            shadow={false}
          >
            <div
              ref={lensStageRef}
              className="absolute border border-transparent [background:var(--item-stage-surface)]"
            />
            <img
              ref={lensImageRef}
              src={src}
              crossOrigin={canvasImageCrossOrigin(src)}
              alt=""
              className={cx("absolute rounded-[4px]", !isZoomed && IMAGE_SHADOW)}
            />
          </LiquidGlass>
          <button
            type="button"
            className={ZOOM_BUTTON}
            aria-label="Zoom out"
            data-tooltip="Zoom out"
            disabled={!isZoomed}
            onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="w-10 text-center font-mono text-[12px]/4 text-ink-soft tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={ZOOM_BUTTON}
            aria-label="Zoom in"
            data-tooltip="Zoom in"
            disabled={!canZoomIn}
            onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
