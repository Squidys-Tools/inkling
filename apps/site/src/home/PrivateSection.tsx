import * as stylex from "@stylexjs/stylex";
import { color, font } from "@inkling/ui/tokens.stylex";
import { Link } from "@tanstack/react-router";
import { page } from "../layout/page.ts";
import { action, type } from "../parts/type.ts";

// The real names: apps/desktop/src/data-directory.ts and packages/library/src/process.ts.
const tree = `com.inkling.library/
  library.sqlite3
  assets/
    items/
      <one folder per item>/`;

export function PrivateSection() {
  return (
    <section {...stylex.props(page.column, styles.section)}>
      <pre aria-label="What your library looks like on disk" {...stylex.props(styles.tree)}>
        {tree}
      </pre>
      <div {...stylex.props(styles.copy)}>
        <h2 {...stylex.props(type.heading)}>Your library is a folder on your computer.</h2>
        <p {...stylex.props(type.body)}>
          One SQLite file and the files you saved, next to each other. There is no account and no
          cloud copy. OCR, embeddings and search all run on your machine, and the models come with
          the app.
        </p>
        <p {...stylex.props(type.body)}>
          <Link to="/privacy" {...stylex.props(action.inline)}>
            Every time inkling uses the network
          </Link>
        </p>
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: {
    display: "grid",
    gridTemplateColumns: { default: "5fr 7fr", "@media (max-width: 860px)": "1fr" },
    gap: "48px",
    alignItems: "center",
  },
  copy: { display: "flex", flexDirection: "column", gap: "20px" },
  tree: {
    margin: 0,
    padding: "28px",
    borderRadius: "20px",
    backgroundColor: color.sunken,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    color: color.inkSoft,
    fontFamily: font.mono,
    fontSize: "15px",
    lineHeight: 1.8,
    overflowX: "auto",
  },
});
