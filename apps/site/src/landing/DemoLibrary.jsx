import * as React from "react";
// This trusted same-origin renderer stays mounted from the first mask through interaction.
function syncRevealDocument(doc, active) {
  const root = doc?.documentElement;
  if (root) root.dataset.reveal = active ? "open" : "masked";
  return Boolean(root);
}
function prepareRevealDocument(doc) {
  if (!doc?.documentElement || !doc?.head) return false;
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
        ref={frame}
        title="Interactive inkling library"
        src="/demo/index.html"
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
        tabIndex={active ? 0 : -1}
        onLoad={ready}
      />
    </div>
  );
}
