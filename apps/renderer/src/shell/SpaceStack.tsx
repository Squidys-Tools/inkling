import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, motion } from "@inkling/ui/tokens.stylex";
import { useSpaceThumbs } from "../library/spaceThumbs.ts";
import { spaceRowMarker } from "../markers.stylex.ts";

/** The Shelf sidebar's picture of a Space: its newest items, fanning open under the pointer. */
export function SpaceStack({ space }: { space: Space }) {
  const [front, left, right] = useSpaceThumbs(space);
  if (!front) return <span aria-hidden="true" {...stylex.props(styles.stack, styles.empty)} />;
  const thumb = (url: string, place: "front" | "left" | "right") => (
    <img
      key={url}
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      // A remembered thumbnail may belong to an item deleted since.
      onError={(event) => (event.currentTarget.style.visibility = "hidden")}
      {...stylex.props(styles.thumb, styles[place])}
    />
  );
  return (
    <span aria-hidden="true" {...stylex.props(styles.stack)}>
      {left && thumb(left, "left")}
      {right && thumb(right, "right")}
      {thumb(front, "front")}
    </span>
  );
}

const styles = stylex.create({
  // Over the row's link, which stays the whole row's target.
  stack: {
    position: "absolute",
    left: "10px",
    top: "8px",
    width: "44px",
    height: "40px",
    pointerEvents: "none",
  },
  empty: {
    boxSizing: "border-box",
    left: "15px",
    top: "11px",
    width: "34px",
    height: "34px",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.borderStrong,
    borderRadius: "9px",
  },
  thumb: {
    position: "absolute",
    top: "4px",
    left: "6px",
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    objectFit: "cover",
    boxShadow: `0 0 0 1.5px ${color.window}, 0 3px 8px ${color.shadow}`,
    transitionProperty: "transform",
    transitionDuration: motion.reveal,
    transitionTimingFunction: motion.enter,
  },
  front: {
    transform: {
      default: "none",
      [stylex.when.ancestor(":hover", spaceRowMarker)]: "translateY(-1px)",
    },
  },
  left: {
    transform: {
      default: "translateX(-5px) rotate(-7deg)",
      [stylex.when.ancestor(":hover", spaceRowMarker)]: "translateX(-10px) rotate(-13deg)",
    },
  },
  right: {
    transform: {
      default: "translateX(5px) rotate(7deg)",
      [stylex.when.ancestor(":hover", spaceRowMarker)]: "translateX(10px) rotate(13deg)",
    },
  },
});
