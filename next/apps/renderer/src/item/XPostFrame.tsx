import * as stylex from "@stylexjs/stylex";
import { FRAME_ORIGINS, xPostFrameUrl } from "@inkling/ingestion/frame-origins";
import { Button } from "@inkling/ui";
import { space } from "@inkling/ui/tokens.stylex";
import { type ReactNode, useEffect, useRef, useState } from "react";

const FRAME_TIMEOUT_MS = 15_000;

// X's frame reports over postMessage with the methods its widgets.js listens for.
function frameOutcome(data: unknown) {
  if (!data || typeof data !== "object" || !("twttr.embed" in data)) return null;
  const message = data["twttr.embed"];
  const method = message && typeof message === "object" && "method" in message && message.method;
  if (method === "twttr.private.rendered") return "ready";
  if (method === "twttr.private.no_results") return "failed";
  return null;
}

/** X's own post frame, loaded only when asked; the drawn post stands in until it renders. */
export function XPostFrame({ postId, fallback }: { postId: string; fallback: ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    if (status !== "loading") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== FRAME_ORIGINS.x || event.source !== frameRef.current?.contentWindow)
        return;
      const outcome = frameOutcome(event.data);
      if (outcome) setStatus(outcome);
    };
    const timeout = window.setTimeout(() => setStatus("failed"), FRAME_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [status]);

  const mounted = status === "loading" || status === "ready";
  return (
    <div {...stylex.props(styles.box)}>
      {mounted && (
        <iframe
          ref={frameRef}
          src={xPostFrameUrl(postId)}
          title="Post from X"
          // oxlint-disable-next-line react/iframe-missing-sandbox -- X's frame is cross-origin: allow-same-origin keeps X's own origin for its CORS fetch and grants nothing in the app.
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          aria-hidden={status !== "ready"}
          {...stylex.props(styles.layer, styles.frame, status !== "ready" && styles.hidden)}
        />
      )}
      {status !== "ready" && (
        <div {...stylex.props(styles.layer)}>
          {fallback}
          {!mounted && (
            <Button variant="primary" style={styles.load} onClick={() => setStatus("loading")}>
              {status === "failed" ? "Try loading from X again" : "Load post from X"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const styles = stylex.create({
  box: { position: "relative", width: "100%", height: "100%" },
  layer: { position: "absolute", inset: 0 },
  frame: { display: "block", width: "100%", height: "100%", borderWidth: 0 },
  hidden: { visibility: "hidden" },
  load: { position: "absolute", bottom: space.s4, left: "50%", translate: "-50% 0" },
});
