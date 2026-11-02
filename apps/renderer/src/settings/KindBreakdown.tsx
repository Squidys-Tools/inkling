import type { KindCount } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, font, kindColor, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { KindIcon } from "../cards/KindIcon.tsx";
import type { ItemKind } from "../library/cardModel.ts";

const plural: Record<ItemKind, string> = {
  Article: "Articles",
  Image: "Images",
  Note: "Notes",
  PDF: "PDFs",
  Quote: "Quotes",
  Video: "Videos",
  Post: "Posts",
  File: "Files",
};

const hue = stylex.create({
  Article: { backgroundColor: kindColor.article },
  Image: { backgroundColor: kindColor.image },
  Note: { backgroundColor: kindColor.note },
  PDF: { backgroundColor: kindColor.pdf },
  Quote: { backgroundColor: kindColor.quote },
  Video: { backgroundColor: kindColor.video },
  Post: { backgroundColor: kindColor.post },
  File: { backgroundColor: kindColor.file },
});

const grow = stylex.keyframes({
  from: { transform: "scaleX(0)", opacity: 0 },
  to: { transform: "scaleX(1)", opacity: 1 },
});

const percentOf = (count: number, total: number) => {
  const share = (count / total) * 100;
  return share < 1 ? "<1%" : `${Math.round(share)}%`;
};

/** What the library holds, one segment per card kind: a bar to see the shape, a legend to read the numbers. */
export function KindBreakdown({ kinds }: { kinds: readonly KindCount[] }) {
  const [focused, setFocused] = useState<ItemKind | null>(null);
  const total = kinds.reduce((sum, { count }) => sum + count, 0);
  if (total === 0) return null;

  const focus = (kind: ItemKind) => ({
    onMouseEnter: () => setFocused(kind),
    onMouseLeave: () => setFocused(null),
  });

  return (
    <div {...stylex.props(styles.breakdown)}>
      <div
        role="img"
        aria-label={kinds.map(({ kind, count }) => `${count} ${plural[kind]}`).join(", ")}
        {...stylex.props(styles.bar)}
      >
        {kinds.map(({ kind, count }, index) => (
          <span
            key={kind}
            {...focus(kind)}
            {...stylex.props(
              styles.segment,
              hue[kind],
              styles.segmentSize(count),
              styles.segmentDelay(index * 60),
              focused !== null && focused !== kind && styles.dimmed,
            )}
          />
        ))}
      </div>
      <ul {...stylex.props(styles.legend)}>
        {kinds.map(({ kind, count }) => (
          <li
            key={kind}
            {...focus(kind)}
            {...stylex.props(styles.entry, focused === kind && styles.entryFocused)}
          >
            <span aria-hidden="true" {...stylex.props(styles.chip, hue[kind])}>
              <KindIcon kind={kind} size={12} />
            </span>
            <span {...stylex.props(styles.label)}>{plural[kind]}</span>
            <span {...stylex.props(styles.figure)}>{count.toLocaleString()}</span>
            <span {...stylex.props(styles.share)}>{percentOf(count, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = stylex.create({
  breakdown: {
    display: "flex",
    flexDirection: "column",
    gap: space.s4,
    width: "100%",
    paddingTop: space.s4,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  bar: {
    display: "flex",
    gap: "3px",
    height: "14px",
    overflow: "hidden",
    borderRadius: radius.round,
  },
  segment: {
    // Every kind keeps a visible sliver, however few items it has.
    minWidth: "8px",
    flexShrink: 1,
    flexBasis: 0,
    borderRadius: radius.round,
    transformOrigin: "left center",
    animationName: grow,
    animationDuration: motion.delight,
    animationTimingFunction: motion.enter,
    animationFillMode: "backwards",
    transitionProperty: "opacity",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
  },
  segmentSize: (count: number) => ({ flexGrow: count }),
  segmentDelay: (ms: number) => ({ animationDelay: `${ms}ms` }),
  dimmed: { opacity: 0.28 },
  legend: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "2px 6px",
    margin: 0,
    marginInline: "-8px",
    padding: 0,
    listStyle: "none",
  },
  entry: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    paddingBlock: "6px",
    paddingInline: "8px",
    borderRadius: radius.control,
    transitionProperty: "background-color",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
  },
  entryFocused: { backgroundColor: color.overlayHover },
  chip: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "7px",
    color: color.app,
  },
  label: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "16px",
    color: color.inkSoft,
  },
  figure: {
    flexShrink: 0,
    fontFamily: font.mono,
    fontSize: text.md,
    lineHeight: "16px",
    fontVariantNumeric: "tabular-nums",
    color: color.ink,
  },
  share: {
    flexShrink: 0,
    minWidth: "30px",
    textAlign: "right",
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    fontVariantNumeric: "tabular-nums",
    color: color.faint,
  },
});
