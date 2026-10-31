import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { color, font, motion, radius, space, text } from "./tokens.stylex.ts";

type TextFieldProps = Omit<ComponentProps<"input">, "className" | "style"> & {
  style?: stylex.StyleXStyles;
};

export function TextField({ style, ...props }: TextFieldProps) {
  return <input {...props} {...stylex.props(styles.field, style)} />;
}

type TextAreaProps = Omit<ComponentProps<"textarea">, "className" | "style"> & {
  style?: stylex.StyleXStyles;
};

export function TextArea({ style, ...props }: TextAreaProps) {
  return <textarea {...props} {...stylex.props(styles.field, styles.area, style)} />;
}

const styles = stylex.create({
  field: {
    width: "100%",
    minHeight: "36px",
    paddingInline: space.s3,
    paddingBlock: space.s2,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":focus": color.accent },
    backgroundColor: color.sunken,
    color: color.ink,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: 1.45,
    outline: "none",
    transitionProperty: "border-color",
    transitionDuration: motion.micro,
    "::placeholder": { color: color.faint },
  },
  area: {
    resize: "vertical",
    minHeight: "120px",
  },
});
