import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { color, radius } from "./tokens.stylex.ts";

/**
 * The one glass recipe, for controls that float over the library. Each Glass
 * is a backdrop-filter layer the compositor redraws whenever what is under it
 * moves, so the app keeps at most three on screen and never resizes one while
 * it animates. Cards are never glass.
 */
export function Glass({
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & { style?: stylex.StyleXStyles }) {
  return <div {...props} {...stylex.props(styles.glass, style)} />;
}

const styles = stylex.create({
  glass: {
    backgroundColor: color.glass,
    backdropFilter: "blur(20px) saturate(1.4)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    borderRadius: radius.panel,
    boxShadow: `0 12px 32px ${color.shadow}`,
  },
});
