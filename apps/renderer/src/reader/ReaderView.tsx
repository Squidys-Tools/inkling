import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import LinkSquare02Icon from "@hugeicons/core-free-icons/LinkSquare02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { IconButton } from "@inkling/ui";
import { color, font, itemColor, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { controlsOnRight } from "../desktop.ts";
import { hostname, webUrl } from "../library/assets.ts";
import { errorMessage } from "../library/errors.ts";
import { useReaderNavigation, useStepBack } from "../item/navigation.ts";
import { useArticleHtml, useItem } from "../item/queries.ts";
import { useEscape } from "../item/useEscape.ts";
import { ArticleContent } from "./ArticleContent.tsx";
import { type ArticleNode, articleTree } from "./articleTree.ts";
import { registerFontSet } from "./fonts.ts";
import { fontSetTheme, uprightQuotes, useFontSet, useTextSize } from "./fontSets.ts";
import { ReaderControls } from "./ReaderControls.tsx";
import { reader } from "./readerTheme.stylex.ts";

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const countWords = (nodes: readonly ArticleNode[]): number =>
  nodes.reduce(
    (sum, node) =>
      sum +
      (typeof node === "string"
        ? node.split(/\s+/u).filter(Boolean).length
        : countWords(node.children)),
    0,
  );

/** A saved article in a distraction-free page: its sanitized text, a typeface, and the way back. */
export function ReaderView({ id }: { id: string }) {
  const navigate = useNavigate();
  const stepBack = useStepBack();
  const { showDetails } = useReaderNavigation();
  const [fontSet, setFontSet] = useFontSet();
  const [textSize, setTextSize] = useTextSize();
  useEffect(() => registerFontSet(fontSet), [fontSet]);
  const query = useItem(id);
  const article = useArticleHtml(id);
  const detail = query.data;
  const close = () =>
    stepBack(() => void navigate({ to: "/item/$id", params: { id }, replace: true }));
  useEscape(close);

  const scroller = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const [heading, setHeading] = useState<HTMLHeadingElement | null>(null);
  const [headingGone, setHeadingGone] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [readingDown, setReadingDown] = useState(false);
  useEffect(() => {
    const root = scroller.current;
    if (!heading || !root) return;
    // Inset by the bar's height, so the title appears as the heading slides under the bar.
    const observer = new IntersectionObserver(
      ([entry]) => setHeadingGone(entry ? !entry.isIntersecting : false),
      { root, rootMargin: "-56px 0px 0px 0px" },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [heading]);

  const html = nonEmpty(article.data);
  const sourceUrl = webUrl(detail?.sourceUrl);
  const site = hostname(sourceUrl);
  // Explicit, not left to the compiler: sanitizing runs once per html, never per render.
  const nodes = useMemo(
    () => (html ? articleTree(window, html, sourceUrl ?? "") : null),
    [html, sourceUrl],
  );
  const minutes = useMemo(
    () => (nodes ? Math.max(1, Math.round(countWords(nodes) / 230)) : 0),
    [nodes],
  );
  const title = detail?.title || site || "Untitled";
  const byline = [
    site,
    nonEmpty(detail?.metadata.author),
    minutes > 0 ? `${minutes} min read` : undefined,
  ].filter((part) => part !== undefined);
  const status =
    (query.isLoadingError && errorMessage(query.error)) ??
    (article.isLoadingError && errorMessage(article.error)) ??
    (detail === null
      ? "This item is no longer in your library."
      : detail && !article.isPending && !nodes
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
      <div
        {...stylex.props(
          styles.bar,
          scrolled && styles.barScrolled,
          controlsOnRight && styles.clearControls,
        )}
      >
        <IconButton
          label="Back (Esc)"
          icon={<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />}
          onClick={close}
        />
        <p
          aria-hidden="true"
          {...stylex.props(styles.barTitle, headingGone && styles.barTitleShown)}
        >
          {detail && nodes ? title : null}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the page in your browser"
            title="Open the page in your browser"
            {...stylex.props(styles.barLink)}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} size={17} />
          </a>
        )}
        {detail && (
          <IconButton
            label="Details"
            icon={<HugeiconsIcon icon={InformationCircleIcon} size={18} />}
            onClick={() => showDetails(id)}
          />
        )}
      </div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
          const down = scrollTop > lastTop.current;
          lastTop.current = scrollTop;
          setScrolled(scrollTop > 0);
          // Reading down hides the pill; scrolling up, or reaching the end, brings it back.
          setReadingDown(down && scrollTop > 80 && scrollTop + clientHeight < scrollHeight - 48);
        }}
        {...stylex.props(styles.scroll)}
      >
        {status && (
          <p role="alert" {...stylex.props(styles.status)}>
            {status}
          </p>
        )}
        {detail && nodes && (
          <article {...stylex.props(styles.page)}>
            <header {...stylex.props(styles.header)}>
              <h1 ref={setHeading} {...stylex.props(styles.title)}>
                {title}
              </h1>
              {byline.length > 0 && (
                <p {...stylex.props(styles.byline)}>
                  {site && (
                    <span aria-hidden="true" {...stylex.props(styles.siteMark)}>
                      {site.charAt(0)}
                    </span>
                  )}
                  {byline.join("  ·  ")}
                </p>
              )}
            </header>
            <ArticleContent
              nodes={nodes}
              uprightQuotes={uprightQuotes(fontSet)}
              textSize={textSize}
            />
            {sourceUrl && (
              <footer {...stylex.props(styles.footer)}>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(styles.source)}
                >
                  Continue reading at {site ?? sourceUrl}
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
                </a>
              </footer>
            )}
          </article>
        )}
      </div>
      <ReaderControls
        fontSet={fontSet}
        onFontSet={setFontSet}
        textSize={textSize}
        onTextSize={setTextSize}
        away={readingDown}
      />
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
  bar: {
    position: "absolute",
    top: 0,
    insetInline: 0,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    height: "56px",
    paddingInline: "clamp(10px, 2vw, 20px)",
    transitionProperty: "background-color",
    transitionDuration: motion.micro,
  },
  barScrolled: {
    backgroundImage: `linear-gradient(${color.frame} 70%, transparent)`,
  },
  // The window's own buttons fill this corner on Windows and Linux.
  clearControls: { paddingRight: "118px" },
  barTitle: {
    flex: "1 1 auto",
    minWidth: 0,
    margin: 0,
    paddingInline: space.s3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "center",
    fontFamily: font.body,
    fontSize: text.md,
    fontWeight: 500,
    color: color.inkSoft,
    opacity: 0,
    translate: "0 4px",
    transitionProperty: "opacity, translate",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
  },
  barTitleShown: { opacity: 1, translate: "0 0" },
  barLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    color: { default: color.inkSoft, ":hover": color.inkStrong },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
  },
  scroll: {
    position: "relative",
    height: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    // Named for ArticleContent: figures break out of the column when this is wide enough.
    containerName: "reader",
    containerType: "inline-size",
    maskImage: "linear-gradient(to bottom, black 0, black calc(100% - 110px), transparent 100%)",
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
    paddingTop: "clamp(76px, 11vh, 104px)",
    paddingInline: "clamp(20px, 5vw, 44px)",
    paddingBottom: "120px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "0.85s",
    animationTimingFunction: "cubic-bezier(0.2, 0.75, 0.25, 1)",
    animationDelay: "0.1s",
    animationFillMode: "both",
  },
  header: { marginBottom: "clamp(26px, 5vh, 40px)" },
  title: {
    margin: 0,
    fontFamily: reader.heading,
    fontSize: "clamp(28px, 3.6vw, 36px)",
    fontWeight: reader.headingWeight,
    lineHeight: 1.16,
    letterSpacing: reader.headingTracking,
    color: color.inkStrong,
    textWrap: "balance",
  },
  byline: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    marginTop: space.s3,
    marginBottom: 0,
    fontFamily: reader.meta,
    fontSize: text.sm,
    color: color.muted,
    whiteSpace: "pre-wrap",
  },
  siteMark: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: "16px",
    height: "16px",
    borderRadius: "4px",
    backgroundColor: color.accentSoft,
    fontFamily: font.body,
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    color: color.accentStrong,
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
