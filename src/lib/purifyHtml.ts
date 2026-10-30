import createDOMPurify, { type WindowLike } from "dompurify";
import { applyEmbedPolicy } from "./ingestion/embeds";

/**
 * The trust boundary for stored article and X embed HTML, run right before it
 * reaches the DOM. Stored HTML also comes from extension captures, imports and
 * older versions, so capture-time cleanup is never enough on its own. It needs
 * the renderer's real DOM: on linkedom DOMPurify returns its input unchanged.
 */
export function purifyHtml(window: WindowLike, html: string, pageUrl: string): string {
  const purify = createDOMPurify(window);
  purify.addHook("afterSanitizeAttributes", (node) => applyEmbedPolicy(node, pageUrl));
  return purify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    // The main window opens target=_blank links in the browser and refuses other navigation.
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["form", "style", "template"],
    ADD_FORBID_CONTENTS: ["form"],
    FORBID_ATTR: ["style", "srcset"],
  });
}
