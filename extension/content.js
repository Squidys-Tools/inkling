// inkling content script — Phase 3 collectors (selection / image / video).
//
// Collects v1 payloads (see extension/src/payload.ts for the contract; field
// names must match exactly) and replies to the background worker. Validation
// and deep-link encoding happen background-side in payload.ts — this script
// only reads the page and keeps every read capped so capture stays instant.
//
// Manifest wiring (mechanical, owned by the manifest author):
//   "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
// plus the "contextMenus" permission for the background worker.

// Last right-clicked image: contextmenu fires before the worker's onClicked,
// so stash the target here for the later collect request.
let lastContextImage = null;

function imageFromElement(element) {
  if (!element) return null;
  if (element.tagName === "IMG") return element;
  return element.closest ? element.closest("img") : null;
}

document.addEventListener(
  "contextmenu",
  (event) => {
    const image = imageFromElement(event.target);
    lastContextImage = image
      ? { src: image.currentSrc || image.src || "", alt: image.getAttribute("alt") || "" }
      : null;
  },
  true,
);

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

function readImage(requestedSrc) {
  const fromMenu = lastContextImage;
  const src = (requestedSrc || (fromMenu && fromMenu.src) || "").trim();
  if (!src) return null;
  const alt = ((fromMenu && fromMenu.alt) || "").replace(/\s+/g, " ").trim().slice(0, 240);
  // blob:/canvas sources cannot be fetched by the app; rasterize small ones
  // to a dataUrl fallback, capped at ~5MB. http(s) sources download directly
  // and never need this path.
  if (src.startsWith("blob:") || src.startsWith("data:image/")) {
    return { src, alt, needsDataUrl: true };
  }
  return { src, alt, needsDataUrl: false };
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

const browserApi = globalThis.chrome ?? globalThis.browser;

browserApi?.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
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
      ...(found.alt ? { alt: found.alt } : {}),
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
    sendResponse({ type: "inkling/capture", payload: { kind: "video", sourceUrl } });
    return true;
  }

  return undefined;
});
