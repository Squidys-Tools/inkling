import { ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, itemColor, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { hostname, webUrl } from "../library/assets.ts";
import { useStepBack } from "../item/navigation.ts";
import { useItem } from "../item/queries.ts";
import { useEscape } from "../item/useEscape.ts";
import { ArticleContent } from "./ArticleContent.tsx";
import { articleTree } from "./articleTree.ts";
import { FontPicker } from "./FontPicker.tsx";
import { registerFontSet } from "./fonts.ts";
import { fontSetTheme, uprightQuotes, useFontSet } from "./fontSets.ts";
import { reader } from "./readerTheme.stylex.ts";

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const longDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

// Extractors store dates in many shapes; one that does not parse is shown as written.
function published(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : longDate(date);
}

/** A saved article in a distraction-free page: its sanitized text, a typeface, and the way back. */
export function ReaderView({ id }: { id: string }) {
  const navigate = useNavigate();
  const stepBack = useStepBack();
  const [fontSet, setFontSet] = useFontSet();
  useEffect(() => registerFontSet(fontSet), [fontSet]);
  const query = useItem(id);
  const detail = query.value;
  const close = () =>
    stepBack(() => void navigate({ to: "/item/$id", params: { id }, replace: true }));
  useEscape(close);

  const html = nonEmpty(detail?.metadata.html);
  const sourceUrl = webUrl(detail?.sourceUrl);
  const nodes = html ? articleTree(window, html, sourceUrl ?? "") : null;
  const byline = detail
    ? [
        nonEmpty(detail.metadata.author),
        published(nonEmpty(detail.metadata.publishedDate)) ??
          `Saved ${longDate(new Date(detail.createdAt))}`,
      ].filter((part) => part !== undefined)
    : [];
  const status =
    query.error ??
    (detail === null
      ? "This item is no longer in your library."
      : detail && !nodes
        ? "This item has no saved article to read."
        : null);

  return (
    <div
      data-escape-scope
      role="document"
      aria-label={detail?.title ?? "Reader"}
      {...stylex.props(styles.reader, fontSetTheme(fontSet))}
    >
      <div aria-hidden="true" {...stylex.props(styles.wash)} />
      <button
        type="button"
        aria-label="Close reader"
        title="Close reader"
        onClick={close}
        {...stylex.props(styles.close)}
      >
        <span {...stylex.props(styles.esc)}>Esc</span>
        <HugeiconsIcon icon={Cancel01Icon} size={16} />
      </button>
      <div {...stylex.props(styles.scroll)}>
        {status && (
          <p role="alert" {...stylex.props(styles.status)}>
            {status}
          </p>
        )}
        {detail && nodes && (
          <article {...stylex.props(styles.page)}>
            <header {...stylex.props(styles.header)}>
              <h1 {...stylex.props(styles.title)}>
                {detail.title || hostname(sourceUrl) || "Untitled"}
              </h1>
              {byline.length > 0 && <p {...stylex.props(styles.byline)}>{byline.join("  ·  ")}</p>}
            </header>
            <ArticleContent nodes={nodes} uprightQuotes={uprightQuotes(fontSet)} />
            {sourceUrl && (
              <footer {...stylex.props(styles.footer)}>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(styles.source)}
                >
                  Continue reading at {hostname(sourceUrl) ?? sourceUrl}
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
                </a>
              </footer>
            )}
          </article>
        )}
      </div>
      <FontPicker value={fontSet} onChange={setFontSet} />
    </div>
  );
}

const fade = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(22px) scale(0.985)" },
  to: { opacity: 1, transform: "none" },
});
const wash = stylex.keyframes({
  "0%": { opacity: 0, transform: "scale(0.4)" },
  "30%": { opacity: 1 },
  "100%": { opacity: 0, transform: "scale(1.8)" },
});

const styles = stylex.create({
  reader: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    overflow: "hidden",
    backgroundColor: color.frame,
    color: color.ink,
    animationName: fade,
    animationDuration: motion.layout,
    animationTimingFunction: motion.standard,
  },
  wash: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage: `radial-gradient(circle 340px at 50% 30%, ${itemColor.accentGlow}, transparent 70%)`,
    opacity: 0,
    animationName: { default: wash, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.2s",
    animationTimingFunction: "ease-out",
  },
  close: {
    position: "absolute",
    top: space.s4,
    right: "clamp(16px, 3vw, 32px)",
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    height: "32px",
    paddingLeft: "5px",
    paddingRight: "7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":hover": color.muted },
    borderRadius: radius.control,
    backgroundColor: color.surface,
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
    transitionProperty: "color, border-color",
    transitionDuration: motion.micro,
  },
  esc: {
    paddingBlock: "3px",
    paddingInline: "7px",
    borderRadius: "5px",
    backgroundColor: color.raised,
    fontFamily: font.body,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  scroll: {
    position: "relative",
    height: "100%",
    overflowY: "auto",
    maskImage:
      "linear-gradient(to bottom, transparent 0, black 120px, black calc(100% - 110px), transparent 100%)",
  },
  status: {
    maxWidth: "720px",
    marginInline: "auto",
    marginTop: "20vh",
    fontSize: text.lg,
    color: color.muted,
    textAlign: "center",
  },
  page: {
    maxWidth: "720px",
    marginInline: "auto",
    paddingTop: "clamp(30px, 6vh, 56px)",
    paddingInline: "clamp(20px, 5vw, 44px)",
    paddingBottom: "120px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "0.85s",
    animationTimingFunction: "cubic-bezier(0.2, 0.75, 0.25, 1)",
    animationDelay: "0.1s",
    animationFillMode: "both",
  },
  header: { marginBottom: "clamp(30px, 6vh, 54px)" },
  title: {
    margin: 0,
    fontFamily: reader.heading,
    fontSize: "clamp(30px, 4.6vw, 42px)",
    fontWeight: reader.headingWeight,
    lineHeight: 1.14,
    letterSpacing: reader.headingTracking,
    color: color.ink,
    textWrap: "balance",
  },
  byline: {
    marginTop: space.s4,
    marginBottom: 0,
    fontFamily: reader.meta,
    fontSize: text.sm,
    letterSpacing: "0.03em",
    color: color.muted,
    whiteSpace: "pre-wrap",
  },
  footer: {
    marginTop: "clamp(44px, 8vh, 70px)",
    paddingTop: "26px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
    textAlign: "center",
  },
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    paddingBlock: "11px",
    paddingInline: "18px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":hover": color.accent },
    borderRadius: radius.round,
    backgroundColor: color.surface,
    fontFamily: reader.meta,
    fontSize: text.md,
    color: color.ink,
    textDecoration: "none",
    transitionProperty: "border-color, transform",
    transitionDuration: motion.micro,
    transform: { default: "none", ":hover": "translateY(-1px)" },
  },
});
