import { useEffect, useRef, useState, type ReactNode } from "react";
import { FRAME_ORIGINS, xPostFrameUrl } from "../lib/ingestion/frame-origins";
import type { XPostMetadata } from "../lib/ingestion/types";
import { cx } from "../ui/cx";

const FRAME_TIMEOUT_MS = 15000;

// X's frame reports over postMessage with the same methods widgets.js listens for.
function frameOutcome(data: unknown) {
  if (!data || typeof data !== "object" || !("twttr.embed" in data)) return null;
  const message = data["twttr.embed"];
  const method = message && typeof message === "object" && "method" in message && message.method;
  if (method === "twttr.private.rendered") return "ready";
  if (method === "twttr.private.no_results") return "failed";
  return null;
}

export function XPostEmbed({ social, fallback }: { social: XPostMetadata; fallback: ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    if (status !== "loading") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== FRAME_ORIGINS.x || event.source !== frameRef.current?.contentWindow) {
        return;
      }
      const outcome = frameOutcome(event.data);
      if (outcome) setStatus(outcome);
    };
    const timeoutId = window.setTimeout(() => setStatus("failed"), FRAME_TIMEOUT_MS);
    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [status]);

  const frameMounted = status === "loading" || status === "ready";
  return (
    <div className="relative size-full p-0" data-x-status={status}>
      {frameMounted && (
        <iframe
          ref={frameRef}
          src={xPostFrameUrl(social.postId)}
          title="Post from X"
          // oxlint-disable-next-line react/iframe-missing-sandbox -- X's frame is cross-origin: allow-same-origin keeps X's own origin for its CORS fetch and grants nothing in the app.
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          className={cx(
            "absolute inset-0 block size-full border-0",
            status === "ready" ? "visible" : "invisible",
          )}
          aria-hidden={status !== "ready"}
        />
      )}
      {status !== "ready" && (
        <div className="absolute inset-0 size-full">
          {fallback}
          {!frameMounted && (
            <button
              type="button"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-border bg-transparent px-4 py-3 text-[12px] text-ink [transition:scale_0.16s_cubic-bezier(0.23,1,0.32,1),background-color_0.18s_ease,border-color_0.18s_ease] enabled:hover:border-[#4a4842] enabled:hover:bg-surface-raised enabled:active:scale-96 disabled:cursor-default disabled:opacity-50"
              onClick={() => setStatus("loading")}
            >
              Load post from X
            </button>
          )}
        </div>
      )}
    </div>
  );
}
