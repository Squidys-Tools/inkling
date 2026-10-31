import createDOMPurify, { type WindowLike } from "dompurify";
import { applyEmbedPolicy } from "./ingestion/embeds";

// Saved pages could reuse the app's utility classes to draw over its UI, so
// only classes the reader stylesheet styles survive.
const KEPT_CLASSES = new Set(["article-lede"]);

/**
 * The trust boundary for stored article HTML, run right before it reaches the
 * DOM. Stored HTML also comes from extension captures, imports and older
 * versions, so capture-time cleanup is never enough on its own. It needs the
 * renderer's real DOM: on linkedom DOMPurify returns its input unchanged.
 */
export function purifyHtml(window: WindowLike, html: string, pageUrl: string): string {
  const purify = createDOMPurify(window);
  // An unsupported DOM makes sanitize() return its input unchanged.
  if (!purify.isSupported) throw new Error("purifyHtml needs a spec-compliant DOM");
  purify.addHook("afterSanitizeAttributes", (node) => {
    applyEmbedPolicy(node, pageUrl);
    // The main window opens target=_blank links in the browser and refuses other
    // navigation. Any other target could name an embedded frame and redirect it.
    if (node.hasAttribute("target")) {
      if (node.getAttribute("target") === "_blank") node.setAttribute("rel", "noopener noreferrer");
      else node.removeAttribute("target");
    }
    if (node.localName === "iframe") node.removeAttribute("name");
    if (node.hasAttribute("class")) {
      const kept = [...node.classList].filter((name) => KEPT_CLASSES.has(name));
      if (kept.length > 0) node.setAttribute("class", kept.join(" "));
      else node.removeAttribute("class");
    }
  });
  return purify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["form", "style", "template"],
    ADD_FORBID_CONTENTS: ["form"],
    FORBID_ATTR: ["style", "srcset", "popover", "popovertarget", "popovertargetaction"],
  });
}
