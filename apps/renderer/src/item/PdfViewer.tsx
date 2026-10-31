import {
  Cancel01Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@inkling/ui";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useEffectEvent, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ViewerState =
  | { phase: "loading"; percent: number | null }
  | { phase: "error"; message: string }
  | { phase: "ready"; document: PDFDocumentProxy };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const failure = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Reads a saved PDF page by page on the item stage. */
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
  const [pageNumber, setPageNumber] = useState(1);
  // null is fit to width.
  const [zoom, setZoom] = useState<number | null>(null);
  const [renderedScale, setRenderedScale] = useState(1);
  const [width, setWidth] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!cancelled && total)
        setState({ phase: "loading", percent: Math.round((loaded / total) * 100) });
    };
    task.promise.then(
      (document) => {
        if (!cancelled) setState({ phase: "ready", document });
      },
      (error: unknown) => {
        if (!cancelled)
          setState({ phase: "error", message: failure(error, "Couldn’t open this PDF.") });
      },
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const pageCount = state.phase === "ready" ? state.document.numPages : 0;
  const page = pageCount > 0 ? Math.min(pageNumber, pageCount) : pageNumber;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (state.phase !== "ready" || !canvas || width === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const pdfPage = await state.document.getPage(page);
      if (cancelled) return;
      const scale = zoom ?? clampZoom(width / pdfPage.getViewport({ scale: 1 }).width);
      const viewport = pdfPage.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = pdfPage.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      try {
        await task.promise;
        if (!cancelled) setRenderedScale(scale);
      } catch (error) {
        if (!(error instanceof Error && error.name === "RenderingCancelledException")) throw error;
      }
    })().catch((error: unknown) => {
      if (!cancelled)
        setState({ phase: "error", message: failure(error, "Couldn’t draw this page.") });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [state, page, zoom, width]);

  const turn = (delta: number) =>
    setPageNumber(Math.min(Math.max(1, page + delta), Math.max(1, pageCount)));
  const turnOnKey = useEffectEvent(turn);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Alt+Left and the like are Back and Forward.
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      // The Info and Similar tabs move with the arrow keys too.
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [role="tablist"]')
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") turnOnKey(-1);
      else if (event.key === "ArrowRight" || event.key === "PageDown") turnOnKey(1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section aria-label={title} {...stylex.props(styles.viewer)}>
      <header {...stylex.props(styles.bar)}>
        <span title={title} {...stylex.props(styles.title)}>
          {title}
        </span>
        <div {...stylex.props(styles.group)}>
          <IconButton
            label="Zoom out"
            icon={<HugeiconsIcon icon={MinusSignIcon} size={15} />}
            style={styles.small}
            onClick={() => setZoom((current) => clampZoom((current ?? renderedScale) - ZOOM_STEP))}
          />
          <span {...stylex.props(styles.readout, styles.zoomReadout)}>
            {zoom === null
              ? `Fit · ${Math.round(renderedScale * 100)}%`
              : `${Math.round(zoom * 100)}%`}
          </span>
          <IconButton
            label="Zoom in"
            icon={<HugeiconsIcon icon={PlusSignIcon} size={15} />}
            style={styles.small}
            onClick={() => setZoom((current) => clampZoom((current ?? renderedScale) + ZOOM_STEP))}
          />
          <button type="button" onClick={() => setZoom(null)} {...stylex.props(styles.fit)}>
            Fit
          </button>
        </div>
        <div {...stylex.props(styles.group)}>
          <IconButton
            label="Previous page"
            icon={<HugeiconsIcon icon={ChevronLeftIcon} size={15} />}
            style={styles.small}
            disabled={page <= 1}
            onClick={() => turn(-1)}
          />
          <span {...stylex.props(styles.readout)}>
            {state.phase === "ready" ? (
              <>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={page}
                  aria-label="Page number"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next >= 1)
                      setPageNumber(Math.min(Math.floor(next), pageCount));
                  }}
                  {...stylex.props(styles.pageInput)}
                />
                {` / ${pageCount}`}
              </>
            ) : (
              "– / –"
            )}
          </span>
          <IconButton
            label="Next page"
            icon={<HugeiconsIcon icon={ChevronRightIcon} size={15} />}
            style={styles.small}
            disabled={state.phase !== "ready" || page >= pageCount}
            onClick={() => turn(1)}
          />
        </div>
        <IconButton
          label="Close PDF"
          icon={<HugeiconsIcon icon={Cancel01Icon} size={16} />}
          style={styles.small}
          onClick={onClose}
        />
      </header>
      <div ref={scrollerRef} {...stylex.props(styles.scroller)}>
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
        <canvas ref={canvasRef} hidden={state.phase !== "ready"} {...stylex.props(styles.page)} />
      </div>
    </section>
  );
}

const styles = stylex.create({
  viewer: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    backgroundColor: color.surface,
  },
  title: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.quote,
    fontSize: text.md,
    color: color.ink,
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    padding: "3px",
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.sunken,
  },
  small: { width: "26px", height: "26px" },
  readout: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontFamily: font.body,
    fontSize: text.xs,
    color: color.muted,
  },
  zoomReadout: { minWidth: "74px", justifyContent: "center" },
  fit: {
    marginLeft: "2px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontSize: text.xs,
    color: color.accentStrong,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
  },
  pageInput: {
    width: "42px",
    paddingBlock: space.s1,
    paddingInline: "5px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: "transparent", ":focus": color.accent },
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: color.ink,
    fontFamily: font.body,
    fontSize: text.xs,
    textAlign: "right",
    outline: "none",
    appearance: "textfield",
    "::-webkit-inner-spin-button": { appearance: "none", margin: 0 },
    "::-webkit-outer-spin-button": { appearance: "none", margin: 0 },
  },
  scroller: {
    position: "relative",
    flexGrow: 1,
    minHeight: 0,
    overflow: "auto",
    display: "grid",
    justifyItems: "center",
    alignItems: "start",
    paddingTop: "26px",
    paddingInline: space.s5,
    paddingBottom: space.s10,
    backgroundColor: color.raised,
  },
  status: {
    position: "absolute",
    inset: 0,
    margin: 0,
    display: "grid",
    placeItems: "center",
    fontFamily: font.body,
    fontSize: text.sm,
    color: color.muted,
  },
  error: { color: color.danger },
  page: {
    borderRadius: "4px",
    backgroundColor: itemColor.pdfPaper,
    boxShadow: `0 8px 30px ${color.shadow}`,
  },
});
