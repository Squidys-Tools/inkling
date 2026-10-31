import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space } from "@inkling/ui/tokens.stylex";
import { useInlineEdit } from "./useInlineEdit.ts";

// A filename's date and time (2026-10-31 10-31-41) wraps as a whole, never at a hyphen.
function keepNumbersTogether(title: string) {
  const parts = title
    .split(/(\d+(?:-\d+)+)/u)
    .map((text, at) => ({ text, id: `${at}:${text}`, number: at % 2 === 1 }));
  return parts.map(({ text, id, number }) =>
    number ? (
      <span key={id} {...stylex.props(styles.nowrap)}>
        {text}
      </span>
    ) : (
      text
    ),
  );
}

/** The item's title, which the user can rename. An empty title is not saved. */
export function TitleField({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => void;
}) {
  const edit = useInlineEdit((value) => {
    const next = value.trim();
    if (next && next !== title) onRename(next);
  });

  if (edit.draft === null)
    return (
      <h2 {...stylex.props(styles.title)}>
        <button
          type="button"
          title="Rename"
          onClick={() => edit.start(title)}
          {...stylex.props(styles.reset, styles.button)}
        >
          {keepNumbersTogether(title)}
        </button>
      </h2>
    );
  return (
    <input
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the title the user just clicked.
      autoFocus
      aria-label="Title"
      maxLength={500}
      onFocus={(event) => event.currentTarget.select()}
      {...edit.inputProps}
      {...stylex.props(styles.title, styles.input)}
    />
  );
}

const styles = stylex.create({
  title: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "26px",
    lineHeight: "30px",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: color.ink,
    overflowWrap: "anywhere",
  },
  nowrap: { whiteSpace: "nowrap" },
  reset: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",
    color: "inherit",
    textAlign: "left",
  },
  button: {
    cursor: "text",
    borderRadius: radius.control,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  input: {
    width: "100%",
    marginInline: `calc(-1 * ${space.s1})`,
    paddingInline: space.s1,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.accent,
    borderRadius: radius.control,
    backgroundColor: color.sunken,
    outline: "none",
  },
});
