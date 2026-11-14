import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import type { ImgHTMLAttributes } from "react";
import { color, spaceColor } from "@inkling/ui/tokens.stylex";

/**
 * A Space's picture in its color, drawn by kind: a Regular Space's newest picture in a dashed
 * outline, a slot you file into; a Smart Space's two latest matches split by a diagonal seam.
 */
export function SpaceCover({
  space,
  thumbs,
  style,
}: {
  space: Pick<Space, "kind" | "color">;
  thumbs: readonly string[];
  style?: stylex.StyleXStyles;
}) {
  if (space.kind === "regular")
    return (
      <span aria-hidden="true" {...stylex.props(styles.slot, tints[space.color], style)}>
        {thumbs[0] && (
          <img src={thumbs[0]} alt="" {...thumbProps} {...stylex.props(styles.inner)} />
        )}
      </span>
    );
  return (
    <span aria-hidden="true" {...stylex.props(styles.split, tints[space.color], style)}>
      {thumbs[0] && (
        <img src={thumbs[0]} alt="" {...thumbProps} {...stylex.props(styles.half, styles.upper)} />
      )}
      {thumbs[1] && (
        <img src={thumbs[1]} alt="" {...thumbProps} {...stylex.props(styles.half, styles.lower)} />
      )}
      {/* Dashed until the Space has been opened and shown what it matches. */}
      <span {...stylex.props(styles.seam, thumbs.length === 0 && styles.seamDashed)} />
    </span>
  );
}

/**
 * The Strip look's four newest pictures, marked the same way: a Regular Space's share a dashed
 * outline; a Smart Space keeps four slots cut by slanted seams, dashed past its last known match.
 */
export function SpaceStrip({
  space,
  thumbs,
}: {
  space: Pick<Space, "kind" | "color">;
  thumbs: readonly string[];
}) {
  if (space.kind === "regular")
    return (
      <span {...stylex.props(styles.strip, styles.stripSlot, tints[space.color])}>
        {thumbs.slice(0, 4).map((url) => (
          <img
            key={url}
            src={url}
            alt=""
            {...thumbProps}
            {...stylex.props(styles.stripImage, styles.stripSlotImage)}
          />
        ))}
      </span>
    );
  return (
    <span {...stylex.props(styles.strip, styles.stripSplit, tints[space.color])}>
      {[0, 1, 2, 3].map((slot) => {
        const url = thumbs[slot];
        return url ? (
          <img
            key={`${slot} ${url}`}
            src={url}
            alt=""
            {...thumbProps}
            {...stylex.props(styles.stripImage)}
          />
        ) : (
          <span key={`empty-${slot}`} {...stylex.props(styles.stripImage)} />
        );
      })}
      {[1, 2, 3].map((slot) => (
        <span
          key={slot}
          {...stylex.props(styles.cut, styles.cutAt(slot), !thumbs[slot - 1] && styles.cutDashed)}
        />
      ))}
    </span>
  );
}

/** The same mark without pictures, for a line of text: a dashed square or a split one. */
export function SpaceSwatch({ space }: { space: Pick<Space, "kind" | "color"> }) {
  return (
    <span
      aria-hidden="true"
      {...stylex.props(
        styles.swatch,
        space.kind === "regular" ? styles.swatchSlot : styles.swatchSplit,
        tints[space.color],
      )}
    >
      {space.kind === "smart" && <span {...stylex.props(styles.seam, styles.swatchSeam)} />}
    </span>
  );
}

const thumbProps = {
  draggable: false,
  loading: "lazy",
  decoding: "async",
  // A remembered thumbnail may belong to an item deleted since; the empty slot shows instead.
  onError: (event) => (event.currentTarget.style.visibility = "hidden"),
} satisfies ImgHTMLAttributes<HTMLImageElement>;

const tints = stylex.create({
  orange: { color: spaceColor.orange },
  green: { color: spaceColor.green },
  blue: { color: spaceColor.blue },
  pink: { color: spaceColor.pink },
  purple: { color: spaceColor.purple },
  yellow: { color: spaceColor.yellow },
});

const styles = stylex.create({
  // Border-box: the dashes sit inside the same 24px as a Smart cover.
  slot: {
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    width: "24px",
    height: "24px",
    flexShrink: 0,
    borderWidth: "1.5px",
    borderStyle: "dashed",
    borderColor: "currentColor",
    borderRadius: "7px",
    pointerEvents: "none",
  },
  // Fills the outline, a 1px gap short of its dashes so they stay readable over any picture.
  inner: {
    display: "block",
    width: "19px",
    height: "19px",
    borderRadius: "4.5px",
    objectFit: "cover",
  },
  split: {
    position: "relative",
    display: "block",
    width: "24px",
    height: "24px",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: "6px",
    backgroundColor: color.raised,
    boxShadow: `inset 0 0 0 1px ${color.border}`,
    pointerEvents: "none",
  },
  half: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  upper: { clipPath: "polygon(0 0, 100% 0, 0 100%)" },
  lower: { clipPath: "polygon(100% 0, 100% 100%, 0 100%)" },
  // Corner to corner: the diagonal of a square is about 1.42 of its side.
  seam: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "150%",
    height: "2px",
    backgroundColor: "currentColor",
    transform: "translate(-50%, -50%) rotate(-45deg)",
  },
  seamDashed: {
    backgroundColor: "transparent",
    backgroundImage: "repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 5px)",
  },
  strip: { position: "relative", display: "flex", width: "100%", height: "100%" },
  stripSlot: {
    boxSizing: "border-box",
    gap: "2px",
    padding: "2px",
    borderWidth: "1.5px",
    borderStyle: "dashed",
    borderColor: "currentColor",
    borderRadius: "9px",
  },
  stripSplit: { overflow: "hidden", borderRadius: "7px", backgroundColor: color.raised },
  stripImage: { display: "block", flexGrow: 1, flexBasis: 0, minWidth: 0, objectFit: "cover" },
  stripSlotImage: { borderRadius: "4px" },
  // Taller than the strip, so the slant runs off both edges.
  cut: {
    position: "absolute",
    top: "-6px",
    bottom: "-6px",
    width: "3px",
    backgroundColor: "currentColor",
    transform: "skewX(-16deg)",
  },
  cutAt: (slot: number) => ({ left: `calc(${slot * 25}% - 1.5px)` }),
  cutDashed: {
    width: "2px",
    backgroundColor: "transparent",
    backgroundImage:
      "repeating-linear-gradient(to bottom, currentColor 0 3px, transparent 3px 5px)",
  },
  swatch: {
    position: "relative",
    display: "inline-block",
    width: "12px",
    height: "12px",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: "3px",
    borderWidth: "1.5px",
    borderColor: "currentColor",
  },
  swatchSlot: { borderStyle: "dashed" },
  swatchSplit: { borderStyle: "solid" },
  swatchSeam: { height: "1.5px" },
});
