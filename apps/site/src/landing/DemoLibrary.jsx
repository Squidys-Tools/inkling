import * as React from "react";
// This trusted same-origin renderer stays mounted from the first mask through interaction.
function syncRevealDocument(doc, active) {
  const root = doc?.documentElement;
  if (root) root.dataset.reveal = active ? "open" : "masked";
  return Boolean(root);
}
function prepareRevealDocument(doc) {
  if (!doc?.documentElement || !doc?.head || new URL(doc.URL).pathname !== "/demo/") return false;
  if (!doc.getElementById("embedded-reveal-chrome")) {
    const style = doc.createElement("style");
    style.id = "embedded-reveal-chrome";
    style.textContent =
      'html[data-reveal=masked] label:has(input[type=search]),html[data-reveal=masked] [aria-label="View options"]{opacity:0;pointer-events:none}';
    doc.head.appendChild(style);
  }
  return true;
}
export function DemoLibrary({ active }) {
  const [loaded, setLoaded] = React.useState(false),
    frame = React.useRef(null);
  const attachFrame = React.useCallback((node) => {
    frame.current = node;
    const doc = node?.contentDocument;
    // A prerendered iframe may finish before React attaches its load handler.
    if (doc && new URL(doc.URL).pathname === "/demo/" && doc.readyState === "complete") {
      if (prepareRevealDocument(doc)) setLoaded(true);
    }
  }, []);
  React.useEffect(() => {
    if (loaded) syncRevealDocument(frame.current?.contentDocument, active);
  }, [active, loaded]);
  const ready = () => {
    const doc = frame.current?.contentDocument;
    if (!prepareRevealDocument(doc)) return;
    syncRevealDocument(doc, active);
    setLoaded(true);
  };
  return (
    <div
      className="live-library"
      data-active={active}
      data-loaded={loaded}
      aria-hidden={!active}
      inert={!active}
      style={{ clipPath: "url(#inkling-live-window)" }}
    >
      <iframe
        ref={attachFrame}
        title="Interactive inkling library"
        src="/demo/"
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        tabIndex={active ? 0 : -1}
        onLoad={ready}
      />
    </div>
  );
}
