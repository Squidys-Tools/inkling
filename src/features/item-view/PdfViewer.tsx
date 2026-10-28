import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loading01Icon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cx } from "../../ui/cx";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ViewerState =
  | { phase: "loading"; percent: number | null }
  | { phase: "error"; message: string }
  | { phase: "ready"; pdfDocument: PDFDocumentProxy; pageCount: number };

type PdfViewerProps = {
  url: string;
  title: string;
  onClose: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const ICON_BUTTON =
  "inline-grid size-[26px] cursor-pointer place-items-center rounded-[8px] border border-transparent bg-transparent text-muted transition-[background-color,color,border-color] duration-180 ease-[ease] hover:border-border hover:bg-surface hover:text-ink [&_svg]:block";
const GROUP = "flex items-center gap-1 rounded-[8px] border border-border bg-white p-[3px]";
const STATUS =
  "absolute inset-0 flex flex-col items-center justify-center gap-2.5 font-body text-[12px] leading-[normal]";

function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const [state, setState] = useState<ViewerState>({ phase: "loading", percent: null });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [renderedScale, setRenderedScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url });
    task.onProgress = (data: { loaded: number; total: number }) => {
      if (cancelled || !data.total) return;
      setState({
        phase: "loading",
        percent: Math.round((data.loaded / data.total) * 100),
      });
    };
    void task.promise.then(
      (pdfDocument) => {
        if (cancelled) return;
        setPageNumber(1);
        setZoom(null);
        setState({ phase: "ready", pdfDocument, pageCount: pdfDocument.numPages });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            error instanceof Error && error.message ? error.message : "Could not open this PDF.",
        });
      },
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(container.clientWidth);
    });
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (state.phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas || containerWidth === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const page = await state.pdfDocument.getPage(pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = clampZoom(containerWidth / baseViewport.width);
      const scale = zoom ?? fitScale;
      const viewport = page.getViewport({ scale });
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({
        canvas,
        viewport,
        transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
      });
      try {
        await task.promise;
        if (!cancelled) setRenderedScale(scale);
      } catch (error) {
        if (!(error instanceof Error && error.name === "RenderingCancelledException")) throw error;
      }
    })().catch((error: unknown) => {
      if (cancelled) return;
      setState({
        phase: "error",
        message:
          error instanceof Error && error.message ? error.message : "Could not render this page.",
      });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [state, pageNumber, zoom, containerWidth]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPageNumber((current) => Math.max(1, current - 1));
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setPageNumber((current) => current + 1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const pageCount = state.phase === "ready" ? state.pageCount : 0;
  const atLastPage = pageNumber >= pageCount;

  if (pageCount > 0 && pageNumber > pageCount) setPageNumber(pageCount);

  const zoomLabel =
    zoom === null ? `Fit · ${Math.round(renderedScale * 100)}%` : `${Math.round(zoom * 100)}%`;

  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-[rgba(36,35,32,0.55)] p-7">
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
        aria-label="Close PDF viewer"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        className="relative z-1 flex h-full w-[min(920px,100%)] flex-col overflow-hidden rounded-sidebar border border-border bg-canvas shadow-[0_24px_70px_rgba(36,35,32,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center gap-3.5 border-b border-border bg-[#fbfbfa] px-3.5 py-2.5">
          <span
            className="min-w-0 flex-1 truncate font-quote text-[14px] leading-[normal] font-bold tracking-[-0.02em] text-ink"
            title={title}
          >
            {title}
          </span>
          <div className="flex items-center gap-2.5">
            <div className={GROUP}>
              <button
                type="button"
                className={ICON_BUTTON}
                onClick={() =>
                  setZoom((current) => clampZoom((current ?? renderedScale) - ZOOM_STEP))
                }
                aria-label="Zoom out"
              >
                <HugeiconsIcon icon={MinusSignIcon} size={15} />
              </button>
              <span className="min-w-[74px] text-center font-body text-[11px] leading-[normal] text-muted">
                {zoomLabel}
              </span>
              <button
                type="button"
                className={ICON_BUTTON}
                onClick={() =>
                  setZoom((current) => clampZoom((current ?? renderedScale) + ZOOM_STEP))
                }
                aria-label="Zoom in"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={15} />
              </button>
              <button
                type="button"
                className="ml-0.5 cursor-pointer border-0 bg-transparent text-[11px] text-accent underline underline-offset-3"
                onClick={() => setZoom(null)}
              >
                Fit
              </button>
            </div>
            <div className={GROUP}>
              <button
                type="button"
                className={ICON_BUTTON}
                onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
                disabled={pageNumber <= 1}
                aria-label="Previous page"
              >
                <HugeiconsIcon icon={ChevronLeftIcon} size={15} />
              </button>
              <span className="flex items-center gap-[5px] font-body text-[11px] leading-[normal] text-muted">
                {state.phase === "ready" ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={pageCount}
                      value={pageNumber}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next >= 1) setPageNumber(Math.floor(next));
                      }}
                      onBlur={() => {
                        if (!Number.isFinite(pageNumber) || pageNumber < 1) setPageNumber(1);
                        else if (pageNumber > pageCount) setPageNumber(pageCount);
                      }}
                      aria-label="Page number"
                      className="w-[42px] [appearance:textfield] rounded-[6px] border border-transparent bg-transparent px-[5px] py-1 text-right text-ink focus-visible:outline-offset-0! [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span> / {pageCount}</span>
                  </>
                ) : (
                  "– / –"
                )}
              </span>
              <button
                type="button"
                className={ICON_BUTTON}
                onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
                disabled={state.phase !== "ready" || atLastPage}
                aria-label="Next page"
              >
                <HugeiconsIcon icon={ChevronRightIcon} size={15} />
              </button>
            </div>
            <button
              type="button"
              className={ICON_BUTTON}
              onClick={onClose}
              aria-label="Close viewer"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          </div>
        </header>
        <div
          className="relative grid flex-1 items-start justify-items-center overflow-auto bg-surface-raised px-5 pt-[26px] pb-10"
          ref={containerRef}
        >
          {state.phase === "loading" && (
            <div
              className={cx(STATUS, "text-muted [&>svg]:animate-[spin_1.2s_linear_infinite]")}
              role="status"
            >
              <HugeiconsIcon icon={Loading01Icon} size={18} />
              <span>{state.percent != null ? `Loading ${state.percent}%` : "Loading…"}</span>
            </div>
          )}
          {state.phase === "error" && (
            <div className={cx(STATUS, "text-[#a4472e]")} role="alert">
              <span>{state.message}</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="max-w-full rounded-[4px] bg-white shadow-[0_8px_30px_rgba(36,35,32,0.22)]"
            hidden={state.phase !== "ready"}
          />
        </div>
      </section>
    </div>
  );
}

export default PdfViewer;
