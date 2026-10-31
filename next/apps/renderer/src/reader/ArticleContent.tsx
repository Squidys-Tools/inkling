import * as stylex from "@stylexjs/stylex";
import { color, font, itemColor } from "@inkling/ui/tokens.stylex";
import { createElement, type ReactNode } from "react";
import type { ArticleElement, ArticleNode, ArticleTag } from "./articleTree.ts";
import { reader } from "./readerTheme.stylex.ts";

// Each tag carries its own style, chosen here from its parent and its previous
// sibling, so the reader needs no descendant selectors. Children are passed as
// arguments rather than an array, which is why they need no keys.
type Context = { parent: ArticleTag | null; uprightQuotes: boolean };

function renderNodes(nodes: readonly ArticleNode[], context: Context): ReactNode[] {
  let afterLede = false;
  return nodes.map((node) => {
    if (typeof node === "string") return node;
    const rendered = renderElement(node, context, afterLede);
    afterLede = node.lede;
    return rendered;
  });
}

function renderElement(node: ArticleElement, context: Context, afterLede: boolean) {
  const { parent, uprightQuotes } = context;
  const { className, style } = stylex.props(
    BLOCKS.has(node.tag) && styles.flow,
    tagStyles[node.tag],
    node.tag === "blockquote" && uprightQuotes && styles.uprightQuote,
    node.tag === "p" && parent === "blockquote" && styles.quoteParagraph,
    node.tag === "code" && parent === "pre" && styles.blockCode,
    node.lede && styles.lede,
    afterLede && styles.afterLede,
  );
  // Links open in the browser, which the main window does for target=_blank and nothing else.
  const link = node.tag === "a" ? { target: "_blank", rel: "noopener noreferrer" } : null;
  return createElement(
    node.tag,
    { ...node.props, ...link, className, style },
    ...renderNodes(node.children, { parent: node.tag, uprightQuotes }),
  );
}

/** Sanitized article content, drawn as React elements with the reader's styles. */
export function ArticleContent({
  nodes,
  uprightQuotes,
}: {
  nodes: readonly ArticleNode[];
  uprightQuotes: boolean;
}) {
  return createElement(
    "div",
    stylex.props(styles.content),
    ...renderNodes(nodes, { parent: null, uprightQuotes }),
  );
}

const BLOCKS = new Set<ArticleTag>([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "figure",
  "table",
  "dl",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "address",
  "details",
]);

const styles = stylex.create({
  content: {
    fontFamily: reader.body,
    fontSize: reader.bodySize,
    lineHeight: 1.75,
    color: color.ink,
    overflowWrap: "break-word",
  },
  // Blocks are spaced from the block before them, never from their container's edge.
  // Styles below set marginTop, not marginBlock, since StyleX ranks a longhand above a shorthand.
  flow: { marginTop: { default: "1.15em", ":first-child": 0 }, marginBottom: 0 },
  p: { marginInline: 0 },
  lede: { fontSize: "1.18em", lineHeight: 1.6, color: color.muted },
  afterLede: { marginTop: "1.4em" },
  a: {
    color: color.accentStrong,
    textDecorationLine: "underline",
    textDecorationColor: { default: itemColor.linkRule, ":hover": color.accentStrong },
    textUnderlineOffset: "3px",
  },
  heading: {
    marginTop: { default: "2em", ":first-child": 0 },
    marginBottom: "0.6em",
    marginInline: 0,
    fontFamily: reader.heading,
    fontWeight: reader.headingWeight,
    lineHeight: 1.22,
    letterSpacing: reader.headingTracking,
    color: color.ink,
  },
  h1: { fontSize: "1.55em" },
  h2: { fontSize: "1.35em" },
  h3: { fontSize: "1.15em" },
  h4: { fontSize: "1em" },
  list: { marginInline: 0, paddingLeft: "1.5em", fontFamily: reader.list },
  li: { marginBlock: "0.4em", "::marker": { color: color.accent } },
  blockquote: {
    marginTop: { default: "1.4em", ":first-child": 0 },
    marginBottom: "1.4em",
    marginInline: 0,
    paddingBlock: "0.35em",
    paddingRight: 0,
    paddingLeft: "1.4em",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: color.accent,
    backgroundColor: reader.quoteBackground,
    fontFamily: reader.quote,
    fontSize: "1.08em",
    fontStyle: "italic",
    lineHeight: 1.65,
  },
  uprightQuote: { fontSize: "1em", fontStyle: "normal" },
  quoteParagraph: { marginTop: "0.35em", marginBottom: "0.35em" },
  media: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    marginBlock: "1.6em",
    marginInline: "auto",
    borderRadius: "10px",
  },
  iframe: { width: "100%", aspectRatio: "16 / 9", borderWidth: 0 },
  audio: { display: "block", width: "100%", marginBlock: "1.6em" },
  figure: {
    marginTop: { default: "1.6em", ":first-child": 0 },
    marginBottom: "1.6em",
    marginInline: 0,
  },
  figcaption: {
    marginTop: "0.6em",
    fontFamily: reader.meta,
    fontSize: "12px",
    textAlign: "center",
    color: color.muted,
  },
  pre: {
    overflowX: "auto",
    marginTop: { default: "1.4em", ":first-child": 0 },
    marginBottom: "1.4em",
    marginInline: 0,
    paddingBlock: "1em",
    paddingInline: "1.2em",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: "10px",
    backgroundColor: color.raised,
    fontFamily: font.mono,
    fontSize: "0.82em",
    lineHeight: 1.6,
  },
  code: {
    paddingBlock: "0.1em",
    paddingInline: "0.35em",
    borderRadius: "4px",
    backgroundColor: color.raised,
    fontFamily: font.mono,
    fontSize: "0.85em",
  },
  blockCode: { padding: 0, backgroundColor: "transparent" },
  hr: {
    width: "88px",
    marginBlock: "2.4em",
    marginInline: "auto",
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  table: {
    width: "100%",
    marginTop: { default: "1.6em", ":first-child": 0 },
    marginBottom: "1.6em",
    borderCollapse: "collapse",
    fontSize: "0.92em",
  },
  cell: {
    paddingBlock: "0.5em",
    paddingInline: "0.7em",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    textAlign: "left",
  },
  caption: { fontFamily: reader.meta, fontSize: "12px", color: color.muted },
  dt: { fontWeight: 600 },
  dd: { marginLeft: "1.5em" },
});

const tagStyles: Partial<Record<ArticleTag, stylex.StyleXStyles>> = {
  p: styles.p,
  a: styles.a,
  h1: [styles.heading, styles.h1],
  h2: [styles.heading, styles.h2],
  h3: [styles.heading, styles.h3],
  h4: [styles.heading, styles.h4],
  h5: [styles.heading, styles.h4],
  h6: [styles.heading, styles.h4],
  ul: styles.list,
  ol: styles.list,
  li: styles.li,
  blockquote: styles.blockquote,
  img: styles.media,
  video: styles.media,
  audio: styles.audio,
  iframe: [styles.media, styles.iframe],
  figure: styles.figure,
  figcaption: styles.figcaption,
  pre: styles.pre,
  code: styles.code,
  hr: styles.hr,
  table: styles.table,
  th: styles.cell,
  td: styles.cell,
  caption: styles.caption,
  dt: styles.dt,
  dd: styles.dd,
};
