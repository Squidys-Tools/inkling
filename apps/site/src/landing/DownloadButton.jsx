// Interaction adapted from BEUI ExpandingArrowButton (MIT): a tile expands
// on real hover or keyboard focus, with reversible motion and press feedback.
// Inkling adaptation keeps the label visible, uses an actual releases link,
// and never pretends a file is downloading or completed.
import * as React from "react";
import { motion } from "motion/react";
import { useCalm } from "./ui";
import { useHoverCapable } from "./environment";
const ease = [0.16, 1, 0.3, 1];
function Arrow() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
export function DownloadButton({ href, compact = false }) {
  const calm = useCalm(),
    canHover = useHoverCapable(),
    [hovered, setHovered] = React.useState(false),
    [focused, setFocused] = React.useState(false);
  const active = (canHover && hovered) || focused;
  return (
    <motion.a
      href={href}
      className="button download-control"
      data-compact={compact}
      data-engaged={active}
      data-calm={calm}
      aria-label="Download inkling"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={(e) => setFocused(e.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      whileTap={calm ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.6 }}
    >
      <span className="download-label">Download inkling</span>
      <motion.span
        className="download-fill"
        aria-hidden="true"
        initial={false}
        animate={{ width: active ? "calc(100% - 12px)" : "48px" }}
        transition={{ duration: calm ? 0 : 0.4, ease }}
      >
        <span className="download-fill-label">Download inkling</span>
      </motion.span>
      <span className="download-well" aria-hidden="true">
        <span className="download-arrow-window">
          <motion.span
            className="download-arrow-track"
            initial={false}
            animate={{ y: active && !calm ? 24 : 0 }}
            transition={{ duration: calm ? 0 : 0.4, ease }}
          >
            <Arrow />
            <Arrow />
          </motion.span>
        </span>
        <svg className="download-tray" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 17v3h14v-3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </motion.a>
  );
}
