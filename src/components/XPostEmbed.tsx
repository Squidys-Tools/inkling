import { useEffect, useRef, useState, type ReactNode } from "react";
import type { XPostMetadata } from "../lib/ingestion/types";
import { cx } from "../ui/cx";

declare global {
  interface Window {
    twttr?: { widgets?: { load: (element?: HTMLElement) => void } };
  }
}

let xWidgetsPromise: Promise<void> | undefined;

function loadXWidgets() {
  if (window.twttr?.widgets) return Promise.resolve();
  xWidgetsPromise ??= new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const checkReady = () => {
      if (window.twttr?.widgets) finish();
    };
    // Polled as well: a widgets script already on the page may have loaded
    // before these listeners attached.
    const pollId = window.setInterval(checkReady, 100);
    const timeoutId = window.setTimeout(() => finish(new Error("X widgets timed out.")), 15000);

    const existing = document.querySelector<HTMLScriptElement>("#twitter-wjs");
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      checkReady();
      window.setTimeout(checkReady, 0);
    };
    const handleError = () => finish(new Error("X widgets could not be loaded."));
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.id = "twitter-wjs";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      document.head.appendChild(script);
    }
    checkReady();
  });
  return xWidgetsPromise;
}

// The official iframe appearing is the readiness signal. Its load event can
// fire before a listener attaches, and a backgrounded preview stalls rAF.
function waitForXWidget(root: HTMLElement) {
  return new Promise<boolean>((resolve) => {
    const finish = (loaded: boolean) => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
      resolve(loaded);
    };
    const watchWidget = () => {
      if (root.querySelector("iframe")) finish(true);
    };
    const observer = new MutationObserver(watchWidget);
    const timeoutId = window.setTimeout(() => finish(false), 8000);
    observer.observe(root, { childList: true, subtree: true });
    watchWidget();
  });
}

export function XPostEmbed({ social, fallback }: { social: XPostMetadata; fallback: ReactNode }) {
  const nativeRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [embedHtml, setEmbedHtml] = useState(social.embedHtml);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  const [syncedEmbedHtml, setSyncedEmbedHtml] = useState(social.embedHtml);
  if (syncedEmbedHtml !== social.embedHtml) {
    setSyncedEmbedHtml(social.embedHtml);
    setEmbedHtml(social.embedHtml);
    setStatus(shouldLoad ? "loading" : "idle");
  }

  useEffect(() => {
    if (!shouldLoad) return;
    if (social.embedHtml) return;
    let cancelled = false;

    // Imported here so linkedom, which x-post parses with, stays out of the startup chunk.
    import("../lib/ingestion/x-post")
      .then(async ({ normalizeXPostOEmbed, xPostOEmbedUrl }) => {
        const response = await fetch(xPostOEmbedUrl(social.postUrl), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`X oEmbed returned HTTP ${response.status}.`);
        const payload = (await response.json()) as Parameters<typeof normalizeXPostOEmbed>[1];
        if (cancelled) return;
        const normalized = normalizeXPostOEmbed(social.postUrl, payload);
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
    if (!shouldLoad) return;
    const root = nativeRef.current;
    if (!root || !embedHtml) return;

    const updateEmbedWidth = () => {
      const width = Math.min(550, Math.max(280, Math.floor(root.getBoundingClientRect().width)));
      const iframe = root.querySelector<HTMLIFrameElement>("iframe");

      if (iframe) {
        // The iframe itself is width: 100%; changing its URL after X has
        // rendered causes the widget to reload and can create a resize loop.
        // Its document receives the new viewport width through the iframe box.
        return;
      }

      root
        .querySelector<HTMLElement>("blockquote.twitter-tweet")
        ?.setAttribute("data-width", String(width));
    };

    const resizeObserver = new ResizeObserver(updateEmbedWidth);
    resizeObserver.observe(root);
    let cancelled = false;
    // Imported here so DOMPurify stays out of the startup chunk.
    import("../lib/purifyHtml")
      .then(({ purifyHtml }) => {
        if (cancelled) return;
        root.innerHTML = purifyHtml(window, embedHtml, social.postUrl);
        updateEmbedWidth();
        return loadXWidgets();
      })
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
      resizeObserver.disconnect();
      root.replaceChildren();
    };
  }, [embedHtml, shouldLoad, social.postUrl]);

  return (
    <div className="relative size-full p-0" data-x-status={status}>
      <div
        className={cx(
          "absolute inset-0 size-full [&_iframe]:h-full! [&_iframe]:w-full!",
          status === "ready" ? "visible" : "invisible",
        )}
        ref={nativeRef}
        aria-hidden={status !== "ready"}
      />
      {status !== "ready" && (
        <div className="absolute inset-0 size-full">
          {fallback}
          {!shouldLoad && (
            <button
              type="button"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-border bg-transparent px-4 py-3 text-[12px] text-ink [transition:scale_0.16s_cubic-bezier(0.23,1,0.32,1),background-color_0.18s_ease,border-color_0.18s_ease] enabled:hover:border-[#4a4842] enabled:hover:bg-surface-raised enabled:active:scale-96 disabled:cursor-default disabled:opacity-50"
              onClick={() => {
                setShouldLoad(true);
                setStatus("loading");
              }}
            >
              Load post from X
            </button>
          )}
        </div>
      )}
    </div>
  );
}
