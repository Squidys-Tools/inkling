import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { type FontSet, fontSets } from "./fontSets.ts";

export function FontPicker({
  value,
  onChange,
}: {
  value: FontSet;
  onChange: (set: FontSet) => void;
}) {
  return (
    <label {...stylex.props(styles.picker)}>
      <span {...stylex.props(styles.label)}>Typeface</span>
      <select
        value={value}
        onChange={(event) => {
          const chosen = fontSets.find((set) => set.id === event.target.value);
          if (chosen) onChange(chosen.id);
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
  );
}

const styles = stylex.create({
  picker: {
    position: "absolute",
    left: "18px",
    bottom: space.s4,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    paddingBlock: "7px",
    paddingInline: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: radius.control,
    backgroundColor: color.frame,
  },
  label: {
    fontFamily: font.body,
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: color.muted,
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
});
