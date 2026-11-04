import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useCallback, useEffect, useRef } from "react";

// This trusted same-origin renderer stays mounted from the first mask through interaction.
function syncRevealDocument(doc: Document | null | undefined, active: boolean, calm: boolean) {
  const root = doc?.documentElement;
  if (!root) return;
  root.dataset.revealMotion = calm ? "calm" : "full";
  root.dataset.reveal = active ? "open" : "masked";
}

// Hides the demo's search and view controls while the mask still covers them.
function prepareRevealDocument(doc: Document | null | undefined): doc is Document {
  if (!doc?.head || new URL(doc.URL).pathname !== "/demo/") return false;
  if (!doc.getElementById("embedded-reveal-chrome")) {
    const style = doc.createElement("style");
    style.id = "embedded-reveal-chrome";
    style.textContent = `label:has(input[type=search]),[aria-label="View options"]{transition:opacity 180ms ease-out}
      html[data-reveal=masked] label:has(input[type=search]),html[data-reveal=masked] [aria-label="View options"]{opacity:0;pointer-events:none}
      html[data-reveal-motion=calm] label:has(input[type=search]),html[data-reveal-motion=calm] [aria-label="View options"]{transition:none}
      @media(prefers-reduced-motion:reduce){label:has(input[type=search]),[aria-label="View options"]{transition:none}}`;
    doc.head.appendChild(style);
  }
  return true;
}

export function DemoLibrary({
  active,
  calm,
  loaded,
  onLoad,
}: {
  active: boolean;
  calm: boolean;
  loaded: boolean;
  onLoad: () => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const attachFrame = useCallback(
    (node: HTMLIFrameElement | null) => {
      frame.current = node;
      const doc = node?.contentDocument;
      // A prerendered iframe may finish before React attaches its load handler.
      if (doc?.readyState === "complete" && prepareRevealDocument(doc)) onLoad();
    },
    [onLoad],
  );
  useEffect(() => {
    if (loaded) syncRevealDocument(frame.current?.contentDocument, active, calm);
  }, [active, loaded, calm]);
  const ready = () => {
    const doc = frame.current?.contentDocument;
    if (!prepareRevealDocument(doc)) return;
    syncRevealDocument(doc, active, calm);
    onLoad();
  };
  return (
    <div
      aria-hidden={!active}
      inert={!active}
      {...stylex.props(styles.live, active && styles.active, !loaded && styles.loading)}
    >
      <iframe
        ref={attachFrame}
        title="Interactive inkling library"
        src="/demo/"
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        tabIndex={active ? 0 : -1}
        onLoad={ready}
        {...stylex.props(styles.frame)}
      />
    </div>
  );
}

const styles = stylex.create({
  live: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: "inherit",
    clipPath: "url(#inkling-live-window)",
    pointerEvents: "none",
  },
  active: { pointerEvents: "auto" },
  loading: { visibility: "hidden" },
  frame: {
    boxSizing: "border-box",
    display: "block",
    width: "100%",
    height: "100%",
    borderStyle: "none",
    borderRadius: "inherit",
    backgroundColor: landingColor.demo,
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.ink}` },
    outlineOffset: { default: null, ":focus-visible": "5px" },
  },
});
