import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef } from "react";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import { desktop } from "../desktop.ts";
import { flightMedia } from "../item/flightGeometry.ts";
import { type CardView, formatDuration } from "../library/cardModel.ts";
import { PostArtwork } from "./PostArtwork.tsx";
import { QuoteArtwork } from "./QuoteArtwork.tsx";
import { TypedArtworkFor } from "./TypedArtwork.tsx";
import { hasThumbnail, retainThumbnail, takeThumbnail } from "./thumbnailCache.ts";

export type CardLayout = "grid" | "list" | "archive";

/**
 * Every card image goes through here. The library keeps one thumbnail per
 * item, so a card loads that (or, until it exists, the original) and lets the
 * browser decode it off the main thread.
 */
export function CardImage({ view, priority }: { view: CardView; priority: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const url = view.image;
  const alt = view.imageAlt || view.title;
  useLayoutEffect(() => {
    const container = host.current;
    if (!container || !url) return;
    const ready = hasThumbnail(url);
    const image = takeThumbnail(url) ?? new Image();
    image.alt = alt;
    image.decoding = "async";
    image.loading = priority || ready ? "eager" : "lazy";
    image.fetchPriority = priority ? "high" : "auto";
    image.draggable = false;
    image.className = stylex.props(styles.image).className ?? "";
    const loaded = () => retainThumbnail(image);
    image.addEventListener("load", loaded);
    if (image.src !== url) image.src = url;
    // React owns the host; the bounded cache owns its decoded image child.
    // A cell that scrolls back into the grid remounts the host without blanking that image.
    container.append(image);
    if (image.complete) retainThumbnail(image);
    return () => {
      image.removeEventListener("load", loaded);
      if (image.parentNode === container) container.removeChild(image);
      retainThumbnail(image);
    };
  }, [url, alt, priority]);
  if (!url) return null;
  const flight = flightMedia(view) ?? undefined;
  return desktop ? (
    <span ref={host} data-flight={flight} {...stylex.props(styles.image)} />
  ) : (
    <img
      src={url}
      alt={alt}
      data-flight={flight}
      decoding="async"
      loading={priority || hasThumbnail(url) ? "eager" : "lazy"}
      onLoad={(event) => retainThumbnail(event.currentTarget)}
      fetchPriority={priority ? "high" : undefined}
      draggable={false}
      {...stylex.props(styles.image)}
    />
  );
}

// The pill is the only play affordance on a video card; playback happens in
// the item view. It is not glass: the grid keeps backdrop blur to the controls.
function VideoPill({ view }: { view: CardView }) {
  return (
    <span {...stylex.props(styles.pill)} aria-hidden="true">
      <HugeiconsIcon icon={PlayIcon} size={10} />
      {view.durationSeconds !== undefined && <span>{formatDuration(view.durationSeconds)}</span>}
    </span>
  );
}

function ArticleArtwork({ view, showTitle }: { view: CardView; showTitle: boolean }) {
  return (
    <>
      <span {...stylex.props(styles.line, styles.lineLong)} />
      <span {...stylex.props(styles.line, styles.lineShort)} />
      <span {...stylex.props(styles.stamp)}>m</span>
      {showTitle && view.webUrl && (
        <span {...stylex.props(styles.articleText)}>
          <span {...stylex.props(styles.articleTitle)}>{view.title}</span>
          <span {...stylex.props(styles.articleSource)}>{view.source}</span>
        </span>
      )}
    </>
  );
}

export function CardMedia({
  view,
  layout,
  priority,
  waiting,
}: {
  view: CardView;
  layout: CardLayout;
  priority: boolean;
  waiting?: boolean;
}) {
  const list = layout === "list";
  const box = list ? styles.row : styles.fill;
  switch (view.media) {
    case "x-post":
      return (
        <div {...stylex.props(box, styles.embedPaper)}>
          {view.post && (
            <PostArtwork post={view.post} compact={layout === "archive"} style={styles.postFill} />
          )}
        </div>
      );
    case "post":
      return view.post ? (
        <PostArtwork
          post={view.post}
          compact={layout === "archive"}
          style={[box, styles.postFill, list && styles.postRow]}
        />
      ) : null;
    case "image":
    case "video":
      return (
        <div {...stylex.props(box, styles.mediaGround, list && styles.imageRow)}>
          <CardImage view={view} priority={priority} />
          {view.media === "video" && <VideoPill view={view} />}
        </div>
      );
    case "paper":
      break;
  }
  if (view.kind === "Quote")
    return (
      <QuoteArtwork view={view} layout={list ? "list" : layout === "grid" ? "grid" : "fill"} />
    );
  const article = view.kind === "Article";
  return (
    <div
      {...stylex.props(box, article ? styles.articleGround : styles.paperGround)}
      aria-hidden="true"
    >
      {article ? (
        <ArticleArtwork view={view} showTitle={!list} />
      ) : (
        <TypedArtworkFor view={view} compact={list} waiting={waiting} />
      )}
    </div>
  );
}

const styles = stylex.create({
  fill: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  row: {
    position: "relative",
    height: "100%",
    minHeight: "155px",
    overflow: "hidden",
    pointerEvents: "none",
  },
  imageRow: { minHeight: "120px" },
  image: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  mediaGround: { backgroundColor: color.raised },
  paperGround: { backgroundColor: color.surface },
  articleGround: { backgroundColor: "transparent" },
  embedPaper: { backgroundColor: cardColor.embedPaper },
  postFill: { width: "100%", height: "100%" },
  postRow: { minHeight: "155px" },
  pill: {
    position: "absolute",
    left: "10px",
    bottom: "10px",
    zIndex: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    paddingBlock: "5px",
    paddingLeft: "8px",
    paddingRight: "10px",
    borderRadius: radius.round,
    backgroundColor: cardColor.tileButton,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: "14px",
  },
  line: {
    position: "absolute",
    left: "11%",
    display: "block",
    height: "1px",
    backgroundColor: cardColor.articleLine,
    opacity: 0.65,
  },
  lineLong: { top: "36%", width: "50%" },
  lineShort: { top: "45%", width: "31%" },
  stamp: {
    position: "absolute",
    right: "12%",
    bottom: "15%",
    display: "grid",
    placeItems: "center",
    width: "58px",
    height: "58px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.stampEdge,
    fontFamily: font.body,
    fontSize: "26px",
    color: cardColor.stampInk,
    transform: "rotate(-13deg)",
  },
  articleText: {
    position: "absolute",
    left: "11%",
    right: "36%",
    bottom: "12%",
    display: "grid",
    gap: "4px",
    color: color.ink,
  },
  articleTitle: {
    fontFamily: font.body,
    fontSize: "12px",
    lineHeight: 1.2,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },
  articleSource: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: 1.2,
    color: color.muted,
  },
});
