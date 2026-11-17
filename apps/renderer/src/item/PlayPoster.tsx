import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, motion, radius, text } from "@inkling/ui/tokens.stylex";
import { posterMarker } from "../markers.stylex.ts";

export const FRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

/**
 * What a player shows until the user presses play. Nothing behind it loads
 * before then, so showing it reaches no video site.
 */
export function PlayPoster({
  label,
  provider,
  title,
  image,
  onPlay,
  style,
}: {
  label: string;
  provider: string;
  /** Shown over the poster's foot, beside the play button. */
  title?: string;
  image?: string;
  onPlay: () => void;
  style?: stylex.StyleXStyles;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPlay}
      {...stylex.props(posterMarker, styles.poster, style)}
    >
      {image && (
        <img
          src={image}
          alt=""
          decoding="async"
          data-flight="media"
          {...stylex.props(styles.image)}
        />
      )}
      <span aria-hidden="true" {...stylex.props(styles.foot)}>
        <span {...stylex.props(styles.caption)}>
          <span {...stylex.props(styles.provider)}>{provider}</span>
          {title && <span {...stylex.props(styles.title)}>{title}</span>}
        </span>
        <span {...stylex.props(styles.play)}>
          <HugeiconsIcon icon={PlayIcon} size={15} />
          Play on {provider}
        </span>
      </span>
    </button>
  );
}

const styles = stylex.create({
  poster: {
    position: "relative",
    display: "block",
    padding: 0,
    borderWidth: 0,
    backgroundColor: color.app,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // Darkens only the foot, so the caption reads on a bright poster.
  foot: {
    position: "absolute",
    insetInline: 0,
    bottom: 0,
    display: "flex",
    alignItems: "flex-end",
    gap: "12px",
    paddingTop: "56px",
    paddingInline: "16px",
    paddingBottom: "14px",
    backgroundImage: `linear-gradient(transparent, ${color.scrim})`,
    textAlign: "left",
    pointerEvents: "none",
  },
  caption: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" },
  provider: {
    fontFamily: font.mono,
    fontSize: text.xs,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
    color: cardColor.quoteKicker,
  },
  title: {
    overflow: "hidden",
    fontFamily: font.display,
    fontSize: "16px",
    fontWeight: 500,
    lineHeight: "21px",
    color: color.inkStrong,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  play: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    height: "34px",
    paddingLeft: "11px",
    paddingRight: "14px",
    borderRadius: radius.round,
    backgroundColor: color.glass,
    boxShadow: `0 10px 28px ${color.shadow}, inset 0 0 0 1px ${color.glassEdge}`,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: text.sm,
    fontWeight: 500,
    whiteSpace: "nowrap",
    transitionProperty: "transform",
    transitionDuration: motion.micro,
    transform: {
      default: "scale(1)",
      [stylex.when.ancestor(":hover", posterMarker)]: "scale(1.04)",
    },
  },
});
