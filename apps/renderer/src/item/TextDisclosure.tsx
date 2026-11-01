import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";
import { color, motion, radius, space, text } from "@inkling/ui/tokens.stylex";

/**
 * The item's extracted text, folded under a "Text" heading. Opening eases out and
 * closing eases in; a CSS transition reverses from wherever it is, so a quick
 * second click turns it back smoothly. Reduced motion makes it instant.
 */
export function TextDisclosure({ text: body }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section {...stylex.props(styles.section)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        {...stylex.props(styles.toggle)}
      >
        <span {...stylex.props(styles.caret, open ? styles.caretOpen : styles.caretClosed)}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
        </span>
        Text
      </button>
      <div
        id={id}
        inert={!open}
        {...stylex.props(styles.fold, open ? styles.foldOpen : styles.foldClosed)}
      >
        <div {...stylex.props(styles.clip)}>
          <p {...stylex.props(styles.body)}>{body}</p>
        </div>
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column" },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    alignSelf: "flex-start",
    marginBottom: "9px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: color.muted,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  caret: { display: "flex" },
  caretClosed: {
    transform: "rotate(0deg)",
    transition: `transform ${motion.reveal} ${motion.exit}`,
  },
  caretOpen: {
    transform: "rotate(90deg)",
    transition: `transform ${motion.reveal} ${motion.enter}`,
  },
  // Rows from 0fr to 1fr animate to the text's real height without measuring it.
  fold: { display: "grid" },
  foldClosed: {
    gridTemplateRows: "0fr",
    opacity: 0,
    transition: `grid-template-rows ${motion.reveal} ${motion.exit}, opacity ${motion.reveal} ${motion.exit}`,
  },
  foldOpen: {
    gridTemplateRows: "1fr",
    opacity: 1,
    transition: `grid-template-rows ${motion.reveal} ${motion.enter}, opacity ${motion.reveal} ${motion.enter}`,
  },
  clip: { minHeight: 0, overflow: "hidden" },
  body: {
    margin: 0,
    minHeight: "72px",
    maxHeight: "240px",
    overflowY: "auto",
    paddingBlock: "11px",
    paddingInline: space.s3,
    borderRadius: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
    fontSize: text.md,
    lineHeight: "20px",
    color: color.inkSoft,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    userSelect: "text",
  },
});
