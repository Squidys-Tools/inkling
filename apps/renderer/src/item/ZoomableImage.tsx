import * as stylex from "@stylexjs/stylex";
import { Glass } from "@inkling/ui";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { type PointerEvent, useEffect, useEffectEvent, useRef, useState } from "react";
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
} from "./imageZoom.ts";

// Zoom and pan live here, so panning re-renders only this stage. The caller
// keys it by item, which resets zoom when the shown item changes.
export function ZoomableImage({
  src,
  originalSrc,
  alt,
}: {
  src: string;
  /** The full-size file, swapped in once the image is zoomed past fit. */
  originalSrc?: string;
  alt: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; origin: Offset } | null>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  // The first image's size fixes the layout box, so the original can swap in
  // without the picture moving or resizing.
  const [natural, setNatural] = useState<Size | null>(null);
  const [original, setOriginal] = useState<{ url: string; width: number } | null>(null);
  // null is fit, which follows the frame as the window resizes.
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [pan, setPan] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setFrame((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ready = frame !== null && natural !== null && frame.width > 0 && frame.height > 0;
  // Never above 1: an image smaller than the frame rests at its own size.
  const fit = ready ? Math.min(1, frame.width / natural.width, frame.height / natural.height) : 1;
  const zoom = clampZoom(zoomLevel ?? fit, fit);
  const isZoomed = zoom > fit;
  const shown = natural ? { width: natural.width * zoom, height: natural.height * zoom } : null;
  const offset = ready && shown ? clampPan(pan, shown, frame) : { x: 0, y: 0 };
  // One pixel-grid cell per original pixel, so the grid lines up with what is on screen.
  const sourceScale = original && natural ? original.width / natural.width : 1;

  // Past fit, load the original. It decodes before the swap, so the picture never blanks.
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

  // Scales by `factor`, keeping the image point under `anchor` (frame-centre
  // coordinates) still. Back at fit, zoom follows the frame again.
  function zoomBy(factor: number, anchor: Offset = { x: 0, y: 0 }) {
    if (!ready) return;
    const next = clampZoom(zoom * factor, fit);
    if (next === zoom) return;
    const moved = panAround(offset, anchor, zoom, next);
    setPan(clampPan(moved, { width: natural.width * next, height: natural.height * next }, frame));
    setZoomLevel(next <= fit * 1.001 ? null : next);
  }
  const zoomOnWheel = useEffectEvent(zoomBy);

  // React's wheel listener is passive, so Ctrl+wheel is attached here to stop
  // the page zooming instead of the image.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomOnWheel(wheelZoomFactor(event.deltaY), {
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

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!isZoomed || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, origin: offset };
    setIsDragging(true);
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start || !shown || !frame) return;
    const x = start.origin.x + event.clientX - start.pointerX;
    const y = start.origin.y + event.clientY - start.pointerY;
    setPan(clampPan({ x, y }, shown, frame));
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  const base = ready ? { width: natural.width * fit, height: natural.height * fit } : null;
  return (
    <>
      <div
        ref={frameRef}
        {...stylex.props(
          styles.frame,
          isZoomed && styles.zoomed,
          isZoomed && (isDragging ? styles.grabbing : styles.grab),
        )}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={original?.url ?? src}
          alt={alt}
          draggable={!isZoomed}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0)
              setNatural((previous) => previous ?? { width: naturalWidth, height: naturalHeight });
          }}
          {...stylex.props(
            styles.image,
            // A shadow would be recomputed over the whole scaled image on every pan.
            !isZoomed && styles.shadow,
            base && styles.box(base.width, base.height),
            isZoomed && styles.transform(offset.x, offset.y, zoom / fit),
            zoom >= PIXEL_ZOOM && styles.pixelated,
          )}
        />
        {ready && zoom >= PIXEL_ZOOM && shown && (
          <div
            {...stylex.props(
              styles.grid,
              styles.gridPlacement(shown.width, shown.height, offset.x, offset.y),
              styles.gridCell(zoom / sourceScale),
            )}
          />
        )}
      </div>
      {ready && (
        <Glass style={styles.pill}>
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!isZoomed}
            onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
            {...stylex.props(styles.zoomButton)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14" {...glyph} />
            </svg>
          </button>
          <span {...stylex.props(styles.percent)}>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)}
            {...stylex.props(styles.zoomButton)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" {...glyph} />
            </svg>
          </button>
        </Glass>
      )}
    </>
  );
}

const glyph = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
} as const;

const styles = stylex.create({
  frame: {
    position: "relative",
    width: "100%",
    height: "100%",
  },
  zoomed: { touchAction: "none" },
  grab: { cursor: "grab" },
  grabbing: { cursor: "grabbing" },
  image: {
    position: "absolute",
    top: "50%",
    left: "50%",
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    translate: "-50% -50%",
    borderRadius: "4px",
    userSelect: "none",
  },
  shadow: { boxShadow: `0 24px 60px ${color.shadow}` },
  box: (width: number, height: number) => ({ width: `${width}px`, height: `${height}px` }),
  transform: (x: number, y: number, scale: number) => ({
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
  }),
  pixelated: { imageRendering: "pixelated" },
  // Drawn in screen space over the image, so its lines stay one pixel wide.
  grid: {
    position: "absolute",
    top: "50%",
    left: "50%",
    pointerEvents: "none",
    backgroundImage: `linear-gradient(to right, ${color.overlayActive} 1px, transparent 1px), linear-gradient(to bottom, ${color.overlayActive} 1px, transparent 1px)`,
  },
  gridPlacement: (width: number, height: number, x: number, y: number) => ({
    width: `${width}px`,
    height: `${height}px`,
    translate: `calc(-50% + ${x}px) calc(-50% + ${y}px)`,
  }),
  gridCell: (size: number) => ({ backgroundSize: `${size}px ${size}px` }),
  pill: {
    position: "absolute",
    bottom: space.s4,
    left: "50%",
    translate: "-50% 0",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    paddingBlock: space.s1,
    paddingInline: "6px",
    borderRadius: radius.round,
  },
  zoomButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayHover,
      ":disabled": "transparent",
    },
    color: { default: color.inkSoft, ":disabled": color.faint },
    cursor: { default: "pointer", ":disabled": "default" },
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
  },
  percent: {
    width: "40px",
    textAlign: "center",
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: "16px",
    color: color.inkSoft,
    fontVariantNumeric: "tabular-nums",
  },
});
