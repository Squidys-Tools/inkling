import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, motion, radius, text } from "@inkling/ui/tokens.stylex";

export const FRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

/**
 * What a player shows until the user presses play. Nothing behind it loads
 * before then, so showing it reaches no video site.
 */
export function PlayPoster({
  label,
  provider,
  image,
  onPlay,
  style,
}: {
  label: string;
  provider: string;
  image?: string;
  onPlay: () => void;
  style?: stylex.StyleXStyles;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPlay}
      {...stylex.props(styles.poster, style)}
    >
      {image && <img src={image} alt="" decoding="async" {...stylex.props(styles.image)} />}
      <span aria-hidden="true" {...stylex.props(styles.play)}>
        <HugeiconsIcon icon={PlayIcon} size={21} />
      </span>
      <span aria-hidden="true" {...stylex.props(styles.provider)}>
        {provider}
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
