import * as stylex from "@stylexjs/stylex";
import { FRAME_ORIGINS, xPostFrameUrl } from "@inkling/ingestion/frame-origins";
import { Button } from "@inkling/ui";
import { cardColor, space } from "@inkling/ui/tokens.stylex";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { frameMessage } from "./xFrameMessage.ts";

const FRAME_TIMEOUT_MS = 15_000;

/**
 * A post on the item stage at X's own width and its own height. With a post id, X's frame
 * loads only when asked and the drawn post stands in until it renders.
 */
export function XPostFrame({ postId, fallback }: { postId?: string; fallback: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [height, setHeight] = useState<number | null>(null);
  const mounted = status === "loading" || status === "ready";

  useEffect(() => {
    if (!mounted) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== FRAME_ORIGINS.x || event.source !== frameRef.current?.contentWindow)
        return;
      const message = frameMessage(event.data);
      if (!message) return;
      if (message.height !== undefined) setHeight(message.height);
      else if (status === "loading") {
        // Until X reports its height, the frame keeps the drawn post's.
        setHeight((known) => known ?? boxRef.current?.offsetHeight ?? null);
        setStatus(message.outcome);
      }
    };
    const timeout =
      status === "loading" ? window.setTimeout(() => setStatus("failed"), FRAME_TIMEOUT_MS) : 0;
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [mounted, status]);

  const shown = status === "ready";
  return (
    <div {...stylex.props(styles.column)}>
      <div ref={boxRef} {...stylex.props(styles.box, shown && styles.bare)}>
        {postId && mounted && (
          <iframe
            ref={frameRef}
            src={xPostFrameUrl(postId)}
            title="Post from X"
            // oxlint-disable-next-line react/iframe-missing-sandbox -- X's frame is cross-origin: allow-same-origin keeps X's own origin for its CORS fetch and grants nothing in the app.
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
            // As widgets.js sets it: without it the frame scrolls itself and X lays out narrower.
            scrolling="no"
            aria-hidden={!shown}
            {...stylex.props(styles.frame, shown ? styles.frameHeight(height ?? 0) : styles.hidden)}
          />
        )}
        {!shown && fallback}
      </div>
      {postId && !mounted && (
        <Button variant="primary" onClick={() => setStatus("loading")}>
          {status === "failed" ? "Try loading from X again" : "Load post from X"}
        </Button>
      )}
    </div>
  );
}

const styles = stylex.create({
  // X's embed is at most 550px wide.
  column: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space.s4,
    width: "min(100%, 550px)",
    maxHeight: "100%",
    minHeight: 0,
  },
  box: {
    position: "relative",
    flexShrink: 1,
    width: "100%",
    minHeight: 0,
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `${cardColor.postRule} transparent`,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.postRule,
    borderRadius: "16px",
    backgroundColor: cardColor.postPaper,
  },
  // X's frame draws its own edge and paper.
  bare: { borderColor: "transparent", backgroundColor: "transparent" },
  frame: { display: "block", width: "100%", borderWidth: 0 },
  frameHeight: (height: number) => ({ height: `${height}px` }),
  // Laid out, not hidden: X does not finish rendering a frame it cannot see.
  hidden: { position: "absolute", inset: 0, height: "100%", opacity: 0, pointerEvents: "none" },
});
