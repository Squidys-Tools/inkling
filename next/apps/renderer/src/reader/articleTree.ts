import createDOMPurify, { type WindowLike } from "dompurify";
import { applyEmbedPolicy } from "@inkling/ingestion/embeds";
import { FRAME_ORIGINS } from "@inkling/ingestion/frame-origins";

// Tags the reader draws, each with its own style in ArticleContent.
const STYLED = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "figure",
  "figcaption",
  "hr",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "video",
  "audio",
  "source",
  "iframe",
  "dl",
  "dt",
  "dd",
] as const;

// Tags kept for their meaning or their block structure, drawn with the browser's defaults.
const PLAIN = [
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "address",
  "details",
  "summary",
  "span",
  "em",
  "i",
  "strong",
  "b",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "small",
  "sub",
  "sup",
  "abbr",
  "cite",
  "q",
  "kbd",
  "samp",
  "var",
  "dfn",
  "time",
  "br",
  "wbr",
] as const;

// Dropped with everything inside them: nothing in them reads as article text.
const DROPPED = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "math",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "canvas",
  "object",
  "embed",
  "head",
  "title",
  "meta",
  "link",
]);

export type ArticleTag = (typeof STYLED)[number] | (typeof PLAIN)[number];
const KEPT = new Set<string>([...STYLED, ...PLAIN]);
const isArticleTag = (name: string): name is ArticleTag => KEPT.has(name);

// Whitespace between rows or items is not content, and React refuses it inside a table.
const NO_TEXT = new Set(["table", "thead", "tbody", "tfoot", "tr", "ul", "ol", "dl"]);

/** Every attribute that can reach the page, by its React name. */
export type ArticleProps = {
  title?: string;
  dir?: "ltr" | "rtl" | "auto";
  href?: string;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  loading?: "lazy";
  decoding?: "async";
  referrerPolicy?: "strict-origin-when-cross-origin";
  poster?: string;
  controls?: boolean;
  preload?: "none";
  type?: string;
  start?: number;
  reversed?: boolean;
  value?: number;
  colSpan?: number;
  rowSpan?: number;
  dateTime?: string;
};
export type ArticleElement = {
  tag: ArticleTag;
  props: ArticleProps;
  children: ArticleNode[];
  /** The opening paragraph the capture marked with `article-lede`. */
  lede: boolean;
};
export type ArticleNode = string | ArticleElement;

const integer = (value: string | null) => {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 100_000 ? parsed : undefined;
};

const isFrameUrl = (url: string) =>
  Object.values(FRAME_ORIGINS).some((origin) => url.startsWith(`${origin}/`));

// Only these attributes reach React, each checked for its tag. URLs have already
// been through the embed policy, which keeps http(s) links and allowlisted players.
function propsFor(element: Element, tag: ArticleTag, parent: string): ArticleProps | null {
  const props: ArticleProps = {};
  const attribute = (name: string) => element.getAttribute(name) || undefined;
  const number = (name: string) => integer(element.getAttribute(name));
  const direction = attribute("dir");
  if (direction === "ltr" || direction === "rtl" || direction === "auto") props.dir = direction;
  props.title = attribute("title");
  switch (tag) {
    case "a":
      props.href = attribute("href");
      break;
    case "img":
      props.src = attribute("src");
      props.alt = attribute("alt");
      props.width = number("width");
      props.height = number("height");
      if (!props.src) return null;
      props.loading = "lazy";
      props.decoding = "async";
      break;
    case "iframe": {
      const src = attribute("src");
      if (!src || !isFrameUrl(src)) return null;
      props.src = src;
      props.loading = "lazy";
      // YouTube refuses to play without a referrer (its error 153); the origin is all this sends.
      props.referrerPolicy = "strict-origin-when-cross-origin";
      break;
    }
    case "video":
      props.poster = attribute("poster");
      props.src = attribute("src");
      props.controls = true;
      // Remote media loads nothing until the user plays it.
      props.preload = "none";
      break;
    case "audio":
      props.src = attribute("src");
      props.controls = true;
      props.preload = "none";
      break;
    case "source":
      if (parent !== "video" && parent !== "audio") return null;
      props.src = attribute("src");
      props.type = attribute("type");
      if (!props.src) return null;
      break;
    case "ol":
      props.start = number("start");
      if (element.hasAttribute("reversed")) props.reversed = true;
      break;
    case "li":
      props.value = number("value");
      break;
    case "td":
    case "th":
      props.colSpan = number("colspan");
      props.rowSpan = number("rowspan");
      break;
    case "time":
      props.dateTime = attribute("datetime");
      break;
  }
  return props;
}

const isElement = (node: Node): node is Element => node.nodeType === 1;

function convertChildren(parent: ParentNode, parentTag: string): ArticleNode[] {
  const nodes: ArticleNode[] = [];
  for (const child of parent.childNodes) {
    if (child.nodeType === 3) {
      const value = child.textContent ?? "";
      if (value && !(NO_TEXT.has(parentTag) && !value.trim())) nodes.push(value);
      continue;
    }
    if (!isElement(child)) continue;
    const name = child.localName;
    if (DROPPED.has(name)) continue;
    if (!isArticleTag(name)) {
      // An unknown wrapper (a <picture>, a custom element) gives way to its content.
      nodes.push(...convertChildren(child, parentTag));
      continue;
    }
    const props = propsFor(child, name, parentTag);
    if (!props) continue;
    const children =
      name === "img" || name === "hr" || name === "br" || name === "wbr" || name === "iframe"
        ? []
        : convertChildren(child, name);
    const playable =
      props.src || children.some((node) => typeof node !== "string" && node.tag === "source");
    if ((name === "video" || name === "audio") && !playable) continue;
    nodes.push({
      tag: name,
      props,
      children,
      lede: name === "p" && child.classList.contains("article-lede"),
    });
  }
  return nodes;
}

/**
 * The trust boundary for stored article HTML. Stored HTML also comes from
 * extension captures, imports and older versions, so capture-time cleanup is
 * never enough. DOMPurify needs a spec-compliant DOM (on linkedom it returns
 * its input unchanged), and only allowlisted tags and attributes come out.
 */
export function articleTree(window: WindowLike, html: string, pageUrl: string): ArticleNode[] {
  const purify = createDOMPurify(window);
  if (!purify.isSupported) throw new Error("articleTree needs a spec-compliant DOM");
  purify.addHook("afterSanitizeAttributes", (node) => applyEmbedPolicy(node, pageUrl));
  const fragment = purify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    FORBID_TAGS: ["form", "style", "template"],
    ADD_FORBID_CONTENTS: ["form"],
    FORBID_ATTR: ["style", "srcset", "popover", "popovertarget", "popovertargetaction"],
    RETURN_DOM_FRAGMENT: true,
  });
  return convertChildren(fragment, "article");
}
