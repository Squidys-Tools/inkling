import createDOMPurify, { type WindowLike } from "dompurify";
import { embedCandidate } from "./ingestion/embeds";
import { normalizeHttpUrl } from "./ingestion/url";

const URL_ATTRIBUTES = ["href", "src", "poster", "cite"];

/**
 * The trust boundary for stored article and X embed HTML, run right before it
 * reaches the DOM. Stored HTML also comes from extension captures, imports and
 * older versions, so capture-time cleanup is never enough on its own. It needs
 * the renderer's real DOM: on linkedom DOMPurify returns its input unchanged.
 */
export function purifyHtml(window: WindowLike, html: string, pageUrl: string): string {
  const purify = createDOMPurify(window);
  purify.addHook("afterSanitizeAttributes", (node) => {
    for (const name of URL_ATTRIBUTES) {
      const raw = node.getAttribute(name);
      if (!raw) continue;
      const url = normalizeHttpUrl(raw, pageUrl);
      if (url) node.setAttribute(name, url);
      else node.removeAttribute(name);
    }

    const tagName = node.nodeName.toLowerCase();
    if (tagName === "iframe") {
      const candidate = embedCandidate(node.getAttribute("src"), "iframe", pageUrl);
      if (!candidate) {
        node.remove();
        return;
      }
      node.setAttribute("src", candidate.embedUrl);
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
      return;
    }

    const mediaParent = node.parentElement?.nodeName.toLowerCase();
    const inMedia = mediaParent === "video" || mediaParent === "audio";
    if (tagName !== "video" && tagName !== "audio" && !(tagName === "source" && inMedia)) return;
    const src = node.getAttribute("src");
    const kind = tagName === "audio" || mediaParent === "audio" ? "audio" : "video";
    if (src && !embedCandidate(src, kind, pageUrl)) {
      if (tagName === "source") node.remove();
      else node.removeAttribute("src");
    }
  });
  return purify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    // The main window opens target=_blank links in the browser and refuses other navigation.
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["form", "style", "template"],
    ADD_FORBID_CONTENTS: ["form"],
    FORBID_ATTR: ["style", "srcset"],
  });
}
