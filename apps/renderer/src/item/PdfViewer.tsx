import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { Button, Glass, IconButton } from "@inkling/ui";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ScrollArea } from "../reader/ScrollArea.tsx";
import { SizeStepper } from "./SizeStepper.tsx";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ViewerState =
  | { phase: "loading"; percent: number | null }
  | { phase: "error"; message: string }
  | { phase: "ready"; document: PDFDocumentProxy };

type Size = { width: number; height: number };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
// Page column layout in CSS pixels; `tops` below depends on these matching the styles.
const PAD_TOP = 24;
const PAD_X = 32;
const GAP = 18;
const THUMB_WIDTH = 40;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const failure = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Reads a saved PDF on the item stage: every page in one scrolling column, with a page rail. */
export function PdfViewer({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ViewerState>({ phase: "loading", percent: null });
  // Each page's size at scale 1, read once on load so the column never reflows while reading.
  const [sizes, setSizes] = useState<Size[]>([]);
  // null is fit to width.
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  // Where the reader is, as a page and how far into it, so a zoom keeps them there.
  const anchor = useRef<{ index: number; within: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!cancelled && total)
        setState({ phase: "loading", percent: Math.round((loaded / total) * 100) });
    };
    task.promise
      .then(async (document) => {
        const pages = Array.from({ length: document.numPages }, (_, at) => at + 1);
        const read = await Promise.all(
          pages.map(async (number) => {
            const { width, height } = (await document.getPage(number)).getViewport({ scale: 1 });
            return { width, height };
          }),
        );
        if (cancelled) return;
        setSizes(read);
        setState({ phase: "ready", document });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ phase: "error", message: failure(error, "Couldn’t open this PDF.") });
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  const pageCount = sizes.length;
  // Fit is to the widest page, so a landscape page in a portrait document is not cut off.
  const widest = Math.max(0, ...sizes.map((size) => size.width));
  const fit = widest > 0 && width > 0 ? clampZoom((width - PAD_X * 2) / widest) : 1;
  const scale = zoom ?? fit;
  const heights = sizes.map((size) => Math.floor(size.height * scale));
  const tops: number[] = [];
  heights.reduce((top, height, index) => {
    tops[index] = top;
    return top + height + GAP;
  }, PAD_TOP);

  const follow = () => {
    if (!scroller || pageCount === 0) return;
    const line = scroller.scrollTop + scroller.clientHeight / 3;
    let index = 0;
    while (index + 1 < pageCount && tops[index + 1]! <= line) index++;
    // A short last page never reaches the line, so the bottom of the scroll is the last page.
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if (scroller.scrollTop > 0 && atEnd) index = pageCount - 1;
    setCurrent(index + 1);
    anchor.current = {
      index,
      within: (scroller.scrollTop - tops[index]!) / Math.max(1, heights[index]!),
    };
  };

  // A new scale moves every page, so put the reader back where they were.
  useLayoutEffect(() => {
    const at = anchor.current;
    if (!scroller || !at || tops[at.index] === undefined) return;
    scroller.scrollTop = tops[at.index]! + at.within * heights[at.index]!;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs only when the scale changes; tops and heights follow it.
  }, [scale, scroller]);

  useEffect(() => {
    const thumb = rail?.querySelector<HTMLElement>(`[data-page="${current}"]`);
    if (!rail || !thumb) return;
    if (thumb.offsetTop < rail.scrollTop) rail.scrollTop = thumb.offsetTop - GAP;
    else if (thumb.offsetTop + thumb.offsetHeight > rail.scrollTop + rail.clientHeight)
      rail.scrollTop = thumb.offsetTop + thumb.offsetHeight - rail.clientHeight + GAP;
  }, [current, rail]);

  const goTo = (page: number) => {
    const next = Math.min(Math.max(1, page), Math.max(1, pageCount));
    if (scroller && tops[next - 1] !== undefined)
      scroller.scrollTop = tops[next - 1]! - PAD_TOP / 2;
    setCurrent(next);
  };
  // Arrow keys a focused field uses stay with it.
  useHotkeys(
    [
      { hotkey: "ArrowLeft", callback: () => goTo(current - 1) },
      { hotkey: "PageUp", callback: () => goTo(current - 1) },
      { hotkey: "ArrowRight", callback: () => goTo(current + 1) },
      { hotkey: "PageDown", callback: () => goTo(current + 1) },
    ],
    { ignoreDefaultPrevented: true },
  );

  const resize = (next: number) => setZoom(clampZoom(next));
  const pages = sizes.map((size, index) => ({ number: index + 1, size }));
  const pdf = state.phase === "ready" ? state.document : null;
  const railed = pdf !== null && pageCount > 1;

  return (
    <section aria-label={title} {...stylex.props(styles.viewer)}>
      {railed && (
        <nav ref={setRail} aria-label="Pages" {...stylex.props(styles.rail)}>
          {pages.map(({ number, size }) => (
            <button
              key={number}
              type="button"
              data-page={number}
              aria-label={`Page ${number}`}
              aria-current={current === number ? "page" : undefined}
              onClick={() => goTo(number)}
              {...stylex.props(
                styles.thumb,
                styles.box(THUMB_WIDTH, Math.round((size.height / size.width) * THUMB_WIDTH)),
                current === number && styles.thumbCurrent,
              )}
            >
              <PageCanvas
                document={pdf}
                number={number}
                scale={THUMB_WIDTH / size.width}
                root={rail}
              />
            </button>
          ))}
        </nav>
      )}
      <ScrollArea
        viewportRef={setScroller}
        onScroll={follow}
        style={[styles.scroller, railed && styles.besideRail]}
        viewportStyle={styles.viewport}
      >
        {state.phase === "loading" && (
          <p role="status" {...stylex.props(styles.status)}>
            {state.percent === null ? "Loading…" : `Loading ${state.percent}%`}
          </p>
        )}
        {state.phase === "error" && (
          <p role="alert" {...stylex.props(styles.status, styles.error)}>
            {state.message}
          </p>
        )}
        {pdf && width > 0 && (
          <div {...stylex.props(styles.column)}>
            {pages.map(({ number, size }) => (
              <div
                key={number}
                aria-label={`Page ${number} of ${pageCount}`}
                role="img"
                {...stylex.props(
                  styles.page,
                  styles.box(Math.floor(size.width * scale), heights[number - 1]!),
                )}
              >
                <PageCanvas document={pdf} number={number} scale={scale} root={scroller} />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      {pdf && (
        <>
          <Glass style={[styles.pill, styles.controls]}>
            <SizeStepper
              label="Zoom"
              percent={Math.round(scale * 100)}
              canShrink={scale > MIN_ZOOM}
              canGrow={scale < MAX_ZOOM}
              onShrink={() => resize(scale - ZOOM_STEP)}
              onGrow={() => resize(scale + ZOOM_STEP)}
            />
            {zoom !== null && (
              <Button style={styles.fit} onClick={() => setZoom(null)}>
                Fit
              </Button>
            )}
            <span aria-hidden="true" {...stylex.props(styles.divider)} />
            <IconButton
              label="Close PDF"
              icon={<HugeiconsIcon icon={Cancel01Icon} size={14} />}
              style={styles.round}
              onClick={onClose}
            />
          </Glass>
          <Glass
            aria-hidden="true"
            style={[styles.pill, styles.count, railed && styles.countBesideRail]}
          >
            Page {current} <span {...stylex.props(styles.of)}>of {pageCount}</span>
          </Glass>
        </>
      )}
    </section>
  );
}

/**
 * One page drawn into a canvas while it is near the visible part of `root`.
 * Far pages hold no canvas, so a long PDF keeps only a few drawn at once.
 */
function PageCanvas({
  document,
  number,
  scale,
  root,
}: {
  document: PDFDocumentProxy;
  number: number;
  scale: number;
  root: HTMLElement | null;
}) {
  const [near, setNear] = useState(false);
  const [holder, setHolder] = useState<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!holder || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      {
        root,
        rootMargin: "50% 0px",
      },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [holder, root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas) return;
    const drawing = new AbortController();
    const { signal } = drawing;
    void (async () => {
      const page = await document.getPage(number);
      if (signal.aborted) return;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      const task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      signal.addEventListener("abort", () => task.cancel(), { once: true });
      await task.promise;
    })().catch((error: unknown) => {
      // A cancelled draw is a page that scrolled away or changed scale; the next draw replaces it.
      if (!(error instanceof Error && error.name === "RenderingCancelledException"))
        console.warn(`Couldn’t draw page ${number}`, error);
    });
    return () => drawing.abort();
  }, [near, document, number, scale]);

  return (
    <span ref={setHolder} {...stylex.props(styles.holder)}>
      {near && <canvas ref={canvasRef} {...stylex.props(styles.canvas)} />}
    </span>
  );
}

const RAIL = "64px";

const styles = stylex.create({
  viewer: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 0,
    fontFamily: font.body,
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: RAIL,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    paddingBlock: space.s3,
    overflowY: "auto",
    scrollbarWidth: "none",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: color.border,
    backgroundColor: color.glass,
  },
  thumb: {
    position: "relative",
    flexShrink: 0,
    padding: 0,
    overflow: "hidden",
    borderWidth: 0,
    borderRadius: "2px",
    backgroundColor: itemColor.pdfPaper,
    opacity: { default: 0.55, ":hover": 0.85 },
    cursor: "pointer",
    outlineWidth: 1,
    outlineStyle: "solid",
    outlineColor: { default: color.border, ":focus-visible": color.accent },
    outlineOffset: 0,
    transitionProperty: "opacity",
    transitionDuration: "120ms",
  },
  thumbCurrent: {
    opacity: { default: 1, ":hover": 1 },
    outlineWidth: 2,
    outlineColor: color.accentStrong,
    outlineOffset: "2px",
  },
  scroller: { position: "absolute", inset: 0, height: "auto" },
  viewport: { overflowX: "auto", outline: "none" },
  besideRail: { left: RAIL },
  column: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: `${GAP}px`,
    boxSizing: "border-box",
    width: "max-content",
    minWidth: "100%",
    paddingTop: `${PAD_TOP}px`,
    paddingInline: `${PAD_X}px`,
    paddingBottom: "72px",
  },
  page: {
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: "3px",
    backgroundColor: itemColor.pdfPaper,
    boxShadow: `0 18px 50px ${color.shadow}`,
  },
  box: (width: number, height: number) => ({ width: `${width}px`, height: `${height}px` }),
  holder: { position: "absolute", inset: 0 },
  canvas: { display: "block", width: "100%", height: "100%" },
  status: {
    position: "absolute",
    inset: 0,
    margin: 0,
    display: "grid",
    placeItems: "center",
    fontSize: text.sm,
    color: color.muted,
  },
  error: { color: color.danger },
  pill: {
    position: "absolute",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    borderRadius: radius.round,
  },
  controls: { top: space.s4, right: space.s4, gap: "2px", padding: space.s1 },
  fit: { height: "28px", paddingInline: "10px", borderRadius: radius.round, fontSize: text.sm },
  divider: {
    width: "1px",
    height: "16px",
    marginInline: "4px",
    backgroundColor: color.glassRim,
  },
  round: { width: "28px", height: "28px", borderRadius: radius.round },
  count: {
    bottom: space.s4,
    left: "50%",
    translate: "-50% 0",
    height: "30px",
    paddingInline: space.s3,
    fontSize: text.sm,
    color: color.ink,
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
  },
  countBesideRail: { left: `calc(50% + ${RAIL} / 2)` },
  of: { marginLeft: "4px", color: color.muted },
});
