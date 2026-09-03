import { useEffect, useRef, useState, type ReactNode } from "react";
import { autoplayEmbedUrl, providerLabel } from "../lib/ingestion/video-links";
import { normalizeXPostOEmbed, xPostOEmbedUrl } from "../lib/ingestion/x-post";
import type { XPostMetadata } from "../lib/ingestion/types";
import type { ItemKind, LibraryItem } from "../App";
import { AppIcon, type IconName } from "./AppIcon";

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
  const iconName: IconName =
    kind === "Image"
      ? "image"
      : kind === "Article"
        ? "link"
        : kind === "PDF"
          ? "fileText"
          : kind === "Quote"
            ? "bookmark"
            : kind === "Post"
              ? "atSign"
              : kind === "Video"
                ? "play"
                : "sparkles";
  return <AppIcon name={iconName} size={13} />;
}

export function PostArtwork({ post }: { post: NonNullable<LibraryItem["post"]> }) {
  return (
    <div className="post-art" aria-hidden="true">
      <div className="post-author">
        <span className="post-avatar">
          <span>j</span>
          {post.avatarUrl && <img src={post.avatarUrl} alt="" />}
        </span>
        <span>
          <strong>{post.displayName}</strong>
          <AppIcon name="badgeCheck" size={13} />
          <small>{post.handle}</small>
        </span>
        <span className="post-platform">X</span>
      </div>
      <p>{post.body}</p>
      <div className="post-date">{post.published}</div>
      <div className="post-actions">
        <AppIcon name="message" size={14} />
        <AppIcon name="repeat" size={14} />
        <AppIcon name="heart" size={14} />
        <AppIcon name="share" size={14} />
      </div>
    </div>
  );
}

export const VIDEO_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

export function DetailVideoMedia({ item }: { item: LibraryItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => setIsPlaying(false), [item.id]);

  if (item.video) {
    const poster = item.image ?? item.video.posterUrl;
    return (
      <div className="detail-video">
        {isPlaying ? (
          <iframe
            src={autoplayEmbedUrl(item.video.embedUrl)}
            title={item.title}
            allow={VIDEO_IFRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="video-poster"
            onClick={() => setIsPlaying(true)}
            aria-label={`Play video: ${item.title}`}
          >
            {poster && <img src={poster} alt="" loading="lazy" />}
            <span className="video-poster-play" aria-hidden="true"><AppIcon name="play" size={21} /></span>
            <span className="video-provider">{providerLabel(item.video.provider)}</span>
          </button>
        )}
      </div>
    );
  }

  if (item.fileUrl) {
    return (
      <div className="detail-video">
        <video className="detail-native-video" src={item.fileUrl} controls preload="metadata" />
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
    <div className="x-post-embed" ref={hostRef} data-x-status={status}>
      <div className={`x-post-native ${status === "ready" ? "is-ready" : ""}`} ref={nativeRef} aria-hidden={status !== "ready"} />
      {status !== "ready" && <div className="x-post-fallback">{fallback}</div>}
    </div>
  );
}
