import { useEffect, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AtSignIcon,
  Bookmark01Icon,
  CheckmarkBadge01Icon,
  FileTextIcon,
  HeartIcon,
  Image01Icon,
  Link01Icon,
  Message01Icon,
  PlayIcon,
  RepeatIcon,
  Share08Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { autoplayEmbedUrl, providerLabel } from "../lib/ingestion/video-links";
import { normalizeXPostOEmbed, xPostOEmbedUrl } from "../lib/ingestion/x-post";
import { markdownToPlainText } from "../lib/notes";
import type { XPostMetadata } from "../lib/ingestion/types";
import type { ItemKind, LibraryItem } from "../App";
import pdfPointillismOptionB from "../assets/pdf-pointillism-option-b.png";

export function mediaAspectRatioFor(item: LibraryItem): number {
  if (item.mediaAspectRatio && Number.isFinite(item.mediaAspectRatio) && item.mediaAspectRatio > 0) {
    return item.mediaAspectRatio;
  }
  if (item.mediaWidth && item.mediaHeight && item.mediaWidth > 0 && item.mediaHeight > 0) {
    return item.mediaWidth / item.mediaHeight;
  }

  // Keep native X posts compact enough to read as a card while leaving the
  // full-height version available in the detail view.
  if (item.social?.provider === "x") return 1.6;

  switch (item.kind) {
    case "Video":
      return 16 / 9;
    case "Article":
      return 16 / 10;
    case "Image":
      return 4 / 3;
    case "Post":
      return 1.45;
    case "PDF":
      return 4 / 3;
    case "Quote":
      return 1.4;
    default:
      return 1.45;
  }
}

export function KindIcon({ kind }: { kind: ItemKind }) {
  const icon =
    kind === "Image"
      ? Image01Icon
      : kind === "Article"
        ? Link01Icon
        : kind === "PDF"
          ? FileTextIcon
          : kind === "Quote"
            ? Bookmark01Icon
            : kind === "Post"
              ? AtSignIcon
              : kind === "Video"
                ? PlayIcon
                : SparklesIcon;
  return <HugeiconsIcon icon={icon} size={13} />;
}

export function pdfPreviewTitle(value: string): string {
  return value
    .replace(/\uFFFD/gu, "’")
    .replace(/\.[^.]+$/u, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function PdfArtwork({ item }: { item: LibraryItem }) {
  return (
    <div className="pdf-artwork absolute inset-0 isolate overflow-hidden bg-paper">
      <img src={pdfPointillismOptionB} alt="" className="pdf-shader pointer-events-none absolute inset-0 z-0 size-full object-cover" />
      <span className="pdf-label absolute top-[16%] left-[11%] z-2 font-mono text-[9px] tracking-[.15em] text-muted">PDF</span>
      <span className="pdf-mark absolute top-[15%] right-[13%] z-2 size-[20px] rounded-full border border-muted opacity-85" aria-hidden="true" />
      <span className="pdf-title [display:-webkit-box] absolute top-[35%] right-[16%] left-[11%] z-2 overflow-hidden font-sans text-[17px] font-semibold leading-[1.16] tracking-[-.025em] uppercase text-ink [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{pdfPreviewTitle(item.title) || "Document"}</span>
      <div className="pdf-legend absolute top-[59%] left-[11%] z-2 flex items-center gap-[7px]" aria-hidden="true"><span className="size-[9px] rounded-full bg-orange" /><span className="size-[9px] rounded-full bg-yellow-soft" /><span className="size-[9px] rounded-full bg-green" /></div>
      <span className="pdf-page-count absolute right-[11%] bottom-[11%] z-2 font-mono text-[10px] tracking-[.08em] text-muted">{item.pdfPageCount ? `${item.pdfPageCount} PAGES` : "PDF"}</span>
    </div>
  );
}

// `item.description` is already the plain text the backend projected, so it is
// counted as it came. Only a raw note body, which is still Markdown, needs the
// projection first.
export function noteWordCount(value: string | undefined): number {
  const text = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (!text) return 0;
  return text.split(" ").length;
}

// Notes reuse the PDF thumbnail artwork verbatim — same shader texture and
// label/mark/title/legend geometry — with only the copy swapped to the
// note's own indexed content: the pipeline title and the description's word
// count in place of the PDF page count.
export function NoteArtwork({ item }: { item: LibraryItem }) {
  const words = noteWordCount(item.noteBody === undefined ? item.description : markdownToPlainText(item.noteBody));
  return (
    <div className="pdf-artwork absolute inset-0 isolate overflow-hidden bg-paper">
      <img src={pdfPointillismOptionB} alt="" className="pdf-shader pointer-events-none absolute inset-0 z-0 size-full object-cover" />
      <span className="pdf-label absolute top-[16%] left-[11%] z-2 font-mono text-[9px] tracking-[.15em] text-muted">NOTE</span>
      <span className="pdf-mark absolute top-[15%] right-[13%] z-2 size-[20px] rounded-full border border-muted opacity-85" aria-hidden="true" />
      <span className="pdf-title [display:-webkit-box] absolute top-[35%] right-[16%] left-[11%] z-2 overflow-hidden font-sans text-[17px] font-semibold leading-[1.16] tracking-[-.025em] uppercase text-ink [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{item.title?.trim() || "Untitled note"}</span>
      <div className="pdf-legend absolute top-[59%] left-[11%] z-2 flex items-center gap-[7px]" aria-hidden="true"><span className="size-[9px] rounded-full bg-orange" /><span className="size-[9px] rounded-full bg-yellow-soft" /><span className="size-[9px] rounded-full bg-green" /></div>
      <span className="pdf-page-count absolute right-[11%] bottom-[11%] z-2 font-mono text-[10px] tracking-[.08em] text-muted">{words > 0 ? `${words} WORDS` : "NOTE"}</span>
    </div>
  );
}

// The card's X-post fallback is a bare `.post-art` with no post data, so it has
// to paint the same surface as the real artwork. One constant, so the two
// cannot drift.
export const POST_ART_CLASS =
  "post-art flex min-h-[185px] flex-col overflow-hidden p-5 bg-[#edf4f5] text-[#243d42]";

export function PostArtwork({ post }: { post: NonNullable<LibraryItem["post"]> }) {
  return (
    <div className={POST_ART_CLASS} aria-hidden="true">
      <div className="post-author flex items-center gap-[9px]">
        <span className="post-avatar relative grid size-[28px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#243d42] font-sans text-[15px] font-medium leading-[1] text-[#e8f0f2]">
          <span className="relative z-0">j</span>
          {post.avatarUrl && <img src={post.avatarUrl} alt="" className="absolute inset-0 z-1 size-full object-cover" />}
        </span>
        <span className="grid min-w-0 grid-cols-[auto_auto] items-center gap-x-[4px]">
          <strong className="text-[12px] font-semibold">{post.displayName}</strong>
          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={13} />
          <small className="col-span-full font-mono text-[10px] text-[#6b8589]">{post.handle}</small>
        </span>
        <span className="post-platform ml-auto font-sans text-[17px] font-bold leading-[1] tracking-[-.1em] text-[#243d42]">X</span>
      </div>
      <p className="mt-auto mx-0 mb-[13px] min-h-0 max-w-[22ch] font-sans text-[20px] font-medium leading-[1.2] tracking-[-.035em] text-[#243d42]">{post.body}</p>
      <div className="post-date border-t border-[rgba(36,61,66,.16)] pt-[10px] font-mono text-[10px] text-[#6b8589]">{post.published}</div>
      <div className="post-actions mt-[13px] flex gap-[17px] text-[#6b8589]">
        <HugeiconsIcon icon={Message01Icon} size={14} />
        <HugeiconsIcon icon={RepeatIcon} size={14} />
        <HugeiconsIcon icon={HeartIcon} size={14} />
        <HugeiconsIcon icon={Share08Icon} size={14} />
      </div>
    </div>
  );
}

const VIDEO_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

export function DetailVideoMedia({ item }: { item: LibraryItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => setIsPlaying(false), [item.id]);

  if (item.video) {
    const poster = item.image ?? item.video.posterUrl;
    return (
      <div className="detail-video relative h-full overflow-hidden bg-[#101010]">
        {isPlaying ? (
          <iframe
            className="block size-full border-0"
            src={autoplayEmbedUrl(item.video.embedUrl)}
            title={item.title}
            allow={VIDEO_IFRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="video-poster group relative block size-full cursor-pointer border-0 bg-[#101010] p-0"
            onClick={() => setIsPlaying(true)}
            aria-label={`Play video: ${item.title}`}
          >
            {poster && <img src={poster} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-[.88] [transition:opacity_.2s_ease] hover:opacity-100" />}
            <span className="video-poster-play absolute inset-0 m-auto grid size-[54px] place-items-center rounded-full bg-[rgba(18,18,16,.8)] text-[#f2ede2] shadow-[0_10px_28px_rgba(0,0,0,.5),inset_0_0_0_1px_rgba(255,255,255,.22)] [transition:transform_.2s_ease] group-hover:scale-[1.08]" aria-hidden="true"><HugeiconsIcon icon={PlayIcon} size={21} /></span>
            <span className="video-provider pointer-events-none absolute bottom-[11px] left-[12px] font-mono text-[9px] tracking-[.13em] text-[#b3ad8d] uppercase text-shadow-[0_1px_6px_rgba(0,0,0,.7)]">{providerLabel(item.video.provider)}</span>
          </button>
        )}
      </div>
    );
  }

  if (item.fileUrl) {
    return (
      <div className="detail-video relative h-full overflow-hidden bg-[#101010]">
        <video className="detail-native-video block size-full object-contain bg-[#000]" src={item.fileUrl} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div className={`detail-art ${item.accent ?? "ink"}`}><KindIcon kind={item.kind} /><span>{item.kind}</span></div>
  );
}

type XWidgets = {
  widgets?: {
    load: (element?: HTMLElement) => void;
  };
};

declare global {
  interface Window {
    twttr?: XWidgets;
  }
}

let xWidgetsPromise: Promise<void> | null = null;
const X_WIDGETS_SRC = "https://platform.twitter.com/widgets.js";

function loadXWidgets() {
  if (typeof window === "undefined" || window.twttr?.widgets) return Promise.resolve();
  if (xWidgetsPromise) return xWidgetsPromise;

  xWidgetsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("#twitter-wjs");
    const script = existing ?? document.createElement("script");
    let pollId: number | undefined;
    let timeoutId: number | undefined;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (pollId !== undefined) window.clearInterval(pollId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };

    const checkReady = () => {
      if (window.twttr?.widgets) finish();
    };

    const handleLoad = () => {
      checkReady();
      window.setTimeout(checkReady, 0);
    };
    const handleError = () => finish(new Error("X widgets could not be loaded."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = "twitter-wjs";
      script.src = X_WIDGETS_SRC;
      script.async = true;
      script.charset = "utf-8";
      document.head.appendChild(script);
    }

    checkReady();
    pollId = window.setInterval(checkReady, 100);
    timeoutId = window.setTimeout(() => finish(new Error("X widgets timed out.")), 15000);
  });

  return xWidgetsPromise;
}

function waitForXWidget(root: HTMLElement, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | null = null;
    let timeoutId: number | undefined;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(loaded);
    };

    const watchWidget = () => {
      const iframe = root.querySelector<HTMLIFrameElement>("iframe");
      if (!iframe) return;

      // X replaces the blockquote with its official cross-origin iframe. The
      // iframe load event is not a reliable readiness signal here: cached
      // frames can finish before a listener is attached, and some browsers do
      // not surface a second load event for an already-created frame. Seeing
      // the official iframe is the stable signal that widgets.js transformed
      // this embed. Do not wait for requestAnimationFrame here: the preview
      // can be backgrounded, and browsers throttle animation frames in that
      // state even though the cross-origin iframe has already loaded.
      finish(true);
    };

    observer = new MutationObserver(watchWidget);
    observer.observe(root, { childList: true, subtree: true });
    watchWidget();
    timeoutId = window.setTimeout(() => finish(false), timeoutMs);
  });
}

export function XPostEmbed({ social, fallback }: { social: XPostMetadata; fallback: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [embedHtml, setEmbedHtml] = useState<string | undefined>(social.embedHtml);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelScheduledLoad: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        let cancelled = false;
        const start = () => {
          if (!cancelled) setShouldLoad(true);
        };
        const idleId = idleWindow.requestIdleCallback
          ? idleWindow.requestIdleCallback(start, { timeout: 1200 })
          : window.setTimeout(start, 0);
        cancelScheduledLoad = () => {
          cancelled = true;
          if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) {
            idleWindow.cancelIdleCallback(idleId);
          } else {
            window.clearTimeout(idleId);
          }
        };
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(host);

    return () => {
      observer.disconnect();
      cancelScheduledLoad?.();
    };
  }, [social.postUrl]);

  useEffect(() => {
    setShouldLoad(false);
    setEmbedHtml(social.embedHtml);
    setStatus("idle");
  }, [social.embedHtml, social.postUrl]);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    setStatus("loading");

    if (social.embedHtml) {
      setEmbedHtml(social.embedHtml);
      return () => {
        cancelled = true;
      };
    }

    fetch(xPostOEmbedUrl(social.postUrl), { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`X oEmbed returned HTTP ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (cancelled) return;
        const normalized = normalizeXPostOEmbed(social.postUrl, payload as Parameters<typeof normalizeXPostOEmbed>[1]);
        if (!normalized?.embedHtml) throw new Error("X did not return embed markup.");
        setEmbedHtml(normalized.embedHtml);
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, social.embedHtml, social.postUrl]);

  useEffect(() => {
    const root = nativeRef.current;
    if (!root || !embedHtml) return;

    root.innerHTML = embedHtml;
    const updateEmbedWidth = () => {
      const width = Math.min(550, Math.max(280, Math.floor(root.getBoundingClientRect().width)));
      const iframe = root.querySelector<HTMLIFrameElement>("iframe");

      if (iframe) {
        // The iframe itself is width: 100%; changing its URL after X has
        // rendered causes the widget to reload and can create a resize loop.
        // Its document receives the new viewport width through the iframe box.
        return;
      }

      root.querySelector<HTMLElement>("blockquote.twitter-tweet")?.setAttribute("data-width", String(width));
    };

    updateEmbedWidth();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateEmbedWidth);
    resizeObserver?.observe(root);
    window.addEventListener("resize", updateEmbedWidth);
    let cancelled = false;
    loadXWidgets()
      .then(async () => {
        if (cancelled) return;
        const widgetLoad = waitForXWidget(root);
        window.twttr?.widgets?.load(root);
        const loaded = await widgetLoad;
        if (!cancelled) setStatus(loaded ? "ready" : "failed");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateEmbedWidth);
      root.replaceChildren();
    };
  }, [embedHtml, shouldLoad]);

  return (
    <div className="x-post-embed w-full" ref={hostRef} data-x-status={status}>
      <div className={`x-post-native ${status === "ready" ? "is-ready" : ""}`} ref={nativeRef} aria-hidden={status !== "ready"} />
      {status !== "ready" && <div className="x-post-fallback">{fallback}</div>}
    </div>
  );
}
