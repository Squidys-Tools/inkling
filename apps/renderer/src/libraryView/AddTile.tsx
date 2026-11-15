import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { captureFiles, captureText } from "../capture/capture.ts";

// The grid unmounts cells scrolled out of view, so the words wait here instead of in the cell.
let draft = "";

/** The first cell of Everything: type a note or paste a link, and Enter saves it. */
export function AddTile() {
  const [text, setText] = useState(draft);
  const write = (value: string) => {
    draft = value;
    setText(value);
  };
  const save = async () => {
    const value = text;
    if (!value.trim()) return;
    write("");
    // A failed save gives the words back, ahead of anything typed while it ran.
    if (!(await captureText(value, "add tile"))) write(draft ? `${value}\n${draft}` : value);
  };
  return (
    <div {...stylex.props(styles.cell)}>
      <label {...stylex.props(styles.tile)}>
        <textarea
          value={text}
          aria-label="Add a note or a link"
          placeholder="Type a note, or paste a link…"
          spellCheck
          onChange={(event) => write(event.currentTarget.value)}
          onPaste={(event) => {
            // The window's paste capture skips text fields, so a pasted picture is saved here.
            // Office puts a picture beside copied text, so rich text wins; a file copied in
            // Finder or a Linux file manager also carries its name as plain text, so that alone doesn't.
            const data = event.clipboardData;
            const files = [...data.files];
            if (
              files.length === 0 ||
              (data.getData("text/plain").trim() && data.types.includes("text/html"))
            )
              return;
            event.preventDefault();
            captureFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.blur();
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void save();
          }}
          {...stylex.props(styles.field)}
        />
        <span aria-hidden="true" {...stylex.props(styles.hint)}>
          {text.trim() ? "Enter to save · Shift+Enter for a new line" : "Or drop files anywhere"}
        </span>
      </label>
    </div>
  );
}

const styles = stylex.create({
  // The same gap below as a card's cell.
  cell: { paddingBottom: "12px" },
  tile: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    height: "190px",
    padding: "16px",
    borderWidth: 1,
    borderStyle: { default: "dashed", ":focus-within": "solid" },
    borderColor: color.borderStrong,
    borderRadius: radius.card,
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayHover,
      ":focus-within": color.surface,
    },
    cursor: "text",
    transitionProperty: "background-color",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
  },
  field: {
    flexGrow: 1,
    minHeight: 0,
    margin: 0,
    padding: 0,
    resize: "none",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.ink,
    fontFamily: font.display,
    fontSize: "15px",
    lineHeight: 1.4,
    fontWeight: 500,
    letterSpacing: "-0.01em",
    outline: "none",
    "::placeholder": { color: color.muted },
  },
  hint: {
    marginTop: "10px",
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    color: color.faint,
  },
});
