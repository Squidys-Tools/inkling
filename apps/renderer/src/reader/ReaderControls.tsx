import * as stylex from "@stylexjs/stylex";
import { Glass } from "@inkling/ui";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { SizeStepper } from "../item/SizeStepper.tsx";
import { type FontSet, fontSets, type TextSize, textSizes } from "./fontSets.ts";

/** The floating pill under the article: its typeface and text size. */
export function ReaderControls({
  fontSet,
  onFontSet,
  textSize,
  onTextSize,
  away,
}: {
  fontSet: FontSet;
  onFontSet: (set: FontSet) => void;
  textSize: TextSize;
  onTextSize: (size: TextSize) => void;
  /** The reader is scrolling down, so the pill steps out of the text's way. */
  away: boolean;
}) {
  const at = textSizes.indexOf(textSize);
  return (
    <Glass style={[styles.pill, away && styles.away]}>
      <label {...stylex.props(styles.typeface)}>
        <span aria-hidden="true" {...stylex.props(styles.mark)}>
          Aa
        </span>
        <select
          aria-label="Typeface"
          value={fontSet}
          onChange={(event) => {
            const chosen = fontSets.find((set) => set.id === event.target.value);
            if (chosen) onFontSet(chosen.id);
          }}
          {...stylex.props(styles.select)}
        >
          {fontSets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.label}
            </option>
          ))}
        </select>
      </label>
      <span aria-hidden="true" {...stylex.props(styles.rule)} />
      <SizeStepper
        label="Text size"
        percent={textSize}
        canShrink={at > 0}
        canGrow={at < textSizes.length - 1}
        onShrink={() => onTextSize(textSizes[at - 1] ?? textSize)}
        onGrow={() => onTextSize(textSizes[at + 1] ?? textSize)}
      />
    </Glass>
  );
}

const styles = stylex.create({
  pill: {
    position: "absolute",
    bottom: space.s4,
    left: "50%",
    translate: "-50% 0",
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    padding: space.s1,
    borderRadius: radius.round,
    opacity: 1,
    transitionProperty: "opacity, translate",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.standard,
  },
  // Still reachable: pointing at it or tabbing into it brings it back.
  away: {
    opacity: { default: 0, ":hover": 1, ":focus-within": 1 },
    translate: { default: "-50% 8px", ":hover": "-50% 0", ":focus-within": "-50% 0" },
  },
  typeface: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    paddingLeft: "10px",
    paddingRight: "4px",
    borderRadius: radius.round,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    cursor: "pointer",
  },
  mark: {
    fontFamily: font.display,
    fontSize: text.md,
    fontWeight: 600,
    color: color.inkSoft,
  },
  select: {
    borderWidth: 0,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: text.sm,
    color: color.ink,
    cursor: "pointer",
  },
  rule: {
    width: "1px",
    height: "16px",
    marginInline: "2px",
    backgroundColor: color.border,
  },
});
