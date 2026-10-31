import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "./tokens.stylex.ts";

/** One choice among a few, as native radios. It has no surface of its own; pass one in `style`. */
export function SegmentedControl<Value extends string>({
  name,
  label,
  options,
  value,
  onChange,
  disabled,
  style,
}: {
  /** Groups the radios, so it must be unique on the page. */
  name: string;
  /** Read by screen readers; not shown. */
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  style?: stylex.StyleXStyles;
}) {
  return (
    <fieldset disabled={disabled} {...stylex.props(styles.root, style)}>
      <legend {...stylex.props(styles.hidden)}>{label}</legend>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} {...stylex.props(styles.item, checked && styles.checked)}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              {...stylex.props(styles.hidden)}
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

const styles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    minWidth: 0,
    margin: 0,
    padding: "3px",
    borderWidth: 0,
    borderRadius: radius.tile,
    opacity: { default: 1, ":disabled": 0.42 },
  },
  item: {
    display: "inline-flex",
    flex: "0 0 auto",
    alignItems: "center",
    justifyContent: "center",
    height: "28px",
    paddingInline: space.s3,
    borderRadius: radius.control,
    color: { default: color.muted, ":hover": color.inkSoft },
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: text.md,
    fontWeight: 500,
    lineHeight: "16px",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    transitionProperty: "color, background-color, box-shadow",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
    outline: { default: "none", ":has(input:focus-visible)": `2px solid ${color.accent}` },
    outlineOffset: "1px",
  },
  checked: {
    color: { default: color.ink, ":hover": color.ink },
    backgroundColor: color.overlayActive,
    boxShadow: `inset 0 1px 0 ${color.glassEdge}, 0 1px 3px ${color.shadow}`,
  },
  hidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
