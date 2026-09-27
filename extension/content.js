// inkling collector (selection / image / video) — injected on invoke by
// background.ts, which then asks for a collect over runtime messaging.
//
// Collects v1 payloads (see extension/src/payload.ts for the contract; field
// names must match exactly). Validation and delivery happen background-side —
// this script only reads the page and keeps every read capped so capture stays
// instant.

const browserApi = globalThis.chrome ?? globalThis.browser;

// The worker re-injects this file on every capture. Register the listener once
// per page: a duplicate would answer the same collect request twice.
const firstInjection = !globalThis.__inklingCollectInstalled;
globalThis.__inklingCollectInstalled = true;

function readImage(requestedSrc) {
  // The worker passes the srcUrl Chrome reported for the right-clicked image.
  // Nothing is stashed from a contextmenu listener: this script is injected
  // after that event, so a stash would always be empty.
  const src = (requestedSrc || "").trim();
  if (!src) return null;
  // blob:/canvas sources cannot be fetched by the app; rasterize small ones
  // to a dataUrl fallback, capped at ~5MB. http(s) sources download directly
  // and never need this path.
  if (src.startsWith("blob:") || src.startsWith("data:image/")) {
    return { src, needsDataUrl: true };
  }
  return { src, needsDataUrl: false };
}

function readSelection() {
  const selection = window.getSelection();
  const selectedText = (selection ? selection.toString() : "").replace(/\s+/g, " ").trim().slice(0, 1500);
  let selectedHtml = "";
  try {
    if (selection && selection.rangeCount > 0 && selectedText) {
      const container = document.createElement("div");
      for (let i = 0; i < selection.rangeCount; i += 1) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }
      // Raw markup, capped. The app sanitizes it and falls back to the text.
      selectedHtml = container.innerHTML.slice(0, 20_000);
    }
  } catch {
    selectedHtml = "";
  }
  return { selectedText, selectedHtml };
}

function imageToDataUrl(url) {
  return fetch(url, { mode: "cors", credentials: "omit" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          if (blob.size > 5 * 1024 * 1024) {
            reject(new Error("image fallback exceeds the 5MB dataUrl cap"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("image fallback could not be encoded"));
          reader.readAsDataURL(blob);
        }),
    );
}

const VIDEO_PAGE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

function readVideo() {
  const host = window.location.hostname.toLowerCase();
  if (!VIDEO_PAGE_HOSTS.has(host)) return null;
  return window.location.href;
}

function handleCollectMessage(message, _sender, sendResponse) {
  if (!message || message.type !== "inkling/collect") return undefined;

  if (message.collect === "selection") {
    const { selectedText, selectedHtml } = readSelection();
    if (!selectedText && !selectedHtml.trim()) {
      sendResponse({ type: "inkling/capture-error", reason: "empty-selection" });
      return true;
    }
    sendResponse({
      type: "inkling/capture",
      payload: {
        kind: "selection",
        sourceUrl: window.location.href,
        selectedHtml,
        selectedText,
        title: document.title ? document.title.trim().slice(0, 240) : undefined,
      },
    });
    return true;
  }

  if (message.collect === "image") {
    const found = readImage(message.srcUrl);
    if (!found) {
      sendResponse({ type: "inkling/capture-error", reason: "no-image-source" });
      return true;
    }
    const payload = {
      kind: "image",
      pageUrl: window.location.href,
      srcUrl: found.src,
    };
    if (!found.needsDataUrl) {
      sendResponse({ type: "inkling/capture", payload });
      return true;
    }
    imageToDataUrl(found.src).then(
      (dataUrl) => sendResponse({ type: "inkling/capture", payload: { ...payload, dataUrl } }),
      () => sendResponse({ type: "inkling/capture-error", reason: "image-fallback-too-large" }),
    );
    return true;
  }

  if (message.collect === "video") {
    const sourceUrl = readVideo();
    if (!sourceUrl) {
      sendResponse({ type: "inkling/capture-error", reason: "not-a-video-page" });
      return true;
    }
    sendResponse({
      type: "inkling/capture",
      payload: {
        kind: "video",
        sourceUrl,
        title: document.title ? document.title.trim().slice(0, 240) : undefined,
      },
    });
    return true;
  }

  return undefined;
}

if (firstInjection) {
  browserApi?.runtime?.onMessage.addListener(handleCollectMessage);
}
