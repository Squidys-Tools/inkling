import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AppIcon } from "./AppIcon";

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

export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
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
            error instanceof Error && error.message
              ? error.message
              : "Could not open this PDF.",
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
        message: error instanceof Error && error.message ? error.message : "Could not render this page.",
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

  useEffect(() => {
    if (pageCount > 0 && pageNumber > pageCount) setPageNumber(pageCount);
  }, [pageCount, pageNumber]);

  const zoomLabel =
    zoom === null ? `Fit · ${Math.round(renderedScale * 100)}%` : `${Math.round(zoom * 100)}%`;

  return (
    <div
      className="pdf-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer: ${title}`}
      onClick={onClose}
    >
      <div className="pdf-viewer" onClick={(event) => event.stopPropagation()}>
        <header className="pdf-viewer-header">
          <span className="pdf-viewer-title" title={title}>{title}</span>
          <div className="pdf-viewer-toolbar">
            <div className="pdf-viewer-group">
              <button
                type="button"
                className="icon-button small"
                onClick={() => setZoom((current) => clampZoom((current ?? renderedScale) - ZOOM_STEP))}
                aria-label="Zoom out"
              >
                <AppIcon name="minus" size={15} />
              </button>
              <span className="pdf-viewer-zoom">{zoomLabel}</span>
              <button
                type="button"
                className="icon-button small"
                onClick={() => setZoom((current) => clampZoom((current ?? renderedScale) + ZOOM_STEP))}
                aria-label="Zoom in"
              >
                <AppIcon name="plus" size={15} />
              </button>
              <button type="button" className="text-button" onClick={() => setZoom(null)}>Fit</button>
            </div>
            <div className="pdf-viewer-group">
              <button
                type="button"
                className="icon-button small"
                onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
                disabled={pageNumber <= 1}
                aria-label="Previous page"
              >
                <AppIcon name="chevronLeft" size={15} />
              </button>
              <span className="pdf-viewer-page">
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
                    />
                    <span> / {pageCount}</span>
                  </>
                ) : (
                  "– / –"
                )}
              </span>
              <button
                type="button"
                className="icon-button small"
                onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
                disabled={state.phase !== "ready" || atLastPage}
                aria-label="Next page"
              >
                <AppIcon name="chevronRight" size={15} />
              </button>
            </div>
            <button type="button" className="icon-button small" onClick={onClose} aria-label="Close viewer">
              <AppIcon name="x" size={16} />
            </button>
          </div>
        </header>
        <div className="pdf-viewer-body" ref={containerRef}>
          {state.phase === "loading" && (
            <div className="pdf-viewer-status" role="status">
              <AppIcon name="loader" size={18} className="spin" />
              <span>{state.percent != null ? `Loading ${state.percent}%` : "Loading…"}</span>
            </div>
          )}
          {state.phase === "error" && (
            <div className="pdf-viewer-status failed" role="alert">
              <span>{state.message}</span>
            </div>
          )}
          <canvas ref={canvasRef} className="pdf-viewer-canvas" hidden={state.phase !== "ready"} />
        </div>
      </div>
    </div>
  );
}

export default PdfViewer;
