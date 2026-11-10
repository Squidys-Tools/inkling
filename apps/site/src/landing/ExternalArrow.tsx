import ArrowUpRightIcon from "@inkling/ui/icons/ArrowUpRight";
import { Icon } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { landing, media } from "./landing.stylex.ts";

/** The faint arrow after a link that leaves the site. Its link must carry `stylex.defaultMarker()`. */
export function ExternalArrow() {
  return (
    <Icon icon={ArrowUpRightIcon} size="0.9em" aria-hidden="true" {...stylex.props(styles.arrow)} />
  );
}

const styles = stylex.create({
  arrow: {
    flex: "none",
    opacity: {
      default: 0.5,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-visible")]: 1,
    },
    transform: {
      default: null,
      [stylex.when.ancestor(":hover")]: "translate(0.12em, -0.12em)",
      [stylex.when.ancestor(":focus-visible")]: "translate(0.12em, -0.12em)",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: { default: "0.16s", [media.reduced]: "0s" },
    transitionTimingFunction: landing.ease,
  },
});
