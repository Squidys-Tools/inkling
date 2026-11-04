// Interaction adapted from BEUI ExpandingArrowButton (MIT): a tile expands
// on real hover or keyboard focus, with reversible motion and press feedback.
// It links to the releases page and never pretends a file is downloading.
import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { repository } from "../layout/links.ts";
import { useCalm, useMediaQuery } from "./environment.ts";
import { landing, media } from "./landing.stylex.ts";

function Arrow() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...stylex.props(styles.arrow)}>
      <path
        d="M12 4v12m-5-5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadButton({
  compact = false,
  style,
}: {
  compact?: boolean;
  style?: stylex.StyleXStyles;
}) {
  const calm = useCalm();
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = (canHover && hovered) || focused;
  return (
    <a
      href={`${repository}/releases`}
      aria-label="Download inkling"
      onPointerEnter={(event) => setHovered(event.pointerType !== "touch")}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      {...stylex.props(
        styles.control,
        compact ? styles.compact : styles.regular,
        !calm && styles.press,
        style,
      )}
    >
      <span {...stylex.props(styles.label)}>Download inkling</span>
      <span
        aria-hidden="true"
        {...stylex.props(
          styles.fill,
          compact && styles.compactFill,
          active && styles.fillOpen,
          calm && styles.still,
        )}
      >
        <span {...stylex.props(styles.fillLabel)}>Download inkling</span>
      </span>
      <span aria-hidden="true" {...stylex.props(styles.well, compact && styles.compactWell)}>
        <span {...stylex.props(styles.arrowWindow)}>
          <span
            {...stylex.props(
              styles.arrowTrack,
              active && !calm && styles.arrowDropped,
              calm && styles.still,
            )}
          >
            <Arrow />
            <Arrow />
          </span>
        </span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          {...stylex.props(styles.tray, compact && styles.compactTray)}
        >
          <path
            d="M5 17v3h14v-3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </a>
  );
}

const styles = stylex.create({
  control: {
    boxSizing: "border-box",
    position: "relative",
    isolation: "isolate",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    flex: "none",
    padding: "6px",
    borderStyle: "none",
    backgroundColor: landingColor.surface,
    color: landingColor.ink,
    fontFamily: landing.font,
    fontWeight: 500,
    lineHeight: 1.25,
    letterSpacing: "-0.015em",
    textDecoration: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    userSelect: "none",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    transitionProperty: "transform",
    transitionDuration: "0.15s",
    transitionTimingFunction: "ease-out",
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.ink}` },
    outlineOffset: { default: null, ":focus-visible": "5px" },
  },
  regular: {
    height: { default: "60px", [media.phone]: "58px" },
    minHeight: { default: "60px", [media.phone]: "58px" },
    borderRadius: "22px",
    fontSize: { default: "16px", [media.phone]: "15px" },
  },
  compact: { height: "54px", minHeight: "54px", borderRadius: "19px", fontSize: "14px" },
  press: { transform: { default: null, ":active": "scale(0.98)" } },
  label: {
    position: "relative",
    marginLeft: "64px",
    marginRight: { default: "20px", [media.phone]: "18px" },
    paddingBlock: "12px",
  },
  fill: {
    position: "absolute",
    left: "6px",
    top: "6px",
    bottom: "6px",
    width: "48px",
    borderRadius: "16px",
    overflow: "hidden",
    backgroundColor: landingColor.ink,
    color: landingColor.paper,
    pointerEvents: "none",
    transitionProperty: "width",
    transitionDuration: "0.4s",
    transitionTimingFunction: landing.ease,
  },
  compactFill: { borderRadius: "13px" },
  fillOpen: { width: "calc(100% - 12px)" },
  still: { transitionDuration: "0s" },
  fillLabel: {
    position: "absolute",
    left: "64px",
    top: "50%",
    transform: "translateY(-50%)",
    whiteSpace: "nowrap",
  },
  well: {
    position: "absolute",
    left: "6px",
    top: "6px",
    width: "48px",
    height: { default: "48px", [media.phone]: "46px" },
    display: "grid",
    placeItems: "center",
    color: landingColor.paper,
    pointerEvents: "none",
  },
  compactWell: { height: "42px" },
  arrowWindow: {
    position: "relative",
    width: "24px",
    height: "19px",
    overflow: "hidden",
    marginTop: "-7px",
  },
  arrowTrack: {
    position: "absolute",
    top: "-24px",
    left: 0,
    display: "block",
    width: "24px",
    height: "48px",
    transitionProperty: "transform",
    transitionDuration: "0.4s",
    transitionTimingFunction: landing.ease,
  },
  arrowDropped: { transform: "translateY(24px)" },
  arrow: { display: "block", flex: "none" },
  tray: {
    position: "absolute",
    left: "12px",
    top: { default: "10px", [media.phone]: "9px" },
  },
  compactTray: { top: "7px" },
});
