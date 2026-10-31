import * as stylex from "@stylexjs/stylex";
import { Button, Kbd } from "@inkling/ui";
import { color, font, space, text } from "@inkling/ui/tokens.stylex";
import type { FormEvent, ReactNode } from "react";

/** The page around the quote and link forms: a title, the fields, and Save or Cancel. */
export function AddFrame({
  title,
  error,
  saving,
  canSave,
  onSubmit,
  onCancel,
  children,
}: {
  title: string;
  error: string | null;
  saving: boolean;
  canSave: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div data-escape-scope {...stylex.props(styles.page)}>
      <Button aria-label="Close" style={styles.close} onClick={onCancel}>
        Close <Kbd>esc</Kbd>
      </Button>
      <form
        aria-label={title}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (canSave) onSubmit();
        }}
        {...stylex.props(styles.form)}
      >
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        {children}
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            Couldn’t save this yet: {error}
          </p>
        )}
        <div {...stylex.props(styles.actions)}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save to library"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const styles = stylex.create({
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    overflowY: "auto",
    backgroundColor: color.frame,
  },
  close: {
    position: "absolute",
    top: space.s4,
    right: space.s6,
    height: "28px",
    fontSize: text.xs,
    color: { default: color.muted, ":hover": color.ink },
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.s4,
    width: "min(100% - 48px, 560px)",
    marginInline: "auto",
    paddingTop: "clamp(64px, 14vh, 140px)",
    paddingBottom: space.s12,
  },
  title: {
    margin: 0,
    fontFamily: font.display,
    fontSize: text.xxl,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: color.inkStrong,
  },
  error: { margin: 0, fontSize: text.sm, lineHeight: 1.45, color: color.danger },
  actions: { display: "flex", justifyContent: "flex-end", gap: space.s2 },
});
