import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { autoplayEmbedUrl, providerLabel } from "@inkling/ingestion/video-links";
import { cardColor, color, font, motion, radius, text } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { TypedArtworkFor } from "../cards/TypedArtwork.tsx";
import type { DescribedItem } from "./model.ts";

const FRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

// A video link loads its player only when the user presses play, so opening
// the item reaches no video site. A local file plays from the library.
export function VideoPlayer({ item }: { item: DescribedItem }) {
  const [playing, setPlaying] = useState(false);
  if (item.video) {
    return playing ? (
      // oxlint-disable-next-line react/iframe-missing-sandbox -- allowlisted players need scripts and their own origin, which a sandbox would void.
      <iframe
        src={autoplayEmbedUrl(item.video.embedUrl)}
        title={item.title}
        allow={FRAME_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        {...stylex.props(styles.fill, styles.frame)}
      />
    ) : (
      <button
        type="button"
        aria-label={`Play video: ${item.title}`}
        onClick={() => setPlaying(true)}
        {...stylex.props(styles.fill, styles.poster)}
      >
        {item.image && (
          <img src={item.image} alt="" decoding="async" {...stylex.props(styles.posterImage)} />
        )}
        <span aria-hidden="true" {...stylex.props(styles.play)}>
          <HugeiconsIcon icon={PlayIcon} size={21} />
        </span>
        <span aria-hidden="true" {...stylex.props(styles.provider)}>
          {providerLabel(item.video.provider)}
        </span>
      </button>
    );
  }
  if (item.file)
    return (
      // oxlint-disable-next-line jsx-a11y/media-has-caption -- a file the user saved has no captions to offer.
      <video
        src={item.file}
        poster={item.image}
        controls
        preload="metadata"
        {...stylex.props(styles.fill, styles.video)}
      />
    );
  return <TypedArtworkFor view={item} />;
}

const styles = stylex.create({
  fill: {
    display: "block",
    width: "100%",
    height: "100%",
    borderWidth: 0,
  },
  frame: { backgroundColor: color.app },
  video: { backgroundColor: color.app, objectFit: "contain" },
  poster: {
    position: "relative",
    padding: 0,
    backgroundColor: color.app,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  posterImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: 0.88,
  },
  play: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    display: "grid",
    placeItems: "center",
    width: "54px",
    height: "54px",
    borderRadius: radius.round,
    backgroundColor: color.glass,
    color: color.inkStrong,
    boxShadow: `0 10px 28px ${color.shadow}, inset 0 0 0 1px ${color.glassEdge}`,
    transitionProperty: "transform",
    transitionDuration: motion.micro,
    transform: { default: "scale(1)", ":hover": "scale(1.08)" },
  },
  provider: {
    position: "absolute",
    bottom: "11px",
    left: "12px",
    fontFamily: font.body,
    fontSize: text.xs,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
    color: cardColor.quoteKicker,
    pointerEvents: "none",
  },
});
